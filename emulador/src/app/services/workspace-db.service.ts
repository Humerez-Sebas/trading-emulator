import { Injectable } from '@angular/core';
import { Candle, Timeframe } from '../models';
import { SessionFolder } from '../state/trading/trading.models';
import { AssetMeta, Workspace, WorkspaceMeta } from '../state/workspaces/workspaces.models';
import { OfflineSymbol } from './offline-catalog';

const DB_NAME = 'emulador-workspaces';
const DB_VERSION = 4;
const META_STORE = 'meta';
const SERIES_STORE = 'series';
const FOLDERS_STORE = 'folders';
const SYMBOLS_STORE = 'symbols';
const LEGACY_STORE = 'workspaces';

interface SeriesRecord {
  /** `${symbol}|${tf}` */
  key: string;
  symbol: string;
  tf: Timeframe;
  candles: Candle[];
}

/**
 * IndexedDB wrapper for asset workspaces, split in two stores:
 *  - 'meta'   : light session data (cursor, drawings, active TF) — written
 *               frequently (debounced) with negligible cost.
 *  - 'series' : candle arrays per (symbol, timeframe) — written ONLY when a
 *               CSV is loaded. A year of M1 data is tens of MB; serializing
 *               it on every replay tick froze the UI.
 * v1 stored whole workspaces in a single store; the upgrade migrates it.
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceDbService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (ev) => {
          const db = req.result;
          const tx = req.transaction!;
          // Each store is created only if missing, so the handler is idempotent
          // across upgrade paths (v1->v3, v2->v3, fresh->v3).
          let meta: IDBObjectStore | undefined;
          let series: IDBObjectStore | undefined;
          if (!db.objectStoreNames.contains(META_STORE)) {
            meta = db.createObjectStore(META_STORE, { keyPath: 'symbol' });
          }
          if (!db.objectStoreNames.contains(SERIES_STORE)) {
            series = db.createObjectStore(SERIES_STORE, { keyPath: 'key' });
          }
          // migrate v1 data (whole workspaces in one store) — only when coming
          // from v1, where meta+series were just created above
          if (ev.oldVersion === 1 && meta && series && db.objectStoreNames.contains(LEGACY_STORE)) {
            try {
              const legacy = tx.objectStore(LEGACY_STORE);
              legacy.getAll().onsuccess = function () {
                for (const ws of (this.result as Workspace[]) ?? []) {
                  meta!.put({
                    symbol: ws.symbol,
                    files: ws.files,
                    activeTf: ws.activeTf,
                    currentTime: ws.currentTime,
                    drawings: ws.drawings,
                    lastModified: ws.lastModified,
                  });
                  for (const [tf, candles] of Object.entries(ws.series ?? {})) {
                    series!.put({ key: `${ws.symbol}|${tf}`, symbol: ws.symbol, tf, candles });
                  }
                }
                db.deleteObjectStore(LEGACY_STORE);
              };
            } catch {
              /* best effort: empty registry is acceptable */
            }
          }
          // v3: global session folders (keyed by id)
          if (!db.objectStoreNames.contains(FOLDERS_STORE)) {
            db.createObjectStore(FOLDERS_STORE, { keyPath: 'id' });
          }
          // v4: offline symbol catalog (keyed by symbol)
          if (!db.objectStoreNames.contains(SYMBOLS_STORE)) {
            db.createObjectStore(SYMBOLS_STORE, { keyPath: 'symbol' });
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          // if another tab/context upgrades or deletes the DB, release our
          // connection so it is not blocked forever
          db.onversionchange = () => {
            db.close();
            this.dbPromise = null;
          };
          resolve(db);
        };
        req.onerror = () => reject(req.error);
      });
    }
    return this.dbPromise;
  }

  private request<T>(req: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async putMeta(meta: WorkspaceMeta): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(META_STORE, 'readwrite');
    tx.objectStore(META_STORE).put(meta);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async putSeries(symbol: string, tf: Timeframe, candles: Candle[]): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(SERIES_STORE, 'readwrite');
    tx.objectStore(SERIES_STORE).put({
      key: `${symbol}|${tf}`,
      symbol,
      tf,
      candles,
    } satisfies SeriesRecord);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /** Full workspace = meta + all its series. */
  async getWorkspace(symbol: string): Promise<Workspace | undefined> {
    const db = await this.open();
    const tx = db.transaction([META_STORE, SERIES_STORE], 'readonly');
    const meta = await this.request<WorkspaceMeta | undefined>(
      tx.objectStore(META_STORE).get(symbol),
    );
    if (!meta) return undefined;
    const range = IDBKeyRange.bound(`${symbol}|`, `${symbol}|￿`);
    const records = await this.request<SeriesRecord[]>(tx.objectStore(SERIES_STORE).getAll(range));
    const series: Workspace['series'] = {};
    for (const r of records) series[r.tf] = r.candles;
    return { ...meta, series };
  }

  /**
   * Appends a downloaded chunk to a series record, merging by candle time
   * (the wizard streams chunk by chunk instead of accumulating in memory).
   * The common case — a chunk that continues past the stored tail — is a
   * cheap concat; overlaps fall back to a full dedupe-and-sort.
   */
  async appendSeriesChunk(symbol: string, tf: Timeframe, candles: Candle[]): Promise<void> {
    if (!candles.length) return;
    const db = await this.open();
    const tx = db.transaction(SERIES_STORE, 'readwrite');
    const store = tx.objectStore(SERIES_STORE);
    const key = `${symbol}|${tf}`;
    const existing = await this.request<SeriesRecord | undefined>(store.get(key));
    let merged: Candle[];
    const prev = existing?.candles ?? [];
    if (!prev.length) {
      merged = candles;
    } else if (candles[0].time > prev[prev.length - 1].time) {
      merged = prev.concat(candles);
    } else {
      const byTime = new Map(prev.map((c) => [c.time, c]));
      for (const c of candles) byTime.set(c.time, c);
      merged = [...byTime.values()].sort((a, b) => a.time - b.time);
    }
    store.put({ key, symbol, tf, candles: merged } satisfies SeriesRecord);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /** Tail info of a stored series (resume point for wizard downloads). */
  async getSeriesInfo(
    symbol: string,
    tf: Timeframe,
  ): Promise<{ lastTime: number; count: number } | null> {
    const db = await this.open();
    const record = await this.request<SeriesRecord | undefined>(
      db.transaction(SERIES_STORE, 'readonly').objectStore(SERIES_STORE).get(`${symbol}|${tf}`),
    );
    if (!record?.candles.length) return null;
    return {
      lastTime: record.candles[record.candles.length - 1].time,
      count: record.candles.length,
    };
  }

  /** Meta record of one workspace (no candle series). */
  async getMeta(symbol: string): Promise<WorkspaceMeta | undefined> {
    const db = await this.open();
    return this.request<WorkspaceMeta | undefined>(
      db.transaction(META_STORE, 'readonly').objectStore(META_STORE).get(symbol),
    );
  }

  /** All workspace metas (sessions page aggregates across assets). */
  async listMetas(): Promise<WorkspaceMeta[]> {
    const db = await this.open();
    const all = await this.request<WorkspaceMeta[]>(
      db.transaction(META_STORE, 'readonly').objectStore(META_STORE).getAll(),
    );
    return all.sort((a, b) => a.symbol.localeCompare(b.symbol));
  }

  async list(): Promise<AssetMeta[]> {
    const db = await this.open();
    const all = await this.request<WorkspaceMeta[]>(
      db.transaction(META_STORE, 'readonly').objectStore(META_STORE).getAll(),
    );
    return all
      .map((m) => ({ symbol: m.symbol, lastModified: m.lastModified }))
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
  }

  async remove(symbol: string): Promise<void> {
    const db = await this.open();
    const tx = db.transaction([META_STORE, SERIES_STORE], 'readwrite');
    tx.objectStore(META_STORE).delete(symbol);
    tx.objectStore(SERIES_STORE).delete(IDBKeyRange.bound(`${symbol}|`, `${symbol}|￿`));
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ---- session folders (global, cross-workspace) ----

  /** All folders, ordered by their manual `order` then name. */
  async listFolders(): Promise<SessionFolder[]> {
    const db = await this.open();
    const all = await this.request<SessionFolder[]>(
      db.transaction(FOLDERS_STORE, 'readonly').objectStore(FOLDERS_STORE).getAll(),
    );
    return all.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }

  async putFolder(folder: SessionFolder): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(FOLDERS_STORE, 'readwrite');
    tx.objectStore(FOLDERS_STORE).put(folder);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async deleteFolder(id: string): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(FOLDERS_STORE, 'readwrite');
    tx.objectStore(FOLDERS_STORE).delete(id);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ---- offline symbol catalog (v4) ----

  /** Upserts a catalog entry (offline analog of a backend symbol). */
  async putSymbol(sym: OfflineSymbol): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(SYMBOLS_STORE, 'readwrite');
    tx.objectStore(SYMBOLS_STORE).put(sym);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getSymbol(symbol: string): Promise<OfflineSymbol | undefined> {
    const db = await this.open();
    return this.request<OfflineSymbol | undefined>(
      db.transaction(SYMBOLS_STORE, 'readonly').objectStore(SYMBOLS_STORE).get(symbol),
    );
  }

  /** All catalog entries, sorted by symbol (offline Markets / wizard list). */
  async listSymbols(): Promise<OfflineSymbol[]> {
    const db = await this.open();
    const all = await this.request<OfflineSymbol[]>(
      db.transaction(SYMBOLS_STORE, 'readonly').objectStore(SYMBOLS_STORE).getAll(),
    );
    return all.sort((a, b) => a.symbol.localeCompare(b.symbol));
  }

  /** Removes a symbol everywhere: catalog entry, meta and all its series. */
  async removeSymbol(symbol: string): Promise<void> {
    const db = await this.open();
    const tx = db.transaction([SYMBOLS_STORE, META_STORE, SERIES_STORE], 'readwrite');
    tx.objectStore(SYMBOLS_STORE).delete(symbol);
    tx.objectStore(META_STORE).delete(symbol);
    tx.objectStore(SERIES_STORE).delete(IDBKeyRange.bound(`${symbol}|`, `${symbol}|￿`));
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
