import { describe, expect, it } from 'vitest';
import { Candle } from '../models';
import { selectExecutionSeries, selectFillContext, selectPlacementTime } from './selectors';
import { defaultTradingData } from './trading/trading.models';

// ---- RFC-014 Task 1: base-resolution execution loop plumbing (D14.A / D14.B) ----
// New file per the STOP rule: selectors.spec.ts is pre-existing and stays untouched.

function candle(time: number): Candle {
  return { time, open: 1, high: 1, low: 1, close: 1 };
}

function series(n: number, start = 0, step = 60): Candle[] {
  return Array.from({ length: n }, (_, i) => candle(start + i * step));
}

describe('selectExecutionSeries', () => {
  it('picks the finest loaded series (M1 over M5 over H1)', () => {
    const seriesMap = { H1: series(2, 0, 3600), M5: series(2, 0, 300), M1: series(2, 0, 60) };
    expect(selectExecutionSeries.projector(seriesMap)).toBe(seriesMap.M1);
  });

  it('falls back to the next finest TF in fineness order when M1 is not loaded', () => {
    const seriesMap = { H1: series(2, 0, 3600), M5: series(2, 0, 300) };
    expect(selectExecutionSeries.projector(seriesMap)).toBe(seriesMap.M5);
  });

  it('returns null when no series is loaded', () => {
    expect(selectExecutionSeries.projector({})).toBeNull();
  });

  it('skips loaded TFs with an empty array', () => {
    const seriesMap = { M1: [], M5: series(2, 0, 300) };
    expect(selectExecutionSeries.projector(seriesMap)).toBe(seriesMap.M5);
  });
});

describe('selectPlacementTime', () => {
  it('resolves to the last revealed base candle inside the resolution bucket [T, T+tf)', () => {
    // M1 base 0..600 step 60; cursor at the M5 boundary T=300, tf=300 (resolution mode)
    const base = series(11, 0, 60);
    // whole [300, 600) bucket is revealed → last base candle is 540, not the cursor's own 300
    expect(selectPlacementTime.projector(base, 300, 300)).toBe(540);
  });

  it('equals the cursor time exactly at base-grain stepping (resolution === base)', () => {
    const base = series(11, 0, 60);
    expect(selectPlacementTime.projector(base, 300, 60)).toBe(300);
  });

  it('falls back to the cursor time when no base series is loaded', () => {
    expect(selectPlacementTime.projector(null, 300, 300)).toBe(300);
    expect(selectPlacementTime.projector([], 300, 300)).toBe(300);
  });

  it('falls back to the cursor time when the base series starts after the bucket', () => {
    const base = series(3, 1000, 60);
    expect(selectPlacementTime.projector(base, 0, 60)).toBe(0);
  });

  it('falls back to the cursor time when tfSeconds is 0 (no active TF yet)', () => {
    const base = series(5, 0, 60);
    expect(selectPlacementTime.projector(base, 120, 0)).toBe(120);
  });
});

describe('selectFillContext — base (D14.A)', () => {
  it('exposes the execution series as `base`, appended as the LAST projector input', () => {
    const candles = series(3, 3600, 3600);
    const trading = {
      ...defaultTradingData(),
      summaryOpen: false,
      savedSessions: [],
      activeSessionId: null,
    };
    const lower = series(3, 0, 300);
    const base = series(4, 3600, 900);
    const result = selectFillContext.projector(candles, 2, 3600, lower, 100, trading, base);
    expect(result.base).toBe(base);
  });

  it('pre-existing 6-arg callers (selectors.spec.ts) still work: `base` is undefined, not thrown', () => {
    // NOTE: `.projector` is NgRx's memoized wrapper (compares args by reference
    // up to the CURRENT call's arg count), so this uses fresh object references
    // — not the ones from the test above — to avoid a stale-memo false positive.
    const candles = series(3, 7200, 3600);
    const trading = {
      ...defaultTradingData(),
      summaryOpen: false,
      savedSessions: [],
      activeSessionId: null,
    };
    const lower = series(3, 60, 300);
    const legacy = selectFillContext.projector(candles, 1, 3600, lower, 50, trading);
    expect(legacy.base).toBeUndefined();
  });
});
