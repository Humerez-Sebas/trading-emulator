import { Candle, Timeframe } from '../../models';
import { Drawing } from '../drawings/drawings.models';
import { defaultTradingData, SavedSession, TradingData } from '../trading/trading.models';

/** Lightweight entry for the asset registry shown in the UI. */
export interface AssetMeta {
  symbol: string;
  lastModified: number;
}

/**
 * Everything that belongs to one asset's session: its candle series per
 * timeframe, the active timeframe, the replay cursor and its drawings.
 * Stored as a whole in IndexedDB, keyed by symbol.
 */
export interface Workspace {
  symbol: string;
  series: Partial<Record<Timeframe, Candle[]>>;
  files: Partial<Record<Timeframe, string>>;
  activeTf: Timeframe | null;
  currentTime: number;
  drawings: Drawing[];
  /**
   * TFs this session was created with (wizard selection). Scopes the TF
   * toolbar so unselected TFs of the shared per-symbol series don't appear.
   * Optional/absent = legacy session → show every loaded TF.
   */
  selectedTfs?: Timeframe[];
  /** Optional because workspaces saved before V2 do not have it. */
  trading?: TradingData;
  /** Archived backtesting sessions (optional pre-V2.2). */
  sessions?: SavedSession[];
  lastModified: number;
  /**
   * Stable id of the active session (= its cloud row id once synced). D4.
   * Carried by the NgRx meta snapshot (TradingState owns it), so it may be
   * explicitly `null` (a workspace whose active session has no id yet).
   */
  activeSessionId?: string | null;
  /** Active session LWW edit time, epoch ms (spec §10). */
  activeClientUpdatedAt?: number;
  /** Active session last successful push, epoch ms (spec §10). dirty ⇔ activeClientUpdatedAt > (activeSyncedAt ?? 0). */
  activeSyncedAt?: number;
}

/**
 * Light part of a workspace (everything except the candle series). Persisted
 * separately and frequently; the heavy series are only written when a CSV is
 * loaded, so replay progress never re-serializes megabytes of candles.
 */
export type WorkspaceMeta = Omit<Workspace, 'series'>;

export function emptyWorkspace(symbol: string): Workspace {
  return {
    symbol,
    series: {},
    files: {},
    activeTf: null,
    currentTime: 0,
    drawings: [],
    trading: defaultTradingData(),
    sessions: [],
    lastModified: Date.now(),
  };
}
