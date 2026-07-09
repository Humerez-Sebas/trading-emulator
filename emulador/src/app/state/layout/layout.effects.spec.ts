import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LayoutEffects } from './layout.effects';
import { LayoutActions } from './layout.actions';
import { layoutFeature } from './layout.reducer';
import { marketFeature } from '../market/market.reducer';
import { MarketActions } from '../market/market.actions';
import { PanelDescriptor } from './layout.models';
import { Timeframe } from '../../models';

function panel(overrides: Partial<PanelDescriptor> = {}): PanelDescriptor {
  return { id: 'p1', symbol: 'EURUSD', timeframe: 'H1', linkGroupId: null, ...overrides };
}

describe('LayoutEffects', () => {
  let actions$: Subject<any>;
  let store: MockStore;
  let effects: LayoutEffects;

  beforeEach(() => {
    actions$ = new Subject();
    TestBed.configureTestingModule({
      providers: [LayoutEffects, provideMockActions(() => actions$), provideMockStore()],
    });
    store = TestBed.inject(MockStore);
    effects = TestBed.inject(LayoutEffects);
  });

  afterEach(() => {
    store.resetSelectors();
  });

  describe('syncTimeframeOnFocus$', () => {
    it('emits nothing when the focused panel is unknown (no noop action)', async () => {
      store.overrideSelector(layoutFeature.selectPanels, {});
      store.overrideSelector(marketFeature.selectSeries, {});
      const emitted: unknown[] = [];
      effects.syncTimeframeOnFocus$.subscribe((a) => emitted.push(a));

      actions$.next(LayoutActions.setFocusedPanel({ panelId: 'ghost' }));

      expect(emitted).toEqual([]);
    });

    it('emits MarketActions.changeTimeframe for a standard-timeframe focus when it cannot be aggregated (e.g. H4)', async () => {
      store.overrideSelector(layoutFeature.selectPanels, {
        p1: panel({ id: 'p1', timeframe: 'H4' }),
      });
      store.overrideSelector(marketFeature.selectSeries, {});
      const emitted: unknown[] = [];
      effects.syncTimeframeOnFocus$.subscribe((a) => emitted.push(a));

      actions$.next(LayoutActions.setFocusedPanel({ panelId: 'p1' }));

      expect(emitted).toEqual([MarketActions.changeTimeframe({ tf: 'H4' })]);
    });

    it('emits MarketActions.changeTimeframe for a loaded standard timeframe (e.g. M1)', async () => {
      store.overrideSelector(layoutFeature.selectPanels, {
        p1: panel({ id: 'p1', timeframe: 'M1' }),
      });
      store.overrideSelector(marketFeature.selectSeries, {
        M1: [{} as any], // Mock a loaded series for M1
      });
      const emitted: unknown[] = [];
      effects.syncTimeframeOnFocus$.subscribe((a) => emitted.push(a));

      actions$.next(LayoutActions.setFocusedPanel({ panelId: 'p1' }));

      expect(emitted).toEqual([MarketActions.changeTimeframe({ tf: 'M1' })]);
    });

    it('emits MarketActions.changeCustomTimeframe for a standard but unloaded timeframe starting with M (e.g. M5)', async () => {
      store.overrideSelector(layoutFeature.selectPanels, {
        p1: panel({ id: 'p1', timeframe: 'M5' }),
      });
      store.overrideSelector(marketFeature.selectSeries, {
        M1: [{} as any], // M5 is not loaded
      });
      const emitted: unknown[] = [];
      effects.syncTimeframeOnFocus$.subscribe((a) => emitted.push(a));

      actions$.next(LayoutActions.setFocusedPanel({ panelId: 'p1' }));

      expect(emitted).toEqual([MarketActions.changeCustomTimeframe({ minutes: 5 })]);
    });

    it('emits MarketActions.changeCustomTimeframe for a custom timeframe (e.g. M6)', async () => {
      store.overrideSelector(layoutFeature.selectPanels, {
        p1: panel({ id: 'p1', timeframe: 'M6' as Timeframe }),
      });
      store.overrideSelector(marketFeature.selectSeries, {});
      const emitted: unknown[] = [];
      effects.syncTimeframeOnFocus$.subscribe((a) => emitted.push(a));

      actions$.next(LayoutActions.setFocusedPanel({ panelId: 'p1' }));

      expect(emitted).toEqual([MarketActions.changeCustomTimeframe({ minutes: 6 })]);
    });

    it('emits MarketActions.changeCustomTimeframe for a custom-timeframe focus (existing test)', async () => {
      store.overrideSelector(layoutFeature.selectPanels, {
        p1: panel({ id: 'p1', timeframe: 'M7' as Timeframe }),
      });
      store.overrideSelector(marketFeature.selectSeries, {});
      const emitted: unknown[] = [];
      effects.syncTimeframeOnFocus$.subscribe((a) => emitted.push(a));

      actions$.next(LayoutActions.setFocusedPanel({ panelId: 'p1' }));

      expect(emitted).toEqual([MarketActions.changeCustomTimeframe({ minutes: 7 })]);
    });
  });
});
