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
