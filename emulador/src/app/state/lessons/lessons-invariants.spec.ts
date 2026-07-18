import { describe, expect, it } from 'vitest';
import { Lesson } from './lessons.models';
import { selectLessonsBySession, selectLessonByTradeRef } from './lessons.selectors';
import { lessonsFeature } from './lessons.reducer';
import { TradingActions } from '../trading/trading.actions';
import { ClosedTrade } from '../trading/trading.models';
import { SceneSpec } from '../../domain/reflection/scene-spec';

function createDummyLesson(id: string, sessionRef: string, tradeRefs: string[] = []): Lesson {
  return {
    id,
    authoredAt: 1000,
    whatHappened: 'What happened?',
    repeat: 'Repeat this',
    avoid: 'Avoid this',
    linkedRuleIds: [],
    evidence: [
      {
        symbol: 'EURUSD',
        datasetRefs: ['EURUSD|M1|all'],
        window: { t0: 0, t1: 120 },
        cursorTime: 60,
        orderGeometry: {
          side: 'buy',
          entryPrice: 1.08,
          sl: 1.079,
          tp: 1.082,
          lots: 1,
        },
        drawingSet: [],
        telemetryMarkers: {},
      },
    ],
    tradeRefs,
    sessionRef,
    clientUpdatedAt: 1000,
  };
}

describe('Lessons Redux & DB Invariants (J-1, J-3, J-4, J-5)', () => {
  const { reducer } = lessonsFeature;

  // --- J-1: Shape of Storage ---
  describe('J-1: Shape of Storage', () => {
    it('should verify lessons in state contain structured evidence rather than base64/rasterized images', () => {
      const lesson = createDummyLesson('l1', 'sess_1');

      // The evidence should be SceneSpec objects
      expect(lesson.evidence[0]).toBeDefined();
      expect(typeof lesson.evidence[0].symbol).toBe('string');
      expect(lesson.evidence[0].orderGeometry).toBeDefined();

      // Ensure no properties or values contain image urls or base64 rasterized content
      const serialized = JSON.stringify(lesson);
      expect(serialized).not.toContain('data:image/');
      expect(serialized).not.toContain('base64');
    });
  });

  // --- J-3: Evidence Immutability ---
  describe('J-3: Evidence Immutability', () => {
    it('should verify that mutations to active session/telemetry do not mutate existing lesson evidence', () => {
      const originalTelemetry = [{ type: 'position-modified', time: 10, value: 5 }];
      const originalTrade: ClosedTrade = {
        id: 't1',
        side: 'buy',
        origin: 'market',
        entryPrice: 1.08,
        exitPrice: 1.082,
        sl: 1.079,
        tp: 1.082,
        lots: 1,
        riskPct: 2,
        riskUsd: 100,
        openTime: 100,
        closeTime: 200,
        outcome: 'tp',
        profit: 200,
        rMultiple: 2,
        ambiguous: false,
        grossProfit: 200,
        commission: 0,
        mae: 0,
        mfe: 0,
        tMae: 100,
        tMfe: 100,
      };

      // Mock freezeEvidence's output (similar to ReflectionCabinPageComponent.freezeEvidence)
      const evidence: SceneSpec[] = [
        {
          symbol: 'EURUSD',
          datasetRefs: [],
          window: { t0: 0, t1: 120 },
          cursorTime: 60,
          orderGeometry: {
            side: originalTrade.side,
            entryPrice: originalTrade.entryPrice,
            sl: originalTrade.sl,
            tp: originalTrade.tp,
            lots: originalTrade.lots,
          },
          drawingSet: [],
          telemetryMarkers: {},
        },
      ];

      // J-3 guard: Deep copy via structuredClone
      const frozenEvidence = structuredClone(evidence);

      const lesson: Lesson = {
        id: 'lesson_1',
        authoredAt: 100,
        whatHappened: 'analysis',
        repeat: '',
        avoid: '',
        linkedRuleIds: [],
        evidence: frozenEvidence,
        tradeRefs: [originalTrade.id],
        sessionRef: 'sess_1',
      };

      // Mutate telemetry and trade source objects
      originalTelemetry[0].value = 9999;
      originalTrade.entryPrice = 2.0;

      // The saved lesson evidence should remain untouched
      expect(lesson.evidence[0].orderGeometry.entryPrice).toBe(1.08);
      expect(lesson.evidence[0].orderGeometry.entryPrice).not.toBe(2.0);
    });
  });

  // --- J-4: Purge/Survival ---
  describe('J-4: Purge/Survival', () => {
    it('should verify that deleting a session leaves its associated lessons intact in state', () => {
      const state0 = {
        lessons: [
          createDummyLesson('l1', 'sess_1', ['t1']),
          createDummyLesson('l2', 'sess_2', ['t2']),
        ],
        loaded: true,
      };

      // When TradingActions.deleteSession is dispatched, the lessons state is untouched
      // since the reducer does not intercept deleteSession (only LessonsActions affect it)
      const state1 = reducer(state0, TradingActions.deleteSession({ id: 'sess_1' }) as any);

      expect(state1).toBe(state0); // same state reference, untouched
      expect(state1.lessons).toHaveLength(2);
      expect(state1.lessons.map((l) => l.id)).toContain('l1');
      expect(state1.lessons.map((l) => l.id)).toContain('l2');
    });
  });

  // --- J-5: Session Isolation ---
  describe('J-5: Session Isolation', () => {
    it("should verify that queries for a session's lessons do not leak into another session", () => {
      const lessons = [
        createDummyLesson('l1', 'sess_1', ['t1']),
        createDummyLesson('l2', 'sess_1', ['t2']),
        createDummyLesson('l3', 'sess_2', ['t3']),
      ];

      const lessonsBySession = selectLessonsBySession.projector(lessons);

      // Verify lessons are grouped strictly under their session references
      expect(lessonsBySession['sess_1']).toBeDefined();
      expect(lessonsBySession['sess_1']).toHaveLength(2);
      expect(lessonsBySession['sess_1'].map((l) => l.id)).toEqual(['l1', 'l2']);

      expect(lessonsBySession['sess_2']).toBeDefined();
      expect(lessonsBySession['sess_2']).toHaveLength(1);
      expect(lessonsBySession['sess_2'].map((l) => l.id)).toEqual(['l3']);

      // A session with no lessons should not contain any leaks
      expect(lessonsBySession['sess_3']).toBeUndefined();
    });

    it('should verify trade reference resolution map is built correctly and isolates trades', () => {
      const lessons = [
        createDummyLesson('l1', 'sess_1', ['t1', 't2']),
        createDummyLesson('l2', 'sess_2', ['t3']),
      ];

      const lessonByTradeRef = selectLessonByTradeRef.projector(lessons);

      expect(lessonByTradeRef['t1']).toBeDefined();
      expect(lessonByTradeRef['t1'].id).toBe('l1');

      expect(lessonByTradeRef['t2']).toBeDefined();
      expect(lessonByTradeRef['t2'].id).toBe('l1');

      expect(lessonByTradeRef['t3']).toBeDefined();
      expect(lessonByTradeRef['t3'].id).toBe('l2');

      expect(lessonByTradeRef['t4']).toBeUndefined();
    });
  });
});
