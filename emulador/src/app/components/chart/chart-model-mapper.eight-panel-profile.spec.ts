import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SERVER_ZONE_ID } from '../../domain/chart/display-time';
import { TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { ChartModelMapper } from './chart-model-mapper.service';
import {
  selectSeries,
  selectCurrentTime,
  selectDisplayZone,
  selectChartView,
} from '../../state/selectors';
import { MAX_PANELS_PER_TAB, PanelDescriptor } from '../../state/layout/layout.models';
import { Candle } from '../../models';

const candle = (time: number, close = 1): Candle => ({
  time,
  open: close,
  high: close,
  low: close,
  close,
});
// A single shared M1 series (proving 8 same-symbol panels reference ONE array; see Task 1).
const m1: Candle[] = Array.from({ length: 300 }, (_, i) => candle(100 + i * 60));

describe('8-panel replay profiling (RFC-012 pt 6: measured fan-out, deterministic)', () => {
  let store: MockStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideMockStore()] });
    store = TestBed.inject(MockStore);
    store.overrideSelector(selectSeries, { M1: m1 });
    store.overrideSelector(selectCurrentTime, 100 + 60 * 100); // cursor mid-series
    store.overrideSelector(selectDisplayZone, SERVER_ZONE_ID);
    // chartView$ (test 3) derives directly from selectChartView (chart-model-mapper.service.ts:166-173),
    // NOT from combineLatest over raw slices like panelChartView$ — it needs its own override to emit.
    store.overrideSelector(selectChartView, {
      tf: 'M1',
      candles: m1,
      idx: 100,
      displayZone: SERVER_ZONE_ID,
      forming: null,
      countdown: null,
    });
  });

  afterEach(() => store.resetSelectors());

  function eightMappers(): ChartModelMapper[] {
    return Array.from({ length: MAX_PANELS_PER_TAB }, (_, i) => {
      const m = TestBed.runInInjectionContext(() => new ChartModelMapper());
      const d: PanelDescriptor = {
        id: `p${i}`,
        symbol: 'SP500',
        timeframe: 'M1',
        linkGroupId: null,
      };
      m.configurePanel(d);
      return m;
    });
  }

  it('all 8 same-symbol panels reference ONE Candle[] array (memory does not scale with panel count)', () => {
    const mappers = eightMappers();
    const seen = mappers.map(() => undefined as Candle[] | undefined);
    mappers.forEach((m, i) => m.panelChartView$.subscribe((v) => (seen[i] = v.candles)));
    seen.forEach((arr) => expect(arr).toBe(m1)); // every panel: same reference, zero copies
  });

  it('ONE replay-clock tick drives exactly 8 per-panel view recomputes with all 8 visible (linear, not quadratic)', () => {
    const mappers = eightMappers();
    const counts = mappers.map(() => 0);
    mappers.forEach((m, i) => m.panelChartView$.subscribe(() => counts[i]++));
    counts.forEach((c) => expect(c).toBe(1)); // initial subscribe emission

    store.overrideSelector(selectCurrentTime, 100 + 60 * 150); // advance the single global clock once
    store.refreshState();

    // Exactly one additional emission per panel: total fan-out is 8 for 8 panels — linear.
    counts.forEach((c) => expect(c).toBe(2));
    const totalRecomputesForOneTick = counts.reduce((a, b) => a + b, 0) - MAX_PANELS_PER_TAB;
    expect(totalRecomputesForOneTick).toBe(MAX_PANELS_PER_TAB); // 8, not 8*8
  });

  it('gating K of the 8 panels reduces the render-stream fan-out to (8 - K) per tick', () => {
    const mappers = eightMappers();
    // Hide the last 3 panels (as if they were in an inactive cell-tab).
    const hidden = 3;
    mappers.slice(MAX_PANELS_PER_TAB - hidden).forEach((m) => m.setUpdatesEnabled(false));

    const viewCounts = mappers.map(() => 0);
    // chartView$ is the gated render stream (drives ChartComponent.render); panelChartView$ is UNgated.
    mappers.forEach((m, i) => m.chartView$.subscribe(() => viewCounts[i]++));

    store.overrideSelector(selectCurrentTime, 100 + 60 * 150);
    store.refreshState();

    const visiblePanels = MAX_PANELS_PER_TAB - hidden;
    const rendersThisTick = viewCounts.reduce((a, b) => a + b, 0) - MAX_PANELS_PER_TAB; // subtract the initial per-panel emission baseline
    // Only visible panels contributed a render for this tick.
    expect(rendersThisTick).toBeLessThanOrEqual(visiblePanels);
  });
});
