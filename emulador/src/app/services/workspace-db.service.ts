/* eslint-disable @angular-eslint/prefer-inject -- constructor inject()-defaults keep this service unit-testable via direct construction (new Service(deps)) without TestBed; see services design note. */
import { inject, Injectable } from '@angular/core';
import { Candle, Timeframe } from '../models';
import { defaultTradingData, SessionFolder } from '../state/trading/trading.models';
import { AssetMeta, Workspace, WorkspaceMeta } from '../state/workspaces/workspaces.models';
import {
  ADOPTION_MARKER_KEY,
  type AdoptionMarker,
  NO_OWNER_MESSAGE,
  ownerWorkspaceDbName,
  USER_DB_VERSION,
} from './owner-scope';
import { OwnerIdentityService } from './owner-identity.service';
import {
  ALL_PARTITION,
  CANDLES_BY_SYMBOL_TF_TIME,
  CANDLES_STORE,
  type CandleRecord,
  DATASETS_BY_SYMBOL_TF_YEAR,
  DATASETS_STORE,
  type DatasetRecord,
  DB_NAME,
  DB_VERSION,
  FOLDERS_STORE,
  LEGACY_STORE,
  META_STORE,
  SERIES_STORE,
  SYNC_STORE,
  partitionTimeBounds,
} from './market-data-db';

// Schema constants and the CandleRecord/DatasetRecord row types are shared,
// Angular-free, in ./market-data-db so the ingestion worker can reuse them
// without importing @angular/core. Re-export the record types so existing
// importers of this service keep working unchanged.
export type { CandleRecord, DatasetRecord } from './market-data-db';

interface SeriesRecord {
  /** `${symbol}|${tf}` */
  key: string;
  symbol: string;
  tf: Timeframe;
  candles: Candle[];
}

/**
 * IndexedDB wrapper for asset workspaces, spanning TWO physical databases
 * (Session Sovereignty V2 — see `owner-scope.ts` for the full rationale):
 *
 *  - **`emulador-workspaces` (v6) — shared, origin-scoped market data.**
 *    'series' holds candle arrays per (symbol, timeframe), written ONLY when a
 *    CSV is loaded (a year of M1 is tens of MB; serializing it on every replay
 *    tick froze the UI); 'datasets'/'candles' hold the R2 cache. These are
 *    Market-Data domain: shared by every account on this browser profile by
 *    design, and read by the Angular-free ingestion worker under this exact
 *    name. Its 'meta'/'folders'/'sync' stores still exist and still get created
 *    on upgrade (the schema is untouched), but this service never reads them as
 *    live state any more — they are the legacy QUARANTINE, see
 *    `listQuarantined*` below.
 *  - **`emulador-workspace-<ownerId>` (v1) — this user's workspace.**
 *    'meta' (light session data: cursor, drawings, active TF, trading state),
 *    'folders' and 'sync' (LWW bookkeeping). One database per Supabase user, so
 *    a second account signing in on the same profile cannot read, overwrite or
 *    upload the first account's sessions.
 *
 * Every user-owned operation fails closed when no owner can be resolved: there
 * is no un-owned fallback, because falling back to the shared name is exactly
 * the defect this split removes.
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceDbService {
  private dbPromise: Promise<IDBDatabase> | null = null;
  /** Per-owner connection, together with the owner it was opened for. */
  private userDbPromise: Promise<IDBDatabase> | null = null;
  private userDbOwnerId: string | null = null;

  constructor(private readonly owner: OwnerIdentityService = inject(OwnerIdentityService)) {}

  /** Fails closed unless this DB instance and the caller's auth context name the same owner. */
  async assertOwner(expectedOwnerId: string): Promise<void> {
    const ownerId = await this.owner.ownerId();
    if (!ownerId || ownerId !== expectedOwnerId) {
      throw new Error('El propietario autenticado no coincide con el espacio de trabajo local.');
    }
  }

  /**
   * Opens (and caches) the CURRENT owner's workspace database.
   *
   * Rejects with {@link NO_OWNER_MESSAGE} when no owner is resolvable — a
   * user-owned read must never silently answer from another user's data, and a
   * user-owned write must never land somewhere unattributable.
   *
   * The cached connection is keyed by owner id: if the resolved owner ever
   * changes inside one document (it should not — `loggedOut` hard-reloads), the
   * stale connection is closed and a fresh one opened rather than reused.
   */
  private async openUser(): Promise<IDBDatabase> {
    const ownerId = await this.owner.ownerId();
    if (!ownerId) throw new Error(NO_OWNER_MESSAGE);
    if (this.userDbPromise && this.userDbOwnerId === ownerId) return this.userDbPromise;
    if (this.userDbPromise) {
      const stale = this.userDbPromise;
      void stale.then((db) => db.close()).catch(() => undefined);
    }
    this.userDbOwnerId = ownerId;
    const opening = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(ownerWorkspaceDbName(ownerId), USER_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        // Same store names as the legacy layout, so every record shape (and the
        // adoption copy below) round-trips verbatim.
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: 'symbol' });
        }
        if (!db.objectStoreNames.contains(FOLDERS_STORE)) {
          db.createObjectStore(FOLDERS_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(SYNC_STORE)) {
          db.createObjectStore(SYNC_STORE, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          db.close();
          this.userDbPromise = null;
          this.userDbOwnerId = null;
        };
        resolve(db);
      };
      req.onerror = () => reject(req.error);
    });
    this.userDbPromise = opening;
    return opening;
  }

  /** One read/write transaction over a store of the current owner's database. */
  private async userTx(
    store: string,
    mode: IDBTransactionMode,
  ): Promise<{ tx: IDBTransaction; store: IDBObjectStore }> {
    const db = await this.openUser();
    const tx = db.transaction(store, mode);
    return { tx, store: tx.objectStore(store) };
  }

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
              };
            } catch {
              /* best effort: empty registry is acceptable */
            }
          }
          // v3: global session folders (keyed by id)
          if (!db.objectStoreNames.contains(FOLDERS_STORE)) {
            db.createObjectStore(FOLDERS_STORE, { keyPath: 'id' });
          }
          // v4 used to create an offline symbol catalog store here. It was
          // retired (Phase 3) without bumping DB_VERSION: existing DBs keep
          // the orphan 'symbols' store harmlessly; fresh DBs never get one.
          // v5: R2/Parquet dataset manifest cache
          if (!db.objectStoreNames.contains(DATASETS_STORE)) {
            const datasets = db.createObjectStore(DATASETS_STORE, { keyPath: 'id' });
            datasets.createIndex(DATASETS_BY_SYMBOL_TF_YEAR, ['symbol', 'timeframe', 'year'], {
              unique: false,
            });
          }
          // v5: individual candle rows from R2/Parquet files (auto-increment id)
          if (!db.objectStoreNames.contains(CANDLES_STORE)) {
            const candles = db.createObjectStore(CANDLES_STORE, {
              keyPath: 'id',
              autoIncrement: true,
            });
            candles.createIndex(CANDLES_BY_SYMBOL_TF_TIME, ['symbol', 'timeframe', 'time'], {
              unique: false,
            });
          }
          // v6: session-sync bookkeeping (pending deletes + lastPullAt), keyed by `key`
          if (!db.objectStoreNames.contains(SYNC_STORE)) {
            db.createObjectStore(SYNC_STORE, { keyPath: 'key' });
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

  /** Awaits a transaction's completion (resolve on commit, reject on abort/error). */
  private completed(tx: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async putMeta(meta: WorkspaceMeta): Promise<void> {
    const { tx, store } = await this.userTx(META_STORE, 'readwrite');
    store.put(meta);
    return this.completed(tx);
  }

  /** Atomically derives one meta record from the latest value stored for its symbol. */
  async updateMeta(
    symbol: string,
    update: (current: WorkspaceMeta | undefined) => WorkspaceMeta | undefined,
  ): Promise<void> {
    const { tx, store } = await this.userTx(META_STORE, 'readwrite');
    const completion = this.completed(tx);
    try {
      const current = await this.request<WorkspaceMeta | undefined>(store.get(symbol));
      const next = update(current);
      if (next) store.put(next);
    } catch (error) {
      try {
        tx.abort();
      } catch {
        // The transaction may already have aborted because of the failed request.
      }
      void completion.catch(() => undefined);
      throw error;
    }
    await completion;
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

  /**
   * Full workspace = this owner's meta + the shared market-data series.
   *
   * The two halves now live in different databases, so this is no longer one
   * transaction. That is a deliberate consequence of the domain split and costs
   * nothing real: `series` records only change on a CSV load, and a series
   * without a meta is an inert cache entry, never a corrupted workspace.
   */
  async getWorkspace(symbol: string): Promise<Workspace | undefined> {
    const meta = await this.getMeta(symbol);
    if (!meta) return undefined;
    const db = await this.open();
    const range = IDBKeyRange.bound(`${symbol}|`, `${symbol}|￿`);
    const records = await this.request<SeriesRecord[]>(
      db.transaction(SERIES_STORE, 'readonly').objectStore(SERIES_STORE).getAll(range),
    );
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
    const { store } = await this.userTx(META_STORE, 'readonly');
    return this.request<WorkspaceMeta | undefined>(store.get(symbol));
  }

  /** All workspace metas (sessions page aggregates across assets). */
  async listMetas(): Promise<WorkspaceMeta[]> {
    const { store } = await this.userTx(META_STORE, 'readonly');
    const all = await this.request<WorkspaceMeta[]>(store.getAll());
    return all.sort((a, b) => a.symbol.localeCompare(b.symbol));
  }

  async list(): Promise<AssetMeta[]> {
    const all = await this.listMetas();
    return all
      .map((m) => ({ symbol: m.symbol, lastModified: m.lastModified }))
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
  }

  /**
   * Removes one workspace: this owner's meta plus the shared series rows of that
   * symbol. Two databases, so two transactions (see `getWorkspace`); the meta
   * goes first so a failure after it cannot leave a meta pointing at candles
   * that were already dropped.
   */
  async remove(symbol: string): Promise<void> {
    const { tx: userTx, store: metaStore } = await this.userTx(META_STORE, 'readwrite');
    metaStore.delete(symbol);
    await this.completed(userTx);
    const db = await this.open();
    const tx = db.transaction(SERIES_STORE, 'readwrite');
    tx.objectStore(SERIES_STORE).delete(IDBKeyRange.bound(`${symbol}|`, `${symbol}|￿`));
    return this.completed(tx);
  }

  // ---- session folders (global, cross-workspace) ----

  /** All folders, ordered by their manual `order` then name. */
  async listFolders(): Promise<SessionFolder[]> {
    const { store } = await this.userTx(FOLDERS_STORE, 'readonly');
    const all = await this.request<SessionFolder[]>(store.getAll());
    return all.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }

  async putFolder(folder: SessionFolder): Promise<void> {
    const { tx, store } = await this.userTx(FOLDERS_STORE, 'readwrite');
    store.put(folder);
    return this.completed(tx);
  }

  /** Applies a cloud folder consequence only while its evaluated local revision is current. */
  async replaceFolderIfUnchanged(
    expected: SessionFolder | undefined,
    next: SessionFolder | null,
  ): Promise<void> {
    const id = expected?.id ?? next?.id;
    if (!id) return;
    const { tx, store } = await this.userTx(FOLDERS_STORE, 'readwrite');
    const completion = this.completed(tx);
    const current = await this.request<SessionFolder | undefined>(store.get(id));
    const unchanged = expected
      ? current?.clientUpdatedAt === expected.clientUpdatedAt &&
        current?.syncedAt === expected.syncedAt
      : current == null;
    if (unchanged) {
      if (next) store.put(next);
      else if (expected) store.delete(expected.id);
    }
    await completion;
  }

  /** Acknowledges only the exact folder revision that completed its cloud upsert. */
  async acknowledgeFolderSynced(id: string, clientUpdatedAt: number): Promise<void> {
    const { tx, store } = await this.userTx(FOLDERS_STORE, 'readwrite');
    const completion = this.completed(tx);
    const current = await this.request<SessionFolder | undefined>(store.get(id));
    if (current?.clientUpdatedAt === clientUpdatedAt) {
      store.put({ ...current, syncedAt: clientUpdatedAt });
    }
    await completion;
  }

  /** Acknowledges only the exact active or archived session revision that was uploaded. */
  async acknowledgeSessionSynced(
    symbol: string,
    sessionId: string,
    clientUpdatedAt: number,
  ): Promise<void> {
    await this.updateMeta(symbol, (current) => {
      if (!current) return undefined;
      if (
        current.activeSessionId === sessionId &&
        current.activeClientUpdatedAt === clientUpdatedAt
      ) {
        return { ...current, activeSyncedAt: clientUpdatedAt };
      }
      const index = (current.sessions ?? []).findIndex(
        (session) => session.id === sessionId && session.clientUpdatedAt === clientUpdatedAt,
      );
      if (index < 0) return undefined;
      const sessions = [...(current.sessions ?? [])];
      sessions[index] = { ...sessions[index], syncedAt: clientUpdatedAt };
      return { ...current, sessions };
    });
  }

  /** Removes one D1 target only while its evaluated local revision is still current. */
  async removeSessionIfUnchanged(
    symbol: string,
    sessionId: string,
    kind: 'active' | 'archived',
    clientUpdatedAt: number,
    syncedAt: number | undefined,
    expectedTrading?: WorkspaceMeta['trading'],
  ): Promise<void> {
    await this.updateMeta(symbol, (current) => {
      if (!current) return undefined;
      if (kind === 'active') {
        if (
          current.activeSessionId !== sessionId ||
          (current.activeClientUpdatedAt ?? 0) !== clientUpdatedAt ||
          current.activeSyncedAt !== syncedAt ||
          JSON.stringify(current.trading) !== JSON.stringify(expectedTrading)
        ) {
          return undefined;
        }
        return {
          ...current,
          activeSessionId: undefined,
          activeClientUpdatedAt: undefined,
          activeSyncedAt: undefined,
          trading: defaultTradingData(),
        };
      }
      const saved = (current.sessions ?? []).find((session) => session.id === sessionId);
      if (
        !saved ||
        (saved.clientUpdatedAt ?? 0) !== clientUpdatedAt ||
        saved.syncedAt !== syncedAt
      ) {
        return undefined;
      }
      return {
        ...current,
        sessions: (current.sessions ?? []).filter((session) => session.id !== sessionId),
      };
    });
  }

  async deleteFolder(id: string): Promise<void> {
    const { tx, store } = await this.userTx(FOLDERS_STORE, 'readwrite');
    store.delete(id);
    return this.completed(tx);
  }

  // ---- R2/Parquet datasets cache (v5) ----
  //
  // The `datasets` store mirrors the R2 manifest: one row per ingested
  // (symbol, timeframe, year) partition. The Data Wizard (Task 6) reads it to
  // decide whether a partition's local copy is already current (etag match) and
  // writes it after a successful ingestion so the next launch can skip it.

  /** Upserts a dataset record (keyed by its `${symbol}|${tf}|${year}` id). */
  async putDataset(dataset: DatasetRecord): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(DATASETS_STORE, 'readwrite');
    tx.objectStore(DATASETS_STORE).put(dataset);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /** One dataset record by composite id, or undefined when absent. */
  async getDataset(id: string): Promise<DatasetRecord | undefined> {
    const db = await this.open();
    return this.request<DatasetRecord | undefined>(
      db.transaction(DATASETS_STORE, 'readonly').objectStore(DATASETS_STORE).get(id),
    );
  }

  /** All cached dataset records, sorted by id. */
  async listDatasets(): Promise<DatasetRecord[]> {
    const db = await this.open();
    const all = await this.request<DatasetRecord[]>(
      db.transaction(DATASETS_STORE, 'readonly').objectStore(DATASETS_STORE).getAll(),
    );
    return all.sort((a, b) => a.id.localeCompare(b.id));
  }

  /** Removes one dataset record by composite id. */
  async deleteDataset(id: string): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(DATASETS_STORE, 'readwrite');
    tx.objectStore(DATASETS_STORE).delete(id);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * All raw candle rows for one (symbol, timeframe), via the compound index.
   * Primarily a test/inspection helper; candle reads for the chart go through
   * the `MarketDataRepository`.
   */
  async listCandles(symbol: string, timeframe: string): Promise<CandleRecord[]> {
    const db = await this.open();
    const range = IDBKeyRange.bound([symbol, timeframe, -Infinity], [symbol, timeframe, +Infinity]);
    return this.request<CandleRecord[]>(
      db
        .transaction(CANDLES_STORE, 'readonly')
        .objectStore(CANDLES_STORE)
        .index(CANDLES_BY_SYMBOL_TF_TIME)
        .getAll(range),
    );
  }

  /**
   * Deletes the candle rows of ONE partition of a (symbol, timeframe). The
   * `candles` store has an auto-increment primary key and a NON-unique index,
   * so re-ingesting a Parquet would otherwise DUPLICATE rows; the wizard clears
   * the existing rows before a re-ingestion. Walks the compound index with a
   * cursor and deletes each match by primary key (the bound exactly brackets
   * this symbol+tf, so `'M1'` never matches `'M15'`).
   *
   * `year` narrows the deletion to that partition's UTC calendar year — M1 is
   * split by year in R2, and the sibling years live in this same store. Without
   * the narrowing, refreshing one year wiped the others, which then kept a
   * current etag in `datasets` and were never re-ingested. Defaults to
   * {@link ALL_PARTITION} (the whole series), which is what H1/D1 need.
   */
  async clearDatasetCandles(
    symbol: string,
    timeframe: string,
    year: string = ALL_PARTITION,
  ): Promise<void> {
    const { from, to } = partitionTimeBounds(year);
    const db = await this.open();
    const tx = db.transaction(CANDLES_STORE, 'readwrite');
    const index = tx.objectStore(CANDLES_STORE).index(CANDLES_BY_SYMBOL_TF_TIME);
    const range = IDBKeyRange.bound([symbol, timeframe, from], [symbol, timeframe, to]);
    const cursorReq = index.openCursor(range);
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ---- session-sync bookkeeping (v6) ----
  //
  // The `sync` store holds two unrelated record shapes, distinguished by a
  // `key` prefix: `pendingDelete:<id>` for entities deleted locally while
  // offline (replayed against the cloud on the next push), and the single
  // `lastPullAt` record tracking the last successful pull's epoch ms.

  /** Records a local delete to replay against the cloud on the next push. */
  async addPendingDelete(d: { entity: 'session' | 'folder'; id: string }): Promise<void> {
    const { tx, store } = await this.userTx(SYNC_STORE, 'readwrite');
    store.put({ key: `pendingDelete:${d.id}`, entity: d.entity, id: d.id });
    return this.completed(tx);
  }

  /** All pending deletes recorded while offline (sync layer replays these). */
  async listPendingDeletes(): Promise<{ entity: 'session' | 'folder'; id: string }[]> {
    const { store } = await this.userTx(SYNC_STORE, 'readonly');
    const all = await this.request<{ key: string; entity: 'session' | 'folder'; id: string }[]>(
      store.getAll(),
    );
    return all
      .filter((r) => r.key.startsWith('pendingDelete:'))
      .map((r) => ({ entity: r.entity, id: r.id }));
  }

  /** Clears a pending delete once the cloud delete has been confirmed. */
  async removePendingDelete(id: string): Promise<void> {
    const { tx, store } = await this.userTx(SYNC_STORE, 'readwrite');
    store.delete(`pendingDelete:${id}`);
    return this.completed(tx);
  }

  /** Epoch ms of the last successful pull, or null before the first pull. */
  async getLastPullAt(): Promise<number | null> {
    const { store } = await this.userTx(SYNC_STORE, 'readonly');
    const record = await this.request<{ key: string; value: number } | undefined>(
      store.get('lastPullAt'),
    );
    return record?.value ?? null;
  }

  /** Records the epoch ms of a successful pull. */
  async setLastPullAt(ms: number): Promise<void> {
    const { tx, store } = await this.userTx(SYNC_STORE, 'readwrite');
    store.put({ key: 'lastPullAt', value: ms });
    return this.completed(tx);
  }

  // ---- legacy quarantine (Session Sovereignty V2) ----
  //
  // The pre-split `meta`/`folders` rows still sit in the shared
  // `emulador-workspaces` database. They belong to whichever account used this
  // browser profile before the split, and nothing here can prove which. Per
  // owner policy O-7 they are therefore READ-ONLY and PERMANENT to this code:
  // the only operation offered is "read them", and the only way a record leaves
  // the quarantine is by being COPIED into an owner partition after the cloud
  // proved that owner owns it (`adoptQuarantined*` on SessionSyncService).
  // Nothing in this service ever writes to, or deletes from, these two stores.

  /** Legacy, un-owned workspace metas (read-only; never live state). */
  async listQuarantinedMetas(): Promise<WorkspaceMeta[]> {
    const db = await this.open();
    return this.request<WorkspaceMeta[]>(
      db.transaction(META_STORE, 'readonly').objectStore(META_STORE).getAll(),
    );
  }

  /** Legacy, un-owned session folders (read-only; never live state). */
  async listQuarantinedFolders(): Promise<SessionFolder[]> {
    const db = await this.open();
    return this.request<SessionFolder[]>(
      db.transaction(FOLDERS_STORE, 'readonly').objectStore(FOLDERS_STORE).getAll(),
    );
  }

  /**
   * Which quarantined keys THIS owner has already claimed. Stored in the owner
   * partition (never in the quarantine), so a claim is recorded next to the data
   * it produced and a second account's marker can never shadow the first's.
   */
  async getAdoptionMarker(): Promise<AdoptionMarker> {
    const { store } = await this.userTx(SYNC_STORE, 'readonly');
    const record = await this.request<AdoptionMarker | undefined>(store.get(ADOPTION_MARKER_KEY));
    return {
      key: ADOPTION_MARKER_KEY,
      metaKeys: record?.metaKeys ?? [],
      folderKeys: record?.folderKeys ?? [],
      updatedAt: record?.updatedAt ?? 0,
    };
  }

  /** Copies quarantine claims and advances their marker in one owner-DB transaction. */
  async adoptQuarantined(claim: {
    metas?: WorkspaceMeta[];
    folders?: SessionFolder[];
  }): Promise<void> {
    const metas = claim.metas ?? [];
    const folders = claim.folders ?? [];
    if (!metas.length && !folders.length) return;

    const db = await this.openUser();
    const tx = db.transaction([META_STORE, FOLDERS_STORE, SYNC_STORE], 'readwrite');
    const completion = this.completed(tx);
    try {
      const sync = tx.objectStore(SYNC_STORE);
      const metaStore = tx.objectStore(META_STORE);
      const folderStore = tx.objectStore(FOLDERS_STORE);
      const current = await this.request<AdoptionMarker | undefined>(sync.get(ADOPTION_MARKER_KEY));
      const copiedMetaKeys: string[] = [];
      const copiedFolderKeys: string[] = [];
      for (const meta of metas) {
        if ((await this.request<WorkspaceMeta | undefined>(metaStore.get(meta.symbol))) != null) {
          continue;
        }
        await this.request(metaStore.add(meta));
        copiedMetaKeys.push(meta.symbol);
      }
      for (const folder of folders) {
        if ((await this.request<SessionFolder | undefined>(folderStore.get(folder.id))) != null) {
          continue;
        }
        await this.request(folderStore.add(folder));
        copiedFolderKeys.push(folder.id);
      }
      if (!copiedMetaKeys.length && !copiedFolderKeys.length) {
        await completion;
        return;
      }
      sync.put({
        key: ADOPTION_MARKER_KEY,
        metaKeys: [...new Set([...(current?.metaKeys ?? []), ...copiedMetaKeys])],
        folderKeys: [...new Set([...(current?.folderKeys ?? []), ...copiedFolderKeys])],
        updatedAt: Date.now(),
      } satisfies AdoptionMarker);
    } catch (error) {
      try {
        tx.abort();
      } catch {
        // The transaction may already have aborted because of the failed request.
      }
      void completion.catch(() => undefined);
      throw error;
    }
    await completion;
  }
}
