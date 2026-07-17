import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SessionSummaryComponent } from './session-summary.component';
import { tradingFeature } from '../../state/trading/trading.reducer';
import { drawingsFeature } from '../../state/drawings/drawings.reducer';
import { marketFeature } from '../../state/market/market.reducer';
import {
  selectCurrentAsset,
  selectCurrentTime,
  selectDataRange,
  selectLoadedTfs,
  selectMsPerCandle,
  selectResolutionMinutes,
  selectSessionStats,
  selectTradingData,
} from '../../state/selectors';
import { computeSessionStats } from '../../state/trading/fill-engine';
import { closed, tradingState } from '../../testing/fixtures';
import { ClosedTrade } from '../../state/trading/trading.models';
import { ExecutionCosts } from '../../state/trading/execution-costs';

// RFC-014 Task 6a: MAE_R/MFE_R history columns, physical excursion
// aggregates, and the costs disclosure block. `overrideSelector` forces
// results onto module-level selector singletons; `store.resetSelectors()`
// in afterEach releases them so they don't leak into later spec files under
// the isolate:false vitest pool (see floating-pnl.component.spec.ts).
const INITIAL_BALANCE = 10000;

describe('SessionSummaryComponent', () => {
  let fixture: ComponentFixture<SessionSummaryComponent>;
  let store: MockStore;

  /** Renders the component with the given history and execution costs. */
  function render(trades: ClosedTrade[], executionCosts: ExecutionCosts | null = null): void {
    store.overrideSelector(tradingFeature.selectHistory, trades);
    store.overrideSelector(selectSessionStats, computeSessionStats(trades, INITIAL_BALANCE));
    store.overrideSelector(selectTradingData, tradingState({ history: trades, executionCosts }));
    fixture = TestBed.createComponent(SessionSummaryComponent);
    fixture.detectChanges();
  }

  /** Finds an `.excursion-summary .metric` block by its exact label text. */
  function excursionMetric(label: string): string | null {
    const metrics = Array.from(
      fixture.nativeElement.querySelectorAll('.excursion-summary .metric'),
    ) as HTMLElement[];
    const match = metrics.find((m) => m.querySelector('.label')?.textContent?.trim() === label);
    return match?.querySelector('strong')?.textContent?.trim() ?? null;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SessionSummaryComponent],
      providers: [provideMockStore()],
    });
    store = TestBed.inject(MockStore);
    store.overrideSelector(tradingFeature.selectInitialBalance, INITIAL_BALANCE);
    store.overrideSelector(tradingFeature.selectBalance, INITIAL_BALANCE);
    store.overrideSelector(selectCurrentAsset, 'EURUSD');
    store.overrideSelector(selectDataRange, null);
    store.overrideSelector(selectCurrentTime, 0);
    store.overrideSelector(marketFeature.selectActiveTf, null);
    store.overrideSelector(marketFeature.selectCustomTf, null);
    store.overrideSelector(selectMsPerCandle, 500);
    store.overrideSelector(selectResolutionMinutes, null);
    store.overrideSelector(drawingsFeature.selectItems, []);
    store.overrideSelector(selectLoadedTfs, []);
  });

  afterEach(() => {
    store.resetSelectors();
  });

  describe('MAE_R / MFE_R history columns', () => {
    it('renders "—" for a legacy trade without mae/mfe', () => {
      const trade = closed({ id: 't1', entryPrice: 4000, sl: 3990 }); // no mae/mfe
      render([trade]);
      const row = fixture.nativeElement.querySelector('tbody tr');
      const cells = row.querySelectorAll('td.tabular-nums');
      expect(cells[0].textContent.trim()).toBe('—');
      expect(cells[1].textContent.trim()).toBe('—');
    });

    it('renders "—" for a trade with a zero risk distance (SL == entry)', () => {
      const trade = closed({ id: 't1', entryPrice: 4000, sl: 4000, mae: 10, mfe: 20 });
      render([trade]);
      const row = fixture.nativeElement.querySelector('tbody tr');
      const cells = row.querySelectorAll('td.tabular-nums');
      expect(cells[0].textContent.trim()).toBe('—');
      expect(cells[1].textContent.trim()).toBe('—');
    });

    it('renders MAE_R and MFE_R as mae/mfe divided by the risk distance, 2 decimals', () => {
      // riskDistance = 10; mae = 15 -> 1.50R; mfe = 25 -> 2.50R
      const trade = closed({ id: 't1', entryPrice: 4000, sl: 3990, mae: 15, mfe: 25 });
      render([trade]);
      const row = fixture.nativeElement.querySelector('tbody tr');
      const cells = row.querySelectorAll('td.tabular-nums');
      expect(cells[0].textContent.trim()).toBe('1.50');
      expect(cells[1].textContent.trim()).toBe('2.50');
    });

    it('column headers are "MAE R" / "MFE R"', () => {
      render([closed({ id: 't1', entryPrice: 4000, sl: 3990 })]);
      const headers = Array.from(fixture.nativeElement.querySelectorAll('thead th')).map((th) =>
        (th as HTMLElement).textContent?.trim(),
      );
      expect(headers).toContain('MAE R');
      expect(headers).toContain('MFE R');
    });
  });

  describe('physical excursion aggregates', () => {
    it('empty history -> aggregates render "—"', () => {
      render([]);
      expect(excursionMetric('MAE R media')).toBe('—');
      expect(excursionMetric('MAE R máx.')).toBe('—');
      expect(excursionMetric('MFE R media')).toBe('—');
      expect(excursionMetric('MFE R máx.')).toBe('—');
    });

    it('trades without mae/mfe (legacy-only history) -> aggregates render "—"', () => {
      const trades = [
        closed({ id: 't1', entryPrice: 4000, sl: 3990 }),
        closed({ id: 't2', entryPrice: 4000, sl: 3990 }),
      ];
      render(trades);
      expect(excursionMetric('MAE R media')).toBe('—');
      expect(excursionMetric('MFE R máx.')).toBe('—');
    });

    it('computes mean/max over the contributing trades, ignoring legacy-absent ones', () => {
      const trades = [
        closed({ id: 't1', entryPrice: 4000, sl: 3990, mae: 5, mfe: 30 }), // 0.5R / 3R
        closed({ id: 't2', entryPrice: 4000, sl: 3990, mae: 15, mfe: 10 }), // 1.5R / 1R
        closed({ id: 't3', entryPrice: 4000, sl: 3990 }), // legacy-absent, ignored
      ];
      render(trades);
      expect(excursionMetric('MAE R media')).toBe('1.00');
      expect(excursionMetric('MAE R máx.')).toBe('1.50');
      expect(excursionMetric('MFE R media')).toBe('2.00');
      expect(excursionMetric('MFE R máx.')).toBe('3.00');
    });

    it('shows the ambiguousCount stat alongside the excursion aggregates', () => {
      const trades = [
        closed({ id: 't1', entryPrice: 4000, sl: 3990, ambiguous: true }),
        closed({ id: 't2', entryPrice: 4000, sl: 3990, ambiguous: false }),
      ];
      render(trades);
      expect(excursionMetric('Ambiguos')).toBe('1');
    });
  });

  describe('costs disclosure block', () => {
    it('shows the session effective spread/commission/slippage when executionCosts is present', () => {
      const costs: ExecutionCosts = {
        spreadPoints: 10,
        commissionPerLot: 7,
        slippagePoints: 2,
        pointSize: 0.00001,
      };
      render([], costs);
      const block = fixture.nativeElement.querySelector('.costs');
      const text = block.textContent as string;
      expect(text).toContain('10');
      expect(text).toContain('7');
      expect(text).toContain('2');
      expect(text).not.toContain('Sin costes simulados');
    });

    it('shows the legacy zero-cost wording when executionCosts is null', () => {
      render([], null);
      const block = fixture.nativeElement.querySelector('.costs');
      expect(block.textContent).toContain('Sin costes simulados (sesión legacy)');
      expect(block.querySelector('.costs-grid')).toBeNull();
    });
  });
});
