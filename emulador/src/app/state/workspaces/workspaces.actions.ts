import { createActionGroup, props } from '@ngrx/store';
import { Candle, Timeframe } from '../../models';
import { ClosedTrade, TradingData } from '../trading/trading.models';
import { Drawing } from '../drawings/drawings.models';
import { AssetMeta, Workspace } from './workspaces.models';

/**
 * Full live-state restore payload carried by `switchAsset` for the
 * `.session.json` import (Task 9). Injected into the ordered action stream
 * right after the CSVs land in the new workspace, so the chart already has
 * candles when the trading/drawings/interval/speed state is restored.
 */
export interface PendingSessionRestore {
  trading: TradingData;
  drawings: Drawing[];
  /** Active interval in MINUTES (routed to a standard TF or a custom one). */
  intervalMinutes: number;
  /** Playback speed (ms per candle). */
  playbackSpeed: number;
}

export interface PendingCsv {
  tf: Timeframe;
  candles: Candle[];
  fileName: string;
}

/** Session trades parsed from a CSV, to import after the asset switch. */
export interface PendingSessionImport {
  trades: ClosedTrade[];
}

export const WorkspacesActions = createActionGroup({
  source: 'Workspaces',
  events: {
    /**
     * Snapshot the current asset, restore (or create) the target asset and
     * optionally load freshly parsed CSVs / import a session afterwards.
     */
    'Switch Asset': props<{
      symbol: string;
      /** TFs this session uses (wizard selection); scopes the TF toolbar. */
      selectedTfs?: Timeframe[];
      thenLoad?: PendingCsv[];
      thenImport?: PendingSessionImport;
      /**
       * Restore a full live session after the CSVs land (`.session.json`
       * import flow). Mutually exclusive with thenImport/thenNewSession/
       * thenOpenSession; the cursor is still carried by `thenGoTo`.
       */
      thenRestore?: PendingSessionRestore;
      /** Start a fresh trading session after the switch (wizard flow). */
      thenNewSession?: { name: string | null };
      /** Open this archived session after the switch (sessions page flow). */
      thenOpenSession?: string;
      /** Place the replay cursor here once the data is in (epoch seconds). */
      thenGoTo?: number;
      /** Schedule the session end after the switch (wizard flow). */
      thenSessionEnd?: number;
    }>(),
    /** A workspace became the active one (market/replay/drawings react). */
    'Workspace Restored': props<{ workspace: Workspace }>(),
    /** Registry loaded from IndexedDB at startup. */
    'Assets Loaded': props<{ assets: AssetMeta[]; current: string | null }>(),
  },
});
