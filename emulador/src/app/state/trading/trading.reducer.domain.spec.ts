import { describe, expect, it } from 'vitest';
import { tradingFeature } from './trading.reducer';
import { TradingActions } from './trading.actions';
import { tradingState } from '../../testing/fixtures';

// ---- RFC-014 Task 4a: SimulationDomain reducer integration ----
//
// Covers ONLY the reducer paths that do NOT collide with a pre-existing,
// STOP-protected spec: `placeOrder`/`openMarket` reject I-14-incoherent
// geometry with REFERENCE identity (no mutation), and valid placements still
// apply end-to-end after the new guard.
//
// `modifyPosition` (I-15 SL non-widening) and `modifyOrder` (I-14 on
// modification) are INTENTIONALLY NOT covered here: both would require
// rejecting scenarios that `trading.reducer.spec.ts` (lines 120-134) already
// pins as ACCEPTED — a genuine pre-existing-spec collision, documented in
// `trading.reducer.ts` at each `on(...)` handler and in task-4a-report.md.
// Per the STOP rule, that spec is authority and was left untouched; the
// corresponding reducer behavior was left byte-identical rather than
// resolved unilaterally.

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
