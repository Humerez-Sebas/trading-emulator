import { describe, expect, it } from 'vitest';
import { Candle } from '../../models';
import { processCandle, TradingBook } from './fill-engine';
import { PendingOrder, Position } from './trading.models';
import { ExecutionCosts } from './execution-costs';

// ---- RFC-014 Task 4b: reified domain facts (OrderFilled / PositionClosed) ----
// The engine (`fill-engine.ts`) builds `ProcessResult.facts` during the SAME
// walk that fills orders and resolves exits — one OrderFilled per order
// filled this candle, one PositionClosed per engine SL/TP exit. Deterministic,
// additive, pure (I-10): no new engine state, no IO. `facts` is always a
// concrete array (never undefined) — empty when nothing filled/exited.

const CONTRACT = 1;

const COSTS: ExecutionCosts = {
  spreadPoints: 0,
  commissionPerLot: 0,
  slippagePoints: 4,
  pointSize: 1,
};

function candle(time: number, open: number, high: number, low: number, close: number): Candle {
  return { time, open, high, low, close };
}

function book(partial: Partial<TradingBook>): TradingBook {
  return { balance: 10000, orders: [], positions: [], history: [], ...partial };
}

function buyStop(entry: number, sl: number, tp: number | null, createdAt = 0): PendingOrder {
  return {
    id: 'o1',
    side: 'buy',
    type: 'stop',
    entryPrice: entry,
    sl,
    tp,
    lots: 1,
    riskPct: 1,
    riskUsd: Math.abs(entry - sl),
    createdAt,
  };
}

function buyLimit(entry: number, sl: number, tp: number | null, createdAt = 0): PendingOrder {
  return {
    id: 'o1',
    side: 'buy',
    type: 'limit',
    entryPrice: entry,
    sl,
    tp,
    lots: 1,
    riskPct: 1,
    riskUsd: Math.abs(entry - sl),
    createdAt,
  };
}

function longPosition(partial: Partial<Position> = {}): Position {
  return {
    id: 'p1',
    side: 'buy',
    entryPrice: 100,
    sl: 90,
    tp: 120,
    lots: 1,
    riskPct: 1,
    riskUsd: 10,
    openTime: 0,
    origin: 'market',
    ...partial,
  };
}

describe('OrderFilled facts', () => {
  it('a filled stop entry emits OrderFilled with the slipped executedPrice', () => {
    // buy stop at 110, triggers when high crosses 110; slippagePoints=4,pointSize=1
    // → executedPrice = 110 + 4 = 114 (adverse slippage, per `slip()`'s 'buy' branch)
    const order = buyStop(110, 100, 130);
    const c = candle(60, 108, 115, 107, 112);
    const r = processCandle(book({ orders: [order] }), c, null, CONTRACT, COSTS);
    expect(r.facts).toHaveLength(1);
    expect(r.facts[0]).toEqual({
      kind: 'OrderFilled',
      tradeId: 'o1',
      executedPrice: 114,
      marketTime: 60,
    });
  });

  it('a filled limit entry emits OrderFilled at the exact level (no slippage)', () => {
    const order = buyLimit(100, 90, 120);
    const c = candle(60, 102, 105, 98, 101);
    const r = processCandle(book({ orders: [order] }), c, null, CONTRACT, COSTS);
    expect(r.facts).toHaveLength(1);
    expect(r.facts[0]).toEqual({
      kind: 'OrderFilled',
      tradeId: 'o1',
      executedPrice: 100,
      marketTime: 60,
    });
  });

  it('fillBaseIndex is absent at emission (engine is series-index-agnostic)', () => {
    const order = buyLimit(100, 90, 120);
    const c = candle(60, 102, 105, 98, 101);
    const r = processCandle(book({ orders: [order] }), c, null, CONTRACT);
    expect(r.facts[0]).not.toHaveProperty('fillBaseIndex');
  });
});

describe('PositionClosed facts', () => {
  it('an SL exit emits PositionClosed with the slipped exit price and ambiguous:false', () => {
    // long, sl=90, slippagePoints=4 → closing action is 'sell' → price = 90 - 4 = 86
    const p = longPosition({ sl: 90, tp: 120 });
    const c = candle(60, 100, 101, 85, 100); // low <= sl, high < tp
    const r = processCandle(book({ positions: [p] }), c, null, CONTRACT, COSTS);
    expect(r.facts).toHaveLength(1);
    expect(r.facts[0]).toEqual({
      kind: 'PositionClosed',
      tradeId: 'p1',
      outcome: 'sl',
      ambiguous: false,
      executedPrice: 86,
      marketTime: 60,
    });
  });

  it('a TP exit emits PositionClosed at the exact TP level, no slippage', () => {
    const p = longPosition({ sl: 90, tp: 120 });
    const c = candle(60, 100, 121, 99, 100); // high >= tp, low > sl
    const r = processCandle(book({ positions: [p] }), c, null, CONTRACT, COSTS);
    expect(r.facts).toHaveLength(1);
    expect(r.facts[0]).toEqual({
      kind: 'PositionClosed',
      tradeId: 'p1',
      outcome: 'tp',
      ambiguous: false,
      executedPrice: 120,
      marketTime: 60,
    });
  });

  it('both SL and TP touched with no sub-candles: pessimistic SL, ambiguous:true', () => {
    const p = longPosition({ sl: 90, tp: 120 });
    const c = candle(60, 100, 125, 85, 100); // both levels inside the same candle
    const r = processCandle(book({ positions: [p] }), c, null, CONTRACT);
    expect(r.facts).toHaveLength(1);
    expect(r.facts[0]).toMatchObject({ kind: 'PositionClosed', outcome: 'sl', ambiguous: true });
  });
});

describe('same-candle fill + exit produces BOTH facts, in order', () => {
  it('an order fills and its resulting position hits SL in the same candle', () => {
    // buy stop at 100, sl=95 → fills when high >= 100; the same candle's low (90)
    // then hits the fresh position's SL (TP untouched, so resolveExit's clean
    // sl-only branch applies — no sub-candles needed to disambiguate here).
    const order = buyStop(100, 95, 130);
    const c = candle(60, 98, 105, 90, 100);
    const r = processCandle(book({ orders: [order] }), c, null, CONTRACT);
    expect(r.facts).toHaveLength(2);
    expect(r.facts[0].kind).toBe('OrderFilled');
    expect(r.facts[1].kind).toBe('PositionClosed');
    expect(r.facts[0].tradeId).toBe('o1');
    expect(r.facts[1].tradeId).toBe('o1'); // same id: order → position → close
  });
});

describe('no facts on a quiet candle', () => {
  it('nothing fills or exits: facts is an empty array (not undefined)', () => {
    const p = longPosition({ sl: 50, tp: 200 }); // far away, untouched
    const c = candle(60, 100, 101, 99, 100);
    const r = processCandle(book({ positions: [p] }), c, null, CONTRACT);
    expect(r.facts).toEqual([]);
  });

  it('an empty book on any candle: facts is an empty array', () => {
    const c = candle(60, 100, 101, 99, 100);
    const r = processCandle(book({}), c, null, CONTRACT);
    expect(r.facts).toEqual([]);
  });
});
