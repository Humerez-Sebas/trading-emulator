import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { pairwise, tap, withLatestFrom } from 'rxjs/operators';
import { TelemetryDbService, type TelemetryAppendInput } from '../../services/telemetry-db.service';
import type { TelemetryEventKindV1 } from './telemetry.models';
import { ReplayActions } from '../replay/replay.actions';
import { selectCurrentTime, selectReplayTfSeconds } from '../selectors';
import { tradingFeature } from '../trading/trading.reducer';

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
 * Scope (T5b-i): navigation events only — `ReplaySeek`, `ReplayJump`,
 * `PlaybackToggled`, `SpeedChanged`. The trading-side events
 * (`TimeElapsedBeforeOrder`, `DrawingSnapshot`, the `OrderFilled`/
 * `PositionClosed` facts) and the V-8 frame-budget measurement are T5b-ii, a
 * separate later dispatch: add them as NEW effect properties (+ new private
 * helpers if needed) below `speedChanged$`. Nothing here needs to change to
 * accommodate them — `capture()` is already the shared envelope/session-scope
 * choke point every future observer should go through.
 *
 * Session scoping: every capture reads the active session id
 * (`TradingState.activeSessionId` via `tradingFeature.selectActiveSessionId`)
 * and is a no-op when it is `null` — no active session, nothing to record
 * against.
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
   * Origin cursor for an in-flight jump/fold command (`jumpForward`,
   * `jumpBack`, `advanceDisplay`), captured BEFORE it lands. `null` means
   * the next `goToTime` this effect sees should NOT be recorded as a
   * `ReplayJump` (a plain autoplay `advanceCandle` step or a `stepBack`
   * snap — both also funnel through `goToTime`).
   *
   * FINAL-AUDIT ATTENTION — correctness here rests on one @ngrx/store
   * internal guarantee, so it is spelled out: `State` (ngrx-store's internal
   * reducer runner) feeds every dispatch through `observeOn(queueScheduler)`
   * before applying the reducer, and effects (`Actions`, built on
   * `ScannedActionsSubject`) are only notified of an action AFTER its
   * reducer has run. `queueScheduler` is a FIFO trampoline: a
   * `store.dispatch()` triggered from INSIDE another dispatch's own effect
   * notification (e.g. `ReplayEffects.jumpForward$`'s `mergeMap`
   * re-dispatching its folded `processCandle`s and terminal `goToTime`) is
   * QUEUED, not run reentrantly. That means ALL subscribers of the
   * ORIGINATING action — including `syncJumpOrigin$` below, regardless of
   * `TelemetryEffects`'s position in `provideEffects(...)` relative to
   * `ReplayEffects` — finish running before any action IT caused is
   * processed. That is what makes "record the origin on the cause action,
   * read it on the landing action" safe here, independent of effect
   * registration order.
   *
   * `syncJumpOrigin$` also listens to `advanceCandle`/`stepBack` (the other
   * two actions that can themselves lead to a `goToTime`) purely to CLEAR a
   * stale origin: `jumpForward`/`jumpBack`/`advanceDisplay` are no-ops in
   * `ReplayEffects` at a session/data boundary (no `goToTime` follows at
   * all), and without this, a later UNRELATED `goToTime` would be
   * misattributed to the stale jump. Re-syncing on every `goToTime`-capable
   * cause immediately before it fires closes that gap.
   */
  private pendingJumpOrigin: { fromTime: number } | null = null;

  private static readonly JUMP_FAMILY = new Set<string>([
    ReplayActions.jumpForward.type,
    ReplayActions.jumpBack.type,
    ReplayActions.advanceDisplay.type,
  ]);

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

  /**
   * Re-syncs `pendingJumpOrigin` immediately before every action that can
   * itself lead to a `goToTime` dispatch (see that field's doc comment for
   * why this ordering is safe regardless of effect registration).
   */
  private syncJumpOrigin$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(
          ReplayActions.jumpForward,
          ReplayActions.jumpBack,
          ReplayActions.advanceDisplay,
          ReplayActions.advanceCandle,
          ReplayActions.stepBack,
        ),
        withLatestFrom(this.store.select(selectCurrentTime)),
        tap(([action, fromTime]) => {
          this.pendingJumpOrigin = TelemetryEffects.JUMP_FAMILY.has(action.type)
            ? { fromTime }
            : null;
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
