import { describe, expect, it } from 'vitest';
import type { DatasetRecord } from '../../services/market-data-db';
import type { Manifest } from '../../services/market-data/manifest.service';
import { datasetTotalBytes, formatBytes, updatedDatasetIds } from './storage-manager.logic';

function ds(p: Partial<DatasetRecord> = {}): DatasetRecord {
  return {
    id: 'XAUUSD|M1|2024',
    symbol: 'XAUUSD',
    timeframe: 'M1',
    year: '2024',
    size: 1000,
    etag: 'e1',
    updatedAt: '2026-01-01T00:00:00Z',
    ...p,
  };
}

describe('datasetTotalBytes', () => {
  it('sums dataset sizes', () => {
    expect(datasetTotalBytes([ds({ size: 1000 }), ds({ id: 'b', size: 2500 })])).toBe(3500);
  });

  it('is 0 for no datasets', () => {
    expect(datasetTotalBytes([])).toBe(0);
  });
});

describe('updatedDatasetIds', () => {
  const manifest: Manifest = {
    version: 1,
    symbols: {
      XAUUSD: {
        m1: { '2024': { size: 1000, etag: 'e1-NEW', updatedAt: '2026-02-01T00:00:00Z' } },
        h1: { all: { size: 50, etag: 'eh1', updatedAt: '2026-01-01T00:00:00Z' } },
      },
    },
  };

  it('flags a dataset whose manifest etag changed', () => {
    const local = [ds({ id: 'XAUUSD|M1|2024', timeframe: 'M1', year: '2024', etag: 'e1-OLD' })];
    expect([...updatedDatasetIds(local, manifest)]).toEqual(['XAUUSD|M1|2024']);
  });

  it('does not flag a dataset whose etag matches', () => {
    const local = [ds({ id: 'XAUUSD|H1|all', timeframe: 'H1', year: 'all', etag: 'eh1' })];
    expect(updatedDatasetIds(local, manifest).size).toBe(0);
  });

  it('does not flag a dataset absent from the manifest', () => {
    const local = [ds({ id: 'EURUSD|M1|2024', symbol: 'EURUSD', etag: 'whatever' })];
    expect(updatedDatasetIds(local, manifest).size).toBe(0);
  });
});

describe('formatBytes', () => {
  it('formats common sizes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1_572_864)).toBe('1.5 MB');
    expect(formatBytes(3 * 1024 ** 3)).toBe('3.0 GB');
  });

  it('guards non-positive / non-finite input', () => {
    expect(formatBytes(-5)).toBe('0 B');
    expect(formatBytes(NaN)).toBe('0 B');
  });
});
