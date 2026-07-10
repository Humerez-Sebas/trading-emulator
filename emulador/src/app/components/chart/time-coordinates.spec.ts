import { describe, expect, it } from 'vitest';
import type { IChartApi } from 'lightweight-charts';
import { timeToLogical, xForTime } from '../../domain/chart/time-coordinates';

/**
 * Fake timeScale that mirrors the real lightweight-charts quirk: it resolves
 * INTEGER logicals (even past the data, into the right-offset space) but
 * returns null for a FRACTIONAL logical outside [0, n-1] — the boundary that
 * made overlays jump to x=0.
 */
function fakeChart(n: number, px: number): IChartApi {
  return {
    timeScale: () => ({
      logicalToCoordinate: (l: number) => {
        if (!Number.isInteger(l) && (l < 0 || l > n - 1)) return null;
        return l * px;
      },
      options: () => ({ barSpacing: px }),
    }),
  } as unknown as IChartApi;
}

describe('timeToLogical', () => {
  // three consecutive M1 bars, a long (weekend) gap, then two more M1 bars
  const times = [0, 60, 120, 100_000, 100_060];
  const SPACING = 60;

  it('returns null when there are no rendered bars', () => {
    expect(timeToLogical([], 100, SPACING)).toBeNull();
  });

  it('maps an exact bar time to its index', () => {
    expect(timeToLogical(times, 0, SPACING)).toBe(0);
    expect(timeToLogical(times, 120, SPACING)).toBe(2);
    expect(timeToLogical(times, 100_000, SPACING)).toBe(3);
  });

  it('anchors an off-bar time to the CONTAINING bar (the deform fix)', () => {
    // a time inside the weekend gap resolves to the last bar before it (idx 2),
    // NOT an extrapolation that counts the gap seconds as if they were bars
    expect(timeToLogical(times, 50_000, SPACING)).toBe(2);
    expect(timeToLogical(times, 130, SPACING)).toBe(2);
  });

  it('extrapolates before the first bar by nominal spacing', () => {
    expect(timeToLogical(times, -120, SPACING)).toBe(-2);
  });

  it('extrapolates after the last bar by nominal spacing', () => {
    // last index 4 at t=100060; +120s = +2 bars
    expect(timeToLogical(times, 100_060 + 120, SPACING)).toBe(6);
  });
});

describe('xForTime (beyond-last-bar pixel extrapolation)', () => {
  // 3 bars at 1000/1060/1120 (60s spacing), 8 px per bar
  const times = [1000, 1060, 1120];
  const SPACING = 60;
  const PX = 8;
  const chart = fakeChart(times.length, PX);

  it('maps an exact bar to its integer-logical coordinate', () => {
    expect(xForTime(chart, { shift: 0, times, barSpacing: SPACING }, 1060)).toBe(8); // logical 1
  });

  it('maps a time BETWEEN the last bar and the cursor to the right (not 0)', () => {
    // 1138 = last bar + 18s = logical 2.3 → would hit logicalToCoordinate(2.3)=null
    const x = xForTime(chart, { shift: 0, times, barSpacing: SPACING }, 1138)!;
    expect(x).toBeCloseTo(2.3 * PX, 5); // 18.4, NOT 0
    expect(x).toBeGreaterThan(xForTime(chart, { shift: 0, times, barSpacing: SPACING }, 1120)!);
  });

  it('extrapolates a future time linearly in pixel space', () => {
    // 1420 = last + 300s = logical 7
    expect(xForTime(chart, { shift: 0, times, barSpacing: SPACING }, 1420)).toBeCloseTo(7 * PX, 5);
  });

  it('extrapolates before the first bar to a negative coordinate', () => {
    // 880 = first - 120s = logical -2
    expect(xForTime(chart, { shift: 0, times, barSpacing: SPACING }, 880)).toBeCloseTo(-2 * PX, 5);
  });
});
