import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TradeBoxesPrimitive } from './trade-boxes-primitive';
import type { IChartApi, ISeriesApi, SeriesAttachedParameter, Time } from 'lightweight-charts';
import type { TradeBoxItem } from '../render-model';

const PX = 8; // px per bar
const PANE_WIDTH = 400;

/**
 * Fake chart whose timeScale mirrors the real lightweight-charts contract used
 * by `xForTime` (time-coordinates.ts): integer logicals resolve, fractional
 * logicals outside [0, n-1] return null. `width()` backs the culling/clamp
 * math in `computeScreenBoxes` (trade-boxes-primitive.ts:195-196).
 */
function fakeChart(n: number, px: number = PX): IChartApi {
    return {
        timeScale: () => ({
            width: () => PANE_WIDTH,
            logicalToCoordinate: (l: number) => {
                if (!Number.isInteger(l) && (l < 0 || l > n - 1)) return null;
                return l * px;
            },
            options: () => ({ barSpacing: px }),
        }),
    } as unknown as IChartApi;
}

/** priceToCoordinate: simple linear map, price 100 -> y 0, higher price -> lower y (screen-space). */
function fakeSeries(): ISeriesApi<'Candlestick'> {
    return {
        priceToCoordinate: vi.fn((price: number) => 1000 - price),
    } as unknown as ISeriesApi<'Candlestick'>;
}

function tradeBoxItem(overrides: Partial<TradeBoxItem> = {}): TradeBoxItem {
    return {
        id: 'box-1',
        status: 'open',
        side: 'buy',
        entry: 100,
        sl: 90,
        tp: 110,
        from: 0,
        to: null,
        hidden: false,
        ...overrides,
    };
}

describe('TradeBoxesPrimitive', () => {
    let primitive: TradeBoxesPrimitive;
    let chart: IChartApi;
    let series: ISeriesApi<'Candlestick'>;
    let requestUpdate: ReturnType<typeof vi.fn>;

    // times = [0, 60, 120, 180, 240]; barSpacing 60s => logical i has x = i*PX
    const times = [0, 60, 120, 180, 240];
    const barSpacing = 60;

    beforeEach(() => {
        primitive = new TradeBoxesPrimitive();
        chart = fakeChart(times.length);
        series = fakeSeries();
        requestUpdate = vi.fn();
        primitive.attached({
            chart,
            series,
            requestUpdate,
        } as unknown as SeriesAttachedParameter<Time>);
    });

    it('populates cachedBoxes from the source with correct projected pixel coordinates after setSource + updateAllViews', () => {
        primitive.setSource({
            items: [tradeBoxItem({ id: 'a', entry: 100, sl: 90, tp: 110, from: 0, to: 120 })],
            shift: 0,
            times,
            barSpacing,
            tpColor: '#089981',
            slColor: '#F23645',
            fillAlpha: 0.12,
            borderAlpha: 0.6,
        });
        expect(requestUpdate).toHaveBeenCalledTimes(1);

        primitive.updateAllViews();

        expect(primitive.cachedBoxes).toHaveLength(1);
        const box = primitive.cachedBoxes[0];
        expect(box.id).toBe('a');
        // from=0 -> logical 0 -> x=0; to=120 -> logical 2 -> x=16
        expect(box.x1).toBe(0);
        expect(box.x2).toBe(16);
        // priceToCoordinate(price) = 1000 - price
        expect(box.yEntry).toBe(900); // 1000 - 100
        expect(box.ySl).toBe(910); // 1000 - 90
        expect(box.yTp).toBe(890); // 1000 - 110
    });

    it('projects a live box (to=null) up to one bar past the last rendered candle', () => {
        primitive.setSource({
            items: [tradeBoxItem({ id: 'live', from: 120, to: null })],
            shift: 0,
            times,
            barSpacing,
            tpColor: '#089981',
            slColor: '#F23645',
            fillAlpha: 0.12,
            borderAlpha: 0.6,
        });
        primitive.updateAllViews();

        // lastRenderedUtc = 240 (times[4]); toUtc = 240 + 60 = 300 -> logical 5 -> x = 40
        expect(primitive.cachedBoxes[0].x2).toBe(40);
    });

    describe('hit-testing reads only from the cache (no re-projection)', () => {
        beforeEach(() => {
            primitive.setSource({
                items: [
                    tradeBoxItem({ id: 'open-box', status: 'open', from: 0, to: 60 }),
                    tradeBoxItem({ id: 'closed-box', status: 'closed', from: 120, to: 180, entry: 100, sl: 90, tp: 110 }),
                ],
                shift: 0,
                times,
                barSpacing,
                tpColor: '#089981',
                slColor: '#F23645',
                fillAlpha: 0.12,
                borderAlpha: 0.6,
            });
            // Cache is computed exactly once here.
            primitive.updateAllViews();
            // Reset projection spies AFTER the cache is built; hit-testing must not
            // call them again (trade-boxes-primitive.ts: hitTestBox/hitTestEdge only
            // read `this.cachedBoxes`).
            (series.priceToCoordinate as ReturnType<typeof vi.fn>).mockClear();
        });

        it('hitTestEdge matches the SL edge of a live box without re-invoking priceToCoordinate', () => {
            // open-box: x in [0,8], ySl = 1000-90 = 910
            const hit = primitive.hitTestEdge(4, 910);
            expect(hit).toEqual({ id: 'open-box', status: 'open', field: 'sl' });
            expect(series.priceToCoordinate).not.toHaveBeenCalled();
        });

        it('hitTestEdge ignores closed boxes', () => {
            // closed-box: x in [16,24], ySl = 910 too, but status is closed -> must not match
            const hit = primitive.hitTestEdge(20, 910);
            expect(hit).toBeNull();
            expect(series.priceToCoordinate).not.toHaveBeenCalled();
        });

        it('hitTestBox matches a closed box body without re-invoking priceToCoordinate', () => {
            // closed-box: x in [16,24], y range [yTp=890, ySl=910]
            const hit = primitive.hitTestBox(20, 900);
            expect(hit).toEqual({ id: 'closed-box' });
            expect(series.priceToCoordinate).not.toHaveBeenCalled();
        });

        it('hitTestBox ignores open/pending boxes', () => {
            const hit = primitive.hitTestBox(4, 905);
            expect(hit).toBeNull();
            expect(series.priceToCoordinate).not.toHaveBeenCalled();
        });

        it('cachedBoxes is NOT recomputed by hit-testing calls (stays stable until the next updateAllViews)', () => {
            const before = primitive.cachedBoxes;
            primitive.hitTestBox(20, 900);
            primitive.hitTestEdge(4, 910);
            expect(primitive.cachedBoxes).toBe(before);
        });
    });

    it('recomputes the cache on every updateAllViews() call (pan/zoom-correct, not cross-call memoized)', () => {
        primitive.setSource({
            items: [tradeBoxItem({ id: 'a', from: 0, to: 60 })],
            shift: 0,
            times,
            barSpacing,
            tpColor: '#089981',
            slColor: '#F23645',
            fillAlpha: 0.12,
            borderAlpha: 0.6,
        });
        primitive.updateAllViews();
        const firstX2 = primitive.cachedBoxes[0].x2;
        expect(firstX2).toBe(8); // from=0(logical0,x=0) to=60(logical1,x=8)

        // Simulate a pan/zoom: the library re-attaches with a different
        // pixels-per-bar and drives another updateAllViews() call.
        primitive.attached({
            chart: fakeChart(times.length, PX * 2),
            series,
            requestUpdate,
        } as unknown as SeriesAttachedParameter<Time>);

        primitive.updateAllViews();
        expect(primitive.cachedBoxes[0].x2).toBe(16); // recomputed at 2x scale, not memoized from before
    });

    it('skips hidden boxes entirely', () => {
        primitive.setSource({
            items: [tradeBoxItem({ id: 'hidden', hidden: true })],
            shift: 0,
            times,
            barSpacing,
            tpColor: '#089981',
            slColor: '#F23645',
            fillAlpha: 0.12,
            borderAlpha: 0.6,
        });
        primitive.updateAllViews();
        expect(primitive.cachedBoxes).toHaveLength(0);
    });

    it('culls a box fully off the right side of the pane', () => {
        // PANE_WIDTH = 400 (px), each bar = 8px. A box far beyond the pane
        // (from/to logical ~100) resolves to x >> paneWidth + 10 and is culled.
        primitive.setSource({
            items: [tradeBoxItem({ id: 'offscreen', from: 100_000, to: 100_060 })],
            shift: 0,
            times,
            barSpacing,
            tpColor: '#089981',
            slColor: '#F23645',
            fillAlpha: 0.12,
            borderAlpha: 0.6,
        });
        primitive.updateAllViews();
        expect(primitive.cachedBoxes).toHaveLength(0);
    });

    it('clamps a box that straddles the pane edge instead of emitting huge coordinates', () => {
        // from=0 -> x=0 (within bounds); to at a far-future logical projects well
        // beyond paneWidth+10 and must be clamped to paneWidth+10, not left huge.
        primitive.setSource({
            items: [tradeBoxItem({ id: 'straddle', from: 0, to: 100_000 })],
            shift: 0,
            times,
            barSpacing,
            tpColor: '#089981',
            slColor: '#F23645',
            fillAlpha: 0.12,
            borderAlpha: 0.6,
        });
        primitive.updateAllViews();
        expect(primitive.cachedBoxes).toHaveLength(1);
        expect(primitive.cachedBoxes[0].x2).toBe(PANE_WIDTH + 10);
    });

    it('clears chart/series/requestUpdate on detached()', () => {
        primitive.detached();
        primitive.setSource({
            items: [tradeBoxItem()],
            shift: 0,
            times,
            barSpacing,
            tpColor: '#089981',
            slColor: '#F23645',
            fillAlpha: 0.12,
            borderAlpha: 0.6,
        });
        primitive.updateAllViews();
        // no chart/series after detach -> computeScreenBoxes short-circuits to []
        expect(primitive.cachedBoxes).toHaveLength(0);
    });
});
