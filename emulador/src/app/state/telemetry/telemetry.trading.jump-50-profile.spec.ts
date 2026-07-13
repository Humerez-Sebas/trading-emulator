import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { Subscription, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TelemetryEffects } from './telemetry.effects';
import { ReplayActions } from '../replay/replay.actions';
import {
  selectCurrentTime,
  selectExecutionSeries,
  selectPlaying,
  selectReplayIndex,
  selectReplayTfSeconds,
} from '../selectors';
import { tradingFeature } from '../trading/trading.reducer';
import { defaultTradingData, TradingState, Position, PendingOrder } from '../trading/trading.models';
import { drawingsFeature } from '../drawings/drawings.reducer';
import type { Drawing } from '../drawings/drawings.models';
import { TelemetryDbService } from '../../services/telemetry-db.service';
import type { Candle } from '../../models';

/**
 * V-8 frame-budget evidence (RFC-014 §4, N-2: "el presupuesto de 16 ms/frame
 * se mide con la captura activa") — RFC-014 T5b-ii.
 *
 * Methodology: measures the OBSERVER PIPELINE in isolation — every
 * `TelemetryEffects` subscription wired up exactly as `provideEffects` wires
 * it in production, against a `TelemetryDbService.append` STUB that resolves
 * immediately (matches production: `append` itself buffers in memory and
 * flushes asynchronously off the hot path per `telemetry-db.service.ts`'s
 * own design — real IndexedDB I/O is never on the synchronous call path
 * `capture()` runs on, so stubbing it here measures exactly what production
 * pays synchronously: the diffing/mapping/`capture()`-call overhead, not
 * disk I/O). Burst: 50 `processCandle`-equivalent state transitions with
 * open positions (25 pending-order fills into `positions[]`, immediately
 * followed by 25 closes into `history[]` — each transition individually
 * diffed by `facts$`, matching how one real `processCandle` dispatch would
 * land) plus a fold's worth of navigation events (5 `ReplaySeek`, 5
 * `ReplayJump`-shaped jump+landing pairs, 4 play/pause toggles) and 5 order
 * placements (`orderPlacement$` + `TimeElapsedBeforeOrder` + a
 * `DrawingSnapshot` copy of 8 drawings each placement/close).
 *
 * Bound: this repo's `*.eight-panel-profile.spec.ts` idiom
 * (`chart-model-mapper.eight-panel-profile.spec.ts`) asserts behavior
 * (fan-out counts), not wall-clock time — there is no existing wall-clock
 * profiling idiom to follow verbatim, so this spec adds one: a GENEROUS,
 * documented-as-generous, non-flaky bound (`< 50ms` for the WHOLE burst in
 * jsdom on shared CI hardware) rather than asserting close to the real
 * 16ms/frame production budget, which jsdom timing is far too noisy to
 * assert tightly (R1 — PHILOSOPHY §2.9: no measured gap, no optimization;
 * this spec exists to SURFACE a gap if one ever appears, not to prove
 * sub-16ms jsdom timing, which would not be a meaningful proxy for real
 * browser frame timing anyway).
 */
describe('TelemetryEffects — V-8 frame-budget evidence (RFC-014 T5b-ii, jump-50 burst)', () => {
  let actions$: Subject<any>;
  let store: MockStore;
  let effects: TelemetryEffects;
  let telemetryDb: { append: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    actions$ = new Subject();
    telemetryDb = { append: vi.fn().mockResolvedValue(undefined) };
    TestBed.configureTestingModule({
      providers: [
        TelemetryEffects,
        provideMockActions(() => actions$),
        provideMockStore(),
        { provide: TelemetryDbService, useValue: telemetryDb },
      ],
    });
    store = TestBed.inject(MockStore);
    effects = TestBed.inject(TelemetryEffects);
  });

  afterEach(() => {
    store.resetSelectors();
  });

  function subscribeAll(): Subscription {
    const sub = new Subscription();
    const priv = effects as unknown as Record<string, { subscribe: () => Subscription }>;
    sub.add(priv['sessionAnchorReset$'].subscribe());
    sub.add(effects.replaySeek$.subscribe());
    sub.add(priv['syncJumpOrigin$'].subscribe());
    sub.add(effects.replayJump$.subscribe());
    sub.add(effects.playbackToggled$.subscribe());
    sub.add(effects.speedChanged$.subscribe());
    sub.add(effects.facts$.subscribe());
    sub.add(effects.orderPlacement$.subscribe());
    sub.add(priv['orderClockOnSeek$'].subscribe());
    sub.add(priv['orderClockOnPlayback$'].subscribe());
    return sub;
  }

  function trading(over: Partial<TradingState> = {}): TradingState {
    return {
      ...defaultTradingData(),
      summaryOpen: false,
      savedSessions: [],
      activeSessionId: 'sess-1',
      ...over,
    };
  }

  const pos = (id: string, openTime: number, origin: 'limit' | 'stop' = 'limit'): Position => ({
    id,
    side: 'buy',
    entryPrice: 100,
    sl: 90,
    tp: 120,
    lots: 1,
    riskPct: 1,
    riskUsd: 10,
    openTime,
    origin,
  });

  const order = (id: string, createdAt: number): PendingOrder => ({
    id,
    side: 'buy',
    type: 'limit',
    entryPrice: 100,
    sl: 90,
    tp: 120,
    lots: 1,
    riskPct: 1,
    riskUsd: 10,
    createdAt,
  });

  const M1: Candle[] = Array.from({ length: 2000 }, (_, i) => ({
    time: i * 60,
    open: 1,
    high: 1,
    low: 1,
    close: 1,
  }));

  const drawings: Drawing[] = Array.from({ length: 8 }, (_, i) => ({
    id: `d${i}`,
    kind: (['rect', 'line', 'fib', 'ruler'] as const)[i % 4],
    p1: { time: i * 10, price: i },
    p2: { time: i * 10 + 5, price: i + 1 },
  }));

  function arm(state: TradingState, replayIndex: number, currentTime: number, playing = false) {
    store.overrideSelector(tradingFeature.selectTradingState, state);
    store.overrideSelector(tradingFeature.selectActiveSessionId, state.activeSessionId);
    store.overrideSelector(selectExecutionSeries, M1);
    store.overrideSelector(selectReplayIndex, replayIndex);
    store.overrideSelector(selectCurrentTime, currentTime);
    store.overrideSelector(selectReplayTfSeconds, 60);
    store.overrideSelector(selectPlaying, playing);
    store.overrideSelector(drawingsFeature.selectItems, drawings);
    store.refreshState();
  }

  it('processes a jump-50 burst (50 open-position state transitions + a fold of navigation events) within a generous non-flaky bound', () => {
    let state = trading();
    arm(state, 0, 0);
    const sub = subscribeAll();

    const start = performance.now();

    // 5 order placements up front (orderPlacement$ + TimeElapsedBeforeOrder + DrawingSnapshot).
    for (let i = 0; i < 5; i++) {
      state = trading({ ...state, orders: [...state.orders, order(`o${i}`, i * 60)] });
      arm(state, i, i * 60);
    }

    // 25 fills (facts$ -> OrderFilled) into positions[].
    for (let i = 0; i < 25; i++) {
      state = trading({ ...state, positions: [...state.positions, pos(`p${i}`, i * 60, i % 2 === 0 ? 'limit' : 'stop')] });
      arm(state, i, i * 60);
    }

    // 25 closes (facts$ -> PositionClosed + DrawingSnapshot) of those same 25 positions.
    for (let i = 0; i < 25; i++) {
      const closing = state.positions.find((p) => p.id === `p${i}`)!;
      state = trading({
        ...state,
        positions: state.positions.filter((p) => p.id !== `p${i}`),
        history: [
          ...state.history,
          {
            id: closing.id,
            side: closing.side,
            origin: closing.origin,
            entryPrice: closing.entryPrice,
            exitPrice: 105,
            sl: closing.sl,
            tp: closing.tp,
            lots: closing.lots,
            riskPct: closing.riskPct,
            riskUsd: closing.riskUsd,
            openTime: closing.openTime,
            closeTime: closing.openTime + 60,
            outcome: 'tp' as const,
            profit: 50,
            rMultiple: 1,
            ambiguous: false,
          },
        ],
      });
      arm(state, 25 + i, (25 + i) * 60);
    }

    // A fold's worth of navigation events: 5 seeks, 5 jump+landing pairs, 4 play/pause toggles.
    for (let i = 0; i < 5; i++) {
      arm(state, 50 + i, (50 + i) * 60);
      actions$.next(ReplayActions.seekTo({ time: (55 + i) * 60 }));
    }
    for (let i = 0; i < 5; i++) {
      arm(state, 55 + i, (55 + i) * 60);
      actions$.next(ReplayActions.jumpForward());
      arm(state, 60 + i, (60 + i) * 60);
      actions$.next(ReplayActions.goToTime({ time: (60 + i) * 60 }));
    }
    for (let i = 0; i < 4; i++) {
      actions$.next(i % 2 === 0 ? ReplayActions.play() : ReplayActions.pause());
    }

    const elapsedMs = performance.now() - start;

    sub.unsubscribe();

    // Sanity: the burst actually drove the observer (not a silent no-op).
    expect(telemetryDb.append.mock.calls.length).toBeGreaterThan(50);

    console.log(`[V-8] jump-50 burst observer overhead: ${elapsedMs.toFixed(2)}ms (bound: 50ms, real budget: 16ms/frame)`);

    // GENEROUS, documented-as-generous bound — see the file-level doc comment.
    expect(elapsedMs).toBeLessThan(50);
  });
});
