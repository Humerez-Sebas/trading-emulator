import { Candle, Timeframe, TIMEFRAME_ORDER, TIMEFRAME_SECONDS } from '../../models';
import { aggregateCandles } from '../../services/timeframe-generator';

/**
 * Pure helpers for custom (arbitrary-minute) timeframes — e.g. M45, M90 (Task
 * 11). Angular-free so they unit-test under plain vitest. The chart renders a
 * custom timeframe by aggregating the loaded anchor series in memory; only
 * M1/H1/D1 (and whatever else is loaded) are ever stored.
 */

/** Largest custom timeframe we allow (30 days, in minutes). */
export const MAX_CUSTOM_TF_MINUTES = 43_200;

/**
 * Parses a custom-timeframe input into whole minutes, or `null` when invalid
 * (non-integer, <= 0, or above {@link MAX_CUSTOM_TF_MINUTES}).
 */
export function parseCustomTimeframe(raw: string | number, max = MAX_CUSTOM_TF_MINUTES): number | null {
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isInteger(n) || n <= 0 || n > max) return null;
  return n;
}

/**
 * The coarsest LOADED timeframe whose candle size (in minutes) divides
 * `minutes` evenly — the cheapest valid base to aggregate from. Returns `null`
 * when no loaded series can produce the request (e.g. M90 from H1-only data).
 */
export function pickBaseSeriesTf(
  series: Partial<Record<Timeframe, Candle[]>>,
  minutes: number,
): Timeframe | null {
  let best: Timeframe | null = null;
  let bestMin = 0;
  for (const tf of TIMEFRAME_ORDER) {
    if (!series[tf]?.length) continue;
    const tfMin = TIMEFRAME_SECONDS[tf] / 60;
    if (tfMin <= minutes && minutes % tfMin === 0 && tfMin > bestMin) {
      best = tf;
      bestMin = tfMin;
    }
  }
  return best;
}

/**
 * Generates the candles for a custom `minutes` timeframe from the loaded series,
 * aggregating the coarsest dividing base. Returns the base series untouched when
 * it already matches the request, or `[]` when no base can produce it.
 */
export function generateCustomSeries(
  series: Partial<Record<Timeframe, Candle[]>>,
  minutes: number,
): Candle[] {
  const base = pickBaseSeriesTf(series, minutes);
  if (!base) return [];
  const baseCandles = series[base]!;
  const baseMin = TIMEFRAME_SECONDS[base] / 60;
  return baseMin === minutes ? baseCandles : aggregateCandles(baseCandles, minutes);
}
