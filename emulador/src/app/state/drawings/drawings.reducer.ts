import { createFeature, createReducer, on } from '@ngrx/store';
import { DrawingsActions } from './drawings.actions';
import { Drawing, DrawingsState } from './drawings.models';
import { ownerKeyOf } from './drawing-ownership';
import { WorkspacesActions } from '../workspaces/workspaces.actions';
import { LinkGroupsActions } from '../link-groups/link-groups.actions';

// Drawings live in the workspace records (IndexedDB v2) and arrive via
// `workspaceRestored`; the legacy `emulador.drawings` localStorage copy was
// removed in V2.6.
const initialState: DrawingsState = {
  entities: {},
  ownerIndex: {},
  selection: {},
  activeTool: 'none',
  nextZ: 0,
};

/**
 * Rebuilds `entities`/`ownerIndex`/`nextZ` from a flat drawing set — the one
 * sovereign every hydration path (import restore, workspace switch) funnels
 * through, so the map and its index can never disagree.
 */
function rebuildFromDrawings(
  drawings: readonly Drawing[],
): Pick<DrawingsState, 'entities' | 'ownerIndex' | 'nextZ'> {
  const entities: Record<string, Drawing> = {};
  const ownerIndex: Record<string, string[]> = {};
  let maxZ = -1;
  for (const d of drawings) {
    entities[d.id] = d;
    const key = ownerKeyOf(d.owner);
    (ownerIndex[key] ??= []).push(d.id);
    if (d.zIndex > maxZ) maxZ = d.zIndex;
  }
  return { entities, ownerIndex, nextZ: maxZ + 1 };
}

/** Nulls every selection slot pointing at `id`, leaving the others untouched. */
function clearSelectionsOf(
  selection: Record<string, string | null>,
  id: string,
): Record<string, string | null> {
  const next: Record<string, string | null> = {};
  for (const [panelId, selectedId] of Object.entries(selection)) {
    next[panelId] = selectedId === id ? null : selectedId;
  }
  return next;
}

export const drawingsFeature = createFeature({
  name: 'drawings',
  reducer: createReducer(
    initialState,
    on(DrawingsActions.pickTool, (state, { tool }): DrawingsState => ({ ...state, activeTool: tool })),

    on(DrawingsActions.addDrawing, (state, { panelId, drawing }): DrawingsState => {
      const stamped: Drawing = { ...drawing, zIndex: state.nextZ };
      const key = ownerKeyOf(stamped.owner);
      return {
        ...state,
        entities: { ...state.entities, [stamped.id]: stamped },
        ownerIndex: { ...state.ownerIndex, [key]: [...(state.ownerIndex[key] ?? []), stamped.id] },
        nextZ: state.nextZ + 1,
        selection: { ...state.selection, [panelId]: stamped.id },
        activeTool: 'none',
      };
    }),

    on(DrawingsActions.moveDrawing, (state, { id, p1, p2 }): DrawingsState => {
      const existing = state.entities[id];
      if (!existing || existing.locked) return state; // I-14 rejection: identity return
      return { ...state, entities: { ...state.entities, [id]: { ...existing, p1, p2 } } };
    }),

    on(DrawingsActions.selectDrawing, (state, { panelId, id }): DrawingsState => {
      if (id == null) {
        return { ...state, selection: { ...state.selection, [panelId]: null } };
      }
      // one drawing -> at most one selecting panel: steal it from every other slot first
      const selection = clearSelectionsOf(state.selection, id);
      selection[panelId] = id;
      return { ...state, selection };
    }),

    on(DrawingsActions.deleteSelected, (state, { panelId }): DrawingsState => {
      const id = state.selection[panelId];
      if (!id) return state;
      const existing = state.entities[id];
      if (!existing || existing.locked) return state; // stale or locked selection: identity return
      const entities = { ...state.entities };
      delete entities[id];
      const key = ownerKeyOf(existing.owner);
      const ownerIndex = {
        ...state.ownerIndex,
        [key]: (state.ownerIndex[key] ?? []).filter((existingId) => existingId !== id),
      };
      return { ...state, entities, ownerIndex, selection: clearSelectionsOf(state.selection, id) };
    }),

    on(DrawingsActions.setDrawingLocked, (state, { id, locked }): DrawingsState => {
      const existing = state.entities[id];
      if (!existing) return state;
      return { ...state, entities: { ...state.entities, [id]: { ...existing, locked } } };
    }),

    on(DrawingsActions.setDrawingVisible, (state, { id, visible }): DrawingsState => {
      const existing = state.entities[id];
      if (!existing) return state;
      return { ...state, entities: { ...state.entities, [id]: { ...existing, visible } } };
    }),

    on(
      DrawingsActions.restoreDrawings,
      (state, { drawings }): DrawingsState => ({
        ...state,
        ...rebuildFromDrawings(drawings),
        selection: {},
        activeTool: 'none',
      }),
    ),

    // asset switch: each session hydrates its full drawing set in one shot
    on(
      WorkspacesActions.workspaceRestored,
      (state, { workspace }): DrawingsState => ({
        ...state,
        ...rebuildFromDrawings(workspace.drawings),
        selection: {},
        activeTool: 'none',
      }),
    ),

    // a group's namespace dies with it: its owned drawings go too, never reassigned
    on(LinkGroupsActions.removeGroup, (state, { groupId }): DrawingsState => {
      const key = ownerKeyOf({ type: 'group', id: groupId });
      const ids = state.ownerIndex[key];
      if (ids === undefined) return state; // nothing owned by this group: identity return
      const idSet = new Set(ids);
      const entities = { ...state.entities };
      for (const id of ids) delete entities[id];
      const ownerIndex = { ...state.ownerIndex };
      delete ownerIndex[key];
      const selection: Record<string, string | null> = {};
      for (const [panelId, selectedId] of Object.entries(state.selection)) {
        selection[panelId] = selectedId != null && idSet.has(selectedId) ? null : selectedId;
      }
      return { ...state, entities, ownerIndex, selection };
    }),
  ),
});
