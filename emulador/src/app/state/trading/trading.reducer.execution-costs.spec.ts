import { describe, expect, it } from 'vitest';
import { tradingFeature } from './trading.reducer';
import { TradingActions } from './trading.actions';
import { defaultTradingData, PendingOrder, Position, TradingState } from './trading.models';
import { Candle } from '../../models';
import { COST_PRESETS, costPresetFor, ExecutionCosts } from './execution-costs';

// RFC-014 Task 2: the reducer OWNS the trading slice's executionCosts and
// passes them to the engine as an explicit argument (no action payload
// changes — the pre-existing effect specs assert dispatched action shapes
// with toEqual, so costs travel entirely through state, never the action).

const reducer = tradingFeature.reducer;

const COSTS: ExecutionCosts = {
  spreadPoints: 10,
  commissionPerLot: 5,
  slippagePoints: 4,
  pointSize: 1,
};

function state(partial: Partial<TradingState> = {}): TradingState {
  return {
    ...defaultTradingData(),
    summaryOpen: false,
    savedSessions: [],
    activeSessionId: null,
    ...partial,
  };
}

function order(partial: Partial<PendingOrder> = {}): PendingOrder {
  return {
    id: 'o1',
    side: 'buy',
    type: 'stop',
    entryPrice: 4000,
    sl: 3000,
    tp: 5000,
    lots: 0.1,
    riskPct: 1,
    riskUsd: 100,
    createdAt: 0,
    ...partial,
  };
}

function position(partial: Partial<Position> = {}): Position {
  return {
    id: 'p1',
    side: 'sell',
    entryPrice: 4000,
    sl: 4100,
    tp: 3800,
    lots: 0.1,
    riskPct: 1,
    riskUsd: 100,
    openTime: 0,
    origin: 'market',
    ...partial,
  };
}

describe('trading reducer: executionCosts wiring — processCandle', () => {
  it('reads state.executionCosts (not the action payload) and applies slippage on a stop fill', () => {
    const s = state({ orders: [order()], executionCosts: COSTS });
    const candle: Candle = { time: 100, open: 4000, high: 4010, low: 3999, close: 4005 };
    const next = reducer(
      s,
      TradingActions.processCandle({ candle, subCandles: null, contractSize: 1 }),
    );
    expect(next.positions).toHaveLength(1);
    expect(next.positions[0].entryPrice).toBe(4004); // 4000 + slippagePoints(4)*pointSize(1)
  });

  it('with executionCosts null (default), behaves exactly like Task 1 (no slippage)', () => {
    const s = state({ orders: [order()] }); // executionCosts: null (default)
    const candle: Candle = { time: 100, open: 4000, high: 4010, low: 3999, close: 4005 };
    const next = reducer(
      s,
      TradingActions.processCandle({ candle, subCandles: null, contractSize: 1 }),
    );
    expect(next.positions[0].entryPrice).toBe(4000);
  });
});

describe('trading reducer: executionCosts wiring — closePosition (manual close)', () => {
  it('a short covers at the derived Ask and pays commission', () => {
    const s = state({ positions: [position()], executionCosts: COSTS });
    const next = reducer(
      s,
      TradingActions.closePosition({ id: 'p1', price: 3950, time: 200, contractSize: 1 }),
    );
    expect(next.history[0].exitPrice).toBe(3960); // 3950 + spreadPoints(10)*pointSize(1)
    expect(next.history[0].commission).toBeCloseTo(0.5, 10); // 5 * 0.1 lots
  });

  it('with executionCosts null, closes at the raw Bid price (Task 1 behavior)', () => {
    const s = state({ positions: [position()] });
    const next = reducer(
      s,
      TradingActions.closePosition({ id: 'p1', price: 3950, time: 200, contractSize: 1 }),
    );
    expect(next.history[0].exitPrice).toBe(3950);
    expect(next.history[0].commission).toBe(0);
  });
});

describe('trading reducer: executionCosts wiring — endSession (force close)', () => {
  it('applies the same short Bid→Ask conversion and commission as a manual close', () => {
    const s = state({ positions: [position()], executionCosts: COSTS });
    const next = reducer(s, TradingActions.endSession({ price: 3950, time: 300, contractSize: 1 }));
    expect(next.history[0].exitPrice).toBe(3960);
    expect(next.history[0].commission).toBeCloseTo(0.5, 10);
    expect(next.sessionEnded).toBe(true);
  });
});

describe('SavedSession archive/restore round trip — executionCosts', () => {
  it('newSession archives the active session with its executionCosts intact', () => {
    const costs = costPresetFor('XAUUSD');
    const s = state({
      executionCosts: costs,
      history: [
        {
          id: 't1',
          side: 'buy',
          origin: 'market',
          entryPrice: 2000,
          exitPrice: 2010,
          sl: 1990,
          tp: 2020,
          lots: 0.1,
          riskPct: 1,
          riskUsd: 100,
          openTime: 0,
          closeTime: 60,
          outcome: 'tp',
          profit: 10,
          rMultiple: 0.1,
          ambiguous: false,
        },
      ],
    });
    const next = reducer(s, TradingActions.newSession({ currentCursor: 100 }));
    expect(next.savedSessions).toHaveLength(1);
    expect(next.savedSessions[0].trading.executionCosts).toEqual(costs);
  });

  it("switchSession restores the target session's executionCosts into live state", () => {
    const costs = COST_PRESETS.Forex;
    const saved = {
      id: 's1',
      name: 'Target',
      createdAt: 1,
      currentTime: 500,
      trading: { ...defaultTradingData(), sessionName: 'Target', executionCosts: costs },
    };
    const s = state({ savedSessions: [saved] });
    const next = reducer(s, TradingActions.switchSession({ id: 's1', currentCursor: 999 }));
    expect(next.executionCosts).toEqual(costs);
  });

  it('a full archive → switch-back round trip preserves executionCosts losslessly', () => {
    const costsA = costPresetFor('EURUSD');
    const costsB = costPresetFor('XAUUSD');
    const saved = {
      id: 's-b',
      name: 'Session B',
      createdAt: 1,
      currentTime: 0,
      trading: { ...defaultTradingData(), sessionName: 'Session B', executionCosts: costsB },
    };
    const active = state({
      executionCosts: costsA,
      sessionName: 'Session A',
      savedSessions: [saved],
      activeSessionId: 's-a',
    });
    const switched = reducer(active, TradingActions.switchSession({ id: 's-b', currentCursor: 0 }));
    expect(switched.executionCosts).toEqual(costsB);
    const backArchived = switched.savedSessions.find((ss) => ss.id === 's-a')!;
    expect(backArchived.trading.executionCosts).toEqual(costsA);
  });
});
