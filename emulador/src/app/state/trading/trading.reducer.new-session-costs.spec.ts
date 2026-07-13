import { describe, expect, it } from 'vitest';
import { tradingFeature } from './trading.reducer';
import { TradingActions } from './trading.actions';
import { defaultTradingData, TradingState } from './trading.models';
import { COST_PRESETS } from './execution-costs';

const reducer = tradingFeature.reducer;

function state(partial: Partial<TradingState> = {}): TradingState {
  return {
    ...defaultTradingData(),
    summaryOpen: false,
    savedSessions: [],
    activeSessionId: null,
    ...partial,
  };
}

describe('newSession seeds executionCosts (RFC-014 G1, T6b)', () => {
  it('absent executionCosts ⇒ null (legacy path unchanged)', () => {
    const next = reducer(state(), TradingActions.newSession({ currentCursor: 0 }));
    expect(next.executionCosts).toBeNull();
  });

  it('a resolved preset in the action seeds the fresh session executionCosts', () => {
    const costs = COST_PRESETS.Forex;
    const next = reducer(state(), TradingActions.newSession({ currentCursor: 0, executionCosts: costs }));
    expect(next.executionCosts).toEqual(costs);
  });

  it('an overridden cost object seeds the fresh session executionCosts verbatim', () => {
    const costs = { spreadPoints: 4, commissionPerLot: 1.5, slippagePoints: 0, pointSize: 1 };
    const next = reducer(state(), TradingActions.newSession({ currentCursor: 0, executionCosts: costs }));
    expect(next.executionCosts).toEqual(costs);
  });

  it('explicit null executionCosts stays null', () => {
    const next = reducer(
      state(),
      TradingActions.newSession({ currentCursor: 0, executionCosts: null }),
    );
    expect(next.executionCosts).toBeNull();
  });

  it('does not leak the outgoing session executionCosts into the fresh one when absent', () => {
    const withCosts = state({ executionCosts: COST_PRESETS.Metales });
    const next = reducer(withCosts, TradingActions.newSession({ currentCursor: 5 }));
    expect(next.executionCosts).toBeNull();
  });
});
