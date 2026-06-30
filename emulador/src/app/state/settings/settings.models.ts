export type Theme = 'dark' | 'light';

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
  /** Fill colors for the trade box zones (TP / SL) drawn on the chart. */
  tpZone: string;
  slZone: string;
}

/** User-tunable opacity of the trade box zones drawn on the chart. */
export interface TradeBoxOpacity {
  /** Base fill alpha (open positions; pending/closed scale from it). */
  fill: number;
  /** Alpha of the SL/TP edge stroke. */
  border: number;
}

/** Brand accent (pending-order lines, draft levels) — matches --accent in styles.css. */
export const CHART_ACCENT = '#2962FF';

/** Dark backgrounds need subtle fills (the V2.4 constants). */
export const DARK_TRADE_BOX_OPACITY: TradeBoxOpacity = { fill: 0.12, border: 0.6 };

/** Light backgrounds wash the zones out: stronger defaults. */
export const LIGHT_TRADE_BOX_OPACITY: TradeBoxOpacity = { fill: 0.2, border: 0.8 };

/** Slider bounds (UI shows percentages). */
export const TRADE_BOX_FILL_RANGE = { min: 0.05, max: 0.5 };
export const TRADE_BOX_BORDER_RANGE = { min: 0.1, max: 1 };

/** Tabs of the right-side dock panel ('sessions' moved to the /sesiones page in V2.6). */
export type SidePanelTab = 'trade' | 'settings';

export interface SidePanelState {
  tab: SidePanelTab;
  open: boolean;
}

export interface SettingsState {
  theme: Theme;
  chartColors: ChartColors;
  /** DISPLAY-only time offset. The data always lives in UTC. */
  utcOffset: number;
  /** Chart grid visibility and opacity (0..1). */
  gridVisible: boolean;
  gridOpacity: number;
  /** Floating quick-access toolbar over the chart (TradingView-style). */
  floatingToolbar: boolean;
  /** Global visibility of ALL trade boxes (the toolbar eye toggle). */
  tradeBoxesVisible: boolean;
  /** Fill/border opacity of the trade boxes (theme-aware defaults). */
  tradeBoxOpacity: TradeBoxOpacity;
  /** Right-side dock: active tab and whether the panel is expanded. */
  sidePanel: SidePanelState;
}

/** Default colors: true-black dark theme (OLED). */
export const DARK_CHART_COLORS: ChartColors = {
  upColor: '#26A69A',
  downColor: '#EF5350',
  wickUp: '#26A69A',
  wickDown: '#EF5350',
  borderUpColor: '#000000',
  borderDownColor: '#000000',
  background: '#000000',
  grid: '#1A1A1A',
  text: '#787B86',
  crosshair: '#787B86',
  tpZone: '#089981',
  slZone: '#F23645',
};

export const LIGHT_CHART_COLORS: ChartColors = {
  upColor: '#089981',
  downColor: '#F23645',
  wickUp: '#089981',
  wickDown: '#F23645',
  borderUpColor: '#000000',
  borderDownColor: '#000000',
  background: '#FFFFFF',
  grid: '#E0E3EB',
  text: '#787B86',
  crosshair: '#787B86',
  tpZone: '#089981',
  slZone: '#F23645',
};

export interface ChartPreset {
  id: string;
  label: string;
  /** Candle colors at minimum; may restyle the whole chart (bg/grid/text). */
  colors: Pick<ChartColors, 'upColor' | 'downColor' | 'wickUp' | 'wickDown'> & Partial<ChartColors>;
}

export const CHART_PRESETS: ChartPreset[] = [
  {
    id: 'tradingview',
    label: 'TradingView',
    colors: {
      upColor: '#26A69A',
      downColor: '#EF5350',
      wickUp: '#26A69A',
      wickDown: '#EF5350',
      borderUpColor: '#000000',
      borderDownColor: '#000000',
    },
  },
  {
    id: 'clasico',
    label: 'Clásico verde/rojo',
    colors: {
      upColor: '#089981',
      downColor: '#F23645',
      wickUp: '#089981',
      wickDown: '#F23645',
      borderUpColor: '#000000',
      borderDownColor: '#000000',
    },
  },
  {
    id: 'mt5',
    label: 'MT5',
    colors: {
      upColor: '#00B746',
      downColor: '#FFFFFF',
      wickUp: '#00B746',
      wickDown: '#FFFFFF',
      borderUpColor: '#000000',
      borderDownColor: '#000000',
    },
  },
  {
    id: 'mono',
    label: 'Monocromo',
    colors: {
      upColor: '#D1D4DC',
      downColor: '#5D606B',
      wickUp: '#D1D4DC',
      wickDown: '#5D606B',
      borderUpColor: '#000000',
      borderDownColor: '#000000',
    },
  },
  {
    // White chart with blue/black candles, like the user's TradingView setup.
    // Restyles the full chart (background/grid); pairs well with the light theme.
    id: 'tv-claro',
    label: 'TradingView claro',
    colors: {
      upColor: '#2962FF',
      downColor: '#0F0F0F',
      wickUp: '#2962FF',
      wickDown: '#0F0F0F',
      borderUpColor: '#000000',
      borderDownColor: '#000000',
      background: '#FFFFFF',
      grid: '#ECECEC',
      text: '#787B86',
    },
  },
];

/** Time zone options for the selector (labels are user-facing, in Spanish). */
export const UTC_OFFSETS: { value: number; label: string }[] = [
  { value: -12, label: 'UTC−12' },
  { value: -11, label: 'UTC−11' },
  { value: -10, label: 'UTC−10 Honolulu' },
  { value: -9, label: 'UTC−9 Anchorage' },
  { value: -8, label: 'UTC−8 Los Ángeles' },
  { value: -7, label: 'UTC−7 Denver' },
  { value: -6, label: 'UTC−6 Ciudad de México' },
  { value: -5, label: 'UTC−5 Nueva York / Lima' },
  { value: -4, label: 'UTC−4 La Paz / Santiago' },
  { value: -3, label: 'UTC−3 Buenos Aires' },
  { value: -2, label: 'UTC−2' },
  { value: -1, label: 'UTC−1' },
  { value: 0, label: 'UTC+0 Londres' },
  { value: 1, label: 'UTC+1 Madrid / París' },
  { value: 2, label: 'UTC+2 Atenas' },
  { value: 3, label: 'UTC+3 Moscú / hora servidor MT5' },
  { value: 4, label: 'UTC+4 Dubái' },
  { value: 5, label: 'UTC+5' },
  { value: 6, label: 'UTC+6' },
  { value: 7, label: 'UTC+7 Bangkok' },
  { value: 8, label: 'UTC+8 Singapur / Hong Kong' },
  { value: 9, label: 'UTC+9 Tokio' },
  { value: 10, label: 'UTC+10 Sídney' },
  { value: 11, label: 'UTC+11' },
  { value: 12, label: 'UTC+12 Auckland' },
  { value: 13, label: 'UTC+13' },
  { value: 14, label: 'UTC+14' },
];
