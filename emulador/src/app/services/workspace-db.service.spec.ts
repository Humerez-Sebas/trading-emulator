import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { WorkspaceDbService } from './workspace-db.service';
import { series, workspaceMeta } from '../testing/fixtures';
import { defaultTradingData } from '../state/trading/trading.models';

const DB_NAME = 'emulador-workspaces';

/** Delete the DB and return a fresh service instance. */
async function freshDb(): Promise<WorkspaceDbService> {
  await new Promise<void>((res, rej) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => res();
    req.onerror = () => rej(req.error);
    req.onblocked = () => res(); // resolve even if blocked in test env
  });
  return new WorkspaceDbService();
}

let svc: WorkspaceDbService;

beforeEach(async () => {
  svc = await freshDb();
});

describe('WorkspaceDbService — putMeta / getMeta', () => {
  it('round-trips a meta record', async () => {
    const meta = workspaceMeta({ symbol: 'EURUSD' });
    await svc.putMeta(meta);
    const got = await svc.getMeta('EURUSD');
    expect(got).toEqual(meta);
  });

  it('getMeta returns undefined for unknown symbol', async () => {
    expect(await svc.getMeta('UNKNOWN')).toBeUndefined();
  });
});

describe('WorkspaceDbService — putSeries / getWorkspace', () => {
  it('getWorkspace returns meta merged with series keyed by tf', async () => {
    const meta = workspaceMeta({ symbol: 'XAUUSD' });
    const candles = series(5);
    await svc.putMeta(meta);
    await svc.putSeries('XAUUSD', 'H1', candles);
    const ws = await svc.getWorkspace('XAUUSD');
    expect(ws).toBeDefined();
    expect(ws!.symbol).toBe('XAUUSD');
    expect(ws!.series['H1']).toEqual(candles);
  });

  it('getWorkspace returns undefined when no meta exists', async () => {
    await svc.putSeries('XAUUSD', 'H1', series(3));
    expect(await svc.getWorkspace('XAUUSD')).toBeUndefined();
  });
});

describe('WorkspaceDbService — appendSeriesChunk', () => {
  it('empty input is a no-op', async () => {
    await svc.appendSeriesChunk('XAUUSD', 'H1', []);
    expect(await svc.getSeriesInfo('XAUUSD', 'H1')).toBeNull();
  });

  it('first chunk creates the record', async () => {
    const chunk = series(3, 1000, 3600);
    await svc.appendSeriesChunk('XAUUSD', 'H1', chunk);
    const info = await svc.getSeriesInfo('XAUUSD', 'H1');
    expect(info).toEqual({ lastTime: 1000 + 2 * 3600, count: 3 });
  });

  it('appending a chunk past the tail does a cheap concat', async () => {
    const first = series(3, 1000, 3600);
    await svc.appendSeriesChunk('XAUUSD', 'H1', first);
    const second = series(2, 1000 + 3 * 3600, 3600);
    await svc.appendSeriesChunk('XAUUSD', 'H1', second);
    const info = await svc.getSeriesInfo('XAUUSD', 'H1');
    expect(info!.count).toBe(5);
    expect(info!.lastTime).toBe(1000 + 4 * 3600);
  });

  it('overlapping chunk dedupes by time and sorts', async () => {
    const first = series(5, 1000, 3600);
    await svc.appendSeriesChunk('XAUUSD', 'H1', first);
    // overlap: starts 2 candles before the tail
    const overlap = series(4, 1000 + 3 * 3600, 3600);
    await svc.appendSeriesChunk('XAUUSD', 'H1', overlap);
    const info = await svc.getSeriesInfo('XAUUSD', 'H1');
    expect(info!.count).toBe(7); // 5 original + 2 new past the tail
    expect(info!.lastTime).toBe(1000 + 6 * 3600);
  });
});

describe('WorkspaceDbService — getSeriesInfo', () => {
  it('returns null when no record exists', async () => {
    expect(await svc.getSeriesInfo('NONE', 'M1')).toBeNull();
  });

  it('returns lastTime and count for a stored series', async () => {
    await svc.appendSeriesChunk('XAUUSD', 'H1', series(4, 0, 3600));
    const info = await svc.getSeriesInfo('XAUUSD', 'H1');
    expect(info).toEqual({ lastTime: 3 * 3600, count: 4 });
  });
});

describe('WorkspaceDbService — listMetas / list', () => {
  it('listMetas returns all metas sorted by symbol', async () => {
    await svc.putMeta(workspaceMeta({ symbol: 'XAUUSD' }));
    await svc.putMeta(workspaceMeta({ symbol: 'EURUSD' }));
    await svc.putMeta(workspaceMeta({ symbol: 'GBPUSD' }));
    const metas = await svc.listMetas();
    expect(metas.map((m) => m.symbol)).toEqual(['EURUSD', 'GBPUSD', 'XAUUSD']);
  });

  it('list returns {symbol, lastModified} sorted by symbol', async () => {
    await svc.putMeta(workspaceMeta({ symbol: 'XAUUSD', lastModified: 200 }));
    await svc.putMeta(workspaceMeta({ symbol: 'EURUSD', lastModified: 100 }));
    const items = await svc.list();
    expect(items).toEqual([
      { symbol: 'EURUSD', lastModified: 100 },
      { symbol: 'XAUUSD', lastModified: 200 },
    ]);
  });
});

describe('WorkspaceDbService — remove', () => {
  it('removes meta and associated series', async () => {
    await svc.putMeta(workspaceMeta({ symbol: 'XAUUSD' }));
    await svc.putSeries('XAUUSD', 'H1', series(3));
    await svc.putSeries('XAUUSD', 'M1', series(3));
    await svc.remove('XAUUSD');
    expect(await svc.getWorkspace('XAUUSD')).toBeUndefined();
    expect(await svc.getMeta('XAUUSD')).toBeUndefined();
    expect(await svc.getSeriesInfo('XAUUSD', 'H1')).toBeNull();
    expect(await svc.getSeriesInfo('XAUUSD', 'M1')).toBeNull();
  });
});

describe('WorkspaceDbService — session folders (v3)', () => {
  it('putFolder + listFolders round-trip, ordered by order then name', async () => {
    await svc.putFolder({ id: 'b', name: 'Beta', order: 2 });
    await svc.putFolder({ id: 'a', name: 'Alfa', order: 1 });
    await svc.putFolder({ id: 'z', name: 'Aaa', order: 1 });
    const folders = await svc.listFolders();
    // order 1 first (Aaa before Alfa by name), then order 2
    expect(folders.map((f) => f.id)).toEqual(['z', 'a', 'b']);
  });

  it('listFolders is empty by default', async () => {
    expect(await svc.listFolders()).toEqual([]);
  });

  it('deleteFolder removes a folder', async () => {
    await svc.putFolder({ id: 'f1', name: 'X', order: 0 });
    await svc.deleteFolder('f1');
    expect(await svc.listFolders()).toEqual([]);
  });

  it('putFolder updates an existing folder (same id)', async () => {
    await svc.putFolder({ id: 'f1', name: 'Old', order: 0 });
    await svc.putFolder({ id: 'f1', name: 'New', order: 0 });
    const folders = await svc.listFolders();
    expect(folders).toEqual([{ id: 'f1', name: 'New', order: 0 }]);
  });
});

import type { OfflineSymbol } from './offline-catalog';

function offlineSymbol(p: Partial<OfflineSymbol> = {}): OfflineSymbol {
  return {
    symbol: 'XAUUSD',
    descripcion: '',
    categoria: 'Mis CSV',
    coverage: [{ tf: 'H1', desde: 1000, hasta: 8200, velas: 3 }],
    createdAt: 1,
    lastModified: 1,
    ...p,
  };
}

describe('WorkspaceDbService — symbols catalog (v4)', () => {
  it('putSymbol + getSymbol round-trip', async () => {
    const sym = offlineSymbol({ symbol: 'EURUSD' });
    await svc.putSymbol(sym);
    expect(await svc.getSymbol('EURUSD')).toEqual(sym);
  });

  it('getSymbol returns undefined for unknown symbol', async () => {
    expect(await svc.getSymbol('NOPE')).toBeUndefined();
  });

  it('listSymbols returns all catalog entries sorted by symbol', async () => {
    await svc.putSymbol(offlineSymbol({ symbol: 'XAUUSD' }));
    await svc.putSymbol(offlineSymbol({ symbol: 'EURUSD' }));
    await svc.putSymbol(offlineSymbol({ symbol: 'GBPUSD' }));
    const list = await svc.listSymbols();
    expect(list.map((s) => s.symbol)).toEqual(['EURUSD', 'GBPUSD', 'XAUUSD']);
  });

  it('listSymbols is empty by default', async () => {
    expect(await svc.listSymbols()).toEqual([]);
  });

  it('removeSymbol cascades catalog + meta + series', async () => {
    await svc.putSymbol(offlineSymbol({ symbol: 'XAUUSD' }));
    await svc.putMeta(workspaceMeta({ symbol: 'XAUUSD' }));
    await svc.putSeries('XAUUSD', 'H1', series(3));
    await svc.removeSymbol('XAUUSD');
    expect(await svc.getSymbol('XAUUSD')).toBeUndefined();
    expect(await svc.getMeta('XAUUSD')).toBeUndefined();
    expect(await svc.getSeriesInfo('XAUUSD', 'H1')).toBeNull();
  });
});

describe('WorkspaceDbService — v1 → v3 migration', () => {
  it('migrates a legacy v1 workspaces store into meta + series on v2 open', async () => {
    // 1. Pre-seed a v1 database with a whole-workspace record in a 'workspaces' store
    const legacyWorkspace = {
      symbol: 'GBPUSD',
      series: { H1: series(3) },
      files: { H1: 'gbpusd_h1.csv' },
      activeTf: 'H1',
      currentTime: 7200,
      drawings: [],
      trading: defaultTradingData(),
      sessions: [],
      lastModified: 999,
    };

    await new Promise<void>((resolve, reject) => {
      const openReq = indexedDB.open(DB_NAME, 1);
      openReq.onupgradeneeded = () => {
        openReq.result.createObjectStore('workspaces', { keyPath: 'symbol' });
      };
      openReq.onsuccess = () => {
        const db = openReq.result;
        const tx = db.transaction('workspaces', 'readwrite');
        tx.objectStore('workspaces').put(legacyWorkspace);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      openReq.onerror = () => reject(openReq.error);
    });

    // 2. Instantiate the v2 service — it opens v2 and triggers onupgradeneeded
    const svc2 = new WorkspaceDbService();

    // 3. The migration should have populated meta and series
    const ws = await svc2.getWorkspace('GBPUSD');
    expect(ws).toBeDefined();
    expect(ws!.symbol).toBe('GBPUSD');
    expect(ws!.activeTf).toBe('H1');
    expect(ws!.currentTime).toBe(7200);
    expect(ws!.series['H1']).toHaveLength(3);

    const meta = await svc2.getMeta('GBPUSD');
    expect(meta).toBeDefined();
    expect(meta!.files).toEqual({ H1: 'gbpusd_h1.csv' });

    // 'workspaces' store should be gone (v2 only has 'meta' and 'series')
    const info = await svc2.getSeriesInfo('GBPUSD', 'H1');
    expect(info!.count).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// v5: datasets + candles stores
// ---------------------------------------------------------------------------

const DB_NAME_V5 = 'emulador-workspaces';

/** Opens the raw IndexedDB after the service has warmed it up at v5. */
async function rawDb(svcInstance: WorkspaceDbService): Promise<IDBDatabase> {
  // Trigger a no-op operation so the service opens (and upgrades) the DB first
  await svcInstance.listMetas();
  return new Promise<IDBDatabase>((resolve, reject) => {
    // Open at the same version the service uses (5) so fake-indexeddb does
    // not try to upgrade or block on an in-progress transaction.
    const req = indexedDB.open(DB_NAME_V5, 5);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    // Should never fire since service already upgraded, but guard for safety
    req.onupgradeneeded = () =>
      reject(new Error('rawDb: unexpected upgrade — service should already be at v5'));
  });
}

describe('WorkspaceDbService — v5 schema: datasets store', () => {
  it('objectStoreNames contains datasets after opening at v5', async () => {
    const db = await rawDb(svc);
    const names = Array.from(db.objectStoreNames);
    db.close();
    expect(names).toContain('datasets');
  });

  it('datasets store has keyPath "id"', async () => {
    const db = await rawDb(svc);
    const tx = db.transaction('datasets', 'readonly');
    const store = tx.objectStore('datasets');
    expect(store.keyPath).toBe('id');
    db.close();
  });

  it('datasets store has compound index by_symbol_tf_year on [symbol, timeframe, year]', async () => {
    const db = await rawDb(svc);
    const tx = db.transaction('datasets', 'readonly');
    const idx = tx.objectStore('datasets').index('by_symbol_tf_year');
    expect(Array.from(idx.keyPath as string[])).toEqual(['symbol', 'timeframe', 'year']);
    db.close();
  });
});

describe('WorkspaceDbService — v5 schema: candles store', () => {
  it('objectStoreNames contains candles after opening at v5', async () => {
    const db = await rawDb(svc);
    const names = Array.from(db.objectStoreNames);
    db.close();
    expect(names).toContain('candles');
  });

  it('candles store has keyPath "id" and autoIncrement true', async () => {
    const db = await rawDb(svc);
    const tx = db.transaction('candles', 'readonly');
    const store = tx.objectStore('candles');
    expect(store.keyPath).toBe('id');
    expect(store.autoIncrement).toBe(true);
    db.close();
  });

  it('candles store has compound index by_symbol_tf_time on [symbol, timeframe, time]', async () => {
    const db = await rawDb(svc);
    const tx = db.transaction('candles', 'readonly');
    const idx = tx.objectStore('candles').index('by_symbol_tf_time');
    expect(Array.from(idx.keyPath as string[])).toEqual(['symbol', 'timeframe', 'time']);
    db.close();
  });
});

describe('WorkspaceDbService — v5 schema: all existing stores still present', () => {
  it('still contains meta, series, folders, symbols alongside new stores', async () => {
    const db = await rawDb(svc);
    const names = Array.from(db.objectStoreNames);
    db.close();
    expect(names).toContain('meta');
    expect(names).toContain('series');
    expect(names).toContain('folders');
    expect(names).toContain('symbols');
    expect(names).toContain('datasets');
    expect(names).toContain('candles');
    expect(names).toHaveLength(6);
  });
});

describe('WorkspaceDbService — v4→v5 upgrade: data written at v4 is readable after v5 open', () => {
  it('v4→v5 upgrade path: data written at v4 is readable after v5 open', async () => {
    // Delete the database first to avoid VersionError from a lingering v5 connection
    await new Promise<void>((resolve) => {
      const del = indexedDB.deleteDatabase(DB_NAME_V5);
      del.onsuccess = () => resolve();
      del.onerror = () => resolve();
      del.onblocked = () => resolve();
    });

    // 1. Seed a v4 database directly (only 4 stores: meta, series, folders, symbols)
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME_V5, 4);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('meta'))
          db.createObjectStore('meta', { keyPath: 'symbol' });
        if (!db.objectStoreNames.contains('series'))
          db.createObjectStore('series', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('folders'))
          db.createObjectStore('folders', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('symbols'))
          db.createObjectStore('symbols', { keyPath: 'symbol' });
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(['meta', 'series'], 'readwrite');
        const metaRecord = workspaceMeta({ symbol: 'ETHUSD' });
        tx.objectStore('meta').put(metaRecord);
        tx.objectStore('series').put({
          key: 'ETHUSD|H1',
          symbol: 'ETHUSD',
          tf: 'H1',
          candles: series(3),
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });

    // 2. Open at v5 via the service — should trigger upgrade and add datasets+candles
    const svc5 = new WorkspaceDbService();
    const ws = await svc5.getWorkspace('ETHUSD');
    expect(ws).toBeDefined();
    expect(ws!.symbol).toBe('ETHUSD');
    expect(ws!.series['H1']).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// v5: datasets-store accessors (Task 6)
// ---------------------------------------------------------------------------

import type { CandleRecord, DatasetRecord } from './market-data-db';
import { CANDLES_STORE } from './market-data-db';

function datasetRecord(p: Partial<DatasetRecord> = {}): DatasetRecord {
  return {
    id: 'XAUUSD|M1|2024',
    symbol: 'XAUUSD',
    timeframe: 'M1',
    year: '2024',
    size: 1234,
    etag: 'etag-2024',
    updatedAt: '2026-06-18T12:00:00Z',
    ...p,
  };
}

/** Adds candle rows directly to the candles store (autoIncrement id). */
async function seedCandles(records: Omit<CandleRecord, 'id'>[]): Promise<void> {
  await svc.listMetas(); // ensure schema is open at v5
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 5);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => reject(new Error('unexpected upgrade'));
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CANDLES_STORE, 'readwrite');
      const store = tx.objectStore(CANDLES_STORE);
      for (const r of records) store.add(r);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function countCandlesFor(symbol: string, timeframe: string): Promise<number> {
  return (await svc.listCandles(symbol, timeframe)).length;
}

describe('WorkspaceDbService — datasets store accessors (v5)', () => {
  it('putDataset + getDataset round-trip', async () => {
    const rec = datasetRecord();
    await svc.putDataset(rec);
    expect(await svc.getDataset(rec.id)).toEqual(rec);
  });

  it('getDataset returns undefined for an unknown id', async () => {
    expect(await svc.getDataset('NOPE|M1|2000')).toBeUndefined();
  });

  it('putDataset upserts on the same id', async () => {
    await svc.putDataset(datasetRecord({ etag: 'old' }));
    await svc.putDataset(datasetRecord({ etag: 'new' }));
    const got = await svc.getDataset('XAUUSD|M1|2024');
    expect(got!.etag).toBe('new');
    expect(await svc.listDatasets()).toHaveLength(1);
  });

  it('listDatasets returns all records sorted by id', async () => {
    await svc.putDataset(datasetRecord({ id: 'XAUUSD|M1|2024', year: '2024' }));
    await svc.putDataset(datasetRecord({ id: 'XAUUSD|M1|2023', year: '2023' }));
    await svc.putDataset(datasetRecord({ id: 'XAUUSD|H1|all', timeframe: 'H1', year: 'all' }));
    const list = await svc.listDatasets();
    expect(list.map((d) => d.id)).toEqual(['XAUUSD|H1|all', 'XAUUSD|M1|2023', 'XAUUSD|M1|2024']);
  });

  it('listDatasets is empty by default', async () => {
    expect(await svc.listDatasets()).toEqual([]);
  });

  it('deleteDataset removes a record', async () => {
    await svc.putDataset(datasetRecord());
    await svc.deleteDataset('XAUUSD|M1|2024');
    expect(await svc.getDataset('XAUUSD|M1|2024')).toBeUndefined();
  });
});

describe('WorkspaceDbService — clearDatasetCandles (re-ingestion dedup)', () => {
  it('removes only the matching symbol+timeframe candles', async () => {
    await seedCandles([
      { symbol: 'XAUUSD', timeframe: 'M1', time: 1, open: 1, high: 1, low: 1, close: 1 },
      { symbol: 'XAUUSD', timeframe: 'M1', time: 2, open: 1, high: 1, low: 1, close: 1 },
      { symbol: 'XAUUSD', timeframe: 'H1', time: 3, open: 1, high: 1, low: 1, close: 1 },
      { symbol: 'EURUSD', timeframe: 'M1', time: 4, open: 1, high: 1, low: 1, close: 1 },
    ]);

    await svc.clearDatasetCandles('XAUUSD', 'M1');

    expect(await countCandlesFor('XAUUSD', 'M1')).toBe(0);
    // siblings untouched
    expect(await countCandlesFor('XAUUSD', 'H1')).toBe(1);
    expect(await countCandlesFor('EURUSD', 'M1')).toBe(1);
  });

  it('is a no-op when there are no matching candles', async () => {
    await seedCandles([
      { symbol: 'EURUSD', timeframe: 'M1', time: 1, open: 1, high: 1, low: 1, close: 1 },
    ]);
    await svc.clearDatasetCandles('XAUUSD', 'M1');
    expect(await countCandlesFor('EURUSD', 'M1')).toBe(1);
  });

  it('does not let an M1 query clear M15 candles (compound-index prefix safety)', async () => {
    await seedCandles([
      { symbol: 'XAUUSD', timeframe: 'M1', time: 1, open: 1, high: 1, low: 1, close: 1 },
      { symbol: 'XAUUSD', timeframe: 'M15', time: 2, open: 1, high: 1, low: 1, close: 1 },
    ]);
    await svc.clearDatasetCandles('XAUUSD', 'M1');
    expect(await countCandlesFor('XAUUSD', 'M1')).toBe(0);
    expect(await countCandlesFor('XAUUSD', 'M15')).toBe(1);
  });
});
