import type { TimeElapsedAnchorKind } from './telemetry.models';

/**
 * Pure, effect-local rolling clock backing `TimeElapsedBeforeOrder` (RFC-014
 * §4). No framework imports, no `Date.now()`/wall-clock reads inside — every
 * timestamp/index arrives as an explicit argument so this module is testable
 * without TestBed or a MockStore (mirrors the I-10 idiom already applied to
 * `fill-engine.ts`/`simulation-domain.ts`).
 *
 * Anchor rule (RFC-014 §4): the anchor is the most recent of
 * {session start, last seek, last order event}. Notably NOT in that list:
 * play/pause toggles (they only split the elapsed window into paused/playing
 * buckets, they never move the anchor itself) and `ReplayJump` (multi-candle
 * fold/jump navigation — deliberately excluded per the brief; only the
 * scrubber teleport, `ReplaySeek`, resets the anchor).
 *
 * `TelemetryEffects` holds exactly one mutable `OrderClock | null` field and
 * routes every relevant navigation/order event through the pure functions
 * below, swapping in the returned clock — the same "effect holds one mutable
 * field, a pure function computes its next value" idiom as
 * `pendingJumpOrigin` in `telemetry.effects.ts` (T5b-i; its arm/expiry
 * mechanism was revised in the T5 review fix — see that field's doc
 * comment).
 */
export interface OrderClock {
  /** Session this clock belongs to; a session switch starts a fresh clock (see `ensureSession`). */
  sessionId: string;
  anchorKind: TimeElapsedAnchorKind;
  /** `selectReplayIndex` value at the anchor moment — `candlesRevealed`'s baseline. */
  anchorReplayIndex: number;
  playing: boolean;
  /** Wall-clock ms of the last playing/paused transition (or the anchor itself, if none yet). */
  lastTransitionWallClockMs: number;
  /** Accumulated ms in each state SINCE the anchor, up to `lastTransitionWallClockMs`. */
  pausedMs: number;
  playingMs: number;
}

/** A brand-new clock anchored right now — the shared shape every reset (session/seek/order) collapses to. */
export function freshOrderClock(
  sessionId: string,
  anchorKind: TimeElapsedAnchorKind,
  wallClockMs: number,
  replayIndex: number,
  playing: boolean,
): OrderClock {
  return {
    sessionId,
    anchorKind,
    anchorReplayIndex: replayIndex,
    playing,
    lastTransitionWallClockMs: wallClockMs,
    pausedMs: 0,
    playingMs: 0,
  };
}

/**
 * A session switch (or the very first event of a session) starts a fresh
 * `'sessionStart'` anchor — this is the ONLY place `'sessionStart'` is ever
 * produced. No separate "session changed" subscription is needed anywhere:
 * every entry point below (`withPlaybackToggled`, `withSeekAnchor`,
 * `captureOrderClock`) calls this first, so the reset happens lazily on
 * whichever event touches the clock first after the switch.
 */
function ensureSession(
  clock: OrderClock | null,
  sessionId: string,
  wallClockMs: number,
  replayIndex: number,
  playing: boolean,
): OrderClock {
  if (clock && clock.sessionId === sessionId) return clock;
  return freshOrderClock(sessionId, 'sessionStart', wallClockMs, replayIndex, playing);
}

/** Folds elapsed wall-clock time (since the last transition) into the bucket matching the CURRENT (pre-flip) playing state. */
function accumulate(clock: OrderClock, wallClockMs: number): OrderClock {
  const elapsed = Math.max(0, wallClockMs - clock.lastTransitionWallClockMs);
  return {
    ...clock,
    pausedMs: clock.pausedMs + (clock.playing ? 0 : elapsed),
    playingMs: clock.playingMs + (clock.playing ? elapsed : 0),
    lastTransitionWallClockMs: wallClockMs,
  };
}

/**
 * Play/pause toggled: settle the just-ended window into paused/playingMs,
 * then flip `playing`. The anchor itself (`anchorKind`/`anchorReplayIndex`)
 * is left untouched — play/pause is not an anchor-resetting event.
 */
export function withPlaybackToggled(
  clock: OrderClock | null,
  sessionId: string,
  playing: boolean,
  wallClockMs: number,
  replayIndex: number,
): OrderClock {
  const base = ensureSession(clock, sessionId, wallClockMs, replayIndex, playing);
  return { ...accumulate(base, wallClockMs), playing };
}

/**
 * Scrubber teleport (`ReplaySeek`): a hard reset of the whole window — frozen
 * navigation semantics (a seek is a teleport, not something to accumulate
 * elapsed time through), so this discards any partial accumulation rather
 * than folding it in first.
 */
export function withSeekAnchor(
  clock: OrderClock | null,
  sessionId: string,
  wallClockMs: number,
  replayIndex: number,
  playing: boolean,
): OrderClock {
  return freshOrderClock(sessionId, 'lastSeek', wallClockMs, replayIndex, playing);
}

/** Result of capturing a `TimeElapsedBeforeOrder` at order placement. */
export interface OrderClockCapture {
  anchorKind: TimeElapsedAnchorKind;
  pausedMs: number;
  playingMs: number;
  candlesRevealed: number;
  /** The clock to store for the NEXT capture — always a fresh `'lastOrderEvent'` anchor at (now, replayIndex). */
  nextClock: OrderClock;
}

/**
 * Order placement (`placeOrder`/`openMarket`, once resolved to have actually
 * added a new order/position — see `resolveOrderRef` in `telemetry-facts.ts`):
 * settles the elapsed window, reads `candlesRevealed` as the index delta
 * since the anchor (simplest-correct derivation: `selectReplayIndex` at the
 * anchor vs now — see the module doc for why this was chosen over counting
 * individual advance/goToTime actions), then resets to a fresh
 * `'lastOrderEvent'` anchor for the NEXT order.
 *
 * `candlesRevealed` is clamped to >= 0: a `jumpBack`/`stepBack` between the
 * anchor and this order (neither resets the anchor — only `ReplaySeek` and
 * order events do, per the RFC's anchor list) can leave the current index
 * BELOW the anchor's index; that must not fabricate a negative reveal count.
 */
export function captureOrderClock(
  clock: OrderClock | null,
  sessionId: string,
  wallClockMs: number,
  replayIndex: number,
  playing: boolean,
): OrderClockCapture {
  const base = ensureSession(clock, sessionId, wallClockMs, replayIndex, playing);
  const settled = accumulate(base, wallClockMs);
  const candlesRevealed = Math.max(0, replayIndex - base.anchorReplayIndex);
  return {
    anchorKind: settled.anchorKind,
    pausedMs: settled.pausedMs,
    playingMs: settled.playingMs,
    candlesRevealed,
    nextClock: freshOrderClock(sessionId, 'lastOrderEvent', wallClockMs, replayIndex, playing),
  };
}
