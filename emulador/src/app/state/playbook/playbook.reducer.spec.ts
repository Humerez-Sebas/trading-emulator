import { describe, expect, it } from 'vitest';
import { playbookFeature } from './playbook.reducer';
import { PlaybookActions } from './playbook.actions';
import { PlaybookRule } from './playbook.models';

const { reducer } = playbookFeature;
const initial = reducer(undefined, { type: '@@init' } as never);

function rule(over: Partial<PlaybookRule> = {}): PlaybookRule {
  return {
    id: 'r1',
    title: 'Ruptura de rango',
    statement: 'texto opaco',
    createdAt: 1,
    status: 'active',
    shortcutSlot: null,
    sortOrder: 0,
    amendments: [],
    ...over,
  };
}

describe('playbook reducer', () => {
  it('starts empty and not loaded', () => {
    expect(initial.rules).toEqual([]);
    expect(initial.loaded).toBe(false);
  });

  it('hydrated replaces rules and marks loaded', () => {
    const s = reducer(initial, PlaybookActions.hydrated({ rules: [rule()] }));
    expect(s.rules).toHaveLength(1);
    expect(s.loaded).toBe(true);
  });

  it('createRule appends with the given id, next sortOrder, and clientUpdatedAt = createdAt', () => {
    const s0 = reducer(initial, PlaybookActions.hydrated({ rules: [rule()] }));
    const s = reducer(
      s0,
      PlaybookActions.createRule({ id: 'r2', title: 'Pullback', statement: '', createdAt: 5 }),
    );
    expect(s.rules[1]).toMatchObject({
      id: 'r2',
      title: 'Pullback',
      status: 'active',
      shortcutSlot: null,
      sortOrder: 1,
      amendments: [],
      clientUpdatedAt: 5,
    });
  });

  it('assignSlot gives the slot to the rule and frees any previous owner', () => {
    const s0 = reducer(
      initial,
      PlaybookActions.hydrated({
        rules: [rule({ id: 'a', shortcutSlot: 1 }), rule({ id: 'b', sortOrder: 1 })],
      }),
    );
    const s = reducer(s0, PlaybookActions.assignSlot({ id: 'b', slot: 1, clientUpdatedAt: 100 }));
    expect(s.rules.find((r) => r.id === 'a')!.shortcutSlot).toBeNull();
    expect(s.rules.find((r) => r.id === 'b')!.shortcutSlot).toBe(1);
  });

  it('assignSlot stamps clientUpdatedAt on BOTH the assigned rule and the freed previous holder', () => {
    const s0 = reducer(
      initial,
      PlaybookActions.hydrated({
        rules: [
          rule({ id: 'a', shortcutSlot: 1, clientUpdatedAt: 10 }),
          rule({ id: 'b', sortOrder: 1, clientUpdatedAt: 10 }),
        ],
      }),
    );
    const s = reducer(s0, PlaybookActions.assignSlot({ id: 'b', slot: 1, clientUpdatedAt: 500 }));
    expect(s.rules.find((r) => r.id === 'a')!.clientUpdatedAt).toBe(500);
    expect(s.rules.find((r) => r.id === 'b')!.clientUpdatedAt).toBe(500);
  });

  it('setRuleStatus retired keeps the rule, releases its slot, and stamps clientUpdatedAt', () => {
    const s0 = reducer(initial, PlaybookActions.hydrated({ rules: [rule({ shortcutSlot: 3 })] }));
    const s = reducer(
      s0,
      PlaybookActions.setRuleStatus({ id: 'r1', status: 'retired', clientUpdatedAt: 200 }),
    );
    expect(s.rules[0].status).toBe('retired');
    expect(s.rules[0].shortcutSlot).toBeNull();
    expect(s.rules[0].clientUpdatedAt).toBe(200);
  });

  it('updateRule stamps the given clientUpdatedAt onto the touched rule', () => {
    const s0 = reducer(
      initial,
      PlaybookActions.hydrated({ rules: [rule({ clientUpdatedAt: 1 })] }),
    );
    const s = reducer(
      s0,
      PlaybookActions.updateRule({ id: 'r1', title: 'nuevo', clientUpdatedAt: 999 }),
    );
    expect(s.rules[0].title).toBe('nuevo');
    expect(s.rules[0].clientUpdatedAt).toBe(999);
  });

  it('reorderRule stamps the given clientUpdatedAt onto the touched rule', () => {
    const s0 = reducer(
      initial,
      PlaybookActions.hydrated({ rules: [rule({ clientUpdatedAt: 1 })] }),
    );
    const s = reducer(
      s0,
      PlaybookActions.reorderRule({ id: 'r1', sortOrder: 9, clientUpdatedAt: 777 }),
    );
    expect(s.rules[0].sortOrder).toBe(9);
    expect(s.rules[0].clientUpdatedAt).toBe(777);
  });

  it('updateRule on an unknown id is a reference-identity no-op', () => {
    const s0 = reducer(initial, PlaybookActions.hydrated({ rules: [rule()] }));
    const s = reducer(
      s0,
      PlaybookActions.updateRule({ id: 'nope', title: 'x', clientUpdatedAt: 1 }),
    );
    expect(s).toBe(s0);
  });

  it('rulesSynced advances ONLY syncedAt — clientUpdatedAt is never rewritten by sync', () => {
    const s0 = reducer(
      initial,
      PlaybookActions.hydrated({
        rules: [rule({ id: 'a', clientUpdatedAt: 500, syncedAt: undefined })],
      }),
    );
    const s = reducer(s0, PlaybookActions.rulesSynced({ stamps: [{ id: 'a', syncedAt: 500 }] }));
    expect(s.rules[0].clientUpdatedAt).toBe(500);
    expect(s.rules[0].syncedAt).toBe(500);
  });

  it('a mid-flight edit after the sync snapshot stays dirty: rulesSynced with a stale syncedAt does not erase the newer clientUpdatedAt', () => {
    // Simulates: push snapshots clientUpdatedAt=500, then (before rulesSynced
    // is dispatched) the user edits again, bumping clientUpdatedAt to 900.
    const s0 = reducer(
      initial,
      PlaybookActions.hydrated({
        rules: [rule({ id: 'a', clientUpdatedAt: 900, syncedAt: undefined })],
      }),
    );
    const s = reducer(s0, PlaybookActions.rulesSynced({ stamps: [{ id: 'a', syncedAt: 500 }] }));
    expect(s.rules[0].clientUpdatedAt).toBe(900);
    expect(s.rules[0].syncedAt).toBe(500);
    // still dirty: 900 > 500
    expect(s.rules[0].clientUpdatedAt! > s.rules[0].syncedAt!).toBe(true);
  });
});
