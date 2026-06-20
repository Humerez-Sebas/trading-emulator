import { Candle, Timeframe, TIMEFRAME_ORDER, TIMEFRAME_SECONDS } from '../../models';
import { aggregateCandles } from '../../services/timeframe-generator';
import type { AnchorTf } from '../../services/session.service';
import type { ManifestTf } from '../../services/market-data/manifest.service';

/** One unit of onboarding work, as consumed by `DataOnboardingService.runJobs`. */
export interface AnchorDownloadJob {
  symbol: string;
  tf: ManifestTf;
  year: string;
}

/**
 * Pure helpers for custom (arbitrary-minute) timeframes — e.g. M45, M90 (Task
 * 11). Angular-free so they unit-test under plain vitest. The chart renders a
 * custom timeframe by aggregating the loaded anchor series in memory; only
 * M1/H1/D1 (and whatever else is loaded) are ever stored.
 */

/** Largest interval we allow (30 days, in minutes). */
export const MAX_INTERVAL_MINUTES = 43_200;

/** Largest custom timeframe we allow (30 days, in minutes). @deprecated Use {@link MAX_INTERVAL_MINUTES} instead. */
export const MAX_CUSTOM_TF_MINUTES = MAX_INTERVAL_MINUTES;

/**
 * Parses an interval string or number into whole minutes, supporting suffixes:
 * - bare number or bare string: interpreted as minutes
 * - 'H'/'h': hours (multiplied by 60)
 * - 'D'/'d': days (multiplied by 1440)
 *
 * Returns `null` when invalid (non-integer, <= 0, or above max).
 */
export function parseInterval(raw: string | number, max = MAX_INTERVAL_MINUTES): number | null {
  const s = String(raw).trim();
  const m = /^(\d+)\s*([hHdD]?)$/.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  const mult = m[2] === '' ? 1 : m[2].toLowerCase() === 'h' ? 60 : 1440;
  const minutes = n * mult;
  if (!Number.isInteger(minutes) || minutes <= 0 || minutes > max) return null;
  return minutes;
}

/**
 * Parses a custom-timeframe input into whole minutes, or `null` when invalid
 * (non-integer, <= 0, or above {@link MAX_CUSTOM_TF_MINUTES}).
 * @deprecated Use {@link parseInterval} instead.
 */
export const parseCustomTimeframe = parseInterval;

/**
 * Formats an interval (in minutes) into verbose Spanish: "21 minutos", "2 horas", "1 día", etc.
 * Prefers the coarsest unit: 1440+ minutes → días, 60+ minutes → horas, else → minutos.
 */
export function formatIntervalVerbose(min: number): string {
  if (min % 1440 === 0) {
    const d = min / 1440;
    return `${d} ${d === 1 ? 'día' : 'días'}`;
  }
  if (min % 60 === 0) {
    const h = min / 60;
    return `${h} ${h === 1 ? 'hora' : 'horas'}`;
  }
  return `${min} ${min === 1 ? 'minuto' : 'minutos'}`;
}

/**
 * Formats an interval (in minutes) into compact canonical form: "M45", "H2", "D1".
 * Prefers the coarsest unit, using MT5-style prefix.
 */
export function formatIntervalShort(min: number): string {
  if (min % 1440 === 0) return `D${min / 1440}`;
  if (min % 60 === 0) return `H${min / 60}`;
  return `M${min}`;
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

/**
 * Maps a minute count to the loaded timeframe whose seconds equal `minutes*60`,
 * iterating the canonical order. Returns `null` when none match.
 */
export function loadedTfForMinutes(minutes: number, loadedTfs: Timeframe[]): Timeframe | null {
  const target = minutes * 60;
  const set = new Set(loadedTfs);
  for (const tf of TIMEFRAME_ORDER) {
    if (set.has(tf) && TIMEFRAME_SECONDS[tf] === target) return tf;
  }
  return null;
}

/**
 * Builds the onboarding jobs needed to fetch a missing anchor for `symbol`:
 * M1 needs one job per calendar-year partition (`m1Years`, from
 * `ManifestService.listM1Years`); H1/D1 are a single `'all'` partition. Used
 * by the Interval Dialog's "Descargar {anchor}" action.
 */
export function buildAnchorDownloadJobs(
  anchor: AnchorTf,
  symbol: string,
  m1Years: string[],
): AnchorDownloadJob[] {
  const tf = anchor.toLowerCase() as ManifestTf;
  if (anchor === 'M1') {
    return m1Years.map((year) => ({ symbol, tf, year }));
  }
  return [{ symbol, tf, year: 'all' }];
}
