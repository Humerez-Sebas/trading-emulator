import { createFeature, createReducer, on } from '@ngrx/store';
import { Candle, Timeframe } from '../../models';
import { MarketActions } from './market.actions';
import { WorkspacesActions } from '../workspaces/workspaces.actions';

export interface MarketState {
  /** Candles per loaded timeframe. */
  series: Partial<Record<Timeframe, Candle[]>>;
  /** File name per timeframe (informational). */
  files: Partial<Record<Timeframe, string>>;
  /** Timeframe currently active on the chart. */
  activeTf: Timeframe | null;
  /**
   * TFs this session is scoped to (wizard selection). null = legacy/no scope
   * → the toolbar shows every loaded TF. Series are shared per symbol, so this
   * is what keeps unselected TFs out of the session's toolbar.
   */
  selectedTfs: Timeframe[] | null;
  /**
   * Active CUSTOM timeframe in minutes (e.g. 45, 90), or null when a standard
   * `activeTf` is shown. When set, the chart renders {@link customSeries}
   * (generated in memory from the loaded anchors) instead of `series[activeTf]`.
   */
  customTf: number | null;
  /** Generated candles for the active custom timeframe (empty until generated). */
  customSeries: Candle[];
}

const initialState: MarketState = {
  series: {},
  files: {},
  activeTf: null,
  selectedTfs: null,
  customTf: null,
  customSeries: [],
};

export const marketFeature = createFeature({
  name: 'market',
  reducer: createReducer(
    initialState,
    on(
      MarketActions.csvLoaded,
      (state, { tf, candles, fileName }): MarketState => ({
        ...state,
        series: { ...state.series, [tf]: candles },
        files: { ...state.files, [tf]: fileName },
        // the first loaded series becomes active automatically
        activeTf: state.activeTf ?? tf,
      }),
    ),
    on(
      MarketActions.changeTimeframe,
      // switching to a standard TF clears any active custom timeframe
      (state, { tf }): MarketState =>
        state.series[tf] ? { ...state, activeTf: tf, customTf: null, customSeries: [] } : state,
    ),
    on(
      MarketActions.changeCustomTimeframe,
      (state, { minutes }): MarketState => ({ ...state, customTf: minutes, customSeries: [] }),
    ),
    on(
      MarketActions.customTimeframeGenerated,
      // ignore a stale reply if the user already changed the timeframe again
      (state, { minutes, candles }): MarketState =>
        state.customTf === minutes ? { ...state, customSeries: candles } : state,
    ),
    // asset switch: replace the whole market state with the restored workspace
    on(
      WorkspacesActions.workspaceRestored,
      (_state, { workspace }): MarketState => ({
        series: workspace.series,
        files: workspace.files,
        activeTf: workspace.activeTf,
        selectedTfs: workspace.selectedTfs ?? null,
        customTf: null,
        customSeries: [],
      }),
    ),
  ),
});
