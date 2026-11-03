import { describe, expect, it } from 'vitest';
import { selectLessonsBySession, selectLessonByTradeRef } from './lessons.selectors';
import { Lesson, LessonsState } from './lessons.models';

function lesson(over: Partial<Lesson> = {}): Lesson {
  return {
    id: 'l1',
    authoredAt: 1,
    whatHappened: 'something',
    repeat: 'repeat',
    avoid: 'avoid',
    linkedRuleIds: [],
    evidence: [],
    tradeRefs: [],
    sessionRef: 'sess1',
    ...over,
  };
}

describe('lessons selectors', () => {
  describe('selectLessonsBySession', () => {
    it('groups lessons by sessionRef — J-5 seed', () => {
      const state: LessonsState = {
        lessons: [
          lesson({ id: 'l1', sessionRef: 'sess1' }),
          lesson({ id: 'l2', sessionRef: 'sess1' }),
          lesson({ id: 'l3', sessionRef: 'sess2' }),
        ],
        loaded: true,
      };
      const map = selectLessonsBySession.projector(state.lessons);
      expect(map['sess1']).toHaveLength(2);
      expect(map['sess1'].map((l) => l.id)).toEqual(['l1', 'l2']);
      expect(map['sess2']).toHaveLength(1);
      expect(map['sess2'][0].id).toBe('l3');
    });

    it('memoizes: same input state → same map reference', () => {
      const lessons = [
        lesson({ id: 'l1', sessionRef: 'sess1' }),
        lesson({ id: 'l2', sessionRef: 'sess2' }),
      ];
      const map1 = selectLessonsBySession.projector(lessons);
      const map2 = selectLessonsBySession.projector(lessons);
      expect(map1).toBe(map2);
    });

    it('different lessons → different map reference (memoization respects identity)', () => {
      const lessons1 = [lesson({ id: 'l1', sessionRef: 'sess1' })];
      const lessons2 = [lesson({ id: 'l2', sessionRef: 'sess1' })];
      const map1 = selectLessonsBySession.projector(lessons1);
      const map2 = selectLessonsBySession.projector(lessons2);
      expect(map1).not.toBe(map2);
    });
  });

  describe('selectLessonByTradeRef', () => {
    it('resolves tradeRef → Lesson, first lesson gets priority', () => {
      const state: LessonsState = {
        lessons: [
          lesson({ id: 'l1', tradeRefs: ['trade1', 'trade2'] }),
          lesson({ id: 'l2', tradeRefs: ['trade3'] }),
        ],
        loaded: true,
      };
      const map = selectLessonByTradeRef.projector(state.lessons);
      expect(map['trade1'].id).toBe('l1');
      expect(map['trade2'].id).toBe('l1');
      expect(map['trade3'].id).toBe('l2');
    });

    it('if trade appears in multiple lessons, last-write-wins (last in array order replaces earlier)', () => {
      const state: LessonsState = {
        lessons: [
          lesson({ id: 'l1', tradeRefs: ['shared'] }),
          lesson({ id: 'l2', tradeRefs: ['shared'] }),
        ],
        loaded: true,
      };
      const map = selectLessonByTradeRef.projector(state.lessons);
      expect(map['shared'].id).toBe('l2');
    });

    it('memoizes: same input state → same map reference', () => {
      const lessons = [
        lesson({ id: 'l1', tradeRefs: ['trade1'] }),
        lesson({ id: 'l2', tradeRefs: ['trade2'] }),
      ];
      const map1 = selectLessonByTradeRef.projector(lessons);
      const map2 = selectLessonByTradeRef.projector(lessons);
      expect(map1).toBe(map2);
    });

    it('different lessons → different map reference (memoization respects identity)', () => {
      const lessons1 = [lesson({ id: 'l1', tradeRefs: ['trade1'] })];
      const lessons2 = [lesson({ id: 'l2', tradeRefs: ['trade1'] })];
      const map1 = selectLessonByTradeRef.projector(lessons1);
      const map2 = selectLessonByTradeRef.projector(lessons2);
      expect(map1).not.toBe(map2);
    });
  });
});
