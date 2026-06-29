import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { Subject } from 'rxjs';
import { firstValueFrom, take, toArray } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReplayEffects } from './replay.effects';
import { ReplayActions } from './replay.actions';
import {
  selectActiveCandles,
  selectCurrentTime,
  selectFillContext,
  selectMsPerCandle,
  selectPlaying,
  selectReplayIndex,
  selectReplaySeries,
  selectVisibleIndex,
} from '../selectors';
import { replayFeature } from './replay.reducer';
import { TradingActions } from '../trading/trading.actions';
import { series } from '../../testing/fixtures';

describe('ReplayEffects', () => {
  let actions$: Subject<any>;
  let store: MockStore;
  let effects: ReplayEffects;

  const candles = series(5, 0, 3600); // times: 0, 3600, 7200, 10800, 14400

  beforeEach(() => {
    actions$ = new Subject();
    TestBed.configureTestingModule({
      providers: [ReplayEffects, provideMockActions(() => actions$), provideMockStore()],
    });
    store = TestBed.inject(MockStore);
    effects = TestBed.inject(ReplayEffects);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('advance$', () => {
    it('emits goToTime with the next candle time when idx+1 < length', async () => {
      store.overrideSelector(selectReplaySeries, candles);
      store.overrideSelector(selectReplayIndex, 1); // next = candles[2].time = 7200
      store.refreshState();

      const p = firstValueFrom(effects.advance$);
      actions$.next(ReplayActions.advanceCandle());

      expect(await p).toEqual(ReplayActions.goToTime({ time: 7200 }));
    });

    it('emits endOfData when idx+1 >= candles.length', async () => {
      store.overrideSelector(selectReplaySeries, candles);
      store.overrideSelector(selectReplayIndex, 4); // idx 4 is the last
      store.refreshState();

      const p = firstValueFrom(effects.advance$);
      actions$.next(ReplayActions.advanceCandle());

      expect(await p).toEqual(ReplayActions.endOfData());
    });

    it('emits endOfData when candles are empty', async () => {
      store.overrideSelector(selectReplaySeries, []);
      store.overrideSelector(selectReplayIndex, -1);
      store.refreshState();

      const p = firstValueFrom(effects.advance$);
      actions$.next(ReplayActions.advanceCandle());

      expect(await p).toEqual(ReplayActions.endOfData());
    });
  });

  describe('advance$ en modo resolución', () => {
    it('avanza a la próxima vela de resolución', async () => {
      const res = series(4, 0, 300); // M5: 0,300,600,900
      store.overrideSelector(selectReplaySeries, res);
      store.overrideSelector(selectReplayIndex, 1); // next = 600
      store.refreshState();

      const p = firstValueFrom(effects.advance$);
      actions$.next(ReplayActions.advanceCandle());
      expect(await p).toEqual(ReplayActions.goToTime({ time: 600 }));
    });
  });

  describe('stepBack$ (Display Navigation)', () => {
    // display H1 candles: times 0, 3600, 7200, 10800, 14400
    it('snaps to the current display-bucket start when the cursor is mid-bucket', async () => {
      store.overrideSelector(selectActiveCandles, candles);
      store.overrideSelector(selectVisibleIndex, 2); // bucket start = candles[2].time = 7200
      store.overrideSelector(selectCurrentTime, 7200 + 1800); // mid-bucket
      store.refreshState();

      const p = firstValueFrom(effects.stepBack$);
      actions$.next(ReplayActions.stepBack());

      expect(await p).toEqual(ReplayActions.goToTime({ time: 7200 }));
    });

    it('snaps to the previous display candle when the cursor is already on a boundary', async () => {
      store.overrideSelector(selectActiveCandles, candles);
      store.overrideSelector(selectVisibleIndex, 2);
      store.overrideSelector(selectCurrentTime, 7200); // exactly on the boundary
      store.refreshState();

      const p = firstValueFrom(effects.stepBack$);
      actions$.next(ReplayActions.stepBack());

      expect(await p).toEqual(ReplayActions.goToTime({ time: 3600 }));
    });

    it('does not emit at the first display candle (cannot go back)', async () => {
      store.overrideSelector(selectActiveCandles, candles);
      store.overrideSelector(selectVisibleIndex, 0);
      store.overrideSelector(selectCurrentTime, candles[0].time); // 0
      store.refreshState();

      const results: any[] = [];
      const sub = effects.stepBack$.subscribe((a) => results.push(a));
      actions$.next(ReplayActions.stepBack());

      await Promise.resolve();
      expect(results).toHaveLength(0);
      sub.unsubscribe();
    });
  });

  describe('advanceDisplay$ (Display Navigation)', () => {
    it('full-candle mode: advances exactly one display candle', async () => {
      const c = series(5, 0, 3600); // display === resolution
      store.overrideSelector(selectFillContext, {
        candles: c,
        idx: 1,
        tfSeconds: 3600,
        lower: null,
        contractSize: 1,
        trading: { sessionEnd: null } as any,
      });
      store.overrideSelector(selectActiveCandles, c);
      store.overrideSelector(selectVisibleIndex, 1);
      store.refreshState();

      const out = firstValueFrom(effects.advanceDisplay$.pipe(take(1), toArray()));
      actions$.next(ReplayActions.advanceDisplay());
      expect(await out).toEqual([ReplayActions.goToTime({ time: c[2].time })]);
    });

    it('resolution mode: snaps to the next display candle, processing every crossed resolution candle', async () => {
      // display H1: 0, 3600 ; resolution M5 (300s): 0,300,...,3600 (idx 0..12)
      const display = series(2, 0, 3600);
      const res = series(13, 0, 300);
      store.overrideSelector(selectFillContext, {
        candles: res,
        idx: 7, // cursor at res[7] = 2100 (35 min into the hour)
        tfSeconds: 300,
        lower: null,
        contractSize: 1,
        trading: { sessionEnd: null } as any,
      });
      store.overrideSelector(selectActiveCandles, display);
      store.overrideSelector(selectVisibleIndex, 0); // display bucket 0 (0..3600)
      store.refreshState();

      const out = firstValueFrom(effects.advanceDisplay$.pipe(take(5), toArray()));
      actions$.next(ReplayActions.advanceDisplay());
      const result = await out;

      // intermediate res candles 8..11 processed, then goToTime lands on 3600 (res[12])
      expect(result[0]).toEqual(
        TradingActions.processCandle({ candle: res[8], subCandles: null, contractSize: 1 }),
      );
      expect(result[3]).toEqual(
        TradingActions.processCandle({ candle: res[11], subCandles: null, contractSize: 1 }),
      );
      expect(result[4]).toEqual(ReplayActions.goToTime({ time: 3600 }));
    });

    it('emits endOfData at the last display candle', async () => {
      const c = series(3, 0, 3600);
      store.overrideSelector(selectFillContext, {
        candles: c,
        idx: 2,
        tfSeconds: 3600,
        lower: null,
        contractSize: 1,
        trading: { sessionEnd: null } as any,
      });
      store.overrideSelector(selectActiveCandles, c);
      store.overrideSelector(selectVisibleIndex, 2); // last display candle
      store.refreshState();

      const p = firstValueFrom(effects.advanceDisplay$);
      actions$.next(ReplayActions.advanceDisplay());
      expect(await p).toEqual(ReplayActions.endOfData());
    });
  });

  describe('autoplay$', () => {
    it('emits advanceCandle on each interval tick when playing is true', async () => {
      vi.useFakeTimers();
      store.overrideSelector(selectPlaying, true);
      store.overrideSelector(selectMsPerCandle, 1000);
      store.refreshState();

      const p = effects.autoplay$.pipe(take(2), toArray()).toPromise();

      // Advance two intervals
      vi.advanceTimersByTime(2000);

      const result = await p;
      expect(result).toEqual([ReplayActions.advanceCandle(), ReplayActions.advanceCandle()]);
    });

    it('emits nothing when playing is false', async () => {
      vi.useFakeTimers();
      store.overrideSelector(selectPlaying, false);
      store.overrideSelector(selectMsPerCandle, 1000);
      store.refreshState();

      const results: any[] = [];
      const sub = effects.autoplay$.subscribe((a) => results.push(a));

      vi.advanceTimersByTime(5000);
      expect(results.length).toBe(0);

      sub.unsubscribe();
    });
  });

  describe('jumpForward$', () => {
    it('procesa las velas intermedias y aterriza con goToTime en la vela objetivo', async () => {
      const c = series(6, 0, 3600); // idx 0..5
      store.overrideSelector(selectFillContext, {
        candles: c,
        idx: 1,
        tfSeconds: 3600,
        lower: null,
        contractSize: 1,
        trading: { orders: [], positions: [], sessionEnd: null, sessionEnded: false } as any,
      });
      store.overrideSelector(replayFeature.selectJumpSize, 3); // to = 4
      store.refreshState();

      const out = firstValueFrom(effects.jumpForward$.pipe(take(3), toArray()));
      actions$.next(ReplayActions.jumpForward());
      const result = await out;

      // velas intermedias 2 y 3 procesadas, luego goToTime a candles[4]
      expect(result[0]).toEqual(
        TradingActions.processCandle({ candle: c[2], subCandles: null, contractSize: 1 }),
      );
      expect(result[1]).toEqual(
        TradingActions.processCandle({ candle: c[3], subCandles: null, contractSize: 1 }),
      );
      expect(result[2]).toEqual(ReplayActions.goToTime({ time: c[4].time }));
    });

    it('clampa `to` al fin de los datos cuando jumpSize excede el rango', async () => {
      const c = series(6, 0, 3600); // idx 0..5
      store.overrideSelector(selectFillContext, {
        candles: c,
        idx: 2,
        tfSeconds: 3600,
        lower: null,
        contractSize: 1,
        trading: { orders: [], positions: [], sessionEnd: null, sessionEnded: false } as any,
      });
      store.overrideSelector(replayFeature.selectJumpSize, 10); // to = min(12, 5) = 5
      store.refreshState();

      const out = firstValueFrom(effects.jumpForward$.pipe(take(3), toArray()));
      actions$.next(ReplayActions.jumpForward());
      const result = await out;

      expect(result[0]).toEqual(
        TradingActions.processCandle({ candle: c[3], subCandles: null, contractSize: 1 }),
      );
      expect(result[1]).toEqual(
        TradingActions.processCandle({ candle: c[4], subCandles: null, contractSize: 1 }),
      );
      expect(result[2]).toEqual(ReplayActions.goToTime({ time: c[5].time }));
    });

    it('clampa `to` para no pasar un fin de sesión programado', async () => {
      const c = series(6, 0, 3600); // times 0,3600,7200,10800,14400,18000
      store.overrideSelector(selectFillContext, {
        candles: c,
        idx: 1,
        tfSeconds: 3600,
        lower: null,
        contractSize: 1,
        // sessionEnd = c[3].time (10800): el clamp debe aterrizar exactamente en c[3]
        trading: { orders: [], positions: [], sessionEnd: c[3].time, sessionEnded: false } as any,
      });
      store.overrideSelector(replayFeature.selectJumpSize, 4); // to=5 → clamp baja a 3
      store.refreshState();

      const out = firstValueFrom(effects.jumpForward$.pipe(take(2), toArray()));
      actions$.next(ReplayActions.jumpForward());
      const result = await out;

      // intermedia c[2] procesada, luego goToTime aterriza en c[3] (== sessionEnd)
      expect(result[0]).toEqual(
        TradingActions.processCandle({ candle: c[2], subCandles: null, contractSize: 1 }),
      );
      expect(result[1]).toEqual(ReplayActions.goToTime({ time: c[3].time }));
    });
  });

  describe('jumpBack$', () => {
    it('emite goToTime jumpSize velas atrás (clamp a 0)', async () => {
      const c = series(6, 0, 3600);
      store.overrideSelector(selectReplaySeries, c);
      store.overrideSelector(selectReplayIndex, 2);
      store.overrideSelector(replayFeature.selectJumpSize, 10); // max(0, 2-10)=0
      store.refreshState();

      const p = firstValueFrom(effects.jumpBack$);
      actions$.next(ReplayActions.jumpBack());
      expect(await p).toEqual(ReplayActions.goToTime({ time: c[0].time }));
    });
  });
});
