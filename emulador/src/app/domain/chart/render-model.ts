import { Candle } from '../../models';
import { ChartColors } from '../../state/settings/settings.models';
import { Drawing, DrawingTool } from '../../state/drawings/drawings.models';

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

export interface RenderModel {
  candles: Candle[];
  config: ChartConfig;
  drawings?: DrawingsModel;
  countdown?: CountdownModel;
  session?: SessionModel;
}


