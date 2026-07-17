import { describe, expect, it } from 'vitest';
import {
  buildOrderFilledPayload,
  buildPositionClosedPayload,
  diffDomainFacts,
  resolveFillBaseIndex,
  resolveOrderRef,
  type TradingSnapshot,
} from './telemetry-facts';
import type { ClosedTrade, PendingOrder, Position } from '../trading/trading.models';
import type { Candle } from '../../models';

const position = (over: Partial<Position> = {}): Position => ({
  id: 'p1',
  side: 'buy',
  entryPrice: 100,
  sl: 90,
  tp: 120,
  lots: 1,
  riskPct: 1,
  riskUsd: 10,
  openTime: 1000,
  origin: 'market',
  ...over,
});

const order = (over: Partial<PendingOrder> = {}): PendingOrder => ({
  id: 'o1',
  side: 'buy',
  type: 'limit',
  entryPrice: 100,
  sl: 90,
  tp: 120,
  lots: 1,
  riskPct: 1,
  riskUsd: 10,
  createdAt: 500,
  ...over,
});

const trade = (over: Partial<ClosedTrade> = {}): ClosedTrade => ({
  id: 't1',
  side: 'buy',
  origin: 'market',
  entryPrice: 100,
  exitPrice: 110,
  sl: 90,
  tp: 120,
  lots: 1,
  riskPct: 1,
  riskUsd: 10,
  openTime: 1000,
  closeTime: 2000,
  outcome: 'tp',
  profit: 100,
  rMultiple: 1,
  ambiguous: false,
  ...over,
});

const candle = (time: number): Candle => ({ time, open: 1, high: 1, low: 1, close: 1 });

const snap = (over: Partial<TradingSnapshot> = {}): TradingSnapshot => ({
  sessionId: 'sess-1',
  orders: [],
  positions: [],
  history: [],
  ...over,
});

describe('telemetry-facts (RFC-014 T5b-ii) — pure post-reducer diffing', () => {
  // ─── resolveFillBaseIndex / buildOrderFilledPayload ────────────────────

  describe('resolveFillBaseIndex', () => {
    it('omits when there is no base series', () => {
      expect(resolveFillBaseIndex(null, 1000)).toBeUndefined();
      expect(resolveFillBaseIndex(undefined, 1000)).toBeUndefined();
      expect(resolveFillBaseIndex([], 1000)).toBeUndefined();
    });

    it('resolves the last base index at or before marketTime', () => {
      const base = [candle(100), candle(200), candle(300)];
      expect(resolveFillBaseIndex(base, 250)).toBe(1);
      expect(resolveFillBaseIndex(base, 300)).toBe(2);
    });

    it('omits when marketTime is before the earliest base candle', () => {
      const base = [candle(100), candle(200)];
      expect(resolveFillBaseIndex(base, 50)).toBeUndefined();
    });
  });

  describe('buildOrderFilledPayload', () => {
    it('includes fillBaseIndex when a base series resolves it', () => {
      const base = [candle(100), candle(200)];
      const payload = buildOrderFilledPayload('t1', 105, 200, base);
      expect(payload).toEqual({
        tradeId: 't1',
        fillBaseIndex: 1,
        executedPrice: 105,
        marketTime: 200,
      });
    });

    it('omits the fillBaseIndex KEY (not just undefined) when there is no base series', () => {
      const payload = buildOrderFilledPayload('t1', 105, 200, null);
      expect(payload).toEqual({ tradeId: 't1', executedPrice: 105, marketTime: 200 });
      expect('fillBaseIndex' in payload).toBe(false);
    });
  });

  describe('buildPositionClosedPayload', () => {
    it('maps outcome/ambiguous/exitPrice/closeTime', () => {
      const t = trade({ outcome: 'sl', ambiguous: true, exitPrice: 88, closeTime: 3000 });
      expect(buildPositionClosedPayload(t)).toEqual({
        tradeId: 't1',
        outcome: 'sl',
        ambiguous: true,
        executedPrice: 88,
        marketTime: 3000,
      });
    });
  });

  // ─── diffDomainFacts ────────────────────────────────────────────────────

  describe('diffDomainFacts', () => {
    it('a new limit-origin position emits OrderFilled only', () => {
      const prev = snap();
      const curr = snap({ positions: [position({ id: 'p1', origin: 'limit', entryPrice: 105 })] });
      const facts = diffDomainFacts(prev, curr, null);
      expect(facts).toEqual([
        {
          kind: 'OrderFilled',
          marketTime: 1000,
          payload: { tradeId: 'p1', executedPrice: 105, marketTime: 1000 },
        },
      ]);
    });

    it('a new stop-origin position emits OrderFilled only', () => {
      const prev = snap();
      const curr = snap({ positions: [position({ id: 'p2', origin: 'stop' })] });
      const facts = diffDomainFacts(prev, curr, null);
      expect(facts).toHaveLength(1);
      expect(facts[0].kind).toBe('OrderFilled');
    });

    it('a new market-origin position emits NOTHING (market fills are not OrderFilled)', () => {
      const prev = snap();
      const curr = snap({ positions: [position({ id: 'p3', origin: 'market' })] });
      expect(diffDomainFacts(prev, curr, null)).toEqual([]);
    });

    it('an existing position moving into history emits PositionClosed only (no duplicate OrderFilled)', () => {
      const openPosition = position({ id: 'p1', origin: 'limit' });
      const prev = snap({ positions: [openPosition] });
      const curr = snap({ history: [trade({ id: 'p1', origin: 'limit', outcome: 'manual' })] });
      const facts = diffDomainFacts(prev, curr, null);
      expect(facts).toHaveLength(1);
      expect(facts[0].kind).toBe('PositionClosed');
    });

    it('a market position closing also emits PositionClosed only', () => {
      const prev = snap({ positions: [position({ id: 'p1', origin: 'market' })] });
      const curr = snap({ history: [trade({ id: 'p1', origin: 'market', outcome: 'tp' })] });
      const facts = diffDomainFacts(prev, curr, null);
      expect(facts).toEqual([
        {
          kind: 'PositionClosed',
          marketTime: 2000,
          payload: {
            tradeId: 'p1',
            outcome: 'tp',
            ambiguous: false,
            executedPrice: 110,
            marketTime: 2000,
          },
        },
      ]);
    });

    it('same-candle fill+close (never appeared in positions[]) emits BOTH, OrderFilled first', () => {
      const prev = snap();
      const curr = snap({
        history: [
          trade({
            id: 'x1',
            origin: 'stop',
            outcome: 'sl',
            entryPrice: 95,
            exitPrice: 90,
            openTime: 1500,
            closeTime: 1500,
          }),
        ],
      });
      const facts = diffDomainFacts(prev, curr, null);
      expect(facts).toHaveLength(2);
      expect(facts[0]).toEqual({
        kind: 'OrderFilled',
        marketTime: 1500,
        payload: { tradeId: 'x1', executedPrice: 95, marketTime: 1500 },
      });
      expect(facts[1]).toEqual({
        kind: 'PositionClosed',
        marketTime: 1500,
        payload: {
          tradeId: 'x1',
          outcome: 'sl',
          ambiguous: false,
          executedPrice: 90,
          marketTime: 1500,
        },
      });
    });

    it('same-candle fill+close resolves fillBaseIndex from the base series when present', () => {
      const base = [candle(1000), candle(1500), candle(2000)];
      const prev = snap();
      const curr = snap({
        history: [trade({ id: 'x1', origin: 'limit', openTime: 1500, closeTime: 1500 })],
      });
      const facts = diffDomainFacts(prev, curr, base);
      expect(facts[0].payload).toMatchObject({ fillBaseIndex: 1 });
    });

    it('does not double-count an id already present in both prev and curr history', () => {
      const t = trade({ id: 't1' });
      const prev = snap({ history: [t] });
      const curr = snap({ history: [t] });
      expect(diffDomainFacts(prev, curr, null)).toEqual([]);
    });

    it('an unrelated positions[] array-reference churn (e.g. modifyPosition) with the SAME ids emits nothing', () => {
      const p = position({ id: 'p1', origin: 'limit', sl: 90 });
      const prev = snap({ positions: [p] });
      const curr = snap({ positions: [{ ...p, sl: 92 }] }); // new object, same id
      expect(diffDomainFacts(prev, curr, null)).toEqual([]);
    });

    it('multiple independent new facts in one transition are all emitted', () => {
      const prev = snap({ positions: [position({ id: 'keep', origin: 'limit' })] });
      const curr = snap({
        positions: [
          position({ id: 'keep', origin: 'limit' }),
          position({ id: 'new', origin: 'stop' }),
        ],
        history: [trade({ id: 'closed', origin: 'market' })],
      });
      const facts = diffDomainFacts(prev, curr, null);
      expect(facts.map((f) => f.kind)).toEqual(['OrderFilled', 'PositionClosed']);
    });
  });

  // ─── resolveOrderRef ────────────────────────────────────────────────────

  describe('resolveOrderRef', () => {
    it('returns the newly placed pending order id', () => {
      const prev = snap();
      const curr = snap({ orders: [order({ id: 'o1' })] });
      expect(resolveOrderRef(prev, curr)).toBe('o1');
    });

    it('returns the newly opened market position id', () => {
      const prev = snap();
      const curr = snap({ positions: [position({ id: 'p1', origin: 'market' })] });
      expect(resolveOrderRef(prev, curr)).toBe('p1');
    });

    it('returns undefined for a rejected placement (state unchanged)', () => {
      const prev = snap({ orders: [order({ id: 'o1' })] });
      const curr = snap({ orders: [order({ id: 'o1' })] });
      expect(resolveOrderRef(prev, curr)).toBeUndefined();
    });

    it('returns undefined for a modification (same ids, different values)', () => {
      const o = order({ id: 'o1', entryPrice: 100 });
      const prev = snap({ orders: [o] });
      const curr = snap({ orders: [{ ...o, entryPrice: 105 }] });
      expect(resolveOrderRef(prev, curr)).toBeUndefined();
    });

    it('a pending-order FILL (new limit/stop position) is NOT treated as a placement', () => {
      const prev = snap();
      const curr = snap({ positions: [position({ id: 'p1', origin: 'stop' })] });
      expect(resolveOrderRef(prev, curr)).toBeUndefined();
    });

    it('prefers a new order over a new market position when (hypothetically) both are present', () => {
      const prev = snap();
      const curr = snap({
        orders: [order({ id: 'o1' })],
        positions: [position({ id: 'p1', origin: 'market' })],
      });
      expect(resolveOrderRef(prev, curr)).toBe('o1');
    });
  });
});
