import { Candle } from '../../models';
import { ChartColors, TradeBoxOpacity } from '../../state/settings/settings.models';
import { Drawing, DrawingTool } from '../../state/drawings/drawings.models';
import { Position, PendingOrder } from '../../state/trading/trading.models';
import { TradeBoxItem, TradeMarker } from '../../state/selectors';

export interface ChartConfig {
  colors: ChartColors;
  gridVisible: boolean;
  gridOpacity: number;
  watermarkText?: string;
  watermarkColor?: string;
}

export interface DrawingsModel {
  items: Drawing[];
  activeTool: DrawingTool;
  selectedId: string | null;
  draft: Drawing | null;
  shift: number;
  times: number[];
  barSpacing: number;
  pointSize: number;
  colors: {
    accent: string;
    up: string;
    down: string;
  };
}

export interface CountdownModel {
  price: number | null;
  text: string | null;
  backColor?: string;
  textColor?: string;
}

export interface SessionModel {
  sessionEnd: number | null;
  shift: number;
  times: number[];
  barSpacing: number;
  color?: string;
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
  drawings?: DrawingsModel;
  countdown?: CountdownModel;
  session?: SessionModel;
  trading?: TradingModel;
}
