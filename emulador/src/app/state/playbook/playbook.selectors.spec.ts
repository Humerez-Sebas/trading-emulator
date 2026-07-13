import { describe, expect, it } from 'vitest';
import { selectActiveRules, selectRuleBySlot } from './playbook.selectors';
import { PlaybookRule } from './playbook.models';

function rule(over: Partial<PlaybookRule>): PlaybookRule {
  return {
    id: 'x', title: 't', statement: '', createdAt: 0, status: 'active',
    shortcutSlot: null, sortOrder: 0, amendments: [], ...over,
  };
}

describe('playbook selectors', () => {
  it('selectActiveRules filters retired and sorts by sortOrder', () => {
    const rules = [
      rule({ id: 'b', sortOrder: 1 }),
      rule({ id: 'dead', status: 'retired' }),
      rule({ id: 'a', sortOrder: 0 }),
    ];
    expect(selectActiveRules.projector(rules).map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('selectRuleBySlot maps only slotted active rules', () => {
    const active = [rule({ id: 'a', shortcutSlot: 1 }), rule({ id: 'b', sortOrder: 1 })];
    const map = selectRuleBySlot.projector(active);
    expect(map[1].id).toBe('a');
    expect(Object.keys(map)).toHaveLength(1);
  });
});
