import { Candle, Timeframe } from '../models';
import {
  CANDLES_BY_SYMBOL_TF_TIME,
  CANDLES_STORE,
  CandleRecord,
  DB_NAME,
  DB_VERSION,
} from '../services/market-data-db';
import { MarketDataRepository } from './market-data.repository';

/**
 * Reads candle data from the `candles` IndexedDB store populated by the
 * R2/Parquet ingestion worker (Task 3/4).
 *
 * Opens the database without triggering an upgrade (schema is owned by
 * `WorkspaceDbService`); uses the compound index `by_symbol_tf_time` to
 * efficiently retrieve only the rows matching the requested symbol+timeframe.
 */
export class IndexedDbMarketDataRepository extends MarketDataRepository {
  private dbPromise: Promise<IDBDatabase> | null = null;

  /** Opens the shared IndexedDB at the current version (no schema changes). */
  private open(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        // onupgradeneeded is not expected here (WorkspaceDbService owns the
        // schema), but we intentionally do NOT reject on it — if the service
        // initialised the DB in the same tick, the open may still deliver
        // this event in some environments; we let onsuccess follow normally.
      });
    }
    return this.dbPromise;
  }

  /** @inheritdoc */
  async getCandles(symbol: string, timeframe: Timeframe): Promise<Candle[]> {
    const db = await this.open();
    return new Promise<Candle[]>((resolve, reject) => {
      const tx = db.transaction(CANDLES_STORE, 'readonly');
      const index = tx.objectStore(CANDLES_STORE).index(CANDLES_BY_SYMBOL_TF_TIME);

      // Bound: [symbol, timeframe, -Infinity] ≤ key ≤ [symbol, timeframe, +Infinity]
      const range = IDBKeyRange.bound(
        [symbol, timeframe, -Infinity],
        [symbol, timeframe, +Infinity],
      );

      const req = index.getAll(range);
      req.onsuccess = () => {
        const records: CandleRecord[] = req.result;
        const candles: Candle[] = records
          .map(({ time, open, high, low, close }) => ({ time, open, high, low, close }))
          .sort((a, b) => a.time - b.time);
        resolve(candles);
      };
      req.onerror = () => reject(req.error);
    });
  }
}
