import { describe, expect, it } from 'vitest';
import { coverageFromParsed } from './offline-catalog';
import { series } from '../testing/fixtures';

describe('coverageFromParsed', () => {
  it('builds one coverage entry per timeframe with min/max/count', () => {
    const cov = coverageFromParsed([
      { tf: 'H1', candles: series(3, 1000, 3600) }, // 1000, 4600, 8200
      { tf: 'H4', candles: series(2, 2000, 14400) }, // 2000, 16400
    ]);
    expect(cov).toEqual([
      { tf: 'H1', desde: 1000, hasta: 8200, velas: 3 },
      { tf: 'H4', desde: 2000, hasta: 16400, velas: 2 },
    ]);
  });

  it('merges multiple files of the same tf and ignores empty ones', () => {
    const cov = coverageFromParsed([
      { tf: 'H1', candles: series(2, 1000, 3600) }, // 1000, 4600
      { tf: 'H1', candles: series(2, 100000, 3600) }, // 100000, 103600
      { tf: 'M1', candles: [] },
    ]);
    expect(cov).toEqual([{ tf: 'H1', desde: 1000, hasta: 103600, velas: 4 }]);
  });

  it('returns an empty array for no files', () => {
    expect(coverageFromParsed([])).toEqual([]);
  });
});
