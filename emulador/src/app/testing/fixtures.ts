import { Candle } from '../models';
import {
  ClosedTrade,
  PendingOrder,
  Position,
  SavedSession,
  TradingState,
  defaultTradingData,
} from '../state/trading/trading.models';
import { Workspace, WorkspaceMeta } from '../state/workspaces/workspaces.models';

// ---- candles ----
export function candle(time: number, open = 100, high = 101, low = 99, close = 100): Candle {
  return { time, open, high, low, close };
}

/** `n` candles starting at `start`, spaced `step` seconds (default 3600 = H1). */
export function series(n: number, start = 0, step = 3600, price = 100): Candle[] {
  return Array.from({ length: n }, (_, i) =>
    candle(start + i * step, price, price + 1, price - 1, price),
  );
}

// ---- trading entities (mirror the existing reducer.spec builders) ----
export function order(p: Partial<PendingOrder> = {}): PendingOrder {
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
    ...p,
  };
}

export function position(p: Partial<Position> = {}): Position {
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
    ...p,
  };
}

export function closed(p: Partial<ClosedTrade> = {}): ClosedTrade {
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
    ...p,
  };
}

export function tradingState(p: Partial<TradingState> = {}): TradingState {
  return {
    ...defaultTradingData(),
    summaryOpen: false,
    savedSessions: [],
    activeSessionId: null,
    ...p,
  };
}

export function savedSession(p: Partial<SavedSession> = {}): SavedSession {
  return {
    id: 's1',
    name: 'Sesión',
    createdAt: 1,
    currentTime: 0,
    trading: defaultTradingData(),
    ...p,
  };
}

// ---- workspaces ----
export function workspace(p: Partial<Workspace> = {}): Workspace {
  return {
    symbol: 'XAUUSD',
    series: {},
    files: {},
    activeTf: null,
    currentTime: 0,
    drawings: [],
    trading: defaultTradingData(),
    sessions: [],
    lastModified: 1,
    ...p,
  };
}

export function workspaceMeta(p: Partial<WorkspaceMeta> = {}): WorkspaceMeta {
  const ws = workspace(p as Partial<Workspace>);
  return {
    symbol: ws.symbol,
    files: ws.files,
    activeTf: ws.activeTf,
    currentTime: ws.currentTime,
    drawings: ws.drawings,
    trading: ws.trading,
    sessions: ws.sessions,
    lastModified: ws.lastModified,
    activeSessionId: p.activeSessionId,
    activeClientUpdatedAt: p.activeClientUpdatedAt,
    activeSyncedAt: p.activeSyncedAt,
  };
}
