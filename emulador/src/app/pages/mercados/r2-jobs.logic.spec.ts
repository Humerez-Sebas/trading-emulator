import { describe, expect, it } from 'vitest';
import { buildMissingJobs, hasPendingPartitions, partitionToJob } from './r2-jobs.logic';
import type { AssetCatalogEntry } from './r2-catalog.logic';

function entry(partitions: AssetCatalogEntry['partitions']): AssetCatalogEntry {
  return { symbol: 'XAUUSD', partitions };
}

describe('partitionToJob', () => {
  it('uses the year partition for m1', () => {
    expect(
      partitionToJob('XAUUSD', {
        tf: 'm1',
        partition: '2024',
        downloaded: false,
        updateAvailable: false,
      }),
    ).toEqual({ symbol: 'XAUUSD', tf: 'm1', year: '2024' });
  });

  it("forces year 'all' for h1/d1 regardless of the catalog key", () => {
    expect(
      partitionToJob('XAUUSD', {
        tf: 'h1',
        partition: 'all',
        downloaded: false,
        updateAvailable: false,
      }),
    ).toEqual({ symbol: 'XAUUSD', tf: 'h1', year: 'all' });
    expect(
      partitionToJob('XAUUSD', {
        tf: 'd1',
        partition: 'all',
        downloaded: false,
        updateAvailable: false,
      }),
    ).toEqual({ symbol: 'XAUUSD', tf: 'd1', year: 'all' });
  });
});

describe('buildMissingJobs', () => {
  it('returns jobs for not-downloaded and update-available partitions only', () => {
    const e = entry([
      { tf: 'm1', partition: '2023', downloaded: true, updateAvailable: false }, // current → skip
      { tf: 'm1', partition: '2024', downloaded: false, updateAvailable: false }, // missing → job
      { tf: 'h1', partition: 'all', downloaded: true, updateAvailable: true }, // stale → job
      { tf: 'd1', partition: 'all', downloaded: true, updateAvailable: false }, // current → skip
    ]);
    expect(buildMissingJobs(e)).toEqual([
      { symbol: 'XAUUSD', tf: 'm1', year: '2024' },
      { symbol: 'XAUUSD', tf: 'h1', year: 'all' },
    ]);
  });

  it('returns an empty array when everything is current', () => {
    const e = entry([
      { tf: 'm1', partition: '2024', downloaded: true, updateAvailable: false },
      { tf: 'h1', partition: 'all', downloaded: true, updateAvailable: false },
    ]);
    expect(buildMissingJobs(e)).toEqual([]);
  });
});

describe('hasPendingPartitions', () => {
  it('is true when any partition is missing or stale', () => {
    expect(
      hasPendingPartitions(
        entry([{ tf: 'm1', partition: '2024', downloaded: false, updateAvailable: false }]),
      ),
    ).toBe(true);
    expect(
      hasPendingPartitions(
        entry([{ tf: 'h1', partition: 'all', downloaded: true, updateAvailable: true }]),
      ),
    ).toBe(true);
  });

  it('is false when every partition is downloaded and current', () => {
    expect(
      hasPendingPartitions(
        entry([{ tf: 'm1', partition: '2024', downloaded: true, updateAvailable: false }]),
      ),
    ).toBe(false);
  });
});
