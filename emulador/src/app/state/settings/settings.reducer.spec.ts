import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DARK_CHART_COLORS,
  DARK_TRADE_BOX_OPACITY,
  LIGHT_CHART_COLORS,
  LIGHT_TRADE_BOX_OPACITY,
  TRADE_BOX_BORDER_RANGE,
  TRADE_BOX_FILL_RANGE,
} from './settings.models';
import { SettingsActions } from './settings.actions';

const STORAGE_KEY = 'emulador.settings';

// Helper: get a fresh reducer after seeding localStorage (module isolation)
async function freshReducer(seed?: object) {
  if (seed !== undefined) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
  }
  await vi.resetModules();
  const mod = await import('./settings.reducer');
  return mod.settingsFeature.reducer;
}

afterEach(() => {
  localStorage.clear();
  vi.resetModules();
});

describe('settings reducer: loadInitialState rehydration', () => {
  it('returns defaultState when no stored value exists', async () => {
    const reducer = await freshReducer();
    const s = reducer(undefined, { type: '@@init' } as any);
    expect(s.theme).toBe('dark');
    expect(s.sidePanel).toEqual({ tab: 'trade', open: true });
  });

  it('returns defaultState when the stored JSON is corrupt', async () => {
    localStorage.setItem(STORAGE_KEY, 'NOT_JSON{{{');
    await vi.resetModules();
    const mod = await import('./settings.reducer');
    const reducer = mod.settingsFeature.reducer;
    const s = reducer(undefined, { type: '@@init' } as any);
    expect(s.theme).toBe('dark');
  });

  it('REGRESSION #3: persisted sidePanel.tab "sessions" rehydrates to "trade"', async () => {
    const reducer = await freshReducer({ sidePanel: { tab: 'sessions', open: true } });
    const s = reducer(undefined, { type: '@@init' } as any);
    expect(s.sidePanel.tab).toBe('trade');
  });

  it('REGRESSION #3: "settings" tab survives rehydration', async () => {
    const reducer = await freshReducer({ sidePanel: { tab: 'settings', open: false } });
    const s = reducer(undefined, { type: '@@init' } as any);
    expect(s.sidePanel.tab).toBe('settings');
    expect(s.sidePanel.open).toBe(false);
  });

  it('REGRESSION #3: "trade" tab survives rehydration', async () => {
    const reducer = await freshReducer({ sidePanel: { tab: 'trade', open: true } });
    const s = reducer(undefined, { type: '@@init' } as any);
    expect(s.sidePanel.tab).toBe('trade');
  });

  it('defaults missing sidePanel.open to true', async () => {
    const reducer = await freshReducer({ sidePanel: { tab: 'trade' } });
    const s = reducer(undefined, { type: '@@init' } as any);
    expect(s.sidePanel.open).toBe(true);
  });

  it('coerces theme !== "light" to "dark"', async () => {
    const reducer = await freshReducer({ theme: 'banana' });
    const s = reducer(undefined, { type: '@@init' } as any);
    expect(s.theme).toBe('dark');
  });

  it('clamps gridOpacity to 0..1 (below 0)', async () => {
    const reducer = await freshReducer({ gridOpacity: -0.5 });
    const s = reducer(undefined, { type: '@@init' } as any);
    expect(s.gridOpacity).toBe(0);
  });

  it('clamps gridOpacity to 0..1 (above 1)', async () => {
    const reducer = await freshReducer({ gridOpacity: 2 });
    const s = reducer(undefined, { type: '@@init' } as any);
    expect(s.gridOpacity).toBe(1);
  });

  it('defaults non-number utcOffset to -4', async () => {
    const reducer = await freshReducer({ utcOffset: 'bad' });
    const s = reducer(undefined, { type: '@@init' } as any);
    expect(s.utcOffset).toBe(-4);
  });

  it('clamps tradeBoxOpacity.fill via validTradeBoxOpacity (too low)', async () => {
    const reducer = await freshReducer({
      tradeBoxOpacity: { fill: 0.001, border: 0.5 },
    });
    const s = reducer(undefined, { type: '@@init' } as any);
    expect(s.tradeBoxOpacity.fill).toBeGreaterThanOrEqual(TRADE_BOX_FILL_RANGE.min);
  });

  it('clamps tradeBoxOpacity.border via validTradeBoxOpacity (too high)', async () => {
    const reducer = await freshReducer({
      tradeBoxOpacity: { fill: 0.2, border: 999 },
    });
    const s = reducer(undefined, { type: '@@init' } as any);
    expect(s.tradeBoxOpacity.border).toBeLessThanOrEqual(TRADE_BOX_BORDER_RANGE.max);
  });
});

describe('settings reducer: changeTheme', () => {
  it('dark → light flips background/grid/text when canvas is untouched', async () => {
    const reducer = await freshReducer();
    // Start in dark (default)
    const dark = reducer(undefined, { type: '@@init' } as any);
    const light = reducer(dark, SettingsActions.changeTheme({ theme: 'light' }));
    expect(light.theme).toBe('light');
    expect(light.chartColors.background).toBe(LIGHT_CHART_COLORS.background);
    expect(light.chartColors.grid).toBe(LIGHT_CHART_COLORS.grid);
    expect(light.chartColors.text).toBe(LIGHT_CHART_COLORS.text);
  });

  it('leaves custom colors alone when the user changed them', async () => {
    const reducer = await freshReducer();
    const dark = reducer(undefined, { type: '@@init' } as any);
    const customised = reducer(
      dark,
      SettingsActions.changeChartColors({ colors: { background: '#FF0000' } }),
    );
    const light = reducer(customised, SettingsActions.changeTheme({ theme: 'light' }));
    expect(light.chartColors.background).toBe('#FF0000');
  });

  it('box opacities follow theme default unless sliders were moved', async () => {
    const reducer = await freshReducer();
    const dark = reducer(undefined, { type: '@@init' } as any);
    const light = reducer(dark, SettingsActions.changeTheme({ theme: 'light' }));
    expect(light.tradeBoxOpacity).toEqual(LIGHT_TRADE_BOX_OPACITY);
  });

  it('keeps box opacities when user moved the sliders from the previous theme default', async () => {
    const reducer = await freshReducer();
    const dark = reducer(undefined, { type: '@@init' } as any);
    const moved = reducer(dark, SettingsActions.changeTradeBoxOpacity({ fill: 0.3, border: 0.9 }));
    const light = reducer(moved, SettingsActions.changeTheme({ theme: 'light' }));
    expect(light.tradeBoxOpacity.fill).toBeCloseTo(0.3, 5);
    expect(light.tradeBoxOpacity.border).toBeCloseTo(0.9, 5);
  });
});

describe('settings reducer: changeChartColors', () => {
  it('merges partial colors', async () => {
    const reducer = await freshReducer();
    const s = reducer(undefined, { type: '@@init' } as any);
    const next = reducer(s, SettingsActions.changeChartColors({ colors: { upColor: '#AABBCC' } }));
    expect(next.chartColors.upColor).toBe('#AABBCC');
    expect(next.chartColors.downColor).toBe(DARK_CHART_COLORS.downColor);
  });
});

describe('settings reducer: restoreColors', () => {
  it('resets to dark theme defaults', async () => {
    const reducer = await freshReducer();
    const s = reducer(undefined, { type: '@@init' } as any);
    const changed = reducer(
      s,
      SettingsActions.changeChartColors({ colors: { upColor: '#AABBCC', background: '#123456' } }),
    );
    const restored = reducer(changed, SettingsActions.restoreColors());
    expect(restored.chartColors).toEqual(DARK_CHART_COLORS);
  });

  it('resets to light theme defaults when theme is light', async () => {
    const reducer = await freshReducer();
    const dark = reducer(undefined, { type: '@@init' } as any);
    const light = reducer(dark, SettingsActions.changeTheme({ theme: 'light' }));
    const changed = reducer(
      light,
      SettingsActions.changeChartColors({ colors: { upColor: '#AABBCC' } }),
    );
    const restored = reducer(changed, SettingsActions.restoreColors());
    expect(restored.chartColors).toEqual(LIGHT_CHART_COLORS);
  });
});

describe('settings reducer: changeGrid', () => {
  it('sets visible', async () => {
    const reducer = await freshReducer();
    const s = reducer(undefined, { type: '@@init' } as any);
    const next = reducer(s, SettingsActions.changeGrid({ visible: false }));
    expect(next.gridVisible).toBe(false);
  });

  it('clamps opacity 0..1', async () => {
    const reducer = await freshReducer();
    const s = reducer(undefined, { type: '@@init' } as any);
    const clamped = reducer(s, SettingsActions.changeGrid({ opacity: 1.5 }));
    expect(clamped.gridOpacity).toBe(1);
    const floor = reducer(s, SettingsActions.changeGrid({ opacity: -0.1 }));
    expect(floor.gridOpacity).toBe(0);
  });

  it('keeps prev when opacity is undefined', async () => {
    const reducer = await freshReducer();
    const s = reducer(undefined, { type: '@@init' } as any);
    const next = reducer(s, SettingsActions.changeGrid({ visible: false }));
    expect(next.gridOpacity).toBe(s.gridOpacity);
  });
});

describe('settings reducer: changeTradeBoxOpacity', () => {
  it('clampFill bounds', async () => {
    const reducer = await freshReducer();
    const s = reducer(undefined, { type: '@@init' } as any);
    const low = reducer(s, SettingsActions.changeTradeBoxOpacity({ fill: 0.0 }));
    expect(low.tradeBoxOpacity.fill).toBeGreaterThanOrEqual(TRADE_BOX_FILL_RANGE.min);
    const high = reducer(s, SettingsActions.changeTradeBoxOpacity({ fill: 1.0 }));
    expect(high.tradeBoxOpacity.fill).toBeLessThanOrEqual(TRADE_BOX_FILL_RANGE.max);
  });

  it('clampBorder bounds', async () => {
    const reducer = await freshReducer();
    const s = reducer(undefined, { type: '@@init' } as any);
    const low = reducer(s, SettingsActions.changeTradeBoxOpacity({ border: 0.0 }));
    expect(low.tradeBoxOpacity.border).toBeGreaterThanOrEqual(TRADE_BOX_BORDER_RANGE.min);
    const high = reducer(s, SettingsActions.changeTradeBoxOpacity({ border: 2.0 }));
    expect(high.tradeBoxOpacity.border).toBeLessThanOrEqual(TRADE_BOX_BORDER_RANGE.max);
  });

  it('keeps prev fill when fill is undefined', async () => {
    const reducer = await freshReducer();
    const s = reducer(undefined, { type: '@@init' } as any);
    const next = reducer(s, SettingsActions.changeTradeBoxOpacity({ border: 0.5 }));
    expect(next.tradeBoxOpacity.fill).toBe(DARK_TRADE_BOX_OPACITY.fill);
  });
});

describe('settings reducer: setSidePanelTab', () => {
  it('clicking the ACTIVE tab while open collapses (open:false)', async () => {
    const reducer = await freshReducer();
    const s = reducer(undefined, { type: '@@init' } as any);
    // default: tab='trade', open=true
    const next = reducer(s, SettingsActions.setSidePanelTab({ tab: 'trade' }));
    expect(next.sidePanel.open).toBe(false);
    expect(next.sidePanel.tab).toBe('trade');
  });

  it('clicking a different tab opens the panel with the new tab', async () => {
    const reducer = await freshReducer();
    const s = reducer(undefined, { type: '@@init' } as any);
    const next = reducer(s, SettingsActions.setSidePanelTab({ tab: 'settings' }));
    expect(next.sidePanel.open).toBe(true);
    expect(next.sidePanel.tab).toBe('settings');
  });

  it('clicking any tab when closed opens it', async () => {
    const reducer = await freshReducer();
    let s = reducer(undefined, { type: '@@init' } as any);
    s = reducer(s, SettingsActions.setSidePanelTab({ tab: 'trade' })); // collapse
    expect(s.sidePanel.open).toBe(false);
    const next = reducer(s, SettingsActions.setSidePanelTab({ tab: 'trade' }));
    expect(next.sidePanel.open).toBe(true);
  });
});

describe('settings reducer: toggleFloatingToolbar', () => {
  it('sets floatingToolbar to the provided value', async () => {
    const reducer = await freshReducer();
    const s = reducer(undefined, { type: '@@init' } as any);
    const off = reducer(s, SettingsActions.toggleFloatingToolbar({ visible: false }));
    expect(off.floatingToolbar).toBe(false);
    const on = reducer(off, SettingsActions.toggleFloatingToolbar({ visible: true }));
    expect(on.floatingToolbar).toBe(true);
  });
});

describe('settings reducer: setTradeBoxesVisible', () => {
  it('sets tradeBoxesVisible', async () => {
    const reducer = await freshReducer();
    const s = reducer(undefined, { type: '@@init' } as any);
    const off = reducer(s, SettingsActions.setTradeBoxesVisible({ visible: false }));
    expect(off.tradeBoxesVisible).toBe(false);
  });
});

describe('settings reducer: changeUtcOffset', () => {
  it('sets utcOffset', async () => {
    const reducer = await freshReducer();
    const s = reducer(undefined, { type: '@@init' } as any);
    const next = reducer(s, SettingsActions.changeUtcOffset({ utcOffset: 3 }));
    expect(next.utcOffset).toBe(3);
  });
});

describe('persistSettings', () => {
  it('writes JSON to localStorage', async () => {
    await vi.resetModules();
    const mod = await import('./settings.reducer');
    const reducer = mod.settingsFeature.reducer;
    const s = reducer(undefined, { type: '@@init' } as any);
    mod.persistSettings(s);
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!).theme).toBe('dark');
  });

  it('swallows a throwing setItem without throwing', async () => {
    await vi.resetModules();
    const mod = await import('./settings.reducer');
    const reducer = mod.settingsFeature.reducer;
    const s = reducer(undefined, { type: '@@init' } as any);
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    expect(() => mod.persistSettings(s)).not.toThrow();
    spy.mockRestore();
  });
});
