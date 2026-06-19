import { describe, expect, it } from 'vitest';
import { Candle, Timeframe } from '../../models';
import {
  generateCustomSeries,
  parseCustomTimeframe,
  pickBaseSeriesTf,
  parseInterval,
  formatIntervalVerbose,
  formatIntervalShort,
  loadedTfForMinutes,
  buildAnchorDownloadJobs,
} from './custom-timeframe';

/** `n` consecutive candles of `stepSec` spacing from `start`. */
function candles(n: number, start = 0, stepSec = 60): Candle[] {
  return Array.from({ length: n }, (_, i) => ({
    time: start + i * stepSec,
    open: i,
    high: i + 0.5,
    low: i - 0.5,
    close: i + 0.2,
  }));
}

describe('parseCustomTimeframe', () => {
  it('accepts positive whole minutes', () => {
    expect(parseCustomTimeframe('45')).toBe(45);
    expect(parseCustomTimeframe(90)).toBe(90);
    expect(parseCustomTimeframe('  7 ')).toBe(7);
  });

  it('rejects non-integers, non-positive, and out-of-range', () => {
    expect(parseCustomTimeframe('0')).toBeNull();
    expect(parseCustomTimeframe('-5')).toBeNull();
    expect(parseCustomTimeframe('4.5')).toBeNull();
    expect(parseCustomTimeframe('abc')).toBeNull();
    expect(parseCustomTimeframe('')).toBeNull();
    expect(parseCustomTimeframe('99999999')).toBeNull(); // > 30 days
  });
});

describe('pickBaseSeriesTf', () => {
  it('picks the coarsest LOADED tf whose minutes divide the request', () => {
    const series: Partial<Record<Timeframe, Candle[]>> = {
      M1: candles(1),
      M5: candles(1),
      M15: candles(1),
    };
    // 45: divisors loaded are M1, M5, M15 → coarsest is M15
    expect(pickBaseSeriesTf(series, 45)).toBe('M15');
    // 90: M1/M5/M15 all divide; M30 not loaded → M15
    expect(pickBaseSeriesTf(series, 90)).toBe('M15');
  });

  it('returns null when no loaded series divides the request', () => {
    const series: Partial<Record<Timeframe, Candle[]>> = { H1: candles(1, 0, 3600) };
    // 90 minutes is not a whole number of hours → cannot build from H1
    expect(pickBaseSeriesTf(series, 90)).toBeNull();
  });
});

describe('generateCustomSeries', () => {
  it('aggregates M1 into M45 buckets', () => {
    const series: Partial<Record<Timeframe, Candle[]>> = { M1: candles(90, 0, 60) };
    const out = generateCustomSeries(series, 45);
    expect(out.map((c) => c.time)).toEqual([0, 2700]); // two 45-min buckets
  });

  it('returns the base untouched when it already equals the request', () => {
    const m5 = candles(3, 0, 300);
    const out = generateCustomSeries({ M5: m5 }, 5);
    expect(out).toBe(m5);
  });

  it('returns [] when no base can produce the request', () => {
    expect(generateCustomSeries({ H1: candles(3, 0, 3600) }, 90)).toEqual([]);
  });
});

describe('parseInterval', () => {
  it('parses bare minutes', () => {
    expect(parseInterval('45')).toBe(45);
    expect(parseInterval(90)).toBe(90);
  });
  it('parses H as hours and D as days (case-insensitive, trims)', () => {
    expect(parseInterval('2H')).toBe(120);
    expect(parseInterval(' 2h ')).toBe(120);
    expect(parseInterval('1D')).toBe(1440);
    expect(parseInterval('3d')).toBe(4320);
  });
  it('rejects junk, zero, fractional, out-of-range', () => {
    for (const bad of ['', 'abc', '0', '-5', '4.5', '2W', '99999999'])
      expect(parseInterval(bad)).toBeNull();
  });
});

describe('formatIntervalVerbose', () => {
  it('uses minutos / horas / días, singular for 1', () => {
    expect(formatIntervalVerbose(21)).toBe('21 minutos');
    expect(formatIntervalVerbose(120)).toBe('2 horas');
    expect(formatIntervalVerbose(60)).toBe('1 hora');
    expect(formatIntervalVerbose(1440)).toBe('1 día');
    expect(formatIntervalVerbose(90)).toBe('90 minutos'); // not a whole hour
  });
});

describe('formatIntervalShort', () => {
  it('compact canonical', () => {
    expect(formatIntervalShort(45)).toBe('45m');
    expect(formatIntervalShort(120)).toBe('2h');
    expect(formatIntervalShort(1440)).toBe('1D');
  });
});

describe('loadedTfForMinutes', () => {
  it('returns the loaded TF matching the exact minutes', () => {
    expect(loadedTfForMinutes(60, ['M1', 'H1', 'D1'])).toBe('H1');
    expect(loadedTfForMinutes(1440, ['H1', 'D1'])).toBe('D1');
  });
  it('null when no loaded TF matches', () => {
    expect(loadedTfForMinutes(45, ['H1', 'D1'])).toBeNull();
    expect(loadedTfForMinutes(60, ['D1'])).toBeNull();
  });
});

describe('buildAnchorDownloadJobs', () => {
  it('builds one m1 job per calendar year for the M1 anchor', () => {
    expect(buildAnchorDownloadJobs('M1', 'XAUUSD', ['2023', '2024'])).toEqual([
      { symbol: 'XAUUSD', tf: 'm1', year: '2023' },
      { symbol: 'XAUUSD', tf: 'm1', year: '2024' },
    ]);
  });

  it('builds a single "all" job for H1/D1, ignoring m1Years', () => {
    expect(buildAnchorDownloadJobs('H1', 'XAUUSD', ['2023'])).toEqual([
      { symbol: 'XAUUSD', tf: 'h1', year: 'all' },
    ]);
    expect(buildAnchorDownloadJobs('D1', 'EURUSD', [])).toEqual([
      { symbol: 'EURUSD', tf: 'd1', year: 'all' },
    ]);
  });

  it('returns an empty array for M1 when no years are available', () => {
    expect(buildAnchorDownloadJobs('M1', 'XAUUSD', [])).toEqual([]);
  });
});
