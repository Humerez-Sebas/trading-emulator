import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideMockStore } from '@ngrx/store/testing';
import { ChartModelMapper } from './chart-model-mapper.service';

describe('ChartModelMapper', () => {
    let mapper: ChartModelMapper;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [ChartModelMapper, provideMockStore()],
        });
        mapper = TestBed.inject(ChartModelMapper);
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
});
