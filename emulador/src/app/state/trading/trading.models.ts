export type OrderSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit' | 'stop';
export type PendingType = Exclude<OrderType, 'market'>;

/** How a closed trade ended. */
export type TradeOutcome = 'tp' | 'sl' | 'manual' | 'session-end';

/** A limit/stop order waiting to be filled. */
export interface PendingOrder {
  id: string;
  side: OrderSide;
  type: PendingType;
  entryPrice: number;
  sl: number;
  /** null = no take profit. */
  tp: number | null;
  lots: number;
  riskPct: number;
  /** Risk in account currency at placement time (defines 1R). */
  riskUsd: number;
  /** Candle time (UTC seconds) when the order was placed. */
  createdAt: number;
}

/** An open position. */
export interface Position {
  id: string;
  side: OrderSide;
  entryPrice: number;
  sl: number;
  tp: number | null;
  lots: number;
  riskPct: number;
  /** Risk in account currency at placement time (defines 1R). */
  riskUsd: number;
  /** Candle time (UTC seconds) when the position was opened. */
  openTime: number;
  /** Order type that originated the position. */
  origin: OrderType;
}

/** A finished trade, kept in the session history. */
export interface ClosedTrade {
  id: string;
  side: OrderSide;
  origin: OrderType;
  entryPrice: number;
  exitPrice: number;
  sl: number;
  tp: number | null;
  lots: number;
  riskPct: number;
  riskUsd: number;
  openTime: number;
  closeTime: number;
  outcome: TradeOutcome;
  /** Profit in account currency (clean price, no spread/commission). */
  profit: number;
  /** Profit measured in R (profit / riskUsd). */
  rMultiple: number;
  /**
   * SL and TP were both inside the same candle and no lower-TF series was
   * available to disambiguate: resolved pessimistically (SL first).
   */
  ambiguous: boolean;
  /** The historical trade box is hidden on the chart (user toggle). */
  boxHidden?: boolean;
  /** The historical trade box was deleted from the chart (irreversible). */
  boxDeleted?: boolean;
}

/**
 * Trading data that belongs to one asset's workspace (persisted with it).
 * The transient UI flags (summary modal) live only in TradingState.
 */
export interface TradingData {
  /** Realized balance (initialBalance + sum of closed profits). */
  balance: number;
  initialBalance: number;
  orders: PendingOrder[];
  positions: Position[];
  history: ClosedTrade[];
  /** Last candle time already evaluated by the fill engine. */
  lastProcessedTime: number;
  /** The session was ended (data ran out or the user ended it). */
  sessionEnded: boolean;
  /** Default risk % per trade (shared by the panel and the context menu). */
  riskPct: number;
  /**
   * Scheduled session end (UTC seconds): reaching this time during the
   * replay pauses and ends the session automatically. null = manual only.
   */
  sessionEnd: number | null;
  /** Name the session keeps across archive/restore (null = auto-named). */
  sessionName: string | null;
  /** Folder the session belongs to (null = "Sin carpeta"). Org-only. */
  folderId: string | null;
}

/**
 * A user-defined folder to group sessions by strategy (cross-asset). Stored
 * globally in IndexedDB (not per-workspace); sessions reference it by id.
 * Flat (no nesting) by design.
 */
export interface SessionFolder {
  id: string;
  name: string;
  /** Manual sort order in the sidebar/list. */
  order: number;
  /** LWW edit time, epoch ms (spec §10). Absent until first synced. */
  clientUpdatedAt?: number;
  /** Last successful push, epoch ms. dirty ⇔ clientUpdatedAt > (syncedAt ?? 0). */
  syncedAt?: number;
}

/**
 * An archived backtesting session of the workspace: the full trading data
 * plus the replay cursor at the moment it was put aside. Lightweight (no
 * candles), so any number of them can live in the workspace meta record.
 */
export interface SavedSession {
  id: string;
  name: string;
  createdAt: number;
  /** Replay cursor (UTC seconds) to restore when reopening the session. */
  currentTime: number;
  trading: TradingData;
  /** LWW edit time, epoch ms (spec §10). Absent until first synced. */
  clientUpdatedAt?: number;
  /** Last successful push, epoch ms. dirty ⇔ clientUpdatedAt > (syncedAt ?? 0). */
  syncedAt?: number;
}

export interface TradingState extends TradingData {
  /** Whether the session summary modal is visible (not persisted). */
  summaryOpen: boolean;
  /** Archived sessions of the current workspace. */
  savedSessions: SavedSession[];
  /**
   * Stable identity of the ACTIVE session (= its cloud row id once synced).
   * Carried through archive/switch/import transitions so an archived session
   * keeps the same id its cloud row has (no duplicate on the next pull). Lives
   * in state (not TradingData) — it is session identity, not persisted trading
   * data; it round-trips via the meta snapshot (WorkspaceMeta.activeSessionId).
   */
  activeSessionId: string | null;
}

/** The persistable TradingData subset of a larger object (e.g. the state). */
export function pickTradingData(t: TradingData): TradingData {
  return {
    balance: t.balance,
    initialBalance: t.initialBalance,
    orders: t.orders,
    positions: t.positions,
    history: t.history,
    lastProcessedTime: t.lastProcessedTime,
    sessionEnded: t.sessionEnded,
    riskPct: t.riskPct,
    sessionEnd: t.sessionEnd,
    sessionName: t.sessionName,
    folderId: t.folderId,
  };
}

export const DEFAULT_BALANCE = 10000;

export function defaultTradingData(initialBalance = DEFAULT_BALANCE): TradingData {
  return {
    balance: initialBalance,
    initialBalance,
    orders: [],
    positions: [],
    history: [],
    lastProcessedTime: 0,
    sessionEnded: false,
    riskPct: 1,
    sessionEnd: null,
    sessionName: null,
    folderId: null,
  };
}

/**
 * Contract size (units per 1.0 lot) by symbol: gold = 100 oz, silver =
 * 5000 oz, 6-letter forex pairs = 100,000. Anything else (US30, NAS100 and
 * other index CFDs) uses the broker-typical 1 $/point per lot — the old 100
 * fallback inflated index P/L and risk a hundredfold.
 */
export function contractSizeFor(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s.startsWith('XAU')) return 100;
  if (s.startsWith('XAG')) return 5000;
  if (/^[A-Z]{6}$/.test(s)) return 100000;
  return 1;
}

/**
 * Lot size so that hitting the SL loses `riskPct` % of the balance.
 * Rounded to the nearest 0.01 lot (broker step), minimum 0.01.
 */
export function lotsForRisk(
  balance: number,
  riskPct: number,
  entryPrice: number,
  sl: number,
  contractSize: number,
): number {
  const distance = Math.abs(entryPrice - sl);
  if (!(distance > 0) || !(balance > 0) || !(riskPct > 0)) return 0;
  const riskUsd = (balance * riskPct) / 100;
  const lossPerLot = distance * contractSize;
  const lots = riskUsd / lossPerLot;
  return Math.max(0.01, Math.round(lots * 100) / 100);
}
