import { describe, expect, it } from 'vitest';
import { Candle } from '../../models';
import { computeSessionStats, processCandle, TradingBook } from './fill-engine';
import { ClosedTrade, Position } from './trading.models';

/**
 * RFC-014 DoD #3 — ambiguousCount KPI (Task 7).
 *
 * A deterministic reference scenario, folded twice through the REAL engine
 * (`processCandle`/`computeSessionStats`, unmodified — no test doubles), to
 * measure the fidelity KPI RFC-014 §2 predicts: "la semántica de ambigüedad
 * (I-9) no cambia... ahora confinada al átomo de resolución base, por lo que
 * se espera que ambiguousCount caiga".
 *
 * Three independent single-position scenarios share the same SL/TP band
 * (entry 4000, sl 3985, tp 4020) and the same underlying M1 price action —
 * only WHEN within the hour the SL/TP-triggering candle(s) land differs:
 *
 *   A — TP-first:  M1 touches TP at minute 5,  SL at minute 50 (never reached
 *                  once TP closes the trade).
 *   B — SL-first:  M1 touches SL at minute 5,  TP at minute 50 (never reached).
 *   C — Same-minute collision: ONE M1 candle touches both SL and TP at once —
 *       genuinely irreducible ambiguity even at the base atom (I-9 still
 *       applies; RFC-014 narrows the atom, it does not eliminate ambiguity).
 *
 * Each scenario is folded two ways over the SAME price action:
 *
 *   (legacy) ONE H1 parent candle whose OHLC is the hour's aggregate,
 *            `subCandles: null` — the worst-case pre-RFC-014 shape: no lower
 *            series loaded in the workspace at all, so `resolveExit` only
 *            ever sees the H1 envelope and cannot recover which side touched
 *            first. This is the `selectFillContext` fallback path DOMAIN_MODEL
 *            I-7 used to caveat before RFC-014 (base-grain walk dissolved it).
 *   (base)   60 individual M1 base candles, one `processCandle` per candle in
 *            chronological order (`subCandles: null` each — RFC-014 D14.A:
 *            base grain never threads a sub-candle array, the candle IS the
 *            atom), mirroring `foldForwardFills`/`processFills$`.
 *
 * Expected (and asserted): legacy flags A, B, AND C ambiguous (3) because the
 * H1 envelope alone cannot tell TP-first from SL-first from simultaneous.
 * Base grain resolves A and B cleanly (the M1 sequence reveals genuine touch
 * order) and leaves only C ambiguous (1) — a real, non-zero floor, matching
 * I-9's disclosure: ambiguity does not vanish, it is confined to the base
 * candle.
 */

const CONTRACT = 100;
const ENTRY = 4000;
const SL = 3985;
const TP = 4020;
const FLAT: Candle = { time: 0, open: ENTRY, high: ENTRY, low: ENTRY, close: ENTRY };

function candle(time: number, partial: Partial<Candle> = {}): Candle {
  return { ...FLAT, ...partial, time };
}

function openPosition(id: string): Position {
  return {
    id,
    side: 'buy',
    entryPrice: ENTRY,
    sl: SL,
    tp: TP,
    lots: 0.1,
    riskPct: 1,
    riskUsd: Math.abs(ENTRY - SL) * 0.1 * CONTRACT,
    openTime: 0,
    origin: 'market',
  };
}

function book(position: Position): TradingBook {
  return { balance: 10000, orders: [], positions: [position], history: [] };
}

/** One `processCandle` per candle, in order — the real engine, nothing mocked. */
function fold(initial: TradingBook, candles: Candle[]): TradingBook {
  let b = initial;
  for (const c of candles) {
    b = processCandle(b, c, null, CONTRACT).book;
  }
  return b;
}

/** 60 M1 candles covering [hourStart, hourStart + 3600), flat except `overrides` by minute index (0-59). */
function m1Hour(hourStart: number, overrides: Record<number, Partial<Candle>>): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < 60; i++) {
    out.push(candle(hourStart + i * 60, overrides[i]));
  }
  return out;
}

interface Scenario {
  name: string;
  /** Per-minute overrides (0-59) driving the M1 base walk. */
  minuteOverrides: Record<number, Partial<Candle>>;
  /** The H1 parent candle's aggregate OHLC (worst-case legacy: subCandles null). */
  h1Aggregate: Partial<Candle>;
}

const HOUR_START = 3600;

const SCENARIOS: Scenario[] = [
  {
    // A — TP-first: closes clean at minute 5; the minute-50 SL touch is never
    // reached because the position already closed.
    name: 'TP-first (resolvable at M1)',
    minuteOverrides: { 5: { high: 4025 }, 50: { low: 3980 } },
    h1Aggregate: { high: 4025, low: 3980 },
  },
  {
    // B — SL-first: closes clean at minute 5; the minute-50 TP touch is never
    // reached.
    name: 'SL-first (resolvable at M1)',
    minuteOverrides: { 5: { low: 3980 }, 50: { high: 4025 } },
    h1Aggregate: { high: 4025, low: 3980 },
  },
  {
    // C — genuine same-minute collision: irreducible even at the base atom.
    name: 'same-minute collision (irreducible at M1)',
    minuteOverrides: { 20: { high: 4025, low: 3980 } },
    h1Aggregate: { high: 4025, low: 3980 },
  },
];

describe('RFC-014 DoD #3 — ambiguousCount KPI (legacy H1-envelope vs. base-grain M1 walk)', () => {
  it('base-grain resolves A and B cleanly, leaves only the genuine collision (C) ambiguous', () => {
    const legacyTrades: ClosedTrade[] = [];
    const baseTrades: ClosedTrade[] = [];

    for (const scenario of SCENARIOS) {
      // Legacy: ONE H1 candle, subCandles: null (no lower series loaded —
      // the pre-RFC-014 worst case DOMAIN_MODEL I-7 used to caveat).
      const legacyResult = fold(book(openPosition(scenario.name)), [
        candle(HOUR_START, scenario.h1Aggregate),
      ]);
      expect(legacyResult.history).toHaveLength(1);
      legacyTrades.push(legacyResult.history[0]);

      // Base grain: 60 individual M1 candles, one `processCandle` per candle
      // (RFC-014 D14.A — mirrors `foldForwardFills`/`processFills$`).
      const baseResult = fold(
        book(openPosition(scenario.name)),
        m1Hour(HOUR_START, scenario.minuteOverrides),
      );
      expect(baseResult.history).toHaveLength(1);
      baseTrades.push(baseResult.history[0]);
    }

    // Measured through the REAL session-stats function, not a hand count.
    const legacyStats = computeSessionStats(legacyTrades, 10000);
    const baseStats = computeSessionStats(baseTrades, 10000);

    // ---- RFC-014 closure KPI (walkthrough evidence) ----
    // ambiguousCount: legacy (H1 envelope, subCandles: null) = 3
    //                 base grain (M1 walk, RFC-014 D14.A)    = 1
    // Confirms RFC-014 §2's predicted fidelity gain: ambiguity resolution is
    // now confined to the base candle atom instead of whatever timeframe
    // happened to be loaded/displayed; it does not vanish (C is genuinely
    // simultaneous even at M1), it shrinks to the irreducible floor.
    expect(legacyStats.ambiguousCount).toBe(3);
    expect(baseStats.ambiguousCount).toBe(1);
    expect(baseStats.ambiguousCount).toBeLessThan(legacyStats.ambiguousCount);

    // Per-scenario sanity: A and B actually flipped outcome-cleanliness;
    // C stayed ambiguous under both foldings (irreducible, not a regression).
    expect(legacyTrades[0].ambiguous).toBe(true); // A under legacy: ambiguous
    expect(baseTrades[0].ambiguous).toBe(false); // A under base grain: clean TP
    expect(baseTrades[0].outcome).toBe('tp');
    expect(legacyTrades[1].ambiguous).toBe(true); // B under legacy: ambiguous
    expect(baseTrades[1].ambiguous).toBe(false); // B under base grain: clean SL
    expect(baseTrades[1].outcome).toBe('sl');
    expect(legacyTrades[2].ambiguous).toBe(true); // C under legacy: ambiguous
    expect(baseTrades[2].ambiguous).toBe(true); // C under base grain: still ambiguous (irreducible)
  });
});
