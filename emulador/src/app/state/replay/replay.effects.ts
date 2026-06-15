import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { interval, EMPTY } from 'rxjs';
import { filter, map, switchMap, withLatestFrom } from 'rxjs/operators';
import { ReplayActions } from './replay.actions';
import {
  selectActiveCandles,
  selectMsPerCandle,
  selectPlaying,
  selectVisibleIndex,
} from '../selectors';

@Injectable()
export class ReplayEffects {
  private actions$ = inject(Actions);
  private store = inject(Store);

  /**
   * Advancing one candle = moving the cursor to the timestamp of the next
   * candle of the active TF. If there is no next one, end of data.
   */
  advance$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReplayActions.advanceCandle),
      withLatestFrom(this.store.select(selectActiveCandles), this.store.select(selectVisibleIndex)),
      map(([, candles, idx]) => {
        const next = idx + 1;
        if (next >= candles.length) return ReplayActions.endOfData();
        return ReplayActions.goToTime({ time: candles[next].time });
      }),
    ),
  );

  /**
   * Stepping back = moving the cursor to the previous candle. The fill
   * engine never reprocesses (lastProcessedTime guard), so going back and
   * forth does not duplicate fills.
   */
  stepBack$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReplayActions.stepBack),
      withLatestFrom(this.store.select(selectActiveCandles), this.store.select(selectVisibleIndex)),
      filter(([, , idx]) => idx >= 1),
      map(([, candles, idx]) => ReplayActions.goToTime({ time: candles[idx - 1].time })),
    ),
  );

  /** Auto-play: while playing, dispatches advanceCandle every msPerCandle. */
  autoplay$ = createEffect(() =>
    this.store
      .select(selectPlaying)
      .pipe(
        switchMap((playing) =>
          playing
            ? this.store
                .select(selectMsPerCandle)
                .pipe(
                  switchMap((ms) => interval(ms).pipe(map(() => ReplayActions.advanceCandle()))),
                )
            : EMPTY,
        ),
      ),
  );
}
