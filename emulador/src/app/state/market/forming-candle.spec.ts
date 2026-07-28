import { describe, expect, it } from 'vitest';
import { Candle } from '../../models';
import { aggregateFormingCandle } from './forming-candle';

function c(time: number, open: number, high: number, low: number, close: number): Candle {
  return { time, open, high, low, close };
}

describe('aggregateFormingCandle', () => {
  it('aggregates several revealed candles: open=first, close=last, high/low=extremes, time=bucketStart', () => {
    const res = [c(0, 10, 12, 9, 11), c(100, 11, 15, 8, 14), c(200, 14, 16, 13, 13)];
    const out = aggregateFormingCandle(res, 0, 200);
    expect(out).toEqual({ time: 0, open: 10, high: 16, low: 8, close: 13 });
  });

  it('returns null on a gap — no candle in [bucketStart, cursor] (hi < lo)', () => {
    const res = [c(0, 10, 12, 9, 11), c(500, 20, 22, 19, 21)];
    // bucketStart=100, cursor=400: firstIndexAtOrAfter(100)=1 (the t=500 candle),
    // lastIndexAtOrBefore(400)=0 (the t=0 candle) -> hi(0) < lo(1).
    const out = aggregateFormingCandle(res, 100, 400);
    expect(out).toBeNull();
  });

  it('exactly one candle revealed (hi === lo) is re-timed to bucketStart', () => {
    const res = [c(30, 5, 6, 4, 5.5)];
    const out = aggregateFormingCandle(res, 0, 45);
    expect(out).toEqual({ time: 0, open: 5, high: 6, low: 4, close: 5.5 });
  });

  it('cursor === bucketStart yields the single candle at the boundary', () => {
    const res = [c(0, 7, 8, 6, 7.5), c(100, 9, 10, 8, 9.5)];
    const out = aggregateFormingCandle(res, 0, 0);
    expect(out).toEqual({ time: 0, open: 7, high: 8, low: 6, close: 7.5 });
  });

  it('returns null for an empty series', () => {
    expect(aggregateFormingCandle([], 0, 100)).toBeNull();
  });

  it('returns null for a null series', () => {
    expect(aggregateFormingCandle(null, 0, 100)).toBeNull();
  });

  it('cursor beyond the series end uses the last available candle, no crash', () => {
    const res = [c(0, 10, 12, 9, 11), c(100, 11, 15, 8, 14)];
    const out = aggregateFormingCandle(res, 0, 999_999);
    expect(out).toEqual({ time: 0, open: 10, high: 15, low: 8, close: 14 });
  });

  it('high/low come from the interior of the bucket, not just the endpoints', () => {
    // A mid-bucket spike (t=100) must win over both the first and last candle —
    // this catches a transcription slip that only checks candles[lo]/candles[hi].
    const res = [c(0, 10, 11, 9, 10), c(100, 10, 50, 1, 20), c(200, 20, 21, 19, 15)];
    const out = aggregateFormingCandle(res, 0, 200);
    expect(out).toEqual({ time: 0, open: 10, high: 50, low: 1, close: 15 });
  });
});
