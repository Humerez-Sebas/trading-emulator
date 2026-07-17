import { describe, expect, it } from 'vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { Subscription, Subject } from 'rxjs';

import {
  captureOrderClock,
  freshOrderClock,
  withDisplayAdvance,
  withPlaybackToggled,
  LAST_JUMP_RESET_THRESHOLD_MS,
  type OrderClock,
} from './telemetry-anchors';
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
import { defaultTradingData, TradingState, PendingOrder } from '../trading/trading.models';
import { drawingsFeature } from '../drawings/drawings.reducer';
import { TelemetryDbService } from '../../services/telemetry-db.service';

/**
 * `lastJump` anchor (RFC-016 D16.B, Task 1 Part B): a `+1`
 * (`advanceDisplay`) press retroactively resets the `OrderClock` anchor to
 * the PREVIOUS `+1` press's instant when >= 3000 ms of PAUSED time
 * accumulated since that previous press. New spec file — the six
 * pre-existing telemetry specs are untouched (STOP rule).
 */
describe('withDisplayAdvance (pure) — RFC-016 D16.B', () => {
  it('the threshold constant is 3000ms', () => {
    expect(LAST_JUMP_RESET_THRESHOLD_MS).toBe(3000);
  });

  it('the very first +1 of a session (no prior clock) starts a fresh sessionStart clock and records press memory — no reset possible', () => {
    const clock = withDisplayAdvance(null, 'sess-1', 1000, 10, false);
    expect(clock.anchorKind).toBe('sessionStart');
    expect(clock.anchorReplayIndex).toBe(10);
    expect(clock.lastAdvancePress).toEqual({
      wallClockMs: 1000,
      replayIndex: 10,
      pausedMsAtPress: 0,
      playingMsAtPress: 0,
    });
  });

  it('a +1 with an existing clock but NO prior press recorded cannot reset (first +1 after other events)', () => {
    const clock = freshOrderClock('sess-1', 'sessionStart', 0, 0, false);
    const pressed = withDisplayAdvance(clock, 'sess-1', 999_999, 500, false); // huge paused gap, but no prior press to compare against
    expect(pressed.anchorKind).toBe('sessionStart'); // unchanged — no reset happened
    expect(pressed.lastAdvancePress).toBeDefined();
  });

  it('a rapid second +1 (< 3000ms paused since the previous press) does NOT reset the anchor', () => {
    const press1 = withDisplayAdvance(null, 'sess-1', 0, 0, false);
    const press2 = withDisplayAdvance(press1, 'sess-1', 2999, 1, false); // 2999ms, all paused
    expect(press2.anchorKind).toBe('sessionStart'); // unchanged
    expect(press2.lastAdvancePress).toEqual({
      wallClockMs: 2999,
      replayIndex: 1,
      pausedMsAtPress: 2999,
      playingMsAtPress: 0,
    });
  });

  it('BOUNDARY: exactly 3000ms paused since the previous press DOES reset (>= 3000, inclusive)', () => {
    const press1 = withDisplayAdvance(null, 'sess-1', 0, 0, false);
    const press2 = withDisplayAdvance(press1, 'sess-1', 3000, 1, false);
    expect(press2.anchorKind).toBe('lastJump');
    expect(press2.anchorReplayIndex).toBe(0); // press1's own replayIndex — the PREVIOUS press
  });

  it('a qualifying pause resets the anchor RETROACTIVELY to the PREVIOUS press instant, rebasing accumulators so the pause stays INSIDE the measured window', () => {
    const press1 = withDisplayAdvance(null, 'sess-1', 1000, 10, false); // press1 @ wallClock 1000, index 10
    const press2 = withDisplayAdvance(press1, 'sess-1', 4500, 11, false); // 3500ms paused since press1

    expect(press2.anchorKind).toBe('lastJump');
    expect(press2.anchorReplayIndex).toBe(10); // press1's replayIndex
    expect(press2.pausedMs).toBe(3500); // the ENTIRE window since press1, including the qualifying pause itself
    expect(press2.playingMs).toBe(0);
    expect(press2.lastAdvancePress).toEqual({
      wallClockMs: 4500,
      replayIndex: 11,
      pausedMsAtPress: 3500,
      playingMsAtPress: 0,
    });
  });

  it('only PAUSED ms count toward the threshold — a long PLAYING interval between presses does not trigger a reset', () => {
    const press1 = withDisplayAdvance(null, 'sess-1', 1000, 10, false);
    let clock: OrderClock = withPlaybackToggled(press1, 'sess-1', true, 2000, 12); // 1000ms paused folded in
    clock = withPlaybackToggled(clock, 'sess-1', false, 6000, 20); // 4000ms PLAYING folded in
    // paused-so-far since press1 = 1000ms; another 500ms paused right up to press2
    const press2 = withDisplayAdvance(clock, 'sess-1', 6500, 21, false);

    expect(press2.anchorKind).toBe('sessionStart'); // NOT reset: only 1500ms paused (< 3000), despite 5500ms total elapsed
    expect(press2.pausedMs).toBe(1500);
    expect(press2.playingMs).toBe(4000);
  });

  it('a SUBSEQUENT press, after a non-qualifying gap, can still qualify on ITS OWN paused-since-last-press delta', () => {
    const press1 = withDisplayAdvance(null, 'sess-1', 0, 0, false);
    const press2 = withDisplayAdvance(press1, 'sess-1', 1000, 1, false); // 1000ms paused, no reset
    const press3 = withDisplayAdvance(press2, 'sess-1', 4500, 2, false); // 3500ms paused since press2

    expect(press3.anchorKind).toBe('lastJump');
    expect(press3.anchorReplayIndex).toBe(1); // press2's replayIndex — the PREVIOUS press relative to press3
    expect(press3.pausedMs).toBe(3500); // measured from press2 alone, not press1
  });

  it('press memory updates on EVERY +1 press, whether or not it resets (rapid presses still update the memory)', () => {
    const press1 = withDisplayAdvance(null, 'sess-1', 0, 0, false);
    const press2 = withDisplayAdvance(press1, 'sess-1', 500, 1, false); // rapid, no reset
    expect(press2.lastAdvancePress?.wallClockMs).toBe(500);
    expect(press2.lastAdvancePress?.replayIndex).toBe(1);
  });

  it('a session switch clears the press memory: a huge paused gap across the switch does not leak a retroactive reset into the new session', () => {
    const press1 = withDisplayAdvance(null, 'sess-1', 0, 0, false);
    const pressInNewSession = withDisplayAdvance(press1, 'sess-2', 999_999, 3, false);

    expect(pressInNewSession.sessionId).toBe('sess-2');
    expect(pressInNewSession.anchorKind).toBe('sessionStart'); // fresh anchor, not lastJump
  });

  it('an intervening order capture (captureOrderClock) clears the press memory: the anchor never moves backward past the more-recent lastOrderEvent anchor', () => {
    const press1 = withDisplayAdvance(null, 'sess-1', 0, 0, false);
    const captured = captureOrderClock(press1, 'sess-1', 1000, 5, false);
    expect(captured.nextClock.anchorKind).toBe('lastOrderEvent');
    expect(captured.nextClock.lastAdvancePress).toBeUndefined();

    // A huge paused gap follows, but there is NO press memory anymore (the
    // order capture cleared it) — this +1 cannot retroactively reset past
    // the lastOrderEvent anchor the order capture just established.
    const pressAfterOrder = withDisplayAdvance(captured.nextClock, 'sess-1', 999_999, 50, false);
    expect(pressAfterOrder.anchorKind).toBe('lastOrderEvent'); // unchanged — no reset possible
  });

  it('a subsequent TimeElapsedBeforeOrder capture after a reset reports anchorKind=lastJump, paused/playing measured from the previous-press instant, and candlesRevealed as the index delta from it', () => {
    const press1 = withDisplayAdvance(null, 'sess-1', 0, 0, false); // press1 @ wallClock 0, index 0
    const press2 = withDisplayAdvance(press1, 'sess-1', 3000, 5, false); // resets: anchor -> press1 (index 0)
    expect(press2.anchorKind).toBe('lastJump');

    const captured = captureOrderClock(press2, 'sess-1', 4000, 8, false); // + 1000ms more paused, index -> 8
    expect(captured.anchorKind).toBe('lastJump');
    expect(captured.pausedMs).toBe(4000); // entire window since press1 (wallClock 0 -> 4000), all paused
    expect(captured.playingMs).toBe(0);
    expect(captured.candlesRevealed).toBe(8); // 8 - 0 (press1's own replayIndex, the retroactive anchor)
  });

  it('jumpForward/jumpBack do not call this function — verified structurally: withDisplayAdvance has no awareness of action types, only the effect gates which action reaches it (see effects-level suite below)', () => {
    // Documented as a design-level invariant; the runtime proof lives in the
    // effects-integration describe block below, which dispatches
    // jumpForward/jumpBack between two advanceDisplay presses and confirms
    // they do not participate.
    expect(true).toBe(true);
  });
});

describe('TelemetryEffects — advanceDisplay wiring (RFC-016 D16.B)', () => {
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
    sub.add(priv['sessionAnchorReset$'].subscribe());
    sub.add(priv['displayAdvanceClock$'].subscribe());
    sub.add(effects.orderPlacement$.subscribe());
    // needed for the jumpForward/jumpBack non-participation test:
    sub.add((priv['syncJumpOrigin$'] as { subscribe: () => Subscription }).subscribe());
    sub.add(effects.replayJump$.subscribe());
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

  /** Full arm: (re)establishes the trading snapshot + all supporting selectors. */
  function armTrading(
    state: TradingState,
    opts: { replayIndex?: number; currentTime?: number; playing?: boolean } = {},
  ) {
    store.overrideSelector(tradingFeature.selectTradingState, state);
    store.overrideSelector(tradingFeature.selectActiveSessionId, state.activeSessionId);
    store.overrideSelector(selectExecutionSeries, null);
    store.overrideSelector(selectReplayIndex, opts.replayIndex ?? 0);
    store.overrideSelector(selectCurrentTime, opts.currentTime ?? 0);
    store.overrideSelector(selectPlaying, opts.playing ?? false);
    store.overrideSelector(selectReplayTfSeconds, 60);
    store.overrideSelector(drawingsFeature.selectItems, []);
    store.refreshState();
  }

  /** Lightweight arm: updates only replayIndex/playing, without re-churning tradingPairs$. */
  function armReplay(replayIndex: number, playing = false) {
    store.overrideSelector(selectReplayIndex, replayIndex);
    store.overrideSelector(selectPlaying, playing);
    store.refreshState();
  }

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

  type AppendCall = [string, { kind: string; payload: any }[]];
  const calls = (kind: string): AppendCall[] =>
    (telemetryDb.append.mock.calls as AppendCall[]).filter(([, events]) =>
      events.some((e) => e.kind === kind),
    );

  it('a qualifying pause (>=3000ms) between two advanceDisplay presses retroactively resets the anchor; a subsequent order reports anchorKind=lastJump measured from the FIRST press', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(0);
    armTrading(trading(), { replayIndex: 10, playing: false });
    const sub = subscribeAll(); // stamps sessionStart @ wallClock 0, replayIndex 10

    // first +1 press @ wallClock 1000, replayIndex 11
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    armReplay(11, false);
    actions$.next(ReplayActions.advanceDisplay());
    await Promise.resolve();

    // 3200ms pass, all paused, then second +1 press @ wallClock 4200, replayIndex 12
    vi.spyOn(Date, 'now').mockReturnValue(4200);
    armReplay(12, false);
    actions$.next(ReplayActions.advanceDisplay());
    await Promise.resolve();

    // an order placed shortly after, @ wallClock 4400, replayIndex 15
    vi.spyOn(Date, 'now').mockReturnValue(4400);
    armTrading(trading({ orders: [order({ id: 'o1' })] }), { replayIndex: 15, playing: false });
    await Promise.resolve();

    const call = calls('TimeElapsedBeforeOrder')[0];
    expect(call[1][0].payload).toMatchObject({
      anchorKind: 'lastJump',
      pausedMs: 3400, // from the PREVIOUS press (wallClock 1000) to now (4400)
      candlesRevealed: 4, // 15 - 11 (the previous press's replayIndex)
    });
    sub.unsubscribe();
  });

  it('a rapid second +1 (<3000ms paused) does NOT reset: a subsequent order still reports anchorKind=sessionStart', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(0);
    armTrading(trading(), { replayIndex: 0, playing: false });
    const sub = subscribeAll();

    vi.spyOn(Date, 'now').mockReturnValue(500);
    armReplay(1, false);
    actions$.next(ReplayActions.advanceDisplay());
    await Promise.resolve();

    vi.spyOn(Date, 'now').mockReturnValue(1500); // only 1000ms since the previous press
    armReplay(2, false);
    actions$.next(ReplayActions.advanceDisplay());
    await Promise.resolve();

    vi.spyOn(Date, 'now').mockReturnValue(1600);
    armTrading(trading({ orders: [order({ id: 'o1' })] }), { replayIndex: 3, playing: false });
    await Promise.resolve();

    const call = calls('TimeElapsedBeforeOrder')[0];
    expect(call[1][0].payload).toMatchObject({ anchorKind: 'sessionStart' });
    sub.unsubscribe();
  });

  it('jumpForward/jumpBack between two advanceDisplay presses do NOT participate: the retroactive reset still measures from the ORIGINAL advanceDisplay press', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(0);
    armTrading(trading(), { replayIndex: 0, playing: false, currentTime: 0 });
    const sub = subscribeAll();

    // first +1 press @ wallClock 1000, replayIndex 10
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    armReplay(10, false);
    actions$.next(ReplayActions.advanceDisplay());
    await Promise.resolve();

    // an UNRELATED jumpForward + landing in between — must be a complete no-op for the OrderClock
    vi.spyOn(Date, 'now').mockReturnValue(1200);
    armReplay(200, false); // jumpForward lands far away in replay-index space
    actions$.next(ReplayActions.jumpForward());
    await Promise.resolve();
    actions$.next(ReplayActions.goToTime({ time: 500 }));
    await Promise.resolve();
    armReplay(10, false); // jumpBack returns to where the +1 press sequence was
    actions$.next(ReplayActions.jumpBack());
    await Promise.resolve();
    actions$.next(ReplayActions.goToTime({ time: 0 }));
    await Promise.resolve();

    // second +1 press @ wallClock 4300 (3300ms paused since the FIRST advanceDisplay press, ignoring the jump excursion), replayIndex 11
    vi.spyOn(Date, 'now').mockReturnValue(4300);
    armReplay(11, false);
    actions$.next(ReplayActions.advanceDisplay());
    await Promise.resolve();

    vi.spyOn(Date, 'now').mockReturnValue(4400);
    armTrading(trading({ orders: [order({ id: 'o1' })] }), { replayIndex: 20, playing: false });
    await Promise.resolve();

    const call = calls('TimeElapsedBeforeOrder')[0];
    expect(call[1][0].payload).toMatchObject({
      anchorKind: 'lastJump',
      candlesRevealed: 10, // 20 - 10 (the FIRST advanceDisplay press's replayIndex, NOT the jump's 200)
    });
    sub.unsubscribe();
  });

  it('an intervening order placement between two advanceDisplay presses clears the press memory: no retroactive reset leaks past it', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(0);
    armTrading(trading(), { replayIndex: 0, playing: false });
    const sub = subscribeAll();

    // first +1 press
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    armReplay(5, false);
    actions$.next(ReplayActions.advanceDisplay());
    await Promise.resolve();

    // an order placement in between — establishes a fresh lastOrderEvent anchor and clears press memory
    vi.spyOn(Date, 'now').mockReturnValue(1500);
    armTrading(trading({ orders: [order({ id: 'o1' })] }), { replayIndex: 6, playing: false });
    await Promise.resolve();
    expect(calls('TimeElapsedBeforeOrder')[0][1][0].payload).toMatchObject({
      anchorKind: 'sessionStart',
    });

    // a huge paused gap, then a second +1 press — must NOT reset (no press memory survives the order capture)
    vi.spyOn(Date, 'now').mockReturnValue(999_999);
    armReplay(7, false);
    actions$.next(ReplayActions.advanceDisplay());
    await Promise.resolve();

    // a second order, right after that +1 press
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    armTrading(trading({ orders: [order({ id: 'o1' }), order({ id: 'o2' })] }), {
      replayIndex: 8,
      playing: false,
    });
    await Promise.resolve();

    const second = calls('TimeElapsedBeforeOrder')[1];
    expect(second[1][0].payload).toMatchObject({ anchorKind: 'lastOrderEvent' }); // NOT lastJump
    sub.unsubscribe();
  });

  it('a session switch between two advanceDisplay presses clears the press memory: no retroactive reset for the new session', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(0);
    armTrading(trading({ activeSessionId: 'sess-1' }), { replayIndex: 0, playing: false });
    const sub = subscribeAll();

    vi.spyOn(Date, 'now').mockReturnValue(1000);
    armReplay(5, false);
    actions$.next(ReplayActions.advanceDisplay());
    await Promise.resolve();

    // switch sessions
    vi.spyOn(Date, 'now').mockReturnValue(1200);
    armTrading(trading({ activeSessionId: 'sess-2' }), { replayIndex: 0, playing: false });
    await Promise.resolve();

    // huge paused gap in sess-2, then a +1 press — no press memory to reset from (fresh session)
    vi.spyOn(Date, 'now').mockReturnValue(999_999);
    armReplay(3, false);
    actions$.next(ReplayActions.advanceDisplay());
    await Promise.resolve();

    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    armTrading(trading({ activeSessionId: 'sess-2', orders: [order({ id: 'o1' })] }), {
      replayIndex: 4,
      playing: false,
    });
    await Promise.resolve();

    const call = calls('TimeElapsedBeforeOrder')[0];
    expect(call[1][0].payload).toMatchObject({ anchorKind: 'sessionStart' }); // sess-2's own fresh anchor
    sub.unsubscribe();
  });

  it('does not touch the clock when there is no active session', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(0);
    armTrading(trading({ activeSessionId: null }), { replayIndex: 0, playing: false });
    const sub = subscribeAll();

    actions$.next(ReplayActions.advanceDisplay());
    await Promise.resolve();

    expect(telemetryDb.append).not.toHaveBeenCalled();
    sub.unsubscribe();
  });

  describe('passivity', () => {
    it('never dispatches an action for advanceDisplay clock bookkeeping', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(0);
      armTrading(trading(), { replayIndex: 0, playing: false });
      const dispatchSpy = vi.spyOn(store, 'dispatch');
      const sub = subscribeAll();

      actions$.next(ReplayActions.advanceDisplay());
      await Promise.resolve();

      expect(dispatchSpy).not.toHaveBeenCalled();
      sub.unsubscribe();
    });
  });
});
