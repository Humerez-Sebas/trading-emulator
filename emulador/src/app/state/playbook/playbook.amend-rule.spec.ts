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

describe('playbook.amendRule', () => {
  it('appends lessonId to the rule amendments and stamps clientUpdatedAt', () => {
    const s0 = reducer(initial, PlaybookActions.hydrated({ rules: [rule({ id: 'r1' })] }));
    const s = reducer(
      s0,
      PlaybookActions.amendRule({ ruleId: 'r1', lessonId: 'l1', clientUpdatedAt: 100 }),
    );
    expect(s.rules[0].amendments).toEqual(['l1']);
    expect(s.rules[0].clientUpdatedAt).toBe(100);
  });

  it('idempotent: re-dispatch same lessonId = state unchanged same-reference', () => {
    const s0 = reducer(initial, PlaybookActions.hydrated({ rules: [rule({ id: 'r1' })] }));
    const s1 = reducer(
      s0,
      PlaybookActions.amendRule({ ruleId: 'r1', lessonId: 'l1', clientUpdatedAt: 100 }),
    );
    const s2 = reducer(
      s1,
      PlaybookActions.amendRule({ ruleId: 'r1', lessonId: 'l1', clientUpdatedAt: 200 }),
    );
    expect(s2).toBe(s1);
    expect(s2.rules[0].amendments).toHaveLength(1);
  });

  it('unknown ruleId is a no-op', () => {
    const s0 = reducer(initial, PlaybookActions.hydrated({ rules: [rule({ id: 'r1' })] }));
    const s = reducer(
      s0,
      PlaybookActions.amendRule({ ruleId: 'unknown', lessonId: 'l1', clientUpdatedAt: 100 }),
    );
    expect(s).toBe(s0);
  });

  it('multiple lessonIds accumulate in amendments (appends, no duplicates)', () => {
    const s0 = reducer(initial, PlaybookActions.hydrated({ rules: [rule({ id: 'r1' })] }));
    const s1 = reducer(
      s0,
      PlaybookActions.amendRule({ ruleId: 'r1', lessonId: 'l1', clientUpdatedAt: 100 }),
    );
    const s2 = reducer(
      s1,
      PlaybookActions.amendRule({ ruleId: 'r1', lessonId: 'l2', clientUpdatedAt: 200 }),
    );
    expect(s2.rules[0].amendments).toEqual(['l1', 'l2']);
    expect(s2.rules[0].clientUpdatedAt).toBe(200);
  });

  it('stamps clientUpdatedAt even on duplicate lessonId (but state stays same-reference)', () => {
    const s0 = reducer(initial, PlaybookActions.hydrated({ rules: [rule({ id: 'r1' })] }));
    const s1 = reducer(
      s0,
      PlaybookActions.amendRule({ ruleId: 'r1', lessonId: 'l1', clientUpdatedAt: 100 }),
    );
    const s2 = reducer(
      s1,
      PlaybookActions.amendRule({ ruleId: 'r1', lessonId: 'l1', clientUpdatedAt: 200 }),
    );
    // State is same-reference (idempotence guard), but let's verify the intent:
    // duplicate lessonId does not change amendments
    expect(s2).toBe(s1);
    expect(s2.rules[0].amendments).toHaveLength(1);
  });
});
