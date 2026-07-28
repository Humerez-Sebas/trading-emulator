import { expect } from 'vitest';
import { Candle } from '../../models';

/**
 * RFC-019 (D19.I, N19-4) — no candle whose CLOSE exceeds the replay cursor may reach the
 * render model, on any panel, at any timeframe. A candle opening at `t` on an
 * `activeSeconds` timeframe closes at `t + activeSeconds`; it is honest only once the
 * cursor has reached that close. The forming candle is exempt from the close test by
 * construction — it IS the partial bar — but its OPEN must not be in the future
 * (`forming.time <= cursor`).
 *
 * Checks every candle in `candles[0..idx]` — the exact inclusive range `renderWindow`
 * (`chart.component.ts:838`) paints — plus the standalone `forming` candle when present.
 * `idx === -1` (nothing painted yet) is a clean empty-range pass, never a throw.
 *
 * Test-only, mirroring `assertNoCandles` (kernel invariant 7): this predicate and the
 * vitest wrapper below must never be imported from app code. Precedent for the
 * vitest-free-predicate + thin-wrapper split:
 * `state/layout/layout-invariants.ts` / `state/layout/layout-invariants.spec-util.ts`.
 * Task 5 needs no production twin of its own — nothing in app code should ever call this,
 * so both pieces live together in this one spec-util file.
 */
export function lookaheadViolation(
  candles: readonly Candle[],
  idx: number,
  forming: Candle | null,
  cursor: number,
  activeSeconds: number,
): string | null {
  for (let i = 0; i <= idx; i++) {
    const c = candles[i];
    const close = c.time + activeSeconds;
    if (close > cursor) {
      return (
        `lookahead: candles[${i}] opens at ${c.time} and closes at ${close}, which is ` +
        `AFTER the replay cursor (${cursor}); activeSeconds=${activeSeconds}`
      );
    }
  }
  if (forming != null && forming.time > cursor) {
    return (
      `lookahead: the forming candle opens at ${forming.time}, which is AFTER the ` +
      `replay cursor (${cursor})`
    );
  }
  return null;
}

/**
 * Test-only wrapper: delegates to the vitest-free {@link lookaheadViolation} and turns it
 * into a vitest assertion so specs keep the granular failure message on mismatch — same
 * discipline as `assertLayoutConsistent` over `layoutInvariantViolation`.
 */
export function assertNoLookahead(
  candles: readonly Candle[],
  idx: number,
  forming: Candle | null,
  cursor: number,
  activeSeconds: number,
): void {
  expect(lookaheadViolation(candles, idx, forming, cursor, activeSeconds)).toBeNull();
}
