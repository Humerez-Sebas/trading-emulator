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
}

const initialState: MarketState = {
  series: {},
  files: {},
  activeTf: null,
  selectedTfs: null,
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
      (state, { tf }): MarketState => (state.series[tf] ? { ...state, activeTf: tf } : state),
    ),
    // asset switch: replace the whole market state with the restored workspace
    on(
      WorkspacesActions.workspaceRestored,
      (_state, { workspace }): MarketState => ({
        series: workspace.series,
        files: workspace.files,
        activeTf: workspace.activeTf,
        selectedTfs: workspace.selectedTfs ?? null,
      }),
    ),
  ),
});
