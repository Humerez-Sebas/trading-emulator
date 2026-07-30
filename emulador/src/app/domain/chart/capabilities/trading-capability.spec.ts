import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveDisplayZone, SERVER_ZONE_ID } from '../display-time';
import type { TradingCapability as TradingCapabilityType } from './trading-capability';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { ChartEventBus } from '../chart-event-bus';
import type {
  ChartColors,
  Position,
  PendingOrder,
  TradeMarker,
  RenderModel,
} from '../render-model';

// `TradingCapability.init()` obtains its markers plugin via the module-level
// `createSeriesMarkers(series, [])` call (trading-capability.ts:10,53). ESM
// namespace exports from the real `lightweight-charts` package are
// non-configurable (`vi.spyOn` throws "Module namespace is not
// configurable"), so the export is replaced via `vi.mock`. `LineStyle` is
// redeclared here as the same numeric enum lightweight-charts ships, since
// trading-capability.ts uses it only as a plain value (line style ids passed
// straight through to createPriceLine).
//
// Two things together make the mock deterministic under the Angular unit-test
// builder's `isolate: false` pool (see the `beforeEach` for the load-bearing
// half):
//   1. The mock fns and the `createSeriesMarkers` stub are built inside
//      `vi.hoisted`, so they are fully initialized before the (hoisted)
//      `vi.mock` factory runs — the factory never closes over a `const` that
//      is still in its temporal dead zone.
//   2. The SUT is imported inside `beforeEach`, NOT at module scope, so
//      trading-capability.ts is evaluated after vitest's optimizeDeps step has
//      settled. Importing it at file-load time raced that step under a cold
//      `node_modules/.vite` cache: the pre-bundled REAL `lightweight-charts`
//      occasionally won over this mock, so the real `createSeriesMarkers`
//      attached its own primitive (`attachPrimitive` 3x instead of 2x) and
//      returned a real plugin (`setMarkers` 0x instead of 1x).
const { setMarkers, detachMarkers, seriesMarkersFactory } = vi.hoisted(() => {
  const setMarkers = vi.fn();
  const detachMarkers = vi.fn();
  return {
    setMarkers,
    detachMarkers,
    seriesMarkersFactory: vi.fn(() => ({
      setMarkers,
      detach: detachMarkers,
      markers: vi.fn().mockReturnValue([]),
    })),
  };
});
vi.mock('lightweight-charts', () => ({
  LineStyle: {
    Solid: 0,
    Dotted: 1,
    Dashed: 2,
    LargeDashed: 3,
    SparseDotted: 4,
  },
  createSeriesMarkers: seriesMarkersFactory,
}));

function mockSeries(): ISeriesApi<'Candlestick'> {
  let priceLineSeq = 0;
  return {
    attachPrimitive: vi.fn(),
    detachPrimitive: vi.fn(),
    createPriceLine: vi.fn().mockImplementation(() => ({
      id: `line-${priceLineSeq++}`,
      applyOptions: vi.fn(),
    })),
    removePriceLine: vi.fn(),
    priceToCoordinate: vi.fn().mockReturnValue(null),
  } as unknown as ISeriesApi<'Candlestick'>;
}

function colors(): ChartColors {
  return {
    upColor: '#0f0',
    downColor: '#f00',
    wickUp: '#0f0',
    wickDown: '#f00',
    borderUpColor: '#0f0',
    borderDownColor: '#f00',
    background: '#000',
    grid: '#111',
    text: '#fff',
    crosshair: '#fff',
    tpZone: '#089981',
    slZone: '#F23645',
  };
}

function position(overrides: Partial<Position> = {}): Position {
  return {
    id: 'pos-1',
    side: 'buy',
    entryPrice: 100,
    sl: 90,
    tp: 110,
    lots: 1,
    openTime: 0,
    origin: 'manual',
    ...overrides,
  };
}

function pendingOrder(overrides: Partial<PendingOrder> = {}): PendingOrder {
  return {
    id: 'ord-1',
    side: 'sell',
    type: 'limit',
    entryPrice: 120,
    sl: 130,
    tp: 100,
    lots: 1,
    ...overrides,
  };
}

function marker(overrides: Partial<TradeMarker> = {}): TradeMarker {
  return {
    time: 0,
    position: 'belowBar',
    shape: 'arrowUp',
    color: 'up',
    text: 'Buy',
    ...overrides,
  };
}

function tradingModel(overrides: Partial<RenderModel['trading']> = {}): Partial<RenderModel> {
  return {
    trading: {
      positions: [position()],
      pendingOrders: [pendingOrder()],
      boxes: [],
      markers: [marker()],
      zone: resolveDisplayZone(SERVER_ZONE_ID),
      times: [0, 60, 120],
      barSpacing: 60,
      colors: colors(),
      opacity: { fill: 0.12, border: 0.6 },
      ...overrides,
    },
  };
}

describe('TradingCapability', () => {
  let TradingCapability: typeof TradingCapabilityType;
  let cap: TradingCapabilityType;
  let series: ISeriesApi<'Candlestick'>;
  let bus: ChartEventBus;

  beforeEach(async () => {
    // Import the SUT HERE rather than at module scope. `lightweight-charts`
    // is a pre-bundled ("optimized") dep; evaluating trading-capability.ts
    // at file-load time races vitest's optimizeDeps step under a cold
    // `node_modules/.vite` cache (the CI condition), and the pre-bundled
    // real module occasionally wins over the vi.mock — the real
    // `createSeriesMarkers` then attaches its own primitive (3 attaches
    // instead of 2) and returns a real plugin (0 setMarkers instead of 1).
    // Resetting the registry and importing after optimization has settled
    // makes the mock deterministically apply on every run.
    vi.resetModules();
    ({ TradingCapability } = await import('./trading-capability'));
    seriesMarkersFactory.mockClear();
    setMarkers.mockClear();
    detachMarkers.mockClear();
    series = mockSeries();
    bus = new ChartEventBus();
    cap = new TradingCapability(series);
  });

  it('has id "trading"', () => {
    expect(cap.id).toBe('trading');
  });

  it('attaches all primitives (including series markers) on init', () => {
    cap.init({} as IChartApi, bus);
    expect(series.attachPrimitive).toHaveBeenCalledTimes(2);
  });

  it('does not re-init if already initialized', () => {
    cap.init({} as IChartApi, bus);
    cap.init({} as IChartApi, bus);
    expect(series.attachPrimitive).toHaveBeenCalledTimes(2);
  });

  it('detaches primitives, series markers, and removes remaining price lines on destroy', () => {
    cap.init({} as IChartApi, bus);
    cap.render(tradingModel());
    cap.destroy();
    expect(series.detachPrimitive).toHaveBeenCalledTimes(2);
    expect(detachMarkers).toHaveBeenCalledTimes(1);
    // 1 position (entry+sl+tp) + 1 order (entry+sl+tp) = 6 lines created and removed
    expect(series.createPriceLine).toHaveBeenCalledTimes(6);
    expect(series.removePriceLine).toHaveBeenCalledTimes(6);
  });

  it('is idempotent on multiple destroy calls', () => {
    cap.init({} as IChartApi, bus);
    cap.destroy();
    cap.destroy();
    expect(series.detachPrimitive).toHaveBeenCalledTimes(2);
    expect(detachMarkers).toHaveBeenCalledTimes(1);
  });

  describe('render()', () => {
    it('creates one price line per entry/sl/tp leg and sets markers once on first render', () => {
      cap.init({} as IChartApi, bus);
      const model = tradingModel();
      cap.render(model);

      // position: entry + sl + tp = 3; order: entry + sl + tp = 3
      expect(series.createPriceLine).toHaveBeenCalledTimes(6);
      expect(series.removePriceLine).not.toHaveBeenCalled();
      expect(setMarkers).toHaveBeenCalledTimes(1);
    });

    it('does NOT recreate price lines or markers on a second render with the same trading reference (C-04/I-02 short-circuit)', () => {
      cap.init({} as IChartApi, bus);
      const model = tradingModel();
      cap.render(model);
      expect(series.createPriceLine).toHaveBeenCalledTimes(6);
      expect(setMarkers).toHaveBeenCalledTimes(1);

      // Same `trading` object reference (and same nested array/color refs) on the
      // second call: render() must short-circuit at trading-capability.ts:90-100.
      cap.render(model);

      expect(series.createPriceLine).toHaveBeenCalledTimes(6);
      expect(series.removePriceLine).not.toHaveBeenCalled();
      expect(setMarkers).toHaveBeenCalledTimes(1);
    });

    it('DOES recreate price lines and markers when a new trading reference is passed, even if structurally equal', () => {
      cap.init({} as IChartApi, bus);
      const model = tradingModel();
      cap.render(model);
      expect(series.createPriceLine).toHaveBeenCalledTimes(6);
      expect(setMarkers).toHaveBeenCalledTimes(1);

      // Structurally-equal but freshly-built trading model (new object identity
      // and new nested array/colors references): referential-equality-only
      // semantics mean this always triggers a rebuild.
      const model2 = tradingModel();
      cap.render(model2);

      expect(series.createPriceLine).toHaveBeenCalledTimes(12);
      expect(series.removePriceLine).toHaveBeenCalledTimes(6);
      expect(setMarkers).toHaveBeenCalledTimes(2);
    });

    it('does nothing when model.trading is absent', () => {
      cap.init({} as IChartApi, bus);
      cap.render({});
      expect(series.createPriceLine).not.toHaveBeenCalled();
      expect(setMarkers).not.toHaveBeenCalled();
    });
  });

  // RFC-019 Task 3 (D19.J): `hitTestTradeLine` gained a leading `x` parameter as
  // belt-and-suspenders behind the DOM-level pane guard (D19.A,
  // `ChartComponent.inPane`). `TradingCapability` HAS a chart handle
  // (`this.chart`, set in `init()`), so the check below is real, not the brief's
  // "accepted-but-unused" fallback for capabilities without one.
  describe('hitTestTradeLine (D19.J)', () => {
    function chartWithPaneWidth(width: number): IChartApi {
      return { timeScale: () => ({ width: () => width }) } as unknown as IChartApi;
    }

    it('rejects x at/beyond the pane width, even when y lines up with a draggable line', () => {
      cap.init(chartWithPaneWidth(700), bus);
      cap.render(tradingModel());
      // Blanket mock: every price maps to y=250, so any draggable line matches on y.
      (series.priceToCoordinate as ReturnType<typeof vi.fn>).mockReturnValue(250);

      expect(cap.hitTestTradeLine(700, 250)).toBeNull(); // AT the pane width: rejected
      expect(cap.hitTestTradeLine(50_000, 250)).toBeNull(); // well beyond: rejected
    });

    it('still finds the line when x is within the pane (no regression)', () => {
      cap.init(chartWithPaneWidth(700), bus);
      cap.render(tradingModel());
      (series.priceToCoordinate as ReturnType<typeof vi.fn>).mockReturnValue(250);

      const hit = cap.hitTestTradeLine(300, 250);

      expect(hit).not.toBeNull();
      expect(hit!.field).toBe('sl'); // position's entry line is non-draggable and skipped first
    });

    it('skips the x-check before init() — no chart handle yet, so the DOM-level guard (D19.A) is the enforcing one, not a throw', () => {
      // this.chart is null until init() runs; render() itself does not depend on
      // it, so lines can exist with no chart handle set at all.
      cap.render(tradingModel());
      (series.priceToCoordinate as ReturnType<typeof vi.fn>).mockReturnValue(250);

      expect(() => cap.hitTestTradeLine(50_000, 250)).not.toThrow();
      expect(cap.hitTestTradeLine(50_000, 250)).not.toBeNull(); // x-check skipped: no chart handle
    });
  });
});
