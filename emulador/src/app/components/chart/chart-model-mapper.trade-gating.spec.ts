import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { ChartModelMapper } from './chart-model-mapper.service';
import { selectTradeChartView, selectCurrentAsset } from '../../state/selectors';
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
 */
describe('ChartModelMapper.tradeChartView$ gating (RFC-018 T-1 / T-2, D18.C)', () => {
  let store: MockStore;

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
  const markers = [
    {
      time: 1,
      position: 'aboveBar' as const,
      shape: 'arrowUp' as const,
      color: 'up' as const,
      text: 't',
    },
  ];
  const boxes = [
    {
      id: 'b1',
      status: 'open' as const,
      side: 'buy' as const,
      entry: 100,
      sl: 95,
      tp: 110,
      from: 0,
      to: null,
      hidden: false,
    },
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideMockStore()] });
    store = TestBed.inject(MockStore);
    store.overrideSelector(selectTradeChartView, { positions, orders, markers, boxes });
  });

  afterEach(() => store.resetSelectors());

  function descriptor(overrides: Partial<PanelDescriptor> = {}): PanelDescriptor {
    return { id: 'p1', symbol: '', timeframe: 'M1', linkGroupId: null, ...overrides };
  }

  /** Seeds `selectCurrentAsset`, refreshes, builds a fresh mapper instance, and — unless
   *  `desc` is omitted — configures it (the R18-1 "never configured" case omits it). */
  function seed(asset: string | null, desc?: PanelDescriptor): ChartModelMapper {
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

  it('symbol sentinel (\'\') + asset US30 — full trade view emitted (the live production path: every panel is born with symbol \'\')', () => {
    const view = latest(seed('US30', descriptor()));
    // `mapPositions`/`mapOrders` drop trading-domain-only fields (riskPct, riskUsd) that
    // the raw fixtures carry, so spot-check identity + length rather than a full `toEqual`
    // against the raw state-shape fixtures — exact remapping fidelity is the pre-existing
    // `tradeChartView$` reference-stability block's job, not this gating spec's.
    expect(view.positions).toHaveLength(1);
    expect((view.positions[0] as { id: string }).id).toBe('p1');
    expect(view.orders).toHaveLength(1);
    expect((view.orders[0] as { id: string }).id).toBe('o1');
    expect(view.markers).toEqual(markers);
    expect(view.boxes).toEqual(boxes);
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
    // field set end to end, so a full toEqual is exact.
    expect(opened.positions).toHaveLength(1);
    expect((opened.positions[0] as { id: string }).id).toBe('p1');
    expect(opened.orders).toHaveLength(1);
    expect((opened.orders[0] as { id: string }).id).toBe('o1');
    expect(opened.markers).toEqual(markers);
    expect(opened.boxes).toEqual(boxes);
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
    // real memo miss (a brand-new `selectTradeChartView` object reference in between).
    const mapper = seed('US30', descriptor({ symbol: 'NAS100' })); // T-1 mismatch => closed
    const first = latest(mapper);

    store.overrideSelector(selectTradeChartView, { positions, orders, markers, boxes });
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

    // Re-emit with a NEW wrapper object but the SAME inner array references (mirrors an
    // unrelated state slice changing elsewhere).
    store.overrideSelector(selectTradeChartView, { positions, orders, markers, boxes });
    store.refreshState();
    const r2 = emissions[emissions.length - 1];

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
