import { createFeature, createReducer, on } from '@ngrx/store';
import { DrawingsActions } from './drawings.actions';
import { DrawingsState } from './drawings.models';
import { WorkspacesActions } from '../workspaces/workspaces.actions';

// Drawings live in the workspace records (IndexedDB v2) and arrive via
// `workspaceRestored`; the legacy `emulador.drawings` localStorage copy was
// removed in V2.6.
const initialState: DrawingsState = {
  items: [],
  activeTool: 'none',
  selectedId: null,
};

export const drawingsFeature = createFeature({
  name: 'drawings',
  reducer: createReducer(
    initialState,
    on(
      DrawingsActions.pickTool,
      (state, { tool }): DrawingsState => ({ ...state, activeTool: tool, selectedId: null }),
    ),
    on(
      DrawingsActions.addDrawing,
      (state, { drawing }): DrawingsState => ({
        ...state,
        items: [...state.items, drawing],
        activeTool: 'none',
        selectedId: drawing.id,
      }),
    ),
    on(
      DrawingsActions.moveDrawing,
      (state, { id, p1, p2 }): DrawingsState => ({
        ...state,
        items: state.items.map((d) => (d.id === id ? { ...d, p1, p2 } : d)),
      }),
    ),
    on(
      DrawingsActions.selectDrawing,
      (state, { id }): DrawingsState => ({ ...state, selectedId: id }),
    ),
    on(
      DrawingsActions.deleteSelected,
      (state): DrawingsState => ({
        ...state,
        items: state.items.filter((d) => d.id !== state.selectedId),
        selectedId: null,
      }),
    ),
    on(
      DrawingsActions.clearDrawings,
      (state): DrawingsState => ({ ...state, items: [], selectedId: null }),
    ),
    // asset switch: each asset has its own independent drawings
    on(
      WorkspacesActions.workspaceRestored,
      (state, { workspace }): DrawingsState => ({
        ...state,
        items: workspace.drawings,
        selectedId: null,
        activeTool: 'none',
      }),
    ),
  ),
});
