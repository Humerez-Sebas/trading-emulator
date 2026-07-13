import { describe, expect, it } from 'vitest';
import { tradingFeature } from './trading.reducer';
import { TradingActions } from './trading.actions';
import { order, position, tradingState } from '../../testing/fixtures';

// ---- RFC-014 Task 4a: SimulationDomain reducer integration ----
//
// `placeOrder`/`openMarket` reject I-14-incoherent geometry with REFERENCE
// identity (no mutation); valid placements still apply end-to-end.
//
// `modifyPosition` (I-15 SL non-widening) and `modifyOrder` (I-14 on
// modification) were initially blocked by a genuine collision with
// `trading.reducer.spec.ts` (lines 120-134 as they stood pre-D14.E): the
// STOP rule was escalated rather than resolved unilaterally, and the user
// granted a punctual, ledger-recorded exception (D14.E) to minimally edit
// those two fixtures (intent preserved — see the "Completion wave" section
// of task-4a-report.md). The modification-path coverage below was added in
// that same completion wave.

const reducer = tradingFeature.reducer;

describe('trading reducer: openMarket rejects I-14-incoherent geometry', () => {
  it('sl on the wrong side (above price) for a buy: state unchanged (reference identity)', () => {
    const s = tradingState();
    const next = reducer(
      s,
      TradingActions.openMarket({
        side: 'buy',
        price: 4000,
        sl: 4010, // wrong side: must be < price for a buy
        tp: 4020,
        riskPct: 1,
        time: 3600,
        contractSize: 100,
      }),
    );
    expect(next).toBe(s);
    expect(next.positions).toHaveLength(0);
  });

  it('tp on the wrong side (below price) for a buy: state unchanged (reference identity)', () => {
    const s = tradingState();
    const next = reducer(
      s,
      TradingActions.openMarket({
        side: 'buy',
        price: 4000,
        sl: 3990, // valid
        tp: 3995, // wrong side: must be > price (or null) for a buy
        riskPct: 1,
        time: 3600,
        contractSize: 100,
      }),
    );
    expect(next).toBe(s);
    expect(next.positions).toHaveLength(0);
  });

  it('sl on the wrong side (below price) for a sell: state unchanged (reference identity)', () => {
    const s = tradingState();
    const next = reducer(
      s,
      TradingActions.openMarket({
        side: 'sell',
        price: 4000,
        sl: 3990, // wrong side: must be > price for a sell
        tp: 3980,
        riskPct: 1,
        time: 3600,
        contractSize: 100,
      }),
    );
    expect(next).toBe(s);
    expect(next.positions).toHaveLength(0);
  });

  it('valid geometry still opens a position (sanity path)', () => {
    const s = tradingState();
    const next = reducer(
      s,
      TradingActions.openMarket({
        side: 'buy',
        price: 4000,
        sl: 3990,
        tp: 4020,
        riskPct: 1,
        time: 3600,
        contractSize: 100,
      }),
    );
    expect(next).not.toBe(s);
    expect(next.positions).toHaveLength(1);
  });
});

describe('trading reducer: placeOrder rejects I-14-incoherent geometry', () => {
  it('sl on the wrong side (above entry) for a buy: state unchanged (reference identity)', () => {
    const s = tradingState();
    const next = reducer(
      s,
      TradingActions.placeOrder({
        side: 'buy',
        orderType: 'limit',
        entryPrice: 4000,
        sl: 4010, // wrong side: must be < entryPrice for a buy
        tp: 4020,
        riskPct: 1,
        time: 0,
        contractSize: 100,
      }),
    );
    expect(next).toBe(s);
    expect(next.orders).toHaveLength(0);
  });

  it('tp on the wrong side (above entry) for a sell: state unchanged (reference identity)', () => {
    const s = tradingState();
    const next = reducer(
      s,
      TradingActions.placeOrder({
        side: 'sell',
        orderType: 'stop',
        entryPrice: 3950,
        sl: 3960, // valid
        tp: 3960.5, // wrong side: must be < entryPrice (or null) for a sell
        riskPct: 1,
        time: 0,
        contractSize: 100,
      }),
    );
    expect(next).toBe(s);
    expect(next.orders).toHaveLength(0);
  });

  it('valid geometry still places an order (sanity path)', () => {
    const s = tradingState();
    const next = reducer(
      s,
      TradingActions.placeOrder({
        side: 'buy',
        orderType: 'limit',
        entryPrice: 3980,
        sl: 3970,
        tp: 4000,
        riskPct: 1,
        time: 0,
        contractSize: 100,
      }),
    );
    expect(next).not.toBe(s);
    expect(next.orders).toHaveLength(1);
  });

  it('valid geometry with tp = null still places an order (sanity path)', () => {
    const s = tradingState();
    const next = reducer(
      s,
      TradingActions.placeOrder({
        side: 'sell',
        orderType: 'stop',
        entryPrice: 3950,
        sl: 3960,
        tp: null,
        riskPct: 1,
        time: 0,
        contractSize: 100,
      }),
    );
    expect(next).not.toBe(s);
    expect(next.orders).toHaveLength(1);
    expect(next.orders[0].tp).toBeNull();
  });
});

// ---- D14.E completion wave: modification-path coverage ----

describe('trading reducer: modifyPosition rejects I-15 widening', () => {
  it('long: widen (sl decreases, further from entry) is rejected — sl unchanged', () => {
    const s = tradingState({ positions: [position({ side: 'buy', entryPrice: 4000, sl: 3990 })] });
    const next = reducer(s, TradingActions.modifyPosition({ id: 'p1', sl: 3950 }));
    expect(next.positions[0].sl).toBe(3990);
  });

  it('short: widen (sl increases, further from entry) is rejected — sl unchanged', () => {
    const s = tradingState({ positions: [position({ side: 'sell', entryPrice: 4000, sl: 4010 })] });
    const next = reducer(s, TradingActions.modifyPosition({ id: 'p1', sl: 4020 }));
    expect(next.positions[0].sl).toBe(4010);
  });

  it('long: tighten (sl increases, toward entry) is accepted', () => {
    const s = tradingState({ positions: [position({ side: 'buy', entryPrice: 4000, sl: 3990 })] });
    const next = reducer(s, TradingActions.modifyPosition({ id: 'p1', sl: 3995 }));
    expect(next.positions[0].sl).toBe(3995);
  });

  it('short: tighten (sl decreases, toward entry) is accepted', () => {
    const s = tradingState({ positions: [position({ side: 'sell', entryPrice: 4000, sl: 4010 })] });
    const next = reducer(s, TradingActions.modifyPosition({ id: 'p1', sl: 4005 }));
    expect(next.positions[0].sl).toBe(4005);
  });

  it('mixed SL-widen + TP-change: applies the TP, rejects the SL (apply-the-valid-part)', () => {
    const s = tradingState({
      positions: [position({ side: 'buy', entryPrice: 4000, sl: 3990, tp: 4020 })],
    });
    const next = reducer(s, TradingActions.modifyPosition({ id: 'p1', sl: 3950, tp: 4050 }));
    expect(next.positions[0].sl).toBe(3990); // widen rejected
    expect(next.positions[0].tp).toBe(4050); // TP change applies unconditionally
  });
});

describe('trading reducer: modifyOrder rejects I-14-incoherent geometry on modification', () => {
  it('sl moved to the wrong side (above entry) for a buy: order unchanged (reference identity)', () => {
    const s = tradingState({ orders: [order({ side: 'buy', entryPrice: 4000, sl: 3990, tp: 4020 })] });
    const next = reducer(s, TradingActions.modifyOrder({ id: 'o1', sl: 4005, contractSize: 100 }));
    expect(next.orders[0]).toBe(s.orders[0]);
    expect(next.orders[0].sl).toBe(3990);
    expect(next.orders[0].lots).toBe(0.1);
    expect(next.orders[0].riskUsd).toBe(100);
  });

  it('valid entry+sl re-placement is accepted and re-sizes lots (pending, no I-15 constraint)', () => {
    const s = tradingState({ orders: [order({ side: 'buy', entryPrice: 4000, sl: 3990, tp: 4020 })] });
    const next = reducer(
      s,
      TradingActions.modifyOrder({ id: 'o1', entryPrice: 4010, sl: 3995, contractSize: 100 }),
    );
    expect(next.orders[0]).not.toBe(s.orders[0]);
    expect(next.orders[0].entryPrice).toBe(4010);
    expect(next.orders[0].sl).toBe(3995);
    expect(next.orders[0].lots).toBeGreaterThan(0);
  });
});
