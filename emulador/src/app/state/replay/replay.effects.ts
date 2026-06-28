import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Action, Store } from '@ngrx/store';
import { interval, EMPTY } from 'rxjs';
import { filter, map, mergeMap, switchMap, withLatestFrom } from 'rxjs/operators';
import { ReplayActions } from './replay.actions';
import {
  selectActiveCandles,
  selectFillContext,
  selectMsPerCandle,
  selectPlaying,
  selectVisibleIndex,
} from '../selectors';
import { replayFeature } from './replay.reducer';
import { TradingActions } from '../trading/trading.actions';
import { sliceRange } from '../trading/fill-engine';

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

  /**
   * Forward jump of `jumpSize` candles. Fills are evaluated for every crossed
   * candle: a processCandle per intermediate candle, then a final goToTime whose
   * processFills$ handles the landing candle. `to` is clamped to the data end and
   * to a scheduled session end so the jump never overshoots either.
   */
  jumpForward$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReplayActions.jumpForward),
      withLatestFrom(
        this.store.select(selectFillContext),
        this.store.select(replayFeature.selectJumpSize),
      ),
      mergeMap(([, ctx, n]): Action[] => {
        const { candles, idx, tfSeconds, lower, contractSize, trading } = ctx;
        if (idx < 0 || idx + 1 >= candles.length) return [];
        let to = Math.min(idx + n, candles.length - 1);
        if (trading.sessionEnd !== null) {
          while (to > idx + 1 && candles[to].time > trading.sessionEnd) to--;
        }
        const actions: Action[] = [];
        for (let i = idx + 1; i < to; i++) {
          const candle = candles[i];
          const subCandles = lower ? sliceRange(lower, candle.time, candle.time + tfSeconds) : null;
          actions.push(TradingActions.processCandle({ candle, subCandles, contractSize }));
        }
        actions.push(ReplayActions.goToTime({ time: candles[to].time }));
        return actions;
      }),
    ),
  );

  /** Backward jump of `jumpSize` candles (cursor only; landing candle is idempotent). */
  jumpBack$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReplayActions.jumpBack),
      withLatestFrom(
        this.store.select(selectActiveCandles),
        this.store.select(selectVisibleIndex),
        this.store.select(replayFeature.selectJumpSize),
      ),
      filter(([, , idx]) => idx >= 1),
      map(([, candles, idx, n]) =>
        ReplayActions.goToTime({ time: candles[Math.max(0, idx - n)].time }),
      ),
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
