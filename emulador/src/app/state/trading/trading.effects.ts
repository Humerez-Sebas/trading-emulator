import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { filter, map, mergeMap, withLatestFrom } from 'rxjs/operators';
import { ReplayActions } from '../replay/replay.actions';
import { selectFillContext } from '../selectors';
import { sliceRange } from './fill-engine';
import { TradingActions } from './trading.actions';

@Injectable()
export class TradingEffects {
  private actions$ = inject(Actions);
  private store = inject(Store);

  /**
   * Runs the fill engine on every single-candle replay advance. Jumps via
   * the start-date picker are ignored on purpose: only candles revealed one
   * by one are traded (goToTime from advance$ always lands exactly on the
   * next candle's time, which is what the guard checks).
   */
  processFills$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReplayActions.goToTime),
      withLatestFrom(this.store.select(selectFillContext)),
      filter(([action, ctx]) => {
        if (ctx.idx < 0 || ctx.tfSeconds <= 0) return false;
        const candle = ctx.candles[ctx.idx];
        if (candle.time !== action.time) return false; // jump, not an advance
        if (ctx.trading.sessionEnded) return false;
        return ctx.trading.orders.length > 0 || ctx.trading.positions.length > 0;
      }),
      map(([, ctx]) => {
        const candle = ctx.candles[ctx.idx];
        const subCandles = ctx.lower
          ? sliceRange(ctx.lower, candle.time, candle.time + ctx.tfSeconds)
          : null;
        return TradingActions.processCandle({
          candle,
          subCandles,
          contractSize: ctx.contractSize,
        });
      }),
    ),
  );

  /**
   * Scheduled end: when the replay reaches the configured session-end time,
   * pause and end the session automatically. Declared after processFills$
   * so the fills of that final candle are applied before closing.
   */
  endOnSchedule$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReplayActions.goToTime),
      withLatestFrom(this.store.select(selectFillContext)),
      filter(([action, ctx]) => {
        if (ctx.idx < 0 || ctx.trading.sessionEnded) return false;
        const candle = ctx.candles[ctx.idx];
        if (candle.time !== action.time) return false; // jump, not an advance
        return ctx.trading.sessionEnd !== null && candle.time >= ctx.trading.sessionEnd;
      }),
      mergeMap(([, ctx]) => {
        const last = ctx.candles[ctx.idx];
        return [
          ReplayActions.pause(),
          TradingActions.endSession({
            price: last.close,
            time: last.time,
            contractSize: ctx.contractSize,
          }),
        ];
      }),
    ),
  );

  /** When the data runs out, end the session (if there was any activity). */
  endOnDataExhausted$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReplayActions.endOfData),
      withLatestFrom(this.store.select(selectFillContext)),
      filter(([, ctx]) => {
        if (ctx.idx < 0 || ctx.trading.sessionEnded) return false;
        const t = ctx.trading;
        return t.positions.length > 0 || t.orders.length > 0 || t.history.length > 0;
      }),
      map(([, ctx]) => {
        const last = ctx.candles[ctx.idx];
        return TradingActions.endSession({
          price: last.close,
          time: last.time,
          contractSize: ctx.contractSize,
        });
      }),
    ),
  );
}
