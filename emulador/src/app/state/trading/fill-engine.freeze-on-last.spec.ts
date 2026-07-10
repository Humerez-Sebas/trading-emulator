import { describe, it, expect } from 'vitest';
import { lastIndexAtOrBefore } from './fill-engine';
import { Candle } from '../../models';

const candles = (times: number[]): Candle[] =>
  times.map((time) => ({ time, open: 1, high: 1, low: 1, close: 1 }));

describe('lastIndexAtOrBefore — freeze-on-last (RFC-010 D5)', () => {
  it('a cursor T past the last candle freezes on the LAST index (not -1, not out of range)', () => {
    const c = candles([100, 200, 300]); // this symbol/panel has a data gap after t=300
    expect(lastIndexAtOrBefore(c, 300)).toBe(2);
    expect(lastIndexAtOrBefore(c, 500)).toBe(2); // T beyond coverage: freeze on the last known candle
    expect(lastIndexAtOrBefore(c, 10_000)).toBe(2); // arbitrarily far beyond: still frozen, never -1
  });

  it('a cursor T before the first candle has no valid index yet (-1), distinct from freeze-on-last', () => {
    const c = candles([100, 200, 300]);
    expect(lastIndexAtOrBefore(c, 50)).toBe(-1);
  });

  it('re-entering coverage after a gap un-freezes automatically: the projection tracks T again', () => {
    // Simulates a secondary symbol with a mid-series gap: candles resume after a session gap.
    const c = candles([100, 200, /* gap */ 500, 600]);
    expect(lastIndexAtOrBefore(c, 300)).toBe(1); // frozen at the pre-gap candle while T is inside the gap
    expect(lastIndexAtOrBefore(c, 500)).toBe(2); // T reaches the post-gap candle: un-frozen, tracks again
    expect(lastIndexAtOrBefore(c, 550)).toBe(2);
    expect(lastIndexAtOrBefore(c, 600)).toBe(3);
  });
});
