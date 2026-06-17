import 'fake-indexeddb/auto';
import { tableFromArrays } from 'apache-arrow';
import { beforeEach, describe, expect, it } from 'vitest';
import { WorkspaceDbService } from '../services/workspace-db.service';
import { CANDLES_STORE, DB_NAME, type CandleRecord } from '../services/market-data-db';
import { arrowTableToCandles, bulkInsertCandles } from './candles-writer';

// ---------------------------------------------------------------------------
// arrowTableToCandles — pure, no IndexedDB
// ---------------------------------------------------------------------------

describe('arrowTableToCandles', () => {
  it('maps each Arrow row to a CandleRecord with the given symbol/timeframe and no id', () => {
    const table = tableFromArrays({
      time: BigInt64Array.from([1000n, 2000n, 3000n]),
      open: Float64Array.from([1.1, 2.1, 3.1]),
      high: Float64Array.from([1.5, 2.5, 3.5]),
      low: Float64Array.from([1.0, 2.0, 3.0]),
      close: Float64Array.from([1.4, 2.4, 3.4]),
    });

    const candles = arrowTableToCandles(table, 'XAUUSD', 'H1');

    expect(candles).toEqual([
      { symbol: 'XAUUSD', timeframe: 'H1', time: 1000, open: 1.1, high: 1.5, low: 1.0, close: 1.4 },
      { symbol: 'XAUUSD', timeframe: 'H1', time: 2000, open: 2.1, high: 2.5, low: 2.0, close: 2.4 },
      { symbol: 'XAUUSD', timeframe: 'H1', time: 3000, open: 3.1, high: 3.5, low: 3.0, close: 3.4 },
    ]);
    // no id on insert-shaped records
    expect(candles.every((c) => !('id' in c))).toBe(true);
  });

  it('coerces bigint epoch-seconds time to a JS number', () => {
    const table = tableFromArrays({
      time: BigInt64Array.from([1_700_000_000n]),
      open: Float64Array.from([1]),
      high: Float64Array.from([2]),
      low: Float64Array.from([0.5]),
      close: Float64Array.from([1.5]),
    });

    const [c] = arrowTableToCandles(table, 'EURUSD', 'M1');
    expect(typeof c.time).toBe('number');
    expect(c.time).toBe(1_700_000_000);
  });

  it('returns an empty array for an empty table', () => {
    const table = tableFromArrays({
      time: BigInt64Array.from([]),
      open: Float64Array.from([]),
      high: Float64Array.from([]),
      low: Float64Array.from([]),
      close: Float64Array.from([]),
    });
    expect(arrowTableToCandles(table, 'XAUUSD', 'D1')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// bulkInsertCandles — IndexedDB via fake-indexeddb
// ---------------------------------------------------------------------------

/** Delete the DB so each test starts clean, then initialize the v5 schema. */
async function resetAndInitSchema(): Promise<void> {
  await new Promise<void>((resolve) => {
    const del = indexedDB.deleteDatabase(DB_NAME);
    del.onsuccess = () => resolve();
    del.onerror = () => resolve();
    del.onblocked = () => resolve();
  });
  // The main thread owns the schema; warm it up via the service (opens at v5).
  await new WorkspaceDbService().listMetas();
}

/** Count rows currently in the candles store. */
async function countCandles(): Promise<number> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  try {
    return await new Promise<number>((resolve, reject) => {
      const req = db.transaction(CANDLES_STORE, 'readonly').objectStore(CANDLES_STORE).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

function synthCandles(n: number, symbol = 'XAUUSD', timeframe = 'M1'): CandleRecord[] {
  const out: CandleRecord[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ symbol, timeframe, time: 1000 + i * 60, open: 1, high: 2, low: 0.5, close: 1.5 });
  }
  return out;
}

describe('bulkInsertCandles', () => {
  beforeEach(async () => {
    await resetAndInitSchema();
  });

  it('persists all records and chunks into 3 transactions for 25k rows @ 10k', async () => {
    const records = synthCandles(25_000);
    const progress: number[] = [];

    const inserted = await bulkInsertCandles(records, 10_000, (done) => progress.push(done));

    expect(inserted).toBe(25_000);
    expect(await countCandles()).toBe(25_000);
    // 25k / 10k => chunks of 10k, 10k, 5k => 3 progress callbacks
    expect(progress).toEqual([10_000, 20_000, 25_000]);
  });

  it('returns 0 and makes no callbacks for an empty input', async () => {
    const progress: number[] = [];
    const inserted = await bulkInsertCandles([], 10_000, () => progress.push(1));
    expect(inserted).toBe(0);
    expect(progress).toEqual([]);
    expect(await countCandles()).toBe(0);
  });

  it('handles a single short chunk (fewer than chunkSize rows)', async () => {
    const inserted = await bulkInsertCandles(synthCandles(3), 10_000);
    expect(inserted).toBe(3);
    expect(await countCandles()).toBe(3);
  });

  it('rejects with a clear error when the candles store is missing (DB not initialized)', async () => {
    // Delete and re-create the DB at v5 WITHOUT the candles store to simulate
    // an uninitialized / older schema the worker must not silently corrupt.
    await new Promise<void>((resolve) => {
      const del = indexedDB.deleteDatabase(DB_NAME);
      del.onsuccess = () => resolve();
      del.onerror = () => resolve();
      del.onblocked = () => resolve();
    });
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 5);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('meta', { keyPath: 'symbol' });
      };
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
      req.onerror = () => reject(req.error);
    });

    await expect(bulkInsertCandles(synthCandles(5), 10_000)).rejects.toThrow(
      /IndexedDB no inicializado/i,
    );
  });

  it('rejects with the clear "no inicializado" error when the database does NOT exist at all', async () => {
    // Ensure the DB is completely absent before calling the insert.
    await new Promise<void>((resolve) => {
      const del = indexedDB.deleteDatabase(DB_NAME);
      del.onsuccess = () => resolve();
      del.onerror = () => resolve();
      del.onblocked = () => resolve();
    });

    await expect(bulkInsertCandles(synthCandles(5), 10_000)).rejects.toThrow(
      /IndexedDB no inicializado/i,
    );
  });
});

// ---------------------------------------------------------------------------
// arrowTableToCandles — missing-column error
// ---------------------------------------------------------------------------

describe('arrowTableToCandles missing-column guard', () => {
  it('throws its descriptive error when a required column is absent (no close column)', () => {
    const table = tableFromArrays({
      time: BigInt64Array.from([1000n, 2000n]),
      open: Float64Array.from([1.1, 2.1]),
      high: Float64Array.from([1.5, 2.5]),
      low: Float64Array.from([1.0, 2.0]),
      // close is intentionally omitted
    });

    expect(() => arrowTableToCandles(table, 'XAUUSD', 'H1')).toThrow(
      /tabla Parquet sin las columnas esperadas/i,
    );
  });
});
