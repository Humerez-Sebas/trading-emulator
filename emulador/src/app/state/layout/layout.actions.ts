import { createActionGroup, props } from '@ngrx/store';
import { GridTemplate, PanelDescriptor, WorkspaceLayout } from './layout.models';
import { Timeframe } from '../../models';

export const LayoutActions = createActionGroup({
  source: 'Layout',
  events: {
    /** Appends a tab (template '1', one empty cell) and activates it. Ids come from the caller (reducer stays pure). */
    'Create Tab': props<{ id: string; name: string }>(),
    /** Removes the tab and its panels' descriptors. Closing the last remaining tab is a no-op. */
    'Close Tab': props<{ tabId: string }>(),
    'Set Active Tab': props<{ tabId: string }>(),
    /** Renames a tab in place. No-op if tabId is unknown. */
    'Rename Tab': props<{ tabId: string; name: string }>(),
    /** Resizes the tab's cells to the template; panels of removed cells merge into the last kept cell. */
    'Apply Grid Template': props<{ tabId: string; template: GridTemplate }>(),
    /** No-op if the tab already holds MAX_PANELS_PER_TAB panels or cellIndex is out of range. */
    'Add Panel': props<{ tabId: string; cellIndex: number; descriptor: PanelDescriptor }>(),
    'Remove Panel': props<{ panelId: string }>(),
    /** No-op unless the cell actually contains panelId. */
    'Set Active Panel': props<{ tabId: string; cellIndex: number; panelId: string }>(),
    /** Relocates an existing panel to (targetTabId, targetCellIndex). No-op if it would exceed MAX_PANELS_PER_TAB in the target tab. */
    'Move Panel': props<{ panelId: string; targetTabId: string; targetCellIndex: number }>(),
    /** Assigns/clears the panel's link group. Reducer transports only; sync semantics are RFC-010's ChartSyncRouter. No-op if panelId is unknown. */
    'Set Panel Link Group': props<{ panelId: string; linkGroupId: string | null }>(),
    /** Updates one panel's timeframe (descriptor-only; the mapper re-derives the view). No-op if panelId is unknown. */
    'Set Panel Timeframe': props<{ panelId: string; timeframe: Timeframe }>(),
    /** Focuses a specific panel to sync timeframe modifications and keyboard shortcuts. */
    'Set Focused Panel': props<{ panelId: string }>(),
    /** Wholesale-replaces workspace + panels from a restored session (RFC-011). */
    'Restore Layout': props<{ layout: WorkspaceLayout; panels: Record<string, PanelDescriptor> }>(),
  },
});
