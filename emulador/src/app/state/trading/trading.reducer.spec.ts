import { describe, expect, it } from 'vitest';
import { tradingFeature } from './trading.reducer';
import { TradingActions } from './trading.actions';
import { WorkspacesActions } from '../workspaces/workspaces.actions';
import {
  ClosedTrade,
  defaultTradingData,
  lotsForRisk,
  PendingOrder,
  Position,
  TradingState,
} from './trading.models';
import { Workspace } from '../workspaces/workspaces.models';
import { workspace } from '../../testing/fixtures';
import { Candle } from '../../models';

const reducer = tradingFeature.reducer;

function state(partial: Partial<TradingState> = {}): TradingState {
  return { ...defaultTradingData(), summaryOpen: false, savedSessions: [], ...partial };
}

function order(partial: Partial<PendingOrder> = {}): PendingOrder {
  return {
    id: 'o1',
    side: 'buy',
    type: 'limit',
    entryPrice: 4000,
    sl: 3990,
    tp: 4020,
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
    side: 'buy',
    entryPrice: 4000,
    sl: 3990,
    tp: 4020,
    lots: 0.1,
    riskPct: 1,
    riskUsd: 100,
    openTime: 0,
    origin: 'market',
    ...partial,
  };
}

function closed(partial: Partial<ClosedTrade> = {}): ClosedTrade {
  return {
    id: 't1',
    side: 'buy',
    origin: 'market',
    entryPrice: 4000,
    exitPrice: 4020,
    sl: 3990,
    tp: 4020,
    lots: 0.1,
    riskPct: 1,
    riskUsd: 100,
    openTime: 0,
    closeTime: 60,
    outcome: 'tp',
    profit: 200,
    rMultiple: 2,
    ambiguous: false,
    ...partial,
  };
}

describe('trading reducer: modifyOrder re-sizing (pending = risk % constant)', () => {
  it('recalculates lots and riskUsd when the SL changes (gold, contract 100)', () => {
    const s = state({ orders: [order()] });
    const next = reducer(s, TradingActions.modifyOrder({ id: 'o1', sl: 3980, contractSize: 100 }));
    const o = next.orders[0];
    const expected = lotsForRisk(s.balance, 1, 4000, 3980, 100); // 100$ / (20*100) = 0.05
    expect(o.lots).toBe(expected);
    expect(o.riskUsd).toBeCloseTo(Math.abs(4000 - 3980) * expected * 100, 6);
  });

  it('recalculates with index contract size 1', () => {
    const s = state({ orders: [order({ entryPrice: 42000, sl: 41800, tp: null })] });
    const next = reducer(s, TradingActions.modifyOrder({ id: 'o1', sl: 41600, contractSize: 1 }));
    const o = next.orders[0];
    expect(o.lots).toBe(lotsForRisk(s.balance, 1, 42000, 41600, 1)); // 100/(400*1) = 0.25
    expect(o.riskUsd).toBeCloseTo(400 * o.lots, 6);
  });

  it('recalculates when the entry changes', () => {
    const s = state({ orders: [order()] });
    const next = reducer(
      s,
      TradingActions.modifyOrder({ id: 'o1', entryPrice: 4010, contractSize: 100 }),
    );
    const o = next.orders[0];
    expect(o.entryPrice).toBe(4010);
    expect(o.lots).toBe(lotsForRisk(s.balance, 1, 4010, 3990, 100));
  });

  it('does NOT recalculate when only the TP changes', () => {
    const s = state({ orders: [order()] });
    const next = reducer(s, TradingActions.modifyOrder({ id: 'o1', tp: 4050, contractSize: 100 }));
    expect(next.orders[0].tp).toBe(4050);
    expect(next.orders[0].lots).toBe(0.1);
    expect(next.orders[0].riskUsd).toBe(100);
  });

  it('keeps the previous lots/riskUsd when the SL lands on the entry (lots 0)', () => {
    const s = state({ orders: [order()] });
    const next = reducer(s, TradingActions.modifyOrder({ id: 'o1', sl: 4000, contractSize: 100 }));
    expect(next.orders[0].sl).toBe(4000);
    expect(next.orders[0].lots).toBe(0.1);
    expect(next.orders[0].riskUsd).toBe(100);
  });

  it('modifyPosition never re-sizes an open position', () => {
    const s = state({ positions: [position()] });
    const next = reducer(s, TradingActions.modifyPosition({ id: 'p1', sl: 3950 }));
    expect(next.positions[0].sl).toBe(3950);
    expect(next.positions[0].lots).toBe(0.1);
    expect(next.positions[0].riskUsd).toBe(100);
  });
});

describe('trading reducer: trade box hide/delete', () => {
  it('toggles boxHidden on the targeted trade only', () => {
    const s = state({ history: [closed(), closed({ id: 't2' })] });
    const next = reducer(s, TradingActions.setTradeBoxHidden({ id: 't1', hidden: true }));
    expect(next.history[0].boxHidden).toBe(true);
    expect(next.history[1].boxHidden).toBeUndefined();
    const back = reducer(next, TradingActions.setTradeBoxHidden({ id: 't1', hidden: false }));
    expect(back.history[0].boxHidden).toBe(false);
  });

  it('marks boxDeleted on the targeted trade only', () => {
    const s = state({ history: [closed(), closed({ id: 't2' })] });
    const next = reducer(s, TradingActions.deleteTradeBox({ id: 't2' }));
    expect(next.history[0].boxDeleted).toBeUndefined();
    expect(next.history[1].boxDeleted).toBe(true);
  });

  it('ignores unknown ids', () => {
    const s = state({ history: [closed()] });
    const next = reducer(s, TradingActions.deleteTradeBox({ id: 'nope' }));
    expect(next.history).toEqual(s.history);
  });

  it('archives a NAMED session with zero trades on switch (wizard regression)', () => {
    // wizard flow: newSession + setSessionName, no trades yet
    let s = reducer(state(), TradingActions.newSession({ currentCursor: 0 }));
    s = reducer(s, TradingActions.setSessionName({ name: 'US30 junio' }));
    // archive happens with the cursor at the moment of leaving
    const next = reducer(s, TradingActions.newSession({ currentCursor: 1750000000 }));
    expect(next.savedSessions).toHaveLength(1);
    expect(next.savedSessions[0].name).toBe('US30 junio');
    expect(next.savedSessions[0].currentTime).toBe(1750000000);
    expect(next.savedSessions[0].trading.sessionName).toBe('US30 junio');
  });

  it('still discards anonymous empty sessions on switch', () => {
    const next = reducer(state(), TradingActions.newSession({ currentCursor: 123 }));
    expect(next.savedSessions).toHaveLength(0);
  });

  it('archives a named empty session when switching to a saved one', () => {
    const saved = {
      id: 's1',
      name: 'Anterior',
      createdAt: 1,
      currentTime: 500,
      trading: { ...defaultTradingData(), sessionName: 'Anterior' },
    };
    const s = state({ sessionName: 'Wizard sin trades', savedSessions: [saved] });
    const next = reducer(s, TradingActions.switchSession({ id: 's1', currentCursor: 999 }));
    expect(next.sessionName).toBe('Anterior');
    expect(next.savedSessions).toHaveLength(1);
    expect(next.savedSessions[0].name).toBe('Wizard sin trades');
    expect(next.savedSessions[0].currentTime).toBe(999);
  });

  it('setSessionFolder on the active session (id null) sets state.folderId', () => {
    const next = reducer(state(), TradingActions.setSessionFolder({ id: null, folderId: 'f1' }));
    expect(next.folderId).toBe('f1');
    const cleared = reducer(next, TradingActions.setSessionFolder({ id: null, folderId: null }));
    expect(cleared.folderId).toBeNull();
  });

  it('setSessionFolder on an archived session updates its trading.folderId', () => {
    const saved = {
      id: 's1',
      name: 'A',
      createdAt: 1,
      currentTime: 0,
      trading: { ...defaultTradingData(), folderId: null },
    };
    const s = state({ savedSessions: [saved] });
    const next = reducer(s, TradingActions.setSessionFolder({ id: 's1', folderId: 'f2' }));
    expect(next.savedSessions[0].trading.folderId).toBe('f2');
  });

  it('renameSession renames an archived session (and its inner trading name)', () => {
    const saved = {
      id: 's1',
      name: 'Vieja',
      createdAt: 1,
      currentTime: 500,
      trading: { ...defaultTradingData(), sessionName: 'Vieja' },
    };
    const s = state({ savedSessions: [saved] });
    const next = reducer(s, TradingActions.renameSession({ id: 's1', name: '  Nueva  ' }));
    expect(next.savedSessions[0].name).toBe('Nueva');
    expect(next.savedSessions[0].trading.sessionName).toBe('Nueva');
    const noop = reducer(s, TradingActions.renameSession({ id: 's1', name: '   ' }));
    expect(noop.savedSessions[0].name).toBe('Vieja');
  });

  it('restores legacy workspaces (history without box fields) as visible', () => {
    const legacyTrade = closed();
    delete legacyTrade.boxHidden;
    delete legacyTrade.boxDeleted;
    const legacyWorkspace = {
      symbol: 'XAUUSD',
      trading: { ...defaultTradingData(), history: [legacyTrade] },
    } as unknown as Workspace;
    const next = reducer(
      state(),
      WorkspacesActions.workspaceRestored({ workspace: legacyWorkspace }),
    );
    expect(next.history[0].boxHidden).toBeUndefined();
    expect(next.history[0].boxDeleted).toBeUndefined();
  });
});

// ---- EXTENDED CASES (AREA 1 plan) ----

describe('trading reducer: openMarket', () => {
  it('opens a position with lotsForRisk sizing', () => {
    const s = state();
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
    expect(next.positions).toHaveLength(1);
    expect(next.positions[0].side).toBe('buy');
    expect(next.positions[0].entryPrice).toBe(4000);
    const expected = lotsForRisk(s.balance, 1, 4000, 3990, 100);
    expect(next.positions[0].lots).toBe(expected);
  });

  it('reviveIfEnded re-opens a sessionEnded session', () => {
    const s = state({ sessionEnded: true, sessionEnd: null });
    const next = reducer(
      s,
      TradingActions.openMarket({
        side: 'buy',
        price: 4000,
        sl: 3990,
        tp: null,
        riskPct: 1,
        time: 3600,
        contractSize: 100,
      }),
    );
    expect(next.sessionEnded).toBe(false);
    expect(next.positions).toHaveLength(1);
  });

  it('reviveIfEnded clears a now-past sessionEnd', () => {
    const s = state({ sessionEnded: true, sessionEnd: 1000 });
    const next = reducer(
      s,
      TradingActions.openMarket({
        side: 'buy',
        price: 4000,
        sl: 3990,
        tp: null,
        riskPct: 1,
        time: 2000,
        contractSize: 100,
      }),
    );
    expect(next.sessionEnd).toBeNull();
  });

  it('returns state unchanged when lots <= 0 (SL == price)', () => {
    const s = state();
    const next = reducer(
      s,
      TradingActions.openMarket({
        side: 'buy',
        price: 4000,
        sl: 4000,
        tp: null,
        riskPct: 1,
        time: 3600,
        contractSize: 100,
      }),
    );
    expect(next).toBe(s);
    expect(next.positions).toHaveLength(0);
  });
});

describe('trading reducer: placeOrder', () => {
  it('appends an order', () => {
    const s = state();
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
    expect(next.orders).toHaveLength(1);
    expect(next.orders[0].side).toBe('buy');
  });

  it('returns state unchanged when lots <= 0 (SL == entry)', () => {
    const s = state();
    const next = reducer(
      s,
      TradingActions.placeOrder({
        side: 'buy',
        orderType: 'limit',
        entryPrice: 3980,
        sl: 3980,
        tp: 4000,
        riskPct: 1,
        time: 0,
        contractSize: 100,
      }),
    );
    expect(next).toBe(s);
  });

  it('revives a sessionEnded session when placing an order', () => {
    const s = state({ sessionEnded: true });
    const next = reducer(
      s,
      TradingActions.placeOrder({
        side: 'sell',
        orderType: 'stop',
        entryPrice: 3950,
        sl: 3960,
        tp: 3900,
        riskPct: 1,
        time: 0,
        contractSize: 100,
      }),
    );
    expect(next.sessionEnded).toBe(false);
    expect(next.orders).toHaveLength(1);
  });
});

describe('trading reducer: cancelOrder', () => {
  it('removes the order by id', () => {
    const s = state({ orders: [order({ id: 'o1' }), order({ id: 'o2' })] });
    const next = reducer(s, TradingActions.cancelOrder({ id: 'o1' }));
    expect(next.orders.map((o) => o.id)).not.toContain('o1');
    expect(next.orders.map((o) => o.id)).toContain('o2');
  });

  it('unknown id → no-op', () => {
    const s = state({ orders: [order()] });
    const next = reducer(s, TradingActions.cancelOrder({ id: 'nope' }));
    expect(next.orders).toHaveLength(1);
  });
});

describe('trading reducer: closePosition', () => {
  it('closes the position, moves it to history, updates balance', () => {
    const pos = position({ id: 'p1', entryPrice: 4000, side: 'buy', lots: 0.1 });
    const s = state({ positions: [pos] });
    const next = reducer(
      s,
      TradingActions.closePosition({ id: 'p1', price: 4020, time: 3600, contractSize: 100 }),
    );
    expect(next.positions).toHaveLength(0);
    expect(next.history).toHaveLength(1);
    expect(next.history[0].profit).toBeGreaterThan(0); // buy at 4000, close at 4020
    expect(next.balance).toBeCloseTo(s.balance + next.history[0].profit, 6);
  });

  it('unknown id → unchanged', () => {
    const s = state({ positions: [position()] });
    const next = reducer(
      s,
      TradingActions.closePosition({ id: 'nope', price: 4020, time: 3600, contractSize: 100 }),
    );
    expect(next).toBe(s);
  });
});

describe('trading reducer: processCandle', () => {
  it('changed:false path still bumps lastProcessedTime', () => {
    const candle: Candle = { time: 3600, open: 100, high: 101, low: 99, close: 100 };
    const s = state();
    const next = reducer(
      s,
      TradingActions.processCandle({ candle, subCandles: null, contractSize: 100 }),
    );
    expect(next.lastProcessedTime).toBe(3600);
  });

  it('changed:true path applies the book', () => {
    // A position whose SL will be hit
    const pos = position({
      id: 'p1',
      side: 'buy',
      entryPrice: 4000,
      sl: 4010, // SL above entry (unusual, but will be hit when high >= 4010)
      tp: null,
      lots: 0.1,
      openTime: 0,
    });
    const candle: Candle = { time: 3600, open: 4000, high: 4020, low: 3990, close: 4000 };
    const s = state({ positions: [pos] });
    const next = reducer(
      s,
      TradingActions.processCandle({ candle, subCandles: null, contractSize: 100 }),
    );
    // SL was hit (buy with sl=4010, high=4020 → candle.low <= sl? No; buy slHit = low <= sl → 3990<=4010 YES)
    expect(next.positions).toHaveLength(0);
    expect(next.history).toHaveLength(1);
    expect(next.lastProcessedTime).toBe(3600);
  });
});

describe('trading reducer: endSession', () => {
  it('closes everything, sets sessionEnded:true and summaryOpen:true', () => {
    const pos = position({ id: 'p1', entryPrice: 4000, side: 'buy', lots: 0.1, openTime: 0 });
    const ord = order({ id: 'o1' });
    const s = state({ positions: [pos], orders: [ord] });
    const next = reducer(
      s,
      TradingActions.endSession({ price: 4010, time: 3600, contractSize: 100 }),
    );
    expect(next.sessionEnded).toBe(true);
    expect(next.summaryOpen).toBe(true);
    expect(next.positions).toHaveLength(0);
    expect(next.orders).toHaveLength(0);
    expect(next.history).toHaveLength(1);
  });
});

describe('trading reducer: setInitialBalance', () => {
  it('rebases balance to initial + realized', () => {
    const t = closed({ profit: 200 });
    const s = state({ history: [t], balance: 10200, initialBalance: 10000 });
    const next = reducer(s, TradingActions.setInitialBalance({ balance: 5000 }));
    expect(next.initialBalance).toBe(5000);
    expect(next.balance).toBe(5000 + 200);
  });

  it('≤0 → no-op', () => {
    const s = state();
    const next = reducer(s, TradingActions.setInitialBalance({ balance: 0 }));
    expect(next).toBe(s);
    const neg = reducer(s, TradingActions.setInitialBalance({ balance: -100 }));
    expect(neg).toBe(s);
  });
});

describe('trading reducer: setRiskPct', () => {
  it('sets riskPct', () => {
    const s = state();
    const next = reducer(s, TradingActions.setRiskPct({ riskPct: 2 }));
    expect(next.riskPct).toBe(2);
  });

  it('≤0 → no-op', () => {
    const s = state();
    const next = reducer(s, TradingActions.setRiskPct({ riskPct: 0 }));
    expect(next).toBe(s);
  });
});

describe('trading reducer: setSessionEnd', () => {
  it('sets the scheduled end time', () => {
    const s = state();
    const next = reducer(s, TradingActions.setSessionEnd({ time: 7200 }));
    expect(next.sessionEnd).toBe(7200);
  });

  it('clears the scheduled end time when null', () => {
    const s = state({ sessionEnd: 7200 });
    const next = reducer(s, TradingActions.setSessionEnd({ time: null }));
    expect(next.sessionEnd).toBeNull();
  });
});

describe('trading reducer: openSummary / closeSummary', () => {
  it('openSummary sets summaryOpen true', () => {
    const s = state({ summaryOpen: false });
    expect(reducer(s, TradingActions.openSummary()).summaryOpen).toBe(true);
  });

  it('closeSummary sets summaryOpen false', () => {
    const s = state({ summaryOpen: true });
    expect(reducer(s, TradingActions.closeSummary()).summaryOpen).toBe(false);
  });
});

describe('trading reducer: switchSession', () => {
  it('with activity present archives the outgoing and restores target trading', () => {
    const savedTrade = closed({ id: 'tc1' });
    const saved = {
      id: 's1',
      name: 'Target',
      createdAt: 1,
      currentTime: 500,
      trading: { ...defaultTradingData(), sessionName: 'Target', history: [savedTrade] },
    };
    const activeTrade = closed({ id: 'ta1' });
    const s = state({ history: [activeTrade], savedSessions: [saved] });
    const next = reducer(s, TradingActions.switchSession({ id: 's1', currentCursor: 999 }));
    expect(next.sessionName).toBe('Target');
    expect(next.history[0].id).toBe('tc1');
    // outgoing archived (had activity)
    const archived = next.savedSessions.find((ss) => ss.name !== 'Target');
    expect(archived).toBeDefined();
    // target removed from saved list
    expect(next.savedSessions.find((ss) => ss.id === 's1')).toBeUndefined();
  });

  it('unknown id → unchanged', () => {
    const s = state({ savedSessions: [] });
    const next = reducer(s, TradingActions.switchSession({ id: 'nope', currentCursor: 0 }));
    expect(next).toBe(s);
  });
});

describe('trading reducer: deleteSession', () => {
  it('removes the session by id', () => {
    const saved = {
      id: 's1',
      name: 'Old',
      createdAt: 1,
      currentTime: 0,
      trading: defaultTradingData(),
    };
    const s = state({ savedSessions: [saved] });
    const next = reducer(s, TradingActions.deleteSession({ id: 's1' }));
    expect(next.savedSessions).toHaveLength(0);
  });
});

describe('trading reducer: sessionImported', () => {
  it('sets history, adjusts balance, sessionEnded+summaryOpen true, name Importada·date', () => {
    const trades = [
      closed({ id: 't1', profit: 200, closeTime: 1700000000 }),
      closed({ id: 't2', profit: -50, closeTime: 1700086400 }),
    ];
    const s = state();
    const next = reducer(s, TradingActions.sessionImported({ trades, currentCursor: 0 }));
    expect(next.history).toHaveLength(2);
    expect(next.balance).toBeCloseTo(s.initialBalance + 200 - 50, 6);
    expect(next.sessionEnded).toBe(true);
    expect(next.summaryOpen).toBe(true);
    expect(next.sessionName).toMatch(/^Importada ·/);
  });

  it('archives prior active session if it has activity', () => {
    const activeTrade = closed({ id: 'ta' });
    const s = state({ history: [activeTrade] });
    const trades = [closed({ id: 'ti', profit: 100, closeTime: 1700000000 })];
    const next = reducer(s, TradingActions.sessionImported({ trades, currentCursor: 0 }));
    expect(next.savedSessions.length).toBeGreaterThan(0);
  });
});

describe('trading reducer: workspaceRestored', () => {
  it('applies defaults-first merge of workspace.trading', () => {
    const ws = workspace({
      trading: { ...defaultTradingData(), riskPct: 3, sessionName: 'Test' },
      sessions: [],
    });
    const next = reducer(state(), WorkspacesActions.workspaceRestored({ workspace: ws }));
    expect(next.riskPct).toBe(3);
    expect(next.sessionName).toBe('Test');
    expect(next.summaryOpen).toBe(false);
  });

  it('savedSessions from workspace.sessions', () => {
    const saved = {
      id: 's1',
      name: 'Sesión anterior',
      createdAt: 1,
      currentTime: 0,
      trading: defaultTradingData(),
    };
    const ws = workspace({ sessions: [saved] });
    const next = reducer(state(), WorkspacesActions.workspaceRestored({ workspace: ws }));
    expect(next.savedSessions).toHaveLength(1);
    expect(next.savedSessions[0].name).toBe('Sesión anterior');
  });

  it('defaults savedSessions to [] when workspace.sessions is undefined', () => {
    const ws = { symbol: 'XAUUSD', trading: defaultTradingData() } as unknown as Workspace;
    const next = reducer(state(), WorkspacesActions.workspaceRestored({ workspace: ws }));
    expect(next.savedSessions).toEqual([]);
  });
});
