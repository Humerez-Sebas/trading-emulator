import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceDbService } from '../../services/workspace-db.service';
import { bulkInsertCandles } from '../../workers/candles-writer';
import type { CandleRecord, DatasetRecord } from '../../services/market-data-db';
import type { ManifestService } from '../../services/market-data/manifest.service';
import { StorageManagerService } from './storage-manager.service';

const DB_NAME = 'emulador-workspaces';

async function freshDb(): Promise<WorkspaceDbService> {
  await new Promise<void>((res) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => res();
    req.onerror = () => res();
    req.onblocked = () => res();
  });
  return new WorkspaceDbService();
}

function dataset(p: Partial<DatasetRecord> = {}): DatasetRecord {
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

function candle(time: number, symbol: string, timeframe: string): CandleRecord {
  return { symbol, timeframe, time, open: 1, high: 1, low: 1, close: 1 };
}

describe('StorageManagerService.deleteDataset', () => {
  let db: WorkspaceDbService;
  beforeEach(async () => {
    db = await freshDb();
  });

  it('removes the dataset row AND every candle of that (symbol, timeframe), leaving others intact', async () => {
    // db.putDataset initialises the v5 schema; then seed candles for two tfs.
    await db.putDataset(dataset({ id: 'XAUUSD|M1|2024', timeframe: 'M1', year: '2024' }));
    await db.putDataset(dataset({ id: 'XAUUSD|H1|all', timeframe: 'H1', year: 'all' }));
    await bulkInsertCandles([
      candle(1, 'XAUUSD', 'M1'),
      candle(2, 'XAUUSD', 'M1'),
      candle(3, 'XAUUSD', 'H1'),
    ]);

    const svc = new StorageManagerService(db, {} as ManifestService);
    await svc.deleteDataset(dataset({ id: 'XAUUSD|M1|2024', timeframe: 'M1', year: '2024' }));

    expect((await db.listDatasets()).map((d) => d.id)).toEqual(['XAUUSD|H1|all']);
    expect(await db.listCandles('XAUUSD', 'M1')).toEqual([]); // cleared
    expect((await db.listCandles('XAUUSD', 'H1')).length).toBe(1); // untouched
  });

  it('reports total bytes across datasets', async () => {
    const svc = new StorageManagerService(db, {} as ManifestService);
    expect(svc.totalBytes([dataset({ size: 1000 }), dataset({ id: 'b', size: 250 })])).toBe(1250);
  });
});

describe('StorageManagerService.checkForUpdates', () => {
  it('fetches the manifest and returns ids whose etag changed upstream', async () => {
    const datasets = [dataset({ id: 'XAUUSD|M1|2024', etag: 'old' })];
    const manifests = {
      fetchManifest: vi.fn().mockResolvedValue({
        version: 1,
        symbols: { XAUUSD: { m1: { '2024': { size: 1, etag: 'new', updatedAt: 'x' } } } },
      }),
    } as unknown as ManifestService;

    const svc = new StorageManagerService({} as WorkspaceDbService, manifests);
    const updated = await svc.checkForUpdates(datasets);

    expect(manifests.fetchManifest).toHaveBeenCalledOnce();
    expect([...updated]).toEqual(['XAUUSD|M1|2024']);
  });
});
