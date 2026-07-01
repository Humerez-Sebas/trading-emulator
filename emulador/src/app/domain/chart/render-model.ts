import { Candle } from '../../models';
import { ChartColors, TradeBoxOpacity } from '../../state/settings/settings.models';
import { Position, PendingOrder } from '../../state/trading/trading.models';
import { TradeBoxItem, TradeMarker } from '../../state/selectors';

export interface ChartConfig {
  colors: ChartColors;
  gridVisible: boolean;
  gridOpacity: number;
  watermarkText?: string;
  watermarkColor?: string;
}

export interface TradingModel {
  positions: Position[];
  pendingOrders: PendingOrder[];
  boxes: TradeBoxItem[];
  markers: TradeMarker[];
  shift: number;
  times: number[];
  barSpacing: number;
  colors: ChartColors;
  opacity: TradeBoxOpacity;
}

export interface RenderModel {
  candles: Candle[];
  config: ChartConfig;
  trading?: TradingModel;
}

