import { describe, expect, it } from 'vitest';
import {
  captureOrderClock,
  freshOrderClock,
  withPlaybackToggled,
  type OrderClock,
} from './telemetry-anchors';

describe('telemetry-anchors (RFC-014 T5b-ii) — pure OrderClock helpers', () => {
  describe('freshOrderClock', () => {
    it('builds a zeroed clock anchored at the given wall-clock/index/playing state', () => {
      const clock = freshOrderClock('sess-1', 'sessionStart', 1000, 42, true);
      expect(clock).toEqual({
        sessionId: 'sess-1',
        anchorKind: 'sessionStart',
        anchorReplayIndex: 42,
        playing: true,
        lastTransitionWallClockMs: 1000,
        pausedMs: 0,
        playingMs: 0,
      });
    });
  });

  describe('withPlaybackToggled', () => {
    it('starts a fresh sessionStart clock when there is no prior clock', () => {
      const clock = withPlaybackToggled(null, 'sess-1', true, 1000, 10);
      expect(clock.sessionId).toBe('sess-1');
      expect(clock.anchorKind).toBe('sessionStart');
      expect(clock.playing).toBe(true);
      expect(clock.pausedMs).toBe(0);
      expect(clock.playingMs).toBe(0);
    });

    it('folds elapsed time into pausedMs while paused, then flips to playing', () => {
      const start = freshOrderClock('sess-1', 'sessionStart', 1000, 10, false);
      const next = withPlaybackToggled(start, 'sess-1', true, 1500, 10);
      expect(next.pausedMs).toBe(500);
      expect(next.playingMs).toBe(0);
      expect(next.playing).toBe(true);
      expect(next.lastTransitionWallClockMs).toBe(1500);
      // anchor itself is untouched by a playback toggle
      expect(next.anchorKind).toBe('sessionStart');
      expect(next.anchorReplayIndex).toBe(10);
    });

    it('folds elapsed time into playingMs while playing, then flips to paused', () => {
      const playing = freshOrderClock('sess-1', 'lastOrderEvent', 1000, 10, true);
      const next = withPlaybackToggled(playing, 'sess-1', false, 1300, 10);
      expect(next.playingMs).toBe(300);
      expect(next.pausedMs).toBe(0);
      expect(next.playing).toBe(false);
    });

    it('accumulates across multiple toggles in the same window', () => {
      let clock: OrderClock | null = freshOrderClock('sess-1', 'sessionStart', 0, 0, false);
      clock = withPlaybackToggled(clock, 'sess-1', true, 200, 0); // paused 200ms
      clock = withPlaybackToggled(clock, 'sess-1', false, 700, 0); // playing 500ms
      clock = withPlaybackToggled(clock, 'sess-1', true, 900, 0); // paused +200ms
      expect(clock.pausedMs).toBe(400);
      expect(clock.playingMs).toBe(500);
    });

    it('a session switch resets to a fresh sessionStart clock, discarding prior accumulation', () => {
      const stale = freshOrderClock('sess-1', 'lastOrderEvent', 1000, 50, true);
      const next = withPlaybackToggled(stale, 'sess-2', false, 5000, 5);
      expect(next.sessionId).toBe('sess-2');
      expect(next.anchorKind).toBe('sessionStart');
      expect(next.anchorReplayIndex).toBe(5);
      expect(next.pausedMs).toBe(0);
      expect(next.playingMs).toBe(0);
    });
  });

  describe('captureOrderClock', () => {
    it('anchorKind=sessionStart on the first-ever order of a session (no clock yet)', () => {
      const result = captureOrderClock(null, 'sess-1', 2000, 20, false);
      expect(result.anchorKind).toBe('sessionStart');
      expect(result.candlesRevealed).toBe(0); // anchor == now, no reveal yet
      expect(result.nextClock.anchorKind).toBe('lastOrderEvent');
      expect(result.nextClock.anchorReplayIndex).toBe(20);
    });

    it('anchorKind=lastOrderEvent when a PRIOR order placement is the most recent qualifying event', () => {
      const first = captureOrderClock(null, 'sess-1', 1000, 10, false);
      const second = captureOrderClock(first.nextClock, 'sess-1', 1400, 14, false);
      expect(second.anchorKind).toBe('lastOrderEvent');
      expect(second.candlesRevealed).toBe(4); // 14 - 10
    });

    it('splits pausedMs/playingMs correctly across play/pause transitions before the capture', () => {
      let clock: OrderClock | null = freshOrderClock('sess-1', 'sessionStart', 0, 0, false);
      clock = withPlaybackToggled(clock, 'sess-1', true, 100, 1); // paused 100ms
      clock = withPlaybackToggled(clock, 'sess-1', false, 600, 5); // playing 500ms
      const result = captureOrderClock(clock, 'sess-1', 900, 8, false); // + paused 300ms
      expect(result.pausedMs).toBe(400); // 100 + 300
      expect(result.playingMs).toBe(500);
      expect(result.candlesRevealed).toBe(8); // 8 - 0 (original anchor index)
    });

    it('clamps candlesRevealed to zero when the index moved backward since the anchor (e.g. an intervening jumpBack, which does not reset the anchor)', () => {
      const anchored = freshOrderClock('sess-1', 'lastOrderEvent', 1000, 100, false);
      const result = captureOrderClock(anchored, 'sess-1', 2000, 40, false); // index dropped 100 -> 40
      expect(result.candlesRevealed).toBe(0);
    });

    it('resets to a fresh lastOrderEvent anchor for the NEXT capture (chained calls)', () => {
      const first = captureOrderClock(null, 'sess-1', 1000, 10, true);
      expect(first.nextClock).toEqual({
        sessionId: 'sess-1',
        anchorKind: 'lastOrderEvent',
        anchorReplayIndex: 10,
        playing: true,
        lastTransitionWallClockMs: 1000,
        pausedMs: 0,
        playingMs: 0,
      });
    });

    it('a session switch produces a fresh sessionStart capture, ignoring the stale clock entirely', () => {
      const stale = freshOrderClock('sess-1', 'lastOrderEvent', 1000, 999, true);
      const result = captureOrderClock(stale, 'sess-2', 5000, 2, false);
      expect(result.anchorKind).toBe('sessionStart');
      expect(result.candlesRevealed).toBe(0);
      expect(result.pausedMs).toBe(0);
      expect(result.playingMs).toBe(0);
    });
  });
});
