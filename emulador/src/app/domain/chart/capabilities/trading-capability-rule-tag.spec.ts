import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TradingCapability as TradingCapabilityType } from './trading-capability';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { ChartEventBus } from '../chart-event-bus';
import type {
  ChartColors,
  Position,
  PendingOrder,
  RenderModel,
} from '../render-model';

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

function tradingModel(overrides: Partial<RenderModel['trading']> = {}): Partial<RenderModel> {
  return {
    trading: {
      positions: [position()],
      pendingOrders: [pendingOrder()],
      boxes: [],
      markers: [],
      shift: 0,
      times: [0, 60, 120],
      barSpacing: 60,
      colors: colors(),
      opacity: { fill: 0.12, border: 0.6 },
      ...overrides,
    },
  };
}

function entryLabelTitle(series: ISeriesApi<'Candlestick'>, index: number): string {
  const calls = (series.createPriceLine as ReturnType<typeof vi.fn>).mock.calls;
  return calls[index][0].title;
}

describe('TradingCapability rule tag suffix (D15.E)', () => {
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
    cap.init({} as IChartApi, bus);
  });

  it('position label has [R{slot}] suffix when declaredRuleId exists and rule has slot', () => {
    const model = tradingModel({
      positions: [position({ declaredRuleId: 'r1' })],
      pendingOrders: [],
      ruleSlotMap: { r1: 3 },
    });
    cap.render(model);
    expect(entryLabelTitle(series, 0)).toBe('C 1 [R3]');
  });

  it('position label has [R] suffix when declaredRuleId exists and rule has no slot', () => {
    const model = tradingModel({
      positions: [position({ declaredRuleId: 'r1' })],
      pendingOrders: [],
      ruleSlotMap: { r1: null },
    });
    cap.render(model);
    expect(entryLabelTitle(series, 0)).toBe('C 1 [R]');
  });

  it('position label has NO suffix when declaredRuleId is dangling (rule not in map)', () => {
    const model = tradingModel({
      positions: [position({ declaredRuleId: 'r-missing' })],
      pendingOrders: [],
      ruleSlotMap: { r1: 3 },
    });
    cap.render(model);
    expect(entryLabelTitle(series, 0)).toBe('C 1');
  });

  it('position label has NO suffix when declaredRuleId is null', () => {
    const model = tradingModel({
      positions: [position({ declaredRuleId: null })],
      pendingOrders: [],
      ruleSlotMap: { r1: 3 },
    });
    cap.render(model);
    expect(entryLabelTitle(series, 0)).toBe('C 1');
  });

  it('position label has NO suffix when ruleSlotMap is absent', () => {
    const model = tradingModel({
      positions: [position({ declaredRuleId: 'r1' })],
      pendingOrders: [],
    });
    cap.render(model);
    expect(entryLabelTitle(series, 0)).toBe('C 1');
  });

  it('order label has [R{slot}] suffix when declaredRuleId exists and rule has slot', () => {
    const model = tradingModel({
      positions: [],
      pendingOrders: [pendingOrder({ declaredRuleId: 'r2' })],
      ruleSlotMap: { r2: 5 },
    });
    cap.render(model);
    expect(entryLabelTitle(series, 0)).toBe('V limit 1 [R5]');
  });

  it('order label has [R] suffix when declaredRuleId exists and rule has no slot', () => {
    const model = tradingModel({
      positions: [],
      pendingOrders: [pendingOrder({ declaredRuleId: 'r2' })],
      ruleSlotMap: { r2: null },
    });
    cap.render(model);
    expect(entryLabelTitle(series, 0)).toBe('V limit 1 [R]');
  });

  it('order label has NO suffix when declaredRuleId is dangling', () => {
    const model = tradingModel({
      positions: [],
      pendingOrders: [pendingOrder({ declaredRuleId: 'r-missing' })],
      ruleSlotMap: { r2: 5 },
    });
    cap.render(model);
    expect(entryLabelTitle(series, 0)).toBe('V limit 1');
  });

  it('sell position label uses "V" prefix with tag', () => {
    const model = tradingModel({
      positions: [position({ side: 'sell', declaredRuleId: 'r1' })],
      pendingOrders: [],
      ruleSlotMap: { r1: 2 },
    });
    cap.render(model);
    expect(entryLabelTitle(series, 0)).toBe('V 1 [R2]');
  });
});
