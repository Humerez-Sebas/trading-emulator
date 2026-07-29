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
   * DISPLAY-only shift, in hours, added to the stored candle clock before
   * rendering. Despite the historical field name it is **not** a UTC offset:
   * candles are stored in broker server time, so what the user sees is
   * `servidor + utcOffset`. See DISPLAY_SHIFTS below for the full reasoning.
   */
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

/**
 * ---- Display time: shifts over the broker's server clock ----
 *
 * Candle timestamps are stored in the server clock of FivePercentOnline-Real,
 * which runs at **New York + 7 h all year** (UTC+2 while New York is on EST,
 * UTC+3 while it is on EDT — it follows US DST, not the EU's). They are stored
 * that way on purpose: the pipeline resamples D1 buckets on the server clock, so
 * a daily candle runs 17:00 → 17:00 New York — the FX/CFD trading day MT5 and
 * TradingView show. Converting to true UTC would cut every daily at 20:00 ET and
 * break the R2 parquet contract (docs/engineering/domain/data-pipeline.md).
 *
 * The number the user picks is therefore a SHIFT applied to server time, not a
 * UTC offset. Only a zone that changes DST on the same day as New York can be
 * exact with a constant integer:
 *
 * | Zone            | shift | exactness                                    |
 * |-----------------|-------|----------------------------------------------|
 * | Nueva York      |    −7 | exact all year                               |
 * | Servidor MT5    |     0 | exact by definition (the data is already so)  |
 * | Londres         |    −2 | off by 1 h ~3 weeks/yr (mar 8–29, oct 25–nov 1)|
 * | Madrid          |    −1 | same windows                                 |
 * | Tokio           | +6/+7 | never constant (+6 verano NY, +7 invierno NY) |
 *
 * Full multi-zone correctness needs the true instant (subtract +2/+3 by the US
 * DST rule) plus `Intl` with IANA zones — deliberately out of scope here.
 */

/** New York, exact all year: the server clock is New York + 7 h. */
export const NEW_YORK_SHIFT_HOURS = -7;

/** No shift at all: the stored candles are already in MT5 server time. */
export const SERVER_SHIFT_HOURS = 0;

/** New York is the default: the only zone a constant integer tracks all year. */
export const DEFAULT_DISPLAY_SHIFT_HOURS = NEW_YORK_SHIFT_HOURS;

export interface DisplayShiftPreset {
  /** Hours added to the stored server clock. */
  value: number;
  /** Short code on the dock button. */
  code: string;
  /** Tooltip: the zone and how far the model can be trusted. */
  title: string;
  /** False when a constant integer cannot track the zone all year. */
  exact: boolean;
}

/** The dock's quick-pick buttons — exact zones first. */
export const DISPLAY_SHIFT_PRESETS: DisplayShiftPreset[] = [
  {
    value: NEW_YORK_SHIFT_HOURS,
    code: 'NY',
    title: 'Nueva York — exacta todo el año (el servidor sigue el horario de EE. UU.)',
    exact: true,
  },
  {
    value: SERVER_SHIFT_HOURS,
    code: 'MT5',
    title: 'Hora del servidor MT5 — sin desplazamiento: las velas ya vienen en esta hora',
    exact: true,
  },
  {
    value: -2,
    code: 'LDN',
    title:
      'Londres — aproximada: se desvía 1 h las ~3 semanas al año en que el cambio de horario europeo no coincide con el de EE. UU.',
    exact: false,
  },
  {
    value: -1,
    code: 'MAD',
    title: 'Madrid / París — aproximada: se desvía 1 h en las mismas ~3 semanas que Londres',
    exact: false,
  },
  {
    value: 6,
    code: 'TYO',
    title:
      'Tokio — aproximada: Japón no cambia de horario, así que el desplazamiento real alterna entre +6 h (verano en Nueva York) y +7 h (invierno)',
    exact: false,
  },
];

/** Zones worth naming in the dropdown; everything else stays a bare shift. */
const SHIFT_ZONE_NAMES: Record<number, string> = {
  [-7]: 'Nueva York',
  [-2]: 'Londres (aprox.)',
  [-1]: 'Madrid / París (aprox.)',
  0: 'Servidor MT5',
  6: 'Tokio (aprox.)',
};

/**
 * Every whole-hour shift from −12 to +14 (labels user-facing, in Spanish). The
 * range is wider than any zone needs so that no previously saved value becomes
 * unselectable; a zone name is attached only where the table above backs it.
 */
export const DISPLAY_SHIFTS: { value: number; label: string }[] = Array.from(
  { length: 27 },
  (_, i) => {
    const value = i - 12;
    const sign = value < 0 ? '−' : value > 0 ? '+' : '';
    const hours = `${sign}${Math.abs(value)} h`;
    const zone = SHIFT_ZONE_NAMES[value];
    return { value, label: zone ? `${hours} · ${zone}` : hours };
  },
);
