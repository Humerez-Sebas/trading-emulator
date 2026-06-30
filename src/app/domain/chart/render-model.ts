import { Candle } from '../../models';
import { ChartColors } from '../../state/settings/settings.models';

export interface ChartConfig {
  colors: ChartColors;
  watermarkText?: string;
  watermarkColor?: string;
}

export interface RenderModel {
  candles: Candle[];
  config: ChartConfig;
  // TODO en futuras fases: trading, drawings, etc.
}
