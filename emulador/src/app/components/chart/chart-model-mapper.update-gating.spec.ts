import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { ChartModelMapper } from './chart-model-mapper.service';
import { selectChartStyle, selectChartView } from '../../state/selectors';

const styleA = {
  colors: {
    upColor: '#26A69A',
    downColor: '#EF5350',
    wickUp: '#26A69A',
    wickDown: '#EF5350',
    borderUpColor: '#000000',
    borderDownColor: '#000000',
    background: '#000000',
    grid: '#1A1A1A',
    text: '#787B86',
    crosshair: '#787B86',
    tpZone: '#089981',
    slZone: '#F23645',
  },
  gridVisible: true,
  gridOpacity: 0.5,
  tradeBoxOpacity: { fill: 0.12, border: 0.6 },
};
const styleB = { ...styleA, colors: { ...styleA.colors, upColor: '#FFFFFF' } };

const view = (idx: number) => ({
  tf: 'M1',
  candles: [],
  idx,
  utcOffset: 0,
  forming: null,
  countdown: null,
});

describe('ChartModelMapper update-gating (RFC-012 pt 2 / D6: hidden panel does zero render work)', () => {
  let store: MockStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ChartModelMapper, provideMockStore()] });
    store = TestBed.inject(MockStore);
    store.overrideSelector(selectChartStyle, styleA);
    store.overrideSelector(selectChartView, view(0));
  });

  afterEach(() => store.resetSelectors());

  it('a hidden panel emits ZERO render-stream updates no matter how many times the replay clock advances while hidden', () => {
    const mapper = TestBed.inject(ChartModelMapper);
    const styleSeen: unknown[] = [];
    const viewSeen: unknown[] = [];
    mapper.chartStyle$.subscribe((v) => styleSeen.push(v));
    mapper.chartView$.subscribe((v) => viewSeen.push(v));
    expect(styleSeen).toHaveLength(1); // initial paint while visible
    expect(viewSeen).toHaveLength(1);

    mapper.setUpdatesEnabled(false); // panel hidden (tab switch / cell-tab switch)

    // Replay clock advances several times AND a style change lands while hidden.
    for (let idx = 1; idx <= 5; idx++) {
      store.overrideSelector(selectChartView, view(idx));
      store.refreshState();
    }
    store.overrideSelector(selectChartStyle, styleB);
    store.refreshState();

    // Nothing was delivered downstream: the engine paints nothing for a hidden panel.
    expect(styleSeen).toHaveLength(1);
    expect(viewSeen).toHaveLength(1);
  });

  it('on re-show, each gated stream delivers exactly ONE re-sync emission carrying the LATEST value (not one per intermediate tick missed while hidden)', () => {
    const mapper = TestBed.inject(ChartModelMapper);
    const viewSeen: ReturnType<typeof view>[] = [];
    mapper.chartView$.subscribe((v) => viewSeen.push(v as ReturnType<typeof view>));
    expect(viewSeen).toHaveLength(1);

    mapper.setUpdatesEnabled(false);
    for (let idx = 1; idx <= 5; idx++) {
      store.overrideSelector(selectChartView, view(idx));
      store.refreshState();
    }
    expect(viewSeen).toHaveLength(1); // still gated

    mapper.setUpdatesEnabled(true); // panel becomes visible again

    expect(viewSeen).toHaveLength(2); // exactly ONE catch-up emission, not five
    expect(viewSeen[1].idx).toBe(5); // and it is the LATEST state, not a replay of idx=1
  });

  it('re-show with NOTHING changed while hidden delivers NO duplicate (distinctUntilChanged already painted it)', () => {
    const mapper = TestBed.inject(ChartModelMapper);
    const styleSeen: unknown[] = [];
    mapper.chartStyle$.subscribe((v) => styleSeen.push(v));
    mapper.setUpdatesEnabled(false);
    mapper.setUpdatesEnabled(true);
    expect(styleSeen).toHaveLength(1);
  });
});
