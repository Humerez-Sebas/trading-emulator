import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { map, withLatestFrom } from 'rxjs/operators';
import { MarketActions } from './market.actions';
import { marketFeature } from './market.reducer';
import { generateCustomSeries } from './custom-timeframe';
import { ReplayActions } from '../replay/replay.actions';

@Injectable()
export class MarketEffects {
  private actions$ = inject(Actions);
  private store = inject(Store);

  /**
   * Generates a custom timeframe's candles by aggregating the loaded anchor
   * series in memory (Task 11). Kept thin: the aggregation logic lives in the
   * pure {@link generateCustomSeries}.
   */
  customTimeframe$ = createEffect(() =>
    this.actions$.pipe(
      ofType(MarketActions.changeCustomTimeframe),
      withLatestFrom(this.store.select(marketFeature.selectSeries)),
      map(([{ minutes }, series]) =>
        MarketActions.customTimeframeGenerated({
          minutes,
          candles: generateCustomSeries(series, minutes),
        }),
      ),
    ),
  );

  /**
   * Generates the replay-resolution candle series (Fase 2 / Task 2), mirroring
   * `customTimeframe$`: aggregates the loaded anchors in memory and replies with
   * `replayResolutionGenerated`. `null` minutes (no resolution override) yields `[]`.
   */
  replayResolution$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReplayActions.setReplayResolution),
      withLatestFrom(this.store.select(marketFeature.selectSeries)),
      map(([{ minutes }, series]) =>
        MarketActions.replayResolutionGenerated({
          minutes,
          candles: minutes == null ? [] : generateCustomSeries(series, minutes),
        }),
      ),
    ),
  );
}
