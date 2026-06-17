/**
 * Pure, Angular-free ingestion logic for the Parquet worker.
 *
 * Two responsibilities, both unit-tested without a browser:
 *  - `arrowTableToCandles`: decoded Apache Arrow table -> `CandleRecord[]`.
 *  - `bulkInsertCandles`: chunked bulk-insert into the `candles` IndexedDB
 *    store, one readwrite transaction per chunk.
 *
 * This module imports neither `@angular/core`, `parquet-wasm`, nor any worker
 * globals, so it runs under vitest with `fake-indexeddb` exactly as it does in
 * the worker. The WASM/worker glue lives in `parquet.worker.ts`.
 */

import type { Table } from 'apache-arrow';
import { CANDLES_STORE, DB_NAME, type CandleRecord } from '../services/market-data-db';

/**
 * Converts a decoded Apache Arrow table (columns `time`, `open`, `high`,
 * `low`, `close` — matching `backend/parquet_builder.py`) into insert-shaped
 * `CandleRecord`s tagged with `symbol`/`timeframe`. No `id` is set; the
 * `candles` store auto-increments it.
 *
 * `time` is stored as int64 (epoch seconds) in Parquet, so Arrow surfaces it
 * as `bigint`; it is coerced to a JS `number` (epoch seconds fit safely).
 */
export function arrowTableToCandles(
  table: Table,
  symbol: string,
  timeframe: string,
): CandleRecord[] {
  const timeCol = table.getChild('time');
  const openCol = table.getChild('open');
  const highCol = table.getChild('high');
  const lowCol = table.getChild('low');
  const closeCol = table.getChild('close');

  if (!timeCol || !openCol || !highCol || !lowCol || !closeCol) {
    throw new Error(
      'arrowTableToCandles: tabla Parquet sin las columnas esperadas (time/open/high/low/close).',
    );
  }

  const n = table.numRows;
  const out: CandleRecord[] = new Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = {
      symbol,
      timeframe,
      time: Number(timeCol.get(i)),
      open: Number(openCol.get(i)),
      high: Number(highCol.get(i)),
      low: Number(lowCol.get(i)),
      close: Number(closeCol.get(i)),
    };
  }
  return out;
}

/**
 * Opens the shared IndexedDB **without a version number** so the worker never
 * triggers a schema upgrade — the main thread (Task 3) owns the schema. If the
 * `candles` store is absent, the schema has not been initialized yet and we
 * reject rather than attempt to create it.
 */
function openExistingDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME); // no version => never upgrades
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CANDLES_STORE)) {
        db.close();
        reject(
          new Error(
            `IndexedDB no inicializado: falta el store "${CANDLES_STORE}". ` +
              'Abre la app (hilo principal) para crear el esquema antes de ingerir Parquet.',
          ),
        );
        return;
      }
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    // A fresh DB with no version would be created empty; treat that as
    // uninitialized too. (Reached only if the store check above is bypassed.)
    req.onupgradeneeded = () => {
      req.transaction?.abort();
    };
  });
}

/** Inserts one chunk in a single readwrite transaction, resolving on commit. */
function insertChunk(db: IDBDatabase, chunk: CandleRecord[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CANDLES_STORE, 'readwrite');
    const store = tx.objectStore(CANDLES_STORE);
    for (const record of chunk) store.put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('bulkInsertCandles: transacción abortada.'));
  });
}

/**
 * Bulk-inserts `records` into the `candles` store in chunks of `chunkSize`,
 * one readwrite transaction per chunk. Each transaction is awaited before the
 * next starts, so a large import never monopolizes the event loop. Returns the
 * total number of records inserted.
 *
 * @param records    Insert-shaped candle rows (no `id`).
 * @param chunkSize  Rows per transaction (default 10,000).
 * @param onProgress Optional callback invoked once per committed chunk with the
 *                   running total inserted so far.
 */
export async function bulkInsertCandles(
  records: CandleRecord[],
  chunkSize = 10_000,
  onProgress?: (insertedSoFar: number) => void,
): Promise<number> {
  if (records.length === 0) return 0;
  if (chunkSize <= 0) throw new Error('bulkInsertCandles: chunkSize debe ser > 0.');

  const db = await openExistingDb();
  try {
    let inserted = 0;
    for (let start = 0; start < records.length; start += chunkSize) {
      const chunk = records.slice(start, start + chunkSize);
      await insertChunk(db, chunk);
      inserted += chunk.length;
      onProgress?.(inserted);
    }
    return inserted;
  } finally {
    db.close();
  }
}
