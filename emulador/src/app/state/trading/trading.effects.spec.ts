import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { Subject } from 'rxjs';
import { firstValueFrom, take, toArray } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { TradingEffects } from './trading.effects';
import { TradingActions } from './trading.actions';
import { ReplayActions } from '../replay/replay.actions';
import { selectFillContext } from '../selectors';
import { series, order, position, closed } from '../../testing/fixtures';
import { defaultTradingData, TradingState } from './trading.models';

describe('TradingEffects', () => {
  let actions$: Subject<any>;
  let store: MockStore;
  let effects: TradingEffects;

  const candles = series(5, 3600, 3600); // times: 3600,7200,10800,14400,18000
  const idx = 1; // points to candles[1].time = 7200

  function makeTradingState(overrides: Partial<TradingState> = {}): TradingState {
    return {
      ...defaultTradingData(),
      summaryOpen: false,
      savedSessions: [],
      activeSessionId: null,
      ...overrides,
    };
  }

  function makeCtx(overrides: Record<string, any> = {}) {
    return {
      candles,
      idx,
      tfSeconds: 3600, // H1
      lower: null as any,
      contractSize: 100,
      trading: makeTradingState(),
      ...overrides,
    };
  }

  beforeEach(() => {
    actions$ = new Subject();
    TestBed.configureTestingModule({
      providers: [TradingEffects, provideMockActions(() => actions$), provideMockStore()],
    });
    store = TestBed.inject(MockStore);
    effects = TestBed.inject(TradingEffects);
  });

  describe('processFills$', () => {
    it('emits processCandle when cursor lands exactly on the candle time with open orders', async () => {
      const ctx = makeCtx({ trading: makeTradingState({ orders: [order()] }) });
      store.overrideSelector(selectFillContext, ctx);
      store.refreshState();

      const p = firstValueFrom(effects.processFills$);
      // time matches candles[idx].time
      actions$.next(ReplayActions.goToTime({ time: candles[idx].time }));

      const result = await p;
      expect(result).toEqual(
        TradingActions.processCandle({
          candle: candles[idx],
          subCandles: null,
          contractSize: 100,
        }),
      );
    });

    it('emits processCandle with subCandles when a lower TF series is loaded', async () => {
      const m1Candles = series(60, candles[idx].time, 60); // 60 M1 candles within the H1 bar
      const ctx = makeCtx({
        trading: makeTradingState({ positions: [position()] }),
        lower: m1Candles,
      });
      store.overrideSelector(selectFillContext, ctx);
      store.refreshState();

      const p = firstValueFrom(effects.processFills$);
      actions$.next(ReplayActions.goToTime({ time: candles[idx].time }));

      const result: any = await p;
      expect(result.type).toBe(TradingActions.processCandle.type);
      // subCandles must be an array (sliced from M1)
      expect(Array.isArray(result.subCandles)).toBe(true);
    });

    it('is filtered when idx < 0', async () => {
      const ctx = makeCtx({ idx: -1, trading: makeTradingState({ orders: [order()] }) });
      store.overrideSelector(selectFillContext, ctx);
      store.refreshState();

      const results: any[] = [];
      const sub = effects.processFills$.pipe(take(1)).subscribe((a) => results.push(a));

      actions$.next(ReplayActions.goToTime({ time: candles[0].time }));
      await Promise.resolve();
      expect(results.length).toBe(0);
      sub.unsubscribe();
    });

    it('is filtered when there is no active timeframe (tfSeconds 0)', async () => {
      const ctx = makeCtx({ tfSeconds: 0, trading: makeTradingState({ orders: [order()] }) });
      store.overrideSelector(selectFillContext, ctx);
      store.refreshState();

      const results: any[] = [];
      const sub = effects.processFills$.pipe(take(1)).subscribe((a) => results.push(a));

      actions$.next(ReplayActions.goToTime({ time: candles[idx].time }));
      await Promise.resolve();
      expect(results.length).toBe(0);
      sub.unsubscribe();
    });

    it('is filtered when candle.time !== action.time (a jump)', async () => {
      const ctx = makeCtx({ trading: makeTradingState({ orders: [order()] }) });
      store.overrideSelector(selectFillContext, ctx);
      store.refreshState();

      const results: any[] = [];
      const sub = effects.processFills$.pipe(take(1)).subscribe((a) => results.push(a));

      // send a different time → jump
      actions$.next(ReplayActions.goToTime({ time: 99999 }));
      await Promise.resolve();
      expect(results.length).toBe(0);
      sub.unsubscribe();
    });

    it('is filtered when session is already ended', async () => {
      const ctx = makeCtx({
        trading: makeTradingState({ orders: [order()], sessionEnded: true }),
      });
      store.overrideSelector(selectFillContext, ctx);
      store.refreshState();

      const results: any[] = [];
      const sub = effects.processFills$.pipe(take(1)).subscribe((a) => results.push(a));

      actions$.next(ReplayActions.goToTime({ time: candles[idx].time }));
      await Promise.resolve();
      expect(results.length).toBe(0);
      sub.unsubscribe();
    });

    it('is filtered when there are no orders and no positions', async () => {
      const ctx = makeCtx({ trading: makeTradingState() });
      store.overrideSelector(selectFillContext, ctx);
      store.refreshState();

      const results: any[] = [];
      const sub = effects.processFills$.pipe(take(1)).subscribe((a) => results.push(a));

      actions$.next(ReplayActions.goToTime({ time: candles[idx].time }));
      await Promise.resolve();
      expect(results.length).toBe(0);
      sub.unsubscribe();
    });
  });

  describe('endOnSchedule$', () => {
    it('emits [pause, endSession] when candle.time >= sessionEnd', async () => {
      const ctx = makeCtx({
        trading: makeTradingState({ sessionEnd: candles[idx].time }),
      });
      store.overrideSelector(selectFillContext, ctx);
      store.refreshState();

      const p = effects.endOnSchedule$.pipe(take(2), toArray()).toPromise();
      actions$.next(ReplayActions.goToTime({ time: candles[idx].time }));

      const result = await p;
      expect(result).toEqual([
        ReplayActions.pause(),
        TradingActions.endSession({
          price: candles[idx].close,
          time: candles[idx].time,
          contractSize: 100,
        }),
      ]);
    });

    it('is filtered when session is already ended', async () => {
      const ctx = makeCtx({
        trading: makeTradingState({ sessionEnd: candles[idx].time, sessionEnded: true }),
      });
      store.overrideSelector(selectFillContext, ctx);
      store.refreshState();

      const results: any[] = [];
      const sub = effects.endOnSchedule$.pipe(take(1)).subscribe((a) => results.push(a));

      actions$.next(ReplayActions.goToTime({ time: candles[idx].time }));
      await Promise.resolve();
      expect(results.length).toBe(0);
      sub.unsubscribe();
    });

    it('is filtered when it is a jump (candle.time !== action.time)', async () => {
      const ctx = makeCtx({
        trading: makeTradingState({ sessionEnd: candles[idx].time }),
      });
      store.overrideSelector(selectFillContext, ctx);
      store.refreshState();

      const results: any[] = [];
      const sub = effects.endOnSchedule$.pipe(take(1)).subscribe((a) => results.push(a));

      actions$.next(ReplayActions.goToTime({ time: 99999 }));
      await Promise.resolve();
      expect(results.length).toBe(0);
      sub.unsubscribe();
    });
  });

  describe('endOnDataExhausted$', () => {
    it('emits endSession when there is open activity (positions)', async () => {
      const ctx = makeCtx({ trading: makeTradingState({ positions: [position()] }) });
      store.overrideSelector(selectFillContext, ctx);
      store.refreshState();

      const p = firstValueFrom(effects.endOnDataExhausted$);
      actions$.next(ReplayActions.endOfData());

      const result = await p;
      expect(result).toEqual(
        TradingActions.endSession({
          price: candles[idx].close,
          time: candles[idx].time,
          contractSize: 100,
        }),
      );
    });

    it('emits endSession when there is history', async () => {
      const ctx = makeCtx({ trading: makeTradingState({ history: [closed()] }) });
      store.overrideSelector(selectFillContext, ctx);
      store.refreshState();

      const p = firstValueFrom(effects.endOnDataExhausted$);
      actions$.next(ReplayActions.endOfData());

      const result = await p;
      expect(result.type).toBe(TradingActions.endSession.type);
    });

    it('is filtered when idx < 0', async () => {
      const ctx = makeCtx({ idx: -1, trading: makeTradingState({ history: [closed()] }) });
      store.overrideSelector(selectFillContext, ctx);
      store.refreshState();

      const results: any[] = [];
      const sub = effects.endOnDataExhausted$.pipe(take(1)).subscribe((a) => results.push(a));

      actions$.next(ReplayActions.endOfData());
      await Promise.resolve();
      expect(results.length).toBe(0);
      sub.unsubscribe();
    });

    it('is filtered when session is already ended', async () => {
      const ctx = makeCtx({
        trading: makeTradingState({ positions: [position()], sessionEnded: true }),
      });
      store.overrideSelector(selectFillContext, ctx);
      store.refreshState();

      const results: any[] = [];
      const sub = effects.endOnDataExhausted$.pipe(take(1)).subscribe((a) => results.push(a));

      actions$.next(ReplayActions.endOfData());
      await Promise.resolve();
      expect(results.length).toBe(0);
      sub.unsubscribe();
    });

    it('is filtered when there is no activity', async () => {
      const ctx = makeCtx({ trading: makeTradingState() });
      store.overrideSelector(selectFillContext, ctx);
      store.refreshState();

      const results: any[] = [];
      const sub = effects.endOnDataExhausted$.pipe(take(1)).subscribe((a) => results.push(a));

      actions$.next(ReplayActions.endOfData());
      await Promise.resolve();
      expect(results.length).toBe(0);
      sub.unsubscribe();
    });
  });
});
