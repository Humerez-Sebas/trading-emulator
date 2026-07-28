import { describe, it, expect, vi, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { ChartComponent } from './chart.component';
import { ChartModelMapper } from './chart-model-mapper.service';
import { PanelDescriptor } from '../../state/layout/layout.models';
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
import { DrawingsActions } from '../../state/drawings/drawings.actions';

/**
 * RFC-019 Task 3 — pane-space guard (D19.A) on the three DOM handlers
 * (`handleMouseDown`, `handleHoverFeedback`, `handleContextMenu`).
 *
 * `container.nativeElement` wraps the plot pane PLUS the right price scale PLUS
 * the bottom time axis, but `ChartEngine.paneRect()`-derived hit-tests assume PANE
 * coordinates. Before this guard, clicking/hovering the axis strip was silently
 * treated as a valid in-pane gesture — the worst case being `hitTestTradeLine`
 * stealing a click on the price axis at an SL/TP/entry level (100% reliability).
 *
 * Harness mirrors `chart.component.trade-guard.spec.ts` exactly (same file: same
 * component, same construction constraints) — see that file's header comment for
 * why `ngAfterViewInit` is stubbed and `container` is left as Angular's real
 * (detached) `@ViewChild`. `engine` is scaffolded per-test as a plain object; only
 * this spec's tests supply a real `paneRect()`, so `inPane()`'s guard actually
 * engages (contrast with trade-guard.spec.ts, where `engine` is absent/partial and
 * the guard must fail OPEN — see `inPane()`'s doc comment in chart.component.ts).
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

const descriptor: PanelDescriptor = {
  id: 'panel-1',
  symbol: 'US30',
  timeframe: 'M1',
  linkGroupId: null,
};

let store: MockStore;

afterEach(() => {
  // Same isolate:false discipline as trade-guard.spec.ts: restore the patched
  // ngAfterViewInit prototype and reset any forced selector overrides so nothing
  // leaks across spec FILES sharing a vitest worker (docs/engineering/testing.md).
  vi.restoreAllMocks();
  store?.resetSelectors();
});

/** Boots a `ChartComponent` with `ngAfterViewInit` stubbed (no real ChartEngine/canvas). */
function setup() {
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
  store.overrideSelector(selectCurrentAsset, 'US30');
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
  return { fixture, component };
}

/** A stub `engine` whose `paneRect()` reports a pane narrower/shorter than the
 * container — the axis strip is [paneWidth, Infinity) x, [paneHeight, Infinity) y. */
function stubEngine(paneWidth: number, paneHeight: number, overrides: Record<string, unknown> = {}) {
  return {
    paneRect: () => ({ width: paneWidth, height: paneHeight }),
    setInteractivity: vi.fn(),
    getCapability: (id: string) => {
      if (id === 'drawings') {
        return {
          hitTestHandle: () => null,
          hitTestDrawing: () => null,
          timeForX: () => null,
          xForTime: () => 100,
        };
      }
      if (id === 'trading') {
        return {
          hitTestDelete: () => null,
          hitTestTradeLine: () => null,
          hitTestEdge: () => null,
          hitTestBox: () => null,
        };
      }
      return undefined;
    },
    destroy: () => {},
    ...overrides,
  };
}

describe('ChartComponent pane-space guard (RFC-019 Task 3, D19.A)', () => {
  describe('handleMouseDown: mousedown on the price-axis strip', () => {
    it('scenario 3: over a drawing rect spanning that price — nothing selected, no setInteractivity(false)', () => {
      const { component } = setup();
      const dispatch = vi.spyOn(store, 'dispatch');
      // If the guard were absent, this WOULD hit-test true (proves the guard, not
      // an absence of drawings, is what stops selection).
      const engine = stubEngine(700, 500, {
        getCapability: (id: string) =>
          id === 'drawings'
            ? {
                hitTestHandle: () => null,
                hitTestDrawing: () => 'drawing-1',
                timeForX: () => null,
                xForTime: () => 100,
              }
            : id === 'trading'
              ? { hitTestDelete: () => null, hitTestTradeLine: () => null, hitTestEdge: () => null }
              : undefined,
      });
      component.engine = engine;
      component.chart = {};
      component.series = { coordinateToPrice: () => 100, priceToCoordinate: () => 250 };
      component.panelDrawings = {
        items: [{ id: 'drawing-1', p1: { time: 0, price: 100 }, p2: { time: 10, price: 110 }, locked: false }],
        selectedId: null,
      };

      // x = 750 is beyond the 700px pane width: the price-axis strip.
      component.handleMouseDown({
        button: 0,
        clientX: 750,
        clientY: 250,
        preventDefault: vi.fn(),
      } as unknown as MouseEvent);

      expect(dispatch).not.toHaveBeenCalled();
      expect(engine.setInteractivity).not.toHaveBeenCalled();
      expect(component.drag).toBeNull();
    });

    it('scenario 4 (the T-3-adjacent hole): mousedown at an SL price level on the axis starts no lineDrag', () => {
      const { component } = setup();
      const engine = stubEngine(700, 500, {
        getCapability: (id: string) =>
          id === 'trading'
            ? {
                hitTestDelete: () => null,
                // Would match (SL at this y) if the guard did not short-circuit first.
                hitTestTradeLine: () => ({ id: 'p1', target: 'position', field: 'sl' }),
                hitTestEdge: () => null,
              }
            : id === 'drawings'
              ? { hitTestHandle: () => null, hitTestDrawing: () => null, timeForX: () => null, xForTime: () => 100 }
              : undefined,
      });
      component.engine = engine;
      component.chart = {};
      component.series = { coordinateToPrice: () => 100, priceToCoordinate: () => 250 };
      component.lineDrag = null;

      component.handleMouseDown({
        button: 0,
        clientX: 750, // beyond the 700px pane width
        clientY: 250,
        preventDefault: vi.fn(),
      } as unknown as MouseEvent);

      expect(component.lineDrag).toBeNull();
      expect(engine.setInteractivity).not.toHaveBeenCalled();
    });
  });

  it('scenario 5 (counter-guard / no regression): mousedown inside the pane on a drawing edge still selects', () => {
    const { component } = setup();
    const dispatch = vi.spyOn(store, 'dispatch');
    const engine = stubEngine(700, 500, {
      getCapability: (id: string) =>
        id === 'drawings'
          ? {
              hitTestHandle: () => null,
              hitTestDrawing: () => 'drawing-1',
              timeForX: () => null,
              xForTime: () => 300,
            }
          : id === 'trading'
            ? { hitTestDelete: () => null, hitTestTradeLine: () => null, hitTestEdge: () => null }
            : undefined,
    });
    component.engine = engine;
    component.chart = {};
    component.series = { coordinateToPrice: () => 100, priceToCoordinate: () => 250 };
    component.panelDrawings = {
      items: [{ id: 'drawing-1', p1: { time: 0, price: 100 }, p2: { time: 10, price: 110 }, locked: false }],
      selectedId: null,
    };

    // x = 300, y = 250: well inside the 700x500 pane.
    component.handleMouseDown({
      button: 0,
      clientX: 300,
      clientY: 250,
      preventDefault: vi.fn(),
    } as unknown as MouseEvent);

    expect(dispatch).toHaveBeenCalledWith(
      DrawingsActions.selectDrawing({ panelId: 'panel-1', id: 'drawing-1' }),
    );
    expect(engine.setInteractivity).toHaveBeenCalledWith(false);
    expect(component.drag).not.toBeNull();
  });

  describe('handleHoverFeedback: hover over the price-axis strip', () => {
    it('scenario 6: cursor is not ns-resize (reset to default)', () => {
      const { component } = setup();
      const engine = stubEngine(700, 500, {
        getCapability: (id: string) =>
          id === 'trading'
            ? {
                hitTestDelete: () => null,
                // Would report ns-resize if the guard did not short-circuit first.
                hitTestTradeLine: () => ({ id: 'p1', target: 'position', field: 'sl' }),
                hitTestEdge: () => null,
              }
            : undefined,
      });
      component.engine = engine;
      component.chart = {};
      component.series = { coordinateToPrice: () => 100, priceToCoordinate: () => 250 };
      component.container.nativeElement.style.cursor = 'pointer'; // pre-set to a non-default value

      component.handleHoverFeedback({
        clientX: 750, // beyond the 700px pane width
        clientY: 250,
      } as unknown as MouseEvent);

      expect(component.container.nativeElement.style.cursor).toBe('');
    });

    it('regression: hover inside the pane over a trade line still shows ns-resize', () => {
      const { component } = setup();
      const engine = stubEngine(700, 500, {
        getCapability: (id: string) =>
          id === 'trading'
            ? {
                hitTestDelete: () => null,
                hitTestTradeLine: () => ({ id: 'p1', target: 'position', field: 'sl' }),
                hitTestEdge: () => null,
              }
            : undefined,
      });
      component.engine = engine;
      component.chart = {};
      component.series = { coordinateToPrice: () => 100, priceToCoordinate: () => 250 };

      component.handleHoverFeedback({ clientX: 300, clientY: 250 } as unknown as MouseEvent);

      expect(component.container.nativeElement.style.cursor).toBe('ns-resize');
    });
  });

  describe('handleContextMenu: right-click on the price-axis strip', () => {
    it('opens no menu (not a chart gesture)', () => {
      const { component } = setup();
      component.engine = stubEngine(700, 500);
      component.series = { coordinateToPrice: () => 90 };

      component.handleContextMenu({ clientX: 750, clientY: 250 } as unknown as MouseEvent);

      expect(component.menu()).toBeNull();
    });

    it('regression: right-click inside the pane still opens the menu', () => {
      const { component } = setup();
      component.engine = stubEngine(700, 500);
      component.series = { coordinateToPrice: () => 90 };

      component.handleContextMenu({ clientX: 300, clientY: 250 } as unknown as MouseEvent);

      expect(component.menu()).not.toBeNull();
    });
  });
});
