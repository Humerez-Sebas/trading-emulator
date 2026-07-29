import { describe, it, expect, vi, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { ChartComponent } from './chart.component';
import { ChartModelMapper } from './chart-model-mapper.service';
import { PanelDescriptor } from '../../state/layout/layout.models';
import {
  selectCurrentAsset,
  selectDataRange,
  selectPlacementTime,
  selectTradePanelView,
} from '../../state/selectors';
import { selectRuleSlotMap } from '../../state/playbook/playbook.selectors';
import { drawingsFeature } from '../../state/drawings/drawings.reducer';
import { linkGroupsFeature } from '../../state/link-groups/link-groups.reducer';
import { layoutFeature } from '../../state/layout/layout.reducer';
import { ReplayActions } from '../../state/replay/replay.actions';
import { TradingActions } from '../../state/trading/trading.actions';
import { NEW_YORK_SHIFT_HOURS, SERVER_SHIFT_HOURS } from '../../state/settings/settings.models';

/**
 * The dock's display shift as ChartComponent applies it: `render()` turns the
 * offset into `shiftSecs`, which then feeds the time axis, the crosshair, the
 * drawings, and the two datetime dialogs ("Ir a fecha", "Programar fin de sesión").
 *
 * Candle timestamps are stored in the broker's server clock — New York + 7 h, all
 * year — so `shiftSecs` shifts SERVER time, not UTC. The dialogs are the sharpest
 * case: they both read and WRITE through the shift, so an offset that is wrong by
 * N hours moves the instant the user schedules by N hours.
 *
 * Harness follows `chart.component.trade-guard.spec.ts` — see its header for why
 * `ngAfterViewInit` is stubbed. The private fields `series`/`engine` and the mapper
 * builders are scaffolded because `render()` walks the full paint path.
 */

const TRADE_CTX = {
  balance: 10_000,
  initialBalance: 10_000,
  equity: 10_000,
  floating: 0,
  orders: [],
  positions: [],
  history: [],
  sessionEnded: false,
  summaryOpen: false,
  riskPct: 1,
  price: 100,
  time: 0,
  contractSize: 100_000,
  pointSize: 0.01,
};

const descriptor: PanelDescriptor = {
  id: 'panel-1',
  symbol: 'US30',
  timeframe: 'M1',
  linkGroupId: null,
};

/** Epoch seconds of a server-clock wall time (stored timestamps read as if UTC). */
const stored = (serverWallTime: string) => Date.parse(`${serverWallTime}Z`) / 1000;

const RANGE = { from: stored('2026-01-01T00:00:00'), to: stored('2026-12-31T23:59:00') };

let store: MockStore;

afterEach(() => {
  vi.restoreAllMocks();
  store?.resetSelectors();
});

/** Boots a ChartComponent whose paint path is inert but whose `render()` runs. */
function setup(cursor = 0) {
  vi.spyOn(ChartComponent.prototype, 'ngAfterViewInit').mockImplementation(() => {});

  TestBed.configureTestingModule({
    providers: [
      provideMockStore(),
      {
        provide: ChartModelMapper,
        useValue: {
          descriptor: signal(descriptor),
          sessionEnd: signal<number | null>(null),
          buildCountdownModel: () => undefined,
          buildDrawingsModel: () => undefined,
          buildTradingModel: () => undefined,
          buildSessionModel: () => undefined,
        } as unknown as ChartModelMapper,
      },
    ],
  });
  store = TestBed.inject(MockStore);
  store.overrideSelector(selectCurrentAsset, 'US30');
  store.overrideSelector(selectTradePanelView, { ...TRADE_CTX, time: cursor });
  store.overrideSelector(selectPlacementTime, cursor);
  store.overrideSelector(selectDataRange, RANGE);
  store.overrideSelector(selectRuleSlotMap, {});
  store.overrideSelector(drawingsFeature.selectActiveTool, 'none');
  store.overrideSelector(drawingsFeature.selectClipboard, null);
  store.overrideSelector(linkGroupsFeature.selectGroups, {});
  store.overrideSelector(layoutFeature.selectFocusedPanelId, null);

  const fixture = TestBed.createComponent(ChartComponent);
  const component = fixture.componentInstance as any;
  component.series = { update: () => {}, setData: () => {} };
  // `destroy` is what the fixture teardown calls; the rest is the paint path.
  component.engine = { render: () => {}, destroy: () => {} };
  return component;
}

/** Drives one `render()` at the given offset — the only path that sets `shiftSecs`. */
function renderAt(component: any, offsetHours: number): void {
  component.render('M1', [], -1, offsetHours, null, null);
}

describe('ChartComponent — display shift over broker server time', () => {
  it('derives shiftSecs from the offset in hours', () => {
    const component = setup();
    renderAt(component, NEW_YORK_SHIFT_HOURS);
    expect(component.shiftSecs).toBe(-7 * 3600);
  });

  it('leaves shiftSecs at zero for the MT5 preset — the data is already server time', () => {
    const component = setup();
    renderAt(component, SERVER_SHIFT_HOURS);
    expect(component.shiftSecs).toBe(0);
  });

  describe('"Ir a fecha" / "Programar fin de sesión" dialogs', () => {
    it('opens at the New York wall clock of the replay cursor', () => {
      // The cursor sits on the 09:30 ET open: 16:30 on the stored server clock.
      const component = setup(stored('2026-07-15T16:30:00'));
      renderAt(component, NEW_YORK_SHIFT_HOURS);

      component.menuGoToDate();

      expect(component.dateDialog()!.value).toBe('2026-07-15T09:30');
    });

    it('shows the stored server clock when the shift is 0', () => {
      const component = setup(stored('2026-07-15T16:30:00'));
      renderAt(component, SERVER_SHIFT_HOURS);

      component.menuGoToDate();

      expect(component.dateDialog()!.value).toBe('2026-07-15T16:30');
    });

    it('reads a typed New York time back to the stored server instant', () => {
      const component = setup(stored('2026-07-15T16:30:00'));
      renderAt(component, NEW_YORK_SHIFT_HOURS);
      const dispatch = vi.spyOn(store, 'dispatch');

      component.dateDialog.set({ mode: 'goto', value: '2026-07-15T09:30' });
      component.confirmDateDialog();

      expect(dispatch).toHaveBeenCalledWith(
        ReplayActions.goToTime({ time: stored('2026-07-15T16:30:00') }),
      );
    });

    it('schedules a session end at the New York time the user typed', () => {
      const component = setup(stored('2026-07-15T16:30:00'));
      renderAt(component, NEW_YORK_SHIFT_HOURS);
      const dispatch = vi.spyOn(store, 'dispatch');

      // 16:49 ET is the stored 23:49 daily close.
      component.dateDialog.set({ mode: 'end', value: '2026-07-15T16:49' });
      component.confirmDateDialog();

      expect(dispatch).toHaveBeenCalledWith(
        TradingActions.setSessionEnd({ time: stored('2026-07-15T23:49:00') }),
      );
    });

    it('round-trips: what the dialog shows is what it writes back', () => {
      const cursor = stored('2026-07-15T16:30:00');
      const component = setup(cursor);
      renderAt(component, NEW_YORK_SHIFT_HOURS);
      const dispatch = vi.spyOn(store, 'dispatch');

      component.menuGoToDate();
      component.confirmDateDialog();

      expect(dispatch).toHaveBeenCalledWith(ReplayActions.goToTime({ time: cursor }));
    });
  });
});
