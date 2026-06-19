import { createActionGroup, props } from '@ngrx/store';
import { Candle, Timeframe } from '../../models';

export const MarketActions = createActionGroup({
  source: 'Market',
  events: {
    'Csv Loaded': props<{ tf: Timeframe; candles: Candle[]; fileName: string }>(),
    'Change Timeframe': props<{ tf: Timeframe }>(),
    // Custom (arbitrary-minute) timeframe, e.g. M45/M90 (Task 11). The effect
    // aggregates the loaded anchors and replies with `customTimeframeGenerated`.
    'Change Custom Timeframe': props<{ minutes: number }>(),
    'Custom Timeframe Generated': props<{ minutes: number; candles: Candle[] }>(),
  },
});
