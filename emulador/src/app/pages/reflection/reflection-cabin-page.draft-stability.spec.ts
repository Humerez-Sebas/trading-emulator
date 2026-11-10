import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReflectionCabinPageComponent } from './reflection-cabin-page.component';
import { JournalDataService } from '../../services/journal-data.service';
import { MarketDataRepository } from '../../domain/market-data.repository';
import { selectActiveRules } from '../../state/playbook/playbook.selectors';
import { LessonsActions } from '../../state/lessons/lessons.actions';
import { lessonsFeature } from '../../state/lessons/lessons.reducer';
import type { JournalSessionModel } from '../../state/journal/journal-read.models';
import type { ClosedTrade } from '../../state/trading/trading.models';
import type { Lesson, LessonsState } from '../../state/lessons/lessons.models';
import { ChartEngineFactory } from './frozen-scene-host.component';

/**
 * RFC-015/016 audit L-1 + L-6: the Cabin's `existingLesson` must not hand the
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

function mkLesson(id: string, tradeId: string, text: string, clientUpdatedAt: number): Lesson {
  return {
    id,
    authoredAt: 10,
    whatHappened: text,
    repeat: '',
    avoid: '',
    linkedRuleIds: [],
    evidence: [],
    tradeRefs: [tradeId],
    sessionRef: 'sess_1',
    clientUpdatedAt,
  };
}

describe('ReflectionCabinPageComponent draft stability (L-1) and hydration message (L-6)', () => {
  let store: MockStore;
  let lessonsState: LessonsState;

  function apply(action: Parameters<typeof lessonsFeature.reducer>[1]): void {
    lessonsState = lessonsFeature.reducer(lessonsState, action);
    store.setState({ lessons: lessonsState });
  }

  function setup(initial: LessonsState) {
    lessonsState = initial;
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

  it('keeps the typed draft when a lessonsSynced ack stamps the lesson', async () => {
    setup({ lessons: [mkLesson('L1', 't1', 'guardado', 50)], loaded: true });
    const fixture = await mount();
    expect(firstTextarea(fixture).value).toBe('guardado');
    type(fixture, 'escribiendo…');

    apply(LessonsActions.lessonsSynced({ stamps: [{ id: 'L1', syncedAt: 50 }] }));
    fixture.detectChanges();

    expect(firstTextarea(fixture).value).toBe('escribiendo…');
  });

  it('keeps the typed draft when a pull hydrates fresh but unchanged lesson objects', async () => {
    setup({ lessons: [mkLesson('L1', 't1', 'guardado', 50)], loaded: true });
    const fixture = await mount();
    type(fixture, 'escribiendo…');

    apply(LessonsActions.hydrated({ lessons: [mkLesson('L1', 't1', 'guardado', 50)] }));
    fixture.detectChanges();

    expect(firstTextarea(fixture).value).toBe('escribiendo…');
  });

  it('re-seeds the form when a genuinely newer version of the lesson arrives', async () => {
    setup({ lessons: [mkLesson('L1', 't1', 'guardado', 50)], loaded: true });
    const fixture = await mount();
    type(fixture, 'escribiendo…');

    apply(LessonsActions.hydrated({ lessons: [mkLesson('L1', 't1', 'de otro equipo', 99)] }));
    fixture.detectChanges();

    expect(firstTextarea(fixture).value).toBe('de otro equipo');
  });

  it('re-seeds the form when switching to another trade', async () => {
    setup({
      lessons: [mkLesson('L1', 't1', 'uno', 50), mkLesson('L2', 't2', 'dos', 60)],
      loaded: true,
    });
    const fixture = await mount('t1');
    type(fixture, 'escribiendo…');

    fixture.componentRef.setInput('tradeId', 't2');
    fixture.detectChanges();

    expect(firstTextarea(fixture).value).toBe('dos');
  });

  describe('hydration-guard message (L-6)', () => {
    const draft = { whatHappened: 'x', repeat: '', avoid: '', linkedRuleIds: [] };

    it('clears the message once lessons are loaded', async () => {
      setup({ lessons: [], loaded: false });
      const fixture = await mount();
      fixture.componentInstance.onSave(draft);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.toast')).not.toBeNull();

      apply(LessonsActions.hydrated({ lessons: [] }));
      fixture.detectChanges();

      expect(fixture.componentInstance.toastMessage()).toBeNull();
      expect(fixture.nativeElement.querySelector('.toast')).toBeNull();
    });

    it('does not clear an unrelated toast when lessons load', async () => {
      setup({ lessons: [], loaded: true });
      const fixture = await mount();
      fixture.componentInstance.toastMessage.set('Otro aviso');
      fixture.detectChanges();

      apply(LessonsActions.hydrated({ lessons: [] }));
      fixture.detectChanges();

      expect(fixture.componentInstance.toastMessage()).toBe('Otro aviso');
    });
  });

  describe('pasted image data URI (audit L-2)', () => {
    const pixels = {
      whatHappened: 'mira esto data:image/png;base64,AAAA',
      repeat: '',
      avoid: '',
      linkedRuleIds: ['r1'],
    };

    it('refuses to save: nothing dispatched, no success toast, inline Spanish error, draft kept', async () => {
      setup({ lessons: [], loaded: true });
      const fixture = await mount();
      type(fixture, pixels.whatHappened);
      const dispatch = vi.spyOn(store, 'dispatch');

      fixture.componentInstance.onSave(pixels);
      fixture.detectChanges();

      expect(dispatch).not.toHaveBeenCalled();
      expect(fixture.componentInstance.toastMessage()).not.toBe('Reflexión guardada');
      expect(fixture.componentInstance.saving()).toBe(false);
      const err = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;
      expect(err.textContent).toMatch(/imagen/i);
      expect(firstTextarea(fixture).value).toBe(pixels.whatHappened);
    });

    it('also refuses on an existing lesson (no updateLesson, no unamendRule)', async () => {
      setup({
        lessons: [{ ...mkLesson('L1', 't1', 'guardado', 50), linkedRuleIds: ['r0'] }],
        loaded: true,
      });
      const fixture = await mount();
      const dispatch = vi.spyOn(store, 'dispatch');

      fixture.componentInstance.onSave({ ...pixels, linkedRuleIds: [] });

      expect(dispatch).not.toHaveBeenCalled();
    });

    it('clears the error on the next valid save attempt', async () => {
      setup({ lessons: [], loaded: true });
      const fixture = await mount();
      fixture.componentInstance.onSave(pixels);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();

      fixture.componentInstance.onSave({ ...pixels, whatHappened: 'texto normal' });
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    });
  });
});
