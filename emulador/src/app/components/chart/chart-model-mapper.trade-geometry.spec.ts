import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { ChartModelMapper } from './chart-model-mapper.service';
import { selectSeries, selectTradeBoxesVisible, selectCurrentAsset } from '../../state/selectors';
import { tradingFeature } from '../../state/trading/trading.reducer';
import { PanelDescriptor } from '../../state/layout/layout.models';
import { Position } from '../../state/trading/trading.models';
import { Candle } from '../../models';

/**
 * RFC-018 Task 5 (F3) — the trade layer's GEOMETRY (which bar a marker lands on),
 * orthogonal to Task 3's gating (WHETHER a panel paints trades at all — covered by
 * `chart-model-mapper.trade-gating.spec.ts`). The defect: before this task,
 * `tradeChartView$` derived markers from `selectTradeChartView`, itself keyed on
 * `selectActiveCandles` — the GLOBAL active timeframe's series. A panel on H4 with the
 * global TF on M1 (or any other TF) received markers snapped to the GLOBAL grid instead
 * of its own — wrong, in production, independent of gating. These tests prove markers
 * (and, by the same code path, boxes) now derive from THIS panel's own candles
 * (`panelChartView$`'s candle source, reused via `resolvePanelCandles` — never a second
 * `generateCustomSeries` derivation).
 */
describe('ChartModelMapper.tradeChartView$ geometry (RFC-018 F3)', () => {
  let store: MockStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideMockStore()] });
    store = TestBed.inject(MockStore);
  });

  afterEach(() => store.resetSelectors());

  function descriptor(overrides: Partial<PanelDescriptor> = {}): PanelDescriptor {
    return { id: 'p1', symbol: '', timeframe: 'H4', linkGroupId: null, ...overrides };
  }

  function candle(time: number): Candle {
    return { time, open: 100, high: 101, low: 99, close: 100 };
  }

  function buyPosition(overrides: Partial<Position> = {}): Position {
    return {
      id: 'p1',
      side: 'buy',
      entryPrice: 100,
      sl: 95,
      tp: 110,
      lots: 1,
      riskPct: 1,
      riskUsd: 100,
      openTime: 0,
      origin: 'market',
      ...overrides,
    };
  }

  /** Seeds the raw slices `tradeChartView$` now reads and returns a subscribed view. */
  function seedAndRead(
    mapper: ChartModelMapper,
    positions: Position[],
  ): { markers: { time: number }[]; boxes: unknown[] } {
    store.overrideSelector(tradingFeature.selectPositions, positions);
    store.overrideSelector(tradingFeature.selectOrders, []);
    store.overrideSelector(tradingFeature.selectHistory, []);
    store.overrideSelector(selectTradeBoxesVisible, true);
    store.overrideSelector(selectCurrentAsset, 'US30');
    store.refreshState();
    let view: { markers: { time: number }[]; boxes: unknown[] } | undefined;
    mapper.tradeChartView$.subscribe((v) => (view = v as never));
    return view!;
  }

  it("panel on H4 with the global TF on M1 snaps markers to H4's own bar opens, not M1's grid", () => {
    const h4 = [candle(0), candle(14400), candle(28800)]; // H4 = 14400s apart
    // A much finer M1 series covering the same window. Before F3, `tradeChartView$` snapped
    // against exactly this kind of GLOBAL series regardless of the panel's own timeframe —
    // if that defect were still present, the position below (openTime 15005) would land on
    // one of these M1 bars (15000) instead of the correct H4 one (14400).
    const m1 = Array.from({ length: 480 }, (_, i) => candle(i * 60)); // t = 0, 60, …, 28740
    store.overrideSelector(selectSeries, { H4: h4, M1: m1 });

    const mapper = TestBed.runInInjectionContext(() => new ChartModelMapper());
    mapper.configurePanel(descriptor({ symbol: 'US30', timeframe: 'H4' }));
    const view = seedAndRead(mapper, [buyPosition({ openTime: 15005 })]);

    expect(view.markers).toHaveLength(1);
    expect(view.markers[0].time).toBe(14400); // H4's own bar open
    expect(view.markers[0].time).not.toBe(15000); // NOT the M1 grid's bar (the pre-F3 defect)
  });

  it('two panels at different timeframes, same trade, each snap to their OWN grid (proof the derivation is per-panel, not global)', () => {
    const h4 = [candle(0), candle(14400), candle(28800)];
    const m5 = Array.from({ length: 100 }, (_, i) => candle(i * 300)); // t = 0, 300, …, 29700
    store.overrideSelector(selectSeries, { H4: h4, M5: m5 });

    const mapperH4 = TestBed.runInInjectionContext(() => new ChartModelMapper());
    const mapperM5 = TestBed.runInInjectionContext(() => new ChartModelMapper());
    mapperH4.configurePanel(descriptor({ id: 'a', symbol: 'US30', timeframe: 'H4' }));
    mapperM5.configurePanel(descriptor({ id: 'b', symbol: 'US30', timeframe: 'M5' }));

    const position = buyPosition({ openTime: 15005 });
    const viewH4 = seedAndRead(mapperH4, [position]);
    const viewM5 = seedAndRead(mapperM5, [position]);

    expect(viewH4.markers[0].time).toBe(14400); // last H4 bar at-or-before 15005
    expect(viewM5.markers[0].time).toBe(15000); // last M5 bar (300s apart) at-or-before 15005
    expect(viewH4.markers[0].time).not.toBe(viewM5.markers[0].time);
  });

  it('unchanged upstream references → identical marker array AND wrapper reference (memo discipline, RFC-017 §4 zero-allocation)', () => {
    const h4 = [candle(0), candle(14400)];
    store.overrideSelector(selectSeries, { H4: h4 });

    const mapper = TestBed.runInInjectionContext(() => new ChartModelMapper());
    mapper.configurePanel(descriptor({ symbol: 'US30', timeframe: 'H4' }));
    store.overrideSelector(tradingFeature.selectPositions, [buyPosition({ openTime: 14400 })]);
    store.overrideSelector(tradingFeature.selectOrders, []);
    store.overrideSelector(tradingFeature.selectHistory, []);
    store.overrideSelector(selectTradeBoxesVisible, true);
    store.overrideSelector(selectCurrentAsset, 'US30');
    store.refreshState();

    const emissions: { markers: unknown[] }[] = [];
    mapper.tradeChartView$.subscribe((v) => emissions.push(v as never));
    const r1 = emissions[emissions.length - 1];

    // A replay tick / unrelated store activity: refresh with the exact same overrides —
    // nothing in the seven-input memo key actually changed.
    store.refreshState();
    const r2 = emissions[emissions.length - 1];

    expect(r2).toBe(r1); // the whole gate-open wrapper stays the same reference
    expect(r2.markers).toBe(r1.markers);
  });

  it("a trade whose openTime precedes the panel's first candle degrades to that first candle without throwing", () => {
    const h4 = [candle(14400), candle(28800)]; // no candle before t=14400
    store.overrideSelector(selectSeries, { H4: h4 });

    const mapper = TestBed.runInInjectionContext(() => new ChartModelMapper());
    mapper.configurePanel(descriptor({ symbol: 'US30', timeframe: 'H4' }));

    expect(() => seedAndRead(mapper, [buyPosition({ openTime: 0 })])).not.toThrow();

    const view = seedAndRead(mapper, [buyPosition({ openTime: 0 })]);
    expect(view.markers).toHaveLength(1);
    expect(view.markers[0].time).toBe(14400); // degrades to the panel's first available candle
  });
});
