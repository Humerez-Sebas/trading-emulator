import { createActionGroup, props } from '@ngrx/store';
import { GridTemplate, PanelDescriptor } from './layout.models';

export const LayoutActions = createActionGroup({
  source: 'Layout',
  events: {
    /** Appends a tab (template '1', one empty cell) and activates it. Ids come from the caller (reducer stays pure). */
    'Create Tab': props<{ id: string; name: string }>(),
    /** Removes the tab and its panels' descriptors. Closing the last remaining tab is a no-op. */
    'Close Tab': props<{ tabId: string }>(),
    'Set Active Tab': props<{ tabId: string }>(),
    /** Resizes the tab's cells to the template; panels of removed cells merge into the last kept cell. */
    'Apply Grid Template': props<{ tabId: string; template: GridTemplate }>(),
    /** No-op if the tab already holds MAX_PANELS_PER_TAB panels or cellIndex is out of range. */
    'Add Panel': props<{ tabId: string; cellIndex: number; descriptor: PanelDescriptor }>(),
    'Remove Panel': props<{ panelId: string }>(),
    /** No-op unless the cell actually contains panelId. */
    'Set Active Panel': props<{ tabId: string; cellIndex: number; panelId: string }>(),
  },
});
