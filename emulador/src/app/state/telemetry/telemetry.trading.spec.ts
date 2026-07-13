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
} from '../selectors';
import { tradingFeature } from '../trading/trading.reducer';
import { defaultTradingData, TradingState, Position, ClosedTrade, PendingOrder } from '../trading/trading.models';
import { drawingsFeature } from '../drawings/drawings.reducer';
import type { Drawing } from '../drawings/drawings.models';
import { TelemetryDbService } from '../../services/telemetry-db.service';
import type { Candle } from '../../models';

describe('TelemetryEffects — trading observer (RFC-014 T5b-ii)', () => {
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
    vi.restoreAllMocks();
  });

  function subscribeAll(): Subscription {
    const sub = new Subscription();
    const priv = effects as unknown as Record<string, { subscribe: () => Subscription }>;
    // sessionAnchorReset$ MUST be subscribed first: it stamps the initial
    // 'sessionStart' orderClock off activeSessionId$'s current (replayed)
    // value the instant it is subscribed, exactly like production
    // (provideEffects subscribes every effect property, order-independent —
    // see telemetry.effects.ts's doc comment for why that ordering is safe).
    sub.add(priv['sessionAnchorReset$'].subscribe());
    sub.add(effects.facts$.subscribe());
    sub.add(effects.orderPlacement$.subscribe());
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

  function arm(
    state: TradingState,
    opts: {
      base?: Candle[] | null;
      replayIndex?: number;
      currentTime?: number;
      playing?: boolean;
      drawings?: Drawing[];
    } = {},
  ) {
    store.overrideSelector(tradingFeature.selectTradingState, state);
    store.overrideSelector(tradingFeature.selectActiveSessionId, state.activeSessionId);
    store.overrideSelector(selectExecutionSeries, opts.base ?? null);
    store.overrideSelector(selectReplayIndex, opts.replayIndex ?? 0);
    store.overrideSelector(selectCurrentTime, opts.currentTime ?? 0);
    store.overrideSelector(selectPlaying, opts.playing ?? false);
    store.overrideSelector(drawingsFeature.selectItems, opts.drawings ?? []);
    store.refreshState();
  }

  const pos = (over: Partial<Position> = {}): Position => ({
    id: 'p1',
    side: 'buy',
    entryPrice: 100,
    sl: 90,
    tp: 120,
    lots: 1,
    riskPct: 1,
    riskUsd: 10,
    openTime: 1000,
    origin: 'market',
    ...over,
  });

  const order = (over: Partial<PendingOrder> = {}): PendingOrder => ({
    id: 'o1',
    side: 'buy',
    type: 'limit',
    entryPrice: 100,
    sl: 90,
    tp: 120,
    lots: 1,
    riskPct: 1,
    riskUsd: 10,
    createdAt: 500,
    ...over,
  });

  const closedTrade = (over: Partial<ClosedTrade> = {}): ClosedTrade => ({
    id: 't1',
    side: 'buy',
    origin: 'market',
    entryPrice: 100,
    exitPrice: 110,
    sl: 90,
    tp: 120,
    lots: 1,
    riskPct: 1,
    riskUsd: 10,
    openTime: 1000,
    closeTime: 2000,
    outcome: 'tp',
    profit: 100,
    rMultiple: 1,
    ambiguous: false,
    ...over,
  });

  const candle = (time: number): Candle => ({ time, open: 1, high: 1, low: 1, close: 1 });

  type AppendCall = [string, { kind: string; payload: any }[]];

  const calls = (kind: string): AppendCall[] =>
    (telemetryDb.append.mock.calls as AppendCall[]).filter(([, events]) =>
      events.some((e) => e.kind === kind),
    );

  // ─── facts$ ─────────────────────────────────────────────────────────────

  describe('facts$', () => {
    it('a new limit-order fill emits OrderFilled', async () => {
      arm(trading());
      const sub = subscribeAll();

      arm(trading({ positions: [pos({ id: 'p1', origin: 'limit', entryPrice: 105, openTime: 1200 })] }));
      await Promise.resolve();

      expect(calls('OrderFilled')).toHaveLength(1);
      expect(telemetryDb.append).toHaveBeenCalledWith(
        'sess-1',
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'OrderFilled',
            marketTime: 1200,
            payload: { tradeId: 'p1', executedPrice: 105, marketTime: 1200 },
          }),
        ]),
      );
      sub.unsubscribe();
    });

    it('a market-origin position opening emits NO OrderFilled', async () => {
      arm(trading());
      const sub = subscribeAll();

      arm(trading({ positions: [pos({ id: 'p1', origin: 'market' })] }));
      await Promise.resolve();

      expect(calls('OrderFilled')).toHaveLength(0);
      sub.unsubscribe();
    });

    it('a position closing emits PositionClosed AND a DrawingSnapshot(eventRef=tradeId)', async () => {
      const drawing: Drawing = { id: 'd1', kind: 'rect', p1: { time: 1, price: 1 }, p2: { time: 2, price: 2 } };
      arm(trading({ positions: [pos({ id: 'p1', origin: 'limit' })] }), { drawings: [drawing] });
      const sub = subscribeAll();

      arm(
        trading({ history: [closedTrade({ id: 'p1', origin: 'limit', outcome: 'manual', closeTime: 3000 })] }),
        { drawings: [drawing] },
      );
      await Promise.resolve();

      expect(calls('PositionClosed')).toHaveLength(1);
      const snapshotCall = calls('DrawingSnapshot')[0];
      expect(snapshotCall[1][0]).toMatchObject({
        kind: 'DrawingSnapshot',
        payload: { eventRef: 'p1', drawings: [{ type: 'rect' }] },
      });
      sub.unsubscribe();
    });

    it('same-candle fill+close emits OrderFilled THEN PositionClosed for the same trade', async () => {
      arm(trading());
      const sub = subscribeAll();

      arm(
        trading({
          history: [
            closedTrade({ id: 'x1', origin: 'stop', outcome: 'sl', openTime: 1500, closeTime: 1500 }),
          ],
        }),
      );
      await Promise.resolve();

      const orderFilledCall = calls('OrderFilled');
      const positionClosedCall = calls('PositionClosed');
      expect(orderFilledCall).toHaveLength(1);
      expect(positionClosedCall).toHaveLength(1);
      // append is called once per emission (capture() = one append per event), in emission order:
      const kindsInOrder = (telemetryDb.append.mock.calls as AppendCall[]).map(([, events]) => events[0].kind);
      expect(kindsInOrder.indexOf('OrderFilled')).toBeLessThan(kindsInOrder.indexOf('PositionClosed'));
      sub.unsubscribe();
    });

    it('a session switch (activeSessionId changes) emits nothing spurious for the incoming session pre-existing data', async () => {
      arm(trading({ activeSessionId: 'sess-1', positions: [pos({ id: 'p1', origin: 'limit' })] }));
      const sub = subscribeAll();

      // switch to sess-2, which already has its OWN pre-existing position/history
      arm(
        trading({
          activeSessionId: 'sess-2',
          positions: [pos({ id: 'p9', origin: 'limit' })],
          history: [closedTrade({ id: 'h9', origin: 'market' })],
        }),
      );
      await Promise.resolve();

      expect(telemetryDb.append).not.toHaveBeenCalled();
      sub.unsubscribe();
    });

    it('after a session switch, the NEXT genuine change on the new session diffs correctly against the fresh baseline', async () => {
      arm(trading({ activeSessionId: 'sess-1', positions: [pos({ id: 'p1', origin: 'limit' })] }));
      const sub = subscribeAll();

      arm(trading({ activeSessionId: 'sess-2', positions: [pos({ id: 'p9', origin: 'limit' })] }));
      await Promise.resolve();
      expect(telemetryDb.append).not.toHaveBeenCalled();

      // a genuinely NEW fill in sess-2, on top of its pre-existing p9
      arm(
        trading({
          activeSessionId: 'sess-2',
          positions: [pos({ id: 'p9', origin: 'limit' }), pos({ id: 'p10', origin: 'stop' })],
        }),
      );
      await Promise.resolve();

      expect(calls('OrderFilled')).toHaveLength(1);
      expect(telemetryDb.append).toHaveBeenCalledWith(
        'sess-2',
        expect.arrayContaining([expect.objectContaining({ kind: 'OrderFilled' })]),
      );
      sub.unsubscribe();
    });

    it('fillBaseIndex is resolved when a base series is present', async () => {
      const base = [candle(1000), candle(1100), candle(1200)];
      arm(trading(), { base });
      const sub = subscribeAll();

      arm(trading({ positions: [pos({ id: 'p1', origin: 'limit', openTime: 1200 })] }), { base });
      await Promise.resolve();

      const call = calls('OrderFilled')[0];
      expect(call[1][0].payload).toMatchObject({ fillBaseIndex: 2 });
      sub.unsubscribe();
    });

    it('fillBaseIndex is OMITTED (key absent) when there is no base series', async () => {
      arm(trading(), { base: null });
      const sub = subscribeAll();

      arm(trading({ positions: [pos({ id: 'p1', origin: 'limit', openTime: 1200 })] }), { base: null });
      await Promise.resolve();

      const call = calls('OrderFilled')[0];
      expect('fillBaseIndex' in call[1][0].payload).toBe(false);
      sub.unsubscribe();
    });
  });

  // ─── orderPlacement$ (TimeElapsedBeforeOrder + DrawingSnapshot) ─────────

  describe('orderPlacement$', () => {
    it('placeOrder-shaped transition emits TimeElapsedBeforeOrder(anchorKind=sessionStart) + DrawingSnapshot(eventRef=orderRef)', async () => {
      const drawing: Drawing = { id: 'd1', kind: 'fib', p1: { time: 1, price: 1 }, p2: { time: 2, price: 2 } };
      vi.spyOn(Date, 'now').mockReturnValue(10_000);
      arm(trading(), { replayIndex: 5, currentTime: 1200, drawings: [drawing] });
      const sub = subscribeAll();

      arm(trading({ orders: [order({ id: 'o1' })] }), {
        replayIndex: 5,
        currentTime: 1200,
        drawings: [drawing],
      });
      await Promise.resolve();

      const elapsedCall = calls('TimeElapsedBeforeOrder')[0];
      expect(elapsedCall[1][0]).toMatchObject({
        kind: 'TimeElapsedBeforeOrder',
        payload: { orderRef: 'o1', anchorKind: 'sessionStart', candlesRevealed: 0 },
      });
      const snapshotCall = calls('DrawingSnapshot')[0];
      expect(snapshotCall[1][0]).toMatchObject({
        payload: { eventRef: 'o1', drawings: [{ type: 'fib' }] },
      });
      sub.unsubscribe();
    });

    it('openMarket-shaped transition (new market position) ALSO resolves an orderRef and captures', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(10_000);
      arm(trading(), { replayIndex: 0 });
      const sub = subscribeAll();

      arm(trading({ positions: [pos({ id: 'p1', origin: 'market' })] }), { replayIndex: 0 });
      await Promise.resolve();

      expect(calls('TimeElapsedBeforeOrder')).toHaveLength(1);
      expect(calls('TimeElapsedBeforeOrder')[0][1][0].payload).toMatchObject({ orderRef: 'p1' });
      sub.unsubscribe();
    });

    it('a fill (new limit/stop position) is NOT treated as a placement — no TimeElapsedBeforeOrder', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(10_000);
      arm(trading());
      const sub = subscribeAll();

      arm(trading({ positions: [pos({ id: 'p1', origin: 'stop' })] }));
      await Promise.resolve();

      expect(calls('TimeElapsedBeforeOrder')).toHaveLength(0);
      sub.unsubscribe();
    });

    it('anchorKind=lastOrderEvent on a SECOND order placed after a first one in the same session', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(1000);
      arm(trading(), { replayIndex: 0 });
      const sub = subscribeAll();

      arm(trading({ orders: [order({ id: 'o1' })] }), { replayIndex: 2 });
      await Promise.resolve();
      expect(calls('TimeElapsedBeforeOrder')[0][1][0].payload).toMatchObject({ anchorKind: 'sessionStart' });

      vi.spyOn(Date, 'now').mockReturnValue(1500);
      arm(trading({ orders: [order({ id: 'o1' }), order({ id: 'o2' })] }), { replayIndex: 5 });
      await Promise.resolve();

      const second = calls('TimeElapsedBeforeOrder')[1];
      expect(second[1][0].payload).toMatchObject({ anchorKind: 'lastOrderEvent', candlesRevealed: 3 }); // 5 - 2
      sub.unsubscribe();
    });

    it('pausedMs/playingMs split correctly across a play/pause transition before the order', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(0);
      arm(trading(), { replayIndex: 0, playing: false });
      const sub = subscribeAll();

      // paused for 200ms
      vi.spyOn(Date, 'now').mockReturnValue(200);
      actions$.next(ReplayActions.play());
      await Promise.resolve();

      // playing for 500ms
      vi.spyOn(Date, 'now').mockReturnValue(700);
      actions$.next(ReplayActions.pause());
      await Promise.resolve();

      // paused for another 100ms, then place the order
      vi.spyOn(Date, 'now').mockReturnValue(800);
      arm(trading({ orders: [order({ id: 'o1' })] }), { replayIndex: 0, playing: false });
      await Promise.resolve();

      const call = calls('TimeElapsedBeforeOrder')[0];
      expect(call[1][0].payload).toMatchObject({ pausedMs: 300, playingMs: 500 });
      sub.unsubscribe();
    });

    it('does not capture when there is no active session', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(1000);
      arm(trading({ activeSessionId: null }));
      const sub = subscribeAll();

      arm(trading({ activeSessionId: null, orders: [order({ id: 'o1' })] }));
      await Promise.resolve();

      expect(telemetryDb.append).not.toHaveBeenCalled();
      sub.unsubscribe();
    });

    it('sessionStart is stamped at SUBSCRIBE time, not lazily deferred to the first touch (idle time before the first order counts as pausedMs)', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(0);
      arm(trading(), { replayIndex: 0, playing: false });
      const sub = subscribeAll(); // sessionAnchorReset$ stamps sessionStart @ wallClock 0 here

      // 5 minutes of idle time pass with NO seek/play/pause before the first order
      vi.spyOn(Date, 'now').mockReturnValue(300_000);
      arm(trading({ orders: [order({ id: 'o1' })] }), { replayIndex: 0, playing: false });
      await Promise.resolve();

      const call = calls('TimeElapsedBeforeOrder')[0];
      expect(call[1][0].payload).toMatchObject({ anchorKind: 'sessionStart', pausedMs: 300_000, playingMs: 0 });
      sub.unsubscribe();
    });

    it('a mid-stream session switch gets its OWN fresh sessionStart anchor, unpolluted by the outgoing session clock', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(0);
      arm(trading({ activeSessionId: 'sess-1' }), { replayIndex: 50, playing: false });
      const sub = subscribeAll();

      // rack up accumulation in sess-1
      vi.spyOn(Date, 'now').mockReturnValue(9000);
      actions$.next(ReplayActions.play());
      await Promise.resolve();

      // switch to sess-2 at a completely different wall-clock/replay-index
      vi.spyOn(Date, 'now').mockReturnValue(9500);
      arm(trading({ activeSessionId: 'sess-2' }), { replayIndex: 3, playing: false });
      await Promise.resolve();

      vi.spyOn(Date, 'now').mockReturnValue(9800);
      arm(trading({ activeSessionId: 'sess-2', orders: [order({ id: 'o1' })] }), {
        replayIndex: 4,
        playing: false,
      });
      await Promise.resolve();

      const call = calls('TimeElapsedBeforeOrder')[0];
      expect(call[1][0].payload).toMatchObject({
        orderRef: 'o1',
        anchorKind: 'sessionStart',
        pausedMs: 300, // 9800 - 9500 (sess-2's own anchor), NOT tainted by sess-1's accumulation
        playingMs: 0,
        candlesRevealed: 1, // 4 - 3 (sess-2's own anchorReplayIndex), NOT sess-1's index 50
      });
      sub.unsubscribe();
    });
  });

  // ─── DrawingSnapshot frozen-copy (G3) ────────────────────────────────────

  describe('DrawingSnapshot frozen-copy semantics', () => {
    it('mutating the source drawing AFTER an order-placement capture does not alter the stored payload', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(1000);
      const drawing: Drawing = { id: 'd1', kind: 'rect', p1: { time: 1, price: 1.5 }, p2: { time: 2, price: 2.5 } };
      arm(trading(), { drawings: [drawing] });
      const sub = subscribeAll();

      arm(trading({ orders: [order({ id: 'o1' })] }), { drawings: [drawing] });
      await Promise.resolve();

      const snapshotCall = calls('DrawingSnapshot')[0];
      const captured = snapshotCall[1][0].payload.drawings[0];

      // mutate the source AFTER capture
      drawing.p1.price = -999;
      drawing.kind = 'line';

      expect(captured.anchorPoints[0].price).toBe(1.5);
      expect(captured.type).toBe('rect');
      sub.unsubscribe();
    });
  });

  // ─── passivity ───────────────────────────────────────────────────────────

  describe('passivity', () => {
    it('never dispatches an action for any trading telemetry event', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(1000);
      arm(trading());
      const dispatchSpy = vi.spyOn(store, 'dispatch');
      const sub = subscribeAll();

      arm(trading({ positions: [pos({ id: 'p1', origin: 'limit' })] }));
      await Promise.resolve();
      arm(
        trading({
          positions: [pos({ id: 'p1', origin: 'limit' })],
          history: [closedTrade({ id: 'p1', origin: 'limit' })],
          orders: [order({ id: 'o1' })],
        }),
      );
      await Promise.resolve();

      expect(dispatchSpy).not.toHaveBeenCalled();
      sub.unsubscribe();
    });
  });
});
