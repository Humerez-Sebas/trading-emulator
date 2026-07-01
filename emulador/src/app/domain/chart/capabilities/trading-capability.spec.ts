import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TradingCapability } from './trading-capability';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { ChartEventBus } from '../chart-event-bus';

function mockSeries(): ISeriesApi<'Candlestick'> {
    return {
        attachPrimitive: vi.fn(),
        detachPrimitive: vi.fn(),
        createPriceLine: vi.fn().mockReturnValue({ applyOptions: vi.fn() }),
        removePriceLine: vi.fn(),
        priceToCoordinate: vi.fn().mockReturnValue(null),
    } as unknown as ISeriesApi<'Candlestick'>;
}

describe('TradingCapability', () => {
    let cap: TradingCapability;
    let series: ISeriesApi<'Candlestick'>;
    let bus: ChartEventBus;

    beforeEach(() => {
        series = mockSeries();
        bus = new ChartEventBus();
        cap = new TradingCapability(series);
    });

    it('has id "trading"', () => {
        expect(cap.id).toBe('trading');
    });

    it('attaches all primitives (including series markers) on init', () => {
        cap.init({} as IChartApi, bus);
        expect(series.attachPrimitive).toHaveBeenCalledTimes(3);
    });

    it('does not re-init if already initialized', () => {
        cap.init({} as IChartApi, bus);
        cap.init({} as IChartApi, bus);
        expect(series.attachPrimitive).toHaveBeenCalledTimes(3);
    });

    it('detaches primitives and cleans up on destroy', () => {
        cap.init({} as IChartApi, bus);
        cap.destroy();
        expect(series.detachPrimitive).toHaveBeenCalledTimes(3);
    });

    it('is idempotent on multiple destroy calls', () => {
        cap.init({} as IChartApi, bus);
        cap.destroy();
        cap.destroy();
        expect(series.detachPrimitive).toHaveBeenCalledTimes(3);
    });
});
