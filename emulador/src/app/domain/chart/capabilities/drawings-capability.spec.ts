import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DrawingsCapability } from './drawings-capability';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { ChartEventBus } from '../chart-event-bus';

function mockSeries(): ISeriesApi<'Candlestick'> {
    return {
        attachPrimitive: vi.fn(),
        detachPrimitive: vi.fn(),
        priceToCoordinate: vi.fn().mockReturnValue(null),
    } as unknown as ISeriesApi<'Candlestick'>;
}

describe('DrawingsCapability', () => {
    let cap: DrawingsCapability;
    let series: ISeriesApi<'Candlestick'>;
    let bus: ChartEventBus;

    beforeEach(() => {
        series = mockSeries();
        bus = new ChartEventBus();
        cap = new DrawingsCapability(series);
    });

    it('has id "drawings"', () => {
        expect(cap.id).toBe('drawings');
    });

    it('attaches a primitive to the series on init', () => {
        cap.init({} as IChartApi, bus);
        expect(series.attachPrimitive).toHaveBeenCalledTimes(1);
    });

    it('does not re-init if already initialized', () => {
        cap.init({} as IChartApi, bus);
        cap.init({} as IChartApi, bus);
        expect(series.attachPrimitive).toHaveBeenCalledTimes(1);
    });

    it('does not init after destroy', () => {
        cap.destroy();
        cap.init({} as IChartApi, bus);
        expect(series.attachPrimitive).not.toHaveBeenCalled();
    });

    it('detaches the primitive on destroy', () => {
        cap.init({} as IChartApi, bus);
        cap.destroy();
        expect(series.detachPrimitive).toHaveBeenCalledTimes(1);
    });

    it('is idempotent on multiple destroy calls', () => {
        cap.init({} as IChartApi, bus);
        cap.destroy();
        cap.destroy();
        expect(series.detachPrimitive).toHaveBeenCalledTimes(1);
    });

    it('returns null from timeForX/xForTime/hitTest after destroy', () => {
        cap.init({} as IChartApi, bus);
        cap.destroy();
        expect(cap.timeForX(100)).toBeNull();
        expect(cap.xForTime(100)).toBeNull();
        expect(cap.hitTestDrawing(10, 10)).toBeNull();
        expect(cap.hitTestHandle(10, 10)).toBeNull();
    });
});
