import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { PlaybookDbService } from './playbook-db.service';
import { PlaybookRule } from '../state/playbook/playbook.models';

function rule(id: string, over: Partial<PlaybookRule> = {}): PlaybookRule {
  return {
    id,
    title: 't',
    statement: 's',
    createdAt: 1,
    status: 'active',
    shortcutSlot: null,
    sortOrder: 0,
    amendments: [],
    ...over,
  };
}

describe('PlaybookDbService', () => {
  let svc: PlaybookDbService;
  beforeEach(async () => {
    // Create a fresh service instance; each test suite gets its own
    svc = new PlaybookDbService();
    await svc.clear(); // Clear any data from previous tests
  });

  it('round-trips upsert → loadAll', async () => {
    await svc.upsert(rule('a'));
    await svc.upsertMany([rule('b'), rule('c')]);
    const all = await svc.loadAll();
    expect(all.map((r) => r.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('upsert overwrites by id (no duplicates)', async () => {
    await svc.upsert(rule('a', { title: 'v1' }));
    await svc.upsert(rule('a', { title: 'v2' }));
    const all = await svc.loadAll();
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe('v2');
  });

  it('remove deletes the row (LWW pull reconciliation only)', async () => {
    await svc.upsert(rule('a'));
    await svc.remove('a');
    expect(await svc.loadAll()).toEqual([]);
  });

  it('rejects a candle-poisoned payload (P-6, assertNoCandles reused)', async () => {
    const poisoned = {
      ...rule('bad'),
      candles: [{ time: 1, open: 1, high: 1, low: 1, close: 1 }],
    };
    await expect(svc.upsert(poisoned as never)).rejects.toThrow();
  });

  it('playbook survives deletion of the OTHER databases (P-3)', async () => {
    await svc.upsert(rule('keep'));
    // Delete the other databases to ensure playbook DB is independent
    indexedDB.deleteDatabase('emulador-workspaces');
    indexedDB.deleteDatabase('emulador-telemetry');
    // Give the deletes a moment to process
    await new Promise((r) => setTimeout(r, 100));
    expect((await svc.loadAll()).map((r) => r.id)).toEqual(['keep']);
  });
});
