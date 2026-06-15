import { createFeature, createReducer, on } from '@ngrx/store';
import { WorkspacesActions } from './workspaces.actions';
import { AssetMeta } from './workspaces.models';

export interface WorkspacesState {
  /** Symbol of the active asset (null until something is loaded). */
  current: string | null;
  /** Known assets (registry shown in the toolbar selector). */
  assets: AssetMeta[];
}

const initialState: WorkspacesState = {
  current: null,
  assets: [],
};

function upsert(assets: AssetMeta[], symbol: string): AssetMeta[] {
  const now = Date.now();
  const rest = assets.filter((a) => a.symbol !== symbol);
  return [...rest, { symbol, lastModified: now }].sort((a, b) => a.symbol.localeCompare(b.symbol));
}

export const workspacesFeature = createFeature({
  name: 'workspaces',
  reducer: createReducer(
    initialState,
    on(
      WorkspacesActions.assetsLoaded,
      (state, { assets, current }): WorkspacesState => ({ ...state, assets, current }),
    ),
    on(
      WorkspacesActions.workspaceRestored,
      (state, { workspace }): WorkspacesState => ({
        current: workspace.symbol,
        assets: upsert(state.assets, workspace.symbol),
      }),
    ),
  ),
});
