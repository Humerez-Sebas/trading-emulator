import { describe, expect, it } from 'vitest';
import type { DatasetRecord } from '../../services/market-data-db';
import type { Manifest } from '../../services/market-data/manifest.service';
import { buildCatalog } from './r2-catalog.logic';

function ds(p: Partial<DatasetRecord> = {}): DatasetRecord {
  return {
    id: 'XAUUSD|M1|2024',
    symbol: 'XAUUSD',
    timeframe: 'M1',
    year: '2024',
    size: 1000,
    etag: 'e-2024',
    updatedAt: '2026-01-01T00:00:00Z',
    ...p,
  };
}

describe('buildCatalog', () => {
  const manifest: Manifest = {
    version: 1,
    symbols: {
      XAUUSD: {
        m1: {
          '2024': { size: 1000, etag: 'e-2024-NEW', updatedAt: '2026-02-01T00:00:00Z' },
          '2025': { size: 1200, etag: 'e-2025', updatedAt: '2026-02-01T00:00:00Z' },
        },
        h1: {
          all: { size: 50, etag: 'e-h1-all', updatedAt: '2026-01-01T00:00:00Z' },
        },
      },
    },
  };

  it('flags a downloaded partition with a stale local etag as updateAvailable', () => {
    const datasets = [
      ds({ id: 'XAUUSD|M1|2024', timeframe: 'M1', year: '2024', etag: 'e-2024-OLD' }),
    ];
    const catalog = buildCatalog(manifest, datasets);

    expect(catalog).toHaveLength(1);
    const xau = catalog[0];
    expect(xau.symbol).toBe('XAUUSD');

    const m1_2024 = xau.partitions.find((p) => p.tf === 'm1' && p.partition === '2024');
    expect(m1_2024).toEqual({
      tf: 'm1',
      partition: '2024',
      downloaded: true,
      updateAvailable: true,
    });
  });

  it('marks a manifest partition with no local record as not downloaded', () => {
    const datasets = [
      ds({ id: 'XAUUSD|M1|2024', timeframe: 'M1', year: '2024', etag: 'e-2024-OLD' }),
    ];
    const catalog = buildCatalog(manifest, datasets);
    const xau = catalog[0];

    const m1_2025 = xau.partitions.find((p) => p.tf === 'm1' && p.partition === '2025');
    expect(m1_2025).toEqual({
      tf: 'm1',
      partition: '2025',
      downloaded: false,
      updateAvailable: false,
    });

    const h1_all = xau.partitions.find((p) => p.tf === 'h1' && p.partition === 'all');
    expect(h1_all).toEqual({
      tf: 'h1',
      partition: 'all',
      downloaded: false,
      updateAvailable: false,
    });
  });

  it('marks a downloaded partition with a matching etag as up to date', () => {
    const datasets = [
      ds({ id: 'XAUUSD|M1|2024', timeframe: 'M1', year: '2024', etag: 'e-2024-NEW' }),
    ];
    const catalog = buildCatalog(manifest, datasets);
    const xau = catalog[0];

    const m1_2024 = xau.partitions.find((p) => p.tf === 'm1' && p.partition === '2024');
    expect(m1_2024).toEqual({
      tf: 'm1',
      partition: '2024',
      downloaded: true,
      updateAvailable: false,
    });
  });

  it('produces partitions in m1 (sorted) -> h1 -> d1 order', () => {
    const catalog = buildCatalog(manifest, []);
    const xau = catalog[0];

    expect(xau.partitions.map((p) => `${p.tf}:${p.partition}`)).toEqual([
      'm1:2024',
      'm1:2025',
      'h1:all',
    ]);
  });

  it('sorts symbols alphabetically and includes d1 partitions when present', () => {
    const multiManifest: Manifest = {
      version: 1,
      symbols: {
        EURUSD: {
          d1: { all: { size: 10, etag: 'e-d1', updatedAt: '2026-01-01T00:00:00Z' } },
        },
        XAUUSD: manifest.symbols['XAUUSD'],
      },
    };
    const datasets = [
      ds({ id: 'EURUSD|D1|all', symbol: 'EURUSD', timeframe: 'D1', year: 'all', etag: 'e-d1' }),
    ];
    const catalog = buildCatalog(multiManifest, datasets);

    expect(catalog.map((c) => c.symbol)).toEqual(['EURUSD', 'XAUUSD']);

    const eurD1All = catalog[0].partitions.find((p) => p.tf === 'd1' && p.partition === 'all');
    expect(eurD1All).toEqual({
      tf: 'd1',
      partition: 'all',
      downloaded: true,
      updateAvailable: false,
    });
  });

  it('returns an empty catalog for an empty manifest', () => {
    expect(buildCatalog({ version: 1, symbols: {} }, [])).toEqual([]);
  });
});
