import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Action, Store } from '@ngrx/store';
import { interval, EMPTY } from 'rxjs';
import { filter, map, mergeMap, switchMap, withLatestFrom } from 'rxjs/operators';
import { Candle } from '../../models';
import { ReplayActions } from './replay.actions';
import {
  selectActiveCandles,
  selectCurrentTime,
  selectFillContext,
  selectMsPerCandle,
  selectPlaying,
  selectReplayIndex,
  selectReplaySeries,
  selectVisibleIndex,
} from '../selectors';
import { replayFeature } from './replay.reducer';
import { TradingActions } from '../trading/trading.actions';
import { lastIndexAtOrBefore, sliceRange } from '../trading/fill-engine';

/** The slice of {@link selectFillContext} the forward-fold needs. */
interface ForwardFoldContext {
  candles: Candle[];
  idx: number;
  tfSeconds: number;
  lower: Candle[] | null;
  contractSize: number;
}

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
      withLatestFrom(this.store.select(selectReplaySeries), this.store.select(selectReplayIndex)),
      map(([, candles, idx]) => {
        const next = idx + 1;
        if (next >= candles.length) return ReplayActions.endOfData();
        return ReplayActions.goToTime({ time: candles[next].time });
      }),
    ),
  );

  /**
   * Display Navigation back (`-1`): snaps the cursor to the DISPLAY-TF grid.
   * From mid-bucket it lands on the current bucket's start; from a bucket
   * boundary it lands on the previous one. Cursor only — the fill engine's
   * lastProcessedTime guard means the landing candle never re-runs fills.
   */
  stepBack$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReplayActions.stepBack),
      withLatestFrom(
        this.store.select(selectActiveCandles),
        this.store.select(selectVisibleIndex),
        this.store.select(selectCurrentTime),
      ),
      mergeMap(([, display, visIdx, cursor]): Action[] => {
        if (visIdx < 0) return [];
        const boundary = display[visIdx].time;
        const target =
          cursor > boundary ? boundary : visIdx >= 1 ? display[visIdx - 1].time : boundary;
        return target < cursor ? [ReplayActions.goToTime({ time: target })] : [];
      }),
    ),
  );

  /**
   * Display Navigation (`+1`): snaps to the next DISPLAY-TF candle while the
   * simulation stays fine-grained — fills are processed for every replay
   * resolution candle crossed on the way (a processCandle per intermediate
   * candle, then a goToTime whose processFills$ handles the landing candle).
   * In full-candle mode this advances exactly one display candle. `to` is
   * clamped to a scheduled session end so it never overshoots.
   */
  advanceDisplay$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReplayActions.advanceDisplay),
      withLatestFrom(
        this.store.select(selectFillContext),
        this.store.select(selectActiveCandles),
        this.store.select(selectVisibleIndex),
      ),
      mergeMap(([, ctx, display, visIdx]): Action[] => {
        if (!display.length) return [];
        const nextDisplayIdx = visIdx + 1; // visIdx === -1 → first display candle
        if (nextDisplayIdx >= display.length) return [ReplayActions.endOfData()];
        const target = display[nextDisplayIdx].time;
        const { candles, idx, trading } = ctx;
        let to = lastIndexAtOrBefore(candles, target);
        if (trading.sessionEnd !== null) {
          while (to > idx + 1 && candles[to].time > trading.sessionEnd) to--;
        }
        if (to <= idx) return [];
        return this.foldForwardFills(ctx, to);
      }),
    ),
  );

  /**
   * Forward jump of `jumpSize` REPLAY-resolution candles. `to` is clamped to
   * the data end and to a scheduled session end so the jump never overshoots.
   */
  jumpForward$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReplayActions.jumpForward),
      withLatestFrom(
        this.store.select(selectFillContext),
        this.store.select(replayFeature.selectJumpSize),
      ),
      mergeMap(([, ctx, n]): Action[] => {
        const { candles, idx, trading } = ctx;
        if (idx < 0 || idx + 1 >= candles.length) return [];
        let to = Math.min(idx + n, candles.length - 1);
        if (trading.sessionEnd !== null) {
          while (to > idx + 1 && candles[to].time > trading.sessionEnd) to--;
        }
        return this.foldForwardFills(ctx, to);
      }),
    ),
  );

  /** Backward jump of `jumpSize` candles (cursor only; landing candle is idempotent). */
  jumpBack$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReplayActions.jumpBack),
      withLatestFrom(
        this.store.select(selectReplaySeries),
        this.store.select(selectReplayIndex),
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

  /**
   * Processes fills for the replay-resolution candles `[idx+1 .. toIdx-1]` and
   * lands the cursor on `candles[toIdx]` (whose fills processFills$ runs). Shared
   * by the forward Display Navigation and the multi-candle jump.
   */
  private foldForwardFills(ctx: ForwardFoldContext, toIdx: number): Action[] {
    const { candles, idx, tfSeconds, lower, contractSize } = ctx;
    const actions: Action[] = [];
    for (let i = idx + 1; i < toIdx; i++) {
      const candle = candles[i];
      const subCandles = lower ? sliceRange(lower, candle.time, candle.time + tfSeconds) : null;
      actions.push(TradingActions.processCandle({ candle, subCandles, contractSize }));
    }
    actions.push(ReplayActions.goToTime({ time: candles[toIdx].time }));
    return actions;
  }
}
