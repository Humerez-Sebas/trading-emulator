import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  dbRowToRule,
  isPlaybookRuleDirty,
  mergePlaybookPull,
  ruleToDbRow,
  SessionSyncService,
  type DbPlaybookRuleRow,
} from './session-sync.service';
import type { SupabaseService } from '../auth/supabase.service';
import { WorkspaceDbService } from './workspace-db.service';
import type { PlaybookRule } from '../state/playbook/playbook.models';

// ---------------------------------------------------------------------------
// RFC-015 Task 4: playbook_rules mapping, dirty predicate, and LWW merge.
// All three are pure (no DI/IO) — this file needs no fake-indexeddb activity
// beyond what `new WorkspaceDbService()` requires at construction (it never
// opens the DB until an async method is called, which the push/pull tests
// below never trigger).
// ---------------------------------------------------------------------------

function rule(over: Partial<PlaybookRule> = {}): PlaybookRule {
  return {
    id: 'r1',
    title: 'Ruptura de rango',
    statement: 'texto opaco',
    createdAt: 1_700_000_000_000,
    status: 'active',
    shortcutSlot: null,
    sortOrder: 0,
    amendments: [],
    ...over,
  };
}

function dbRow(over: Partial<DbPlaybookRuleRow> = {}): DbPlaybookRuleRow {
  return {
    id: 'r1',
    user_id: 'user-1',
    title: 'Ruptura de rango',
    statement: 'texto opaco',
    status: 'active',
    shortcut_slot: null,
    sort_order: 0,
    amendments: [],
    created_at: new Date(1_700_000_000_000).toISOString(),
    client_updated_at: new Date(1_700_050_000_000).toISOString(),
    ...over,
  };
}

describe('ruleToDbRow / dbRowToRule — round-trip identity', () => {
  it('ruleToDbRow(dbRowToRule(row)) is identity on a fixture row', () => {
    const row = dbRow();

    const roundTripped = ruleToDbRow(dbRowToRule(row), row.user_id);

    expect(roundTripped).toEqual(row);
  });

  it('round-trips a retired rule with a shortcut slot, amendments, and non-zero sortOrder', () => {
    const row = dbRow({
      status: 'retired',
      shortcut_slot: 3,
      sort_order: 7,
      amendments: ['lesson-1', 'lesson-2'],
    });

    const roundTripped = ruleToDbRow(dbRowToRule(row), row.user_id);

    expect(roundTripped).toEqual(row);
  });

  it('dbRowToRule maps snake_case -> camelCase and ISO -> epoch ms, stamping syncedAt = clientUpdatedAt', () => {
    const row = dbRow();

    const domain = dbRowToRule(row);

    expect(domain).toEqual({
      id: 'r1',
      title: 'Ruptura de rango',
      statement: 'texto opaco',
      createdAt: 1_700_000_000_000,
      status: 'active',
      shortcutSlot: null,
      sortOrder: 0,
      amendments: [],
      clientUpdatedAt: 1_700_050_000_000,
      syncedAt: 1_700_050_000_000,
    } satisfies PlaybookRule);
  });

  it('ruleToDbRow falls back to createdAt for client_updated_at when clientUpdatedAt is absent (never locally stamped)', () => {
    const r = rule({ clientUpdatedAt: undefined });

    const row = ruleToDbRow(r, 'user-1');

    expect(row.client_updated_at).toBe(new Date(r.createdAt).toISOString());
  });
});

describe('isPlaybookRuleDirty', () => {
  it('selects exactly the mutated rows from a mixed array (clientUpdatedAt > syncedAt)', () => {
    const rules: PlaybookRule[] = [
      rule({ id: 'clean', clientUpdatedAt: 1000, syncedAt: 1000 }),
      rule({ id: 'dirty-edited', clientUpdatedAt: 2000, syncedAt: 1000 }),
      rule({ id: 'never-touched', clientUpdatedAt: undefined, syncedAt: undefined }),
      rule({ id: 'dirty-never-synced', clientUpdatedAt: 500, syncedAt: undefined }),
    ];

    const dirtyIds = rules.filter(isPlaybookRuleDirty).map((r) => r.id);

    expect(dirtyIds.sort()).toEqual(['dirty-edited', 'dirty-never-synced']);
  });

  it('is false for a rule with clientUpdatedAt equal to syncedAt (just synced)', () => {
    expect(isPlaybookRuleDirty(rule({ clientUpdatedAt: 5000, syncedAt: 5000 }))).toBe(false);
  });

  it('is false for a brand new rule with neither stamp set', () => {
    expect(
      isPlaybookRuleDirty(rule({ clientUpdatedAt: undefined, syncedAt: undefined })),
    ).toBe(false);
  });
});

describe('mergePlaybookPull', () => {
  it('remote newer wins: cloud row replaces local and is queued for a local write', () => {
    const local = [rule({ id: 'a', clientUpdatedAt: 1000, syncedAt: 1000, title: 'local title' })];
    const remote = [rule({ id: 'a', clientUpdatedAt: 2000, syncedAt: 2000, title: 'remote title' })];

    const { rules, toUpsertLocally } = mergePlaybookPull(local, remote);

    expect(rules).toEqual([remote[0]]);
    expect(toUpsertLocally).toEqual([remote[0]]);
  });

  it('local newer survives: local row is kept, nothing queued for a local write', () => {
    const local = [rule({ id: 'a', clientUpdatedAt: 3000, syncedAt: 1000, title: 'local newer' })];
    const remote = [rule({ id: 'a', clientUpdatedAt: 2000, syncedAt: 2000, title: 'stale remote' })];

    const { rules, toUpsertLocally } = mergePlaybookPull(local, remote);

    expect(rules).toEqual([local[0]]);
    expect(toUpsertLocally).toEqual([]);
  });

  it('a tie (equal clientUpdatedAt) keeps local, no local write', () => {
    const local = [rule({ id: 'a', clientUpdatedAt: 2000, syncedAt: 2000 })];
    const remote = [
      rule({ id: 'a', clientUpdatedAt: 2000, syncedAt: 2000, title: 'same-time-remote' }),
    ];

    const { rules, toUpsertLocally } = mergePlaybookPull(local, remote);

    expect(rules).toEqual([local[0]]);
    expect(toUpsertLocally).toEqual([]);
  });

  it('remote-missing local row is KEPT — pull never deletes, even if it was previously synced', () => {
    const local = [rule({ id: 'gone-from-cloud', clientUpdatedAt: 9000, syncedAt: 1000 })];
    const remote: PlaybookRule[] = [];

    const { rules, toUpsertLocally } = mergePlaybookPull(local, remote);

    expect(rules).toEqual(local);
    expect(toUpsertLocally).toEqual([]);
  });

  it('a remote row absent locally is inserted and queued for a local write', () => {
    const local: PlaybookRule[] = [];
    const remote = [rule({ id: 'cloud-only', clientUpdatedAt: 5000, syncedAt: 5000 })];

    const { rules, toUpsertLocally } = mergePlaybookPull(local, remote);

    expect(rules).toEqual(remote);
    expect(toUpsertLocally).toEqual(remote);
  });

  it('a mixed pull resolves each id independently (conflict + remote-missing + cloud-only in one batch)', () => {
    const local = [
      rule({ id: 'local-newer', clientUpdatedAt: 3000, syncedAt: 1000, title: 'local wins' }),
      rule({ id: 'remote-wins', clientUpdatedAt: 1000, syncedAt: 1000, title: 'stale local' }),
      rule({ id: 'remote-missing', clientUpdatedAt: 500, syncedAt: 500, title: 'orphaned local' }),
    ];
    const remoteWinsRow = rule({
      id: 'remote-wins',
      clientUpdatedAt: 9000,
      syncedAt: 9000,
      title: 'fresh remote',
    });
    const cloudOnlyRow = rule({ id: 'cloud-only', clientUpdatedAt: 4000, syncedAt: 4000 });
    const remote = [
      rule({ id: 'local-newer', clientUpdatedAt: 2000, syncedAt: 2000, title: 'stale remote' }),
      remoteWinsRow,
      cloudOnlyRow,
    ];

    const { rules, toUpsertLocally } = mergePlaybookPull(local, remote);

    expect(rules.map((r) => r.id)).toEqual([
      'local-newer',
      'remote-wins',
      'remote-missing',
      'cloud-only',
    ]);
    expect(rules.find((r) => r.id === 'local-newer')!.title).toBe('local wins');
    expect(rules.find((r) => r.id === 'remote-wins')!.title).toBe('fresh remote');
    expect(toUpsertLocally).toEqual([remoteWinsRow, cloudOnlyRow]);
  });
});

// ---------------------------------------------------------------------------
// SessionSyncService.pushPlaybookRules / pullPlaybookRules — a fake Supabase
// client, no network (same spirit as session-sync.service.spec.ts's
// FakeQueryBuilder, trimmed to just what playbook_rules needs: upsert + a
// plain awaitable select, no .eq()/.single() chaining).
// ---------------------------------------------------------------------------

function makeService(client: unknown): SessionSyncService {
  return new SessionSyncService(
    { client } as unknown as SupabaseService,
    new WorkspaceDbService(),
  );
}

describe('SessionSyncService.pushPlaybookRules', () => {
  it('upserts each rule with user_id, snake_case keys, ISO client_updated_at, onConflict: id', async () => {
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
    const r = rule({ id: 'r1', clientUpdatedAt: 1_700_050_000_000 });

    await service.pushPlaybookRules([r]);

    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0].table).toBe('playbook_rules');
    expect(upsertCalls[0].opts).toEqual({ onConflict: 'id' });
    const row = upsertCalls[0].row as Record<string, unknown>;
    expect(row['user_id']).toBe('user-1');
    expect(row['id']).toBe('r1');
    expect(row['client_updated_at']).toBe(new Date(1_700_050_000_000).toISOString());
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

    await service.pushPlaybookRules([]);

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

    await expect(service.pushPlaybookRules([rule()])).rejects.toThrow('boom');
  });
});

describe('SessionSyncService.pullPlaybookRules', () => {
  it('maps every returned row via dbRowToRule', async () => {
    const row = dbRow({ id: 'cloud-1' });
    const client = {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
      from: () => ({
        select: () => Promise.resolve({ data: [row], error: null }),
      }),
    };
    const service = makeService(client);

    const result = await service.pullPlaybookRules();

    expect(result).toEqual([dbRowToRule(row)]);
  });

  it('throws Error(error.message) on a DB error', async () => {
    const client = {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
      from: () => ({ select: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }),
    };
    const service = makeService(client);

    await expect(service.pullPlaybookRules()).rejects.toThrow('boom');
  });
});
