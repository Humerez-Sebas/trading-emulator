import { afterEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ElementRef } from '@angular/core';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { ToolbarToolsComponent } from './toolbar-tools.component';
import {
  selectClosedTradeBoxes,
  selectTradeBoxesVisible,
  selectUtcOffset,
} from '../../state/selectors';
import { drawingsFeature } from '../../state/drawings/drawings.reducer';
import { layoutFeature } from '../../state/layout/layout.reducer';
import { NEW_YORK_SHIFT_HOURS, SERVER_SHIFT_HOURS } from '../../state/settings/settings.models';

/**
 * `formatTime` is one of the three consumers of the dock's display shift (the
 * others are `ChartComponent.shiftSecs` and `ControlsComponent.shortTfTip`). All
 * three apply the same arithmetic: add `shift * 3600` to the stored epoch, then
 * render as UTC.
 *
 * The stored epoch is broker server time (New York + 7 h, all year), NOT UTC, so
 * these specs pin what a trader actually reads off a closed trade rather than the
 * arithmetic in isolation.
 */

let store: MockStore;

afterEach(() => {
  store?.resetSelectors();
});

/** Epoch seconds of a server-clock wall time (stored timestamps read as if UTC). */
const stored = (serverWallTime: string) => Date.parse(`${serverWallTime}Z`) / 1000;

describe('ToolbarToolsComponent.formatTime — display shift over broker server time', () => {
  /** Builds the component off a store whose display shift is `shiftHours`. */
  function component(shiftHours: number): ToolbarToolsComponent {
    TestBed.configureTestingModule({
      providers: [
        provideMockStore(),
        // The component injects its host for the click-outside listener; building
        // it outside a rendered view means DI has to be handed one.
        { provide: ElementRef, useValue: new ElementRef(document.createElement('div')) },
      ],
    });
    store = TestBed.inject(MockStore);
    store.overrideSelector(selectUtcOffset, shiftHours);
    store.overrideSelector(selectTradeBoxesVisible, true);
    store.overrideSelector(selectClosedTradeBoxes, []);
    store.overrideSelector(drawingsFeature.selectActiveTool, 'none');
    store.overrideSelector(drawingsFeature.selectSelection, {});
    store.overrideSelector(drawingsFeature.selectEntities, {});
    store.overrideSelector(layoutFeature.selectFocusedPanelId, null);

    return TestBed.runInInjectionContext(() => new ToolbarToolsComponent());
  }

  it('stamps a trade closed at the 09:30 ET open as 09:30 at the New York shift', () => {
    // NY 09:30 on a July day is 16:30 on the server clock.
    expect(component(NEW_YORK_SHIFT_HOURS).formatTime(stored('2026-07-15T16:30:00'))).toBe(
      '15/07 09:30',
    );
  });

  it('holds across the US DST switch — the same integer, both seasons', () => {
    expect(component(NEW_YORK_SHIFT_HOURS).formatTime(stored('2026-01-15T16:30:00'))).toBe(
      '15/01 09:30',
    );
  });

  it('shows the stored clock verbatim at the MT5 shift of 0', () => {
    expect(component(SERVER_SHIFT_HOURS).formatTime(stored('2026-07-15T23:49:00'))).toBe(
      '15/07 23:49',
    );
  });

  it('rolls the date back when the shift crosses midnight', () => {
    // stored 01:05 (the daily session open) is 18:05 ET the PREVIOUS day.
    expect(component(NEW_YORK_SHIFT_HOURS).formatTime(stored('2026-07-15T01:05:00'))).toBe(
      '14/07 18:05',
    );
  });
});
