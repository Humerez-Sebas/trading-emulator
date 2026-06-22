import { describe, expect, it } from 'vitest';
import { SessionSyncService } from './session-sync.service';
import type { SupabaseService } from '../auth/supabase.service';
import { PAYLOAD_MAX_BYTES } from './session-sync.mapping';
import type { CloudFolderRow, CloudSessionRow, SessionPayloadV1 } from './session-sync.models';

function makeService(client: unknown): SessionSyncService {
  return new SessionSyncService({ client } as unknown as SupabaseService);
}

// ---------------------------------------------------------------------------
// Fake Supabase client — no network. Each builder method is awaitable
// (implements `then`) so call chains like `.select(...).eq(...)` and
// `.select(...).eq(...).single()` resolve the same way the real client does.
// ---------------------------------------------------------------------------

interface FakeResult {
  data: unknown;
  error: { message: string } | null;
}

class FakeQueryBuilder implements PromiseLike<FakeResult> {
  selectCols: string | undefined;
  eqCol: string | undefined;
  eqVal: unknown;
  upsertRow: unknown;
  upsertOpts: unknown;
  deleted = false;

  constructor(
    private readonly table: string,
    private readonly recorder: Recorder,
  ) {}

  select(cols: string): this {
    this.selectCols = cols;
    return this;
  }

  eq(col: string, val: unknown): this {
    this.eqCol = col;
    this.eqVal = val;
    return this;
  }

  delete(): this {
    this.deleted = true;
    return this;
  }

  upsert(row: unknown, opts: unknown): this {
    this.upsertRow = row;
    this.upsertOpts = opts;
    this.recorder.upsertCalls.push({ table: this.table, row, opts });
    return this;
  }

  single(): Promise<FakeResult> {
    return Promise.resolve(this.recorder.resolveSingle(this.table, this));
  }

  then<TResult1 = FakeResult, TResult2 = never>(
    onfulfilled?: (value: FakeResult) => TResult1 | PromiseLike<TResult1>,
    onrejected?: (reason: unknown) => TResult2 | PromiseLike<TResult2>,
  ): PromiseLike<TResult1 | TResult2> {
    const result = this.deleted
      ? this.recorder.resolveDelete(this.table, this)
      : this.upsertRow !== undefined
        ? this.recorder.resolveUpsert(this.table, this)
        : this.recorder.resolveSelect(this.table, this);
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}

interface Recorder {
  upsertCalls: { table: string; row: unknown; opts: unknown }[];
  resolveSelect: (table: string, b: FakeQueryBuilder) => FakeResult;
  resolveSingle: (table: string, b: FakeQueryBuilder) => FakeResult;
  resolveUpsert: (table: string, b: FakeQueryBuilder) => FakeResult;
  resolveDelete: (table: string, b: FakeQueryBuilder) => FakeResult;
}

function makeFakeClient(opts: {
  summaryRows?: unknown[];
  payload?: unknown;
  folderRows?: unknown[];
  userId?: string | null;
}) {
  const recorder: Recorder = {
    upsertCalls: [],
    resolveSelect: (table) => {
      if (table === 'sessions') return { data: opts.summaryRows ?? [], error: null };
      if (table === 'folders') return { data: opts.folderRows ?? [], error: null };
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
