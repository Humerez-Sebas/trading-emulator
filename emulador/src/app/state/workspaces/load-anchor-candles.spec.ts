import { describe, expect, it, vi } from 'vitest';
import { loadAnchorCandles } from './load-anchor-candles';
import type { Timeframe } from '../../models';
import type { Candle } from '../../models';

describe('loadAnchorCandles', () => {
  it('reads every tf and packs PendingCsv with the standard fileName', async () => {
    const m1: Candle[] = [{ time: 1, open: 1, high: 2, low: 0, close: 1 }];
    const h1: Candle[] = [{ time: 2, open: 1, high: 2, low: 0, close: 1 }];
    const repo = {
      getCandles: vi.fn((_s: string, tf: Timeframe) => Promise.resolve(tf === 'M1' ? m1 : h1)),
    };

    const out = await loadAnchorCandles(repo as never, 'US30', ['M1', 'H1']);

    expect(repo.getCandles).toHaveBeenCalledWith('US30', 'M1');
    expect(repo.getCandles).toHaveBeenCalledWith('US30', 'H1');
    expect(out).toEqual([
      { tf: 'M1', candles: m1, fileName: 'us30_m1.csv' },
      { tf: 'H1', candles: h1, fileName: 'us30_h1.csv' },
    ]);
  });
});
