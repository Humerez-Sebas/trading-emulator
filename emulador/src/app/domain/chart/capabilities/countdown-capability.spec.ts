import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CountdownCapability } from './countdown-capability';
import { CountdownPrimitive } from './countdown-primitive';
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
    let setSourceSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        series = mockSeries();
        cap = new CountdownCapability(series);
        // `CountdownCapability` constructs its own `CountdownPrimitive` internally
        // (countdown-capability.ts:21); spy on the prototype before init() so the
        // downstream setSource(...) argument is observable.
        setSourceSpy = vi.spyOn(CountdownPrimitive.prototype, 'setSource');
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

    it('clears the primitive source when countdown model is null-ish (price/text absent)', () => {
        cap.init({} as IChartApi, new ChartEventBus());
        cap.render({ countdown: { price: null, text: null } });
        expect(setSourceSpy).toHaveBeenCalledTimes(1);
        expect(setSourceSpy).toHaveBeenCalledWith(null);
    });

    it('clears the primitive source when text is the empty string', () => {
        cap.init({} as IChartApi, new ChartEventBus());
        cap.render({ countdown: { price: 4500, text: '' } });
        expect(setSourceSpy).toHaveBeenCalledTimes(1);
        expect(setSourceSpy).toHaveBeenCalledWith(null);
    });

    it('sets the primitive source when a valid countdown model is provided', () => {
        cap.init({} as IChartApi, new ChartEventBus());
        cap.render({ countdown: { price: 4500, text: '06:58', backColor: '#363a45', textColor: '#fff' } });
        expect(setSourceSpy).toHaveBeenCalledTimes(1);
        expect(setSourceSpy).toHaveBeenCalledWith({
            price: 4500,
            text: '06:58',
            backColor: '#363a45',
            textColor: '#fff',
        });
    });

    it('defaults backColor/textColor when omitted on a valid model', () => {
        cap.init({} as IChartApi, new ChartEventBus());
        cap.render({ countdown: { price: 100, text: '05:00' } });
        expect(setSourceSpy).toHaveBeenCalledWith({
            price: 100,
            text: '05:00',
            backColor: '#363a45',
            textColor: '#ffffff',
        });
    });

    it('does not throw if render is called before init', () => {
        expect(() => cap.render({ countdown: { price: 100, text: '05:00' } })).not.toThrow();
        expect(setSourceSpy).not.toHaveBeenCalled();
    });
});
