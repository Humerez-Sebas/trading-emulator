import { describe, expect, it } from 'vitest';
import { Candle } from '../../models';
import {
  closeSession,
  computeSessionStats,
  processCandle,
  sliceRange,
  TradingBook,
} from './fill-engine';
import { lotsForRisk, PendingOrder, Position } from './trading.models';

const CONTRACT = 100; // gold: 100 oz per lot

function candle(time: number, open: number, high: number, low: number, close: number): Candle {
  return { time, open, high, low, close };
}

function buyLimit(entry: number, sl: number, tp: number | null, lots = 0.06): PendingOrder {
  return {
    id: 'o1',
    side: 'buy',
    type: 'limit',
    entryPrice: entry,
    sl,
    tp,
    lots,
    riskPct: 1,
    riskUsd: Math.abs(entry - sl) * lots * CONTRACT,
    createdAt: 0,
  };
}

function openBuy(entry: number, sl: number, tp: number | null, lots = 0.06): Position {
  return {
    id: 'p1',
    side: 'buy',
    entryPrice: entry,
    sl,
    tp,
    lots,
    riskPct: 1,
    riskUsd: Math.abs(entry - sl) * lots * CONTRACT,
    openTime: 0,
    origin: 'market',
  };
}

function book(partial: Partial<TradingBook>): TradingBook {
  return { balance: 10000, orders: [], positions: [], history: [], ...partial };
}

describe('lotsForRisk', () => {
  it('sizes 1% of 10k with a $17.72 SL on gold to 0.05-0.06 lots', () => {
    const lots = lotsForRisk(10000, 1, 4000, 4000 - 17.72, CONTRACT);
    expect(lots).toBeGreaterThanOrEqual(0.05);
    expect(lots).toBeLessThanOrEqual(0.06);
  });

  it('returns 0 when the SL distance is zero', () => {
    expect(lotsForRisk(10000, 1, 4000, 4000, CONTRACT)).toBe(0);
  });
});

describe('processCandle — fills', () => {
  it('fills a buy limit when low <= entry', () => {
    const b = book({ orders: [buyLimit(4000, 3990, 4020)] });
    const r = processCandle(b, candle(100, 4005, 4006, 3999, 4003), null, CONTRACT);
    expect(r.changed).toBe(true);
    expect(r.book.orders).toHaveLength(0);
    expect(r.book.positions).toHaveLength(1);
    expect(r.book.positions[0].entryPrice).toBe(4000);
  });

  it('does NOT fill a buy limit when low stays above entry', () => {
    const b = book({ orders: [buyLimit(4000, 3990, 4020)] });
    const r = processCandle(b, candle(100, 4005, 4010, 4001, 4008), null, CONTRACT);
    expect(r.changed).toBe(false);
    expect(r.book.orders).toHaveLength(1);
  });

  it('fills a sell stop when low crosses the entry', () => {
    const order: PendingOrder = { ...buyLimit(3995, 4005, 3970), side: 'sell', type: 'stop' };
    const b = book({ orders: [order] });
    const r = processCandle(b, candle(100, 4000, 4001, 3994, 3996), null, CONTRACT);
    expect(r.book.positions).toHaveLength(1);
    expect(r.book.positions[0].side).toBe('sell');
  });
});

describe('processCandle — exits', () => {
  it('closes by TP when only the TP is inside the candle', () => {
    const b = book({ positions: [openBuy(4000, 3990, 4010)] });
    const r = processCandle(b, candle(100, 4005, 4012, 4002, 4008), null, CONTRACT);
    expect(r.book.positions).toHaveLength(0);
    expect(r.book.history[0].outcome).toBe('tp');
    expect(r.book.history[0].exitPrice).toBe(4010);
    // profit = (4010-4000) * 0.06 * 100 = $60
    expect(r.book.history[0].profit).toBeCloseTo(60);
    expect(r.book.balance).toBeCloseTo(10060);
  });

  it('closes by SL when only the SL is inside the candle', () => {
    const b = book({ positions: [openBuy(4000, 3990, 4010)] });
    const r = processCandle(b, candle(100, 4000, 4003, 3989, 3995), null, CONTRACT);
    expect(r.book.history[0].outcome).toBe('sl');
    expect(r.book.history[0].profit).toBeCloseTo(-60);
  });

  it('SL+TP in the same candle without a lower series → pessimistic SL, ambiguous', () => {
    const b = book({ positions: [openBuy(4000, 3990, 4010)] });
    const r = processCandle(b, candle(100, 4000, 4012, 3989, 4005), null, CONTRACT);
    expect(r.book.history[0].outcome).toBe('sl');
    expect(r.book.history[0].ambiguous).toBe(true);
  });

  it('SL+TP in the same candle WITH a lower series → resolved by touch order', () => {
    const b = book({ positions: [openBuy(4000, 3990, 4010)] });
    // H1 candle hits both; the M-candles show the TP was touched first
    const sub = [
      candle(100, 4000, 4005, 3998, 4004),
      candle(160, 4004, 4011, 4003, 4009), // TP (4010) first
      candle(220, 4009, 4009, 3989, 3992), // SL later
    ];
    const r = processCandle(b, candle(100, 4000, 4012, 3989, 3992), sub, CONTRACT);
    expect(r.book.history[0].outcome).toBe('tp');
    expect(r.book.history[0].ambiguous).toBe(false);
  });

  it('a freshly filled order ignores sub-candles before its fill', () => {
    // sell limit at 4010; the SL (4015) is touched BEFORE the fill — must not count
    const order: PendingOrder = { ...buyLimit(4010, 4015, 3990), side: 'sell', type: 'limit' };
    const b = book({ orders: [order] });
    const sub = [
      candle(100, 4000, 4016, 3999, 4014), // touches SL zone but order not filled yet...
      candle(160, 4014, 4014, 3988, 3990), // fill happens here too
    ];
    // NOTE: sell limit fills when high >= 4010 → first sub candle fills it AND
    // hits the SL in the same sub candle → ambiguous pessimistic SL
    const r = processCandle(b, candle(100, 4000, 4016, 3988, 3990), sub, CONTRACT);
    expect(r.book.history).toHaveLength(1);
    expect(r.book.history[0].outcome).toBe('sl');
  });
});

describe('processCandle — per-entity time guards (V2.3 bug fix)', () => {
  it('does NOT fill an order on candles at or before its placement candle', () => {
    // order placed while the cursor was on candle t=100
    const order = { ...buyLimit(4000, 3990, 4020), createdAt: 100 };
    const b = book({ orders: [order] });
    // revisiting the placement candle (or older ones) must not fill it...
    expect(processCandle(b, candle(100, 4005, 4006, 3999, 4003), null, CONTRACT).changed).toBe(
      false,
    );
    expect(processCandle(b, candle(40, 4005, 4006, 3999, 4003), null, CONTRACT).changed).toBe(
      false,
    );
    // ...but the NEXT candle fills normally
    const r = processCandle(b, candle(160, 4005, 4006, 3999, 4003), null, CONTRACT);
    expect(r.book.positions).toHaveLength(1);
  });

  it('reprocessing the same candle is idempotent (no duplicated fills)', () => {
    const order = { ...buyLimit(4000, 3990, 4020), createdAt: 100 };
    const first = processCandle(
      book({ orders: [order] }),
      candle(160, 4005, 4006, 3999, 4003),
      null,
      CONTRACT,
    );
    expect(first.book.positions).toHaveLength(1);
    // same candle again over the resulting book: nothing changes
    const again = processCandle(first.book, candle(160, 4005, 4006, 3999, 4003), null, CONTRACT);
    expect(again.changed).toBe(false);
    expect(again.book.positions).toHaveLength(1);
    expect(again.book.history).toHaveLength(0);
  });

  it('does not exit a position using candles older than its open time', () => {
    const p = { ...openBuy(4000, 3990, 4010), openTime: 200 };
    const b = book({ positions: [p] });
    // a candle from before the position existed hits the SL range: ignored
    const r = processCandle(b, candle(100, 4000, 4003, 3985, 3995), null, CONTRACT);
    expect(r.changed).toBe(false);
    expect(r.book.positions).toHaveLength(1);
  });
});

describe('closeSession / stats', () => {
  it('closes open positions at the given price as session-end', () => {
    const b = book({ positions: [openBuy(4000, 3990, null)] });
    const r = closeSession(b, 4004, 500, CONTRACT);
    expect(r.positions).toHaveLength(0);
    expect(r.history[0].outcome).toBe('session-end');
    expect(r.history[0].profit).toBeCloseTo(24); // 4 * 0.06 * 100
  });

  it('computes win rate, R, profit factor and drawdown', () => {
    const b = book({ positions: [openBuy(4000, 3990, 4010)] });
    const win = processCandle(b, candle(100, 4005, 4012, 4002, 4008), null, CONTRACT);
    const b2 = { ...win.book, positions: [{ ...openBuy(4000, 3990, 4010), id: 'p2' }] };
    const loss = processCandle(b2, candle(200, 4000, 4003, 3989, 3995), null, CONTRACT);
    const stats = computeSessionStats(loss.book.history, 10000);
    expect(stats.totalTrades).toBe(2);
    expect(stats.won).toBe(1);
    expect(stats.lost).toBe(1);
    expect(stats.winRate).toBeCloseTo(0.5);
    expect(stats.netProfit).toBeCloseTo(0);
    expect(stats.totalR).toBeCloseTo(0); // +1R then -1R
    expect(stats.profitFactor).toBeCloseTo(1);
    expect(stats.maxDrawdown).toBeCloseTo(60);
    expect(stats.equityCurve).toEqual([10000, 10060, 10000]);
  });
});

describe('sliceRange', () => {
  it('returns candles in [from, to)', () => {
    const candles = [candle(0, 1, 1, 1, 1), candle(60, 1, 1, 1, 1), candle(120, 1, 1, 1, 1)];
    expect(sliceRange(candles, 60, 120)).toHaveLength(1);
    expect(sliceRange(candles, 0, 121)).toHaveLength(3);
    expect(sliceRange(candles, 130, 200)).toHaveLength(0);
  });
});
