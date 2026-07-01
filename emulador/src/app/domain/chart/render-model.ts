/** OHLC candle. `time` in unix seconds (UTC), as expected by lightweight-charts. */
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface ChartColors {
  upColor: string;
  downColor: string;
  wickUp: string;
  wickDown: string;
  borderUpColor: string;
  borderDownColor: string;
  background: string;
  grid: string;
  text: string;
  crosshair: string;
  tpZone: string;
  slZone: string;
}

export interface TradeBoxOpacity {
  fill: number;
  border: number;
}

export interface DrawingPoint {
  time: number;
  price: number;
}

export type DrawingTool = 'none' | 'rect' | 'line' | 'fib' | 'ruler';
export type DrawingType = Exclude<DrawingTool, 'none'>;

export interface Drawing {
  id: string;
  kind: DrawingType;
  p1: DrawingPoint;
  p2: DrawingPoint;
}

export interface Position {
  id: string;
  side: 'buy' | 'sell';
  entryPrice: number;
  sl: number;
  tp: number | null;
  lots: number;
  openTime: number;
  origin: string;
}

export interface PendingOrder {
  id: string;
  side: 'buy' | 'sell';
  type: string;
  entryPrice: number;
  sl: number;
  tp: number | null;
  lots: number;
}

export interface TradeBoxItem {
  id: string;
  status: 'open' | 'pending' | 'closed';
  side: 'buy' | 'sell';
  entry: number;
  sl: number;
  tp: number | null;
  from: number;
  to: number | null;
  hidden: boolean;
}

export interface TradeMarker {
  time: number;
  position: 'aboveBar' | 'belowBar';
  shape: 'arrowUp' | 'arrowDown' | 'circle';
  color: 'up' | 'down';
  text: string;
}

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
