import { createFeature, createReducer, on } from '@ngrx/store';
import { DrawingsActions } from './drawings.actions';
import { Drawing, DrawingCommand, DrawingsState, HISTORY_LIMIT, PanelHistory } from './drawings.models';
import { ownerKeyOf } from './drawing-ownership';
import { WorkspacesActions } from '../workspaces/workspaces.actions';
import { LinkGroupsActions } from '../link-groups/link-groups.actions';
import { LayoutActions } from '../layout/layout.actions';

// Drawings live in the workspace records (IndexedDB v2) and arrive via
// `workspaceRestored`; the legacy `emulador.drawings` localStorage copy was
// removed in V2.6.
const initialState: DrawingsState = {
  entities: {},
  ownerIndex: {},
  selection: {},
  activeTool: 'none',
  nextZ: 0,
  revisions: {},
  history: {},
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

/**
 * Nulls every selection slot whose selected drawing id is in `ids`, leaving
 * the rest untouched. Returns `null` (not a new object) when nothing actually
 * changed, so the caller can identity-return.
 */
function clearSelectionsAmong(
  selection: Record<string, string | null>,
  ids: ReadonlySet<string>,
): Record<string, string | null> | null {
  let changed = false;
  const next: Record<string, string | null> = {};
  for (const [panelId, selectedId] of Object.entries(selection)) {
    if (selectedId != null && ids.has(selectedId)) {
      next[panelId] = null;
      changed = true;
    } else {
      next[panelId] = selectedId;
    }
  }
  return changed ? next : null;
}

/** Bumps a drawing's revision counter (absent -> starts at 1). */
function bumpRevision(revisions: Record<string, number>, id: string): Record<string, number> {
  return { ...revisions, [id]: (revisions[id] ?? 0) + 1 };
}

/** Discards the oldest entries once a command stack exceeds `HISTORY_LIMIT`. */
function capped(commands: readonly DrawingCommand[]): DrawingCommand[] {
  return commands.length > HISTORY_LIMIT
    ? commands.slice(commands.length - HISTORY_LIMIT)
    : [...commands];
}

/**
 * Records a freshly-applied panel-authored command: pushes it onto that
 * panel's undo stack (capped), and clears the panel's redo stack (a new
 * command invalidates whatever could have been redone).
 */
function pushCommand(
  history: Record<string, PanelHistory>,
  panelId: string,
  command: DrawingCommand,
): Record<string, PanelHistory> {
  const hist = history[panelId] ?? { undo: [], redo: [] };
  return { ...history, [panelId]: { undo: capped([...hist.undo, command]), redo: [] } };
}

type InverseOutcome = 'stale' | 'locked' | { state: DrawingsState; mirrored: DrawingCommand };

/**
 * Computes the effect of inverting one recorded command against the CURRENT
 * state: stale when another mutation touched the drawing since (revision
 * mismatch, or the entity is absent when the inverse needs it present),
 * locked when the live entity blocks it, or the applied result plus the
 * mirrored command to push onto the other stack (undo <-> redo). Used
 * identically by both `undo` and `redo` — redo's "inverse" of a mirrored
 * command reproduces the original forward mutation.
 */
function applyInverse(state: DrawingsState, command: DrawingCommand): InverseOutcome {
  if ((state.revisions[command.drawingId] ?? 0) !== command.resultRev) return 'stale';
  const existing = state.entities[command.drawingId];

  if (command.kind === 'add') {
    // inverse: delete the entity that was added — it must still be there.
    if (!existing) return 'stale';
    if (existing.locked) return 'locked';
    const entities = { ...state.entities };
    delete entities[command.drawingId];
    const key = ownerKeyOf(existing.owner);
    const ownerIndex = {
      ...state.ownerIndex,
      [key]: (state.ownerIndex[key] ?? []).filter((id) => id !== command.drawingId),
    };
    const selection = clearSelectionsOf(state.selection, command.drawingId);
    const revisions = bumpRevision(state.revisions, command.drawingId);
    const mirrored: DrawingCommand = {
      kind: 'delete',
      drawingId: command.drawingId,
      before: existing,
      after: null,
      resultRev: revisions[command.drawingId],
    };
    return { state: { ...state, entities, ownerIndex, selection, revisions }, mirrored };
  }

  if (command.kind === 'move') {
    // inverse: restore `before` geometry onto the still-existing entity.
    if (!existing) return 'stale';
    if (existing.locked) return 'locked';
    const restored = command.before!;
    const entities = { ...state.entities, [command.drawingId]: restored };
    const revisions = bumpRevision(state.revisions, command.drawingId);
    const mirrored: DrawingCommand = {
      kind: 'move',
      drawingId: command.drawingId,
      before: existing,
      after: restored,
      resultRev: revisions[command.drawingId],
    };
    return { state: { ...state, entities, revisions }, mirrored };
  }

  // kind === 'delete': inverse recreates `before` — the entity is normally
  // absent here (that IS the applies case); owner is restored verbatim.
  if (existing?.locked) return 'locked';
  const restored = command.before!;
  const key = ownerKeyOf(restored.owner);
  const entities = { ...state.entities, [command.drawingId]: restored };
  const ownerIndex = {
    ...state.ownerIndex,
    [key]: [...(state.ownerIndex[key] ?? []), command.drawingId],
  };
  const revisions = bumpRevision(state.revisions, command.drawingId);
  const mirrored: DrawingCommand = {
    kind: 'add',
    drawingId: command.drawingId,
    before: null,
    after: restored,
    resultRev: revisions[command.drawingId],
  };
  return { state: { ...state, entities, ownerIndex, revisions }, mirrored };
}

/**
 * Shared undo/redo mechanics (§5): pop the panel's `popFrom` stack, dropping
 * stale entries and continuing to the next older one, until a command
 * applies, one is blocked by a lock (retained, popping stops), or the stack
 * empties. An applied command pushes its mirror onto `pushTo`.
 */
function popAndApply(
  state: DrawingsState,
  panelId: string,
  popFrom: 'undo' | 'redo',
): DrawingsState {
  const pushTo: 'undo' | 'redo' = popFrom === 'undo' ? 'redo' : 'undo';
  const hist = state.history[panelId] ?? { undo: [], redo: [] };
  let working = hist[popFrom];
  if (working.length === 0) return state; // nothing to do: identity return

  let droppedAny = false;

  while (working.length > 0) {
    const command = working[working.length - 1];
    const outcome = applyInverse(state, command);

    if (outcome === 'stale') {
      working = working.slice(0, -1); // drop it, continue to the next older command
      droppedAny = true;
      continue;
    }

    if (outcome === 'locked') {
      if (!droppedAny) return state; // nothing changed at all: pure identity return
      const nextHist: PanelHistory = { ...hist, [popFrom]: working }; // command retained on top
      return { ...state, history: { ...state.history, [panelId]: nextHist } };
    }

    // applies: consume it, push the mirrored command onto the other stack
    const remaining = working.slice(0, -1);
    const otherStack = capped([...(hist[pushTo] ?? []), outcome.mirrored]);
    const nextHist: PanelHistory = { ...hist, [popFrom]: remaining, [pushTo]: otherStack };
    return { ...outcome.state, history: { ...outcome.state.history, [panelId]: nextHist } };
  }

  // every candidate was stale: stack fully drained, nothing applied
  const nextHist: PanelHistory = { ...hist, [popFrom]: working };
  return { ...state, history: { ...state.history, [panelId]: nextHist } };
}

/**
 * Cascade-deletes the given panels' OWN drawings (never group-owned ones):
 * drops every entity under each panel's owner key, the key itself, that
 * panel's own selection slot, and nulls any OTHER panel's selection that
 * pointed at one of the deleted ids. Identity return when none of the given
 * panels owned anything and none had a selection slot to drop — the shared
 * sovereign behind both `removePanel` and `purgePanelDrawings` below.
 */
function purgePanelIds(state: DrawingsState, panelIds: readonly string[]): DrawingsState {
  let changed = false;
  const entities = { ...state.entities };
  const ownerIndex = { ...state.ownerIndex };
  const selection = { ...state.selection };
  const history = { ...state.history };
  const deletedIds = new Set<string>();

  for (const panelId of panelIds) {
    const key = ownerKeyOf({ type: 'panel', id: panelId });
    const ids = ownerIndex[key];
    if (ids !== undefined) {
      changed = true;
      for (const id of ids) {
        delete entities[id];
        deletedIds.add(id);
      }
      delete ownerIndex[key];
    }
    if (panelId in selection) {
      changed = true;
      delete selection[panelId];
    }
    if (panelId in history) {
      changed = true;
      delete history[panelId];
    }
  }
  if (!changed) return state;

  for (const [pid, selectedId] of Object.entries(selection)) {
    if (selectedId != null && deletedIds.has(selectedId)) selection[pid] = null;
  }
  return { ...state, entities, ownerIndex, selection, history };
}

export const drawingsFeature = createFeature({
  name: 'drawings',
  reducer: createReducer(
    initialState,
    on(DrawingsActions.pickTool, (state, { tool }): DrawingsState => ({ ...state, activeTool: tool })),

    on(DrawingsActions.addDrawing, (state, { panelId, drawing }): DrawingsState => {
      const stamped: Drawing = { ...drawing, zIndex: state.nextZ };
      const key = ownerKeyOf(stamped.owner);
      const revisions = bumpRevision(state.revisions, stamped.id);
      const command: DrawingCommand = {
        kind: 'add',
        drawingId: stamped.id,
        before: null,
        after: stamped,
        resultRev: revisions[stamped.id],
      };
      return {
        ...state,
        entities: { ...state.entities, [stamped.id]: stamped },
        ownerIndex: { ...state.ownerIndex, [key]: [...(state.ownerIndex[key] ?? []), stamped.id] },
        nextZ: state.nextZ + 1,
        selection: { ...state.selection, [panelId]: stamped.id },
        activeTool: 'none',
        revisions,
        history: pushCommand(state.history, panelId, command),
      };
    }),

    on(DrawingsActions.moveDrawing, (state, { panelId, id, p1, p2 }): DrawingsState => {
      const existing = state.entities[id];
      if (!existing || existing.locked) return state; // absent or locked: identity return, never mutated
      const after: Drawing = { ...existing, p1, p2 };
      const revisions = bumpRevision(state.revisions, id);
      const command: DrawingCommand = {
        kind: 'move',
        drawingId: id,
        before: existing,
        after,
        resultRev: revisions[id],
      };
      return {
        ...state,
        entities: { ...state.entities, [id]: after },
        revisions,
        history: pushCommand(state.history, panelId, command),
      };
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
      const revisions = bumpRevision(state.revisions, id);
      const command: DrawingCommand = {
        kind: 'delete',
        drawingId: id,
        before: existing,
        after: null,
        resultRev: revisions[id],
      };
      return {
        ...state,
        entities,
        ownerIndex,
        selection: clearSelectionsOf(state.selection, id),
        revisions,
        history: pushCommand(state.history, panelId, command),
      };
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
        revisions: {},
        history: {},
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
        revisions: {},
        history: {},
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

    // disabling shared composition invalidates any selection of a now-invisible group drawing
    on(LinkGroupsActions.setSyncDrawings, (state, { groupId, enabled }): DrawingsState => {
      if (enabled) return state; // enabling never invalidates an existing selection
      const ids = state.ownerIndex[ownerKeyOf({ type: 'group', id: groupId })];
      if (!ids || !ids.length) return state;
      const selection = clearSelectionsAmong(state.selection, new Set(ids));
      return selection ? { ...state, selection } : state;
    }),

    // a panel losing/changing its link group may no longer compose its previously-selected shared drawing
    on(LayoutActions.setPanelLinkGroup, (state, { panelId }): DrawingsState => {
      const selectedId = state.selection[panelId];
      if (selectedId == null) return state;
      if (state.entities[selectedId]?.owner.type !== 'group') return state;
      return { ...state, selection: { ...state.selection, [panelId]: null } };
    }),

    // closing a panel cascade-deletes its own drawings (group-owned ones survive); see purgePanelIds
    on(LayoutActions.removePanel, (state, { panelId }): DrawingsState =>
      purgePanelIds(state, [panelId]),
    ),
    on(DrawingsActions.purgePanelDrawings, (state, { panelIds }): DrawingsState =>
      purgePanelIds(state, panelIds),
    ),

    on(DrawingsActions.undo, (state, { panelId }): DrawingsState =>
      popAndApply(state, panelId, 'undo'),
    ),
    on(DrawingsActions.redo, (state, { panelId }): DrawingsState =>
      popAndApply(state, panelId, 'redo'),
    ),
  ),
});
