import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { Drawing, DrawingPoint, DrawingTool } from './drawings.models';

export const DrawingsActions = createActionGroup({
  source: 'Drawings',
  events: {
    'Pick Tool': props<{ tool: DrawingTool }>(),
    'Add Drawing': props<{ drawing: Drawing }>(),
    'Move Drawing': props<{ id: string; p1: DrawingPoint; p2: DrawingPoint }>(),
    'Select Drawing': props<{ id: string | null }>(),
    'Delete Selected': emptyProps(),
    'Clear Drawings': emptyProps(),
    /**
     * Replaces ALL drawings with the provided set (the `.session.json` import
     * flow, Task 9). Clears the active tool and the selection.
     */
    'Restore Drawings': props<{ drawings: Drawing[] }>(),
  },
});
