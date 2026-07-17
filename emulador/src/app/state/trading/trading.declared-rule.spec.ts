// trading.declared-rule.spec.ts — uses existing fixtures from '../../testing/fixtures'
import { describe, expect, it } from 'vitest';
import { processCandle, closeTrade } from './fill-engine';
import { tradingFeature } from './trading.reducer';
import { TradingActions } from './trading.actions';
import { order, position } from '../../testing/fixtures';

const { reducer } = tradingFeature;
const init = reducer(undefined, { type: '@@init' } as never);

describe('declaredRuleId identity chain (P-4)', () => {
  it('order → position → closed trade keeps the stamp through the real engine', () => {
    const o = { ...order({ id: 'o1', createdAt: 0 }), declaredRuleId: 'rule-1' };
    const book = { balance: 10000, orders: [o], positions: [], history: [] };
    // fills (limit buy at entry; candle after createdAt touching entry then SL)
    const fill = processCandle(
      book,
      { time: 60, open: 4000, high: 4001, low: o.entryPrice - 1, close: 4000 },
      null,
      100,
    );
    expect(fill.book.positions[0]?.declaredRuleId ?? fill.book.history[0]?.declaredRuleId).toBe(
      'rule-1',
    );
    const closedAll = [...fill.book.history];
    if (fill.book.positions.length) {
      closedAll.push(closeTrade(fill.book.positions[0], 3990, 120, 'manual', 100));
    }
    expect(closedAll[0].declaredRuleId).toBe('rule-1');
  });

  it('undeclared placement stays undeclared end to end (P-1)', () => {
    const o = order({ id: 'o1', createdAt: 0 });
    const book = { balance: 10000, orders: [o], positions: [], history: [] };
    const fill = processCandle(
      book,
      { time: 60, open: 4000, high: 4001, low: o.entryPrice - 1, close: 4000 },
      null,
      100,
    );
    const carrier = fill.book.positions[0] ?? fill.book.history[0];
    expect(carrier.declaredRuleId ?? null).toBeNull();
  });
});

describe('tagTrade (G2 + D15.A)', () => {
  it('tags the MOST RECENT active entity (position vs older order)', () => {
    const s0 = {
      ...init,
      orders: [{ ...order({ id: 'o-old', createdAt: 10 }) }],
      positions: [{ ...position({ id: 'p-new', openTime: 50 }) }],
    };
    const s = reducer(s0 as never, TradingActions.tagTrade({ ruleId: 'r1' }));
    expect(s.positions[0].declaredRuleId).toBe('r1');
    expect(s.orders[0].declaredRuleId ?? null).toBeNull();
  });

  it('same rule twice toggles the tag off', () => {
    const s0 = { ...init, positions: [{ ...position({ id: 'p1' }), declaredRuleId: 'r1' }] };
    const s = reducer(s0 as never, TradingActions.tagTrade({ ruleId: 'r1' }));
    expect(s.positions[0].declaredRuleId).toBeNull();
  });

  it('a different rule overwrites the tag', () => {
    const s0 = { ...init, positions: [{ ...position({ id: 'p1' }), declaredRuleId: 'r1' }] };
    const s = reducer(s0 as never, TradingActions.tagTrade({ ruleId: 'r2' }));
    expect(s.positions[0].declaredRuleId).toBe('r2');
  });

  it('no active entities ⇒ reference-identity no-op', () => {
    const s = reducer(init, TradingActions.tagTrade({ ruleId: 'r1' }));
    expect(s).toBe(init);
  });
});
