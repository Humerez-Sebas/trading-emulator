import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionCapability } from './session-capability';
import { SessionPrimitive } from './session-primitive';
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
    let setSourceSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        series = mockSeries();
        cap = new SessionCapability(series);
        // `SessionCapability` constructs its own `SessionPrimitive` internally
        // (session-capability.ts:21), so the only way to observe what render()
        // passes downstream is to spy on the prototype method before init().
        setSourceSpy = vi.spyOn(SessionPrimitive.prototype, 'setSource');
    });

    afterEach(() => {
        setSourceSpy.mockRestore();
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
        expect(setSourceSpy).toHaveBeenCalledTimes(1);
        expect(setSourceSpy).toHaveBeenCalledWith(null);
    });

    it('sets a populated source when sessionEnd is provided', () => {
        cap.init({} as IChartApi, new ChartEventBus());
        cap.render({
            session: { sessionEnd: 1000, shift: 0, times: [100], barSpacing: 60, color: '#7b7b7b' },
        });
        expect(setSourceSpy).toHaveBeenCalledTimes(1);
        expect(setSourceSpy).toHaveBeenCalledWith({
            sessionEnd: 1000,
            shift: 0,
            times: [100],
            barSpacing: 60,
            color: '#7b7b7b',
        });
    });

    it('does not throw if render is called before init', () => {
        expect(() => cap.render({ session: { sessionEnd: 1000, shift: 0, times: [100], barSpacing: 60 } })).not.toThrow();
        expect(setSourceSpy).not.toHaveBeenCalled();
    });
});
