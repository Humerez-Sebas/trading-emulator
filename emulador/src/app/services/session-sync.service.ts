/* eslint-disable @angular-eslint/prefer-inject -- constructor inject()-defaults keep this service unit-testable via direct construction (new Service(deps)) without TestBed; see services design note. */
import { inject, Injectable } from '@angular/core';
import { SupabaseService } from '../auth/supabase.service';
import {
  assertNoCandles,
  assertPayloadSize,
  flattenWorkspace,
  isRealSession,
  mergeByLww,
} from './session-sync.mapping';
import type {
  CloudFolderRow,
  CloudSessionRow,
  FlattenInput,
  FlattenSession,
  SessionPayloadV1,
  SessionSummary,
} from './session-sync.models';
import { WorkspaceDbService } from './workspace-db.service';
import type { SavedSession, TradingData } from '../state/trading/trading.models';
import type { WorkspaceMeta } from '../state/workspaces/workspaces.models';
import { defaultTradingData } from '../state/trading/trading.models';

/**
 * Supabase CRUD boundary for session sync (Task 8). Pure I/O — no merge/LWW
 * logic lives here (that's Task 9's `WorkspaceDbService`/sync orchestrator).
 * Last-Write-Wins is enforced by a BEFORE UPDATE trigger in Postgres, so
 * `upsertSession`/`upsertFolder` are plain `upsert(row, { onConflict: 'id' })`
 * calls — no RPC, no WHERE clause needed; the trigger silently keeps the
 * newer row when a stale write loses the race.
 */
@Injectable({ providedIn: 'root' })
export class SessionSyncService {
  constructor(
    private readonly supabase: SupabaseService = inject(SupabaseService),
    private readonly db: WorkspaceDbService = inject(WorkspaceDbService),
  ) {}

  private get client() {
    return this.supabase.client;
  }

  /** The authenticated user's id, required as `owner_id` on every upsert (no DB default; RLS rejects otherwise). */
  private async currentUserId(): Promise<string> {
    const { data } = await this.client.auth.getSession();
    const id = data.session?.user?.id;
    if (!id) throw new Error('No hay sesión activa.');
    return id;
  }

  /** Lightweight session list for the Sessions UI — selects every column except `payload`. */
  async listSummaries(): Promise<SessionSummary[]> {
    const { data, error } = await this.client
      .from('sessions')
      .select(
        'id,name,symbol,folder_id,client_updated_at,last_opened_at,required_datasets,trades_count,initial_balance,balance,cursor,schema_version,summary',
      );
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Record<string, unknown>[];
    return rows.map((r) => {
      const summary = r['summary'] as { winRate?: number; sparkline?: number[] } | null | undefined;
      return {
        id: r['id'] as string,
        name: r['name'] as string,
        symbol: r['symbol'] as string,
        folderId: r['folder_id'] as string | null,
        schemaVersion: r['schema_version'] as number,
        updatedAt: r['client_updated_at'] as string,
        lastOpenedAt: r['last_opened_at'] as string | null,
        requiredDatasets: (r['required_datasets'] as SessionSummary['requiredDatasets']) ?? [],
        tradeCount: r['trades_count'] as number,
        initialBalance: Number(r['initial_balance']),
        balance: Number(r['balance']),
        cursor: Number(r['cursor']),
        winRate: summary?.winRate,
        sparkline: summary?.sparkline,
      };
    });
  }

  /** Fetches the full lossless payload for one session (the column `listSummaries` deliberately omits). */
  async fetchPayload(id: string): Promise<SessionPayloadV1> {
    const { data, error } = await this.client
      .from('sessions')
      .select('payload')
      .eq('id', id)
      .single();
    if (error) throw new Error(error.message);
    return (data as { payload: SessionPayloadV1 }).payload;
  }

  /**
   * Upserts a session row. Validates the payload (no candles, under the 2 MB
   * cap) BEFORE any network call, then sets `owner_id` from the authenticated
   * session and writes snake_case columns. `updated_at` is intentionally
   * omitted — the server trigger owns it.
   */
  async upsertSession(row: CloudSessionRow): Promise<void> {
    assertNoCandles(row.payload);
    assertPayloadSize(row.payload);

    const owner_id = await this.currentUserId();
    const dbRow = {
      id: row.id,
      owner_id,
      symbol: row.symbol,
      name: row.name,
      folder_id: row.folderId,
      schema_version: row.schemaVersion,
      trades_count: row.tradeCount,
      initial_balance: row.initialBalance,
      balance: row.balance,
      cursor: row.cursor,
      created_at: new Date(row.createdAt).toISOString(),
      client_updated_at: new Date(row.clientUpdatedAt).toISOString(),
      last_opened_at: row.lastOpenedAt == null ? null : new Date(row.lastOpenedAt).toISOString(),
      required_datasets: row.requiredDatasets,
      summary: { winRate: row.winRate, sparkline: row.sparkline },
      payload: row.payload,
    };

    const { error } = await this.client.from('sessions').upsert(dbRow, { onConflict: 'id' });
    if (error) throw new Error(error.message);
  }

  async deleteSession(id: string): Promise<void> {
    const { error } = await this.client.from('sessions').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  /** Lists all folders for the current user (RLS-scoped server-side). */
  async listFolders(): Promise<CloudFolderRow[]> {
    const { data, error } = await this.client
      .from('folders')
      .select('id,name,sort,client_updated_at');
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: r['id'] as string,
      name: r['name'] as string,
      sort: r['sort'] as number,
      clientUpdatedAt: new Date(r['client_updated_at'] as string).getTime(),
    }));
  }

  async upsertFolder(row: CloudFolderRow): Promise<void> {
    const owner_id = await this.currentUserId();
    const dbRow = {
      id: row.id,
      owner_id,
      name: row.name,
      sort: row.sort,
      client_updated_at: new Date(row.clientUpdatedAt).toISOString(),
    };
    const { error } = await this.client.from('folders').upsert(dbRow, { onConflict: 'id' });
    if (error) throw new Error(error.message);
  }

  async deleteFolder(id: string): Promise<void> {
    const { error } = await this.client.from('folders').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  // ---------------------------------------------------------------------
  // Task 9: orchestration — pull+merge (login) and the dirty/pending-delete
  // flushers. Composes the pure LWW merge (session-sync.mapping) with the
  // Supabase CRUD above and the IndexedDB sync bookkeeping (WorkspaceDbService).
  // ---------------------------------------------------------------------

  /**
   * Replays local deletes recorded while offline against the cloud. Each
   * entry is independent: a failure (offline, RLS, etc.) is swallowed so one
   * bad delete doesn't block the others or the caller — it just stays
   * pending and is retried on the next flush.
   */
  async flushPendingDeletes(): Promise<void> {
    const pending = await this.db.listPendingDeletes();
    for (const { entity, id } of pending) {
      try {
        if (entity === 'session') {
          await this.deleteSession(id);
        } else {
          await this.deleteFolder(id);
        }
        await this.db.removePendingDelete(id);
      } catch {
        // Offline or transient failure — leave the pending-delete record in
        // place so it's retried on the next flush.
      }
    }
  }

  /** Pushes every locally-dirty folder and session. Per-entity try/catch: a failed push leaves it dirty for the next flush. */
  async flushDirty(): Promise<void> {
    await this.flushDirtyFolders();
    await this.flushDirtySessions();
  }

  private async flushDirtyFolders(): Promise<void> {
    const folders = await this.db.listFolders();
    for (const folder of folders) {
      if (!isDirty(folder.clientUpdatedAt, folder.syncedAt)) continue;
      try {
        await this.upsertFolder({
          id: folder.id,
          name: folder.name,
          sort: folder.order,
          clientUpdatedAt: folder.clientUpdatedAt!,
        });
        folder.syncedAt = folder.clientUpdatedAt;
        await this.db.putFolder(folder);
      } catch {
        // Offline/oversized/etc — stays dirty, retried next flush.
      }
    }
  }

  private async flushDirtySessions(): Promise<void> {
    const metas = await this.db.listMetas();
    for (const meta of metas) {
      const input = buildFlattenInput(meta);
      let result: ReturnType<typeof flattenWorkspace>;
      try {
        result = flattenWorkspace(input);
      } catch {
        // A malformed/oversized active session would throw inside
        // flattenWorkspace (assertPayloadSize/assertNoCandles) — skip this
        // symbol's push entirely rather than crash the whole flush.
        continue;
      }

      let metaChanged = false;
      if (result.activeSessionId && !meta.activeSessionId) {
        meta.activeSessionId = result.activeSessionId;
        metaChanged = true;
      }

      for (const row of result.rows) {
        const isActive = row.id === result.activeSessionId;
        if (isActive) {
          if (!meta.activeSessionId || !isDirty(meta.activeClientUpdatedAt, meta.activeSyncedAt)) {
            continue;
          }
          try {
            await this.upsertSession(row);
            meta.activeSyncedAt = meta.activeClientUpdatedAt;
            metaChanged = true;
          } catch {
            // stays dirty, retried next flush
          }
        } else {
          const saved = (meta.sessions ?? []).find((s) => s.id === row.id);
          if (!saved || !isDirty(saved.clientUpdatedAt, saved.syncedAt)) continue;
          try {
            await this.upsertSession(row);
            saved.syncedAt = saved.clientUpdatedAt;
            metaChanged = true;
          } catch {
            // stays dirty, retried next flush
          }
        }
      }

      if (metaChanged) await this.db.putMeta(meta);
    }
  }

  /**
   * Login pull + merge, exactly per spec §11:
   *  1. flush pending deletes (cloud reflects our deletes first)
   *  2. pull+merge folders (LWW)
   *  3. pull+merge sessions (LWW)
   *  4. membership removal of previously-synced-absent locals (D1)
   *  5. flush dirty (push local-only + locally-newer)
   *  6. reconstruct active per symbol (D4, best-effort, no payload fetch)
   *  7. record lastPullAt
   * Each network step (2,3,5) is independently wrapped — an offline failure
   * leaves local state intact and is retried on the next pull.
   */
  async pullAndMerge(): Promise<void> {
    await this.flushPendingDeletes();

    await this.pullAndMergeFolders();
    await this.pullAndMergeSessions();

    await this.flushDirty();

    await this.reconstructActiveIds();

    await this.db.setLastPullAt(Date.now());
  }

  private async pullAndMergeFolders(): Promise<void> {
    try {
      const cloudRows = await this.listFolders();
      const localFolders = await this.db.listFolders();
      const local = localFolders.map((f) => ({
        id: f.id,
        clientUpdatedAt: f.clientUpdatedAt ?? 0,
      }));
      const cloud = cloudRows.map((c) => ({ id: c.id, clientUpdatedAt: c.clientUpdatedAt }));
      const syncedIds = new Set(localFolders.filter((f) => f.syncedAt != null).map((f) => f.id));

      const { toPushIds, toDeleteLocalIds } = mergeByLww(local, cloud, syncedIds);
      const localById = new Map(localFolders.map((f) => [f.id, f]));
      const cloudById = new Map(cloudRows.map((c) => [c.id, c]));

      // Cloud-won updates (cloud strictly newer than local): write back with
      // syncedAt = clientUpdatedAt since the local copy now matches the cloud.
      for (const cloudFolder of cloudRows) {
        const existing = localById.get(cloudFolder.id);
        const isCloudWon =
          existing != null &&
          cloudFolder.clientUpdatedAt > (existing.clientUpdatedAt ?? 0) &&
          !toPushIds.includes(cloudFolder.id);
        const isCloudOnly = existing == null;
        if (isCloudWon || isCloudOnly) {
          await this.db.putFolder({
            id: cloudFolder.id,
            name: cloudFolder.name,
            order: cloudFolder.sort,
            clientUpdatedAt: cloudFolder.clientUpdatedAt,
            syncedAt: cloudFolder.clientUpdatedAt,
          });
        }
      }

      for (const id of toDeleteLocalIds) {
        await this.db.deleteFolder(id);
      }

      for (const id of toPushIds) {
        const local = localById.get(id);
        const cloudRow = cloudById.get(id);
        if (!local) continue;
        const row: CloudFolderRow = {
          id: local.id,
          name: local.name,
          sort: local.order,
          clientUpdatedAt: local.clientUpdatedAt ?? cloudRow?.clientUpdatedAt ?? Date.now(),
        };
        try {
          await this.upsertFolder(row);
          await this.db.putFolder({ ...local, syncedAt: row.clientUpdatedAt });
        } catch {
          // stays dirty, retried by flushDirty/next pull
        }
      }
    } catch {
      // Offline or RLS failure — leave local folders untouched, retried next pull.
    }
  }

  private async pullAndMergeSessions(): Promise<void> {
    try {
      const cloudSummaries = await this.listSummaries();
      const metas = await this.db.listMetas();

      interface LocalSessionItem {
        id: string;
        clientUpdatedAt: number;
        syncedAt?: number;
        symbol: string;
        _kind: 'active' | 'archived';
        _meta: WorkspaceMeta;
        _saved?: SavedSession;
      }

      const local: LocalSessionItem[] = [];
      for (const meta of metas) {
        if (meta.activeSessionId && meta.trading && isRealSession(meta.trading)) {
          local.push({
            id: meta.activeSessionId,
            clientUpdatedAt: meta.activeClientUpdatedAt ?? 0,
            syncedAt: meta.activeSyncedAt,
            symbol: meta.symbol,
            _kind: 'active',
            _meta: meta,
          });
        }
        for (const saved of meta.sessions ?? []) {
          local.push({
            id: saved.id,
            clientUpdatedAt: saved.clientUpdatedAt ?? 0,
            syncedAt: saved.syncedAt,
            symbol: meta.symbol,
            _kind: 'archived',
            _meta: meta,
            _saved: saved,
          });
        }
      }

      const cloud = cloudSummaries.map((s) => ({
        id: s.id,
        clientUpdatedAt: Date.parse(s.updatedAt),
      }));

      const syncedIds = new Set(local.filter((l) => l.syncedAt != null).map((l) => l.id));

      const { toDeleteLocalIds } = mergeByLww(local, cloud, syncedIds);

      // D1: previously-synced locals now absent from the cloud are removed.
      const changedMetas = new Set<WorkspaceMeta>();
      for (const id of toDeleteLocalIds) {
        const item = local.find((l) => l.id === id);
        if (!item) continue;
        if (item._kind === 'archived') {
          item._meta.sessions = (item._meta.sessions ?? []).filter((s) => s.id !== id);
        } else {
          item._meta.activeSessionId = undefined;
          item._meta.activeClientUpdatedAt = undefined;
          item._meta.activeSyncedAt = undefined;
          item._meta.trading = defaultTradingData();
        }
        changedMetas.add(item._meta);
      }

      // Cloud-won sessions (cloud strictly newer, or cloud-only) are not
      // materialized into full local trading state here — payloads are
      // pulled lazily on open (see reconstructWorkspaces / fetchPayload).
      // We only need to make sure D1 removals above are persisted.
      for (const meta of changedMetas) {
        await this.db.putMeta(meta);
      }
    } catch {
      // Offline or RLS failure — leave local sessions untouched, retried next pull.
    }
  }

  /** Stamp the active session's LWW clock so flushDirty will push it. Only for a real session. */
  async markActiveDirty(symbol: string): Promise<void> {
    const meta = await this.db.getMeta(symbol);
    if (!meta?.trading || !isRealSession(meta.trading)) return;
    meta.activeClientUpdatedAt = Date.now();
    await this.db.putMeta(meta);
  }

  /**
   * D4 best-effort: ensure each symbol's `activeSessionId` points at a
   * sensible session (the existing one if still present, else the newest by
   * clientUpdatedAt among that symbol's sessions). Does not fetch payloads —
   * those are pulled lazily on open.
   */
  private async reconstructActiveIds(): Promise<void> {
    const metas = await this.db.listMetas();
    for (const meta of metas) {
      const candidates: { id: string; clientUpdatedAt: number }[] = [];
      if (meta.activeSessionId) {
        candidates.push({
          id: meta.activeSessionId,
          clientUpdatedAt: meta.activeClientUpdatedAt ?? 0,
        });
      }
      for (const s of meta.sessions ?? []) {
        candidates.push({ id: s.id, clientUpdatedAt: s.clientUpdatedAt ?? s.createdAt });
      }
      if (!candidates.length) continue;

      const knownActiveId = meta.activeSessionId;
      const stillPresent = knownActiveId && candidates.some((c) => c.id === knownActiveId);
      if (stillPresent) continue;

      const newest = candidates.reduce((best, c) =>
        c.clientUpdatedAt > best.clientUpdatedAt ? c : best,
      );
      if (newest.id !== meta.activeSessionId) {
        meta.activeSessionId = newest.id;
        await this.db.putMeta(meta);
      }
    }
  }
}

/** dirty ⇔ clientUpdatedAt > (syncedAt ?? 0). Absent clientUpdatedAt is treated as never-dirty (0 > 0 is false). */
function isDirty(clientUpdatedAt: number | undefined, syncedAt: number | undefined): boolean {
  return (clientUpdatedAt ?? 0) > (syncedAt ?? 0);
}

/** Min/max over the active session's cursor + its trading activity, in unix seconds. Both 0 when there's no activity. */
function inferRange(trading: TradingData, currentTime: number): [number, number] {
  let min = currentTime;
  let max = currentTime;
  const consider = (t: number): void => {
    if (t < min) min = t;
    if (t > max) max = t;
  };
  for (const h of trading.history) {
    consider(h.openTime);
    consider(h.closeTime);
  }
  for (const p of trading.positions) consider(p.openTime);
  for (const o of trading.orders) consider(o.createdAt);

  if (
    !trading.history.length &&
    !trading.positions.length &&
    !trading.orders.length &&
    !currentTime
  ) {
    return [0, 0];
  }
  return [min, max];
}

/**
 * Builds the `FlattenInput` for one symbol's meta (for `flushDirty`). The
 * active session's view (cursor/drawings/ranges) is reassembled from fields
 * persisted on the meta; `customTfMinutes`, `playbackSpeed` and `notes` are
 * NOT persisted locally today, so they're defaulted here (known fidelity
 * boundary — see Task 9 report).
 */
function buildFlattenInput(meta: WorkspaceMeta): FlattenInput {
  const trading = meta.trading ?? defaultTradingData();
  const [startRange, endRange] = inferRange(trading, meta.currentTime);

  const active: FlattenSession | null = {
    id: meta.activeSessionId ?? null,
    name: trading.sessionName,
    createdAt: meta.activeClientUpdatedAt ?? Date.now(),
    cursor: meta.currentTime,
    trading,
    view: {
      cursor: meta.currentTime,
      activeTf: meta.activeTf,
      customTfMinutes: null,
      playbackSpeed: 1,
      drawings: meta.drawings ?? [],
      notes: [],
      selectedTfs: meta.selectedTfs ?? [],
      startRange,
      endRange,
    },
    clientUpdatedAt: meta.activeClientUpdatedAt ?? Date.now(),
    lastOpenedAt: null,
  };

  const archived: FlattenSession[] = (meta.sessions ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    createdAt: s.createdAt,
    cursor: s.currentTime,
    trading: s.trading,
    clientUpdatedAt: s.clientUpdatedAt ?? s.createdAt,
    lastOpenedAt: null,
  }));

  return { symbol: meta.symbol, active, archived };
}
