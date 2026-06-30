import { Candle } from '../../models';
import { ChartColors } from '../../state/settings/settings.models';
import { Position, PendingOrder } from '../../state/trading/trading.models';
import { TradeBoxItem } from '../../state/selectors';

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
}

export interface RenderModel {
  candles: Candle[];
  config: ChartConfig;
  trading?: TradingModel;
}

