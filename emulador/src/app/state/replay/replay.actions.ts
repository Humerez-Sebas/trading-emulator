import { createActionGroup, emptyProps, props } from '@ngrx/store';

export const ReplayActions = createActionGroup({
  source: 'Replay',
  events: {
    /** Places the replay cursor at a timestamp (unix seconds). */
    'Go To Time': props<{ time: number }>(),
    'Advance Candle': emptyProps(),
    /** Moves the cursor one candle back (review; fills never re-run). */
    'Step Back': emptyProps(),
    Play: emptyProps(),
    Pause: emptyProps(),
    'Change Speed': props<{ msPerCandle: number }>(),
    /** The data of the active TF ran out. */
    'End Of Data': emptyProps(),
  },
});
