import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionCapability } from './session-capability';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { ChartEventBus } from '../chart-event-bus';

function mockSeries(): ISeriesApi<'Candlestick'> {
    return {
        attachPrimitive: vi.fn(),
        detachPrimitive: vi.fn(),
    } as unknown as ISeriesApi<'Candlestick'>;
}

describe('SessionCapability', () => {
    let cap: SessionCapability;
    let series: ISeriesApi<'Candlestick'>;

    beforeEach(() => {
        series = mockSeries();
        cap = new SessionCapability(series);
    });

    it('attaches primitive on init and detaches on destroy', () => {
        cap.init({} as IChartApi, new ChartEventBus());
        expect(series.attachPrimitive).toHaveBeenCalledTimes(1);
        cap.destroy();
        expect(series.detachPrimitive).toHaveBeenCalledTimes(1);
    });

    it('sets source to null when sessionEnd is null', () => {
        cap.init({} as IChartApi, new ChartEventBus());
        cap.render({ session: { sessionEnd: null, shift: 0, times: [], barSpacing: 60 } });
    });

    it('does not throw if render is called before init', () => {
        expect(() => cap.render({ session: { sessionEnd: 1000, shift: 0, times: [100], barSpacing: 60 } })).not.toThrow();
    });
});
