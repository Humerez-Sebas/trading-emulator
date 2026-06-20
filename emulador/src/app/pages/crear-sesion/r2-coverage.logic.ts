import { Timeframe } from '../../models';

/** A common date range across one or more timeframes, in unix seconds. */
export interface CoverageRange {
  from: number;
  to: number;
}

/** Intersection (max from, min to) of the selected anchors' bounds, or null. */
export function intersectBounds(
  boundsByTf: Partial<Record<Timeframe, { from: number; to: number }>>,
  selectedTfs: Timeframe[],
): { from: number; to: number } | null {
  const chosen = selectedTfs
    .map((tf) => boundsByTf[tf])
    .filter((b): b is { from: number; to: number } => !!b);
  if (!chosen.length) return null;
  return {
    from: Math.max(...chosen.map((b) => b.from)),
    to: Math.min(...chosen.map((b) => b.to)),
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
