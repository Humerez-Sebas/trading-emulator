import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JournalPageComponent } from './journal-page.component';
import { JournalDataService } from '../../services/journal-data.service';
import type { JournalSessionModel } from '../../state/journal/journal-read.models';
import { closed } from '../../testing/fixtures';
import { computeSessionStats } from '../../state/trading/fill-engine';

function model(p: Partial<JournalSessionModel> = {}): JournalSessionModel {
  const trades = p.trades ?? [];
  return {
    sessionId: 's1',
    symbol: 'EURUSD',
    name: 'Ruptura EURUSD',
    initialBalance: 10000,
    balance: 10000,
    trades,
    stats: computeSessionStats(trades, 10000),
    telemetry: [],
    rules: [],
    lessonByTradeRef: {},
    datasetRefs: [],
    baseTfSeconds: 60,
    ...p,
  };
}

describe('JournalPageComponent', () => {
  let journalDataStub: { loadSessionReadModel: ReturnType<typeof vi.fn> };
  let router: Router;
  let navigateSpy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  async function create(loadResult: Promise<JournalSessionModel>, sessionId = 's1') {
    journalDataStub = { loadSessionReadModel: vi.fn().mockReturnValue(loadResult) };
    TestBed.configureTestingModule({
      imports: [JournalPageComponent],
      providers: [
        provideRouter([]),
        { provide: JournalDataService, useValue: journalDataStub },
      ],
    });
    router = TestBed.inject(Router);
    navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const fixture = TestBed.createComponent(JournalPageComponent);
    fixture.componentRef.setInput('sessionId', sessionId);
    fixture.detectChanges();
    // let the constructor's effect + async loadSession settle
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
    return fixture;
  }

  it('renders loading skeletons before the load resolves (never a spinner)', async () => {
    let resolve!: (m: JournalSessionModel) => void;
    const pending = new Promise<JournalSessionModel>((r) => (resolve = r));
    journalDataStub = { loadSessionReadModel: vi.fn().mockReturnValue(pending) };
    TestBed.configureTestingModule({
      imports: [JournalPageComponent],
      providers: [provideRouter([]), { provide: JournalDataService, useValue: journalDataStub }],
    });
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(JournalPageComponent);
    fixture.componentRef.setInput('sessionId', 's1');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.skeleton-header')).toBeTruthy();
    expect(fixture.nativeElement.querySelectorAll('.skeleton-section')).toHaveLength(6);
    expect(fixture.nativeElement.querySelector('[role="progressbar"], .spinner')).toBeNull();

    resolve(model());
    await Promise.resolve();
    await Promise.resolve();
  });

  it('ready state: renders the header + all 6 sections in the inviolable D16.E order', async () => {
    const trades = [closed({ id: 't1', declaredRuleId: null })];
    const fixture = await create(Promise.resolve(model({ trades })));

    expect(fixture.nativeElement.querySelector('h1').textContent).toContain('Ruptura EURUSD');
    const headings = Array.from(fixture.nativeElement.querySelectorAll('.sections h2')).map(
      (el) => (el as HTMLElement).textContent!.trim(),
    );
    expect(headings).toEqual(['Execution', 'Behavior', 'Rule Performance', 'Time of Day', 'Trades']);
    expect(fixture.nativeElement.querySelector('app-performance-grid')).toBeTruthy();
  });

  it('session-without-trades: exact empty copy, no sections rendered', async () => {
    const fixture = await create(Promise.resolve(model({ trades: [] })));
    const text = fixture.nativeElement.querySelector('.page-state p').textContent.trim();
    expect(text).toBe(
      'Esta sesión no tiene trades cerrados. Los patrones aparecen aquí cuando cierras trades.',
    );
    expect(fixture.nativeElement.querySelector('.sections')).toBeNull();
    // header is still shown for orientation (documented decision)
    expect(fixture.nativeElement.querySelector('app-journal-header')).toBeTruthy();
  });

  it('error state: exact copy + focus lands on the fallback h1', async () => {
    const fixture = await create(Promise.reject(new Error('boom')));
    const p = fixture.nativeElement.querySelector('.page-state p');
    expect(p.textContent.trim()).toBe('No se encontró la sesión. Puede haber sido eliminada.');
    await Promise.resolve();
    const h1 = fixture.nativeElement.querySelector('h1');
    expect(document.activeElement).toBe(h1);
  });

  it('Escape navigates to /sesiones', async () => {
    const fixture = await create(Promise.resolve(model({ trades: [closed({ id: 't1' })] })));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(navigateSpy).toHaveBeenCalledWith(['/sesiones']);
  });

  it('ArrowDown/ArrowUp move the keyboard-selected trade row (clamped, no wrap)', async () => {
    const trades = [
      closed({ id: 't1', closeTime: 10 }),
      closed({ id: 't2', closeTime: 20 }),
      closed({ id: 't3', closeTime: 30 }),
    ];
    const fixture = await create(Promise.resolve(model({ trades })));
    const component = fixture.componentInstance;

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(component.selectedTradeId()).toBe('t1');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(component.selectedTradeId()).toBe('t2');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(component.selectedTradeId()).toBe('t1');
    // clamp at the start: ArrowUp again stays at t1 (no wrap)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(component.selectedTradeId()).toBe('t1');
  });

  it('Enter navigates to reflect/:tradeId for the selected row; no-op with nothing selected', async () => {
    const trades = [closed({ id: 't1' })];
    await create(Promise.resolve(model({ trades })), 'session-9');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(navigateSpy).not.toHaveBeenCalled();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(navigateSpy).toHaveBeenCalledWith(['/journal', 'session-9', 'reflect', 't1']);
  });

  it('no digit key (1-9) triggers any navigation or selection change (§1.9 — no Playbook-hotkey collision)', async () => {
    const trades = [closed({ id: 't1' })];
    const fixture = await create(Promise.resolve(model({ trades })));
    const component = fixture.componentInstance;
    for (const key of ['1', '2', '5', '9']) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key }));
    }
    expect(component.selectedTradeId()).toBeNull();
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('a rule row toggle (RulePerformanceTableComponent output) filters the Trades table', async () => {
    const trades = [
      closed({ id: 't1', declaredRuleId: 'r1', closeTime: 10 }),
      closed({ id: 't2', declaredRuleId: 'r2', closeTime: 20 }),
    ];
    const fixture = await create(
      Promise.resolve(
        model({
          trades,
          rules: [
            { id: 'r1', title: 'A', shortcutSlot: 1, sortOrder: 0 },
            { id: 'r2', title: 'B', shortcutSlot: 2, sortOrder: 1 },
          ],
        }),
      ),
    );
    const component = fixture.componentInstance;
    expect(fixture.nativeElement.querySelectorAll('app-trades-table tbody tr')).toHaveLength(2);

    component.onRuleFilterToggled('r1');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('app-trades-table tbody tr')).toHaveLength(1);

    component.onRuleFilterToggled(null);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('app-trades-table tbody tr')).toHaveLength(2);
  });

  it('trade selection from any element navigates to /journal/:id/reflect/:tradeId (D16.F)', async () => {
    const fixture = await create(Promise.resolve(model({ trades: [closed({ id: 't1' })] })), 's-42');
    fixture.componentInstance.onTradeSelected('t1');
    expect(navigateSpy).toHaveBeenCalledWith(['/journal', 's-42', 'reflect', 't1']);
  });
});
