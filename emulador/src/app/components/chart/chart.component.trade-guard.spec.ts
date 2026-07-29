import { describe, it, expect, vi, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { ChartComponent } from './chart.component';
import { ChartModelMapper } from './chart-model-mapper.service';
import { PanelDescriptor, panelMayExecute } from '../../state/layout/layout.models';
import {
  selectCurrentAsset,
  selectDataRange,
  selectPlacementTime,
  selectTradePanelView,
} from '../../state/selectors';
import { selectRuleSlotMap } from '../../state/playbook/playbook.selectors';
import { drawingsFeature } from '../../state/drawings/drawings.reducer';
import { linkGroupsFeature } from '../../state/link-groups/link-groups.reducer';
import { layoutFeature } from '../../state/layout/layout.reducer';

/**
 * RFC-018 Task 4 — the T-3 execution guard (D18.D).
 *
 * `ChartComponent` has no panel `@Input`; it resolves its identity through the
 * injected per-panel `ChartModelMapper` (`this.mapper.descriptor()`). These specs
 * never mount the real `ChartEngine` — `TestBed.createComponent()` runs
 * `ngAfterViewInit` as part of creating the view, and that hook does
 * `new ChartEngine(this.container.nativeElement)` (real `lightweight-charts`,
 * real canvas). jsdom doesn't implement `matchMedia`/canvas 2D contexts, so
 * every OTHER spec touching this component tree stubs it out instead (see
 * `chart-panel.component.spec.ts` / `workspace-viewport.component.spec.ts`).
 * There is no DI seam for the engine here, so this spec stubs the hook itself
 * (`ChartComponent.prototype.ngAfterViewInit`) and scaffolds the handful of
 * private fields (`series`, `engine`, `lineDrag`, `lastTradeView`) the four
 * guarded methods read — the guard logic under test is pure signal
 * composition, not rendering. `container` is Angular's REAL (detached) view
 * child: static `@ViewChild` resolution isn't part of the stubbed hook, so
 * `getBoundingClientRect()`/`.style` work exactly as a real element would.
 */

const TRADE_CTX = {
  balance: 10_000,
  initialBalance: 10_000,
  equity: 10_000,
  floating: 0,
  orders: [],
  positions: [],
  history: [],
  sessionEnded: false,
  summaryOpen: false,
  riskPct: 1,
  price: 100,
  time: 1_000,
  contractSize: 100_000,
  pointSize: 0.01,
};

const blankDescriptor: PanelDescriptor = {
  id: 'panel-1',
  symbol: '',
  timeframe: 'M1',
  linkGroupId: null,
};
const mismatchedDescriptor: PanelDescriptor = {
  id: 'panel-1',
  symbol: 'NAS100',
  timeframe: 'M1',
  linkGroupId: null,
};
const hiddenDescriptor: PanelDescriptor = {
  id: 'panel-1',
  symbol: 'US30',
  timeframe: 'M1',
  linkGroupId: null,
  hideTrades: true,
};

let store: MockStore;

afterEach(() => {
  // `vi.spyOn(ChartComponent.prototype, ...)` in setup() patches a shared prototype;
  // under vitest's isolate:false, module-level state leaks across spec FILES in the
  // same worker if not restored (docs/engineering/testing.md).
  vi.restoreAllMocks();
  store?.resetSelectors();
});

/**
 * Boots a `ChartComponent` with a controllable fake `ChartModelMapper` (a writable
 * `descriptor` signal, so R18-9's mid-placement flip can mutate it) and every
 * store selector the component's field initializers read eagerly. Stubs
 * `ngAfterViewInit` so `TestBed.createComponent()` never constructs the real
 * `ChartEngine`. Returns the component cast to `any` — the four guarded methods
 * and the scaffolded fields (`series`, `engine`, `lineDrag`, `lastTradeView`) are
 * all private.
 */
function setup(descriptor: PanelDescriptor | null, asset: string | null) {
  vi.spyOn(ChartComponent.prototype, 'ngAfterViewInit').mockImplementation(() => {});

  const descriptorSignal: WritableSignal<PanelDescriptor | null> = signal(descriptor);
  TestBed.configureTestingModule({
    providers: [
      provideMockStore(),
      {
        provide: ChartModelMapper,
        useValue: {
          descriptor: descriptorSignal,
          sessionEnd: signal<number | null>(null),
        } as unknown as ChartModelMapper,
      },
    ],
  });
  store = TestBed.inject(MockStore);
  store.overrideSelector(selectCurrentAsset, asset);
  store.overrideSelector(selectTradePanelView, TRADE_CTX);
  store.overrideSelector(selectPlacementTime, TRADE_CTX.time);
  store.overrideSelector(selectDataRange, { from: 0, to: 100_000 });
  store.overrideSelector(selectRuleSlotMap, {});
  store.overrideSelector(drawingsFeature.selectActiveTool, 'none');
  store.overrideSelector(drawingsFeature.selectClipboard, null);
  store.overrideSelector(linkGroupsFeature.selectGroups, {});
  store.overrideSelector(layoutFeature.selectFocusedPanelId, null);

  const fixture = TestBed.createComponent(ChartComponent);
  const component = fixture.componentInstance as any;
  return { fixture, component, descriptorSignal };
}

describe('ChartComponent — RFC-018 T-3 execution guard (D18.D)', () => {
  it('regression: order options are present when the panel resolves to the book symbol', () => {
    const { component } = setup(blankDescriptor, 'US30');
    component.series = { coordinateToPrice: () => 90 };
    component.handleContextMenu({ clientX: 10, clientY: 10 } as unknown as MouseEvent);

    expect(component.menu()).not.toBeNull();
    expect(component.menu()!.options.length).toBeGreaterThan(0);
  });

  describe('T-3: symbol mismatch (panel = NAS100, book = US30)', () => {
    it('handleContextMenu offers no order options (menu still opens)', () => {
      const { component } = setup(mismatchedDescriptor, 'US30');
      component.series = { coordinateToPrice: () => 90 };
      component.handleContextMenu({ clientX: 10, clientY: 10 } as unknown as MouseEvent);

      // the menu itself still opens (Fit / "Ir a fecha…" / "Programar fin…" are not
      // trading verbs) — only the order options are withheld.
      expect(component.menu()).not.toBeNull();
      expect(component.menu()!.options).toEqual([]);
    });

    it('finishPlacing dispatches nothing and clears the preview', () => {
      const { component } = setup(mismatchedDescriptor, 'US30');
      const dispatch = vi.spyOn(store, 'dispatch');
      component.placing.set({
        side: 'buy',
        orderType: 'limit',
        entryPrice: 100,
        sl: 90,
        stage: 'tp',
      });

      component.finishPlacing(110);

      expect(dispatch).not.toHaveBeenCalled();
      expect(component.placing()).toBeNull();
    });

    it('dragTradeLine dispatches no modifyPosition/modifyOrder', () => {
      const { component } = setup(mismatchedDescriptor, 'US30');
      const dispatch = vi.spyOn(store, 'dispatch');
      component.series = { coordinateToPrice: () => 95 };
      component.lineDrag = { id: 'p1', target: 'position', field: 'sl' };
      component.lastTradeView = {
        positions: [
          {
            id: 'p1',
            side: 'buy',
            entryPrice: 100,
            sl: 90,
            tp: 110,
            lots: 1,
            openTime: 0,
            origin: 'market',
          },
        ],
        orders: [],
      };

      component.dragTradeLine(80);

      expect(dispatch).not.toHaveBeenCalled();
    });

    it('cancel/close dispatch neither cancelOrder nor closePosition', () => {
      const { component } = setup(mismatchedDescriptor, 'US30');
      const dispatch = vi.spyOn(store, 'dispatch');
      component.chart = {};
      component.series = { coordinateToPrice: () => 95 };
      component.engine = {
        getCapability: () => ({
          hitTestDelete: () => ({ id: 'p1', target: 'order', price: 100 }),
        }),
        // ngOnDestroy (fixture teardown) does `this.engine?.destroy()`.
        destroy: () => {},
      };

      component.handleMouseDown({
        button: 0,
        clientX: 10,
        clientY: 10,
        preventDefault: vi.fn(),
      } as unknown as MouseEvent);

      expect(dispatch).not.toHaveBeenCalled();
    });
  });

  describe('R18-2: mapper never configured (descriptor() == null)', () => {
    it('offers no order options', () => {
      const { component } = setup(null, 'US30');
      component.series = { coordinateToPrice: () => 90 };
      component.handleContextMenu({ clientX: 10, clientY: 10 } as unknown as MouseEvent);

      expect(component.menu()!.options).toEqual([]);
    });

    it('dispatches nothing on finishPlacing (a command is even less forgiving than a render)', () => {
      const { component } = setup(null, 'US30');
      const dispatch = vi.spyOn(store, 'dispatch');
      component.placing.set({
        side: 'buy',
        orderType: 'limit',
        entryPrice: 100,
        sl: 90,
        stage: 'tp',
      });

      component.finishPlacing(110);

      expect(dispatch).not.toHaveBeenCalled();
      expect(component.placing()).toBeNull();
    });
  });

  describe('RFC-018 §8 (binding UI rule): hideTrades:true, symbol matches the book', () => {
    it('handleContextMenu offers no order options', () => {
      const { component } = setup(hiddenDescriptor, 'US30');
      component.series = { coordinateToPrice: () => 90 };
      component.handleContextMenu({ clientX: 10, clientY: 10 } as unknown as MouseEvent);

      expect(component.menu()).not.toBeNull();
      expect(component.menu()!.options).toEqual([]);
    });

    it('finishPlacing dispatches nothing — menu and dispatch agree', () => {
      const { component } = setup(hiddenDescriptor, 'US30');
      const dispatch = vi.spyOn(store, 'dispatch');
      component.placing.set({
        side: 'buy',
        orderType: 'limit',
        entryPrice: 100,
        sl: 90,
        stage: 'tp',
      });

      component.finishPlacing(110);

      expect(dispatch).not.toHaveBeenCalled();
      expect(component.placing()).toBeNull();
    });

    it('dragTradeLine dispatches nothing — menu and dispatch agree', () => {
      const { component } = setup(hiddenDescriptor, 'US30');
      const dispatch = vi.spyOn(store, 'dispatch');
      component.series = { coordinateToPrice: () => 95 };
      component.lineDrag = { id: 'p1', target: 'position', field: 'sl' };
      component.lastTradeView = {
        positions: [
          {
            id: 'p1',
            side: 'buy',
            entryPrice: 100,
            sl: 90,
            tp: 110,
            lots: 1,
            openTime: 0,
            origin: 'market',
          },
        ],
        orders: [],
      };

      component.dragTradeLine(80);

      expect(dispatch).not.toHaveBeenCalled();
    });

    it('cancel/close dispatch nothing — menu and dispatch agree', () => {
      const { component } = setup(hiddenDescriptor, 'US30');
      const dispatch = vi.spyOn(store, 'dispatch');
      component.chart = {};
      component.series = { coordinateToPrice: () => 95 };
      component.engine = {
        getCapability: () => ({
          hitTestDelete: () => ({ id: 'p1', target: 'order', price: 100 }),
        }),
        // ngOnDestroy (fixture teardown) does `this.engine?.destroy()`.
        destroy: () => {},
      };

      component.handleMouseDown({
        button: 0,
        clientX: 10,
        clientY: 10,
        preventDefault: vi.fn(),
      } as unknown as MouseEvent);

      expect(dispatch).not.toHaveBeenCalled();
    });

    it('detector: panelMayExecute still returns true — the domain predicate is untouched by hideTrades', () => {
      // This is the failure this task must not produce: folding hideTrades into
      // the domain predicate instead of composing it in the component.
      expect(panelMayExecute(hiddenDescriptor, 'US30')).toBe(true);
    });
  });

  describe('R18-9: hideTrades flips true mid-placement', () => {
    it('clears the in-progress placement (no orphan preview price lines)', () => {
      const liveDescriptor: PanelDescriptor = {
        id: 'panel-1',
        symbol: 'US30',
        timeframe: 'M1',
        linkGroupId: null,
        hideTrades: false,
      };
      const { component, descriptorSignal } = setup(liveDescriptor, 'US30');
      // Settle the effect's initial run: tradeVerbsEnabled starts true, so this is
      // a no-op (nothing is placing yet).
      TestBed.flushEffects();

      component.placing.set({
        side: 'buy',
        orderType: 'limit',
        entryPrice: 100,
        sl: 90,
        stage: 'tp',
      });
      expect(component.placing()).not.toBeNull();

      descriptorSignal.set({ ...liveDescriptor, hideTrades: true });
      TestBed.flushEffects();

      expect(component.placing()).toBeNull();
    });
  });
});
