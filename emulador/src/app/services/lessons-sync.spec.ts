import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  dbRowToLesson,
  isLessonDirty,
  lessonToDbRow,
  mergeLessonsPull,
  SessionSyncService,
  type DbLessonRow,
} from './session-sync.service';
import type { SupabaseService } from '../auth/supabase.service';
import { WorkspaceDbService } from './workspace-db.service';
import type { Lesson } from '../state/lessons/lessons.models';
import type { SceneSpec } from '../domain/reflection/scene-spec';

// ---------------------------------------------------------------------------
// RFC-016 Task 3: lessons mapping, dirty predicate, and LWW merge. Mirrors
// playbook-sync.spec.ts (RFC-015 T4) line by line, adapted to Lesson's shape
// (three opaque text fields, evidence: SceneSpec[], no status/shortcutSlot).
// All pure functions here need no fake-indexeddb activity beyond what
// `new WorkspaceDbService()` requires at construction (never opens the DB
// until an async method is called, which the push/pull tests below never
// trigger).
// ---------------------------------------------------------------------------

function scene(over: Partial<SceneSpec> = {}): SceneSpec {
  return {
    symbol: 'EURUSD',
    datasetRefs: ['EURUSD_M1'],
    window: { t0: 1_700_000_000, t1: 1_700_000_600 },
    cursorTime: 1_700_000_300,
    orderGeometry: { side: 'buy', entryPrice: 1.085, sl: 1.083, tp: 1.09, lots: 1 },
    drawingSet: [],
    telemetryMarkers: {},
    ...over,
  };
}

function lesson(over: Partial<Lesson> = {}): Lesson {
  return {
    id: 'l1',
    authoredAt: 1_700_000_000_000,
    whatHappened: 'Entré antes de confirmación',
    repeat: 'Esperar el cierre de la vela',
    avoid: 'Mover el stop antes de tiempo',
    linkedRuleIds: ['rule-1'],
    evidence: [scene()],
    tradeRefs: ['trade-1'],
    sessionRef: 'session-1',
    ...over,
  };
}

function dbRow(over: Partial<DbLessonRow> = {}): DbLessonRow {
  return {
    id: 'l1',
    user_id: 'user-1',
    what_happened: 'Entré antes de confirmación',
    repeat_field: 'Esperar el cierre de la vela',
    avoid: 'Mover el stop antes de tiempo',
    linked_rule_ids: ['rule-1'],
    evidence: [scene()],
    trade_refs: ['trade-1'],
    session_ref: 'session-1',
    authored_at: new Date(1_700_000_000_000).toISOString(),
    client_updated_at: new Date(1_700_050_000_000).toISOString(),
    ...over,
  };
}

describe('lessonToDbRow / dbRowToLesson — round-trip identity', () => {
  it('lessonToDbRow(dbRowToLesson(row)) is identity on a fixture row', () => {
    const row = dbRow();

    const roundTripped = lessonToDbRow(dbRowToLesson(row), row.user_id);

    expect(roundTripped).toEqual(row);
  });

  it('round-trips a lesson with empty text fields (a partial lesson is valid, S2)', () => {
    const row = dbRow({ what_happened: '', repeat_field: '', avoid: '' });

    const roundTripped = lessonToDbRow(dbRowToLesson(row), row.user_id);

    expect(roundTripped).toEqual(row);
  });

  it('round-trips the repeat <-> repeat_field mapping specifically', () => {
    const row = dbRow({ repeat_field: 'Repetir la espera de confirmación' });

    const domain = dbRowToLesson(row);

    expect(domain.repeat).toBe('Repetir la espera de confirmación');
    expect(lessonToDbRow(domain, row.user_id).repeat_field).toBe(
      'Repetir la espera de confirmación',
    );
  });

  it('round-trips evidence geometry (SceneSpec[]) losslessly', () => {
    const richScene = scene({
      orderGeometry: { side: 'sell', entryPrice: 1.2345, sl: 1.24, tp: null, lots: 2.5 },
      drawingSet: [],
      telemetryMarkers: { managementEvents: 2 },
    });
    const row = dbRow({ evidence: [richScene, scene()] });

    const roundTripped = lessonToDbRow(dbRowToLesson(row), row.user_id);

    expect(roundTripped.evidence).toEqual(row.evidence);
  });

  it('dbRowToLesson maps snake_case -> camelCase and ISO -> epoch ms, stamping syncedAt = clientUpdatedAt', () => {
    const row = dbRow();

    const domain = dbRowToLesson(row);

    expect(domain).toEqual({
      id: 'l1',
      authoredAt: 1_700_000_000_000,
      whatHappened: 'Entré antes de confirmación',
      repeat: 'Esperar el cierre de la vela',
      avoid: 'Mover el stop antes de tiempo',
      linkedRuleIds: ['rule-1'],
      evidence: [scene()],
      tradeRefs: ['trade-1'],
      sessionRef: 'session-1',
      clientUpdatedAt: 1_700_050_000_000,
      syncedAt: 1_700_050_000_000,
    } satisfies Lesson);
  });

  it('lessonToDbRow falls back to authoredAt for client_updated_at when clientUpdatedAt is absent (never locally stamped)', () => {
    const l = lesson({ clientUpdatedAt: undefined });

    const row = lessonToDbRow(l, 'user-1');

    expect(row.client_updated_at).toBe(new Date(l.authoredAt).toISOString());
  });
});

describe('isLessonDirty', () => {
  it('selects exactly the mutated rows from a mixed array (clientUpdatedAt > syncedAt)', () => {
    const lessons: Lesson[] = [
      lesson({ id: 'clean', clientUpdatedAt: 1000, syncedAt: 1000 }),
      lesson({ id: 'dirty-edited', clientUpdatedAt: 2000, syncedAt: 1000 }),
      lesson({ id: 'never-touched', clientUpdatedAt: undefined, syncedAt: undefined }),
      lesson({ id: 'dirty-never-synced', clientUpdatedAt: 500, syncedAt: undefined }),
    ];

    const dirtyIds = lessons.filter(isLessonDirty).map((l) => l.id);

    expect(dirtyIds.sort()).toEqual(['dirty-edited', 'dirty-never-synced']);
  });

  it('is false for a lesson with clientUpdatedAt equal to syncedAt (just synced)', () => {
    expect(isLessonDirty(lesson({ clientUpdatedAt: 5000, syncedAt: 5000 }))).toBe(false);
  });

  it('is false for a brand new lesson with neither stamp set', () => {
    expect(isLessonDirty(lesson({ clientUpdatedAt: undefined, syncedAt: undefined }))).toBe(
      false,
    );
  });
});

describe('mergeLessonsPull', () => {
  it('remote newer wins: cloud row replaces local and is queued for a local write', () => {
    const local = [lesson({ id: 'a', clientUpdatedAt: 1000, syncedAt: 1000, whatHappened: 'local' })];
    const remote = [
      lesson({ id: 'a', clientUpdatedAt: 2000, syncedAt: 2000, whatHappened: 'remote' }),
    ];

    const { lessons, toUpsertLocally } = mergeLessonsPull(local, remote);

    expect(lessons).toEqual([remote[0]]);
    expect(toUpsertLocally).toEqual([remote[0]]);
  });

  it('local newer survives: local row is kept, nothing queued for a local write', () => {
    const local = [
      lesson({ id: 'a', clientUpdatedAt: 3000, syncedAt: 1000, whatHappened: 'local newer' }),
    ];
    const remote = [
      lesson({ id: 'a', clientUpdatedAt: 2000, syncedAt: 2000, whatHappened: 'stale remote' }),
    ];

    const { lessons, toUpsertLocally } = mergeLessonsPull(local, remote);

    expect(lessons).toEqual([local[0]]);
    expect(toUpsertLocally).toEqual([]);
  });

  it('a tie (equal clientUpdatedAt) keeps local, no local write', () => {
    const local = [lesson({ id: 'a', clientUpdatedAt: 2000, syncedAt: 2000 })];
    const remote = [
      lesson({ id: 'a', clientUpdatedAt: 2000, syncedAt: 2000, whatHappened: 'same-time-remote' }),
    ];

    const { lessons, toUpsertLocally } = mergeLessonsPull(local, remote);

    expect(lessons).toEqual([local[0]]);
    expect(toUpsertLocally).toEqual([]);
  });

  it('remote-missing local-only DIRTY row is KEPT — pull never deletes, even a not-yet-pushed edit', () => {
    const local = [
      lesson({ id: 'local-only-dirty', clientUpdatedAt: 9000, syncedAt: undefined }),
    ];
    const remote: Lesson[] = [];

    const { lessons, toUpsertLocally } = mergeLessonsPull(local, remote);

    expect(lessons).toEqual(local);
    expect(toUpsertLocally).toEqual([]);
  });

  it('a remote row absent locally is inserted and queued for a local write', () => {
    const local: Lesson[] = [];
    const remote = [lesson({ id: 'cloud-only', clientUpdatedAt: 5000, syncedAt: 5000 })];

    const { lessons, toUpsertLocally } = mergeLessonsPull(local, remote);

    expect(lessons).toEqual(remote);
    expect(toUpsertLocally).toEqual(remote);
  });

  it('a mixed pull resolves each id independently (conflict + remote-missing + cloud-only in one batch)', () => {
    const local = [
      lesson({ id: 'local-newer', clientUpdatedAt: 3000, syncedAt: 1000, whatHappened: 'local wins' }),
      lesson({ id: 'remote-wins', clientUpdatedAt: 1000, syncedAt: 1000, whatHappened: 'stale local' }),
      lesson({ id: 'remote-missing', clientUpdatedAt: 500, syncedAt: 500, whatHappened: 'orphaned local' }),
    ];
    const remoteWinsRow = lesson({
      id: 'remote-wins',
      clientUpdatedAt: 9000,
      syncedAt: 9000,
      whatHappened: 'fresh remote',
    });
    const cloudOnlyRow = lesson({ id: 'cloud-only', clientUpdatedAt: 4000, syncedAt: 4000 });
    const remote = [
      lesson({ id: 'local-newer', clientUpdatedAt: 2000, syncedAt: 2000, whatHappened: 'stale remote' }),
      remoteWinsRow,
      cloudOnlyRow,
    ];

    const { lessons, toUpsertLocally } = mergeLessonsPull(local, remote);

    expect(lessons.map((l) => l.id)).toEqual([
      'local-newer',
      'remote-wins',
      'remote-missing',
      'cloud-only',
    ]);
    expect(lessons.find((l) => l.id === 'local-newer')!.whatHappened).toBe('local wins');
    expect(lessons.find((l) => l.id === 'remote-wins')!.whatHappened).toBe('fresh remote');
    expect(toUpsertLocally).toEqual([remoteWinsRow, cloudOnlyRow]);
  });
});

// ---------------------------------------------------------------------------
// SessionSyncService.pushLessons / pullLessons — a fake Supabase client, no
// network (same spirit as playbook-sync.spec.ts's makeService, trimmed to
// just what lessons needs: upsert + a plain awaitable select).
// ---------------------------------------------------------------------------

function makeService(client: unknown): SessionSyncService {
  return new SessionSyncService(
    { client } as unknown as SupabaseService,
    new WorkspaceDbService(),
  );
}

describe('SessionSyncService.pushLessons', () => {
  it('upserts each lesson with user_id, snake_case keys, ISO client_updated_at, onConflict: id', async () => {
    const upsertCalls: { table: string; row: unknown; opts: unknown }[] = [];
    const client = {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
      from: (table: string) => ({
        upsert: (row: unknown, opts: unknown) => {
          upsertCalls.push({ table, row, opts });
          return Promise.resolve({ data: null, error: null });
        },
      }),
    };
    const service = makeService(client);
    const l = lesson({ id: 'l1', clientUpdatedAt: 1_700_050_000_000 });

    await service.pushLessons([l]);

    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0].table).toBe('lessons');
    expect(upsertCalls[0].opts).toEqual({ onConflict: 'id' });
    const row = upsertCalls[0].row as Record<string, unknown>;
    expect(row['user_id']).toBe('user-1');
    expect(row['id']).toBe('l1');
    expect(row['client_updated_at']).toBe(new Date(1_700_050_000_000).toISOString());
    expect(row['repeat_field']).toBe(l.repeat);
  });

  it('is a no-op for an empty array (no network call)', async () => {
    let called = false;
    const client = {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
      from: () => {
        called = true;
        return { upsert: () => Promise.resolve({ data: null, error: null }) };
      },
    };
    const service = makeService(client);

    await service.pushLessons([]);

    expect(called).toBe(false);
  });

  it('rejects on the first row error (no partial-success stamping by the caller)', async () => {
    const client = {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
      from: () => ({
        upsert: () => Promise.resolve({ data: null, error: { message: 'boom' } }),
      }),
    };
    const service = makeService(client);

    await expect(service.pushLessons([lesson()])).rejects.toThrow('boom');
  });

  it('throws on candle-poisoned evidence BEFORE any client call (N-5)', async () => {
    let authCalled = false;
    let fromCalled = false;
    const client = {
      auth: {
        getSession: async () => {
          authCalled = true;
          return { data: { session: { user: { id: 'user-1' } } } };
        },
      },
      from: () => {
        fromCalled = true;
        return { upsert: () => Promise.resolve({ data: null, error: null }) };
      },
    };
    const service = makeService(client);
    const poisoned = lesson({
      evidence: [scene({ telemetryMarkers: { candles: [1, 2, 3] } })],
    });

    await expect(service.pushLessons([poisoned])).rejects.toThrow(/velas/);
    expect(authCalled).toBe(false);
    expect(fromCalled).toBe(false);
  });
});

describe('SessionSyncService.pullLessons', () => {
  it('maps every returned row via dbRowToLesson', async () => {
    const row = dbRow({ id: 'cloud-1' });
    const client = {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
      from: () => ({
        select: () => Promise.resolve({ data: [row], error: null }),
      }),
    };
    const service = makeService(client);

    const result = await service.pullLessons();

    expect(result).toEqual([dbRowToLesson(row)]);
  });

  it('selects every DbLessonRow field (honest cast idiom)', async () => {
    let capturedCols: string | undefined;
    const client = {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
      from: () => ({
        select: (cols: string) => {
          capturedCols = cols;
          return Promise.resolve({ data: [], error: null });
        },
      }),
    };
    const service = makeService(client);

    await service.pullLessons();

    expect(capturedCols).toBeDefined();
    const cols = capturedCols!.split(',');
    for (const field of [
      'id',
      'user_id',
      'what_happened',
      'repeat_field',
      'avoid',
      'linked_rule_ids',
      'evidence',
      'trade_refs',
      'session_ref',
      'authored_at',
      'client_updated_at',
    ]) {
      expect(cols).toContain(field);
    }
  });

  it('throws Error(error.message) on a DB error', async () => {
    const client = {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
      from: () => ({ select: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }),
    };
    const service = makeService(client);

    await expect(service.pullLessons()).rejects.toThrow('boom');
  });
});
