import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { ChartModelMapper, PanelChartView } from './chart-model-mapper.service';
import { selectSeries, selectCurrentTime, selectUtcOffset } from '../../state/selectors';
import { PanelDescriptor } from '../../state/layout/layout.models';
import { Candle } from '../../models';

const candle = (time: number, close = 1): Candle => ({
  time,
  open: close,
  high: close,
  low: close,
  close,
});
const m1: Candle[] = [candle(100), candle(160), candle(220)];
const m5: Candle[] = [candle(100), candle(400)];
const panel = (id: string, symbol: string, timeframe: 'M1' | 'M5'): PanelDescriptor => ({
  id,
  symbol,
  timeframe,
  linkGroupId: null,
});

describe('ChartModelMapper shared candle cache (RFC-012 pt 1 / R4: reference identity, no copy)', () => {
  let store: MockStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ChartModelMapper, provideMockStore()] });
    store = TestBed.inject(MockStore);
    store.overrideSelector(selectSeries, { M1: m1, M5: m5 });
    store.overrideSelector(selectCurrentTime, 200);
    store.overrideSelector(selectUtcOffset, 0);
  });

  afterEach(() => store.resetSelectors());

  it('two independent mappers for the SAME symbol+timeframe hand out the SAME Candle[] reference (===), not a deep copy', () => {
    const mapperA = TestBed.runInInjectionContext(() => new ChartModelMapper());
    const mapperB = TestBed.runInInjectionContext(() => new ChartModelMapper());
    mapperA.configurePanel(panel('a', 'SP500', 'M1'));
    mapperB.configurePanel(panel('b', 'SP500', 'M1'));

    let viewA: PanelChartView | undefined;
    let viewB: PanelChartView | undefined;
    mapperA.panelChartView$.subscribe((v) => (viewA = v));
    mapperB.panelChartView$.subscribe((v) => (viewB = v));

    expect(viewA!.candles).toBe(m1); // A did not copy
    expect(viewB!.candles).toBe(m1); // B did not copy
    expect(viewA!.candles).toBe(viewB!.candles); // and both share ONE array object
  });

  it('the shared reference survives a same-reference re-emission (unrelated slice tick does not clone the series)', () => {
    const mapperA = TestBed.runInInjectionContext(() => new ChartModelMapper());
    const mapperB = TestBed.runInInjectionContext(() => new ChartModelMapper());
    mapperA.configurePanel(panel('a', 'SP500', 'M1'));
    mapperB.configurePanel(panel('b', 'SP500', 'M1'));
    let viewA: PanelChartView | undefined, viewB: PanelChartView | undefined;
    mapperA.panelChartView$.subscribe((v) => (viewA = v));
    mapperB.panelChartView$.subscribe((v) => (viewB = v));

    // Re-emit with the SAME m1/m5 array references (simulates a cursor-unrelated tick).
    store.overrideSelector(selectUtcOffset, 0);
    store.refreshState();

    expect(viewA!.candles).toBe(m1);
    expect(viewB!.candles).toBe(viewA!.candles);
  });

  it('two panels of the SAME symbol but DIFFERENT timeframes do NOT share (M1 !== M5), proving the identity is keyed by the actual series slice, not blindly shared', () => {
    const mapperA = TestBed.runInInjectionContext(() => new ChartModelMapper());
    const mapperB = TestBed.runInInjectionContext(() => new ChartModelMapper());
    mapperA.configurePanel(panel('a', 'SP500', 'M1'));
    mapperB.configurePanel(panel('b', 'SP500', 'M5'));
    let viewA: PanelChartView | undefined, viewB: PanelChartView | undefined;
    mapperA.panelChartView$.subscribe((v) => (viewA = v));
    mapperB.panelChartView$.subscribe((v) => (viewB = v));

    expect(viewA!.candles).toBe(m1);
    expect(viewB!.candles).toBe(m5);
    expect(viewA!.candles).not.toBe(viewB!.candles);
  });
});
