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
import { singlePanelLayoutFor } from './session-migration';
import type {
  CloudFolderRow,
  CloudSessionRow,
  FlattenInput,
  FlattenSession,
  SessionPayloadV1,
  SessionPayloadV2,
  SessionPayloadV3,
  SessionSummary,
} from './session-sync.models';
import { WorkspaceDbService } from './workspace-db.service';
import type { SavedSession, TradingData } from '../state/trading/trading.models';
import type { WorkspaceMeta } from '../state/workspaces/workspaces.models';
import { defaultTradingData } from '../state/trading/trading.models';
import type { PlaybookRule, PlaybookRuleStatus } from '../state/playbook/playbook.models';
import type { Lesson } from '../state/lessons/lessons.models';
import type { SceneSpec } from '../domain/reflection/scene-spec';

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

  /**
   * Fetches the full lossless payload for one session (the column
   * `listSummaries` deliberately omits). Typed as `SessionPayloadV1 |
   * SessionPayloadV2 | SessionPayloadV3`: the cloud column legitimately holds
   * any version — a row written before this RFC is still V1 or V2 — and
   * callers already route the result through `parseSessionPayload`/
   * `fromPayload`, which accept all three.
   */
  async fetchPayload(id: string): Promise<SessionPayloadV1 | SessionPayloadV2 | SessionPayloadV3> {
    const { data, error } = await this.client
      .from('sessions')
      .select('payload')
      .eq('id', id)
      .single();
    if (error) throw new Error(error.message);
    return (data as { payload: SessionPayloadV1 | SessionPayloadV2 | SessionPayloadV3 }).payload;
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
  // RFC-015 Task 4: playbook_rules push/pull. Same client, same error idiom
  // as folders above. Pure I/O only — dirty filtering (isPlaybookRuleDirty)
  // and LWW merge (mergePlaybookPull) are the caller's (PlaybookEffects')
  // responsibility, kept as pure functions at the bottom of this file so the
  // spec needs no network (see playbook-sync.spec.ts).
  // ---------------------------------------------------------------------

  /**
   * Upserts every given rule as-is (no internal dirty filtering — the caller
   * decides what's dirty via `isPlaybookRuleDirty`). Any single failed
   * upsert rejects the whole call so the caller does not stamp `rulesSynced`
   * for a partially-pushed batch; retried whole on the next debounce cycle
   * (safe: upsert is idempotent and the `lww_guard` trigger no-ops a retry
   * that resends the same `client_updated_at`).
   */
  async pushPlaybookRules(rules: PlaybookRule[]): Promise<void> {
    if (!rules.length) return;
    const userId = await this.currentUserId();
    for (const rule of rules) {
      const dbRow = ruleToDbRow(rule, userId);
      const { error } = await this.client
        .from('playbook_rules')
        .upsert(dbRow, { onConflict: 'id' });
      if (error) throw new Error(error.message);
    }
  }

  /**
   * Lists every playbook rule owned by the current user (RLS-scoped
   * server-side). The select string names every field of `DbPlaybookRuleRow`
   * (including `user_id`, which `dbRowToRule` itself never reads) so the
   * `as DbPlaybookRuleRow[]` cast below is honest — it doesn't claim a
   * column that wasn't actually selected.
   */
  async pullPlaybookRules(): Promise<PlaybookRule[]> {
    const { data, error } = await this.client
      .from('playbook_rules')
      .select(
        'id,user_id,title,statement,status,shortcut_slot,sort_order,amendments,created_at,client_updated_at',
      );
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as DbPlaybookRuleRow[];
    return rows.map(dbRowToRule);
  }

  // ---------------------------------------------------------------------
  // RFC-016 Task 3: lessons push/pull. Same client, same error idiom as
  // playbook_rules above. Pure I/O only — dirty filtering (isLessonDirty)
  // and LWW merge (mergeLessonsPull) are the caller's (LessonsEffects')
  // responsibility, kept as pure functions at the bottom of this file so the
  // spec needs no network (see lessons-sync.spec.ts).
  // ---------------------------------------------------------------------

  /**
   * Upserts every given lesson as-is (no internal dirty filtering — the
   * caller decides what's dirty via `isLessonDirty`). N-5: evidence
   * (`SceneSpec[]`) must travel candle-free, so `assertNoCandles` runs
   * BEFORE any network call — including `currentUserId()`'s own round-trip —
   * so a poisoned evidence array never reaches the wire. Any single failed
   * upsert rejects the whole call so the caller does not stamp
   * `lessonsSynced` for a partially-pushed batch (playbook parity: retried
   * whole on the next debounce cycle — safe, upsert is idempotent and the
   * `lww_guard` trigger no-ops a retry that resends the same
   * `client_updated_at`).
   */
  async pushLessons(lessons: Lesson[]): Promise<void> {
    if (!lessons.length) return;
    assertNoCandles(lessons);
    const userId = await this.currentUserId();
    for (const lesson of lessons) {
      const dbRow = lessonToDbRow(lesson, userId);
      const { error } = await this.client.from('lessons').upsert(dbRow, { onConflict: 'id' });
      if (error) throw new Error(error.message);
    }
  }

  /**
   * Lists every lesson owned by the current user (RLS-scoped server-side).
   * The select string names every field of `DbLessonRow` (including
   * `user_id`, which `dbRowToLesson` itself never reads) so the
   * `as DbLessonRow[]` cast below is honest — it doesn't claim a column that
   * wasn't actually selected.
   */
  async pullLessons(): Promise<Lesson[]> {
    const { data, error } = await this.client
      .from('lessons')
      .select(
        'id,user_id,what_happened,repeat_field,avoid,linked_rule_ids,evidence,trade_refs,session_ref,authored_at,client_updated_at',
      );
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as DbLessonRow[];
    return rows.map(dbRowToLesson);
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

// ---------------------------------------------------------------------------
// RFC-015 Task 4: playbook_rules mapping + LWW merge. Pure, no DI/IO — kept
// as plain exported functions (mirrors isDirty above) so playbook-sync.spec.ts
// needs no network. Placement: session-sync.service.ts per the design spec
// (§3) and task brief, rather than a sibling playbook-sync.service.ts — the
// surface added here (two mapping fns + one merge fn + two thin CRUD methods
// on the class) is small enough that a second file would only fragment the
// "same client, same error idiom as folders" pattern this mirrors.
// ---------------------------------------------------------------------------

/** Raw Postgres row shape for public.playbook_rules (snake_case, ISO timestamps). */
export interface DbPlaybookRuleRow {
  id: string;
  user_id: string;
  title: string;
  statement: string;
  status: PlaybookRuleStatus;
  shortcut_slot: number | null;
  sort_order: number;
  amendments: string[];
  created_at: string; // ISO
  client_updated_at: string; // ISO
}

/** dirty ⇔ clientUpdatedAt > (syncedAt ?? 0), applied to a full PlaybookRule (Task 4 spec §2). */
export function isPlaybookRuleDirty(rule: PlaybookRule): boolean {
  return isDirty(rule.clientUpdatedAt, rule.syncedAt);
}

/**
 * Domain PlaybookRule -> Postgres row. `userId` is the auth.uid() owner, set
 * explicitly (mirrors owner_id/folder_id above — never relies on the column
 * default so RLS's `with check (auth.uid() = user_id)` always sees an
 * explicit match). A rule that has never been locally stamped falls back to
 * its own `createdAt` for `client_updated_at` (a rule that has never been
 * edited was, by definition, last written at creation time).
 */
export function ruleToDbRow(rule: PlaybookRule, userId: string): DbPlaybookRuleRow {
  return {
    id: rule.id,
    user_id: userId,
    title: rule.title,
    statement: rule.statement,
    status: rule.status,
    shortcut_slot: rule.shortcutSlot,
    sort_order: rule.sortOrder,
    amendments: rule.amendments,
    created_at: new Date(rule.createdAt).toISOString(),
    client_updated_at: new Date(rule.clientUpdatedAt ?? rule.createdAt).toISOString(),
  };
}

/**
 * Postgres row -> domain PlaybookRule. `syncedAt` is stamped equal to the
 * row's own `clientUpdatedAt` — a row just read from the cloud is, by
 * definition, in sync with the cloud as of that timestamp (same reasoning as
 * the folders cloud-won write-back in `pullAndMergeFolders`).
 */
export function dbRowToRule(row: DbPlaybookRuleRow): PlaybookRule {
  const clientUpdatedAt = new Date(row.client_updated_at).getTime();
  return {
    id: row.id,
    title: row.title,
    statement: row.statement,
    createdAt: new Date(row.created_at).getTime(),
    status: row.status,
    shortcutSlot: row.shortcut_slot,
    sortOrder: row.sort_order,
    amendments: row.amendments,
    clientUpdatedAt,
    syncedAt: clientUpdatedAt,
  };
}

/**
 * Pure per-row LWW merge of a local playbook set against a cloud pull.
 * Deliberately simpler than `mergeByLww` (no delete branch): a pull NEVER
 * deletes locally — a local-dirty row absent from the cloud (never pushed
 * yet, or pushed from a device that is now offline) is always KEPT, because
 * losing a trader's rule/knowledge on a stale pull would violate P-3.
 *  - id present on both sides: whichever `clientUpdatedAt` is newer wins;
 *    equal timestamps keep local (no-op).
 *  - id local-only: kept as-is (not queued for a local write — it's already
 *    there; pushing it to the cloud is `PlaybookEffects`' push cycle's job).
 *  - id cloud-only: inserted into the merged set and queued for a local
 *    IndexedDB write (`toUpsertLocally`).
 */
export function mergePlaybookPull(
  local: PlaybookRule[],
  remote: PlaybookRule[],
): { rules: PlaybookRule[]; toUpsertLocally: PlaybookRule[] } {
  const remoteById = new Map(remote.map((r) => [r.id, r]));
  const localIds = new Set(local.map((r) => r.id));

  const rules: PlaybookRule[] = [];
  const toUpsertLocally: PlaybookRule[] = [];

  for (const l of local) {
    const r = remoteById.get(l.id);
    if (!r) {
      rules.push(l); // remote-missing local row: never deleted by pull
      continue;
    }
    if ((r.clientUpdatedAt ?? 0) > (l.clientUpdatedAt ?? 0)) {
      rules.push(r);
      toUpsertLocally.push(r);
    } else {
      rules.push(l); // local newer, or a tie: local survives
    }
  }

  for (const r of remote) {
    if (!localIds.has(r.id)) {
      rules.push(r);
      toUpsertLocally.push(r);
    }
  }

  return { rules, toUpsertLocally };
}

// ---------------------------------------------------------------------------
// RFC-016 Task 3: lessons mapping + LWW merge. Pure, no DI/IO — mirrors the
// playbook_rules block immediately above line-by-line, adapted to Lesson's
// shape (three opaque text fields, evidence: SceneSpec[], no status/
// shortcutSlot/sortOrder/amendments).
// ---------------------------------------------------------------------------

/**
 * Raw Postgres row shape for public.lessons (snake_case, ISO timestamps).
 * Column naming: the domain field `Lesson.repeat` maps to `repeat_field`
 * (see the comment in supabase/lessons.sql for the full rationale).
 */
export interface DbLessonRow {
  id: string;
  user_id: string;
  what_happened: string;
  repeat_field: string;
  avoid: string;
  linked_rule_ids: string[];
  evidence: SceneSpec[];
  trade_refs: string[];
  session_ref: string;
  authored_at: string; // ISO
  client_updated_at: string; // ISO
}

/** dirty ⇔ clientUpdatedAt > (syncedAt ?? 0), applied to a full Lesson (D15.F/D16 parity with isPlaybookRuleDirty). */
export function isLessonDirty(lesson: Lesson): boolean {
  return isDirty(lesson.clientUpdatedAt, lesson.syncedAt);
}

/**
 * Domain Lesson -> Postgres row. `userId` is the auth.uid() owner, set
 * explicitly (mirrors `ruleToDbRow` above — never relies on the column
 * default so RLS's `with check (auth.uid() = user_id)` always sees an
 * explicit match). A lesson that has never been locally stamped falls back
 * to its own `authoredAt` for `client_updated_at` (a lesson that has never
 * been edited was, by definition, last written at authoring time).
 */
export function lessonToDbRow(lesson: Lesson, userId: string): DbLessonRow {
  return {
    id: lesson.id,
    user_id: userId,
    what_happened: lesson.whatHappened,
    repeat_field: lesson.repeat,
    avoid: lesson.avoid,
    linked_rule_ids: lesson.linkedRuleIds,
    evidence: lesson.evidence,
    trade_refs: lesson.tradeRefs,
    session_ref: lesson.sessionRef,
    authored_at: new Date(lesson.authoredAt).toISOString(),
    client_updated_at: new Date(lesson.clientUpdatedAt ?? lesson.authoredAt).toISOString(),
  };
}

/**
 * Postgres row -> domain Lesson. `syncedAt` is stamped equal to the row's
 * own `clientUpdatedAt` — a row just read from the cloud is, by definition,
 * in sync with the cloud as of that timestamp (playbook parity, see
 * `dbRowToRule`).
 */
export function dbRowToLesson(row: DbLessonRow): Lesson {
  const clientUpdatedAt = new Date(row.client_updated_at).getTime();
  return {
    id: row.id,
    authoredAt: new Date(row.authored_at).getTime(),
    whatHappened: row.what_happened,
    repeat: row.repeat_field,
    avoid: row.avoid,
    linkedRuleIds: row.linked_rule_ids,
    evidence: row.evidence,
    tradeRefs: row.trade_refs,
    sessionRef: row.session_ref,
    clientUpdatedAt,
    syncedAt: clientUpdatedAt,
  };
}

/**
 * Pure per-row LWW merge of a local lesson set against a cloud pull.
 * Deliberately simpler than `mergeByLww` (no delete branch): a pull NEVER
 * deletes locally — a local-dirty row absent from the cloud (never pushed
 * yet, or pushed from a device that is now offline) is always KEPT, because
 * losing a trader's authored knowledge on a stale pull would violate P-3
 * (mirrors `mergePlaybookPull` exactly).
 *  - id present on both sides: whichever `clientUpdatedAt` is newer wins;
 *    equal timestamps keep local (no-op).
 *  - id local-only: kept as-is (not queued for a local write — it's already
 *    there; pushing it to the cloud is `LessonsEffects`' push cycle's job).
 *  - id cloud-only: inserted into the merged set and queued for a local
 *    IndexedDB write (`toUpsertLocally`).
 */
export function mergeLessonsPull(
  local: Lesson[],
  remote: Lesson[],
): { lessons: Lesson[]; toUpsertLocally: Lesson[] } {
  const remoteById = new Map(remote.map((r) => [r.id, r]));
  const localIds = new Set(local.map((l) => l.id));

  const lessons: Lesson[] = [];
  const toUpsertLocally: Lesson[] = [];

  for (const l of local) {
    const r = remoteById.get(l.id);
    if (!r) {
      lessons.push(l); // remote-missing local row: never deleted by pull
      continue;
    }
    if ((r.clientUpdatedAt ?? 0) > (l.clientUpdatedAt ?? 0)) {
      lessons.push(r);
      toUpsertLocally.push(r);
    } else {
      lessons.push(l); // local newer, or a tie: local survives
    }
  }

  for (const r of remote) {
    if (!localIds.has(r.id)) {
      lessons.push(r);
      toUpsertLocally.push(r);
    }
  }

  return { lessons, toUpsertLocally };
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
 *
 * RFC-011 Task 4: `WorkspaceMeta` now carries `layout`/`panels`/`linkGroups`
 * (see workspaces.models.ts). They are read straight off the meta when
 * present; `singlePanelLayoutFor`/`[]` remain the fallback for a legacy
 * pre-RFC-011 meta record that predates these fields (mirrors
 * `migrateV1ToV2`'s own default, so a never-persisted-layout asset still
 * gets a valid single-panel layout rather than `undefined`).
 */
function buildFlattenInput(meta: WorkspaceMeta): FlattenInput {
  const trading = meta.trading ?? defaultTradingData();
  const [startRange, endRange] = inferRange(trading, meta.currentTime);
  const fallback = singlePanelLayoutFor(meta.symbol, meta.activeTf ?? 'M1');

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
      drawings: { version: 2, items: meta.drawings ?? [] },
      notes: [],
      selectedTfs: meta.selectedTfs ?? [],
      startRange,
      endRange,
      layout: meta.layout ?? fallback.layout,
      panels: meta.panels ?? fallback.panels,
      linkGroups: meta.linkGroups ?? [],
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
