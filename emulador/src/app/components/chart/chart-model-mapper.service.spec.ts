import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { ChartModelMapper } from './chart-model-mapper.service';
import { selectChartStyle, selectTradeChartView } from '../../state/selectors';

describe('ChartModelMapper', () => {
    let mapper: ChartModelMapper;
    let store: MockStore;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [ChartModelMapper, provideMockStore()],
        });
        mapper = TestBed.inject(ChartModelMapper);
        store = TestBed.inject(MockStore);
    });

    describe('buildDrawingsModel', () => {
        it('returns a DrawingsModel with the exact fields provided', () => {
            const result = mapper.buildDrawingsModel(
                [{ id: 'd1', kind: 'rect', p1: { time: 100, price: 50 }, p2: { time: 200, price: 60 } }],
                'rect',
                'd1',
                null,
                3600,
                [100, 200, 300],
                60,
                0.01,
                { accent: '#2962FF', up: '#26A69A', down: '#EF5350' },
            );
            expect(result.items).toHaveLength(1);
            expect(result.activeTool).toBe('rect');
            expect(result.selectedId).toBe('d1');
            expect(result.draft).toBeNull();
            expect(result.shift).toBe(3600);
            expect(result.times).toEqual([100, 200, 300]);
            expect(result.barSpacing).toBe(60);
            expect(result.pointSize).toBe(0.01);
            expect(result.colors.accent).toBe('#2962FF');
        });

        it('passes the draft drawing when provided', () => {
            const draft = { id: '__draft__', kind: 'line' as const, p1: { time: 1, price: 1 }, p2: { time: 2, price: 2 } };
            const result = mapper.buildDrawingsModel([], 'line', null, draft, 0, [], 60, 0.01, { accent: '', up: '', down: '' });
            expect(result.draft).toBe(draft);
        });
    });

    describe('buildTradingModel', () => {
        it('returns a TradingModel with positions, orders, boxes, and markers', () => {
            const pos = [{ id: 'p1', side: 'buy' as const, entryPrice: 100, sl: 95, tp: 110, lots: 1, openTime: 0, origin: '' }];
            const result = mapper.buildTradingModel(
                pos, [], [], [], 0, [100], 60,
                { upColor: '', downColor: '', wickUp: '', wickDown: '', borderUpColor: '', borderDownColor: '', background: '', grid: '', text: '', crosshair: '', tpZone: '', slZone: '' },
                { fill: 0.12, border: 0.6 },
            );
            expect(result.positions).toBe(pos);
            expect(result.pendingOrders).toEqual([]);
        });
    });

    describe('buildSessionModel', () => {
        it('returns a SessionModel with default color when not provided', () => {
            const result = mapper.buildSessionModel(1000, 3600, [100, 200], 60);
            expect(result.color).toBe('#7b7b7b');
            expect(result.sessionEnd).toBe(1000);
        });

        it('accepts a custom color override', () => {
            const result = mapper.buildSessionModel(1000, 0, [], 60, '#ff0000');
            expect(result.color).toBe('#ff0000');
        });
    });

    describe('buildCountdownModel', () => {
        it('returns a CountdownModel with defaults for optional colors', () => {
            const result = mapper.buildCountdownModel(4500.5, '06:58');
            expect(result.price).toBe(4500.5);
            expect(result.text).toBe('06:58');
            expect(result.backColor).toBe('#363a45');
            expect(result.textColor).toBe('#ffffff');
        });

        it('returns null price/text when not available', () => {
            const result = mapper.buildCountdownModel(null, null);
            expect(result.price).toBeNull();
            expect(result.text).toBeNull();
        });
    });

    describe('chartStyle$ reference stability (audit A-1 mitigation)', () => {
        const colorsA = {
            upColor: '#26A69A', downColor: '#EF5350', wickUp: '#26A69A', wickDown: '#EF5350',
            borderUpColor: '#000000', borderDownColor: '#000000', background: '#000000',
            grid: '#1A1A1A', text: '#787B86', crosshair: '#787B86', tpZone: '#089981', slZone: '#F23645',
        };
        const colorsB = { ...colorsA, upColor: '#FFFFFF' };
        const opacityA = { fill: 0.12, border: 0.6 };
        const opacityB = { fill: 0.2, border: 0.8 };

        function collectTwo() {
            const emissions: any[] = [];
            const sub = mapper.chartStyle$.subscribe(v => emissions.push(v));
            return { emissions, sub };
        }

        it('emits the SAME colors reference across two emissions when style.colors is unchanged', () => {
            store.overrideSelector(selectChartStyle, {
                colors: colorsA, gridVisible: true, gridOpacity: 0.5, tradeBoxOpacity: opacityA,
            });
            store.refreshState();

            const { emissions, sub } = collectTwo();
            const result1 = emissions[emissions.length - 1];

            // Second emission: gridOpacity changes but colors/tradeBoxOpacity keep the SAME references.
            store.overrideSelector(selectChartStyle, {
                colors: colorsA, gridVisible: true, gridOpacity: 0.9, tradeBoxOpacity: opacityA,
            });
            store.refreshState();
            const result2 = emissions[emissions.length - 1];

            sub.unsubscribe();
            expect(result1.colors).toBe(result2.colors);
        });

        it('emits a NEW colors reference when style.colors reference/values change', () => {
            store.overrideSelector(selectChartStyle, {
                colors: colorsA, gridVisible: true, gridOpacity: 0.5, tradeBoxOpacity: opacityA,
            });
            store.refreshState();
            const { emissions, sub } = collectTwo();
            const result1 = emissions[emissions.length - 1];

            store.overrideSelector(selectChartStyle, {
                colors: colorsB, gridVisible: true, gridOpacity: 0.5, tradeBoxOpacity: opacityA,
            });
            store.refreshState();
            const result2 = emissions[emissions.length - 1];

            sub.unsubscribe();
            expect(result2.colors).not.toBe(result1.colors);
            expect(result2.colors.upColor).toBe('#FFFFFF');
        });

        it('emits the SAME tradeBoxOpacity reference across two emissions when style.tradeBoxOpacity is unchanged', () => {
            store.overrideSelector(selectChartStyle, {
                colors: colorsA, gridVisible: true, gridOpacity: 0.5, tradeBoxOpacity: opacityA,
            });
            store.refreshState();
            const { emissions, sub } = collectTwo();
            const result1 = emissions[emissions.length - 1];

            // Second emission: gridVisible flips but tradeBoxOpacity/colors keep the SAME references.
            store.overrideSelector(selectChartStyle, {
                colors: colorsA, gridVisible: false, gridOpacity: 0.5, tradeBoxOpacity: opacityA,
            });
            store.refreshState();
            const result2 = emissions[emissions.length - 1];

            sub.unsubscribe();
            expect(result1.tradeBoxOpacity).toBe(result2.tradeBoxOpacity);
        });

        it('emits a NEW tradeBoxOpacity reference when style.tradeBoxOpacity reference/values change', () => {
            store.overrideSelector(selectChartStyle, {
                colors: colorsA, gridVisible: true, gridOpacity: 0.5, tradeBoxOpacity: opacityA,
            });
            store.refreshState();
            const { emissions, sub } = collectTwo();
            const result1 = emissions[emissions.length - 1];

            store.overrideSelector(selectChartStyle, {
                colors: colorsA, gridVisible: true, gridOpacity: 0.5, tradeBoxOpacity: opacityB,
            });
            store.refreshState();
            const result2 = emissions[emissions.length - 1];

            sub.unsubscribe();
            expect(result2.tradeBoxOpacity).not.toBe(result1.tradeBoxOpacity);
            expect(result2.tradeBoxOpacity.fill).toBe(0.2);
        });
    });

    describe('tradeChartView$ array-mapper reference stability (audit T-01 guarantee)', () => {
        const positions = [{ id: 'p1', side: 'buy' as const, entryPrice: 100, sl: 95, tp: 110, lots: 1, riskPct: 1, riskUsd: 100, openTime: 0, origin: 'market' as const }];
        const orders = [{ id: 'o1', side: 'sell' as const, type: 'limit' as const, entryPrice: 105, sl: 110, tp: 95, lots: 1, riskPct: 1, riskUsd: 100, createdAt: 0 }];
        const markers = [{ time: 1, position: 'aboveBar' as const, shape: 'arrowUp' as const, color: 'up' as const, text: 't' }];
        const boxes = [{ id: 'b1', status: 'open' as const, side: 'buy' as const, entry: 100, sl: 95, tp: 110, from: 0, to: null, hidden: false }];

        function collect() {
            const emissions: any[] = [];
            const sub = mapper.tradeChartView$.subscribe(v => emissions.push(v));
            return { emissions, sub };
        }

        it('keeps all four output array references stable when all input array references are unchanged', () => {
            store.overrideSelector(selectTradeChartView, { positions, orders, markers, boxes });
            store.refreshState();
            const { emissions, sub } = collect();
            const r1 = emissions[emissions.length - 1];

            // Re-emit with the exact same source array references (simulates an unrelated state slice change).
            store.overrideSelector(selectTradeChartView, { positions, orders, markers, boxes });
            store.refreshState();
            const r2 = emissions[emissions.length - 1];

            sub.unsubscribe();
            expect(r2.positions).toBe(r1.positions);
            expect(r2.orders).toBe(r1.orders);
            expect(r2.markers).toBe(r1.markers);
            expect(r2.boxes).toBe(r1.boxes);
        });

        it('recomputes only the output whose input array reference changed', () => {
            store.overrideSelector(selectTradeChartView, { positions, orders, markers, boxes });
            store.refreshState();
            const { emissions, sub } = collect();
            const r1 = emissions[emissions.length - 1];

            const newPositions = [{ id: 'p2', side: 'sell' as const, entryPrice: 200, sl: 205, tp: 190, lots: 2, riskPct: 1, riskUsd: 100, openTime: 1, origin: 'market' as const }];
            store.overrideSelector(selectTradeChartView, { positions: newPositions, orders, markers, boxes });
            store.refreshState();
            const r2 = emissions[emissions.length - 1];

            sub.unsubscribe();
            expect(r2.positions).not.toBe(r1.positions);
            expect(r2.orders).toBe(r1.orders);
            expect(r2.markers).toBe(r1.markers);
            expect(r2.boxes).toBe(r1.boxes);
        });
    });
});
