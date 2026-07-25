import { createActionGroup, props } from '@ngrx/store';
import { Drawing, DrawingPoint, DrawingTool } from './drawings.models';

export const DrawingsActions = createActionGroup({
  source: 'Drawings',
  events: {
    'Pick Tool': props<{ tool: DrawingTool }>(),
    /** `drawing.owner` is pre-resolved by the dispatching panel; the reducer assigns the real zIndex. */
    'Add Drawing': props<{ panelId: string; drawing: Drawing }>(),
    /** Rejected (identity return) when the drawing is locked. */
    'Move Drawing': props<{ panelId: string; id: string; p1: DrawingPoint; p2: DrawingPoint }>(),
    /** Selecting a non-null id steals it from any other panel's selection. */
    'Select Drawing': props<{ panelId: string; id: string | null }>(),
    /** Acts on the panel's own selection only; rejected (no-op) when stale or locked. */
    'Delete Selected': props<{ panelId: string }>(),
    /** Metadata only, any panel; no index/selection change. */
    'Set Drawing Locked': props<{ id: string; locked: boolean }>(),
    'Set Drawing Visible': props<{ id: string; visible: boolean }>(),
    /**
     * Replaces ALL drawings with the provided set (the `.session.json` import
     * flow, and the "clear all" gesture via an empty array). Clears the
     * active tool and every panel's selection.
     */
    'Restore Drawings': props<{ drawings: Drawing[] }>(),
    /**
     * Cascade-deletes the given panels' OWN drawings only (group-owned ones
     * survive). The layout reducer's `closeTab` removes several panels'
     * descriptors in one action, which the drawings reducer cannot resolve
     * from a bare `tabId` — the dispatching component computes the panel ids
     * and fires this alongside `LayoutActions.closeTab`. A single-panel close
     * (`LayoutActions.removePanel`) is covered directly; this action exists
     * for the multi-panel tab-close case.
     */
    'Purge Panel Drawings': props<{ panelIds: string[] }>(),
    /** Pops that panel's undo stack; stale/locked guard decides whether it applies (see reducer). */
    'Undo': props<{ panelId: string }>(),
    /** Pops that panel's redo stack; symmetric with `undo`. */
    'Redo': props<{ panelId: string }>(),
  },
});
