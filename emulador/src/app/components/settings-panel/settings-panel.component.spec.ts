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
  selectDisplayZone,
} from '../../state/selectors';
import { DARK_CHART_COLORS, DARK_TRADE_BOX_OPACITY } from '../../state/settings/settings.models';
import { NEW_YORK_ZONE_ID, SERVER_ZONE_ID } from '../../domain/chart/display-time';

/**
 * The dock's time-zone control. It picks a ZONE id, not a number: `ny` and
 * `server` follow US DST on their own, everything else is a genuine fixed UTC
 * offset. These specs render the real template, because the template is where the
 * hardcoded values used to live; asserting on the constants alone would not have
 * caught them.
 */

let store: MockStore;

afterEach(() => {
  store?.resetSelectors();
});

function setup(zoneId: string = NEW_YORK_ZONE_ID) {
  TestBed.configureTestingModule({ providers: [provideMockStore()] });
  store = TestBed.inject(MockStore);
  store.overrideSelector(selectTheme, 'dark');
  store.overrideSelector(selectChartColors, DARK_CHART_COLORS);
  store.overrideSelector(selectDisplayZone, zoneId);
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
  it('dispatches the New York zone, which carries its own DST', () => {
    const fixture = setup();
    const dispatched: unknown[] = [];
    store.scannedActions$.subscribe((a) => dispatched.push(a));

    presetButtons(fixture)['NY'].click();

    expect(dispatched).toContainEqual(
      SettingsActions.changeDisplayZone({ displayZone: NEW_YORK_ZONE_ID }),
    );
  });

  it('dispatches the MT5 server zone, not a UTC offset', () => {
    const fixture = setup();
    const dispatched: unknown[] = [];
    store.scannedActions$.subscribe((a) => dispatched.push(a));

    presetButtons(fixture)['MT5'].click();

    expect(dispatched).toContainEqual(
      SettingsActions.changeDisplayZone({ displayZone: SERVER_ZONE_ID }),
    );
  });

  it('dispatches a real fixed UTC offset for Tokyo', () => {
    const fixture = setup();
    const dispatched: unknown[] = [];
    store.scannedActions$.subscribe((a) => dispatched.push(a));

    presetButtons(fixture)['TYO'].click();

    expect(dispatched).toContainEqual(SettingsActions.changeDisplayZone({ displayZone: 'utc+9' }));
  });

  it('marks the New York preset active by default', () => {
    const buttons = presetButtons(setup(NEW_YORK_ZONE_ID));
    expect(buttons['NY'].classList.contains('active')).toBe(true);
    expect(buttons['MT5'].classList.contains('active')).toBe(false);
  });

  it('flags only the presets a fixed offset cannot track all year', () => {
    // Tokyo is no longer flagged: Japan has no DST, so UTC+9 is exact.
    const fixture = setup();
    const flagged = Array.from(fixture.nativeElement.querySelectorAll('.tz-preset-btn'))
      .filter((b) => (b as HTMLElement).querySelector('.tz-approx'))
      .map((b) => (b as HTMLElement).textContent!.replace(/[~\s]/g, ''));

    expect(flagged.sort()).toEqual(['LDN', 'MAD']);
  });

  it('explains the clock without claiming the data is kept in UTC', () => {
    const hints = Array.from(setup().nativeElement.querySelectorAll('.hint'))
      .map((p) => (p as HTMLElement).textContent ?? '')
      .join(' ');

    expect(hints).not.toMatch(/se mantienen en UTC/);
    expect(hints).toMatch(/hora del servidor/i);
  });

  it('warns that a fixed UTC offset moves the New York open to 10:30 in winter', () => {
    // The behaviour is pinned in display-time.spec.ts; this is the disclosure.
    const hints = Array.from(setup().nativeElement.querySelectorAll('.hint'))
      .map((p) => (p as HTMLElement).textContent ?? '')
      .join(' ');

    expect(hints).toMatch(/9:30/);
    expect(hints).toMatch(/10:30/);
    expect(hints).toMatch(/invierno/i);
  });
});
