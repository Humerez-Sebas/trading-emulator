import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { Subscription, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TelemetryEffects } from './telemetry.effects';
import { ReplayActions } from '../replay/replay.actions';
import { selectCurrentTime, selectReplayTfSeconds } from '../selectors';
import { tradingFeature } from '../trading/trading.reducer';
import { TelemetryDbService } from '../../services/telemetry-db.service';

describe('TelemetryEffects — navigation observer (RFC-014 T5b-i)', () => {
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

  /** Activates every effect in the class (mirrors what `provideEffects` does
   * in production) — the jump family needs BOTH `syncJumpOrigin$` (private:
   * accessed via bracket notation, a standard TS escape for test code) and
   * `replayJump$` alive to observe the arm→consume sequence. */
  function subscribeAll(): Subscription {
    const sub = new Subscription();
    sub.add(
      (effects as unknown as { syncJumpOrigin$: { subscribe: () => Subscription } })[
        'syncJumpOrigin$'
      ].subscribe(),
    );
    sub.add(effects.replayJump$.subscribe());
    sub.add(effects.playbackToggled$.subscribe());
    sub.add(effects.speedChanged$.subscribe());
    return sub;
  }

  function arm(sessionId: string | null, currentTime: number, tfSeconds = 60) {
    store.overrideSelector(tradingFeature.selectActiveSessionId, sessionId);
    store.overrideSelector(selectCurrentTime, currentTime);
    store.overrideSelector(selectReplayTfSeconds, tfSeconds);
    store.refreshState();
  }

  // ─── replayJump$ (+ syncJumpOrigin$) ───────────────────────────────────

  describe('replayJump$', () => {
    it('jumpForward landing on goToTime captures fromTime/toTime/grain', async () => {
      arm('sess-1', 1000, 60);
      const sub = subscribeAll();

      actions$.next(ReplayActions.jumpForward());
      await Promise.resolve();
      actions$.next(ReplayActions.goToTime({ time: 1600 }));
      await Promise.resolve();

      expect(telemetryDb.append).toHaveBeenCalledTimes(1);
      expect(telemetryDb.append).toHaveBeenCalledWith('sess-1', [
        expect.objectContaining({
          kind: 'ReplayJump',
          marketTime: 1600,
          payload: { fromTime: 1000, toTime: 1600, grain: 60 },
        }),
      ]);
      sub.unsubscribe();
    });

    it('jumpBack landing on goToTime captures fromTime/toTime/grain', async () => {
      arm('sess-1', 2000, 60);
      const sub = subscribeAll();

      actions$.next(ReplayActions.jumpBack());
      await Promise.resolve();
      actions$.next(ReplayActions.goToTime({ time: 1400 }));
      await Promise.resolve();

      expect(telemetryDb.append).toHaveBeenCalledWith('sess-1', [
        expect.objectContaining({
          kind: 'ReplayJump',
          payload: { fromTime: 2000, toTime: 1400, grain: 60 },
        }),
      ]);
      sub.unsubscribe();
    });

    it('advanceDisplay fold landing on goToTime captures fromTime/toTime/grain', async () => {
      arm('sess-1', 300, 300);
      const sub = subscribeAll();

      actions$.next(ReplayActions.advanceDisplay());
      await Promise.resolve();
      actions$.next(ReplayActions.goToTime({ time: 3600 }));
      await Promise.resolve();

      expect(telemetryDb.append).toHaveBeenCalledWith('sess-1', [
        expect.objectContaining({
          kind: 'ReplayJump',
          payload: { fromTime: 300, toTime: 3600, grain: 300 },
        }),
      ]);
      sub.unsubscribe();
    });

    it('does NOT record a ReplayJump for a plain autoplay advanceCandle → goToTime', async () => {
      arm('sess-1', 1000, 60);
      const sub = subscribeAll();

      actions$.next(ReplayActions.advanceCandle());
      await Promise.resolve();
      actions$.next(ReplayActions.goToTime({ time: 1060 }));
      await Promise.resolve();

      expect(telemetryDb.append).not.toHaveBeenCalled();
      sub.unsubscribe();
    });

    it('does NOT record a ReplayJump for a stepBack → goToTime', async () => {
      arm('sess-1', 1000, 60);
      const sub = subscribeAll();

      actions$.next(ReplayActions.stepBack());
      await Promise.resolve();
      actions$.next(ReplayActions.goToTime({ time: 940 }));
      await Promise.resolve();

      expect(telemetryDb.append).not.toHaveBeenCalled();
      sub.unsubscribe();
    });

    it('a jumpForward that never lands (guard trip in ReplayEffects, no goToTime follows) does not misattribute a LATER unrelated goToTime', async () => {
      arm('sess-1', 1000, 60);
      const sub = subscribeAll();

      // jumpForward arms pendingJumpOrigin, but — as would happen when
      // ReplayEffects.jumpForward$'s own guard trips (already at the data
      // end) — NO goToTime ever follows it.
      actions$.next(ReplayActions.jumpForward());
      await Promise.resolve();

      // The next ACTUAL navigation is an unrelated plain autoplay step.
      // syncJumpOrigin$ must have cleared the stale origin so this goToTime
      // is not misattributed as the jumpForward's landing.
      actions$.next(ReplayActions.advanceCandle());
      await Promise.resolve();
      actions$.next(ReplayActions.goToTime({ time: 1060 }));
      await Promise.resolve();

      expect(telemetryDb.append).not.toHaveBeenCalled();
      sub.unsubscribe();
    });

    it('does not capture when there is no active session', async () => {
      arm(null, 1000, 60);
      const sub = subscribeAll();

      actions$.next(ReplayActions.jumpForward());
      await Promise.resolve();
      actions$.next(ReplayActions.goToTime({ time: 1600 }));
      await Promise.resolve();

      expect(telemetryDb.append).not.toHaveBeenCalled();
      sub.unsubscribe();
    });

    it('REVIEW FIX (T5 review, wave 1): a jumpForward that never lands, followed — after the arm has expired — by a goToTime with NO observable preceding cause (as dispatched directly by the go-to-date dialog, workspace restore, or CSV start), does not misattribute a spurious ReplayJump', async () => {
      arm('sess-1', 1000, 60);
      const sub = subscribeAll();

      // jumpForward arms pendingJumpOrigin, but — as would happen when
      // ReplayEffects.jumpForward$'s own guard trips (already at the data
      // end) — NO goToTime ever follows it.
      actions$.next(ReplayActions.jumpForward());
      await Promise.resolve();

      // Let the arm's own same-macrotask-scoped setTimeout(0) expiry run.
      // This is the real-world gap between the no-op jump and the user
      // later opening the go-to-date dialog and confirming — a gap with NO
      // intervening store action at all, unlike the stepBack/advanceCandle
      // regression above. Nothing short of this real timer elapsing can
      // model that gap.
      await new Promise((resolve) => setTimeout(resolve, 0));

      // A bare goToTime, exactly as chart.component.ts's confirmDateDialog
      // dispatches it: no jump-family action, no advanceCandle/stepBack —
      // nothing — precedes it.
      actions$.next(ReplayActions.goToTime({ time: 1600 }));
      await Promise.resolve();

      expect(telemetryDb.append).not.toHaveBeenCalled();
      sub.unsubscribe();
    });
  });

  // ─── playbackToggled$ ───────────────────────────────────────────────────

  describe('playbackToggled$', () => {
    it('play captures playing:true', async () => {
      arm('sess-1', 500);
      const sub = subscribeAll();

      actions$.next(ReplayActions.play());
      await Promise.resolve();

      expect(telemetryDb.append).toHaveBeenCalledWith('sess-1', [
        expect.objectContaining({
          kind: 'PlaybackToggled',
          marketTime: 500,
          payload: { playing: true },
        }),
      ]);
      sub.unsubscribe();
    });

    it('pause captures playing:false', async () => {
      arm('sess-1', 500);
      const sub = subscribeAll();

      actions$.next(ReplayActions.pause());
      await Promise.resolve();

      expect(telemetryDb.append).toHaveBeenCalledWith('sess-1', [
        expect.objectContaining({ kind: 'PlaybackToggled', payload: { playing: false } }),
      ]);
      sub.unsubscribe();
    });

    it('does not capture when there is no active session', async () => {
      arm(null, 500);
      const sub = subscribeAll();

      actions$.next(ReplayActions.play());
      await Promise.resolve();

      expect(telemetryDb.append).not.toHaveBeenCalled();
      sub.unsubscribe();
    });
  });

  // ─── speedChanged$ ──────────────────────────────────────────────────────

  describe('speedChanged$', () => {
    it('captures msPerCandle', async () => {
      arm('sess-1', 700);
      const sub = subscribeAll();

      actions$.next(ReplayActions.changeSpeed({ msPerCandle: 250 }));
      await Promise.resolve();

      expect(telemetryDb.append).toHaveBeenCalledWith('sess-1', [
        expect.objectContaining({
          kind: 'SpeedChanged',
          marketTime: 700,
          payload: { msPerCandle: 250 },
        }),
      ]);
      sub.unsubscribe();
    });

    it('does not capture when there is no active session', async () => {
      arm(null, 700);
      const sub = subscribeAll();

      actions$.next(ReplayActions.changeSpeed({ msPerCandle: 250 }));
      await Promise.resolve();

      expect(telemetryDb.append).not.toHaveBeenCalled();
      sub.unsubscribe();
    });
  });

  // ─── passivity (dispatch:false) ─────────────────────────────────────────

  describe('passivity', () => {
    it('never dispatches an action for any observed navigation event', async () => {
      arm('sess-1', 1000, 60);
      const dispatchSpy = vi.spyOn(store, 'dispatch');
      const sub = subscribeAll();

      actions$.next(ReplayActions.jumpForward());
      await Promise.resolve();
      actions$.next(ReplayActions.goToTime({ time: 1600 }));
      await Promise.resolve();
      actions$.next(ReplayActions.play());
      await Promise.resolve();
      actions$.next(ReplayActions.changeSpeed({ msPerCandle: 100 }));
      await Promise.resolve();

      expect(dispatchSpy).not.toHaveBeenCalled();
      sub.unsubscribe();
    });
  });
});
