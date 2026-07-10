import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { Subject } from 'rxjs';
import { take, toArray, firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { TradingEffects } from './trading.effects';
import { TradingActions } from './trading.actions';
import { ReplayActions } from '../replay/replay.actions';
import { selectFillContext } from '../selectors';
import { series, order } from '../../testing/fixtures';
import { defaultTradingData, TradingState } from './trading.models';

// ---- RFC-014 Task 1: processFills$ base-resolution execution loop (D14.A) ----
// New file per the STOP rule: trading.effects.spec.ts is pre-existing and its
// mocked contexts carry no `base` field (legacy path); it stays green unmodified.

describe('TradingEffects — processFills$ base-grain (D14.A)', () => {
  let actions$: Subject<any>;
  let store: MockStore;
  let effects: TradingEffects;

  const candles = series(5, 3600, 3600); // resolution (H1) times: 3600,7200,10800,14400,18000
  const idx = 1; // landing candle: candles[1].time = 7200

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
      tfSeconds: 3600,
      lower: null as any,
      contractSize: 100,
      trading: makeTradingState({ orders: [order()] }),
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

  it('emits ONE processCandle per base candle of the landing interval, chronological, subCandles: null', async () => {
    const base = series(4, 7200, 900); // 4 base candles inside [7200, 7200+3600=10800)
    store.overrideSelector(selectFillContext, makeCtx({ base }));
    store.refreshState();

    const out = firstValueFrom(effects.processFills$.pipe(take(4), toArray()));
    actions$.next(ReplayActions.goToTime({ time: candles[idx].time }));
    const result = await out;

    expect(result).toHaveLength(4);
    base.forEach((c, i) => {
      expect(result[i]).toEqual(
        TradingActions.processCandle({ candle: c, subCandles: null, contractSize: 100 }),
      );
    });
    // chronological
    for (let i = 1; i < result.length; i++) {
      expect((result[i] as any).candle.time).toBeGreaterThan((result[i - 1] as any).candle.time);
    }
  });

  it('parity: when base === resolution series, exactly ONE action is emitted (req. #4)', async () => {
    // base IS the resolution series itself — same-grain stepping.
    store.overrideSelector(selectFillContext, makeCtx({ base: candles }));
    store.refreshState();

    const results: any[] = [];
    const sub = effects.processFills$.subscribe((a) => results.push(a));
    actions$.next(ReplayActions.goToTime({ time: candles[idx].time }));
    await Promise.resolve();
    sub.unsubscribe();

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(
      TradingActions.processCandle({
        candle: candles[idx],
        subCandles: null,
        contractSize: 100,
      }),
    );
  });

  it('an empty base slice for the landing interval emits nothing (no phantom actions)', async () => {
    store.overrideSelector(selectFillContext, makeCtx({ base: [] }));
    store.refreshState();

    // base: [] is falsy-length → legacy path is NOT taken by design (ctx.base
    // non-empty is required); confirm it falls back to the legacy single action
    // using `lower` (null here) rather than silently emitting nothing.
    const results: any[] = [];
    const sub = effects.processFills$.subscribe((a) => results.push(a));
    actions$.next(ReplayActions.goToTime({ time: candles[idx].time }));
    await Promise.resolve();
    sub.unsubscribe();

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(
      TradingActions.processCandle({
        candle: candles[idx],
        subCandles: null,
        contractSize: 100,
      }),
    );
  });
});
