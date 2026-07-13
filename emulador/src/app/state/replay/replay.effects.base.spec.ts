import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { Subject } from 'rxjs';
import { take, toArray, firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { ReplayEffects } from './replay.effects';
import { ReplayActions } from './replay.actions';
import {
  selectActiveCandles,
  selectCurrentTime,
  selectFillContext,
  selectVisibleIndex,
} from '../selectors';
import { replayFeature } from './replay.reducer';
import { TradingActions } from '../trading/trading.actions';
import { series } from '../../testing/fixtures';

// ---- RFC-014 Task 1: foldForwardFills base-resolution execution loop (D14.A) ----
// New file per the STOP rule: replay.effects.spec.ts is pre-existing and its
// mocked contexts carry no `base` field (legacy path); it stays green unmodified.

describe('ReplayEffects — foldForwardFills base-grain (D14.A)', () => {
  let actions$: Subject<any>;
  let store: MockStore;
  let effects: ReplayEffects;

  beforeEach(() => {
    actions$ = new Subject();
    TestBed.configureTestingModule({
      providers: [ReplayEffects, provideMockActions(() => actions$), provideMockStore()],
    });
    store = TestBed.inject(MockStore);
    effects = TestBed.inject(ReplayEffects);
  });

  describe('jumpForward$', () => {
    it('emits N base candles per crossed resolution candle, chronological, none skipped/duplicated', async () => {
      // resolution (H1) candles: 0, 3600, 7200, 10800
      const c = series(4, 0, 3600);
      // base (M15) candles: 4 per H1, times 0..9900 step 900 (12 candles)
      const base = series(12, 0, 900);
      store.overrideSelector(selectFillContext, {
        candles: c,
        idx: 0,
        tfSeconds: 3600,
        lower: null,
        contractSize: 1,
        trading: { orders: [], positions: [], sessionEnd: null, sessionEnded: false } as any,
        base,
      });
      store.overrideSelector(replayFeature.selectJumpSize, 3); // to = min(0+3,3) = 3 → target c[3]=10800
      store.refreshState();

      // crosses c[1]=3600 and c[2]=7200 (c[3] is the landing candle, not "crossed")
      // → 4 base candles per crossed resolution candle = 8, + 1 landing goToTime = 9
      const out = firstValueFrom(effects.jumpForward$.pipe(take(9), toArray()));
      actions$.next(ReplayActions.jumpForward());
      const result = await out;

      expect(result).toHaveLength(9);
      const expectedBaseTimes = [3600, 4500, 5400, 6300, 7200, 8100, 9000, 9900];
      expectedBaseTimes.forEach((t, i) => {
        const action = result[i] as any;
        expect(action.type).toBe(TradingActions.processCandle.type);
        expect(action.candle.time).toBe(t);
        expect(action.subCandles).toBeNull();
      });
      // landing
      expect(result[8]).toEqual(ReplayActions.goToTime({ time: 10800 }));
    });

    it('clamps `to` at a scheduled session end and the base fold still respects it', async () => {
      const c = series(4, 0, 3600); // 0,3600,7200,10800
      const base = series(8, 0, 900); // 0..6300
      store.overrideSelector(selectFillContext, {
        candles: c,
        idx: 0,
        tfSeconds: 3600,
        lower: null,
        contractSize: 1,
        // sessionEnd = c[1].time (3600): the jump must clamp there
        trading: { orders: [], positions: [], sessionEnd: c[1].time, sessionEnded: false } as any,
        base,
      });
      store.overrideSelector(replayFeature.selectJumpSize, 3); // to=3 → clamp down to 1
      store.refreshState();

      const out = firstValueFrom(effects.jumpForward$.pipe(take(1), toArray()));
      actions$.next(ReplayActions.jumpForward());
      const result = await out;

      // no resolution candle strictly crossed before the clamped target (idx+1=1, target=3600,
      // loop condition candles[1].time < 3600 is false) → only the landing goToTime
      expect(result).toEqual([ReplayActions.goToTime({ time: 3600 })]);
    });
  });

  describe('advanceDisplay$', () => {
    it('resolution mode: base-grain fold for every crossed resolution candle, landing via goToTime', async () => {
      // display H1: 0, 3600 ; resolution M30 (1800s): 0, 1800, 3600
      const display = series(2, 0, 3600);
      const res = series(3, 0, 1800);
      // base (M15, 900s): 2 per M30 resolution candle
      const base = series(4, 0, 900); // 0, 900, 1800, 2700
      store.overrideSelector(selectFillContext, {
        candles: res,
        idx: 0, // cursor at res[0] = 0
        tfSeconds: 1800,
        lower: null,
        contractSize: 1,
        trading: { sessionEnd: null } as any,
        base,
      });
      store.overrideSelector(selectActiveCandles, display);
      store.overrideSelector(selectVisibleIndex, 0);
      store.overrideSelector(selectCurrentTime, res[0].time);
      store.refreshState();

      // target = display[1].time = 3600; crosses res[1]=1800 (res[2]=3600 is the landing)
      // base candles for [1800, 3600) = [1800, 2700] → 2 actions, then landing
      const out = firstValueFrom(effects.advanceDisplay$.pipe(take(3), toArray()));
      actions$.next(ReplayActions.advanceDisplay());
      const result = await out;

      expect(result[0]).toEqual(
        TradingActions.processCandle({ candle: base[2], subCandles: null, contractSize: 1 }),
      );
      expect(result[1]).toEqual(
        TradingActions.processCandle({ candle: base[3], subCandles: null, contractSize: 1 }),
      );
      expect(result[2]).toEqual(ReplayActions.goToTime({ time: 3600 }));
    });
  });
});
