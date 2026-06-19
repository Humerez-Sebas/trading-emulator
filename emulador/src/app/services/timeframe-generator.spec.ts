import { describe, expect, it, vi } from 'vitest';
import { Candle } from '../models';
import { MarketDataRepository } from '../domain/market-data.repository';
import { aggregateCandles, anchorFor, TimeframeGenerator } from './timeframe-generator';

/** Builds `n` consecutive 1-minute candles starting at `start` (UTC seconds). */
function m1(n: number, start = 0): Candle[] {
  return Array.from({ length: n }, (_, i) => ({
    time: start + i * 60,
    open: i,
    high: i + 0.5,
    low: i - 0.5,
    close: i + 0.2,
  }));
}

describe('anchorFor', () => {
  it('picks the coarsest stored anchor that divides the target', () => {
    expect(anchorFor(1)).toBe('M1');
    expect(anchorFor(45)).toBe('M1'); // 45 % 60 !== 0
    expect(anchorFor(90)).toBe('M1'); // 90 % 60 === 30, not whole hours
    expect(anchorFor(60)).toBe('H1');
    expect(anchorFor(120)).toBe('H1'); // H2
    expect(anchorFor(240)).toBe('H1'); // H4
    expect(anchorFor(1440)).toBe('D1');
    expect(anchorFor(2880)).toBe('D1'); // 2-day
  });
});

describe('aggregateCandles', () => {
  it('returns [] for empty input or non-positive tf', () => {
    expect(aggregateCandles([], 5)).toEqual([]);
    expect(aggregateCandles(m1(3), 0)).toEqual([]);
  });

  it('buckets M1 into M5 with correct OHLC and epoch-aligned bucket times', () => {
    const out = aggregateCandles(m1(10, 0), 5);
    expect(out).toHaveLength(2);
    expect(out[0].time).toBe(0);
    expect(out[1].time).toBe(300);
    // bucket 0 = candles 0..4: open=first(0), close=last(4 →4.2), high=max(4.5), low=min(-0.5)
    expect(out[0].open).toBe(0);
    expect(out[0].close).toBeCloseTo(4.2);
    expect(out[0].high).toBeCloseTo(4.5);
    expect(out[0].low).toBeCloseTo(-0.5);
  });

  it('aligns buckets to epoch floors, not to the first candle', () => {
    // first candle at 02:00 minutes past a 45-min boundary still floors to its bucket
    const out = aggregateCandles(m1(3, 120), 45); // 45-min buckets: [0,2700),[2700,5400)...
    // times 120,180,240 all fall in bucket floor(t/2700)*2700 = 0
    expect(out).toHaveLength(1);
    expect(out[0].time).toBe(0);
  });

  it('does not mutate the input candles', () => {
    const base = m1(3);
    const snapshot = JSON.stringify(base);
    aggregateCandles(base, 5);
    expect(JSON.stringify(base)).toBe(snapshot);
  });
});

describe('TimeframeGenerator', () => {
  function repoReturning(candles: Candle[]): MarketDataRepository {
    return { getCandles: vi.fn().mockResolvedValue(candles) } as unknown as MarketDataRepository;
  }

  it('returns anchor candles unaggregated when the request IS the anchor (60 → H1)', async () => {
    const h1 = m1(4); // stand-in candles
    const repo = repoReturning(h1);
    const gen = new TimeframeGenerator(repo);
    const out = await gen.getCandles('XAUUSD', 60);
    expect(repo.getCandles).toHaveBeenCalledWith('XAUUSD', 'H1');
    expect(out).toBe(h1); // same array, no aggregation
  });

  it('fetches M1 and aggregates for a custom M45', async () => {
    const repo = repoReturning(m1(90, 0)); // 90 minutes of M1
    const gen = new TimeframeGenerator(repo);
    const out = await gen.getCandles('XAUUSD', 45);
    expect(repo.getCandles).toHaveBeenCalledWith('XAUUSD', 'M1');
    // 90 one-minute candles → 45-min buckets at 0 and 2700
    expect(out.map((c) => c.time)).toEqual([0, 2700]);
  });

  it('fetches H1 and aggregates for H2 (120)', async () => {
    // four "hourly" candles on the hour
    const hourly: Candle[] = [0, 3600, 7200, 10800].map((t, i) => ({
      time: t,
      open: i,
      high: i + 1,
      low: i - 1,
      close: i,
    }));
    const repo = repoReturning(hourly);
    const gen = new TimeframeGenerator(repo);
    const out = await gen.getCandles('XAUUSD', 120);
    expect(repo.getCandles).toHaveBeenCalledWith('XAUUSD', 'H1');
    expect(out.map((c) => c.time)).toEqual([0, 7200]); // 2-hour buckets
  });
});
