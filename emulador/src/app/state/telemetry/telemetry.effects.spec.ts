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
    sub.add(effects.replaySeek$.subscribe());
    sub.add((effects as unknown as { syncJumpOrigin$: { subscribe: () => Subscription } })[
      'syncJumpOrigin$'
    ].subscribe());
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

  // ─── replaySeek$ ────────────────────────────────────────────────────────

  describe('replaySeek$', () => {
    it('captures ReplaySeek with fromTime/toTime/direction=forward on seekTo', async () => {
      arm('sess-1', 100);
      const sub = subscribeAll();

      store.overrideSelector(selectCurrentTime, 250);
      store.refreshState();
      actions$.next(ReplayActions.seekTo({ time: 250 }));
      await Promise.resolve();

      expect(telemetryDb.append).toHaveBeenCalledTimes(1);
      expect(telemetryDb.append).toHaveBeenCalledWith('sess-1', [
        expect.objectContaining({
          kind: 'ReplaySeek',
          marketTime: 250,
          payload: { fromTime: 100, toTime: 250, direction: 'forward' },
        }),
      ]);
      sub.unsubscribe();
    });

    it('direction=backward when toTime < fromTime', async () => {
      arm('sess-1', 500);
      const sub = subscribeAll();

      store.overrideSelector(selectCurrentTime, 200);
      store.refreshState();
      actions$.next(ReplayActions.seekTo({ time: 200 }));
      await Promise.resolve();

      expect(telemetryDb.append).toHaveBeenCalledWith('sess-1', [
        expect.objectContaining({
          payload: { fromTime: 500, toTime: 200, direction: 'backward' },
        }),
      ]);
      sub.unsubscribe();
    });

    it('does not capture when there is no active session', async () => {
      arm(null, 100);
      const sub = subscribeAll();

      store.overrideSelector(selectCurrentTime, 250);
      store.refreshState();
      actions$.next(ReplayActions.seekTo({ time: 250 }));
      await Promise.resolve();

      expect(telemetryDb.append).not.toHaveBeenCalled();
      sub.unsubscribe();
    });
  });

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

      actions$.next(ReplayActions.seekTo({ time: 1200 }));
      await Promise.resolve();
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
