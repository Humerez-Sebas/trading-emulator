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
