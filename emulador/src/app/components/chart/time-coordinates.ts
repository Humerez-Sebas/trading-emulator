import type { IChartApi } from 'lightweight-charts';

/**
 * Anchor data needed to map (UTC time) <-> (x coordinate) for overlays.
 *
 * The mapping is done by BAR INDEX (logical), not by `timeToCoordinate` +
 * uniform-spacing extrapolation. `timeToCoordinate` only resolves times that
 * are EXACTLY a bar of the active TF, and a uniform extrapolation counts
 * weekend/session gaps as if they were bars — both make overlays drift across
 * timeframes. Resolving the bar that CONTAINS the time keeps a drawing pinned
 * to the same instant on every TF, gaps included.
 */
export interface TimeAnchor {
  /** Display offset in seconds (time zone). */
  shift: number;
  /** UTC times (no shift) of the currently rendered bars, ascending. */
  times: number[];
  /** Nominal seconds between bars of the active TF (out-of-range extrapolation). */
  barSpacing: number;
}

/**
 * Fractional logical index of a UTC time within the rendered bars. Inside the
 * data it returns the index of the bar that CONTAINS the time (last bar whose
 * time <= t) — stable across timeframes and immune to gaps. Outside the data
 * it extrapolates by the nominal bar spacing so overlays can project into the
 * past/future space. Returns null only when there are no rendered bars.
 */
export function timeToLogical(times: number[], t: number, barSpacing: number): number | null {
  const n = times.length;
  if (n === 0) return null;
  if (t <= times[0]) {
    return barSpacing > 0 ? (t - times[0]) / barSpacing : 0;
  }
  if (t >= times[n - 1]) {
    return barSpacing > 0 ? n - 1 + (t - times[n - 1]) / barSpacing : n - 1;
  }
  // binary search: last index with times[i] <= t (the containing bar)
  let lo = 0,
    hi = n - 1,
    ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/**
 * X coordinate for a UTC time, via the bar that contains it (extrapolated
 * beyond the rendered range).
 *
 * `logicalToCoordinate` resolves INTEGER logicals (even past the data, into the
 * right-offset space) but returns 0/null for a FRACTIONAL logical just beyond
 * the last bar — exactly what an overlay anchored between the last rendered bar
 * and the replay cursor (or in the future) produces, which made boxes/drawings
 * jump to x=0 and stretch. So resolve the nearest in-data INTEGER bar and add
 * the remainder in pixel space (timeScale barSpacing = pixels per bar).
 */
export function xForTime(chart: IChartApi, anchor: TimeAnchor, timeUtc: number): number | null {
  const logical = timeToLogical(anchor.times, timeUtc, anchor.barSpacing);
  if (logical === null) return null;
  const ts = chart.timeScale();
  const i = Math.max(0, Math.min(anchor.times.length - 1, Math.round(logical)));
  const baseX = ts.logicalToCoordinate(i as never);
  if (baseX === null) return null;
  if (logical === i) return baseX as number;
  return (baseX as number) + (logical - i) * ts.options().barSpacing;
}

/**
 * UTC time for an X coordinate. Inside the data it snaps to the containing bar
 * (so a new/dragged drawing anchors to a real bar); beyond the rendered range
 * it extrapolates by the nominal bar spacing.
 */
export function timeForX(chart: IChartApi, anchor: TimeAnchor, x: number): number | null {
  const { times, barSpacing } = anchor;
  const n = times.length;
  if (n === 0) return null;
  const logical = chart.timeScale().coordinateToLogical(x);
  if (logical === null) return null;
  const l = logical as number;
  if (l <= 0) return Math.round(times[0] + l * barSpacing);
  if (l >= n - 1) return Math.round(times[n - 1] + (l - (n - 1)) * barSpacing);
  return times[Math.round(l)];
}
