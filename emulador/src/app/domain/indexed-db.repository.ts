import { Candle, Timeframe } from '../models';
import {
  CANDLES_BY_SYMBOL_TF_TIME,
  CANDLES_STORE,
  CandleRecord,
  DB_NAME,
} from '../services/market-data-db';
import { MarketDataRepository } from './market-data.repository';

/**
 * Reads candle data from the `candles` IndexedDB store populated by the
 * R2/Parquet ingestion worker (Task 3/4).
 *
 * Opens the database without triggering an upgrade (schema is owned by
 * `WorkspaceDbService`); uses the compound index `by_symbol_tf_time` to
 * efficiently retrieve only the rows matching the requested symbol+timeframe.
 *
 * NOT @Injectable — the factory provider constructs it via `new`; a future
 * direct inject() call would bypass the factory and must be avoided.
 */
export class IndexedDbMarketDataRepository extends MarketDataRepository {
  private dbPromise: Promise<IDBDatabase> | null = null;

  /**
   * Opens the shared IndexedDB WITHOUT a version argument so it never triggers
   * a schema upgrade. Mirrors the safe pattern in `candles-writer.ts`
   * (`openExistingDb`): if the `candles` store is absent the DB has not been
   * initialized yet and we reject rather than create a partial schema.
   */
  private open(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME); // no version => never upgrades
        let upgradeAttempted = false;
        req.onupgradeneeded = () => {
          // A brand-new / absent DB would be created empty here; abort so IDB
          // rolls back the empty creation without leaving a partial schema.
          upgradeAttempted = true;
          req.transaction?.abort();
        };
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
        req.onerror = () => {
          if (upgradeAttempted) {
            reject(
              new Error(
                `IndexedDB no inicializado: falta el store "${CANDLES_STORE}". ` +
                  'Abre la app (hilo principal) para crear el esquema antes de ingerir Parquet.',
              ),
            );
          } else {
            reject(req.error);
          }
        };
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

  /** @inheritdoc */
  async getCoverage(
    symbol: string,
    timeframe: Timeframe,
  ): Promise<{ from: number; to: number } | null> {
    const db = await this.open();
    const range = IDBKeyRange.bound([symbol, timeframe, -Infinity], [symbol, timeframe, +Infinity]);
    const from = await this.edgeTime(db, range, 'next');
    if (from === null) return null;
    const to = await this.edgeTime(db, range, 'prev');
    return { from, to: to ?? from };
  }

  /** The `time` of the first (`next`) or last (`prev`) row in the index range. */
  private edgeTime(
    db: IDBDatabase,
    range: IDBKeyRange,
    dir: 'next' | 'prev',
  ): Promise<number | null> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CANDLES_STORE, 'readonly');
      const req = tx
        .objectStore(CANDLES_STORE)
        .index(CANDLES_BY_SYMBOL_TF_TIME)
        .openCursor(range, dir);
      req.onsuccess = () => {
        const cursor = req.result;
        resolve(cursor ? (cursor.value as CandleRecord).time : null);
      };
      req.onerror = () => reject(req.error);
    });
  }
}
