import { Candle, Timeframe } from '../../models';

/** A common date range across one or more timeframes, in unix seconds. */
export interface CoverageRange {
  from: number;
  to: number;
}

/**
 * Intersection of the SELECTED timeframes' loaded series, in unix seconds.
 * Mirrors the existing backend `dateRange` computed (max desde, min hasta):
 * `from` is the latest "first candle" among the selected series, `to` is the
 * earliest "last candle". Candles are assumed sorted ascending by `time`.
 *
 * Returns `null` when nothing is selected, or a selected TF has no loaded
 * (or empty) series — the caller can't validate a date without it.
 */
export function coverageRange(
  seriesByTf: Partial<Record<Timeframe, Candle[]>>,
  selectedTfs: Timeframe[],
): CoverageRange | null {
  if (!selectedTfs.length) return null;
  const ranges: CoverageRange[] = [];
  for (const tf of selectedTfs) {
    const candles = seriesByTf[tf];
    if (!candles || !candles.length) return null;
    ranges.push({ from: candles[0].time, to: candles[candles.length - 1].time });
  }
  return {
    from: Math.max(...ranges.map((r) => r.from)),
    to: Math.min(...ranges.map((r) => r.to)),
  };
}

/** Start date validation: inside the (inclusive) coverage range. */
export function isStartValid(range: CoverageRange | null, startSec: number): boolean {
  if (!range) return false;
  return startSec >= range.from && startSec <= range.to;
}

/**
 * End date validation: absent (`null`) end is always valid (no scheduled
 * end); otherwise it must be strictly after `start` and within the range.
 */
export function isEndValid(
  range: CoverageRange | null,
  startSec: number,
  endSec: number | null,
): boolean {
  if (endSec === null) return true;
  if (!range) return false;
  return endSec > startSec && endSec <= range.to;
}
