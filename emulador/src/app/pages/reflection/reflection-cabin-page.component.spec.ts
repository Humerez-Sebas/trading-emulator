import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ReflectionCabinPageComponent } from './reflection-cabin-page.component';
import { JournalDataService } from '../../services/journal-data.service';
import { MarketDataRepository } from '../../domain/market-data.repository';
import { selectActiveRules } from '../../state/playbook/playbook.selectors';
import { LessonsActions } from '../../state/lessons/lessons.actions';
import { PlaybookActions } from '../../state/playbook/playbook.actions';
import { JournalSessionModel } from '../../state/journal/journal-read.models';
import { ClosedTrade } from '../../state/trading/trading.models';
import { LessonDraft } from './lesson-form.component';
import { Lesson } from '../../state/lessons/lessons.models';
import { ChartEngineFactory } from './frozen-scene-host.component';

class FakeChartEngine {
  seriesApi = {};
  chartApi = {};
  events = {
    on: () => () => {},
    emit: () => {},
    destroy: () => {},
  };
  setInteractivity(): void {}
  registerCapability(): void {}
  render(): void {}
  destroy(): void {}
}

describe('ReflectionCabinPageComponent', () => {
  let store: MockStore;
  let journalDataSpy: {
    loadSessionReadModel: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };
  let router: Router;

  const dummyTrade1: ClosedTrade = {
    id: 't1',
    side: 'buy',
    origin: 'market',
    entryPrice: 1.0850,
    exitPrice: 1.0870,
    sl: 1.0800,
    tp: 1.0900,
    lots: 1,
    riskPct: 2,
    riskUsd: 100,
    openTime: 1000,
    closeTime: 2000,
    outcome: 'tp',
    profit: 200,
    rMultiple: 2,
    ambiguous: false,
    grossProfit: 200,
    commission: 0,
    mae: 0,
    mfe: 0,
    tMae: 1000,
    tMfe: 1000,
  };

  const dummyTrade2: ClosedTrade = {
    ...dummyTrade1,
    id: 't2',
    rMultiple: -1,
  };

  const dummySession: JournalSessionModel = {
    sessionId: 'sess_1',
    symbol: 'EURUSD',
    name: 'Test Session',
    initialBalance: 10000,
    balance: 10200,
    trades: [dummyTrade1, dummyTrade2],
    stats: {} as any,
    telemetry: [],
    rules: [
      { id: 'rule_1', title: 'Rule 1', shortcutSlot: 1, sortOrder: 0 }
    ],
    lessonByTradeRef: {},
    datasetRefs: ['EURUSD|M1|all'],
    baseTfSeconds: 60,
  };

  beforeEach(() => {
    journalDataSpy = {
      loadSessionReadModel: vi.fn().mockResolvedValue(dummySession),
      clear: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [ReflectionCabinPageComponent],
      providers: [
        provideRouter([]),
        provideMockStore(),
        { provide: JournalDataService, useValue: journalDataSpy },
        { provide: MarketDataRepository, useValue: { getCandles: vi.fn().mockResolvedValue([]) } },
        { provide: ChartEngineFactory, useValue: { create: () => new FakeChartEngine() } },
      ],
    });

    store = TestBed.inject(MockStore);
    store.overrideSelector(selectActiveRules, [
      { id: 'rule_1', title: 'Rule 1', statement: 'Statement 1', createdAt: 0, status: 'active', shortcutSlot: 1, sortOrder: 0, amendments: [] }
    ]);
    store.refreshState();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockImplementation(() => Promise.resolve(true));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function createComponent(sessionId: string, tradeId?: string) {
    const fixture = TestBed.createComponent(ReflectionCabinPageComponent);
    fixture.componentRef.setInput('sessionId', sessionId);
    if (tradeId !== undefined) {
      fixture.componentRef.setInput('tradeId', tradeId);
    }
    fixture.detectChanges();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
    return fixture;
  }

  // --- 1. Route Fallbacks ---
  describe('Route Fallbacks', () => {
    it('should fallback to the first trade when tradeId is undefined', async () => {
      const fixture = await createComponent('sess_1');
      expect(fixture.componentInstance.resolvedTradeId()).toBe('t1');
    });

    it('should fallback to the first trade when tradeId is invalid or does not exist', async () => {
      const fixture = await createComponent('sess_1', 'invalid_trade_id');
      expect(fixture.componentInstance.resolvedTradeId()).toBe('t1');
    });

    it('should resolve to the specified tradeId when valid', async () => {
      const fixture = await createComponent('sess_1', 't2');
      expect(fixture.componentInstance.resolvedTradeId()).toBe('t2');
    });
  });

  // --- 2. Keyboard Map Gating ---
  describe('Keyboard Map Gating', () => {
    it('should move trade or select waypoint on key press when focus is on page surface', async () => {
      const fixture = await createComponent('sess_1', 't1');
      const navigateSpy = vi.spyOn(router, 'navigate');

      // Setup waypoint navigation check:
      fixture.componentInstance.activeWaypointIndex.set(0);
      expect(fixture.componentInstance.activeWaypointIndex()).toBe(0);

      // Trigger hotkey '5' (Exit waypoint slot) on page surface
      const eventDigit = new KeyboardEvent('keydown', { key: '5', bubbles: true });
      window.dispatchEvent(eventDigit);
      fixture.detectChanges();

      // Exit waypoint slot index is 1 because we have 2 waypoints: Entry (slot 1) & Exit (slot 5)
      expect(fixture.componentInstance.activeWaypointIndex()).toBe(1);

      // Trigger ArrowRight to navigate trade
      const eventArrow = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true });
      window.dispatchEvent(eventArrow);
      fixture.detectChanges();

      expect(navigateSpy).toHaveBeenCalledWith(['/journal', 'sess_1', 'reflect', 't2']);
    });

    it('should NOT move trade or select waypoint when focus is inside a typing target (textarea, input, select, contenteditable)', async () => {
      const fixture = await createComponent('sess_1', 't1');
      const navigateSpy = vi.spyOn(router, 'navigate');

      // Create a textarea element to focus on
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);
      textarea.focus();

      // Setup waypoint navigation check
      fixture.componentInstance.activeWaypointIndex.set(0);

      // Trigger hotkey '5' while focused inside the textarea
      const eventDigit = new KeyboardEvent('keydown', { key: '5', bubbles: true });
      textarea.dispatchEvent(eventDigit);
      fixture.detectChanges();

      // activeWaypointIndex should remain 0
      expect(fixture.componentInstance.activeWaypointIndex()).toBe(0);

      // Trigger ArrowRight while focused inside the textarea
      const eventArrow = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true });
      textarea.dispatchEvent(eventArrow);
      fixture.detectChanges();

      expect(navigateSpy).not.toHaveBeenCalled();

      // Clean up DOM
      document.body.removeChild(textarea);
    });

    it('should navigate back to journal on Escape even if focused inside a typing target', async () => {
      const fixture = await createComponent('sess_1', 't1');
      const navigateSpy = vi.spyOn(router, 'navigate');

      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);
      textarea.focus();

      const eventEscape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      textarea.dispatchEvent(eventEscape);
      fixture.detectChanges();

      expect(navigateSpy).toHaveBeenCalledWith(['/journal', 'sess_1']);

      document.body.removeChild(textarea);
    });
  });

  // --- 3. Save Dispatch ---
  describe('Save Dispatch', () => {
    const draft: LessonDraft = {
      whatHappened: 'What happened?',
      repeat: 'What to repeat?',
      avoid: 'What to avoid?',
      linkedRuleIds: ['rule_1'],
    };

    it('should dispatch createLesson and amendRule when saving a new lesson', async () => {
      const fixture = await createComponent('sess_1', 't1');
      const dispatchSpy = vi.spyOn(store, 'dispatch');

      // Save the draft
      fixture.componentInstance.onSave(draft);

      // Verify createLesson dispatch
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: LessonsActions.createLesson.type,
          lesson: expect.objectContaining({
            whatHappened: draft.whatHappened,
            repeat: draft.repeat,
            avoid: draft.avoid,
            linkedRuleIds: draft.linkedRuleIds,
            sessionRef: 'sess_1',
            tradeRefs: ['t1'],
          }),
        }),
      );

      // Verify amendRule dispatch
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: PlaybookActions.amendRule.type,
          ruleId: 'rule_1',
        }),
      );
    });

    it('should dispatch updateLesson and amendRule when saving an existing lesson', async () => {
      const existingLesson: Lesson = {
        id: 'lesson_existing_id',
        authoredAt: 100,
        whatHappened: 'old text',
        repeat: 'old repeat',
        avoid: 'old avoid',
        linkedRuleIds: [],
        evidence: [],
        tradeRefs: ['t1'],
        sessionRef: 'sess_1',
        clientUpdatedAt: 100,
      };

      // Set the session mock to return the existing lesson for t1
      const sessionWithLesson = {
        ...dummySession,
        lessonByTradeRef: {
          t1: existingLesson,
        },
      };
      journalDataSpy.loadSessionReadModel.mockResolvedValue(sessionWithLesson);

      const fixture = await createComponent('sess_1', 't1');
      const dispatchSpy = vi.spyOn(store, 'dispatch');

      // Save the draft to trigger updates
      fixture.componentInstance.onSave(draft);

      // Verify updateLesson dispatch
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: LessonsActions.updateLesson.type,
          id: existingLesson.id,
          whatHappened: draft.whatHappened,
          repeat: draft.repeat,
          avoid: draft.avoid,
          linkedRuleIds: draft.linkedRuleIds,
        }),
      );

      // Verify amendRule dispatch
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: PlaybookActions.amendRule.type,
          ruleId: 'rule_1',
          lessonId: existingLesson.id,
        }),
      );
    });
  });

  // --- 4. Evidence Immutability (J-3) ---
  describe('Evidence Immutability (J-3)', () => {
    it('should freeze evidence in the lesson using a deep copy (structuredClone)', async () => {
      const fixture = await createComponent('sess_1', 't1');
      const dispatchSpy = vi.spyOn(store, 'dispatch');

      const draft: LessonDraft = {
        whatHappened: 'text',
        repeat: 'text',
        avoid: 'text',
        linkedRuleIds: [],
      };

      fixture.componentInstance.onSave(draft);

      // Get the lesson sent to createLesson
      const createAction = dispatchSpy.mock.calls.find(
        (call) => (call[0] as any).type === LessonsActions.createLesson.type
      )?.[0] as any;

      expect(createAction).toBeDefined();
      const savedLesson: Lesson = createAction.lesson;

      // Verify evidence structure is populated
      expect(savedLesson.evidence.length).toBeGreaterThan(0);

      // Let's modify the reference to verify it's a deep copy (e.g. check identity)
      const evidenceScene = savedLesson.evidence[0];
      const sourceTrade = dummySession.trades[0];

      // Mutate the original trade's values that would normally derive properties
      const originalEntryPrice = sourceTrade.entryPrice;
      sourceTrade.entryPrice = 9999;

      // The saved lesson evidence should NOT reflect the mutation
      expect(evidenceScene.orderGeometry.entryPrice).toBe(originalEntryPrice);
      expect(evidenceScene.orderGeometry.entryPrice).not.toBe(9999);
    });
  });
});
