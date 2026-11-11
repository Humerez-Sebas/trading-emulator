import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReflectionCabinPageComponent } from './reflection-cabin-page.component';
import { JournalDataService } from '../../services/journal-data.service';
import { MarketDataRepository } from '../../domain/market-data.repository';
import { selectActiveRules } from '../../state/playbook/playbook.selectors';
import type { JournalSessionModel } from '../../state/journal/journal-read.models';
import type { ClosedTrade } from '../../state/trading/trading.models';
import type { LessonsState } from '../../state/lessons/lessons.models';
import { ChartEngineFactory } from './frozen-scene-host.component';

/**
 * RFC-015/016 re-audit New Low 1 + 2: the Cabin's `existingLesson` must not hand the
 * LessonForm a "new" lesson when only sync bookkeeping changed (a
 * `lessonsSynced` ack, or a pull's `hydrated` with fresh-but-unchanged objects),
 * or it re-seeds the form over what the trader is typing. Real Cabin, real
 * LessonForm, real lessons reducer (applied to the MockStore state).
 */
class FakeChartEngine {
  events = { on: () => () => {}, emit: () => {}, destroy: () => {} };
  setInteractivity(): void {}
  registerCapability(): void {}
  render(): void {}
  destroy(): void {}
}

function mkTrade(id: string): ClosedTrade {
  return {
    id,
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
}

const model: JournalSessionModel = {
  sessionId: 'sess_1',
  symbol: 'EURUSD',
  name: 'S',
  initialBalance: 10000,
  balance: 10200,
  trades: [mkTrade('t1'), mkTrade('t2')],
  stats: {} as never,
  telemetry: [],
  rules: [],
  lessonByTradeRef: {},
  datasetRefs: ['EURUSD|M1|all'],
  baseTfSeconds: 60,
};

describe('ReflectionCabinPageComponent trade switch (New Low 1, New Low 2)', () => {
  let store: MockStore;

  function setup(initial: LessonsState) {
    TestBed.configureTestingModule({
      imports: [ReflectionCabinPageComponent],
      providers: [
        provideRouter([]),
        provideMockStore({ initialState: { lessons: initial } }),
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

  async function mount(tradeId = 't1') {
    const fixture = TestBed.createComponent(ReflectionCabinPageComponent);
    fixture.componentRef.setInput('sessionId', 'sess_1');
    fixture.componentRef.setInput('tradeId', tradeId);
    fixture.detectChanges();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
    return fixture;
  }

  function firstTextarea(fixture: { nativeElement: HTMLElement }): HTMLTextAreaElement {
    return fixture.nativeElement.querySelector('app-lesson-form textarea') as HTMLTextAreaElement;
  }

  function type(fixture: { detectChanges(): void; nativeElement: HTMLElement }, text: string) {
    const ta = firstTextarea(fixture);
    ta.value = text;
    ta.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  beforeEach(() => vi.useRealTimers());

  afterEach(() => {
    store?.resetSelectors();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('empties the form when moving between two trades that both have no lesson', async () => {
    setup({ lessons: [], loaded: true });
    const fixture = await mount('t1');
    type(fixture, 'sobre t1');

    fixture.componentRef.setInput('tradeId', 't2');
    fixture.detectChanges();

    expect(firstTextarea(fixture).value).toBe('');
  });

  it('does not show a save error from one trade under another', async () => {
    setup({ lessons: [], loaded: true });
    const fixture = await mount('t1');
    fixture.componentInstance.onSave({
      whatHappened: 'x data:image/png;base64,AAAA',
      repeat: '',
      avoid: '',
      linkedRuleIds: [],
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();

    fixture.componentRef.setInput('tradeId', 't2');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    expect(fixture.componentInstance.saveError()).toBeNull();
  });
});
