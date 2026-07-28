import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { ChartModelMapper, PanelChartView } from './chart-model-mapper.service';
import {
  selectChartStyle,
  selectTradeBoxesVisible,
  selectCurrentAsset,
  selectCurrentTime,
  selectSeries,
  selectUtcOffset,
  selectReplayTfSeconds,
  selectReplaySeries,
  selectChartView,
} from '../../state/selectors';
import { tradingFeature } from '../../state/trading/trading.reducer';
import { PanelDescriptor } from '../../state/layout/layout.models';
import { Candle, TIMEFRAME_SECONDS } from '../../models';
import { assertNoLookahead, lookaheadViolation } from './lookahead-invariants.spec-util';

describe('ChartModelMapper', () => {
  let mapper: ChartModelMapper;
  let store: MockStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ChartModelMapper, provideMockStore()],
    });
    mapper = TestBed.inject(ChartModelMapper);
    store = TestBed.inject(MockStore);
  });

  afterEach(() => store.resetSelectors());

  describe('buildDrawingsModel', () => {
    it('returns a DrawingsModel with the exact fields provided', () => {
      const result = mapper.buildDrawingsModel(
        [{ id: 'd1', kind: 'rect', p1: { time: 100, price: 50 }, p2: { time: 200, price: 60 } }],
        'rect',
        'd1',
        null,
        3600,
        [100, 200, 300],
        60,
        0.01,
        { accent: '#2962FF', up: '#26A69A', down: '#EF5350' },
      );
      expect(result.items).toHaveLength(1);
      expect(result.activeTool).toBe('rect');
      expect(result.selectedId).toBe('d1');
      expect(result.draft).toBeNull();
      expect(result.shift).toBe(3600);
      expect(result.times).toEqual([100, 200, 300]);
      expect(result.barSpacing).toBe(60);
      expect(result.pointSize).toBe(0.01);
      expect(result.colors.accent).toBe('#2962FF');
    });

    it('passes the draft drawing when provided', () => {
      const draft = {
        id: '__draft__',
        kind: 'line' as const,
        p1: { time: 1, price: 1 },
        p2: { time: 2, price: 2 },
      };
      const result = mapper.buildDrawingsModel([], 'line', null, draft, 0, [], 60, 0.01, {
        accent: '',
        up: '',
        down: '',
      });
      expect(result.draft).toBe(draft);
    });
  });

  describe('buildTradingModel', () => {
    it('returns a TradingModel with positions, orders, boxes, and markers', () => {
      const pos = [
        {
          id: 'p1',
          side: 'buy' as const,
          entryPrice: 100,
          sl: 95,
          tp: 110,
          lots: 1,
          openTime: 0,
          origin: '',
        },
      ];
      const result = mapper.buildTradingModel(
        pos,
        [],
        [],
        [],
        0,
        [100],
        60,
        {
          upColor: '',
          downColor: '',
          wickUp: '',
          wickDown: '',
          borderUpColor: '',
          borderDownColor: '',
          background: '',
          grid: '',
          text: '',
          crosshair: '',
          tpZone: '',
          slZone: '',
        },
        { fill: 0.12, border: 0.6 },
      );
      expect(result.positions).toBe(pos);
      expect(result.pendingOrders).toEqual([]);
    });
  });

  describe('buildSessionModel', () => {
    it('returns a SessionModel with default color when not provided', () => {
      const result = mapper.buildSessionModel(1000, 3600, [100, 200], 60);
      expect(result.color).toBe('#7b7b7b');
      expect(result.sessionEnd).toBe(1000);
    });

    it('accepts a custom color override', () => {
      const result = mapper.buildSessionModel(1000, 0, [], 60, '#ff0000');
      expect(result.color).toBe('#ff0000');
    });
  });

  describe('buildCountdownModel', () => {
    it('returns a CountdownModel with defaults for optional colors', () => {
      const result = mapper.buildCountdownModel(4500.5, '06:58');
      expect(result.price).toBe(4500.5);
      expect(result.text).toBe('06:58');
      expect(result.backColor).toBe('#363a45');
      expect(result.textColor).toBe('#ffffff');
    });

    it('returns null price/text when not available', () => {
      const result = mapper.buildCountdownModel(null, null);
      expect(result.price).toBeNull();
      expect(result.text).toBeNull();
    });
  });

  describe('chartStyle$ reference stability (audit A-1 mitigation)', () => {
    const colorsA = {
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
    };
    const colorsB = { ...colorsA, upColor: '#FFFFFF' };
    const opacityA = { fill: 0.12, border: 0.6 };
    const opacityB = { fill: 0.2, border: 0.8 };

    function collectTwo() {
      const emissions: any[] = [];
      const sub = mapper.chartStyle$.subscribe((v) => emissions.push(v));
      return { emissions, sub };
    }

    it('emits the SAME colors reference across two emissions when style.colors is unchanged', () => {
      store.overrideSelector(selectChartStyle, {
        colors: colorsA,
        gridVisible: true,
        gridOpacity: 0.5,
        tradeBoxOpacity: opacityA,
      });
      store.refreshState();

      const { emissions, sub } = collectTwo();
      const result1 = emissions[emissions.length - 1];

      // Second emission: gridOpacity changes but colors/tradeBoxOpacity keep the SAME references.
      store.overrideSelector(selectChartStyle, {
        colors: colorsA,
        gridVisible: true,
        gridOpacity: 0.9,
        tradeBoxOpacity: opacityA,
      });
      store.refreshState();
      const result2 = emissions[emissions.length - 1];

      sub.unsubscribe();
      expect(result1.colors).toBe(result2.colors);
    });

    it('emits a NEW colors reference when style.colors reference/values change', () => {
      store.overrideSelector(selectChartStyle, {
        colors: colorsA,
        gridVisible: true,
        gridOpacity: 0.5,
        tradeBoxOpacity: opacityA,
      });
      store.refreshState();
      const { emissions, sub } = collectTwo();
      const result1 = emissions[emissions.length - 1];

      store.overrideSelector(selectChartStyle, {
        colors: colorsB,
        gridVisible: true,
        gridOpacity: 0.5,
        tradeBoxOpacity: opacityA,
      });
      store.refreshState();
      const result2 = emissions[emissions.length - 1];

      sub.unsubscribe();
      expect(result2.colors).not.toBe(result1.colors);
      expect(result2.colors.upColor).toBe('#FFFFFF');
    });

    it('emits the SAME tradeBoxOpacity reference across two emissions when style.tradeBoxOpacity is unchanged', () => {
      store.overrideSelector(selectChartStyle, {
        colors: colorsA,
        gridVisible: true,
        gridOpacity: 0.5,
        tradeBoxOpacity: opacityA,
      });
      store.refreshState();
      const { emissions, sub } = collectTwo();
      const result1 = emissions[emissions.length - 1];

      // Second emission: gridVisible flips but tradeBoxOpacity/colors keep the SAME references.
      store.overrideSelector(selectChartStyle, {
        colors: colorsA,
        gridVisible: false,
        gridOpacity: 0.5,
        tradeBoxOpacity: opacityA,
      });
      store.refreshState();
      const result2 = emissions[emissions.length - 1];

      sub.unsubscribe();
      expect(result1.tradeBoxOpacity).toBe(result2.tradeBoxOpacity);
    });

    it('emits a NEW tradeBoxOpacity reference when style.tradeBoxOpacity reference/values change', () => {
      store.overrideSelector(selectChartStyle, {
        colors: colorsA,
        gridVisible: true,
        gridOpacity: 0.5,
        tradeBoxOpacity: opacityA,
      });
      store.refreshState();
      const { emissions, sub } = collectTwo();
      const result1 = emissions[emissions.length - 1];

      store.overrideSelector(selectChartStyle, {
        colors: colorsA,
        gridVisible: true,
        gridOpacity: 0.5,
        tradeBoxOpacity: opacityB,
      });
      store.refreshState();
      const result2 = emissions[emissions.length - 1];

      sub.unsubscribe();
      expect(result2.tradeBoxOpacity).not.toBe(result1.tradeBoxOpacity);
      expect(result2.tradeBoxOpacity.fill).toBe(0.2);
    });
  });

  describe('tradeChartView$ array-mapper reference stability (audit T-01 guarantee)', () => {
    const candles = [{ time: 0, open: 100, high: 105, low: 95, close: 102 }];
    const positions = [
      {
        id: 'p1',
        side: 'buy' as const,
        entryPrice: 100,
        sl: 95,
        tp: 110,
        lots: 1,
        riskPct: 1,
        riskUsd: 100,
        openTime: 0,
        origin: 'market' as const,
      },
    ];
    const orders = [
      {
        id: 'o1',
        side: 'sell' as const,
        type: 'limit' as const,
        entryPrice: 105,
        sl: 110,
        tp: 95,
        lots: 1,
        riskPct: 1,
        riskUsd: 100,
        createdAt: 0,
      },
    ];
    const history: never[] = [];

    // RFC-018 (R18-4, D18.C) — declared spec touch. `tradeChartView$` now gates per panel
    // (T-1 symbol invariant, T-2 `hideTrades`); an unconfigured mapper gates CLOSED (R18-1).
    // This block's tests below subscribe without ever having called `configurePanel`, so
    // without this setup every one of them would observe the gate-closed empty view instead
    // of the data they assert on. This is ADDED required setup, not a weakened assertion —
    // every reference-stability expectation below stays byte-identical.
    //
    // RFC-018 Task 5 (F3, R18-13b — declared spec touch): `tradeChartView$` no longer
    // consumes `selectTradeChartView` (global candles); it now reads `selectSeries` + the
    // three raw trading slices + `selectTradeBoxesVisible` and derives markers/boxes from
    // THIS panel's own candles. Every override below was rewired to match.
    beforeEach(() => {
      store.overrideSelector(selectSeries, { M1: candles });
      store.overrideSelector(tradingFeature.selectPositions, positions);
      store.overrideSelector(tradingFeature.selectOrders, orders);
      store.overrideSelector(tradingFeature.selectHistory, history);
      store.overrideSelector(selectTradeBoxesVisible, true);
      store.overrideSelector(selectCurrentAsset, 'US30');
      mapper.configurePanel({ id: 'p1', symbol: '', timeframe: 'M1', linkGroupId: null });
    });

    function collect() {
      const emissions: any[] = [];
      const sub = mapper.tradeChartView$.subscribe((v) => emissions.push(v));
      return { emissions, sub };
    }

    it('keeps all four output array references stable when all input array references are unchanged', () => {
      store.refreshState();
      const { emissions, sub } = collect();
      const r1 = emissions[emissions.length - 1];

      // Re-emit with the exact same source array references (simulates an unrelated state
      // slice change elsewhere in the store that doesn't touch trading at all).
      store.refreshState();
      const r2 = emissions[emissions.length - 1];

      sub.unsubscribe();
      expect(r2.positions).toBe(r1.positions);
      expect(r2.orders).toBe(r1.orders);
      expect(r2.markers).toBe(r1.markers);
      expect(r2.boxes).toBe(r1.boxes);
    });

    // RFC-018 F3 rewiring (R18-13b): the ORIGINAL trigger here changed ONLY `positions`
    // while `markers`/`boxes` fixtures stayed pinned — that scenario is no longer
    // constructible, because markers/boxes are now genuinely DERIVED from
    // positions/orders/history/candles (`resolveMarkers`/`resolveBoxes` in the mapper)
    // rather than independently injectable mock fields; a new position necessarily changes
    // both the marker set (a new entry marker) and the box set (a new open-position box).
    // The faithful analog, preserving the SAME rigor (exactly one of four outputs changes,
    // the other three stay reference-stable) with a TRUE scenario under the corrected
    // architecture: change ONLY this panel's own candles (`selectSeries`) — the ONE input
    // that feeds markers alone, touching neither positions, orders, nor boxes.
    it("recomputes only the output whose input reference changed (candles-only change recomputes markers alone — F3's whole point)", () => {
      store.refreshState();
      const { emissions, sub } = collect();
      const r1 = emissions[emissions.length - 1];

      // This panel's own M1 series gets a new candle array (a new reference); positions,
      // orders, and history are untouched.
      store.overrideSelector(selectSeries, {
        M1: [...candles, { time: 60, open: 102, high: 106, low: 101, close: 104 }],
      });
      store.refreshState();
      const r2 = emissions[emissions.length - 1];

      sub.unsubscribe();
      expect(r2.positions).toBe(r1.positions); // unaffected: mapPositions is keyed on `positions` alone
      expect(r2.orders).toBe(r1.orders); // unaffected: mapOrders is keyed on `orders` alone
      expect(r2.markers).not.toBe(r1.markers); // THE one output that depends on this panel's candles
      expect(r2.boxes).toBe(r1.boxes); // boxes need no candles at all (raw open/close times)
    });
  });

  describe('panelChartView$ (RFC-008 D8: per-panel parametrized derivation)', () => {
    const candle = (time: number, close = 1): Candle => ({
      time,
      open: close,
      high: close,
      low: close,
      close,
    });
    const m1 = [candle(100), candle(160), candle(220)];
    const m5 = [candle(100), candle(400)];
    const panel = (id: string, timeframe: 'M1' | 'M5'): PanelDescriptor => ({
      id,
      symbol: 'SP500',
      timeframe,
      linkGroupId: null,
    });

    beforeEach(() => {
      store.overrideSelector(selectSeries, { M1: m1, M5: m5 });
      store.overrideSelector(selectCurrentTime, 200);
      store.overrideSelector(selectUtcOffset, 0);
    });

    it('does not emit before configurePanel is called', () => {
      const emissions: unknown[] = [];
      mapper.panelChartView$.subscribe((v) => emissions.push(v));
      expect(emissions).toHaveLength(0);
    });

    it('derives candles and the at-or-before replay index for its own timeframe', () => {
      mapper.configurePanel(panel('p1', 'M1'));
      let view: PanelChartView | undefined;
      mapper.panelChartView$.subscribe((v) => (view = v));
      expect(view!.symbol).toBe('SP500');
      expect(view!.timeframe).toBe('M1');
      expect(view!.candles).toBe(m1);
      expect(view!.idx).toBe(1); // last candle at-or-before t=200 is time=160
      expect(view!.utcOffset).toBe(0);
    });

    it('yields empty candles and idx -1 for a timeframe with no loaded series', () => {
      mapper.configurePanel({ id: 'p1', symbol: 'SP500', timeframe: 'H4', linkGroupId: null });
      let view: PanelChartView | undefined;
      mapper.panelChartView$.subscribe((v) => (view = v));
      expect(view!.candles).toEqual([]);
      expect(view!.idx).toBe(-1);
    });

    it('ISOLATION (Estado Esperado): a change in one panel state does not recompute the others', () => {
      // two independent mapper instances sharing the same store (N panels => N memo slots)
      const mapperA = TestBed.runInInjectionContext(() => new ChartModelMapper());
      const mapperB = TestBed.runInInjectionContext(() => new ChartModelMapper());
      mapperA.configurePanel(panel('a', 'M1'));
      mapperB.configurePanel(panel('b', 'M5'));

      interface WithCompute {
        computePanelView: (...args: unknown[]) => unknown;
      }
      const computeA = vi.spyOn(mapperA as unknown as WithCompute, 'computePanelView');
      const computeB = vi.spyOn(mapperB as unknown as WithCompute, 'computePanelView');
      let emissionsA = 0;
      let emissionsB = 0;
      mapperA.panelChartView$.subscribe(() => emissionsA++);
      mapperB.panelChartView$.subscribe(() => emissionsB++);
      expect(emissionsA).toBe(1);
      expect(emissionsB).toBe(1);
      const computedA = computeA.mock.calls.length;
      const computedB = computeB.mock.calls.length;

      // M1 gets a new candle array; the M5 array reference is unchanged
      store.overrideSelector(selectSeries, { M1: [...m1, candle(280)], M5: m5 });
      store.refreshState();

      // panel A recomputed and re-emitted…
      expect(computeA.mock.calls.length).toBe(computedA + 1);
      expect(emissionsA).toBe(2);
      // …panel B did NOT recompute its RenderModel nor re-emit
      expect(computeB.mock.calls.length).toBe(computedB);
      expect(emissionsB).toBe(1);
    });

    it('the global replay cursor recomputes every panel (single replay clock)', () => {
      const mapperA = TestBed.runInInjectionContext(() => new ChartModelMapper());
      mapperA.configurePanel(panel('a', 'M1'));
      let idx = -99;
      mapperA.panelChartView$.subscribe((v) => (idx = v.idx));
      expect(idx).toBe(1);
      store.overrideSelector(selectCurrentTime, 230);
      store.refreshState();
      expect(idx).toBe(2);
    });

    it('RFC-010 D5: two panels of the SAME symbol but DIFFERENT timeframes project the SAME global currentTime to DIFFERENT candle indices (fan-out by projection, not shared-index replication)', () => {
      // reuses this describe block's own beforeEach: selectSeries={M1: m1, M5: m5}, selectCurrentTime=200
      const mapperA = TestBed.runInInjectionContext(() => new ChartModelMapper()); // own instance = own D8 memo slot
      const mapperB = TestBed.runInInjectionContext(() => new ChartModelMapper());
      mapperA.configurePanel(panel('a', 'M1'));
      mapperB.configurePanel(panel('b', 'M5'));

      let idxA = -99,
        idxB = -99;
      mapperA.panelChartView$.subscribe((v) => (idxA = v.idx));
      mapperB.panelChartView$.subscribe((v) => (idxB = v.idx));

      expect(idxA).toBe(1); // M1 candle at t=160 is at-or-before the shared cursor t=200
      expect(idxB).toBe(0); // M5 candle at t=100 is at-or-before t=200; M5's t=400 candle is still ahead
      // Same cursor T, different indices per panel: proof of per-panel projection, matching the
      // existing 'the global replay cursor recomputes every panel' test just above, extended to
      // show DIVERGENT (not merely simultaneous) projections across timeframes.
    });

    it('RFC-010 D5: a panel whose symbol has a data gap freezes idx on the last available candle when the global cursor is beyond its coverage, and un-freezes on returning to coverage', () => {
      const gappy = [
        { time: 100, open: 1, high: 1, low: 1, close: 1 },
        { time: 200, open: 1, high: 1, low: 1, close: 2 },
      ];
      store.overrideSelector(selectSeries, { M1: gappy });
      store.overrideSelector(selectCurrentTime, 100);
      store.refreshState();
      mapper.configurePanel({ id: 'gap-panel', symbol: 'Y', timeframe: 'M1', linkGroupId: null });
      const views: PanelChartView[] = [];
      mapper.panelChartView$.subscribe((v) => views.push(v));

      store.overrideSelector(selectCurrentTime, 9999); // cursor far beyond this panel's own last candle
      store.refreshState();
      expect(views.at(-1)!.idx).toBe(1); // frozen on the last candle (index 1), not -1

      store.overrideSelector(selectCurrentTime, 150); // cursor moves back within coverage (replay resolution change, etc.)
      store.refreshState();
      expect(views.at(-1)!.idx).toBe(0); // un-frozen: tracks the cursor again
    });
  });

  describe('setUpdatesEnabled (RFC-009 D6 update-gating)', () => {
    const styleFixtureA = {
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
    const styleFixtureB = {
      ...styleFixtureA,
      colors: { ...styleFixtureA.colors, upColor: '#FFFFFF' },
    };

    beforeEach(() => {
      store.overrideSelector(selectChartStyle, styleFixtureA); // build one from existing spec fixtures
    });

    it('suppresses emissions while disabled and re-emits the latest value on enable', () => {
      const seen: unknown[] = [];
      mapper.chartStyle$.subscribe((v) => seen.push(v));
      expect(seen).toHaveLength(1);
      mapper.setUpdatesEnabled(false);
      store.overrideSelector(selectChartStyle, styleFixtureB);
      store.refreshState();
      expect(seen).toHaveLength(1); // gated: no emission
      mapper.setUpdatesEnabled(true);
      expect(seen).toHaveLength(2); // re-sync: latest value delivered
    });

    it('does not duplicate the last value when nothing changed while gated', () => {
      const seen: unknown[] = [];
      mapper.chartStyle$.subscribe((v) => seen.push(v));
      mapper.setUpdatesEnabled(false);
      mapper.setUpdatesEnabled(true);
      expect(seen).toHaveLength(1);
    });

    it('default state is enabled (regression: pre-RFC-009 behavior unchanged)', () => {
      const seen: unknown[] = [];
      mapper.chartStyle$.subscribe((v) => seen.push(v));
      expect(seen).toHaveLength(1);
    });

    it('panelChartView$ stays UNgated: it still emits while setUpdatesEnabled(false)', () => {
      const candle = (time: number, close = 1) => ({
        time,
        open: close,
        high: close,
        low: close,
        close,
      });
      store.overrideSelector(selectSeries, { M1: [candle(100), candle(160)] });
      store.overrideSelector(selectCurrentTime, 100);
      store.overrideSelector(selectUtcOffset, 0);
      store.refreshState();
      mapper.setUpdatesEnabled(false);
      mapper.configurePanel({ id: 'p1', symbol: 'SP500', timeframe: 'M1', linkGroupId: null });
      let view: PanelChartView | undefined;
      mapper.panelChartView$.subscribe((v) => (view = v));
      expect(view).toBeDefined();
      expect(view!.symbol).toBe('SP500');
    });
  });

  /**
   * RFC-019 (D19.C/D/E/G/H, N19-2/N19-3) — the lookahead fix this RFC exists for.
   * `chartView$` used to read `selectResolutionMinutes`/`selectResolutionSeries` (the
   * user's sub-TF OPT-IN, nullable) instead of the replay's actual advance grain
   * (`selectReplayTfSeconds`/`selectReplaySeries`, never null). For a panel whose OWN
   * timeframe is coarser than the grain the cursor actually advances by, that conflation
   * painted the candle CONTAINING the cursor whole — including price action between the
   * cursor and that candle's close the trader has not lived yet.
   *
   * Every emission here goes through a freshly-configured mapper reading the described
   * fixtures directly (no `refreshState()` before the first read) — the exact pattern the
   * pre-existing `panelChartView$` block above already relies on: `configurePanel` is
   * called BEFORE `subscribe`, so the `combineLatest` synchronously settles on the real
   * descriptor (the `startWith(null)` frame collapses into it in the same microtask).
   */
  describe('chartView$ (RFC-019 D19.C/D/E/G/H — cross-TF forming candle, D-B1)', () => {
    const candle = (time: number, o = 1, h = 1, l = 1, c = 1): Candle => ({
      time,
      open: o,
      high: h,
      low: l,
      close: c,
    });

    function descriptor(overrides: Partial<PanelDescriptor> = {}): PanelDescriptor {
      return { id: 'p1', symbol: 'US30', timeframe: 'H1', linkGroupId: null, ...overrides };
    }

    const dummyGlobalView = {
      tf: null as string | null,
      candles: [] as Candle[],
      idx: -1,
      utcOffset: 0,
      forming: null as Candle | null,
      countdown: null as string | null,
    };

    beforeEach(() => {
      // Never actually read once a descriptor is configured (every scenario below
      // configures one) — set for combineLatest completeness only, matching the
      // established pattern in the `panelChartView$`/`eight-panel-profile` specs.
      store.overrideSelector(selectChartView, dummyGlobalView);
    });

    /** Configures the panel, subscribes, returns the single settled emission. */
    function emit(d: PanelDescriptor): {
      tf: string | null;
      candles: Candle[];
      idx: number;
      utcOffset: number;
      forming: Candle | null;
      countdown: string | null;
    } {
      mapper.configurePanel(d);
      let view: ReturnType<typeof emit> | undefined;
      mapper.chartView$.subscribe((v) => (view = v));
      return view!;
    }

    it('scenario 1 — single panel, TF == replay grain (resolution off): forming null, idx NOT decremented (byte-identity guard, the most common configuration)', () => {
      const m1 = [candle(0), candle(60), candle(120)];
      store.overrideSelector(selectSeries, { M1: m1 });
      store.overrideSelector(selectCurrentTime, 130);
      store.overrideSelector(selectUtcOffset, 0);
      store.overrideSelector(selectReplayTfSeconds, 60); // == TIMEFRAME_SECONDS['M1']
      store.overrideSelector(selectReplaySeries, m1);
      store.overrideSelector(selectCurrentAsset, 'US30');

      const view = emit(descriptor({ symbol: 'US30', timeframe: 'M1' }));

      expect(view.forming).toBeNull();
      expect(view.idx).toBe(2); // lastIndexAtOrBefore([0,60,120], 130) — un-decremented
      expect(view.candles).toBe(m1); // resolvePanelCandles passthrough, same reference as today
    });

    it('scenario 2 — H1 panel, M5 replay grain: forming aggregated, idx decremented, forming.time === bucketStart', () => {
      const h1 = [candle(0), candle(3600), candle(7200)];
      const m5 = [candle(3600, 10, 12, 9, 11), candle(3900, 11, 15, 10, 13), candle(4200, 13, 14, 12, 13.5)];
      store.overrideSelector(selectSeries, { H1: h1 });
      store.overrideSelector(selectCurrentTime, 4200);
      store.overrideSelector(selectUtcOffset, 0);
      store.overrideSelector(selectReplayTfSeconds, 300);
      store.overrideSelector(selectReplaySeries, m5);
      store.overrideSelector(selectCurrentAsset, 'US30');

      const view = emit(descriptor({ symbol: 'US30', timeframe: 'H1' }));

      expect(view.forming).not.toBeNull();
      expect(view.forming!.time).toBe(3600); // bucketStart
      expect(view.forming!.open).toBe(10); // first revealed candle's open
      expect(view.forming!.high).toBe(15); // max across the revealed window
      expect(view.forming!.low).toBe(9); // min across the revealed window
      expect(view.forming!.close).toBe(13.5); // last revealed candle's close
      expect(view.idx).toBe(0); // lastIndexAtOrBefore(h1, 4200) = 1, decremented to 0
    });

    it('scenario 3 (D-B1) — H1 panel, M5 grain, gap in the replay series (hi < lo): forming null AND idx STILL decremented', () => {
      const h1 = [candle(0), candle(3600), candle(7200)];
      const m5 = [candle(0)]; // nothing revealed inside [3600, 4200] — the uncomputable case
      store.overrideSelector(selectSeries, { H1: h1 });
      store.overrideSelector(selectCurrentTime, 4200);
      store.overrideSelector(selectUtcOffset, 0);
      store.overrideSelector(selectReplayTfSeconds, 300);
      store.overrideSelector(selectReplaySeries, m5);
      store.overrideSelector(selectCurrentAsset, 'US30');

      const view = emit(descriptor({ symbol: 'US30', timeframe: 'H1' }));

      expect(view.forming).toBeNull(); // aggregateFormingCandle's hi<lo guard
      expect(view.idx).toBe(0); // STILL decremented (1 - 1) — the degraded path shows the
      // last CLOSED candle, never the future-containing one (D-B1's whole point).
    });

    it('scenario 4 — M1 panel, H1 replay grain (panel FINER than grain): subGrain false, forming null, idx untouched', () => {
      const m1 = [candle(0), candle(60), candle(120), candle(180)];
      store.overrideSelector(selectSeries, { M1: m1 });
      store.overrideSelector(selectCurrentTime, 200);
      store.overrideSelector(selectUtcOffset, 0);
      store.overrideSelector(selectReplayTfSeconds, 3600); // H1 grain, coarser than the M1 panel
      store.overrideSelector(selectReplaySeries, []); // irrelevant: subGrain must be false before this is read
      store.overrideSelector(selectCurrentAsset, 'US30');

      const view = emit(descriptor({ symbol: 'US30', timeframe: 'M1' }));

      expect(view.forming).toBeNull();
      expect(view.idx).toBe(3); // lastIndexAtOrBefore(m1, 200) — untouched, no decrement
    });

    it('scenario 5 (N19-3) — foreign-symbol panel, H1, M5 grain: forming null, idx untouched despite activeSeconds > grain', () => {
      const h1 = [candle(0), candle(3600), candle(7200)];
      const m5 = [candle(3600), candle(3900), candle(4200)];
      store.overrideSelector(selectSeries, { H1: h1 });
      store.overrideSelector(selectCurrentTime, 4200);
      store.overrideSelector(selectUtcOffset, 0);
      store.overrideSelector(selectReplayTfSeconds, 300);
      store.overrideSelector(selectReplaySeries, m5);
      store.overrideSelector(selectCurrentAsset, 'US30'); // primary asset

      const view = emit(descriptor({ symbol: 'NAS100', timeframe: 'H1' })); // foreign symbol

      expect(view.forming).toBeNull();
      expect(view.idx).toBe(1); // untouched: lastIndexAtOrBefore(h1, 4200), NOT decremented
    });

    it('scenario 6 (C1 regression guard) — hideTrades:true panel, H1, M5 grain: forming STILL aggregated, idx STILL decremented (hideTrades must NOT suppress candle fidelity)', () => {
      const h1 = [candle(0), candle(3600), candle(7200)];
      const m5 = [candle(3600, 10, 12, 9, 11), candle(3900, 11, 15, 10, 13), candle(4200, 13, 14, 12, 13.5)];
      store.overrideSelector(selectSeries, { H1: h1 });
      store.overrideSelector(selectCurrentTime, 4200);
      store.overrideSelector(selectUtcOffset, 0);
      store.overrideSelector(selectReplayTfSeconds, 300);
      store.overrideSelector(selectReplaySeries, m5);
      store.overrideSelector(selectCurrentAsset, 'US30');

      // Same fixture as scenario 2, but the descriptor opts OUT of trade ink. If
      // `chartView$` gated on `panelRendersTrades` (symbol ∧ !hideTrades) instead of the
      // isolated `panelTracksPrimarySeries` (symbol alone), this panel would silently lose
      // its forming candle and fall back to `idx` inclusive — repainting the future
      // candle. That is the exact defect plan §0 C1 overrides the original brief to avoid.
      const view = emit(descriptor({ symbol: 'US30', timeframe: 'H1', hideTrades: true }));

      expect(view.forming).not.toBeNull();
      expect(view.forming!.time).toBe(3600);
      expect(view.idx).toBe(0); // decremented exactly as in scenario 2
    });

    it('scenario 7 — idx === 0 boundary: idx emitted as -1, forming present, no throw', () => {
      const h1 = [candle(3600)]; // a single H1 candle, idx = 0
      const m5 = [candle(3600), candle(3900), candle(4200)];
      store.overrideSelector(selectSeries, { H1: h1 });
      store.overrideSelector(selectCurrentTime, 4200);
      store.overrideSelector(selectUtcOffset, 0);
      store.overrideSelector(selectReplayTfSeconds, 300);
      store.overrideSelector(selectReplaySeries, m5);
      store.overrideSelector(selectCurrentAsset, 'US30');

      let view: ReturnType<typeof emit> | undefined;
      expect(() => {
        view = emit(descriptor({ symbol: 'US30', timeframe: 'H1' }));
      }).not.toThrow();

      expect(view!.idx).toBe(-1);
      expect(view!.forming).not.toBeNull();
    });

    it('scenario 8 (D19.H memo) — an unrelated input change (utcOffset) leaves `forming` reference-IDENTICAL; a real cursor change gives a NEW reference (aggregateFormingCandle not re-run on the miss-free tick)', () => {
      const h1 = [candle(0), candle(3600), candle(7200)];
      const m5 = [candle(3600, 10, 12, 9, 11), candle(3900, 11, 15, 10, 13), candle(4200, 13, 14, 12, 13.5)];
      store.overrideSelector(selectSeries, { H1: h1 });
      store.overrideSelector(selectCurrentTime, 4200);
      store.overrideSelector(selectUtcOffset, 0);
      store.overrideSelector(selectReplayTfSeconds, 300);
      store.overrideSelector(selectReplaySeries, m5);
      store.overrideSelector(selectCurrentAsset, 'US30');
      mapper.configurePanel(descriptor({ symbol: 'US30', timeframe: 'H1' }));

      const emissions: ReturnType<typeof emit>[] = [];
      mapper.chartView$.subscribe((v) => emissions.push(v));
      const r1 = emissions[emissions.length - 1];
      expect(r1.forming).not.toBeNull();

      // Unrelated input changes (utcOffset only) — the memo key (series, bucketStart,
      // cursor) is untouched, so `aggregateFormingCandle` must NOT run again: same object.
      store.overrideSelector(selectUtcOffset, 5);
      store.refreshState();
      const r2 = emissions[emissions.length - 1];
      expect(r2.utcOffset).toBe(5); // the outer view DID recompute
      expect(r2.forming).toBe(r1.forming); // but the forming sub-computation is a cache hit

      // A REAL cursor change inside the same bucket — the memo key's `cursor` differs, so
      // this must be a genuine miss: a fresh object, not the stale r1/r2 one (R7's proof
      // in miniature — the memo is keyed on cursor, not incrementally updated).
      store.overrideSelector(selectCurrentTime, 3900);
      store.refreshState();
      const r3 = emissions[emissions.length - 1];
      expect(r3.forming).not.toBeNull();
      expect(r3.forming).not.toBe(r1.forming);
    });

    it('scenario 9 (D19.G routing) — an unloaded custom M-timeframe resolves through resolvePanelCandles: candles stay reference-stable across a tick that leaves `series` untouched (generateCustomSeries not re-run)', () => {
      // M3 has no loaded series of its own; resolvePanelCandles must route through
      // generateCustomSeries(series, 3), aggregating the loaded M1 base — the SAME shared
      // per-instance memo `panelChartView$`/`tradeChartView$` already use (RFC-018 F3),
      // not a second independent derivation inline in chartView$ (the pre-RFC-019 dead
      // code this task deletes).
      const m1 = [candle(0), candle(60), candle(120), candle(180), candle(240), candle(300)];
      const series = { M1: m1 };
      store.overrideSelector(selectSeries, series);
      store.overrideSelector(selectCurrentTime, 200);
      store.overrideSelector(selectUtcOffset, 0);
      store.overrideSelector(selectReplayTfSeconds, 180); // == TIMEFRAME_SECONDS['M3'], subGrain false
      store.overrideSelector(selectReplaySeries, m1);
      store.overrideSelector(selectCurrentAsset, 'US30');
      mapper.configurePanel(descriptor({ symbol: 'US30', timeframe: 'M3' }));

      const emissions: ReturnType<typeof emit>[] = [];
      mapper.chartView$.subscribe((v) => emissions.push(v));
      const r1 = emissions[emissions.length - 1];
      expect(r1.candles.length).toBeGreaterThan(0); // generateCustomSeries actually produced M3 bars

      // Unrelated input change; `series` keeps the EXACT SAME object reference.
      store.overrideSelector(selectUtcOffset, 7);
      store.refreshState();
      const r2 = emissions[emissions.length - 1];

      expect(r2.candles).toBe(r1.candles); // resolvePanelCandles memo hit — no second generateCustomSeries call
    });

    it('R7 — advance, rewind, re-advance: the memo never serves a STALE (wrong-content) forming candle across the rewind', () => {
      // The brief explicitly bans an incremental O(1) "running high/low" implementation
      // for exactly this reason: it is only valid under monotonic advance. Keying on
      // `cursor` makes a rewind a cache MISS by construction, forcing a full
      // recomputation from `bucketStart` every time — this spec proves that recomputation
      // actually happens and is content-correct, not just reference-different.
      const h1 = [candle(0), candle(3600), candle(7200)];
      const m5 = [candle(3600, 10, 12, 9, 11), candle(3900, 11, 15, 10, 13), candle(4200, 13, 14, 12, 13.5)];
      store.overrideSelector(selectSeries, { H1: h1 });
      store.overrideSelector(selectUtcOffset, 0);
      store.overrideSelector(selectReplayTfSeconds, 300);
      store.overrideSelector(selectReplaySeries, m5);
      store.overrideSelector(selectCurrentAsset, 'US30');
      store.overrideSelector(selectCurrentTime, 4200); // advance to the end of the bucket
      mapper.configurePanel(descriptor({ symbol: 'US30', timeframe: 'H1' }));

      const emissions: ReturnType<typeof emit>[] = [];
      mapper.chartView$.subscribe((v) => emissions.push(v));
      const advanced = emissions[emissions.length - 1];
      expect(advanced.forming!.high).toBe(15); // 3600, 3900, 4200 all revealed

      store.overrideSelector(selectCurrentTime, 3600); // rewind to the bucket's first candle only
      store.refreshState();
      const rewound = emissions[emissions.length - 1];
      expect(rewound.forming!.high).toBe(12); // ONLY the 3600 candle — no carryover from 15

      store.overrideSelector(selectCurrentTime, 4200); // re-advance to the same cursor as before
      store.refreshState();
      const readvanced = emissions[emissions.length - 1];
      expect(readvanced.forming!.high).toBe(15); // freshly recomputed, matches the original — not stuck at 12
      expect(readvanced.forming).not.toBe(rewound.forming); // a genuinely new object, not the rewind's stale one
    });

    /**
     * RFC-019 (D19.I, N19-4) — Task 5: an independent second check on the scenario matrix
     * above, plus a TDD-first proof that the checker is actually sensitive to the exact
     * pre-RFC defect this whole RFC exists to close ("an invariant that cannot fail on the
     * bug it was written for is worthless"). Nested inside the parent `describe` so it
     * reuses `candle`, `descriptor`, `emit`, and `dummyGlobalView` verbatim rather than
     * re-declaring fixture helpers (plan §3 Task 5) — this block is purely additive, no
     * existing `it`/assertion above is touched (STOP rule).
     */
    describe('assertNoLookahead (D19.I, N19-4) — Task 5 boundary specs', () => {
      // Step 2 (TDD, written first): prove the helper actually catches the real defect —
      // an H1 panel whose `idx` was NOT decremented (the pre-RFC shape) at a mid-bucket
      // cursor paints candles[1] (opens 3600) whole, even though its true close (7200) is
      // still 3000 seconds in the trader's future.
      it('flags the PRE-RFC shape: idx un-decremented on an H1 panel at a mid-bucket cursor paints a candle whose close is still in the future', () => {
        const h1 = [candle(0), candle(3600), candle(7200)];
        const cursor = 4200; // 10 minutes into the [3600, 7200) H1 bucket
        const preRfcIdx = 1; // pre-RFC: NOT decremented — candles[1] is still painted whole
        const activeSeconds = TIMEFRAME_SECONDS['H1']; // 3600
        const replayGrainSeconds = 300; // M5 replay grain — revealed instant = 4500

        const message = lookaheadViolation(h1, preRfcIdx, null, cursor, activeSeconds, replayGrainSeconds);

        // Proof this still catches the defect it exists for, EVEN under the corrected
        // (looser) revealed-instant bound: candles[1] closes at 7200, the revealed instant
        // is only 4500 (cursor 4200 + grain 300) — 7200 is 2700 seconds past it, nowhere
        // near the boundary. Fixing the M1 off-by-one does not blunt this check.
        expect(message).not.toBeNull();
        expect(message).toContain('candles[1]'); // names the offending index
        expect(message).toContain('7200'); // names the actual close time
        expect(message).toContain('4200'); // names the raw cursor
        expect(message).toContain('4500'); // names the revealed instant it exceeds
      });

      it('idx === -1 is a clean no-op pass (empty range), not a throw', () => {
        expect(lookaheadViolation([], -1, null, 1000, 3600, 300)).toBeNull();
        expect(() => assertNoLookahead([], -1, null, 1000, 3600, 300)).not.toThrow();
      });

      it('flags the forming clause: a forming candle opening after the cursor (the clause the candle-close fix must not touch)', () => {
        const forming = candle(4500);
        const message = lookaheadViolation([], -1, forming, 4200, 3600, 300);

        expect(message).not.toBeNull();
        expect(message).toContain('forming'); // names which clause fired
        expect(message).toContain('4500'); // the forming candle's open
        expect(message).toContain('4200'); // the cursor it exceeds — RAW cursor, not R
      });

      it('scenario 1 — H1 panel + M5 replay grain, mid-bucket: assertNoLookahead passes on the real chartView$ emission', () => {
        const h1 = [candle(0), candle(3600), candle(7200)];
        const m5 = [candle(3600, 10, 12, 9, 11), candle(3900, 11, 15, 10, 13), candle(4200, 13, 14, 12, 13.5)];
        store.overrideSelector(selectSeries, { H1: h1 });
        store.overrideSelector(selectCurrentTime, 4200);
        store.overrideSelector(selectUtcOffset, 0);
        store.overrideSelector(selectReplayTfSeconds, 300);
        store.overrideSelector(selectReplaySeries, m5);
        store.overrideSelector(selectCurrentAsset, 'US30');

        const view = emit(descriptor({ symbol: 'US30', timeframe: 'H1' }));

        expect(() =>
          assertNoLookahead(view.candles, view.idx, view.forming, 4200, TIMEFRAME_SECONDS['H1'], 300),
        ).not.toThrow();
      });

      it('scenario 2 — single M5 panel, no resolution (replay grain == panel TF): passes on the cursor `advanceCandle` actually produces (forming null, idx not decremented)', () => {
        const m5 = [candle(0), candle(300), candle(600)];
        // The cursor `advanceCandle` sets for this fixture: the OPEN of the last candle
        // (`replay.effects.ts:49` — `goToTime({ time: candles[next].time })`), never its
        // close. For a native-TF (subGrain-false) panel the invariant's revealed instant is
        // `cursor + replayGrainSeconds`, which lands exactly on the last painted candle's
        // own close (600 + 300 = 900) — equality at worst, per D19.I's algebra. A cursor of
        // 900 here would be a value production never produces (the next `advanceCandle` on
        // this fixture yields `endOfData`), which is exactly what audit finding M1 flagged.
        const cursor = 600;
        store.overrideSelector(selectSeries, { M5: m5 });
        store.overrideSelector(selectCurrentTime, cursor);
        store.overrideSelector(selectUtcOffset, 0);
        store.overrideSelector(selectReplayTfSeconds, 300); // == TIMEFRAME_SECONDS['M5']: subGrain false
        store.overrideSelector(selectReplaySeries, m5);
        store.overrideSelector(selectCurrentAsset, 'US30');

        const view = emit(descriptor({ symbol: 'US30', timeframe: 'M5' }));

        expect(view.forming).toBeNull();
        expect(view.idx).toBe(2); // lastIndexAtOrBefore(m5, 600) — un-decremented, the pre-RFC shape
        assertNoLookahead(view.candles, view.idx, view.forming, cursor, TIMEFRAME_SECONDS['M5'], 300);
      });

      it('scenario 2b (RFC §4.3 row 3 — panel FINER than the replay grain) — M1 panel, H1 replay grain: passes, and is falsified by the pre-fix raw-cursor comparison', () => {
        // Task 2 scenario 4's fixture: subGrain false (panel TF finer than the grain), so
        // idx is untouched. The pre-fix helper (comparing `close <= cursor`) throws here —
        // candles[3] opens at 180 and closes at 240, which is already past the raw cursor
        // (200) even though nothing about this panel is dishonest: an M1 panel finer than
        // an H1 grain is RFC §4.3's "ya correcto" row. This is the exact falsification audit
        // finding M1 identified as going unexercised by the pre-fix matrix.
        const m1 = [candle(0), candle(60), candle(120), candle(180)];
        store.overrideSelector(selectSeries, { M1: m1 });
        store.overrideSelector(selectCurrentTime, 200);
        store.overrideSelector(selectUtcOffset, 0);
        store.overrideSelector(selectReplayTfSeconds, 3600); // H1 grain, coarser than the M1 panel
        store.overrideSelector(selectReplaySeries, []); // irrelevant: subGrain must be false before this is read
        store.overrideSelector(selectCurrentAsset, 'US30');

        const view = emit(descriptor({ symbol: 'US30', timeframe: 'M1' }));

        expect(view.forming).toBeNull();
        expect(view.idx).toBe(3); // lastIndexAtOrBefore(m1, 200) — untouched, no decrement
        assertNoLookahead(view.candles, view.idx, view.forming, 200, TIMEFRAME_SECONDS['M1'], 3600);
      });

      it('scenario 3 — idx === 0 boundary (emits idx === -1): passes, no throw', () => {
        const h1 = [candle(3600)]; // a single H1 candle, idx = 0 pre-decrement
        const m5 = [candle(3600), candle(3900), candle(4200)];
        store.overrideSelector(selectSeries, { H1: h1 });
        store.overrideSelector(selectCurrentTime, 4200);
        store.overrideSelector(selectUtcOffset, 0);
        store.overrideSelector(selectReplayTfSeconds, 300);
        store.overrideSelector(selectReplaySeries, m5);
        store.overrideSelector(selectCurrentAsset, 'US30');

        const view = emit(descriptor({ symbol: 'US30', timeframe: 'H1' }));

        expect(view.idx).toBe(-1);
        expect(() =>
          assertNoLookahead(view.candles, view.idx, view.forming, 4200, TIMEFRAME_SECONDS['H1'], 300),
        ).not.toThrow();
      });

      it('scenario 4 (C5) — hidden panel via setUpdatesEnabled(false): no emission at all, update-gating still holds after Task 2', () => {
        const m5 = [candle(0), candle(300), candle(600)];
        store.overrideSelector(selectSeries, { M5: m5 });
        store.overrideSelector(selectCurrentTime, 900);
        store.overrideSelector(selectUtcOffset, 0);
        store.overrideSelector(selectReplayTfSeconds, 300);
        store.overrideSelector(selectReplaySeries, m5);
        store.overrideSelector(selectCurrentAsset, 'US30');

        mapper.setUpdatesEnabled(false);
        mapper.configurePanel(descriptor({ symbol: 'US30', timeframe: 'M5' }));
        const emissions: unknown[] = [];
        mapper.chartView$.subscribe((v) => emissions.push(v));

        expect(emissions).toHaveLength(0);
      });

      // Carve-out (plan §3 Task 5; ledger `.superpowers/rfc-019/dev-log.md` §8.3 finding
      // L1; RFC-019 §10 F19-2): foreign-symbol panels and the unconfigured/null-descriptor
      // fallback are DELIBERATELY outside N19-4's scope. Both are asserted below against
      // their DOCUMENTED behavior, never against `assertNoLookahead` — running the checker
      // on a faithful foreign-symbol fixture would trip it (plan §3 Task 2 scenario 5
      // prescribes exactly `forming === null, idx untouched`; RFC §9.2's diagram shows the
      // same), and that gap is F19-2 — a strict subset of the pre-existing, already-deferred
      // defect that a foreign-symbol panel renders the PRIMARY symbol's candles under a
      // foreign label (`market.reducer.ts:8`, mono-symbol D1) — not something Task 2
      // introduced or a regression to fix here. The invariant stays sharp; the carve-out
      // stays in the open, not silently patched into the assertion.

      it('scenario 5 (F19-2 carve-out) — foreign-symbol panel: forming null, idx untouched (documented, NOT run through assertNoLookahead)', () => {
        const h1 = [candle(0), candle(3600), candle(7200)];
        const m5 = [candle(3600), candle(3900), candle(4200)];
        store.overrideSelector(selectSeries, { H1: h1 });
        store.overrideSelector(selectCurrentTime, 4200);
        store.overrideSelector(selectUtcOffset, 0);
        store.overrideSelector(selectReplayTfSeconds, 300);
        store.overrideSelector(selectReplaySeries, m5);
        store.overrideSelector(selectCurrentAsset, 'US30'); // primary asset

        const view = emit(descriptor({ symbol: 'NAS100', timeframe: 'H1' })); // foreign symbol

        expect(view.forming).toBeNull();
        expect(view.idx).toBe(1); // untouched: lastIndexAtOrBefore(h1, 4200), NOT decremented
      });

      it('scenario 6 (legacy-fallback carve-out) — unconfigured mapper (descriptor null): falls back to globalChartView, NOT run through assertNoLookahead', () => {
        let view: unknown;
        mapper.chartView$.subscribe((v) => (view = v));

        // toBe, not toEqual: the `!descriptor` branch returns the exact object the
        // `beforeEach` injected via `overrideSelector(selectChartView, dummyGlobalView)`,
        // so reference identity is the honest (and strictly stronger) passthrough proof.
        expect(view).toBe(dummyGlobalView);
      });
    });
  });
});
