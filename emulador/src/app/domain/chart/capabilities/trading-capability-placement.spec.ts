import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TradingCapability as TradingCapabilityType } from './trading-capability';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { ChartEventBus } from '../chart-event-bus';
import type { ChartColors, Position, RenderModel } from '../render-model';
import { resolveDisplayZone, SERVER_ZONE_ID } from '../display-time';

/**
 * RFC-004/RFC-005 — the interactive-placement preview lines, which moved OUT of
 * `ChartComponent` and INTO this capability when the `ChartEngine.seriesApi` migration
 * bridge was deleted.
 *
 * Why this is a NEW file rather than additions to `trading-capability.spec.ts`: that spec is
 * pre-existing authority (PHILOSOPHY §5.7, the STOP rule) and its `beforeEach` chain is
 * tuned around the `createSeriesMarkers` mock. New behaviour gets its own file.
 *
 * The mocking harness (hoisted stubs + `vi.mock` of the BARE specifier + importing the SUT
 * inside `beforeEach` after `vi.resetModules()`) is copied verbatim from that file's
 * house-convention header: under this repo's Angular unit-test builder `vi.mock` factories are
 * hoisted above module-level statements, and a module-scope SUT import races vitest's
 * optimizeDeps step under `isolate: false`.
 *
 * The `LineStyle` numbers below are lightweight-charts' real enum values, redeclared here
 * because the SUT uses them as plain values passed straight through to `createPriceLine`.
 */
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

/** The real enum values the SUT must emit, named so the assertions read as intent. */
const DASHED = 2;
const LARGE_DASHED = 3;

interface FakePriceLine {
  id: string;
  applyOptions: ReturnType<typeof vi.fn>;
}

function mockSeries(): ISeriesApi<'Candlestick'> {
  let priceLineSeq = 0;
  return {
    attachPrimitive: vi.fn(),
    detachPrimitive: vi.fn(),
    createPriceLine: vi.fn().mockImplementation(
      (): FakePriceLine => ({
        id: `line-${priceLineSeq++}`,
        applyOptions: vi.fn(),
      }),
    ),
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
    tpZone: '#0f0',
    slZone: '#f00',
  };
}

function position(): Position {
  return {
    id: 'p1',
    side: 'buy',
    entryPrice: 100,
    sl: 90,
    tp: 110,
    lots: 1,
    openTime: 0,
    origin: 'market',
  };
}

/** One position (entry + sl + tp = 3 derived lines) and nothing else. */
function tradingModel(): Partial<RenderModel> {
  return {
    trading: {
      positions: [position()],
      pendingOrders: [],
      markers: [],
      boxes: [],
      times: [0, 60, 120],
      barSpacing: 60,
      colors: colors(),
      opacity: { fill: 0.1, border: 0.6 },
      zone: resolveDisplayZone(SERVER_ZONE_ID),
      ruleSlotMap: {},
    },
  } as unknown as Partial<RenderModel>;
}

/** `createPriceLine`'s call arguments, one entry per call, in order. */
function createdLineOptions(series: ISeriesApi<'Candlestick'>): Record<string, unknown>[] {
  const fn = series.createPriceLine as unknown as ReturnType<typeof vi.fn>;
  return fn.mock.calls.map((c: unknown[]) => c[0] as Record<string, unknown>);
}

function createdLines(series: ISeriesApi<'Candlestick'>): FakePriceLine[] {
  const fn = series.createPriceLine as unknown as ReturnType<typeof vi.fn>;
  return fn.mock.results.map((r: { value: unknown }) => r.value as FakePriceLine);
}

describe('TradingCapability — interactive placement preview (RFC-004/RFC-005)', () => {
  let TradingCapability: typeof TradingCapabilityType;
  let cap: TradingCapabilityType;
  let series: ISeriesApi<'Candlestick'>;
  let bus: ChartEventBus;

  beforeEach(async () => {
    vi.resetModules();
    ({ TradingCapability } = await import('./trading-capability'));
    seriesMarkersFactory.mockClear();
    setMarkers.mockClear();
    detachMarkers.mockClear();
    series = mockSeries();
    bus = new ChartEventBus();
    cap = new TradingCapability(series);
    // A chart handle WITH a time scale: `hitTestTradeLine`'s D19.J pane-width check reads
    // `chart.timeScale().width()`, exactly as the pre-existing spec's `chartWithPaneWidth`
    // helper does. 700 px keeps x=300 inside the pane.
    cap.init({ timeScale: () => ({ width: () => 700 }) } as unknown as IChartApi, bus);
  });

  it('addPlacementLine("entry") creates a LargeDashed line with the given price, colour and title', () => {
    cap.addPlacementLine('entry', { price: 4588.5, color: '#2962FF', title: 'Buy limit' });

    expect(series.createPriceLine).toHaveBeenCalledTimes(1);
    expect(createdLineOptions(series)[0]).toEqual({
      price: 4588.5,
      color: '#2962FF',
      lineWidth: 1,
      lineStyle: LARGE_DASHED,
      axisLabelVisible: true,
      title: 'Buy limit',
    });
  });

  it('addPlacementLine("sl") and ("tp") use Dashed — the per-slot style the component used inline', () => {
    cap.addPlacementLine('sl', { price: 90, color: '#f00', title: 'SL?' });
    cap.addPlacementLine('tp', { price: 110, color: '#0f0', title: 'TP?' });

    const opts = createdLineOptions(series);
    expect(opts[0]['lineStyle']).toBe(DASHED);
    expect(opts[1]['lineStyle']).toBe(DASHED);
  });

  it('movePlacementLine applies price+title to that slot ONLY, and never touches colour', () => {
    cap.addPlacementLine('sl', { price: 90, color: '#f00', title: 'SL?' });
    cap.addPlacementLine('tp', { price: 110, color: '#0f0', title: 'TP?' });
    const [slLine, tpLine] = createdLines(series);

    cap.movePlacementLine('sl', 88, 'SL? 1200p');

    expect(slLine.applyOptions).toHaveBeenCalledTimes(1);
    expect(slLine.applyOptions).toHaveBeenCalledWith({ price: 88, title: 'SL? 1200p' });
    expect(tpLine.applyOptions).not.toHaveBeenCalled();
  });

  it('movePlacementLine on an unarmed slot is a silent no-op (mirrors the old `line?.applyOptions`)', () => {
    expect(() => cap.movePlacementLine('tp', 110, 'TP?')).not.toThrow();
    expect(series.createPriceLine).not.toHaveBeenCalled();
  });

  it('re-arming an occupied slot removes the previous line first — no handle can be orphaned', () => {
    cap.addPlacementLine('sl', { price: 90, color: '#f00', title: 'SL?' });
    const first = createdLines(series)[0];

    cap.addPlacementLine('sl', { price: 91, color: '#f00', title: 'SL?' });

    expect(series.removePriceLine).toHaveBeenCalledTimes(1);
    expect(series.removePriceLine).toHaveBeenCalledWith(first);
    expect(series.createPriceLine).toHaveBeenCalledTimes(2);
  });

  it('clearPlacementLines removes every armed line and is idempotent', () => {
    cap.addPlacementLine('entry', { price: 100, color: '#2962FF', title: 'Buy limit' });
    cap.addPlacementLine('sl', { price: 90, color: '#f00', title: 'SL?' });
    cap.addPlacementLine('tp', { price: 110, color: '#0f0', title: 'TP?' });

    cap.clearPlacementLines();
    expect(series.removePriceLine).toHaveBeenCalledTimes(3);

    cap.clearPlacementLines();
    expect(series.removePriceLine).toHaveBeenCalledTimes(3);
  });

  it('destroy() also reclaims an in-progress preview (3 derived lines + 2 preview lines removed)', () => {
    cap.render(tradingModel()); // 3 derived lines (entry + sl + tp)
    cap.addPlacementLine('entry', { price: 100, color: '#2962FF', title: 'Buy limit' });
    cap.addPlacementLine('sl', { price: 90, color: '#f00', title: 'SL?' });

    cap.destroy();

    expect(series.createPriceLine).toHaveBeenCalledTimes(5);
    expect(series.removePriceLine).toHaveBeenCalledTimes(5);
  });

  it('preview lines survive a render() rebuild of the derived trade lines', () => {
    cap.addPlacementLine('sl', { price: 90, color: '#f00', title: 'SL?' });
    const slLine = createdLines(series)[0];

    // A fresh model identity forces the memoized derived-lines rebuild.
    cap.render(tradingModel());
    cap.render(tradingModel());

    cap.movePlacementLine('sl', 89, 'SL');
    expect(slLine.applyOptions).toHaveBeenCalledWith({ price: 89, title: 'SL' });
    expect(series.removePriceLine).not.toHaveBeenCalledWith(slLine);
  });

  it('hitTestTradeLine hands back NO lightweight-charts handle (the leak this RFC closed)', () => {
    (series.priceToCoordinate as unknown as ReturnType<typeof vi.fn>).mockReturnValue(250);
    cap.render(tradingModel());

    const hit = cap.hitTestTradeLine(300, 250);

    expect(hit).not.toBeNull();
    // The identity fields callers actually read are all present…
    expect(hit).toEqual({
      id: 'p1',
      target: 'position',
      field: 'sl',
      price: 90,
      draggable: true,
    });
    // …and the `IPriceLine` is not, at RUNTIME, not merely hidden by the return type.
    expect(Object.keys(hit as object)).not.toContain('line');
    expect((hit as unknown as Record<string, unknown>)['line']).toBeUndefined();
  });
});
