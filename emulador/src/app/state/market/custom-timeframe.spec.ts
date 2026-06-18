import { describe, expect, it } from 'vitest';
import { Candle, Timeframe } from '../../models';
import {
  generateCustomSeries,
  parseCustomTimeframe,
  pickBaseSeriesTf,
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
