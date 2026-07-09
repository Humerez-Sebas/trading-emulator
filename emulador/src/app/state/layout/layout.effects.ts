import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { filter, map, withLatestFrom } from 'rxjs/operators';
import { LayoutActions } from './layout.actions';
import { layoutFeature } from './layout.reducer';
import { MarketActions } from '../market/market.actions';
import { marketFeature } from '../market/market.reducer';
import { Timeframe } from '../../models';

@Injectable()
export class LayoutEffects {
  private actions$ = inject(Actions);
  private store = inject(Store);

  /**
   * When a panel is focused (either clicked directly or selected in stacked cell tabs),
   * synchronize the global active timeframe to match the panel's timeframe.
   */
  syncTimeframeOnFocus$ = createEffect(() =>
    this.actions$.pipe(
      ofType(LayoutActions.setFocusedPanel, LayoutActions.setActivePanel),
      withLatestFrom(
        this.store.select(layoutFeature.selectPanels),
        this.store.select(marketFeature.selectSeries),
      ),
      map(([action, panels, series]) => {
        const tf = panels[action.panelId]?.timeframe ?? null;
        return { tf, series };
      }),
      filter((info): info is { tf: Timeframe; series: typeof info.series } => info.tf !== null),
      map(({ tf, series }) => {
        if (series && series[tf] && series[tf]!.length > 0) {
          return MarketActions.changeTimeframe({ tf });
        }
        if (tf.startsWith('M')) {
          const minutes = parseInt(tf.substring(1), 10);
          if (!isNaN(minutes)) {
            return MarketActions.changeCustomTimeframe({ minutes });
          }
        }
        return MarketActions.changeTimeframe({ tf });
      }),
      filter((action): action is NonNullable<typeof action> => action !== null),
    ),
  );
}
