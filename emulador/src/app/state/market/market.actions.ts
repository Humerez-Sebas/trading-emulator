import { createActionGroup, props } from '@ngrx/store';
import { Candle, Timeframe } from '../../models';

export const MarketActions = createActionGroup({
  source: 'Market',
  events: {
    'Csv Loaded': props<{ tf: Timeframe; candles: Candle[]; fileName: string }>(),
    'Change Timeframe': props<{ tf: Timeframe }>(),
  },
});
