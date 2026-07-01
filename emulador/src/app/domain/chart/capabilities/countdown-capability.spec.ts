import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CountdownCapability } from './countdown-capability';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { ChartEventBus } from '../chart-event-bus';

function mockSeries(): ISeriesApi<'Candlestick'> {
    return {
        attachPrimitive: vi.fn(),
        detachPrimitive: vi.fn(),
    } as unknown as ISeriesApi<'Candlestick'>;
}

describe('CountdownCapability', () => {
    let cap: CountdownCapability;
    let series: ISeriesApi<'Candlestick'>;

    beforeEach(() => {
        series = mockSeries();
        cap = new CountdownCapability(series);
    });

    it('attaches primitive on init and detaches on destroy', () => {
        cap.init({} as IChartApi, new ChartEventBus());
        expect(series.attachPrimitive).toHaveBeenCalledTimes(1);
        cap.destroy();
        expect(series.detachPrimitive).toHaveBeenCalledTimes(1);
    });

    it('clears the primitive source when countdown model is null', () => {
        cap.init({} as IChartApi, new ChartEventBus());
        cap.render({ countdown: { price: null, text: null } });
    });

    it('sets the primitive source when a valid countdown model is provided', () => {
        cap.init({} as IChartApi, new ChartEventBus());
        cap.render({ countdown: { price: 4500, text: '06:58', backColor: '#363a45', textColor: '#fff' } });
    });

    it('does not throw if render is called before init', () => {
        expect(() => cap.render({ countdown: { price: 100, text: '05:00' } })).not.toThrow();
    });
});
