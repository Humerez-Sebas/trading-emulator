import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionSyncService } from './session-sync.service';
import type { SupabaseService } from '../auth/supabase.service';
import { PAYLOAD_MAX_BYTES, reconstructWorkspaces } from './session-sync.mapping';
import { SESSION_PAYLOAD_VERSION_3 } from './session-sync.models';
import type { CloudFolderRow, CloudSessionRow, SessionPayloadV1 } from './session-sync.models';
import { WorkspaceDbService } from './workspace-db.service';
import { fixedOwnerIdentity } from './owner-identity.service';
import { ownerWorkspaceDbName } from './owner-scope';
import { DB_VERSION as MARKET_DB_VERSION } from './market-data-db';
import { workspaceMeta, savedSession, position } from '../testing/fixtures';
import { defaultTradingData } from '../state/trading/trading.models';
import type { SessionFolder } from '../state/trading/trading.models';
import type { WorkspaceMeta } from '../state/workspaces/workspaces.models';
import { singlePanelLayoutFor } from './session-migration';
import type { LinkGroup } from '../state/link-groups/link-groups.models';

/** Owner every test in this file runs as (Session Sovereignty V2: user stores are per-owner). */
const OWNER = 'owner-test';
/** A DIFFERENT account signing in on the same browser profile. */
const OTHER_OWNER = 'owner-intruder';

function makeService(client: unknown, db?: WorkspaceDbService): SessionSyncService {
  return new SessionSyncService(
    { client } as unknown as SupabaseService,
    db ?? new WorkspaceDbService(fixedOwnerIdentity(OWNER)),
  );
}

const SYNC_DB_NAME = 'emulador-workspaces';

function deleteDb(name: string): Promise<void> {
  return new Promise<void>((res, rej) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => res();
    req.onerror = () => rej(req.error);
    req.onblocked = () => res();
  });
}

/**
 * Delete every database the service now spans — the shared market-data one
 * (which also carries the legacy quarantine) and BOTH owners' user databases —
 * and return a fresh, real (fake-indexeddb-backed) `WorkspaceDbService`.
 */
async function freshDb(ownerId: string = OWNER): Promise<WorkspaceDbService> {
  await deleteDb(SYNC_DB_NAME);
  await deleteDb(ownerWorkspaceDbName(OWNER));
  await deleteDb(ownerWorkspaceDbName(OTHER_OWNER));
  return new WorkspaceDbService(fixedOwnerIdentity(ownerId));
}

/** A `WorkspaceDbService` for another owner on the same origin (no DB deletion). */
function dbFor(ownerId: string): WorkspaceDbService {
  return new WorkspaceDbService(fixedOwnerIdentity(ownerId));
}

/**
 * Writes records straight into the legacy, un-owned `meta`/`folders` stores of
 * the SHARED database — the quarantine — the way a pre-split install left them.
 * Bypasses the service deliberately: `WorkspaceDbService` exposes no write path
 * into the quarantine, which is the whole point of the design.
 */
async function seedQuarantine(opts: {
  metas?: WorkspaceMeta[];
  folders?: SessionFolder[];
}): Promise<void> {
  // Open through the service first so the shared schema exists at DB_VERSION.
  await dbFor(OWNER).listDatasets();
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(SYNC_DB_NAME, MARKET_DB_VERSION);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['meta', 'folders'], 'readwrite');
    for (const m of opts.metas ?? []) tx.objectStore('meta').put(m);
    for (const f of opts.folders ?? []) tx.objectStore('folders').put(f);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

// ---------------------------------------------------------------------------
// Fake Supabase client — no network. Each builder method is awaitable
// (implements `then`) so call chains like `.select(...).eq(...)` and
// `.select(...).eq(...).single()` resolve the same way the real client does.
// ---------------------------------------------------------------------------

interface FakeResult {
  data: unknown;
  error: { message: string } | null;
  /**
   * Mirrors PostgREST's `count` (populated only when the caller passes
   * `{ count: 'exact' }`). `undefined` models a client that never asked.
   */
  count?: number | null;
}

class FakeQueryBuilder implements PromiseLike<FakeResult> {
  selectCols: string | undefined;
  selectOpts: { count?: string } | undefined;
  eqCol: string | undefined;
  eqVal: unknown;
  upsertRow: unknown;
  upsertOpts: unknown;
  deleted = false;

  constructor(
    private readonly table: string,
    private readonly recorder: Recorder,
  ) {}

  select(cols: string, opts?: { count?: string }): this {
    this.selectCols = cols;
    this.selectOpts = opts;
    return this;
  }

  eq(col: string, val: unknown): this {
    this.eqCol = col;
    this.eqVal = val;
    return this;
  }

  delete(): this {
    this.deleted = true;
    this.recorder.callOrder.push(`delete:${this.table}`);
    return this;
  }

  upsert(row: unknown, opts: unknown): this {
    this.upsertRow = row;
    this.upsertOpts = opts;
    this.recorder.upsertCalls.push({ table: this.table, row, opts });
    this.recorder.callOrder.push(`upsert:${this.table}`);
    return this;
  }

  single(): Promise<FakeResult> {
    return Promise.resolve(this.recorder.resolveSingle(this.table, this));
  }

  then<TResult1 = FakeResult, TResult2 = never>(
    onfulfilled?: (value: FakeResult) => TResult1 | PromiseLike<TResult1>,
    onrejected?: (reason: unknown) => TResult2 | PromiseLike<TResult2>,
  ): PromiseLike<TResult1 | TResult2> {
    if (this.deleted) {
      this.recorder.deleteCalls.push({ table: this.table, eqCol: this.eqCol, eqVal: this.eqVal });
      const result = this.recorder.resolveDelete(this.table, this);
      return Promise.resolve(result).then(onfulfilled, onrejected);
    }
    if (this.upsertRow !== undefined) {
      const result = this.recorder.resolveUpsert(this.table, this);
      return Promise.resolve(result).then(onfulfilled, onrejected);
    }
    // select(...) — record only here (not in select()) so we know which
    // table/call this resolves; also where a one-shot rejection is honored.
    this.recorder.callOrder.push(`select:${this.table}`);
    const rejectFn = this.recorder.rejectSelectOnce?.[this.table];
    if (rejectFn?.()) {
      return Promise.reject(new Error(`fake-reject:${this.table}`)).then(onfulfilled, onrejected);
    }
    const result = this.recorder.resolveSelect(this.table, this);
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}

interface Recorder {
  upsertCalls: { table: string; row: unknown; opts: unknown }[];
  deleteCalls: { table: string; eqCol: string | undefined; eqVal: unknown }[];
  callOrder: string[];
  resolveSelect: (table: string, b: FakeQueryBuilder) => FakeResult;
  resolveSingle: (table: string, b: FakeQueryBuilder) => FakeResult;
  resolveUpsert: (table: string, b: FakeQueryBuilder) => FakeResult;
  resolveDelete: (table: string, b: FakeQueryBuilder) => FakeResult;
  /** Per-table one-shot "reject the next select" toggles (offline-resilience test). */
  rejectSelectOnce?: Record<string, () => boolean>;
}

function makeFakeClient(opts: {
  summaryRows?: unknown[];
  payload?: unknown;
  folderRows?: unknown[];
  userId?: string | null;
  /**
   * Server-side EXACT row totals, as PostgREST would report them under
   * `Prefer: count=exact`. Set one HIGHER than the corresponding `*Rows`
   * length to model a response the server truncated at `db-max-rows`.
   * Omitted ⇒ the totals equal what was returned (a complete answer).
   */
  summaryCount?: number;
  folderCount?: number;
}) {
  /** PostgREST only populates `count` when the caller asked for it. */
  const countFor = (b: FakeQueryBuilder, total: number | undefined, rows: unknown[]) =>
    b.selectOpts?.count === 'exact' ? (total ?? rows.length) : undefined;

  const recorder: Recorder = {
    upsertCalls: [],
    deleteCalls: [],
    callOrder: [],
    resolveSelect: (table, b) => {
      if (table === 'sessions') {
        const rows = opts.summaryRows ?? [];
        return { data: rows, error: null, count: countFor(b, opts.summaryCount, rows) };
      }
      if (table === 'folders') {
        const rows = opts.folderRows ?? [];
        return { data: rows, error: null, count: countFor(b, opts.folderCount, rows) };
      }
      return { data: [], error: null };
    },
    resolveSingle: () => ({ data: { payload: opts.payload }, error: null }),
    resolveUpsert: () => ({ data: null, error: null }),
    resolveDelete: () => ({ data: null, error: null }),
  };

  const client = {
    auth: {
      getSession: async () => ({
        data: { session: opts.userId === null ? null : { user: { id: opts.userId ?? 'user-1' } } },
      }),
    },
    from: (table: string) => new FakeQueryBuilder(table, recorder),
  };

  return { client, recorder };
}

function cleanPayload(): SessionPayloadV1 {
  return {
    schemaVersion: 1,
    trading: {} as never,
    currentTime: 1700000000,
    activeTf: 'H1',
    customTfMinutes: null,
    playbackSpeed: 1,
    drawings: [],
    notes: [],
    selectedTfs: ['H1'],
    startRange: 1699000000,
    endRange: 1700200000,
    requiredDatasets: [],
  };
}

function cleanRow(overrides: Partial<CloudSessionRow> = {}): CloudSessionRow {
  return {
    id: 'sess-1',
    symbol: 'EURUSD',
    name: 'Plan A',
    folderId: null,
    schemaVersion: 1,
    createdAt: 1_700_000_000_000,
    clientUpdatedAt: 1_700_050_000_000,
    lastOpenedAt: null,
    tradeCount: 0,
    initialBalance: 10000,
    balance: 10000,
    cursor: 1700050000,
    requiredDatasets: [],
    payload: cleanPayload(),
    ...overrides,
  };
}

describe('SessionSyncService.listSummaries', () => {
  it('selects without payload and maps rows to SessionSummary shape', async () => {
    const row = {
      id: 's1',
      name: 'Plan A',
      symbol: 'EURUSD',
      folder_id: 'f1',
      client_updated_at: '2024-01-01T00:00:00.000Z',
      last_opened_at: '2024-01-02T00:00:00.000Z',
      required_datasets: [{ symbol: 'EURUSD', timeframe: 'H1' }],
      trades_count: 5,
      initial_balance: 10000,
      balance: 10500,
      cursor: 1700050000,
      schema_version: 1,
      summary: { winRate: 0.6, sparkline: [1, 2, 3] },
    };
    const { client } = makeFakeClient({ summaryRows: [row] });
    const service = makeService(client);

    const result = await service.listSummaries();

    expect(result).toEqual([
      {
        id: 's1',
        name: 'Plan A',
        symbol: 'EURUSD',
        folderId: 'f1',
        schemaVersion: 1,
        updatedAt: '2024-01-01T00:00:00.000Z',
        lastOpenedAt: '2024-01-02T00:00:00.000Z',
        requiredDatasets: [{ symbol: 'EURUSD', timeframe: 'H1' }],
        tradeCount: 5,
        initialBalance: 10000,
        balance: 10500,
        cursor: 1700050000,
        winRate: 0.6,
        sparkline: [1, 2, 3],
      },
    ]);
  });

  it('issues a select string that does NOT contain "payload"', async () => {
    const { client, recorder } = makeFakeClient({ summaryRows: [] });
    const service = makeService(client);
    let capturedCols: string | undefined;
    const originalResolveSelect = recorder.resolveSelect;
    recorder.resolveSelect = (table, b) => {
      capturedCols = b.selectCols;
      return originalResolveSelect(table, b);
    };

    await service.listSummaries();

    expect(capturedCols).toBeDefined();
    expect(capturedCols).not.toContain('payload');
  });

  it('defaults requiredDatasets to [] when null', async () => {
    const row = {
      id: 's1',
      name: 'Plan A',
      symbol: 'EURUSD',
      folder_id: null,
      client_updated_at: '2024-01-01T00:00:00.000Z',
      last_opened_at: null,
      required_datasets: null,
      trades_count: 0,
      initial_balance: 10000,
      balance: 10000,
      cursor: 0,
      schema_version: 1,
      summary: null,
    };
    const { client } = makeFakeClient({ summaryRows: [row] });
    const service = makeService(client);

    const result = await service.listSummaries();

    expect(result[0].requiredDatasets).toEqual([]);
    expect(result[0].winRate).toBeUndefined();
    expect(result[0].sparkline).toBeUndefined();
  });
});

describe('SessionSyncService.fetchPayload', () => {
  it('selects payload, filters by id, returns the payload object', async () => {
    const payload = cleanPayload();
    const { client } = makeFakeClient({ payload });
    const service = makeService(client);

    const result = await service.fetchPayload('sess-1');

    expect(result).toEqual(payload);
  });
});

describe('SessionSyncService.upsertSession', () => {
  it('upserts a dbRow with owner_id, snake_case keys, ISO client_updated_at, and payload', async () => {
    const { client, recorder } = makeFakeClient({ userId: 'user-1' });
    const service = makeService(client);
    const row = cleanRow();

    await service.upsertSession(row);

    expect(recorder.upsertCalls.length).toBe(1);
    const { table, row: dbRow, opts } = recorder.upsertCalls[0];
    expect(table).toBe('sessions');
    expect(opts).toEqual({ onConflict: 'id' });
    const r = dbRow as Record<string, unknown>;
    expect(r['owner_id']).toBe('user-1');
    expect(r['id']).toBe('sess-1');
    expect(r['symbol']).toBe('EURUSD');
    expect(r['folder_id']).toBeNull();
    expect(r['schema_version']).toBe(1);
    expect(r['trades_count']).toBe(0);
    expect(r['initial_balance']).toBe(10000);
    expect(r['balance']).toBe(10000);
    expect(r['cursor']).toBe(1700050000);
    expect(r['client_updated_at']).toBe(new Date(row.clientUpdatedAt).toISOString());
    expect(r['created_at']).toBe(new Date(row.createdAt).toISOString());
    expect(r['last_opened_at']).toBeNull();
    expect(r['payload']).toEqual(row.payload);
    expect(r).not.toHaveProperty('updated_at');
  });

  it('converts a non-null lastOpenedAt (ms) to an ISO string', async () => {
    const { client, recorder } = makeFakeClient({ userId: 'user-1' });
    const service = makeService(client);
    const row = cleanRow({ lastOpenedAt: 1_700_060_000_000 });

    await service.upsertSession(row);

    const r = recorder.upsertCalls[0].row as Record<string, unknown>;
    expect(r['last_opened_at']).toBe(new Date(1_700_060_000_000).toISOString());
  });

  it('rejects an over-2MB payload WITHOUT calling upsert (size guard runs before network)', async () => {
    const { client, recorder } = makeFakeClient({ userId: 'user-1' });
    const service = makeService(client);
    const huge = {
      ...cleanPayload(),
      blob: 'x'.repeat(PAYLOAD_MAX_BYTES + 10),
    } as unknown as SessionPayloadV1;
    const row = cleanRow({ payload: huge });

    await expect(service.upsertSession(row)).rejects.toThrow();
    expect(recorder.upsertCalls.length).toBe(0);
  });

  it('rejects a payload containing a forbidden candle field WITHOUT calling upsert', async () => {
    const { client, recorder } = makeFakeClient({ userId: 'user-1' });
    const service = makeService(client);
    const withCandles = {
      ...cleanPayload(),
      series: [{ time: 1, open: 1 }],
    } as unknown as SessionPayloadV1;
    const row = cleanRow({ payload: withCandles });

    await expect(service.upsertSession(row)).rejects.toThrow(/candle|series|ohlc/i);
    expect(recorder.upsertCalls.length).toBe(0);
  });

  it('throws a Spanish error when there is no active session', async () => {
    const { client } = makeFakeClient({ userId: null });
    const service = makeService(client);

    await expect(service.upsertSession(cleanRow())).rejects.toThrow(/sesión activa/i);
  });
});

describe('SessionSyncService.deleteSession / deleteFolder', () => {
  it('deleteSession issues a delete filtered by id, no throw', async () => {
    const { client } = makeFakeClient({});
    const service = makeService(client);

    await expect(service.deleteSession('sess-1')).resolves.toBeUndefined();
  });

  it('deleteFolder issues a delete filtered by id, no throw', async () => {
    const { client } = makeFakeClient({});
    const service = makeService(client);

    await expect(service.deleteFolder('folder-1')).resolves.toBeUndefined();
  });
});

describe('SessionSyncService.listFolders', () => {
  it('maps rows to CloudFolderRow with clientUpdatedAt converted ISO -> ms (number)', async () => {
    const iso = '2024-01-01T00:00:00.000Z';
    const rows = [{ id: 'f1', name: 'My Folder', sort: 2, client_updated_at: iso }];
    const { client } = makeFakeClient({ folderRows: rows });
    const service = makeService(client);

    const result = await service.listFolders();

    expect(result).toEqual([
      { id: 'f1', name: 'My Folder', sort: 2, clientUpdatedAt: new Date(iso).getTime() },
    ] satisfies CloudFolderRow[]);
    expect(typeof result[0].clientUpdatedAt).toBe('number');
  });
});

describe('SessionSyncService.upsertFolder', () => {
  it('upserts a folder dbRow with owner_id and ISO client_updated_at', async () => {
    const { client, recorder } = makeFakeClient({ userId: 'user-1' });
    const service = makeService(client);
    const row: CloudFolderRow = {
      id: 'f1',
      name: 'My Folder',
      sort: 0,
      clientUpdatedAt: 1_700_000_000_000,
    };

    await service.upsertFolder(row);

    expect(recorder.upsertCalls.length).toBe(1);
    const { table, row: dbRow, opts } = recorder.upsertCalls[0];
    expect(table).toBe('folders');
    expect(opts).toEqual({ onConflict: 'id' });
    const r = dbRow as Record<string, unknown>;
    expect(r['owner_id']).toBe('user-1');
    expect(r['id']).toBe('f1');
    expect(r['name']).toBe('My Folder');
    expect(r['sort']).toBe(0);
    expect(r['client_updated_at']).toBe(new Date(1_700_000_000_000).toISOString());
  });
});

describe('SessionSyncService error propagation', () => {
  it('listSummaries throws Error(error.message) on DB error', async () => {
    const { client } = makeFakeClient({});
    client.from = () => {
      const b = new FakeQueryBuilder('sessions', {
        upsertCalls: [],
        deleteCalls: [],
        callOrder: [],
        resolveSelect: () => ({ data: null, error: { message: 'boom' } }),
        resolveSingle: () => ({ data: null, error: { message: 'boom' } }),
        resolveUpsert: () => ({ data: null, error: { message: 'boom' } }),
        resolveDelete: () => ({ data: null, error: { message: 'boom' } }),
      });
      return b;
    };
    const service = makeService(client);

    await expect(service.listSummaries()).rejects.toThrow('boom');
  });
});

// ---------------------------------------------------------------------------
// Task 9: pullAndMerge / flushDirty / flushPendingDeletes — orchestration
// over a REAL in-memory WorkspaceDbService (fake-indexeddb) + the fake
// Supabase client above (extended with listFolders/listSummaries support).
// ---------------------------------------------------------------------------

describe('SessionSyncService.flushPendingDeletes', () => {
  let db: WorkspaceDbService;

  beforeEach(async () => {
    db = await freshDb();
  });

  it('replays a pending session delete and a pending folder delete, then clears them', async () => {
    await db.addPendingDelete({ entity: 'session', id: 'sess-1' });
    await db.addPendingDelete({ entity: 'folder', id: 'folder-1' });
    const { client, recorder } = makeFakeClient({});
    const service = makeService(client, db);

    await service.flushPendingDeletes();

    expect(recorder.deleteCalls).toEqual(
      expect.arrayContaining([
        { table: 'sessions', eqCol: 'id', eqVal: 'sess-1' },
        { table: 'folders', eqCol: 'id', eqVal: 'folder-1' },
      ]),
    );
    expect(await db.listPendingDeletes()).toEqual([]);
  });

  it('one failing delete does not abort the others and is left pending', async () => {
    await db.addPendingDelete({ entity: 'session', id: 'sess-bad' });
    await db.addPendingDelete({ entity: 'folder', id: 'folder-ok' });
    const { client } = makeFakeClient({});
    client.from = (table: string) =>
      new FakeQueryBuilder(table, {
        upsertCalls: [],
        deleteCalls: [],
        callOrder: [],
        resolveSelect: () => ({ data: [], error: null }),
        resolveSingle: () => ({ data: null, error: null }),
        resolveUpsert: () => ({ data: null, error: null }),
        resolveDelete: (t) =>
          t === 'sessions'
            ? { data: null, error: { message: 'boom' } }
            : { data: null, error: null },
      });
    const service = makeService(client, db);

    await expect(service.flushPendingDeletes()).resolves.toBeUndefined();

    const remaining = await db.listPendingDeletes();
    expect(remaining).toEqual([{ entity: 'session', id: 'sess-bad' }]);
  });
});

describe('SessionSyncService.flushDirty — folders', () => {
  let db: WorkspaceDbService;

  beforeEach(async () => {
    db = await freshDb();
  });

  it('upserts a dirty folder (sort from local order) and advances its syncedAt', async () => {
    await db.putFolder({
      id: 'f1',
      name: 'Estrategia A',
      order: 3,
      clientUpdatedAt: 5000,
      syncedAt: 1000,
    });
    const { client, recorder } = makeFakeClient({ userId: 'user-1' });
    const service = makeService(client, db);

    await service.flushDirty();

    expect(recorder.upsertCalls.length).toBe(1);
    const row = recorder.upsertCalls[0].row as Record<string, unknown>;
    expect(row['sort']).toBe(3);
    const stored = (await db.listFolders())[0];
    expect(stored.syncedAt).toBe(5000);
  });

  it('does not push a clean folder', async () => {
    await db.putFolder({
      id: 'f2',
      name: 'Limpia',
      order: 0,
      clientUpdatedAt: 1000,
      syncedAt: 1000,
    });
    const { client, recorder } = makeFakeClient({ userId: 'user-1' });
    const service = makeService(client, db);

    await service.flushDirty();

    expect(recorder.upsertCalls.length).toBe(0);
  });
});

describe('SessionSyncService.pullAndMerge', () => {
  let db: WorkspaceDbService;

  beforeEach(async () => {
    db = await freshDb();
  });

  it('runs flushPendingDeletes BEFORE the folder/session pulls, and sets lastPullAt at the end', async () => {
    await db.addPendingDelete({ entity: 'session', id: 'sess-old' });
    const { client, recorder } = makeFakeClient({ summaryRows: [], folderRows: [] });
    const service = makeService(client, db);

    expect(await db.getLastPullAt()).toBeNull();

    await service.pullAndMerge();

    const deleteIdx = recorder.callOrder.indexOf('delete:sessions');
    const foldersSelectIdx = recorder.callOrder.indexOf('select:folders');
    const sessionsSelectIdx = recorder.callOrder.indexOf('select:sessions');
    expect(deleteIdx).toBeGreaterThanOrEqual(0);
    expect(deleteIdx).toBeLessThan(foldersSelectIdx);
    expect(deleteIdx).toBeLessThan(sessionsSelectIdx);
    expect(await db.getLastPullAt()).not.toBeNull();
  });

  it('a cloud-newer session is left for lazy payload refresh on open (not re-pushed, local data intact)', async () => {
    const meta = workspaceMeta({
      symbol: 'EURUSD',
      activeSessionId: undefined,
      sessions: [
        savedSession({
          id: 'sess-1',
          name: 'Local',
          clientUpdatedAt: 1000,
          syncedAt: 1000,
        }),
      ],
    });
    await db.putMeta(meta);

    const cloudRow = {
      id: 'sess-1',
      name: 'Cloud',
      symbol: 'EURUSD',
      folder_id: null,
      client_updated_at: new Date(5000).toISOString(),
      last_opened_at: null,
      required_datasets: [],
      trades_count: 0,
      initial_balance: 10000,
      balance: 10000,
      cursor: 0,
      schema_version: 1,
      summary: null,
    };
    const { client, recorder } = makeFakeClient({ summaryRows: [cloudRow], folderRows: [] });
    const service = makeService(client, db);

    await service.pullAndMerge();

    // cloud-newer => not pushed back to the cloud
    expect(recorder.upsertCalls.find((c) => c.table === 'sessions')).toBeUndefined();

    // Cloud-won sessions are NOT materialized here — the full payload (name,
    // trading, etc.) is fetched lazily on open (spec §11 step 6 /
    // reconstructWorkspaces + fetchPayload), not during pullAndMerge. The
    // local copy must remain exactly as it was until that lazy refresh.
    const updated = await db.getMeta('EURUSD');
    const stillLocal = updated?.sessions?.find((s) => s.id === 'sess-1');
    expect(stillLocal?.name).toBe('Local');
  });

  it('a never-synced local session is pushed (upsertSession called)', async () => {
    const meta = workspaceMeta({
      symbol: 'EURUSD',
      activeSessionId: undefined,
      sessions: [
        savedSession({
          id: 'sess-new',
          name: 'Nueva local',
          clientUpdatedAt: 9000,
          syncedAt: undefined,
        }),
      ],
    });
    await db.putMeta(meta);

    const { client, recorder } = makeFakeClient({ summaryRows: [], folderRows: [] });
    const service = makeService(client, db);

    await service.pullAndMerge();

    const sessionUpsert = recorder.upsertCalls.find((c) => c.table === 'sessions');
    expect(sessionUpsert).toBeDefined();
    expect((sessionUpsert!.row as Record<string, unknown>)['id']).toBe('sess-new');
  });

  it('a synced-absent local session is removed (D1) and not re-pushed', async () => {
    const meta = workspaceMeta({
      symbol: 'EURUSD',
      activeSessionId: undefined,
      sessions: [
        savedSession({
          id: 'sess-gone',
          name: 'Borrada en otro dispositivo',
          clientUpdatedAt: 1000,
          syncedAt: 1000,
        }),
      ],
    });
    await db.putMeta(meta);

    const { client, recorder } = makeFakeClient({ summaryRows: [], folderRows: [] });
    const service = makeService(client, db);

    await service.pullAndMerge();

    const updated = await db.getMeta('EURUSD');
    expect(updated?.sessions?.some((s) => s.id === 'sess-gone')).toBe(false);
    expect(recorder.upsertCalls.find((c) => c.table === 'sessions')).toBeUndefined();
  });

  it('offline resilience: a rejecting listSummaries does not throw and leaves local state intact', async () => {
    const meta = workspaceMeta({
      symbol: 'EURUSD',
      activeSessionId: undefined,
      sessions: [savedSession({ id: 'sess-keep', clientUpdatedAt: 1000, syncedAt: 1000 })],
    });
    await db.putMeta(meta);

    const { client, recorder } = makeFakeClient({ summaryRows: [], folderRows: [] });
    let rejected = false;
    recorder.rejectSelectOnce = {
      sessions: () => {
        if (!rejected) {
          rejected = true;
          return true;
        }
        return false;
      },
    };
    const service = makeService(client, db);

    await expect(service.pullAndMerge()).resolves.toBeUndefined();

    const stillThere = await db.getMeta('EURUSD');
    expect(stillThere?.sessions?.some((s) => s.id === 'sess-keep')).toBe(true);
    expect(await db.getLastPullAt()).not.toBeNull();
  });

  it('a synced-absent ACTIVE session is cleared locally (D1) without a cloud delete or re-push', async () => {
    const meta = workspaceMeta({
      symbol: 'EURUSD',
      activeSessionId: 'A',
      activeClientUpdatedAt: 1000,
      activeSyncedAt: 1000,
      trading: { ...defaultTradingData(), positions: [position()] },
    });
    await db.putMeta(meta);

    // Cloud no longer has 'A' — it was deleted on another device.
    const { client, recorder } = makeFakeClient({ summaryRows: [], folderRows: [] });
    const service = makeService(client, db);

    await service.pullAndMerge();

    const updated = await db.getMeta('EURUSD');
    expect(updated?.activeSessionId).toBeUndefined();
    expect(updated?.trading?.positions ?? []).toEqual([]);
    expect(updated?.trading?.history ?? []).toEqual([]);
    expect(updated?.trading?.sessionName ?? null).toBeNull();

    // D1 removal of the active session is local-only — never a cloud delete,
    // and never re-pushed/re-created as an upsert.
    expect(
      recorder.deleteCalls.find((c) => c.table === 'sessions' && c.eqVal === 'A'),
    ).toBeUndefined();
    expect(
      recorder.upsertCalls.find(
        (c) => c.table === 'sessions' && (c.row as Record<string, unknown>)['id'] === 'A',
      ),
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TD-E5 red team: absence is DESTRUCTIVE (mergeByLww D1), so a pull that is
// merely INCOMPLETE — a page PostgREST silently capped at `db-max-rows`, HTTP
// 200, no error — would delete local entities that still exist in the cloud.
// `assertCompletePull` compares the returned row count against the server's own
// exact count and fails closed into the caller's existing offline catch.
//
// These specs pin the hazard, not just the fix: each one FAILS on the
// pre-guard code (the omitted rows get deleted).
// ---------------------------------------------------------------------------

function summaryRow(id: string, clientUpdatedAt = '2024-01-01T00:00:00.000Z') {
  return {
    id,
    name: id,
    symbol: 'EURUSD',
    folder_id: null,
    client_updated_at: clientUpdatedAt,
    last_opened_at: null,
    required_datasets: [],
    trades_count: 0,
    initial_balance: 10000,
    balance: 10000,
    cursor: 1700050000,
    schema_version: 3,
    summary: null,
  };
}

describe('SessionSyncService — truncated cloud pull must not delete local data (TD-E5)', () => {
  let db: WorkspaceDbService;

  beforeEach(async () => {
    db = await freshDb();
  });

  it('listSummaries throws when the server reports more rows than it returned', async () => {
    const { client } = makeFakeClient({
      summaryRows: [summaryRow('a'), summaryRow('b')],
      summaryCount: 3, // server holds 3; the page carried 2
    });

    await expect(makeService(client).listSummaries()).rejects.toThrow(/incompleta/i);
  });

  it('listFolders throws when the server reports more rows than it returned', async () => {
    const { client } = makeFakeClient({
      folderRows: [{ id: 'f1', name: 'A', sort: 0, client_updated_at: '2024-01-01T00:00:00.000Z' }],
      folderCount: 2,
    });

    await expect(makeService(client).listFolders()).rejects.toThrow(/incompleta/i);
  });

  it('a synced local session OMITTED from a truncated page survives the pull', async () => {
    const meta = workspaceMeta({
      symbol: 'EURUSD',
      activeSessionId: undefined,
      sessions: [
        savedSession({ id: 'sess-returned', clientUpdatedAt: 1000, syncedAt: 1000 }),
        savedSession({ id: 'sess-omitted', clientUpdatedAt: 1000, syncedAt: 1000 }),
      ],
    });
    await db.putMeta(meta);

    // The cloud still holds BOTH rows (count: 2) but the page carried only one.
    const { client, recorder } = makeFakeClient({
      summaryRows: [summaryRow('sess-returned')],
      summaryCount: 2,
      folderRows: [],
    });

    await makeService(client, db).pullAndMerge();

    const updated = await db.getMeta('EURUSD');
    const ids = (updated?.sessions ?? []).map((s) => s.id);
    expect(ids).toContain('sess-omitted');
    expect(ids).toContain('sess-returned');
    // Fail-closed means the whole merge is skipped — never a cloud delete.
    expect(recorder.deleteCalls.filter((c) => c.table === 'sessions')).toEqual([]);
  });

  it('a DIRTY (unpushed) local session omitted from a truncated page is preserved AND pushed', async () => {
    // The unrecoverable case: syncedAt=1000 is what the cloud holds, but the
    // user has edited since (clientUpdatedAt=2000) and that delta exists ONLY
    // locally. `pullAndMerge` deletes at step 3 and flushes at step 5, so
    // without the guard the delta is destroyed before the flush could save it.
    const meta = workspaceMeta({
      symbol: 'EURUSD',
      activeSessionId: undefined,
      sessions: [savedSession({ id: 'sess-dirty', clientUpdatedAt: 2000, syncedAt: 1000 })],
    });
    await db.putMeta(meta);

    const { client, recorder } = makeFakeClient({
      summaryRows: [],
      summaryCount: 7, // server has rows it did not return
      folderRows: [],
    });

    await makeService(client, db).pullAndMerge();

    const updated = await db.getMeta('EURUSD');
    const kept = (updated?.sessions ?? []).find((s) => s.id === 'sess-dirty');
    expect(kept).toBeDefined();
    // ...and the unpushed delta is now safely in the cloud rather than lost.
    expect(
      recorder.upsertCalls.find(
        (c) => c.table === 'sessions' && (c.row as Record<string, unknown>)['id'] === 'sess-dirty',
      ),
    ).toBeDefined();
  });

  it('a synced-absent ACTIVE session keeps its trading data when the page was truncated', async () => {
    const meta = workspaceMeta({
      symbol: 'EURUSD',
      activeSessionId: 'A',
      activeClientUpdatedAt: 1000,
      activeSyncedAt: 1000,
      trading: { ...defaultTradingData(), positions: [position()] },
    });
    await db.putMeta(meta);

    const { client } = makeFakeClient({ summaryRows: [], summaryCount: 4, folderRows: [] });

    await makeService(client, db).pullAndMerge();

    const updated = await db.getMeta('EURUSD');
    expect(updated?.activeSessionId).toBe('A');
    expect(updated?.trading?.positions ?? []).toHaveLength(1);
  });

  it('a synced local folder omitted from a truncated page is not deleted', async () => {
    await db.putFolder({ id: 'f-omitted', name: 'Estrategias', order: 0, clientUpdatedAt: 1000, syncedAt: 1000 });

    const { client } = makeFakeClient({ summaryRows: [], folderRows: [], folderCount: 3 });

    await makeService(client, db).pullAndMerge();

    expect((await db.listFolders()).map((f) => f.id)).toContain('f-omitted');
  });

  it('D1 is PRESERVED: a genuinely complete pull still removes a synced-absent local session', async () => {
    // The guard must be narrow. An empty page whose exact count is also 0 is a
    // complete answer — the cloud really has nothing — so D1 must still fire.
    const meta = workspaceMeta({
      symbol: 'EURUSD',
      activeSessionId: undefined,
      sessions: [savedSession({ id: 'sess-gone', clientUpdatedAt: 1000, syncedAt: 1000 })],
    });
    await db.putMeta(meta);

    const { client } = makeFakeClient({
      summaryRows: [],
      summaryCount: 0, // complete: the server confirms zero rows
      folderRows: [],
      folderCount: 0,
    });

    await makeService(client, db).pullAndMerge();

    const updated = await db.getMeta('EURUSD');
    expect((updated?.sessions ?? []).some((s) => s.id === 'sess-gone')).toBe(false);
  });

  it('FIXED (was RESIDUAL HAZARD): a complete empty pull for a DIFFERENT owner cannot reach the first owner’s data', async () => {
    // Session Sovereignty V2 inverts this spec. It previously PINNED the hazard
    // as known-unfixed: IndexedDB was origin-scoped while RLS is owner-scoped, so
    // a second account signing in on the same browser profile received a
    // COMPLETE, correct, EMPTY pull (rows 0, count 0 — the completeness guard
    // cannot help, the answer really is complete) and every session the first
    // account had synced was deleted locally.
    //
    // The user-owned stores now live in a per-owner database, so the second
    // account's pull reads and writes its OWN partition and the first account's
    // records are unreachable — not merely un-deleted.
    const meta = workspaceMeta({
      symbol: 'EURUSD',
      activeSessionId: undefined,
      sessions: [savedSession({ id: 'first-owners-session', clientUpdatedAt: 1000, syncedAt: 1000 })],
    });
    await db.putMeta(meta);

    const { client } = makeFakeClient({
      summaryRows: [],
      summaryCount: 0,
      folderRows: [],
      folderCount: 0,
      userId: OTHER_OWNER,
    });

    // The intruder's own service instance — same origin, same fake client.
    await makeService(client, dbFor(OTHER_OWNER)).pullAndMerge();

    const survived = await db.getMeta('EURUSD');
    expect((survived?.sessions ?? []).some((s) => s.id === 'first-owners-session')).toBe(true);
    // …and the intruder sees nothing of it.
    expect(await dbFor(OTHER_OWNER).getMeta('EURUSD')).toBeUndefined();
  });
});

describe('SessionSyncService.flushDirty — active session push', () => {
  let db: WorkspaceDbService;

  beforeEach(async () => {
    db = await freshDb();
  });

  it('pushes a dirty active session and advances activeSyncedAt to activeClientUpdatedAt', async () => {
    const meta = workspaceMeta({
      symbol: 'EURUSD',
      activeSessionId: 'B',
      activeClientUpdatedAt: 200,
      activeSyncedAt: 100,
      trading: { ...defaultTradingData(), positions: [position()] },
    });
    await db.putMeta(meta);

    const { client, recorder } = makeFakeClient({
      summaryRows: [],
      folderRows: [],
      userId: 'user-1',
    });
    const service = makeService(client, db);

    await service.flushDirty();

    const sessionUpsert = recorder.upsertCalls.find((c) => c.table === 'sessions');
    expect(sessionUpsert).toBeDefined();
    expect((sessionUpsert!.row as Record<string, unknown>)['id']).toBe('B');

    const updated = await db.getMeta('EURUSD');
    expect(updated?.activeSyncedAt).toBe(200);
  });

  it('flushDirtySessions pushes a row whose payload includes layout/panels/linkGroups sourced from the meta (RFC-011 Task 4)', async () => {
    const { layout, panels } = singlePanelLayoutFor('EURUSD', 'M1');
    const linkGroups: LinkGroup[] = [
      {
        id: 'g1',
        color: '#0f0',
        syncCrosshair: true,
        syncTimeRange: false,
        syncDrawings: true,
      },
    ];
    const meta = workspaceMeta({
      symbol: 'EURUSD',
      activeSessionId: 'B',
      activeClientUpdatedAt: 200,
      activeSyncedAt: 100,
      trading: { ...defaultTradingData(), positions: [position()] },
    });
    await db.putMeta({ ...meta, layout, panels, linkGroups });

    const { client, recorder } = makeFakeClient({
      summaryRows: [],
      folderRows: [],
      userId: 'user-1',
    });
    const service = makeService(client, db);

    await service.flushDirty();

    const sessionUpsert = recorder.upsertCalls.find((c) => c.table === 'sessions');
    expect(sessionUpsert).toBeDefined();
    const pushed = (sessionUpsert!.row as Record<string, unknown>)['payload'] as {
      layout: unknown;
      panels: unknown;
      linkGroups: unknown;
      schemaVersion: number;
    };
    expect(pushed.layout).toEqual(layout);
    expect(pushed.panels).toEqual(panels);
    expect(pushed.linkGroups).toEqual(linkGroups);
    expect(pushed.schemaVersion).toBe(SESSION_PAYLOAD_VERSION_3);
  });
});

describe('SessionSyncService.markActiveDirty', () => {
  let db: WorkspaceDbService;

  beforeEach(async () => {
    db = await freshDb();
  });

  it('stamps activeClientUpdatedAt for a real active session', async () => {
    const meta = workspaceMeta({
      symbol: 'EURUSD',
      activeSessionId: 'A',
      trading: { ...defaultTradingData(), positions: [position()] },
    });
    await db.putMeta(meta);

    const service = makeService({}, db);
    vi.spyOn(Date, 'now').mockReturnValue(12345);

    await service.markActiveDirty('EURUSD');

    const updated = await db.getMeta('EURUSD');
    expect(updated?.activeClientUpdatedAt).toBe(12345);

    vi.restoreAllMocks();
  });

  it('does nothing for an untouched default session', async () => {
    const meta = workspaceMeta({
      symbol: 'EURUSD',
      trading: defaultTradingData(),
    });
    await db.putMeta(meta);

    const service = makeService({}, db);

    await service.markActiveDirty('EURUSD');

    const updated = await db.getMeta('EURUSD');
    expect(updated?.activeClientUpdatedAt).toBeUndefined();
  });

  it('does nothing when there is no meta for the symbol', async () => {
    const service = makeService({}, db);

    await expect(service.markActiveDirty('NOPE')).resolves.toBeUndefined();
    expect(await db.getMeta('NOPE')).toBeUndefined();
  });
});

describe('reconstructWorkspaces — V1 cloud row migration (RFC-011 Task 4)', () => {
  it('reconstructWorkspaces on a V1-only cloud row (no layout field at all) migrates it to a single-panel default', () => {
    // cleanPayload()/cleanRow() are this file's existing bare-V1 fixtures
    // (schemaVersion 1, no layout/panels/linkGroups keys at all).
    const row = cleanRow();
    const workspaces = reconstructWorkspaces([row]);

    const ws = workspaces.get('EURUSD');
    expect(ws).toBeDefined();
    const { layout, panels } = singlePanelLayoutFor('EURUSD', row.payload.activeTf ?? 'M1');
    expect(ws!.active.layout).toEqual(layout);
    expect(ws!.active.panels).toEqual(panels);
    expect(ws!.active.linkGroups).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Session Sovereignty V2 — owner isolation, quarantine, evidence-based adoption
//
// EVERY test below is a NEGATIVE PROBE: point `ownerWorkspaceDbName` at the
// legacy constant (i.e. undo the partition) and these go red. They reconstruct
// the whole user-visible path — two accounts, one browser profile, a real
// fake-indexeddb database per owner — rather than comparing one field to another.
// ---------------------------------------------------------------------------

/** A PostgREST summary row for `sessions`, as `listSummaries` selects it. */
function summaryRow(id: string, symbol = 'EURUSD', clientUpdatedAtMs = 10) {
  return {
    id,
    name: 'Plan',
    symbol,
    folder_id: null,
    client_updated_at: new Date(clientUpdatedAtMs).toISOString(),
    last_opened_at: null,
    required_datasets: [],
    trades_count: 0,
    initial_balance: 10000,
    balance: 10000,
    cursor: 0,
    schema_version: 3,
    summary: null,
  };
}

describe('Session Sovereignty V2 — owner isolation across an account switch', () => {
  beforeEach(async () => {
    await freshDb(OWNER);
  });

  it('A then B: B empty pull does not delete, mutate, expose or upload A data', async () => {
    const dbA = dbFor(OWNER);
    await dbA.putMeta(
      workspaceMeta({
        symbol: 'EURUSD',
        activeSessionId: 'A-active',
        activeClientUpdatedAt: 1000,
        activeSyncedAt: 1000,
        trading: { ...defaultTradingData(), positions: [position()] },
        sessions: [savedSession({ id: 'A-archived', clientUpdatedAt: 900, syncedAt: 900 })],
      }),
    );
    await dbA.putFolder({
      id: 'A-folder',
      name: 'Plan A',
      order: 0,
      clientUpdatedAt: 5,
      syncedAt: 5,
    });

    const { client, recorder } = makeFakeClient({
      summaryRows: [],
      summaryCount: 0,
      folderRows: [],
      folderCount: 0,
      userId: OTHER_OWNER,
    });
    await makeService(client, dbFor(OTHER_OWNER)).pullAndMerge();

    // not deleted, not mutated
    const after = await dbA.getMeta('EURUSD');
    expect(after?.activeSessionId).toBe('A-active');
    expect(after?.trading?.positions).toHaveLength(1);
    expect((after?.sessions ?? []).map((s) => s.id)).toEqual(['A-archived']);
    expect((await dbA.listFolders()).map((f) => f.id)).toEqual(['A-folder']);

    // not exposed
    expect(await dbFor(OTHER_OWNER).listMetas()).toEqual([]);
    expect(await dbFor(OTHER_OWNER).listFolders()).toEqual([]);

    // not uploaded under B owner_id — the flushDirty half of the defect
    expect(recorder.upsertCalls).toEqual([]);
  });

  it('A then B then A: A local state is still available when A logs back in', async () => {
    const dbA = dbFor(OWNER);
    await dbA.putMeta(
      workspaceMeta({
        symbol: 'XAUUSD',
        activeSessionId: undefined,
        sessions: [savedSession({ id: 'A-archived', clientUpdatedAt: 9, syncedAt: 9 })],
      }),
    );

    const b = makeFakeClient({
      summaryRows: [],
      summaryCount: 0,
      folderRows: [],
      folderCount: 0,
      userId: OTHER_OWNER,
    });
    await makeService(b.client, dbFor(OTHER_OWNER)).pullAndMerge();

    // A signs back in; the cloud still holds A row, so nothing is synced-absent.
    const a = makeFakeClient({
      summaryRows: [summaryRow('A-archived', 'XAUUSD', 9)],
      summaryCount: 1,
      folderRows: [],
      folderCount: 0,
      userId: OWNER,
    });
    await makeService(a.client, dbFor(OWNER)).pullAndMerge();

    const after = await dbFor(OWNER).getMeta('XAUUSD');
    expect((after?.sessions ?? []).map((s) => s.id)).toEqual(['A-archived']);
  });

  it('B then A: a workspace B creates never appears in A partition', async () => {
    await dbFor(OTHER_OWNER).putMeta(
      workspaceMeta({ symbol: 'GBPUSD', activeSessionId: 'B-active' }),
    );
    expect(await dbFor(OWNER).getMeta('GBPUSD')).toBeUndefined();
    expect(await dbFor(OWNER).listMetas()).toEqual([]);
  });

  it('a DIRTY local-only session is never uploaded under a second account owner_id', async () => {
    // The second half of the defect: never-synced locals survived the delete
    // branch and were then upserted with the SECOND account owner_id.
    await dbFor(OWNER).putMeta(
      workspaceMeta({
        symbol: 'EURUSD',
        activeSessionId: 'A-only',
        activeClientUpdatedAt: 5000,
        activeSyncedAt: undefined, // never pushed
        trading: { ...defaultTradingData(), positions: [position()] },
      }),
    );

    const { client, recorder } = makeFakeClient({
      summaryRows: [],
      summaryCount: 0,
      folderRows: [],
      folderCount: 0,
      userId: OTHER_OWNER,
    });
    await makeService(client, dbFor(OTHER_OWNER)).pullAndMerge();

    expect(recorder.upsertCalls.filter((c) => c.table === 'sessions')).toEqual([]);
    // still local, still dirty, for its real owner
    const mine = await dbFor(OWNER).getMeta('EURUSD');
    expect(mine?.activeSyncedAt).toBeUndefined();
    expect(mine?.trading?.positions).toHaveLength(1);
  });

  it('D1 is PRESERVED within one owner: a complete empty pull still removes a synced-absent session', async () => {
    // The fix must be narrow. Same-owner delete propagation is intended
    // behaviour (multi-device) and owner scoping must not silently disable it.
    const db = dbFor(OWNER);
    await db.putMeta(
      workspaceMeta({
        symbol: 'EURUSD',
        activeSessionId: undefined,
        sessions: [savedSession({ id: 'deleted-elsewhere', clientUpdatedAt: 10, syncedAt: 10 })],
      }),
    );

    const { client } = makeFakeClient({
      summaryRows: [],
      summaryCount: 0,
      folderRows: [],
      folderCount: 0,
      userId: OWNER,
    });
    await makeService(client, db).pullAndMerge();

    const after = await db.getMeta('EURUSD');
    expect((after?.sessions ?? []).map((s) => s.id)).toEqual([]);
  });

  it('fails closed with no resolvable owner: no un-owned fallback store is read or written', async () => {
    const noOwner = new WorkspaceDbService(fixedOwnerIdentity(null));
    await expect(noOwner.listMetas()).rejects.toThrow(/Sin sesion|Sin sesión/);
    await expect(noOwner.putMeta(workspaceMeta({ symbol: 'EURUSD' }))).rejects.toThrow(
      /Sin sesion|Sin sesión/,
    );
    await expect(noOwner.listFolders()).rejects.toThrow(/Sin sesion|Sin sesión/);
    await expect(noOwner.getLastPullAt()).rejects.toThrow(/Sin sesion|Sin sesión/);
    // Market data is NOT user-owned and stays available (domain separation).
    await expect(noOwner.listDatasets()).resolves.toEqual([]);
  });
});
