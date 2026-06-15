import { createActionGroup, props } from '@ngrx/store';
import { Candle, Timeframe } from '../../models';
import { ClosedTrade } from '../trading/trading.models';
import { AssetMeta, Workspace } from './workspaces.models';

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
