import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { distinctUntilChanged, map, pairwise, tap, withLatestFrom } from 'rxjs/operators';
import { TelemetryDbService, type TelemetryAppendInput } from '../../services/telemetry-db.service';
import type { TelemetryEventKindV1 } from './telemetry.models';
import { ReplayActions } from '../replay/replay.actions';
import { TradingActions } from '../trading/trading.actions';
import {
  selectCurrentTime,
  selectExecutionSeries,
  selectPlaying,
  selectReplayIndex,
  selectReplayTfSeconds,
} from '../selectors';
import { tradingFeature } from '../trading/trading.reducer';
import { drawingsFeature } from '../drawings/drawings.reducer';
import {
  captureOrderClock,
  freshOrderClock,
  withPlaybackToggled,
  withSeekAnchor,
  type OrderClock,
} from './telemetry-anchors';
import { diffDomainFacts, resolveOrderRef, type TradingSnapshot } from './telemetry-facts';
import { snapshotDrawings } from './telemetry-drawings';

/**
 * Passive navigation observer (RFC-014 §4 — La Caja Negra).
 *
 * Every effect in this class is `{ dispatch: false }`: the class never
 * dispatches an action and never writes to NgRx state (N-2 passivity). It
 * only calls `TelemetryDbService.append`, which itself buffers and flushes
 * off the hot path (see that service's doc comment) — trading/replay
 * behavior is byte-identical whether or not `TelemetryEffects` is
 * registered in `provideEffects(...)`.
 *
 * Scope (T5b-i, navigation): `ReplaySeek`, `ReplayJump`, `PlaybackToggled`,
 * `SpeedChanged`.
 *
 * Scope (T5b-ii, trading — this addition): `TimeElapsedBeforeOrder` +
 * `DrawingSnapshot` at order placement (`orderPlacement$`), the reified
 * `OrderFilled`/`PositionClosed` facts + `DrawingSnapshot` at position close
 * (`facts$`), fed by a shared `tradingPairs$` pairwise stream. See D14.F in
 * `task-5-brief.md`: facts are DERIVED from post-reducer state diffs (pure
 * logic lives in `telemetry-facts.ts`), not read off a reified engine
 * result — `ProcessResult.facts` exists at the engine level but has no state
 * surfacing. `TimeElapsedBeforeOrder`'s anchor/paused/playing/candles
 * bookkeeping is a small effect-local mutable `OrderClock` (pure transitions
 * in `telemetry-anchors.ts`, same "one mutable field + a pure reducer
 * function" idiom as `pendingJumpOrigin` below). `DrawingSnapshot`'s
 * copy-on-write mapping lives in `telemetry-drawings.ts`.
 *
 * Session scoping: every capture reads the active session id. Navigation
 * events read it via `activeSessionId$` (`tradingFeature.selectActiveSessionId`)
 * and are a no-op when it is `null`. Trading events read it from the SAME
 * atomic snapshot they diff (`TradingSnapshot.sessionId`, inside
 * `tradingPairs$`) — self-consistent with the diff itself, no separate
 * selector to go stale relative to it — and are ALSO a no-op across a
 * session switch (`prev.sessionId !== curr.sessionId`): the pairwise
 * baseline simply resets for the NEXT transition without emitting anything
 * for this one, so an incoming session's pre-existing positions/orders/
 * history never look like "new" facts.
 */
@Injectable()
export class TelemetryEffects {
  private actions$ = inject(Actions);
  private store = inject(Store);
  private telemetryDb = inject(TelemetryDbService);

  private activeSessionId$ = this.store.select(tradingFeature.selectActiveSessionId);

  /**
   * `[prev, current]` pairs of the replay cursor. `ReplayActions.seekTo`
   * updates `ReplayState.currentTime` in ITS OWN reducer case (see
   * `replay.reducer.ts`), and @ngrx/store always runs a dispatch's reducer
   * before notifying effects of that same action (`TradingEffects
   * .processFills$` already relies on this: it reads `ctx.candles[ctx.idx]`
   * assuming the just-dispatched `goToTime` has already landed). So a plain
   * `withLatestFrom(selectCurrentTime)` on `ofType(seekTo)` would read the
   * POST-seek value, not the pre-seek one `fromTime` needs. `pairwise()`
   * recovers the value from immediately before this transition instead.
   */
  private cursorPairs$ = this.store.select(selectCurrentTime).pipe(pairwise());

  /**
   * `[prev, current]` pairs of the trading-relevant slice (session id +
   * orders/positions/history), shared by `facts$` and `orderPlacement$`.
   *
   * Built on `tradingFeature.selectTradingState` (the WHOLE feature slice,
   * `(state) => state.trading`) rather than three separate field selectors
   * so a single atomic snapshot backs both `sessionId` and the three arrays
   * — no risk of `sessionId` and `orders`/`positions`/`history` drifting
   * out of sync across a fast sequence of dispatches. The custom
   * `distinctUntilChanged` (comparing each field by reference, NOT the
   * wrapper object `map()` just built) is what makes `pairwise()` skip
   * reducer no-ops — `openMarket`/`placeOrder` return the SAME `state`
   * reference unchanged when I-14 geometry validation rejects the action
   * (see `trading.reducer.ts`), so a rejected placement produces NO new
   * pair here at all; `resolveOrderRef`/`diffDomainFacts` never even see it
   * (this is what makes correlating "the entity THIS action just added"
   * safe without a separate stale-pair guard — a naive `ofType(placeOrder)`
   * + `withLatestFrom` on an action-gated pairwise would re-read the SAME
   * stale pair on a rejected retry and misattribute an earlier accepted
   * placement's id to it; being fully state-driven instead sidesteps that).
   *
   * A reference-churning-but-id-preserving change (e.g. `modifyPosition`'s
   * `.map()`, which always returns a NEW positions array even when the I-15
   * guard rejects the SL move) DOES still produce a pair here, but that is
   * harmless: `diffDomainFacts`/`resolveOrderRef` key off ID SET
   * membership, not array identity, so an all-same-ids pair diffs to
   * nothing.
   */
  private tradingPairs$ = this.store.select(tradingFeature.selectTradingState).pipe(
    map(
      (t): TradingSnapshot => ({
        sessionId: t.activeSessionId,
        orders: t.orders,
        positions: t.positions,
        history: t.history,
      }),
    ),
    distinctUntilChanged(
      (a, b) =>
        a.sessionId === b.sessionId &&
        a.orders === b.orders &&
        a.positions === b.positions &&
        a.history === b.history,
    ),
    pairwise(),
  );

  /**
   * Origin cursor for an in-flight jump/fold command (`jumpForward`,
   * `jumpBack`, `advanceDisplay`), captured BEFORE it lands. `null` means
   * the next `goToTime` this effect sees should NOT be recorded as a
   * `ReplayJump`.
   *
   * FINAL-AUDIT ATTENTION — REVIEW FIX (RFC-014 T5 review, wave 1): the
   * original design cleared this field only on a hand-maintained list of
   * actions (`advanceCandle`, `stepBack`) known to also funnel through
   * `goToTime`. That list was provably incomplete: `goToTime` is ALSO
   * dispatched directly, with NO other store action anywhere near it, from
   * the go-to-date dialog (`chart.component.ts`'s `confirmDateDialog`),
   * session/workspace restore (`workspaces.effects.ts`), and CSV start
   * (`csv-start-dialog.component.ts`). None of those arm or clear this
   * field. A `jumpForward`/`jumpBack`/`advanceDisplay` that no-ops at a
   * session/data boundary (no `goToTime` follows AT ALL) used to leave a
   * stale origin that a LATER, wholly unrelated `goToTime` from any of
   * those call sites would be misattributed to (reviewer finding).
   *
   * Fixed structurally instead of by growing that action list further, with
   * TWO independent invalidation paths, both owned entirely by
   * `syncJumpOrigin$` below (no `goToTime` producer, present or future,
   * needs to arm or clear anything):
   *
   * 1. SYNCHRONOUS: `syncJumpOrigin$` subscribes to `this.actions$` with NO
   *    `ofType` filter — i.e. every action dispatched anywhere in the app —
   *    and nulls this field out on any action that is neither one of the
   *    three arm types NOR `TradingActions.processCandle` (the one action
   *    `ReplayEffects.foldForwardFills` dispatches BETWEEN an arm and its
   *    own terminal `goToTime` when a jump/fold spans more than one candle
   *    — excluded so a real multi-candle fold can't invalidate its own
   *    in-flight arm) NOR `goToTime` itself (left for `replayJump$` to
   *    read/clear). This is what makes the OLD regression test below
   *    (`advanceCandle` intervening) pass without needing any timer, and
   *    now generalizes to literally any other action, not just those two.
   * 2. TIME-BASED: arming ALSO schedules a same-macrotask-scoped
   *    `setTimeout(…, 0)` that nulls this field back out, compared by
   *    reference identity so a newer arm made in the meantime is never
   *    clobbered. This is the only thing that can catch the pathological
   *    case (1) can't: a `goToTime` dispatched with LITERALLY NOTHING else
   *    in between (e.g. `chart.component.ts`'s `confirmDateDialog` — see
   *    the regression test below) — no OTHER action ever fires to trigger
   *    path 1's clear, so the field would stay armed indefinitely without
   *    this. `goToTime` and the whole jumpForward/jumpBack/advanceDisplay →
   *    `processCandle`* → `goToTime` fold it can trigger are ALL driven
   *    through @ngrx/store's `queueScheduler` trampoline and RxJS's
   *    synchronous array-flattening of `mergeMap`'s returned `Action[]`
   *    (see below) — a LEGITIMATE landing always reaches `replayJump$`
   *    within the SAME synchronous JS turn the arming action was dispatched
   *    in, strictly before a macrotask-deferred `setTimeout(0)` can fire.
   *
   * Together these two paths mean: a `goToTime` with NO fresh preceding arm
   * NEVER emits `ReplayJump`, regardless of what intervenes (path 1) or how
   * much real time elapses with nothing intervening at all (path 2) — and
   * regardless of what new `goToTime` call sites get added later.
   *
   * The scheduling argument path 2 rests on: `State` (ngrx-store's internal
   * reducer runner) feeds every dispatch through `observeOn(queueScheduler)`
   * before applying the reducer, and effects (`Actions`, built on
   * `ScannedActionsSubject`) are only notified of an action AFTER its
   * reducer has run. `queueScheduler` is a FIFO trampoline: a
   * `store.dispatch()` triggered from INSIDE another dispatch's own effect
   * notification (e.g. `ReplayEffects.jumpForward$`'s `mergeMap`
   * re-dispatching its folded `processCandle`s and terminal `goToTime`) is
   * QUEUED, not run reentrantly, but still runs SYNCHRONOUSLY as part of
   * draining that queue — no microtask or macrotask boundary is crossed.
   * That is what makes "record the origin on the cause action, expire it on
   * a real timer, read/consume it on the landing action" safe here,
   * independent of effect registration order and of how many intermediate
   * actions (`processCandle`) the fold dispatches.
   */
  private pendingJumpOrigin: { fromTime: number } | null = null;

  /**
   * Effect-local rolling clock backing `TimeElapsedBeforeOrder` (RFC-014
   * §4) — see `telemetry-anchors.ts` for the pure transition functions.
   * `null` = no clock yet for the current session (first-touch lazily
   * starts a `'sessionStart'` anchor; see `ensureSession` in that module).
   * Updated by `orderClockOnSeek$`/`orderClockOnPlayback$` (anchor-adjacent
   * events) and settled + re-anchored by `orderPlacement$` on each capture.
   */
  private orderClock: OrderClock | null = null;

  /** Scrubber teleport (frozen semantics: registered, never simulated). */
  replaySeek$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(ReplayActions.seekTo),
        withLatestFrom(this.cursorPairs$, this.activeSessionId$),
        tap(([, [fromTime, toTime], sessionId]) => {
          this.capture(sessionId, 'ReplaySeek', toTime, {
            fromTime,
            toTime,
            direction: toTime >= fromTime ? 'forward' : 'backward',
          });
        }),
      ),
    { dispatch: false },
  );

  private static readonly JUMP_FAMILY = new Set<string>([
    ReplayActions.jumpForward.type,
    ReplayActions.jumpBack.type,
    ReplayActions.advanceDisplay.type,
  ]);

  /**
   * Owns BOTH invalidation paths documented on `pendingJumpOrigin` above.
   * Deliberately subscribes to `this.actions$` with NO `ofType` filter —
   * every action in the app passes through here — because path 1 (clear on
   * any non-pass-through action) can only invalidate a stale arm if it
   * actually SEES the actions that should invalidate it, and the whole
   * point of this fix is that this effect no longer needs a hand-maintained
   * list of which those are.
   */
  private syncJumpOrigin$ = createEffect(
    () =>
      this.actions$.pipe(
        withLatestFrom(this.store.select(selectCurrentTime)),
        tap(([action, fromTime]) => {
          if (TelemetryEffects.JUMP_FAMILY.has(action.type)) {
            const origin = { fromTime };
            this.pendingJumpOrigin = origin;
            // Path 2 (time-based expiry) — see `pendingJumpOrigin`'s doc comment.
            setTimeout(() => {
              if (this.pendingJumpOrigin === origin) this.pendingJumpOrigin = null;
            }, 0);
            return;
          }
          // Path 1 (synchronous invalidation): everything except the two
          // pass-through types below invalidates a stale arm immediately.
          if (
            action.type !== ReplayActions.goToTime.type &&
            action.type !== TradingActions.processCandle.type
          ) {
            this.pendingJumpOrigin = null;
          }
        }),
      ),
    { dispatch: false },
  );

  /** Multi-candle jump/fold landing (`jumpForward`/`jumpBack`/`advanceDisplay`). */
  replayJump$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(ReplayActions.goToTime),
        withLatestFrom(this.store.select(selectReplayTfSeconds), this.activeSessionId$),
        tap(([action, grainSeconds, sessionId]) => {
          const origin = this.pendingJumpOrigin;
          this.pendingJumpOrigin = null;
          if (!origin) return;
          this.capture(sessionId, 'ReplayJump', action.time, {
            fromTime: origin.fromTime,
            toTime: action.time,
            grain: grainSeconds,
          });
        }),
      ),
    { dispatch: false },
  );

  /** Play/pause. */
  playbackToggled$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(ReplayActions.play, ReplayActions.pause),
        withLatestFrom(this.store.select(selectCurrentTime), this.activeSessionId$),
        tap(([action, marketTime, sessionId]) => {
          this.capture(sessionId, 'PlaybackToggled', marketTime, {
            playing: action.type === ReplayActions.play.type,
          });
        }),
      ),
    { dispatch: false },
  );

  /** Autoplay speed change. */
  speedChanged$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(ReplayActions.changeSpeed),
        withLatestFrom(this.store.select(selectCurrentTime), this.activeSessionId$),
        tap(([action, marketTime, sessionId]) => {
          this.capture(sessionId, 'SpeedChanged', marketTime, {
            msPerCandle: action.msPerCandle,
          });
        }),
      ),
    { dispatch: false },
  );

  /**
   * Stamps a fresh `'sessionStart'` `orderClock` the MOMENT a session
   * becomes active (including the very first session of the app's
   * lifetime) — `activeSessionId$` is `distinctUntilChanged` internally
   * (built into `store.select`), so this fires exactly once per session,
   * immediately.
   *
   * Why this exists instead of relying on `OrderClock`'s own lazy
   * first-touch initialization (`ensureSession` in `telemetry-anchors.ts`,
   * which every entry point falls back to when `orderClock` is `null`):
   * lazy init would stamp `'sessionStart'`'s `lastTransitionWallClockMs` at
   * WHATEVER moment the clock happens to be first touched (the first
   * seek/play/pause/order of the session) — losing any paused (or playing)
   * time BEFORE that first touch entirely (e.g. a user idling for minutes
   * before their first order would read `pausedMs: 0` for it, when the RFC
   * asks for wall-clock time "since the anchor", and the anchor IS session
   * start here). Proactively stamping on the session-id transition itself
   * fixes that gap; `ensureSession`'s lazy fallback remains as a defensive
   * no-op in the (in production, unreachable — this effect always runs
   * first) case where something reads the clock before this has fired.
   */
  private sessionAnchorReset$ = createEffect(
    () =>
      this.activeSessionId$.pipe(
        distinctUntilChanged(),
        withLatestFrom(this.store.select(selectReplayIndex), this.store.select(selectPlaying)),
        tap(([sessionId, replayIndex, playing]) => {
          this.orderClock =
            sessionId == null ? null : freshOrderClock(sessionId, 'sessionStart', Date.now(), replayIndex, playing);
        }),
      ),
    { dispatch: false },
  );

  /**
   * Keeps `orderClock` in sync with the scrubber teleport (`ReplaySeek`):
   * a hard reset to a `'lastSeek'` anchor (see `withSeekAnchor`). Does NOT
   * itself call `capture()` — `replaySeek$` above already records the
   * `ReplaySeek` event; this is purely `TimeElapsedBeforeOrder` bookkeeping,
   * a second independent subscriber to the SAME `seekTo` action.
   */
  private orderClockOnSeek$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(ReplayActions.seekTo),
        withLatestFrom(this.activeSessionId$, this.store.select(selectReplayIndex), this.store.select(selectPlaying)),
        tap(([, sessionId, replayIndex, playing]) => {
          if (sessionId == null) return;
          this.orderClock = withSeekAnchor(this.orderClock, sessionId, Date.now(), replayIndex, playing);
        }),
      ),
    { dispatch: false },
  );

  /**
   * Keeps `orderClock` in sync with play/pause: settles the elapsed window
   * into paused/playingMs and flips `playing`, WITHOUT moving the anchor
   * (see `withPlaybackToggled` — play/pause is not an anchor-resetting
   * event per the RFC's anchor list). A second independent subscriber to
   * the SAME `play`/`pause` actions `playbackToggled$` already records.
   */
  private orderClockOnPlayback$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(ReplayActions.play, ReplayActions.pause),
        withLatestFrom(this.activeSessionId$, this.store.select(selectReplayIndex)),
        tap(([action, sessionId, replayIndex]) => {
          if (sessionId == null) return;
          this.orderClock = withPlaybackToggled(
            this.orderClock,
            sessionId,
            action.type === ReplayActions.play.type,
            Date.now(),
            replayIndex,
          );
        }),
      ),
    { dispatch: false },
  );

  /**
   * The reified Task-4b facts (`OrderFilled`/`PositionClosed`, D14.F —
   * derived from state diffing, see the class doc comment), plus a
   * `DrawingSnapshot` alongside every `PositionClosed` (G3: captured at
   * position close, `eventRef` = the trade id). State-driven (see
   * `tradingPairs$`'s doc comment for why), not gated to any specific
   * action type — whatever caused positions/history to change (a fill via
   * `processCandle`, a manual `closePosition`, `endSession`, ...) is
   * diffed identically.
   */
  facts$ = createEffect(
    () =>
      this.tradingPairs$.pipe(
        withLatestFrom(
          this.store.select(selectExecutionSeries),
          this.store.select(drawingsFeature.selectItems),
        ),
        tap(([[prev, curr], base, drawings]) => {
          if (curr.sessionId == null || prev.sessionId !== curr.sessionId) return; // no session, or a session switch: reset baseline, no spurious facts
          for (const fact of diffDomainFacts(prev, curr, base)) {
            this.capture(curr.sessionId, fact.kind, fact.marketTime, fact.payload);
            if (fact.kind === 'PositionClosed') {
              this.capture(curr.sessionId, 'DrawingSnapshot', fact.marketTime, {
                eventRef: fact.payload.tradeId,
                drawings: snapshotDrawings(drawings),
              });
            }
          }
        }),
      ),
    { dispatch: false },
  );

  /**
   * `TimeElapsedBeforeOrder` + `DrawingSnapshot` at order placement
   * (`placeOrder`/`openMarket`). State-driven off the SAME `tradingPairs$`
   * as `facts$`: `resolveOrderRef` finds the id the reducer just minted (a
   * new pending order, or a new `origin: 'market'` position — a pending-
   * order FILL, which also adds to `positions[]` but with `origin: 'limit'
   * | 'stop'`, is deliberately excluded there so a fill is never mistaken
   * for a placement). `undefined` means this transition was not an
   * accepted placement (nothing to correlate against) — most commonly
   * because it was some OTHER kind of trading-state change entirely, since
   * a genuinely REJECTED placement (I-14 guard) never produces a pair here
   * at all (see `tradingPairs$`'s doc comment).
   */
  orderPlacement$ = createEffect(
    () =>
      this.tradingPairs$.pipe(
        withLatestFrom(
          this.store.select(selectReplayIndex),
          this.store.select(selectCurrentTime),
          this.store.select(selectPlaying),
          this.store.select(drawingsFeature.selectItems),
        ),
        tap(([[prev, curr], replayIndex, marketTime, playing, drawings]) => {
          if (curr.sessionId == null || prev.sessionId !== curr.sessionId) return;
          const orderRef = resolveOrderRef(prev, curr);
          if (orderRef == null) return;

          const clockCapture = captureOrderClock(this.orderClock, curr.sessionId, Date.now(), replayIndex, playing);
          this.orderClock = clockCapture.nextClock;
          this.capture(curr.sessionId, 'TimeElapsedBeforeOrder', marketTime, {
            orderRef,
            anchorKind: clockCapture.anchorKind,
            pausedMs: clockCapture.pausedMs,
            playingMs: clockCapture.playingMs,
            candlesRevealed: clockCapture.candlesRevealed,
          });
          this.capture(curr.sessionId, 'DrawingSnapshot', marketTime, {
            eventRef: orderRef,
            drawings: snapshotDrawings(drawings),
          });
        }),
      ),
    { dispatch: false },
  );

  /**
   * Shared envelope/session-scope choke point for every observer in this
   * class (present and future — T5b-ii). No-op without an active session:
   * nothing to record against (documented skip, not a silent drop of an
   * otherwise-valid event).
   */
  private capture(
    sessionId: string | null,
    kind: TelemetryEventKindV1,
    marketTime: number | null,
    payload: object,
  ): void {
    if (sessionId == null) return;
    const event: TelemetryAppendInput = { wallClockMs: Date.now(), marketTime, kind, payload };
    void this.telemetryDb.append(sessionId, [event]);
  }
}
