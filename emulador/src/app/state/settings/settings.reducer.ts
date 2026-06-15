import { createFeature, createReducer, on } from '@ngrx/store';
import { SettingsActions } from './settings.actions';
import {
  DARK_CHART_COLORS,
  DARK_TRADE_BOX_OPACITY,
  LIGHT_CHART_COLORS,
  LIGHT_TRADE_BOX_OPACITY,
  SettingsState,
  SidePanelState,
  TRADE_BOX_BORDER_RANGE,
  TRADE_BOX_FILL_RANGE,
  TradeBoxOpacity,
} from './settings.models';

// Storage key kept as-is for backward compatibility with saved user data.
const STORAGE_KEY = 'emulador.settings';

const defaultState: SettingsState = {
  theme: 'dark',
  chartColors: DARK_CHART_COLORS,
  utcOffset: -4, // La Paz by default
  gridVisible: true,
  gridOpacity: 1,
  floatingToolbar: true,
  tradeBoxesVisible: true,
  tradeBoxOpacity: DARK_TRADE_BOX_OPACITY,
  sidePanel: { tab: 'trade', open: true },
};

const clampFill = (v: number) =>
  Math.min(TRADE_BOX_FILL_RANGE.max, Math.max(TRADE_BOX_FILL_RANGE.min, v));
const clampBorder = (v: number) =>
  Math.min(TRADE_BOX_BORDER_RANGE.max, Math.max(TRADE_BOX_BORDER_RANGE.min, v));

function validTradeBoxOpacity(
  saved: Partial<TradeBoxOpacity> | undefined,
  theme: 'dark' | 'light',
): TradeBoxOpacity {
  const def = theme === 'dark' ? DARK_TRADE_BOX_OPACITY : LIGHT_TRADE_BOX_OPACITY;
  return {
    fill: typeof saved?.fill === 'number' ? clampFill(saved.fill) : def.fill,
    border: typeof saved?.border === 'number' ? clampBorder(saved.border) : def.border,
  };
}

function validSidePanel(saved: Partial<SidePanelState> | undefined): SidePanelState {
  // read migration: a stored 'sessions' tab (pre-V2.6 dock) falls back to
  // 'trade' — the sessions flow lives in the /sesiones page now
  const tab = saved?.tab === 'settings' || saved?.tab === 'trade' ? saved.tab : 'trade';
  return { tab, open: typeof saved?.open === 'boolean' ? saved.open : true };
}

/** Rehydrates the saved settings; on any problem falls back to the defaults. */
function loadInitialState(): SettingsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    const saved = JSON.parse(raw) as Partial<SettingsState>;
    const theme = saved.theme === 'light' ? 'light' : 'dark';
    return {
      theme,
      chartColors: { ...defaultState.chartColors, ...saved.chartColors },
      utcOffset: typeof saved.utcOffset === 'number' ? saved.utcOffset : defaultState.utcOffset,
      gridVisible: typeof saved.gridVisible === 'boolean' ? saved.gridVisible : true,
      gridOpacity:
        typeof saved.gridOpacity === 'number' ? Math.min(1, Math.max(0, saved.gridOpacity)) : 1,
      floatingToolbar: typeof saved.floatingToolbar === 'boolean' ? saved.floatingToolbar : true,
      tradeBoxesVisible:
        typeof saved.tradeBoxesVisible === 'boolean' ? saved.tradeBoxesVisible : true,
      tradeBoxOpacity: validTradeBoxOpacity(saved.tradeBoxOpacity, theme),
      sidePanel: validSidePanel(saved.sidePanel),
    };
  } catch {
    return defaultState;
  }
}

export function persistSettings(state: SettingsState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable: ignore */
  }
}

export const settingsFeature = createFeature({
  name: 'settings',
  reducer: createReducer(
    loadInitialState(),
    on(SettingsActions.changeTheme, (state, { theme }): SettingsState => {
      // when switching theme, if the user has not customized the canvas,
      // background/grid/text are adjusted to the new theme while keeping
      // the candle colors
      const base = theme === 'dark' ? DARK_CHART_COLORS : LIGHT_CHART_COLORS;
      const prevBase = theme === 'dark' ? LIGHT_CHART_COLORS : DARK_CHART_COLORS;
      const canvasUntouched =
        state.chartColors.background === prevBase.background &&
        state.chartColors.grid === prevBase.grid;
      // same idea for the box opacities: follow the theme default unless
      // the user moved the sliders away from the previous theme's default
      const boxBase = theme === 'dark' ? DARK_TRADE_BOX_OPACITY : LIGHT_TRADE_BOX_OPACITY;
      const prevBoxBase = theme === 'dark' ? LIGHT_TRADE_BOX_OPACITY : DARK_TRADE_BOX_OPACITY;
      const boxesUntouched =
        state.tradeBoxOpacity.fill === prevBoxBase.fill &&
        state.tradeBoxOpacity.border === prevBoxBase.border;
      return {
        ...state,
        theme,
        chartColors: canvasUntouched
          ? { ...state.chartColors, background: base.background, grid: base.grid, text: base.text }
          : state.chartColors,
        tradeBoxOpacity: boxesUntouched ? boxBase : state.tradeBoxOpacity,
      };
    }),
    on(
      SettingsActions.changeChartColors,
      (state, { colors }): SettingsState => ({
        ...state,
        chartColors: { ...state.chartColors, ...colors },
      }),
    ),
    on(
      SettingsActions.restoreColors,
      (state): SettingsState => ({
        ...state,
        chartColors: state.theme === 'dark' ? DARK_CHART_COLORS : LIGHT_CHART_COLORS,
      }),
    ),
    on(
      SettingsActions.changeUtcOffset,
      (state, { utcOffset }): SettingsState => ({ ...state, utcOffset }),
    ),
    on(
      SettingsActions.changeGrid,
      (state, { visible, opacity }): SettingsState => ({
        ...state,
        gridVisible: visible ?? state.gridVisible,
        gridOpacity: opacity !== undefined ? Math.min(1, Math.max(0, opacity)) : state.gridOpacity,
      }),
    ),
    on(
      SettingsActions.toggleFloatingToolbar,
      (state, { visible }): SettingsState => ({ ...state, floatingToolbar: visible }),
    ),
    on(
      SettingsActions.setTradeBoxesVisible,
      (state, { visible }): SettingsState => ({ ...state, tradeBoxesVisible: visible }),
    ),
    on(
      SettingsActions.changeTradeBoxOpacity,
      (state, { fill, border }): SettingsState => ({
        ...state,
        tradeBoxOpacity: {
          fill: fill !== undefined ? clampFill(fill) : state.tradeBoxOpacity.fill,
          border: border !== undefined ? clampBorder(border) : state.tradeBoxOpacity.border,
        },
      }),
    ),
    on(SettingsActions.setSidePanelTab, (state, { tab }): SettingsState => {
      // clicking the active tab collapses the dock; anything else opens it
      const collapse = state.sidePanel.open && state.sidePanel.tab === tab;
      return { ...state, sidePanel: { tab, open: !collapse } };
    }),
  ),
});
