import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReflectionCabinPageComponent } from './reflection-cabin-page.component';
import { JournalDataService } from '../../services/journal-data.service';
import { MarketDataRepository } from '../../domain/market-data.repository';
import { selectActiveRules } from '../../state/playbook/playbook.selectors';
import { LessonsActions } from '../../state/lessons/lessons.actions';
import type { JournalSessionModel } from '../../state/journal/journal-read.models';
import type { ClosedTrade } from '../../state/trading/trading.models';
import type { Lesson } from '../../state/lessons/lessons.models';
import type { LessonDraft } from './lesson-form.component';
import { ChartEngineFactory } from './frozen-scene-host.component';

/**
 * RFC-016 MEDIUM-3 (duplicate scenario): the cached read model snapshots
 * lessons at load time. A lesson that reaches the store AFTER the model loaded
 * (late hydrate, pull) must still be seen at save time: saving updates it and
 * never creates a second lesson for the same trade.
 */
class FakeChartEngine {
  events = { on: () => () => {}, emit: () => {}, destroy: () => {} };
  setInteractivity(): void {}
  registerCapability(): void {}
  render(): void {}
  destroy(): void {}
}

const trade: ClosedTrade = {
  id: 't1',
  side: 'buy',
  origin: 'market',
  entryPrice: 1.085,
  exitPrice: 1.087,
  sl: 1.08,
  tp: 1.09,
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

const model: JournalSessionModel = {
  sessionId: 'sess_1',
  symbol: 'EURUSD',
  name: 'S',
  initialBalance: 10000,
  balance: 10200,
  trades: [trade],
  stats: {} as never,
  telemetry: [],
  rules: [],
  lessonByTradeRef: {}, // snapshot taken BEFORE the lesson reached the store
  datasetRefs: ['EURUSD|M1|all'],
  baseTfSeconds: 60,
};

const lateLesson: Lesson = {
  id: 'late-lesson',
  authoredAt: 50,
  whatHappened: 'old',
  repeat: '',
  avoid: '',
  linkedRuleIds: [],
  evidence: [],
  tradeRefs: ['t1'],
  sessionRef: 'sess_1',
  clientUpdatedAt: 50,
};

const draft: LessonDraft = {
  whatHappened: 'nuevo',
  repeat: 'r',
  avoid: 'a',
  linkedRuleIds: [],
};

describe('ReflectionCabinPageComponent lesson freshness (MEDIUM-3)', () => {
  let store: MockStore;

  function setup(lessonsState: { lessons: Lesson[]; loaded: boolean }) {
    TestBed.configureTestingModule({
      imports: [ReflectionCabinPageComponent],
      providers: [
        provideRouter([]),
        provideMockStore({ initialState: { lessons: lessonsState } }),
        {
          provide: JournalDataService,
          useValue: { loadSessionReadModel: vi.fn().mockResolvedValue(model), clear: vi.fn() },
        },
        {
          provide: MarketDataRepository,
          useValue: { getCandlesInRange: vi.fn().mockResolvedValue([]) },
        },
        { provide: ChartEngineFactory, useValue: { create: () => new FakeChartEngine() } },
      ],
    });
    store = TestBed.inject(MockStore);
    store.overrideSelector(selectActiveRules, []);
    store.refreshState();
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  }

  async function mount() {
    const fixture = TestBed.createComponent(ReflectionCabinPageComponent);
    fixture.componentRef.setInput('sessionId', 'sess_1');
    fixture.componentRef.setInput('tradeId', 't1');
    fixture.detectChanges();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => vi.useRealTimers());

  afterEach(() => {
    store?.resetSelectors();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('updates the lesson that reached the store after the model loaded; never creates a second one', async () => {
    setup({ lessons: [], loaded: true });
    const fixture = await mount();
    // the lesson arrives AFTER the cached model was loaded
    store.setState({ lessons: { lessons: [lateLesson], loaded: true } });
    const dispatch = vi.spyOn(store, 'dispatch');

    fixture.componentInstance.onSave(draft);

    const types = dispatch.mock.calls.map((c) => (c[0] as unknown as { type: string }).type);
    expect(types).toContain(LessonsActions.updateLesson.type);
    expect(types).not.toContain(LessonsActions.createLesson.type);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: LessonsActions.updateLesson.type, id: 'late-lesson' }),
    );
  });

  it('does not save (and does not create a duplicate) while lessons have not loaded yet', async () => {
    setup({ lessons: [], loaded: false });
    const fixture = await mount();
    const dispatch = vi.spyOn(store, 'dispatch');

    fixture.componentInstance.onSave(draft);

    expect(dispatch).not.toHaveBeenCalled();
    expect(fixture.componentInstance.saving()).toBe(false);
    expect(fixture.componentInstance.toastMessage()).toBe(
      'Aún se están cargando tus reflexiones. Espera unos segundos y vuelve a guardar; si persiste, recarga la página.',
    );
  });
});
