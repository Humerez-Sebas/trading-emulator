import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TradingCapability } from './trading-capability';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { ChartEventBus } from '../chart-event-bus';
import type { ChartColors, Position, PendingOrder, TradeMarker, RenderModel } from '../render-model';

// `TradingCapability.init()` obtains its markers plugin via the module-level
// `createSeriesMarkers(series, [])` call (trading-capability.ts:10,53). ESM
// namespace exports from the real `lightweight-charts` package are
// non-configurable (`vi.spyOn` throws "Module namespace is not
// configurable"), so the export is replaced via `vi.mock`. The factory stays
// fully synchronous (no `importOriginal`/dynamic import) because the async
// form proved unreliable once this spec ran bundled alongside the full
// 57-file suite (`ReferenceError: Cannot access '__vi_import_N__' before
// initialization`); `LineStyle` is redeclared here as the same numeric enum
// lightweight-charts ships, since trading-capability.ts uses it only as a
// plain value (line style ids passed straight through to createPriceLine).
const setMarkers = vi.fn();
const detachMarkers = vi.fn();
vi.mock('lightweight-charts', () => ({
    LineStyle: {
        Solid: 0,
        Dotted: 1,
        Dashed: 2,
        LargeDashed: 3,
        SparseDotted: 4,
    },
    createSeriesMarkers: vi.fn(() => ({
        setMarkers,
        detach: detachMarkers,
        markers: vi.fn().mockReturnValue([]),
    })),
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
            shift: 0,
            times: [0, 60, 120],
            barSpacing: 60,
            colors: colors(),
            opacity: { fill: 0.12, border: 0.6 },
            ...overrides,
        },
    };
}

describe('TradingCapability', () => {
    let cap: TradingCapability;
    let series: ISeriesApi<'Candlestick'>;
    let bus: ChartEventBus;

    beforeEach(() => {
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
});
