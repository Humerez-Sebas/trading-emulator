import { afterEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { ControlsComponent } from './controls.component';
import {
  selectActiveTf,
  selectAssets,
  selectCurrentAsset,
  selectCurrentTime,
  selectCustomTf,
  selectProgress,
  selectSessionTfs,
  selectTfLastTimes,
  selectUtcOffset,
} from '../../state/selectors';
import { NEW_YORK_SHIFT_HOURS, SERVER_SHIFT_HOURS } from '../../state/settings/settings.models';

/**
 * `shortTfTip` is the second consumer of the dock's display shift (see
 * `toolbar-tools.component.spec.ts` for the third and the shared reasoning): the
 * stored epoch is broker server time — New York + 7 h, all year — so the shift is
 * applied to the SERVER clock, never to UTC.
 *
 * The date matters here rather than the hour: a coverage warning that names the
 * wrong day sends the user hunting for data that is present.
 */

/** Epoch seconds of a server-clock wall time (stored timestamps read as if UTC). */
const stored = (serverWallTime: string) => Date.parse(`${serverWallTime}Z`) / 1000;

let store: MockStore;

afterEach(() => {
  store?.resetSelectors();
});

describe('ControlsComponent.shortTfTip — display shift over broker server time', () => {
  /** Builds the component with `H1` coverage ending at `lastServerTime`. */
  function component(shiftHours: number, lastServerTime: number): ControlsComponent {
    TestBed.configureTestingModule({ providers: [provideMockStore()] });
    store = TestBed.inject(MockStore);
    store.overrideSelector(selectUtcOffset, shiftHours);
    store.overrideSelector(selectSessionTfs, ['H1']);
    store.overrideSelector(selectTfLastTimes, { H1: lastServerTime });
    store.overrideSelector(selectActiveTf, 'H1');
    store.overrideSelector(selectCustomTf, null);
    store.overrideSelector(selectAssets, []);
    store.overrideSelector(selectCurrentAsset, 'US30');
    store.overrideSelector(selectProgress, { shown: 0, total: 0 });
    store.overrideSelector(selectCurrentTime, 0);

    return TestBed.runInInjectionContext(() => new ControlsComponent());
  }

  it('names the New York day, not the server day, at the New York shift', () => {
    // stored 01:05 on the 15th is still 18:05 ET on the 14th.
    const tip = component(NEW_YORK_SHIFT_HOURS, stored('2026-07-15T01:05:00')).shortTfTip('H1');
    expect(tip).toContain('14 jul 2026');
  });

  it('keeps the server day at the MT5 shift of 0', () => {
    const tip = component(SERVER_SHIFT_HOURS, stored('2026-07-15T01:05:00')).shortTfTip('H1');
    expect(tip).toContain('15 jul 2026');
  });

  it('returns an empty tip when the TF has no recorded coverage', () => {
    TestBed.configureTestingModule({ providers: [provideMockStore()] });
    store = TestBed.inject(MockStore);
    store.overrideSelector(selectUtcOffset, NEW_YORK_SHIFT_HOURS);
    store.overrideSelector(selectSessionTfs, ['H1']);
    store.overrideSelector(selectTfLastTimes, {});
    store.overrideSelector(selectActiveTf, 'H1');
    store.overrideSelector(selectCustomTf, null);
    store.overrideSelector(selectAssets, []);
    store.overrideSelector(selectCurrentAsset, 'US30');
    store.overrideSelector(selectProgress, { shown: 0, total: 0 });
    store.overrideSelector(selectCurrentTime, 0);

    const c = TestBed.runInInjectionContext(() => new ControlsComponent());
    expect(c.shortTfTip('H1')).toBe('');
  });
});
