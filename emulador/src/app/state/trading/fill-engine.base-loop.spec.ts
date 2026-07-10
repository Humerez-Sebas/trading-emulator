import { describe, expect, it } from 'vitest';
import { Candle } from '../../models';
import { processCandle, TradingBook } from './fill-engine';
import { PendingOrder, Position } from './trading.models';

// ---- RFC-014 Task 1: base-resolution execution loop + same-candle fills ----
// The engine (`fill-engine.ts`) is UNCHANGED (I-10/D14.A) — what changes is how
// callers drive it: one `processCandle` call per BASE candle (subCandles: null
// always at base grain) instead of one call per display/resolution candle. This
// file characterizes that base-grain loop directly against the pure engine.

const CONTRACT = 100;

function candle(time: number, open: number, high: number, low: number, close: number): Candle {
  return { time, open, high, low, close };
}

function buyLimit(entry: number, sl: number, tp: number | null, createdAt = 0): PendingOrder {
  return {
    id: 'o1',
    side: 'buy',
    type: 'limit',
    entryPrice: entry,
    sl,
    tp,
    lots: 0.1,
    riskPct: 1,
    riskUsd: Math.abs(entry - sl) * 0.1 * CONTRACT,
    createdAt,
  };
}

function openBuy(entry: number, sl: number, tp: number | null, openTime = 0): Position {
  return {
    id: 'p1',
    side: 'buy',
    entryPrice: entry,
    sl,
    tp,
    lots: 0.1,
    riskPct: 1,
    riskUsd: Math.abs(entry - sl) * 0.1 * CONTRACT,
    openTime,
    origin: 'market',
  };
}

function book(partial: Partial<TradingBook>): TradingBook {
  return { balance: 10000, orders: [], positions: [], history: [], ...partial };
}

/**
 * Base-resolution execution loop: exactly one `processCandle` per base candle,
 * chronological, `subCandles: null` (mirrors processFills$/foldForwardFills
 * when `ctx.base` is present — D14.A).
 */
function foldBase(initial: TradingBook, baseCandles: Candle[], contractSize = CONTRACT): TradingBook {
  let b = initial;
  for (const c of baseCandles) {
    b = processCandle(b, c, null, contractSize).book;
  }
  return b;
}

// An H1 window [3600, 7200) made of 60 M1 base candles, flat by default so
// only the candles a test overrides can trigger a fill/exit.
function m1Window(overrides: Record<number, Partial<Candle>> = {}): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < 60; i++) {
    const t = 3600 + i * 60;
    const base = { time: t, open: 4000, high: 4000, low: 4000, close: 4000 };
    out.push({ ...base, ...overrides[t] });
  }
  return out;
}

describe('base-resolution execution loop — same-candle fill without hindsight', () => {
  it('an order placed mid-H1 fills on a LATER M1 of the same H1 (no hindsight)', () => {
    // placed while the cursor sat on the M1 at 3600 + 10*60 = 4200
    const createdAt = 4200;
    const order = buyLimit(3995, 3985, 4020, createdAt);
    const win = m1Window({
      [4200]: { low: 3990 }, // touches entry but createdAt === this candle's time → must NOT fill
      [4320]: { low: 3990 }, // a later M1 in the same H1 → fills here
    });
    const result = foldBase(book({ orders: [order] }), win);
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0].openTime).toBe(4320);
  });

  it('base candles at/before createdAt never fill, including the D14.B reveal-horizon case', () => {
    // Coarse resolution: the reveal horizon is the LAST base candle of the
    // already-fully-displayed bucket (D14.B), e.g. createdAt = 4260 (the M1
    // at index 11, last revealed candle of a coarser resolution bucket).
    const createdAt = 4260;
    const order = buyLimit(3995, 3985, 4020, createdAt);
    const win = m1Window({
      [3600]: { low: 3990 }, // before createdAt
      [4260]: { low: 3990 }, // == createdAt (the reveal-horizon candle itself)
      [4320]: { low: 3990 }, // > createdAt → fills
    });
    // process everything up to and including createdAt: no fill yet
    const upToHorizon = foldBase(
      book({ orders: [order] }),
      win.filter((c) => c.time <= createdAt),
    );
    expect(upToHorizon.orders).toHaveLength(1);
    expect(upToHorizon.positions).toHaveLength(0);
    // the whole window: fills exactly once, on the first candle AFTER createdAt
    const full = foldBase(book({ orders: [order] }), win);
    expect(full.positions).toHaveLength(1);
    expect(full.positions[0].openTime).toBe(4320);
  });
});

describe('base-resolution execution loop — idempotence and determinism (V-4/V-5)', () => {
  it('re-folding the same base candles over the resulting book is a no-op', () => {
    const order = buyLimit(3995, 3985, 4020, 4200);
    const win = m1Window({ [4320]: { low: 3990 } });
    const once = foldBase(book({ orders: [order] }), win);
    expect(once.positions).toHaveLength(1);
    const twice = foldBase(once, win);
    expect(twice).toEqual(once); // deep-equal: nothing changed on the re-fold
  });

  it('applying the same fold twice from the same initial book yields deep-equal results', () => {
    const initial = book({ orders: [buyLimit(3995, 3985, 4020, 4200)] });
    const win = m1Window({ [4320]: { low: 3990 }, [4500]: { high: 4020 } });
    const resultA = foldBase(initial, win);
    const resultB = foldBase(initial, win);
    expect(resultA).toEqual(resultB);
  });
});

describe('base-resolution execution loop — parity with full-candle mode', () => {
  it('when base === resolution series (one candle per advance), behavior matches today exactly', () => {
    // No sub-second granularity: base IS the resolution series (H1 stepping,
    // full-candle mode). A single processCandle call per H1 candle, same as
    // the pre-existing legacy loop.
    const order = buyLimit(3995, 3985, 4020, 0);
    const h1 = [
      candle(3600, 4000, 4000, 4000, 4000),
      candle(7200, 4000, 4000, 3990, 4000), // fills here
    ];
    const viaLoop = foldBase(book({ orders: [order] }), h1);
    const viaDirect = processCandle(
      processCandle(book({ orders: [order] }), h1[0], null, CONTRACT).book,
      h1[1],
      null,
      CONTRACT,
    ).book;
    expect(viaLoop).toEqual(viaDirect);
    expect(viaLoop.positions).toHaveLength(1);
  });
});

describe('base-resolution execution loop — SL/TP ambiguity at the base atom (I-9)', () => {
  it('SL and TP both inside the same base candle resolves pessimistic SL, ambiguous', () => {
    const win = m1Window({ [4260]: { high: 4025, low: 3980 } }); // touches SL(3985) and TP(4020)
    const result = foldBase(
      book({ positions: [openBuy(4000, 3985, 4020, 3600)] }),
      win.filter((c) => c.time <= 4260),
    );
    expect(result.history).toHaveLength(1);
    expect(result.history[0].outcome).toBe('sl');
    expect(result.history[0].ambiguous).toBe(true);
  });
});
