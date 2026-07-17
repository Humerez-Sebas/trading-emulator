import { describe, expect, it } from 'vitest';
import { Candle } from '../../models';
import { closeSession, closeTrade, processCandle, TradingBook } from './fill-engine';
import { PendingOrder, Position } from './trading.models';
import { ExecutionCosts, ZERO_COSTS } from './execution-costs';

// ---- RFC-014 Task 2: sided Bid/Ask fill/exit predicates + cost decomposition ----
// `fill-engine.spec.ts` (Task 1's suite, pre-existing, STOP rule) is the V-1
// anchor: it runs unmodified with no costs argument and must keep passing
// bit-for-bit. This file adds the sided predicates on top, behind the
// optional trailing `costs?: ExecutionCosts` argument (D14.C).

const CONTRACT = 1; // index-style: 1 price unit == $1/lot, keeps arithmetic simple

// pointSize: 1 so spreadPoints/slippagePoints read directly as price units.
const COSTS: ExecutionCosts = {
  spreadPoints: 10,
  commissionPerLot: 5,
  slippagePoints: 4,
  pointSize: 1,
};

function candle(time: number, open: number, high: number, low: number, close: number): Candle {
  return { time, open, high, low, close };
}

function book(partial: Partial<TradingBook>): TradingBook {
  return { balance: 10000, orders: [], positions: [], history: [], ...partial };
}

function order(partial: Partial<PendingOrder>): PendingOrder {
  return {
    id: 'o1',
    side: 'buy',
    type: 'limit',
    entryPrice: 4000,
    sl: 3000, // far away so a same-candle exit never interferes with fill tests
    tp: 5000,
    lots: 0.1,
    riskPct: 1,
    riskUsd: 100,
    createdAt: 0,
    ...partial,
  };
}

function position(partial: Partial<Position>): Position {
  return {
    id: 'p1',
    side: 'buy',
    entryPrice: 4000,
    sl: 3900,
    tp: 4100,
    lots: 0.1,
    riskPct: 1,
    riskUsd: 100,
    openTime: 0,
    origin: 'market',
    ...partial,
  };
}

// ============ Predicate table (RFC-014 §2, verbatim) ============

describe('sided fill predicates — Buy Limit: c.low + s <= E', () => {
  it('fills exactly at the boundary (low + s === E)', () => {
    const o = order({ side: 'buy', type: 'limit', entryPrice: 4000 });
    const r = processCandle(
      book({ orders: [o] }),
      candle(100, 4000, 4001, 3990, 3995),
      null,
      CONTRACT,
      COSTS,
    );
    expect(r.book.positions).toHaveLength(1);
    // recorded entry stays the level E — the spread is paid implicitly via the trigger
    expect(r.book.positions[0].entryPrice).toBe(4000);
  });

  it('does NOT fill when low + s > E, even though the raw (unsided) predicate would', () => {
    const o = order({ side: 'buy', type: 'limit', entryPrice: 4000 });
    const c = candle(100, 4000, 4001, 3991, 3995); // 3991 <= 4000 (unsided fill) but 3991+10=4001 > 4000
    const withCosts = processCandle(book({ orders: [o] }), c, null, CONTRACT, COSTS);
    const withoutCosts = processCandle(book({ orders: [o] }), c, null, CONTRACT);
    expect(withCosts.changed).toBe(false);
    expect(withoutCosts.book.positions).toHaveLength(1); // proves the sided predicate is what changed the outcome
  });
});

describe('sided fill predicates — Buy Stop: c.high + s >= E', () => {
  it('fills exactly at the boundary (high + s === E)', () => {
    const o = order({ side: 'buy', type: 'stop', entryPrice: 3995 });
    const r = processCandle(
      book({ orders: [o] }),
      candle(100, 3980, 3985, 3979, 3982),
      null,
      CONTRACT,
      COSTS,
    );
    expect(r.book.positions).toHaveLength(1);
  });

  it('fills earlier than the unsided predicate would (Ask crosses the stop before Bid does)', () => {
    const o = order({ side: 'buy', type: 'stop', entryPrice: 3995 });
    const c = candle(100, 3980, 3987, 3979, 3982); // high=3987: unsided 3987>=3995 false; sided 3987+10>=3995 true
    const withCosts = processCandle(book({ orders: [o] }), c, null, CONTRACT, COSTS);
    const withoutCosts = processCandle(book({ orders: [o] }), c, null, CONTRACT);
    expect(withCosts.book.positions).toHaveLength(1);
    expect(withoutCosts.changed).toBe(false);
  });
});

describe('sided fill predicates — Sell Limit: c.high >= E (Bid, spread-invariant)', () => {
  it('fills exactly at the boundary, identically with or without costs', () => {
    const o = order({ side: 'sell', type: 'limit', entryPrice: 4000, sl: 4100, tp: 3000 });
    const c = candle(100, 3990, 4000, 3985, 3995);
    const withCosts = processCandle(book({ orders: [o] }), c, null, CONTRACT, COSTS);
    const withoutCosts = processCandle(book({ orders: [o] }), c, null, CONTRACT);
    expect(withCosts.book.positions).toHaveLength(1);
    expect(withoutCosts.book.positions).toHaveLength(1);
  });

  it('does not fill when high stays below E', () => {
    const o = order({ side: 'sell', type: 'limit', entryPrice: 4000, sl: 4100, tp: 3000 });
    const r = processCandle(
      book({ orders: [o] }),
      candle(100, 3990, 3999, 3985, 3995),
      null,
      CONTRACT,
      COSTS,
    );
    expect(r.changed).toBe(false);
  });
});

describe('sided fill predicates — Sell Stop: c.low <= E (Bid, spread-invariant)', () => {
  it('fills exactly at the boundary, identically with or without costs', () => {
    const o = order({ side: 'sell', type: 'stop', entryPrice: 4000, sl: 4100, tp: 3000 });
    const c = candle(100, 4005, 4006, 4000, 4002);
    const withCosts = processCandle(book({ orders: [o] }), c, null, CONTRACT, COSTS);
    const withoutCosts = processCandle(book({ orders: [o] }), c, null, CONTRACT);
    expect(withCosts.book.positions).toHaveLength(1);
    expect(withoutCosts.book.positions).toHaveLength(1);
  });
});

describe('sided exit predicates — Long SL: c.low <= SL (Bid, spread-invariant)', () => {
  it('exits exactly at the boundary, identically with or without costs (price shifts only by slippage)', () => {
    const p = position({ side: 'buy', entryPrice: 4000, sl: 3900, tp: 4200 });
    const c = candle(100, 3950, 3960, 3900, 3940);
    const withCosts = processCandle(book({ positions: [p] }), c, null, CONTRACT, COSTS);
    const withoutCosts = processCandle(book({ positions: [p] }), c, null, CONTRACT);
    expect(withCosts.book.history[0].outcome).toBe('sl');
    expect(withoutCosts.book.history[0].outcome).toBe('sl');
  });
});

describe('sided exit predicates — Long TP: c.high >= TP (Bid, spread-invariant)', () => {
  it('exits exactly at the boundary, clean (no slippage on TP)', () => {
    const p = position({ side: 'buy', entryPrice: 4000, sl: 3900, tp: 4200 });
    const c = candle(100, 4150, 4200, 4140, 4160);
    const r = processCandle(book({ positions: [p] }), c, null, CONTRACT, COSTS);
    expect(r.book.history[0].outcome).toBe('tp');
    expect(r.book.history[0].exitPrice).toBe(4200); // exact level, no cost adjustment
  });
});

describe('sided exit predicates — Short SL (stop cover): c.high + s >= SL (Ask)', () => {
  it('exits exactly at the boundary (high + s === SL)', () => {
    const p = position({ side: 'sell', entryPrice: 4000, sl: 4100, tp: 3800 });
    const c = candle(100, 4050, 4090, 4040, 4060); // high+10 = 4100 = SL
    const r = processCandle(book({ positions: [p] }), c, null, CONTRACT, COSTS);
    expect(r.book.history[0].outcome).toBe('sl');
  });

  it('exits earlier than the raw (unsided) predicate would (Ask crosses SL before Bid does)', () => {
    // SL=4095: unsided predicate (c.high>=SL) needs high>=4095; sided needs high+10>=4095 i.e. high>=4085.
    const p = position({ side: 'sell', entryPrice: 4000, sl: 4095, tp: 3800 });
    const c = candle(100, 4050, 4088, 4040, 4060); // high=4088: sided 4088+10=4098>=4095 → hits; unsided 4088>=4095 → does not
    const withCosts = processCandle(book({ positions: [p] }), c, null, CONTRACT, COSTS);
    const withoutCosts = processCandle(book({ positions: [p] }), c, null, CONTRACT);
    expect(withCosts.book.history[0].outcome).toBe('sl');
    expect(withoutCosts.changed).toBe(false); // proves the Ask-derived candle, not the raw Bid high, drives the short SL
  });
});

describe('sided exit predicates — Short TP (stop cover): c.low + s <= TP (Ask)', () => {
  it('exits exactly at the boundary (low + s === TP), clean price (no slippage on TP)', () => {
    const p = position({ side: 'sell', entryPrice: 4000, sl: 4100, tp: 3800 });
    const c = candle(100, 3850, 3860, 3790, 3820); // low+10 = 3800 = TP
    const r = processCandle(book({ positions: [p] }), c, null, CONTRACT, COSTS);
    expect(r.book.history[0].outcome).toBe('tp');
    expect(r.book.history[0].exitPrice).toBe(3800); // exact level
  });
});

// ============ Slippage: stop-type executions only, always adverse ============

describe('slippage — applied ONLY to stop-type executions, always against the trader', () => {
  it('a buy stop fill executes worse (higher) than its level by slippagePoints·pointSize', () => {
    const o = order({ side: 'buy', type: 'stop', entryPrice: 4000 });
    const r = processCandle(
      book({ orders: [o] }),
      candle(100, 4000, 4010, 3999, 4005),
      null,
      CONTRACT,
      COSTS,
    );
    expect(r.book.positions[0].entryPrice).toBe(4004); // 4000 + slippagePoints(4)*pointSize(1)
  });

  it('a sell stop fill executes worse (lower) than its level by slippagePoints·pointSize', () => {
    const o = order({ side: 'sell', type: 'stop', entryPrice: 4000, sl: 4100, tp: 3000 });
    const r = processCandle(
      book({ orders: [o] }),
      candle(100, 4000, 4001, 3990, 3995),
      null,
      CONTRACT,
      COSTS,
    );
    expect(r.book.positions[0].entryPrice).toBe(3996); // 4000 - 4
  });

  it('a limit fill is CLEAN — no slippage regardless of costs', () => {
    const o = order({ side: 'buy', type: 'limit', entryPrice: 4000 });
    const r = processCandle(
      book({ orders: [o] }),
      candle(100, 4000, 4001, 3985, 3995),
      null,
      CONTRACT,
      COSTS,
    );
    expect(r.book.positions[0].entryPrice).toBe(4000);
  });

  it('a long SL exit executes worse (lower) than SL by slippagePoints·pointSize', () => {
    const p = position({ side: 'buy', entryPrice: 4000, sl: 3900, tp: 4200 });
    const r = processCandle(
      book({ positions: [p] }),
      candle(100, 3950, 3960, 3890, 3940),
      null,
      CONTRACT,
      COSTS,
    );
    expect(r.book.history[0].exitPrice).toBe(3896); // 3900 - 4
  });

  it('a short SL exit executes worse (higher) than SL by slippagePoints·pointSize', () => {
    const p = position({ side: 'sell', entryPrice: 4000, sl: 4100, tp: 3800 });
    const r = processCandle(
      book({ positions: [p] }),
      candle(100, 4050, 4095, 4040, 4060), // high+10=4105 >= SL(4100)
      null,
      CONTRACT,
      COSTS,
    );
    expect(r.book.history[0].exitPrice).toBe(4104); // 4100 + 4
  });

  it('a TP exit (long or short) is CLEAN — no slippage', () => {
    const long = position({ id: 'p1', side: 'buy', entryPrice: 4000, sl: 3900, tp: 4200 });
    const rLong = processCandle(
      book({ positions: [long] }),
      candle(100, 4150, 4210, 4140, 4160),
      null,
      CONTRACT,
      COSTS,
    );
    expect(rLong.book.history[0].exitPrice).toBe(4200);

    const short = position({ id: 'p2', side: 'sell', entryPrice: 4000, sl: 4100, tp: 3800 });
    const rShort = processCandle(
      book({ positions: [short] }),
      candle(100, 3850, 3860, 3790, 3820),
      null,
      CONTRACT,
      COSTS,
    );
    expect(rShort.book.history[0].exitPrice).toBe(3800);
  });
});

// ============ Manual / session-end closes: Bid→Ask conversion, no slippage ============

describe('closeTrade — manual/session-end receive a Bid price; shorts cover at Ask', () => {
  it('a long closes at the given Bid price unchanged', () => {
    const p = position({ side: 'buy', entryPrice: 4000, sl: 3900, tp: 4200 });
    const trade = closeTrade(p, 4050, 200, 'manual', CONTRACT, false, COSTS);
    expect(trade.exitPrice).toBe(4050);
  });

  it('a short covers at the derived Ask (bid + spread)', () => {
    const p = position({ side: 'sell', entryPrice: 4000, sl: 4100, tp: 3800 });
    const trade = closeTrade(p, 3950, 200, 'manual', CONTRACT, false, COSTS);
    expect(trade.exitPrice).toBe(3960); // 3950 + spreadPoints(10)*pointSize(1)
  });

  it('session-end force-close applies the same short Bid→Ask conversion, no slippage', () => {
    const p = position({ side: 'sell', entryPrice: 4000, sl: 4100, tp: 3800 });
    const r = closeSession(book({ positions: [p] }), 3950, 300, CONTRACT, COSTS);
    expect(r.history[0].exitPrice).toBe(3960);
  });

  it("with no costs, both sides close at the raw Bid price (today's behavior)", () => {
    const p = position({ side: 'sell', entryPrice: 4000, sl: 4100, tp: 3800 });
    const trade = closeTrade(p, 3950, 200, 'manual', CONTRACT);
    expect(trade.exitPrice).toBe(3950);
  });
});

// ============ Commission: once per closed trade, every close path ============

describe('commission — commissionPerLot per round-turn, charged exactly once at close', () => {
  it('decomposes profit = grossProfit - commission on an SL/TP engine exit', () => {
    const p = position({ side: 'buy', entryPrice: 4000, sl: 3900, tp: 4200, lots: 0.1 });
    const r = processCandle(
      book({ positions: [p] }),
      candle(100, 4150, 4210, 4140, 4160),
      null,
      CONTRACT,
      COSTS,
    );
    const trade = r.book.history[0];
    expect(trade.commission).toBeCloseTo(0.5, 10); // 5 * 0.1 lots
    expect(trade.grossProfit).toBeCloseTo((4200 - 4000) * 0.1, 10);
    expect(trade.profit).toBeCloseTo(trade.grossProfit! - trade.commission!, 10);
  });

  it('is charged once on a manual close', () => {
    const p = position({ side: 'buy', entryPrice: 4000, sl: 3900, tp: 4200, lots: 0.2 });
    const trade = closeTrade(p, 4050, 200, 'manual', CONTRACT, false, COSTS);
    expect(trade.commission).toBeCloseTo(1, 10); // 5 * 0.2
  });

  it('is charged once per position on a session-end force-close with multiple positions', () => {
    const p1 = position({ id: 'p1', side: 'buy', entryPrice: 4000, sl: 3900, tp: 4200, lots: 0.1 });
    const p2 = position({
      id: 'p2',
      side: 'sell',
      entryPrice: 4000,
      sl: 4100,
      tp: 3800,
      lots: 0.1,
    });
    const r = closeSession(book({ positions: [p1, p2] }), 4020, 300, CONTRACT, COSTS);
    expect(r.history).toHaveLength(2);
    for (const t of r.history) {
      expect(t.commission).toBeCloseTo(0.5, 10);
    }
  });

  it("with absent/zero costs, commission is 0 and grossProfit === profit (today's exact number)", () => {
    const p = position({ side: 'buy', entryPrice: 4000, sl: 3900, tp: 4200, lots: 0.1 });
    const trade = closeTrade(p, 4200, 200, 'tp', CONTRACT);
    expect(trade.commission).toBe(0);
    expect(trade.grossProfit).toBe(trade.profit);
    expect(trade.profit).toBeCloseTo(20, 10); // (4200-4000)*0.1, unchanged from Task 1
  });
});

// ============ V-1 anchor: no-costs vs ZERO_COSTS are deep-equal ============

describe('V-1 anchor — no costs argument vs explicit ZERO_COSTS produce identical results', () => {
  function scenarios(): { b: TradingBook; c: Candle }[] {
    return [
      {
        b: book({ orders: [order({ side: 'buy', type: 'limit', entryPrice: 4000 })] }),
        c: candle(100, 4005, 4006, 3999, 4003),
      },
      {
        b: book({ positions: [position({ side: 'buy', entryPrice: 4000, sl: 3990, tp: 4010 })] }),
        c: candle(100, 4005, 4012, 4002, 4008),
      },
      {
        b: book({ positions: [position({ side: 'sell', entryPrice: 4000, sl: 4010, tp: 3990 })] }),
        c: candle(100, 3995, 4003, 3988, 3992),
      },
      {
        // SL+TP same candle, no sub-series → pessimistic SL, ambiguous
        b: book({ positions: [position({ side: 'buy', entryPrice: 4000, sl: 3990, tp: 4010 })] }),
        c: candle(100, 4000, 4012, 3989, 4005),
      },
    ];
  }

  it('every scenario deep-equals whether costs is omitted or ZERO_COSTS', () => {
    for (const { b, c } of scenarios()) {
      const noArg = processCandle(b, c, null, CONTRACT);
      const zero = processCandle(b, c, null, CONTRACT, ZERO_COSTS);
      expect(zero).toEqual(noArg);
    }
  });

  it('closeTrade: no costs vs ZERO_COSTS are deep-equal (manual close)', () => {
    const p = position({ side: 'sell', entryPrice: 4000, sl: 4100, tp: 3800 });
    const noArg = closeTrade(p, 3950, 200, 'manual', CONTRACT);
    const zero = closeTrade(p, 3950, 200, 'manual', CONTRACT, false, ZERO_COSTS);
    expect(zero).toEqual(noArg);
  });

  it('closeSession: no costs vs ZERO_COSTS are deep-equal', () => {
    const p = position({ side: 'sell', entryPrice: 4000, sl: 4100, tp: 3800 });
    const noArg = closeSession(book({ positions: [p] }), 3950, 300, CONTRACT);
    const zero = closeSession(book({ positions: [p] }), 3950, 300, CONTRACT, ZERO_COSTS);
    expect(zero).toEqual(noArg);
  });
});

// ============ V-2 property: profit <= grossProfit for any non-negative costs ============

describe('V-2 — profit never exceeds grossProfit for any non-negative cost grid', () => {
  it('holds across a grid of spread/commission/slippage combinations and win/loss/long/short scenarios', () => {
    const grid: ExecutionCosts[] = [];
    for (const spreadPoints of [0, 5, 10]) {
      for (const commissionPerLot of [0, 3, 8]) {
        for (const slippagePoints of [0, 2, 6]) {
          grid.push({ spreadPoints, commissionPerLot, slippagePoints, pointSize: 1 });
        }
      }
    }

    const cases: { p: Position; c: Candle }[] = [
      {
        p: position({ side: 'buy', entryPrice: 4000, sl: 3900, tp: 4200 }),
        c: candle(1, 4150, 4210, 4140, 4160),
      }, // long win (TP)
      {
        p: position({ side: 'buy', entryPrice: 4000, sl: 3900, tp: 4200 }),
        c: candle(1, 3950, 3960, 3890, 3940),
      }, // long loss (SL)
      {
        p: position({ side: 'sell', entryPrice: 4000, sl: 4100, tp: 3800 }),
        c: candle(1, 3850, 3860, 3790, 3820),
      }, // short win (TP)
      {
        p: position({ side: 'sell', entryPrice: 4000, sl: 4100, tp: 3800 }),
        c: candle(1, 4050, 4105, 4040, 4060),
      }, // short loss (SL) — high margin holds even at spreadPoints=0
    ];

    for (const costs of grid) {
      for (const { p, c } of cases) {
        const r = processCandle(book({ positions: [p] }), c, null, CONTRACT, costs);
        for (const trade of r.book.history) {
          expect(trade.profit).toBeLessThanOrEqual(trade.grossProfit!);
        }
      }
    }
  });
});
