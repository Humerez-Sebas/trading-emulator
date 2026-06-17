/// <reference lib="webworker" />

/**
 * Off-thread Parquet ingestion worker.
 *
 * Receives the raw bytes of a downloaded Parquet file, decodes them with
 * `parquet-wasm` into an Apache Arrow table, maps the rows to `CandleRecord`s
 * and bulk-inserts them into the `candles` IndexedDB store — all off the UI
 * thread. It posts incremental progress and a final `done`/`error` message.
 *
 * This shell is intentionally THIN: all testable logic lives in
 * `./candles-writer` (pure, unit-tested with `fake-indexeddb`). The
 * `parquet-wasm` + WASM glue here is validated IN-BROWSER in Task 12, not in
 * unit tests, which is why it is loaded via a dynamic `import()` so its WASM
 * never lands in the main app bundle.
 */

import { arrowTableToCandles, bulkInsertCandles } from './candles-writer';

/** Message posted INTO the worker to start an ingestion. */
export interface ParquetWorkerRequest {
  /** Raw bytes of one downloaded `.parquet` file. */
  buffer: ArrayBuffer;
  symbol: string;
  timeframe: string;
}

/** Messages the worker posts back OUT. */
export type ParquetWorkerResponse =
  | { type: 'progress'; inserted: number; total: number }
  | { type: 'done'; inserted: number }
  | { type: 'error'; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

/**
 * Lazily-initialized `parquet-wasm`. The dynamic import keeps the WASM out of
 * the main bundle; `initWasm()` instantiates the WebAssembly module once.
 */
let parquetModulePromise: Promise<typeof import('parquet-wasm')> | null = null;

async function getParquet(): Promise<typeof import('parquet-wasm')> {
  if (!parquetModulePromise) {
    parquetModulePromise = (async () => {
      const mod = await import('parquet-wasm');
      // Default export instantiates the WebAssembly context (idempotent enough
      // for our single-init use; guarded by the cached promise above).
      await mod.default();
      return mod;
    })();
  }
  return parquetModulePromise;
}

async function ingest(req: ParquetWorkerRequest): Promise<void> {
  const { buffer, symbol, timeframe } = req;

  // Decode Parquet -> Arrow. parquet-wasm 0.7: readParquet returns a wasm
  // Table; bridge to apache-arrow via an Arrow IPC stream.
  const { readParquet } = await getParquet();
  const { tableFromIPC } = await import('apache-arrow');
  const wasmTable = readParquet(new Uint8Array(buffer));
  const table = tableFromIPC(wasmTable.intoIPCStream());

  const records = arrowTableToCandles(table, symbol, timeframe);
  const total = records.length;

  const inserted = await bulkInsertCandles(records, 10_000, (insertedSoFar) => {
    post({ type: 'progress', inserted: insertedSoFar, total });
  });

  post({ type: 'done', inserted });
}

function post(message: ParquetWorkerResponse): void {
  ctx.postMessage(message);
}

ctx.addEventListener('message', (event: MessageEvent<ParquetWorkerRequest>) => {
  ingest(event.data).catch((err: unknown) => {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  });
});
