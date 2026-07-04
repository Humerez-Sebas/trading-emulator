import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { map, withLatestFrom } from 'rxjs/operators';
import { LayoutActions } from './layout.actions';
import { layoutFeature } from './layout.reducer';
import { MarketActions } from '../market/market.actions';
import { TIMEFRAME_SECONDS } from '../../models';

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
      withLatestFrom(this.store.select(layoutFeature.selectPanels)),
      map(([{ panelId }, panels]) => {
        const panel = panels[panelId];
        if (!panel) return { type: 'noop' };
        const tf = panel.timeframe;
        const standardTfs = new Set<string>(Object.keys(TIMEFRAME_SECONDS));
        if (standardTfs.has(tf)) {
          return MarketActions.changeTimeframe({ tf });
        } else if (tf.startsWith('M')) {
          const minutes = parseInt(tf.substring(1), 10);
          if (!isNaN(minutes)) {
            return MarketActions.changeCustomTimeframe({ minutes });
          }
        }
        return { type: 'noop' };
      }),
    ),
  );
}
