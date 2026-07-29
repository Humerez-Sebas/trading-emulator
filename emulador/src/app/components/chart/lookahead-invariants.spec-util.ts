import { expect } from 'vitest';
import { Candle } from '../../models';

/**
 * RFC-019 (D19.I, N19-4) — no candle whose CLOSE exceeds the REVEALED INSTANT
 * (`cursor + replayGrainSeconds`) may reach the render model, on any panel, at any
 * timeframe.
 *
 * **Why the revealed instant, not the raw cursor** (corrected post-implementation — Task 5
 * audit finding M1, `.superpowers/rfc-019/dev-log.md` §8.3). The replay cursor names the
 * OPEN of the last revealed candle on the replay grain, never a close: `advanceCandle`
 * does `goToTime({ time: candles[next].time })` (`replay.effects.ts:49`), and likewise
 * `jumpBack$` (`:147`), `jumpForward$`/`foldForwardFills` (`:131`/`:193`) and `stepBack$`
 * (`:73`); `ReplayState.currentTime`'s own doc comment (`replay.reducer.ts:9`) says
 * "Timestamp of the last visible candle." `renderWindow` (`chart.component.ts:838`) slices
 * `[winStart, idx]` INCLUSIVE of `idx`, so the candle opening at the cursor is fully
 * revealed and fully painted the instant the cursor reaches its open — comparing
 * `close <= cursor` is therefore falsifiable BY CONSTRUCTION on a native-TF panel
 * (`close = cursor + activeSeconds`, always `> cursor` for `activeSeconds > 0`) and on a
 * panel finer than the replay grain, not just on the pre-RFC defect it was meant to catch.
 *
 * The honest bound is the revealed instant `R = cursor + replayGrainSeconds` — "the instant
 * through which price action has actually been revealed." Total by algebra, given
 * `lastIndexAtOrBefore` guarantees `candles[idx].time <= cursor`:
 *   - native TF (`activeSeconds === replayGrainSeconds`): `close <= cursor + activeSeconds
 *     = R` (equality at worst);
 *   - finer than the replay grain (`activeSeconds < replayGrainSeconds`): `close < R`
 *     strictly;
 *   - sub-TF with the `idx-1` decrement (D-B1): `candles[idx-1].time + activeSeconds <=
 *     candles[idx].time <= cursor <= R`.
 *
 * A candle opening at `t` on an `activeSeconds` timeframe closes at `t + activeSeconds`.
 * The forming candle is exempt from the close test by construction — it IS the partial
 * bar — but its OPEN must not be in the future. That clause stays keyed on the RAW cursor
 * (`forming.time <= cursor`), never `R`: a partial bar opening after the cursor is
 * genuinely nonsense regardless of the replay grain.
 *
 * **Known, deliberate exclusion** (not fixed here, not this RFC's business): the identical
 * off-by-one exists INSIDE the forming candle itself — it aggregates the grain candle that
 * opens at `cursor`, whose own close is `cursor + replayGrainSeconds`. That is pre-existing
 * replay semantics (the "reveal a whole candle the instant its open time is reached" model
 * every candle in this codebase already follows), not something RFC-019 introduces or is
 * scoped to correct.
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
  replayGrainSeconds: number,
): string | null {
  const revealed = cursor + replayGrainSeconds;
  for (let i = 0; i <= idx; i++) {
    const c = candles[i];
    const close = c.time + activeSeconds;
    if (close > revealed) {
      return (
        `lookahead: candles[${i}] opens at ${c.time} and closes at ${close}, which is ` +
        `AFTER the revealed instant (${revealed} = cursor ${cursor} + replay grain ` +
        `${replayGrainSeconds}); activeSeconds=${activeSeconds}`
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
  replayGrainSeconds: number,
): void {
  expect(
    lookaheadViolation(candles, idx, forming, cursor, activeSeconds, replayGrainSeconds),
  ).toBeNull();
}
