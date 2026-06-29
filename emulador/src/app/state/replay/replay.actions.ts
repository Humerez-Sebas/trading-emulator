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
    /** Sets the multi-candle jump size (5 / 10 / 50). */
    'Set Jump Size': props<{ size: number }>(),
    /** Advances `jumpSize` candles, processing fills for each crossed candle. */
    'Jump Forward': emptyProps(),
    /** Moves `jumpSize` candles back (review; no new fills). */
    'Jump Back': emptyProps(),
    /** Teleports the cursor (scrubber). NOT a fill-processing advance. */
    'Seek To': props<{ time: number }>(),
    /** Sets the replay resolution in minutes (null = full display-TF candle). */
    'Set Replay Resolution': props<{ minutes: number | null }>(),
  },
});
