import { ClosedTrade } from '../../state/trading/trading.models';

/**
 * Derives a trade's excursion in R units from its physical MAE/MFE distance
 * (price units, RFC-014 §3) and the trade's risk distance `|entryPrice -
 * sl|`. Pure, DISPLAY-TIME-ONLY derivation (G4: physical numbers without
 * interpretation) — MAE_R/MFE_R are never stored, only computed when
 * rendered.
 *
 * Returns `null` (renders as "—") when:
 * - the trade predates `mae`/`mfe` (optional/additive field, legacy-absent
 *   persisted history), or
 * - the risk distance is zero (a degenerate SL == entry trade — dividing by
 *   zero would produce Infinity/NaN, not a physical number).
 *
 * `0` is a legitimate excursion (a trade that never moved favorably/
 * adversely) and is NOT treated as absent.
 */
export function excursionR(
  excursion: number | undefined,
  entryPrice: number,
  sl: number,
): number | null {
  if (excursion === undefined) return null;
  const riskDistance = Math.abs(entryPrice - sl);
  if (riskDistance === 0) return null;
  return excursion / riskDistance;
}

/** Formats an excursion-R value for display: 2 decimals, "—" when absent (G4, no fake precision). */
export function formatExcursionR(value: number | null): string {
  return value === null ? '—' : value.toFixed(2);
}

/** Mean/max of MAE_R and MFE_R over the trades that have them. */
export interface ExcursionAggregates {
  meanMaeR: number | null;
  maxMaeR: number | null;
  meanMfeR: number | null;
  maxMfeR: number | null;
}

/**
 * Session-level physical excursion aggregates (RFC-014 G4). Kept as a NEW
 * pure helper, separate from `computeSessionStats` in `fill-engine.ts`
 * (STOP-protected: its pre-existing spec pins today's return shape) — this
 * walks the same closed-trade history independently. Mean/max ignore any
 * trade whose {@link excursionR} is `null` (legacy-absent mae/mfe or zero
 * risk distance); when no trade contributes, both mean and max are `null`
 * (renders as "—" via {@link formatExcursionR}).
 */
export function computeExcursionAggregates(trades: readonly ClosedTrade[]): ExcursionAggregates {
  const maeValues: number[] = [];
  const mfeValues: number[] = [];
  for (const t of trades) {
    const mae = excursionR(t.mae, t.entryPrice, t.sl);
    if (mae !== null) maeValues.push(mae);
    const mfe = excursionR(t.mfe, t.entryPrice, t.sl);
    if (mfe !== null) mfeValues.push(mfe);
  }
  return {
    meanMaeR: mean(maeValues),
    maxMaeR: maxOf(maeValues),
    meanMfeR: mean(mfeValues),
    maxMfeR: maxOf(mfeValues),
  };
}

function mean(values: readonly number[]): number | null {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
}

function maxOf(values: readonly number[]): number | null {
  return values.length ? Math.max(...values) : null;
}
