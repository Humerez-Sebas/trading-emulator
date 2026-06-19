import { describe, expect, it } from 'vitest';
import type { Candle, Timeframe } from '../../models';
import { coverageRange, isEndValid, isStartValid } from './r2-coverage.logic';

function candle(time: number): Candle {
  return { time, open: 1, high: 1, low: 1, close: 1 };
}

describe('coverageRange', () => {
  it('returns null when no TFs are selected', () => {
    const seriesByTf: Partial<Record<Timeframe, Candle[]>> = {
      M1: [candle(1000), candle(2000)],
    };
    expect(coverageRange(seriesByTf, [])).toBeNull();
  });

  it('returns null when the selected TF has no loaded series', () => {
    const seriesByTf: Partial<Record<Timeframe, Candle[]>> = {};
    expect(coverageRange(seriesByTf, ['M1'])).toBeNull();
  });

  it('returns null when the selected TF series is empty', () => {
    const seriesByTf: Partial<Record<Timeframe, Candle[]>> = { M1: [] };
    expect(coverageRange(seriesByTf, ['M1'])).toBeNull();
  });

  it('computes the intersection across selected TFs: max desde, min hasta', () => {
    const seriesByTf: Partial<Record<Timeframe, Candle[]>> = {
      M1: [candle(1000), candle(1500), candle(2000)],
      H1: [candle(1200), candle(1800)],
    };
    const range = coverageRange(seriesByTf, ['M1', 'H1']);
    expect(range).toEqual({ from: 1200, to: 1800 });
  });

  it('ignores TFs that are not selected even if loaded', () => {
    const seriesByTf: Partial<Record<Timeframe, Candle[]>> = {
      M1: [candle(1000), candle(2000)],
      H1: [candle(1200), candle(1800)],
      D1: [candle(1, ), candle(5000)] as Candle[],
    };
    const range = coverageRange(seriesByTf, ['M1', 'H1']);
    expect(range).toEqual({ from: 1200, to: 1800 });
  });

  it('uses a single selected TF range directly', () => {
    const seriesByTf: Partial<Record<Timeframe, Candle[]>> = {
      M1: [candle(1000), candle(1500), candle(2000)],
    };
    const range = coverageRange(seriesByTf, ['M1']);
    expect(range).toEqual({ from: 1000, to: 2000 });
  });
});

describe('isStartValid', () => {
  const range = { from: 1200, to: 1800 };

  it('is false when range is null', () => {
    expect(isStartValid(null, 1500)).toBe(false);
  });

  it('is true when start is within range (inclusive bounds)', () => {
    expect(isStartValid(range, 1200)).toBe(true);
    expect(isStartValid(range, 1800)).toBe(true);
    expect(isStartValid(range, 1500)).toBe(true);
  });

  it('is false when start is before range.from', () => {
    expect(isStartValid(range, 1199)).toBe(false);
  });

  it('is false when start is after range.to', () => {
    expect(isStartValid(range, 1801)).toBe(false);
  });
});

describe('isEndValid', () => {
  const range = { from: 1200, to: 1800 };

  it('is true when end is null (no scheduled end)', () => {
    expect(isEndValid(range, 1500, null)).toBe(true);
  });

  it('is false when range is null and end is set', () => {
    expect(isEndValid(null, 1500, 1600)).toBe(false);
  });

  it('is true when end is after start and within range', () => {
    expect(isEndValid(range, 1500, 1600)).toBe(true);
  });

  it('is true when end equals range.to', () => {
    expect(isEndValid(range, 1500, 1800)).toBe(true);
  });

  it('is false when end is before or equal to start', () => {
    expect(isEndValid(range, 1500, 1500)).toBe(false);
    expect(isEndValid(range, 1500, 1400)).toBe(false);
  });

  it('is false when end exceeds range.to', () => {
    expect(isEndValid(range, 1500, 1801)).toBe(false);
  });
});
