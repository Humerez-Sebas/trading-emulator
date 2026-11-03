import {
  MAX_UTC_OFFSET_HOURS,
  MIN_UTC_OFFSET_HOURS,
  NEW_YORK_ZONE_ID,
  SERVER_ZONE_ID,
  utcZoneId,
} from '../../domain/chart/display-time';

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
export type SidePanelTab = 'trade' | 'settings' | 'playbook';

export interface SidePanelState {
  tab: SidePanelTab;
  open: boolean;
}

export interface SettingsState {
  theme: Theme;
  chartColors: ChartColors;
  /**
   * DISPLAY-only clock: the id of the zone the chart is painted in
   * (`ny`, `server`, or a fixed `utc±N`). Resolved by `resolveDisplayZone`;
   * see DISPLAY_ZONE_OPTIONS below and `domain/chart/display-time.ts`.
   */
  displayZone: string;
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

/**
 * ---- Display time: which clock the chart is painted in ----
 *
 * Candle timestamps are stored in the broker's server clock, which runs at
 * **New York + 7 h all year**, so it is UTC+2 while New York is on EST and UTC+3
 * while it is on EDT. The stored value is therefore not a UTC instant; the rules
 * for recovering one, and the two families of zone, live in
 * `domain/chart/display-time.ts`.
 *
 * What matters here is the user-facing consequence:
 *
 * | Zona            | id        | exactitud                                    |
 * |-----------------|-----------|----------------------------------------------|
 * | Nueva York      | `ny`      | exacta todo el año (sigue el DST de EE. UU.) |
 * | Servidor MT5    | `server`  | exacta todo el año (la hora en que se guardan)|
 * | Tokio, La Paz…  | `utc+9`…  | exactas: son zonas SIN cambio de horario      |
 * | Londres, Madrid | `utc+0`…  | un offset fijo no las sigue en verano         |
 */

/** New York with automatic DST — the default, and the clock the data implies. */
export const DEFAULT_DISPLAY_ZONE_ID = NEW_YORK_ZONE_ID;

export interface DisplayZonePreset {
  /** Zone id, as persisted and as resolved by `resolveDisplayZone`. */
  id: string;
  /** Short code on the dock button. */
  code: string;
  /** Tooltip: the zone and how far it can be trusted. */
  title: string;
  /** False when a fixed UTC offset cannot track the zone all year. */
  exact: boolean;
}

/** The dock's quick-pick buttons — the two automatic zones first. */
export const DISPLAY_ZONE_PRESETS: DisplayZonePreset[] = [
  {
    id: NEW_YORK_ZONE_ID,
    code: 'NY',
    title:
      'Nueva York con cambio de horario automático (UTC−4 en verano, UTC−5 en invierno) — exacta todo el año, y la diaria corta siempre a las 17:00 ET',
    exact: true,
  },
  {
    id: SERVER_ZONE_ID,
    code: 'MT5',
    title:
      'Hora del servidor MT5 (UTC+2 / +3 según el horario de EE. UU.) — es la hora en que se guardan las velas, sin conversión',
    exact: true,
  },
  {
    id: utcZoneId(0),
    code: 'LDN',
    title:
      'Londres — UTC+0 fijo: exacto en invierno; con el horario de verano británico Londres es UTC+1, elígelo en la lista',
    exact: false,
  },
  {
    id: utcZoneId(1),
    code: 'MAD',
    title:
      'Madrid / París — UTC+1 fijo: exacto en invierno; con el horario de verano europeo son UTC+2, elígelo en la lista',
    exact: false,
  },
  {
    id: utcZoneId(9),
    code: 'TYO',
    title: 'Tokio — UTC+9: exacto todo el año, Japón no cambia de horario',
    exact: true,
  },
];

/** Cities worth naming next to a fixed offset; every claim here is literally true. */
const UTC_ZONE_HINTS: Record<number, string> = {
  [-5]: 'Nueva York (invierno)',
  [-4]: 'Nueva York (verano) · La Paz',
  [-3]: 'Buenos Aires',
  0: 'Londres (invierno)',
  1: 'Madrid (invierno) · Londres (verano)',
  2: 'Madrid (verano)',
  8: 'Singapur · Hong Kong',
  9: 'Tokio',
};

/**
 * The picker: the two automatic zones, then every whole-hour UTC offset. Labels
 * are user-facing, in Spanish, and say exactly what the number is.
 */
export const DISPLAY_ZONE_OPTIONS: { value: string; label: string }[] = [
  { value: NEW_YORK_ZONE_ID, label: 'Nueva York (UTC−4 / −5 automático)' },
  { value: SERVER_ZONE_ID, label: 'Servidor MT5 (UTC+2 / +3 automático)' },
  ...Array.from({ length: MAX_UTC_OFFSET_HOURS - MIN_UTC_OFFSET_HOURS + 1 }, (_, i) => {
    const offset = MIN_UTC_OFFSET_HOURS + i;
    const label = `UTC${offset < 0 ? '−' : '+'}${Math.abs(offset)}`;
    const hint = UTC_ZONE_HINTS[offset];
    return { value: utcZoneId(offset), label: hint ? `${label} · ${hint}` : label };
  }),
];
