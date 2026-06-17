/**
 * TDD specs for Task 5: MarketDataRepository abstraction + factory.
 *
 * RED → GREEN cycle:
 *  1. pickMarketDataRepository — pure factory helper
 *  2. IndexedDbMarketDataRepository — reads the `candles` store via compound index
 *  3. CsvMarketDataRepository — delegates to WorkspaceDbService.getWorkspace
 */
import 'fake-indexeddb/auto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceDbService } from '../services/workspace-db.service';
import { workspaceDbStub } from '../testing/workspace-db.stub';
import { series } from '../testing/fixtures';
import { Candle } from '../models';
import {
  DB_NAME,
  CANDLES_STORE,
  CANDLES_BY_SYMBOL_TF_TIME,
  CandleRecord,
} from '../services/market-data-db';

// ---- imports under test (will fail until implemented) ----
import { pickMarketDataRepository } from './market-data.repository';
import { IndexedDbMarketDataRepository } from './indexed-db.repository';
import { CsvMarketDataRepository } from './csv-legacy.repository';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Opens (or creates) the shared DB at v5 with the full schema, seeds the
 * `candles` store with the given records, and returns the open db handle.
 *
 * We do NOT use WorkspaceDbService here to avoid holding a service-owned
 * connection that would block subsequent `deleteDatabase` calls between tests.
 * Instead we apply the minimal schema inline — matching `WorkspaceDbService`'s
 * `onupgradeneeded` but without the migration logic that isn't needed in tests.
 */
async function seedCandlesDb(records: Omit<CandleRecord, 'id'>[]): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 5);

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
      if (!db.objectStoreNames.contains('datasets')) {
        const datasets = db.createObjectStore('datasets', { keyPath: 'id' });
        datasets.createIndex('by_symbol_tf_year', ['symbol', 'timeframe', 'year'], { unique: false });
      }
      if (!db.objectStoreNames.contains(CANDLES_STORE)) {
        const candles = db.createObjectStore(CANDLES_STORE, { keyPath: 'id', autoIncrement: true });
        candles.createIndex(CANDLES_BY_SYMBOL_TF_TIME, ['symbol', 'timeframe', 'time'], { unique: false });
      }
    };

    req.onsuccess = () => {
      const db = req.result;
      if (!records.length) {
        resolve(db);
        return;
      }
      const tx = db.transaction(CANDLES_STORE, 'readwrite');
      const store = tx.objectStore(CANDLES_STORE);
      for (const r of records) store.add(r);
      tx.oncomplete = () => resolve(db);
      tx.onerror = () => reject(tx.error);
    };

    req.onerror = () => reject(req.error);
  });
}

// ---------------------------------------------------------------------------
// 1. pickMarketDataRepository — factory helper
// ---------------------------------------------------------------------------

describe('pickMarketDataRepository', () => {
  const csv = new CsvMarketDataRepository({} as WorkspaceDbService);
  const idb = new IndexedDbMarketDataRepository();

  it('returns the CSV implementation when dataSource is "csv"', () => {
    const result = pickMarketDataRepository('csv', { idb, csv });
    expect(result).toBe(csv);
  });

  it('returns the IndexedDb implementation when dataSource is "r2"', () => {
    const result = pickMarketDataRepository('r2', { idb, csv });
    expect(result).toBe(idb);
  });
});

// ---------------------------------------------------------------------------
// 2. IndexedDbMarketDataRepository
// ---------------------------------------------------------------------------

describe('IndexedDbMarketDataRepository.getCandles', () => {
  let db: IDBDatabase;

  const XAUUSD_M1: Omit<CandleRecord, 'id'>[] = [
    { symbol: 'XAUUSD', timeframe: 'M1', time: 3000, open: 1, high: 2, low: 0.5, close: 1.5 },
    { symbol: 'XAUUSD', timeframe: 'M1', time: 1000, open: 2, high: 3, low: 1, close: 2.5 },
    { symbol: 'XAUUSD', timeframe: 'M1', time: 2000, open: 3, high: 4, low: 2, close: 3.5 },
  ];
  const XAUUSD_H1: Omit<CandleRecord, 'id'>[] = [
    { symbol: 'XAUUSD', timeframe: 'H1', time: 9000, open: 10, high: 11, low: 9, close: 10.5 },
  ];
  const EURUSD_M1: Omit<CandleRecord, 'id'>[] = [
    { symbol: 'EURUSD', timeframe: 'M1', time: 5000, open: 1.1, high: 1.2, low: 1.0, close: 1.15 },
  ];
  const XAUUSD_M15: Omit<CandleRecord, 'id'>[] = [
    { symbol: 'XAUUSD', timeframe: 'M15', time: 7000, open: 5, high: 6, low: 4, close: 5.5 },
  ];

  // Seed once for the whole describe block — each test gets a fresh repo
  // instance (fresh dbPromise), but reads the same seeded data.
  beforeAll(async () => {
    db = await seedCandlesDb([...XAUUSD_M1, ...XAUUSD_H1, ...EURUSD_M1, ...XAUUSD_M15]);
  });

  afterAll(() => {
    db?.close();
  });

  it('returns only candles for the requested symbol+timeframe, sorted by time', async () => {
    const repo = new IndexedDbMarketDataRepository();
    const candles = await repo.getCandles('XAUUSD', 'M1');

    expect(candles).toHaveLength(3);
    // Sorted ascending by time
    expect(candles.map((c) => c.time)).toEqual([1000, 2000, 3000]);
  });

  it('does not leak id, symbol, or timeframe fields into Candle results', async () => {
    const repo = new IndexedDbMarketDataRepository();
    const [first] = await repo.getCandles('XAUUSD', 'M1');

    expect(first).not.toHaveProperty('id');
    expect(first).not.toHaveProperty('symbol');
    expect(first).not.toHaveProperty('timeframe');
    expect(Object.keys(first).sort()).toEqual(['close', 'high', 'low', 'open', 'time']);
  });

  it('does not return candles from a different timeframe of the same symbol', async () => {
    const repo = new IndexedDbMarketDataRepository();
    const candles = await repo.getCandles('XAUUSD', 'M1');

    const times = candles.map((c) => c.time);
    // H1 candle time 9000 must NOT appear
    expect(times).not.toContain(9000);
  });

  it('does not return candles from a different symbol with the same timeframe', async () => {
    const repo = new IndexedDbMarketDataRepository();
    const candles = await repo.getCandles('XAUUSD', 'M1');

    const times = candles.map((c) => c.time);
    // EURUSD M1 candle time 5000 must NOT appear
    expect(times).not.toContain(5000);
  });

  it('maps CandleRecord fields to Candle correctly', async () => {
    const repo = new IndexedDbMarketDataRepository();
    const candles = await repo.getCandles('XAUUSD', 'M1');

    const first = candles[0]; // time 1000 after sort
    expect(first).toEqual<Candle>({ time: 1000, open: 2, high: 3, low: 1, close: 2.5 });
  });

  it('returns empty array when symbol+timeframe has no rows', async () => {
    const repo = new IndexedDbMarketDataRepository();
    const candles = await repo.getCandles('UNKNOWN', 'M1');
    expect(candles).toEqual([]);
  });

  it('cross-prefix isolation: M1 query does not bleed into M15 records', async () => {
    // 'M1' is a string prefix of 'M15'; this test proves the compound-index
    // key range [symbol, 'M1', -Inf]..[symbol, 'M1', +Inf] does NOT match
    // the XAUUSD M15 candle (time=7000) seeded alongside the M1 data.
    const repo = new IndexedDbMarketDataRepository();
    const candles = await repo.getCandles('XAUUSD', 'M1');

    const times = candles.map((c) => c.time);
    expect(times).not.toContain(7000); // M15 candle must be excluded
    expect(candles).toHaveLength(3);   // only the three M1 candles
  });
});

// ---------------------------------------------------------------------------
// 3. CsvMarketDataRepository
// ---------------------------------------------------------------------------

describe('CsvMarketDataRepository.getCandles', () => {
  let stub: ReturnType<typeof workspaceDbStub>;

  beforeEach(() => {
    stub = workspaceDbStub();
  });

  it('returns series[tf] from the workspace when it exists', async () => {
    const candles = series(5, 0, 60);
    stub.getWorkspace!.mockResolvedValue({
      symbol: 'XAUUSD',
      series: { M1: candles },
      files: {},
      activeTf: null,
      currentTime: 0,
      drawings: [],
      sessions: [],
      trading: {} as never,
      lastModified: 1,
    });

    const repo = new CsvMarketDataRepository(stub as unknown as WorkspaceDbService);
    const result = await repo.getCandles('XAUUSD', 'M1');
    expect(result).toEqual(candles);
    expect(stub.getWorkspace).toHaveBeenCalledWith('XAUUSD');
  });

  it('returns empty array when the timeframe is not present in the series', async () => {
    stub.getWorkspace!.mockResolvedValue({
      symbol: 'XAUUSD',
      series: {},
      files: {},
      activeTf: null,
      currentTime: 0,
      drawings: [],
      sessions: [],
      trading: {} as never,
      lastModified: 1,
    });

    const repo = new CsvMarketDataRepository(stub as unknown as WorkspaceDbService);
    const result = await repo.getCandles('XAUUSD', 'H1');
    expect(result).toEqual([]);
  });

  it('returns empty array when the workspace is not found', async () => {
    stub.getWorkspace!.mockResolvedValue(undefined);

    const repo = new CsvMarketDataRepository(stub as unknown as WorkspaceDbService);
    const result = await repo.getCandles('NOPE', 'M1');
    expect(result).toEqual([]);
  });
});
