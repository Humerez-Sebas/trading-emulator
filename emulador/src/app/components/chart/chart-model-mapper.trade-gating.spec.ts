import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { ChartModelMapper } from './chart-model-mapper.service';
import {
  selectSeries,
  selectTradeMarkers,
  selectTradeBoxes,
  selectTradeBoxesVisible,
  selectCurrentAsset,
} from '../../state/selectors';
import { tradingFeature } from '../../state/trading/trading.reducer';
import { PanelDescriptor } from '../../state/layout/layout.models';

/**
 * RFC-018 Task 3 (D18.C) — gates `tradeChartView$` inside the mapper instance with
 * `panelRendersTrades` (Task 2, `state/layout/layout.models.ts`).
 *
 * T-1 (the symbol clause) is a correctness invariant, NOT user-togglable: painting one
 * instrument's trade levels on another's price axis is a false statement about the
 * market. T-2 (`hideTrades`) is a panel-local preference layered on top. This spec is
 * the render-side proof that the mapper actually consults both — until now
 * `tradeChartView$` had no panel awareness at all.
 *
 * RFC-018 Task 5 (F3, R18-13b — declared spec touch): `tradeChartView$` no longer
 * consumes `selectTradeChartView` (which snapped markers against the GLOBAL active
 * candles). It now derives markers/boxes from THIS panel's own candles
 * (`selectSeries` + the panel's timeframe) plus the raw trading slices
 * (`tradingFeature.selectPositions/selectOrders/selectHistory`) and
 * `selectTradeBoxesVisible`. Every override below was rewired to match; no assertion
 * was weakened, deleted, or skipped — all seven of Task 3's gating guarantees (T-1,
 * T-2, the flip, the shared frozen empty-view reference, gate-open reference
 * stability, the unconfigured-mapper contract) are still asserted, byte-for-byte
 * equivalent in rigor to before.
 */
describe('ChartModelMapper.tradeChartView$ gating (RFC-018 T-1 / T-2, D18.C)', () => {
  let store: MockStore;

  // A single M1 candle at t=0 — every position/order below opens at t=0, so it snaps
  // exactly onto this candle regardless of the snapping arithmetic under test elsewhere
  // (chart-model-mapper.trade-geometry.spec.ts owns the snapping-precision cases).
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

  // The gate-open expectation for markers/boxes is computed via the SAME kept-alive
  // (R18-14) selectors' `.projector` the mapper itself now calls — this spec's job is
  // proving the GATE (which data flows, and when), not re-proving the snapping
  // arithmetic (owned by selectors.spec.ts and the new geometry spec).
  const expectedMarkers = selectTradeMarkers.projector(candles, positions, history);
  const expectedBoxes = selectTradeBoxes.projector(positions, orders, history);

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideMockStore()] });
    store = TestBed.inject(MockStore);
  });

  afterEach(() => store.resetSelectors());

  function descriptor(overrides: Partial<PanelDescriptor> = {}): PanelDescriptor {
    return { id: 'p1', symbol: '', timeframe: 'M1', linkGroupId: null, ...overrides };
  }

  /** Seeds every raw slice the rewired `tradeChartView$` reads, refreshes, builds a
   *  fresh mapper instance, and — unless `desc` is omitted — configures it (the R18-1
   *  "never configured" case omits it). */
  function seed(asset: string | null, desc?: PanelDescriptor): ChartModelMapper {
    store.overrideSelector(selectSeries, { M1: candles });
    store.overrideSelector(tradingFeature.selectPositions, positions);
    store.overrideSelector(tradingFeature.selectOrders, orders);
    store.overrideSelector(tradingFeature.selectHistory, history);
    store.overrideSelector(selectTradeBoxesVisible, true);
    store.overrideSelector(selectCurrentAsset, asset);
    store.refreshState();
    const mapper = TestBed.runInInjectionContext(() => new ChartModelMapper());
    if (desc) mapper.configurePanel(desc);
    return mapper;
  }

  function latest(mapper: ChartModelMapper) {
    let view: {
      positions: unknown[];
      orders: unknown[];
      markers: unknown[];
      boxes: unknown[];
    } | undefined;
    mapper.tradeChartView$.subscribe((v) => (view = v));
    return view!;
  }

  it("symbol sentinel ('') + asset US30 — full trade view emitted (the live production path: every panel is born with symbol '')", () => {
    const view = latest(seed('US30', descriptor()));
    // `mapPositions`/`mapOrders` drop trading-domain-only fields (riskPct, riskUsd) that
    // the raw fixtures carry, so spot-check identity + length rather than a full `toEqual`
    // against the raw state-shape fixtures — exact remapping fidelity is the pre-existing
    // `tradeChartView$` reference-stability block's job, not this gating spec's.
    expect(view.positions).toHaveLength(1);
    expect((view.positions[0] as { id: string }).id).toBe('p1');
    expect(view.orders).toHaveLength(1);
    expect((view.orders[0] as { id: string }).id).toBe('o1');
    expect(view.markers).toEqual(expectedMarkers);
    expect(view.boxes).toEqual(expectedBoxes);
  });

  it('T-1: panel symbol NAS100 vs asset US30 — empty view, not overridable', () => {
    const view = latest(seed('US30', descriptor({ symbol: 'NAS100' })));
    expect(view.positions).toEqual([]);
    expect(view.orders).toEqual([]);
    expect(view.markers).toEqual([]);
    expect(view.boxes).toEqual([]);
  });

  it('T-2: matching symbol US30 but hideTrades:true — empty view', () => {
    const view = latest(seed('US30', descriptor({ symbol: 'US30', hideTrades: true })));
    expect(view.positions).toEqual([]);
    expect(view.orders).toEqual([]);
    expect(view.markers).toEqual([]);
    expect(view.boxes).toEqual([]);
  });

  it('flipping hideTrades true -> false restores the layer with NO change to trading data', () => {
    const mapper = seed('US30', descriptor({ symbol: 'US30', hideTrades: true }));
    const emissions: {
      positions: unknown[];
      orders: unknown[];
      markers: unknown[];
      boxes: unknown[];
    }[] = [];
    mapper.tradeChartView$.subscribe((v) => emissions.push(v));
    expect(emissions[emissions.length - 1].positions).toEqual([]);

    mapper.configurePanel(descriptor({ symbol: 'US30', hideTrades: false }));

    const opened = emissions[emissions.length - 1];
    // Spot-check identity/length for positions/orders (mapPositions/mapOrders drop
    // trading-domain-only fields like riskPct/riskUsd, so a full toEqual against the raw
    // state-shape fixture would fail on shape, not content); markers/boxes carry the same
    // field set end to end, so a full toEqual against the computed expectation is exact.
    expect(opened.positions).toHaveLength(1);
    expect((opened.positions[0] as { id: string }).id).toBe('p1');
    expect(opened.orders).toHaveLength(1);
    expect((opened.orders[0] as { id: string }).id).toBe('o1');
    expect(opened.markers).toEqual(expectedMarkers);
    expect(opened.boxes).toEqual(expectedBoxes);
  });

  it('global eye off (boxesVisible:false), gate OPEN — boxes emptied while markers/positions/orders keep flowing (RFC-018 F3 relocation of the global eye-off rule, chart-model-mapper.service.ts:600-602)', () => {
    // Gate stays OPEN (matching symbol, hideTrades false) — only the global `boxesVisible`
    // flag (the toolbar eye) flips false AFTER the mapper is already live. This is what
    // distinguishes "the eye blanked the boxes" from "the T-1/T-2 gate closed everything":
    // if the ternary at chart-model-mapper.service.ts:600-602 were ever dropped or inverted,
    // `view.boxes` would stop being empty here while every other assertion in this file
    // stayed green (nothing else exercises `boxesVisible:false` with the gate open).
    const mapper = seed('US30', descriptor({ symbol: 'US30' }));

    store.overrideSelector(selectTradeBoxesVisible, false);
    store.refreshState();
    const view = latest(mapper);

    expect(view.boxes).toEqual([]);
    expect(view.positions).toHaveLength(1);
    expect((view.positions[0] as { id: string }).id).toBe('p1');
    expect(view.orders).toHaveLength(1);
    expect((view.orders[0] as { id: string }).id).toBe('o1');
    expect(view.markers).toEqual(expectedMarkers);
  });

  it('R18-3: two consecutive gate-closed reads return the SAME empty-view reference', () => {
    // Two INDEPENDENT subscriptions, not two emissions on one subscription: `gated()` ends
    // in `distinctUntilChanged()`, so a single live subscription would never see a "second"
    // closed emission in the first place — the identical shared reference makes the second
    // one indistinguishable from the first and RxJS correctly filters it. That is itself
    // evidence for R18-3, not a workaround for it. Each `latest()` call below is a fresh
    // subscription, so its internal `distinctUntilChanged` starts empty and delivers
    // whatever the gate computes right now — proving the closed branch resolves to the
    // exact same object across two genuinely separate computations, one of which follows a
    // real memo miss (a brand-new `history` array reference in between — RFC-018 F3
    // rewiring: the original trigger re-overrode `selectTradeChartView`'s wrapper; this is
    // the equivalent "an unrelated-to-the-gate slice changed" trigger for the new inputs).
    const mapper = seed('US30', descriptor({ symbol: 'NAS100' })); // T-1 mismatch => closed
    const first = latest(mapper);

    store.overrideSelector(tradingFeature.selectHistory, []);
    store.refreshState();
    const second = latest(mapper);

    expect(second).toBe(first);
  });

  it('gate open, unchanged upstream references: all four arrays stay reference-stable (regression guard on the existing memo)', () => {
    const mapper = seed('US30', descriptor({ symbol: 'US30' }));
    const emissions: {
      positions: unknown[];
      orders: unknown[];
      markers: unknown[];
      boxes: unknown[];
    }[] = [];
    mapper.tradeChartView$.subscribe((v) => emissions.push(v));
    const r1 = emissions[emissions.length - 1];

    // RFC-018 F3 rewiring (R18-13b): the ORIGINAL trigger re-overrode `selectTradeChartView`
    // with a NEW wrapper but the SAME inner array references — no longer constructible,
    // because markers/boxes are now genuinely DERIVED from positions/orders/history/candles
    // rather than independently injectable mock fields. The faithful analog: reconfigure
    // with a descriptor that is a NEW object reference but identical in every field the
    // gate/geometry read (a panel rename or unrelated layout field rebuilding the
    // descriptor elsewhere — exactly the scenario `resolveMarkers`/`resolveBoxes` exist to
    // guard against). The outer wrapper IS rebuilt (a real memo miss on `descriptor`), but
    // all four arrays must still come out reference-IDENTICAL to r1.
    mapper.configurePanel(descriptor({ symbol: 'US30' })); // fresh object, identical fields
    const r2 = emissions[emissions.length - 1];

    expect(r2).not.toBe(r1); // the wrapper itself WAS rebuilt — this is a real recompute, not a no-op
    expect(r2.positions).toBe(r1.positions);
    expect(r2.orders).toBe(r1.orders);
    expect(r2.markers).toBe(r1.markers);
    expect(r2.boxes).toBe(r1.boxes);
  });

  it('R18-1: mapper never configured — no trade layer', () => {
    const view = latest(seed('US30')); // no configurePanel call
    expect(view.positions).toEqual([]);
    expect(view.orders).toEqual([]);
    expect(view.markers).toEqual([]);
    expect(view.boxes).toEqual([]);
  });
});
