import { createActionGroup, emptyProps, props } from '@ngrx/store';

export const ReplayActions = createActionGroup({
  source: 'Replay',
  events: {
    /** Places the replay cursor at a timestamp (unix seconds). */
    'Go To Time': props<{ time: number }>(),
    /** Advances one replay-resolution candle (autoplay tick). */
    'Advance Candle': emptyProps(),
    /**
     * Display Navigation: snaps the cursor to the next DISPLAY-TF candle,
     * processing fills for every replay-resolution candle crossed on the way.
     */
    'Advance Display': emptyProps(),
    /** Display Navigation back: snaps the cursor to the display-TF grid (no fills). */
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
