import { describe, expect, it } from 'vitest';
import { playbookFeature } from './playbook.reducer';
import { PlaybookActions } from './playbook.actions';
import { PlaybookRule } from './playbook.models';

const { reducer } = playbookFeature;
const initial = reducer(undefined, { type: '@@init' } as never);

function rule(over: Partial<PlaybookRule> = {}): PlaybookRule {
  return {
    id: 'r1', title: 'Ruptura de rango', statement: 'texto opaco',
    createdAt: 1, status: 'active', shortcutSlot: null, sortOrder: 0,
    amendments: [], ...over,
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

  it('createRule appends with the given id and next sortOrder', () => {
    const s0 = reducer(initial, PlaybookActions.hydrated({ rules: [rule()] }));
    const s = reducer(
      s0,
      PlaybookActions.createRule({ id: 'r2', title: 'Pullback', statement: '', createdAt: 5 }),
    );
    expect(s.rules[1]).toMatchObject({
      id: 'r2', title: 'Pullback', status: 'active', shortcutSlot: null,
      sortOrder: 1, amendments: [],
    });
  });

  it('assignSlot gives the slot to the rule and frees any previous owner', () => {
    const s0 = reducer(
      initial,
      PlaybookActions.hydrated({
        rules: [rule({ id: 'a', shortcutSlot: 1 }), rule({ id: 'b', sortOrder: 1 })],
      }),
    );
    const s = reducer(s0, PlaybookActions.assignSlot({ id: 'b', slot: 1 }));
    expect(s.rules.find((r) => r.id === 'a')!.shortcutSlot).toBeNull();
    expect(s.rules.find((r) => r.id === 'b')!.shortcutSlot).toBe(1);
  });

  it('setRuleStatus retired keeps the rule and releases its slot', () => {
    const s0 = reducer(initial, PlaybookActions.hydrated({ rules: [rule({ shortcutSlot: 3 })] }));
    const s = reducer(s0, PlaybookActions.setRuleStatus({ id: 'r1', status: 'retired' }));
    expect(s.rules[0].status).toBe('retired');
    expect(s.rules[0].shortcutSlot).toBeNull();
  });

  it('updateRule on an unknown id is a reference-identity no-op', () => {
    const s0 = reducer(initial, PlaybookActions.hydrated({ rules: [rule()] }));
    const s = reducer(s0, PlaybookActions.updateRule({ id: 'nope', title: 'x' }));
    expect(s).toBe(s0);
  });
});
