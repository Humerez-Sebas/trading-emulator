import { afterEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { SettingsPanelComponent } from './settings-panel.component';
import { SettingsActions } from '../../state/settings/settings.actions';
import {
  selectChartColors,
  selectFloatingToolbar,
  selectGridOpacity,
  selectGridVisible,
  selectTheme,
  selectTradeBoxOpacity,
  selectUtcOffset,
} from '../../state/selectors';
import {
  DARK_CHART_COLORS,
  DARK_TRADE_BOX_OPACITY,
  NEW_YORK_SHIFT_HOURS,
} from '../../state/settings/settings.models';

/**
 * The dock's time-zone control. The preset VALUES used to be hardcoded in the
 * template (`-5` for NY, `+3` for MT5) under the assumption that stored candles
 * are UTC. They are broker server time — New York + 7 h — so those literals drew
 * the 09:30 ET open at 11:30 and shifted server time by a further 3 h.
 *
 * These specs render the real template, because the template is where the wrong
 * numbers lived; asserting on the constants alone would not have caught them.
 */

let store: MockStore;

afterEach(() => {
  store?.resetSelectors();
});

function setup(shiftHours = NEW_YORK_SHIFT_HOURS) {
  TestBed.configureTestingModule({ providers: [provideMockStore()] });
  store = TestBed.inject(MockStore);
  store.overrideSelector(selectTheme, 'dark');
  store.overrideSelector(selectChartColors, DARK_CHART_COLORS);
  store.overrideSelector(selectUtcOffset, shiftHours);
  store.overrideSelector(selectGridVisible, false);
  store.overrideSelector(selectGridOpacity, 1);
  store.overrideSelector(selectFloatingToolbar, true);
  store.overrideSelector(selectTradeBoxOpacity, DARK_TRADE_BOX_OPACITY);

  const fixture = TestBed.createComponent(SettingsPanelComponent);
  fixture.detectChanges();
  return fixture;
}

/** The rendered preset buttons, keyed by their visible code. */
function presetButtons(fixture: ReturnType<typeof setup>): Record<string, HTMLButtonElement> {
  const buttons = Array.from(
    fixture.nativeElement.querySelectorAll('.tz-preset-btn'),
  ) as HTMLButtonElement[];
  return Object.fromEntries(buttons.map((b) => [b.textContent!.replace(/[~\s]/g, ''), b]));
}

describe('SettingsPanelComponent — time zone presets', () => {
  it('dispatches −7 for New York, not the −5 the template used to hardcode', () => {
    const fixture = setup();
    const dispatched: unknown[] = [];
    store.scannedActions$.subscribe((a) => dispatched.push(a));

    presetButtons(fixture)['NY'].click();

    expect(dispatched).toContainEqual(SettingsActions.changeUtcOffset({ utcOffset: -7 }));
  });

  it('dispatches 0 for MT5 server time, not the +3 the template used to hardcode', () => {
    const fixture = setup();
    const dispatched: unknown[] = [];
    store.scannedActions$.subscribe((a) => dispatched.push(a));

    presetButtons(fixture)['MT5'].click();

    expect(dispatched).toContainEqual(SettingsActions.changeUtcOffset({ utcOffset: 0 }));
  });

  it('marks the New York preset active at the default shift', () => {
    const buttons = presetButtons(setup(NEW_YORK_SHIFT_HOURS));
    expect(buttons['NY'].classList.contains('active')).toBe(true);
    expect(buttons['MT5'].classList.contains('active')).toBe(false);
  });

  it('flags the approximate presets in the UI and leaves the exact ones unflagged', () => {
    const fixture = setup();
    const flagged = Array.from(fixture.nativeElement.querySelectorAll('.tz-preset-btn'))
      .filter((b) => (b as HTMLElement).querySelector('.tz-approx'))
      .map((b) => (b as HTMLElement).textContent!.replace(/[~\s]/g, ''));

    expect(flagged.sort()).toEqual(['LDN', 'MAD', 'TYO']);
  });

  it('no longer claims the data is kept in UTC', () => {
    const hints = Array.from(setup().nativeElement.querySelectorAll('.hint'))
      .map((p) => (p as HTMLElement).textContent ?? '')
      .join(' ');

    expect(hints).not.toMatch(/se mantienen en UTC/);
    expect(hints).toMatch(/hora del servidor/i);
  });
});
