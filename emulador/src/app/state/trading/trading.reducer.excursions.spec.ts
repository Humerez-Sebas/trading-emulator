import { describe, expect, it } from 'vitest';
import { tradingFeature } from './trading.reducer';
import { TradingActions } from './trading.actions';
import { candle, position, tradingState } from '../../testing/fixtures';

// ---- RFC-014 Task 3 (reducer gap): mark-to-market excursions must survive
// the REAL store, not just the pure engine ----
//
// The engine (`fill-engine.ts`) always returns a freshly built `book` with
// excursion accumulation folded into `stillOpen` positions, but keeps
// `ProcessResult.changed` scoped to fills/exits only (STOP-protected by
// `fill-engine.sided.spec.ts`, which asserts `changed:false` on quiet
// candles). The reducer's `processCandle` handler used to short-circuit on
// `!result.changed` and drop `result.book` entirely — discarding the
// engine's updated positions (and their mae/mfe accumulators) on every
// candle where nothing fills or exits, i.e. almost all candles in a real
// replay. This file folds a scripted sequence of `TradingActions.processCandle`
// through the REAL reducer (not the pure engine directly, unlike
// `fill-engine.excursions.spec.ts`) to prove the accumulators now survive,
// while the idle path (no open positions) keeps its exact pre-existing
// cheapness (no new array reference).

const reducer = tradingFeature.reducer;
const CONTRACT = 100;

describe('trading reducer: processCandle adopts excursion accumulation on the !changed path', () => {
  it('mae/mfe/tMae/tMfe accumulate across several quiet candles, then seal correctly on the SL exit', () => {
    // long, entryPrice=100, sl=90, tp=null (TP never triggers in this walk)
    const pos = position({ id: 'p1', side: 'buy', entryPrice: 100, sl: 90, tp: null, openTime: 0 });
    const s0 = tradingState({ positions: [pos] });

    // candle 1 (t=60): adverse=max(0,100-97)=3, favorable=max(0,105-100)=5
    // → mae=3@60, mfe=5@60. No fill/exit → changed:false, excursionsMoved:true.
    const c1 = candle(60, 100, 105, 97, 100);
    const s1 = reducer(
      s0,
      TradingActions.processCandle({ candle: c1, subCandles: null, contractSize: CONTRACT }),
    );
    expect(s1.positions).toHaveLength(1);
    expect(s1.positions[0].mae).toBeCloseTo(3);
    expect(s1.positions[0].tMae).toBe(60);
    expect(s1.positions[0].mfe).toBeCloseTo(5);
    expect(s1.positions[0].tMfe).toBe(60);
    // the accumulation produced a genuinely new positions array (not the
    // pre-fix silent drop) — distinct from s0's
    expect(s1.positions).not.toBe(s0.positions);
    expect(s1.lastProcessedTime).toBe(60);

    // candle 2 (t=120): adverse=max(0,100-95)=5 (>3, new max)@120;
    // favorable=max(0,103-100)=3 (no move, mfe stays 5@60)
    const c2 = candle(120, 100, 103, 95, 100);
    const s2 = reducer(
      s1,
      TradingActions.processCandle({ candle: c2, subCandles: null, contractSize: CONTRACT }),
    );
    expect(s2.positions[0].mae).toBeCloseTo(5);
    expect(s2.positions[0].tMae).toBe(120);
    expect(s2.positions[0].mfe).toBeCloseTo(5);
    expect(s2.positions[0].tMfe).toBe(60);

    // candle 3 (t=180): adverse=max(0,100-99)=1 (no move, mae stays 5@120);
    // favorable=max(0,108-100)=8 (>5, new max)@180
    const c3 = candle(180, 100, 108, 99, 100);
    const s3 = reducer(
      s2,
      TradingActions.processCandle({ candle: c3, subCandles: null, contractSize: CONTRACT }),
    );
    expect(s3.positions[0].mae).toBeCloseTo(5);
    expect(s3.positions[0].tMae).toBe(120);
    expect(s3.positions[0].mfe).toBeCloseTo(8);
    expect(s3.positions[0].tMfe).toBe(180);

    // candle 4 (t=240): low=89 <= sl(90) → SL exit HERE. This candle's own
    // extremes fold in before the exit check (fill-engine.ts, same-loop):
    // adverse=max(0,100-89)=11 (>5, new max)@240; favorable=max(0,106-100)=6
    // (no move, mfe stays 8@180). changed:true this time → full book adopted.
    const c4 = candle(240, 100, 106, 89, 100);
    const s4 = reducer(
      s3,
      TradingActions.processCandle({ candle: c4, subCandles: null, contractSize: CONTRACT }),
    );
    expect(s4.positions).toHaveLength(0);
    expect(s4.history).toHaveLength(1);
    const trade = s4.history[0];
    expect(trade.outcome).toBe('sl');
    // sealed trade reflects the WHOLE walk, not just the exit candle
    expect(trade.mae).toBeCloseTo(11);
    expect(trade.tMae).toBe(240);
    expect(trade.mfe).toBeCloseTo(8);
    expect(trade.tMfe).toBe(180);
    expect(s4.lastProcessedTime).toBe(240);
  });

  it('idle path with NO open positions keeps `positions` reference identity (pre-existing cheapness intact)', () => {
    const s0 = tradingState();
    expect(s0.positions).toHaveLength(0);
    const c = candle(60, 100, 101, 99, 100);
    const next = reducer(
      s0,
      TradingActions.processCandle({ candle: c, subCandles: null, contractSize: CONTRACT }),
    );
    expect(next.positions).toBe(s0.positions); // same array reference, no churn
    expect(next.lastProcessedTime).toBe(60);
  });
});
