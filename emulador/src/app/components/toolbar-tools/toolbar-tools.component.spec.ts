import { afterEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ElementRef } from '@angular/core';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { ToolbarToolsComponent } from './toolbar-tools.component';
import {
  selectClosedTradeBoxes,
  selectTradeBoxesVisible,
  selectDisplayZone,
} from '../../state/selectors';
import { drawingsFeature } from '../../state/drawings/drawings.reducer';
import { layoutFeature } from '../../state/layout/layout.reducer';
import { NEW_YORK_ZONE_ID, SERVER_ZONE_ID } from '../../domain/chart/display-time';

/**
 * `formatTime` is one of the three consumers of the dock's display zone (the
 * others are `ChartComponent` and `ControlsComponent.shortTfTip`). All three go
 * through `toDisplayTime`, so the stored broker-server epoch becomes the clock
 * the trader actually reads off a closed trade.
 */

let store: MockStore;

afterEach(() => {
  store?.resetSelectors();
});

/** Epoch seconds of a server-clock wall time (stored timestamps read as if UTC). */
const stored = (serverWallTime: string) => Date.parse(`${serverWallTime}Z`) / 1000;

describe('ToolbarToolsComponent.formatTime — display shift over broker server time', () => {
  /** Builds the component off a store whose display shift is `shiftHours`. */
  function component(zoneId: string): ToolbarToolsComponent {
    TestBed.configureTestingModule({
      providers: [
        provideMockStore(),
        // The component injects its host for the click-outside listener; building
        // it outside a rendered view means DI has to be handed one.
        { provide: ElementRef, useValue: new ElementRef(document.createElement('div')) },
      ],
    });
    store = TestBed.inject(MockStore);
    store.overrideSelector(selectDisplayZone, zoneId);
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
    expect(component(NEW_YORK_ZONE_ID).formatTime(stored('2026-07-15T16:30:00'))).toBe(
      '15/07 09:30',
    );
  });

  it('holds across the US DST switch — the zone follows it', () => {
    expect(component(NEW_YORK_ZONE_ID).formatTime(stored('2026-01-15T16:30:00'))).toBe(
      '15/01 09:30',
    );
  });

  it('shows the stored clock verbatim in the MT5 server zone', () => {
    expect(component(SERVER_ZONE_ID).formatTime(stored('2026-07-15T23:49:00'))).toBe('15/07 23:49');
  });

  it('rolls the date back when the zone crosses midnight', () => {
    // stored 01:05 (the daily session open) is 18:05 ET the PREVIOUS day.
    expect(component(NEW_YORK_ZONE_ID).formatTime(stored('2026-07-15T01:05:00'))).toBe(
      '14/07 18:05',
    );
  });
});

describe('ToolbarToolsComponent.formatTime — a fixed UTC offset does not follow the zone', () => {
  function component(zoneId: string): ToolbarToolsComponent {
    TestBed.configureTestingModule({
      providers: [
        provideMockStore(),
        { provide: ElementRef, useValue: new ElementRef(document.createElement('div')) },
      ],
    });
    store = TestBed.inject(MockStore);
    store.overrideSelector(selectDisplayZone, zoneId);
    store.overrideSelector(selectTradeBoxesVisible, true);
    store.overrideSelector(selectClosedTradeBoxes, []);
    store.overrideSelector(drawingsFeature.selectActiveTool, 'none');
    store.overrideSelector(drawingsFeature.selectSelection, {});
    store.overrideSelector(drawingsFeature.selectEntities, {});
    store.overrideSelector(layoutFeature.selectFocusedPanelId, null);
    return TestBed.runInInjectionContext(() => new ToolbarToolsComponent());
  }

  it('UTC−4 stamps the 09:30 ET open at 09:30 in summer', () => {
    expect(component('utc-4').formatTime(stored('2026-07-15T16:30:00'))).toBe('15/07 09:30');
  });

  it('UTC−4 stamps the same open at 10:30 in winter', () => {
    expect(component('utc-4').formatTime(stored('2026-01-15T16:30:00'))).toBe('15/01 10:30');
  });
});
