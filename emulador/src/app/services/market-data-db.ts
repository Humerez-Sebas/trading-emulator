/**
 * Angular-free shared constants and record types for the workspace IndexedDB.
 *
 * This module is imported BOTH by the main-thread `WorkspaceDbService`
 * (`@Injectable`) AND by the off-thread Parquet ingestion worker
 * (`workers/parquet.worker.ts`). A Web Worker bundle MUST NOT pull in
 * `@angular/core`, so anything the worker needs lives here as plain TypeScript
 * with zero Angular imports.
 *
 * The schema itself (object stores, indexes, version upgrades) is owned by
 * `WorkspaceDbService` on the main thread — this file only declares the names,
 * version and row shapes both sides agree on.
 */

/** IndexedDB database name shared by the app and the ingestion worker. */
export const DB_NAME = 'emulador-workspaces';

/** Current schema version. Owned/upgraded by the main thread only. */
export const DB_VERSION = 6;

// ---- object store names ----
export const META_STORE = 'meta';
export const SERIES_STORE = 'series';
export const FOLDERS_STORE = 'folders';
export const DATASETS_STORE = 'datasets';
export const CANDLES_STORE = 'candles';
export const SYNC_STORE = 'sync';
/** v1 single-store name, migrated away on upgrade. */
export const LEGACY_STORE = 'workspaces';

// ---- index names ----
/** Compound index on the `datasets` store: `[symbol, timeframe, year]`. */
export const DATASETS_BY_SYMBOL_TF_YEAR = 'by_symbol_tf_year';
/** Compound index on the `candles` store: `[symbol, timeframe, time]`. */
export const CANDLES_BY_SYMBOL_TF_TIME = 'by_symbol_tf_time';

/**
 * R2/Parquet dataset manifest entry.
 * `id` is the composite key `` `${symbol}|${timeframe}|${year}` ``
 * (e.g. `'XAUUSD|M1|2024'`). For timeframes with no calendar partition
 * (H1, D1) use the sentinel `year: 'all'` matching the `all.parquet`
 * manifest file.
 */
export interface DatasetRecord {
  /** `${symbol}|${timeframe}|${year}` — composite primary key. */
  id: string;
  symbol: string;
  timeframe: string;
  /** Calendar year string (e.g. `'2024'`) or `'all'` for H1/D1 partitions. */
  year: string;
  /** File size in bytes from the R2 manifest (used for cache invalidation). */
  size: number;
  /** ETag from the R2 manifest (used for cache invalidation). */
  etag: string;
  /** ISO-8601 timestamp of last manifest update. */
  updatedAt: string;
}

/** Partition key for timeframes that ship as a single file (H1/D1). */
export const ALL_PARTITION = 'all';

/**
 * Inclusive epoch-second bounds of ONE dataset partition, mirroring how
 * `pipeline/parquet_builder.py` splits M1: by the UTC calendar year of the
 * candle timestamp. {@link ALL_PARTITION} spans the whole series.
 *
 * Scoping matters because the `candles` store is shared per (symbol,
 * timeframe): clearing a partition without these bounds also deletes the
 * sibling years, and those keep a current etag in `datasets`, so nothing ever
 * re-ingests them — the candles are just gone.
 *
 * An unrecognised key falls back to the full range on purpose: over-deleting
 * still guarantees no duplicate rows after a re-ingest, whereas a too-narrow
 * range would leave duplicates behind.
 */
export function partitionTimeBounds(year: string): { from: number; to: number } {
  if (!/^\d{4}$/.test(year)) return { from: -Infinity, to: Infinity };
  const parsed = Number(year);
  return {
    from: Date.UTC(parsed, 0, 1) / 1000,
    to: Date.UTC(parsed + 1, 0, 1) / 1000 - 1,
  };
}

/**
 * Individual candle row from a R2/Parquet file.
 * `id` is the auto-increment primary key — omit it on insert.
 */
export interface CandleRecord {
  /** Auto-increment primary key (absent on insert). */
  id?: number;
  symbol: string;
  timeframe: string;
  /** Unix timestamp in seconds. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}
