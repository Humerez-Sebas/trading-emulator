import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { Subject, firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MarketEffects } from './market.effects';
import { MarketActions } from './market.actions';
import { ReplayActions } from '../replay/replay.actions';
import { marketFeature } from './market.reducer';
import { series } from '../../testing/fixtures';

describe('MarketEffects', () => {
  let actions$: Subject<any>;
  let store: MockStore;
  let effects: MarketEffects;

  beforeEach(() => {
    actions$ = new Subject();
    TestBed.configureTestingModule({
      providers: [MarketEffects, provideMockActions(() => actions$), provideMockStore()],
    });
    store = TestBed.inject(MockStore);
    effects = TestBed.inject(MarketEffects);
  });

  // isolate:false discipline (docs/engineering/testing.md §"isolate:false discipline" #1):
  // forced selector results live on the module-level memoized selector, which
  // TestBed.resetTestingModule() does not undo — they must be released here or
  // they poison every later spec file in the same vitest worker.
  afterEach(() => store.resetSelectors());

  describe('replayResolution$', () => {
    it('replayResolution$ genera desde los anchors al setReplayResolution', async () => {
      const m1 = series(120, 0, 60); // 120 velas M1
      store.overrideSelector(marketFeature.selectSeries, { M1: m1 });
      store.refreshState();

      const p = firstValueFrom(effects.replayResolution$);
      actions$.next(ReplayActions.setReplayResolution({ minutes: 5 }));
      const result = await p;

      expect(result.type).toBe(MarketActions.replayResolutionGenerated.type);
      expect((result as any).minutes).toBe(5);
      expect((result as any).candles.length).toBe(24); // 120 M1 / 5 = 24 velas M5
    });
  });
});
