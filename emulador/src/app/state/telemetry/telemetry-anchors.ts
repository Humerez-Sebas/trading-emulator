import type { TimeElapsedAnchorKind } from './telemetry.models';

/**
 * Pure, effect-local rolling clock backing `TimeElapsedBeforeOrder` (RFC-014
 * §4). No framework imports, no `Date.now()`/wall-clock reads inside — every
 * timestamp/index arrives as an explicit argument so this module is testable
 * without TestBed or a MockStore (mirrors the I-10 idiom already applied to
 * `fill-engine.ts`/`simulation-domain.ts`).
 *
 * Anchor rule (RFC-014 §4): the anchor is the most recent of
 * {session start, last order event}. Notably NOT in that list:
 * play/pause toggles (they only split the elapsed window into paused/playing
 * buckets, they never move the anchor itself) and `ReplayJump` (multi-candle
 * fold/jump navigation — deliberately excluded per the brief).
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
  /**
   * Press memory for the D16.B `lastJump` anchor (RFC-016 §Task 1 Part B):
   * a snapshot of the PREVIOUS `+1` (`advanceDisplay`) press, used by
   * {@link withDisplayAdvance} to measure the paused ms elapsed since it.
   * Deliberately OPTIONAL/absent (never `null`) rather than a tri-state
   * field: every `freshOrderClock` — the ONLY place a clock is built from
   * scratch, reused by both `ensureSession`'s session-switch reset and
   * `captureOrderClock`'s post-order re-anchor — omits this key entirely,
   * so a session switch or an order capture CLEARS the press memory for
   * free (no separate clearing logic needed; the RFC's "anchor never moves
   * backward past a more recent anchor event" falls out of this by
   * construction). Absence is also what makes the pre-existing
   * `toEqual({...})` assertions in `telemetry-anchors.spec.ts` (which don't
   * mention this field) keep passing unmodified — `toEqual` ignores
   * `undefined`/absent properties, so a `null` default would have broken
   * them instead.
   */
  lastAdvancePress?: DisplayAdvancePress;
}

/**
 * Snapshot of a `+1` (`advanceDisplay`) press, recorded by
 * {@link withDisplayAdvance} (D16.B). `pausedMsAtPress`/`playingMsAtPress`
 * are the `OrderClock`'s cumulative paused/playing counters AT this press's
 * moment (relative to whatever anchor was active then). Subtracting them
 * from the SAME counters at a LATER press yields the paused/playing ms
 * strictly BETWEEN the two presses — self-consistent even across a
 * retroactive reset in between, because a reset rebases the clock's own
 * counters and the just-recorded press memory identically (see
 * `withDisplayAdvance`'s doc comment).
 */
export interface DisplayAdvancePress {
  wallClockMs: number;
  replayIndex: number;
  pausedMsAtPress: number;
  playingMsAtPress: number;
}

/**
 * D16.B's pause threshold: `pausedMs` accumulated since the PREVIOUS `+1`
 * press, at or above which {@link withDisplayAdvance} retroactively resets
 * the anchor to that previous press's instant. INCLUSIVE (`>=`): the RFC's
 * decision title reads "≥3 s" while its body reads "supera 3000 ms"
 * (strictly-greater-than) — this implementation takes the inclusive
 * boundary (title wording), pinned by a dedicated boundary test in
 * `telemetry.jump-anchor.spec.ts` (exactly 3000ms ⇒ reset).
 */
export const LAST_JUMP_RESET_THRESHOLD_MS = 3000;

/** A brand-new clock anchored right now — the shared shape every reset (session/order) collapses to. */
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
 * every entry point below (`withPlaybackToggled`, `captureOrderClock`)
 * calls this first, so the reset happens lazily on
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
 * anchor and this order (neither resets the anchor — only order events do,
 * per the RFC's anchor list) can leave the current index BELOW the anchor's
 * index; that must not fabricate a negative reveal count.
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

/**
 * `+1` press (`ReplayActions.advanceDisplay`, D16.B) — the ONLY navigation
 * event that participates in the `lastJump` anchor (`jumpForward`/
 * `jumpBack` do NOT call this; the RFC names only `advanceDisplay`).
 *
 * Settles the elapsed window up to now (the same fold every transition
 * does), then compares the PAUSED ms accumulated since the PREVIOUS `+1`
 * press (`clock.lastAdvancePress`, if any, same session) against
 * {@link LAST_JUMP_RESET_THRESHOLD_MS}:
 *
 * - `>= 3000`ms paused since the previous press: the anchor resets
 *   RETROACTIVELY to that PREVIOUS press's instant — `anchorKind:
 *   'lastJump'`, `anchorReplayIndex` = the previous press's replayIndex,
 *   and the paused/playing accumulators are REBASED to measure ONLY from
 *   that previous press onward, so the qualifying pause itself stays
 *   INSIDE the newly measured window (RFC: "el tiempo de pausa queda
 *   DENTRO de la ventana medida") — it is not excluded as "before" the new
 *   anchor.
 * - `< 3000`ms, or no previous press recorded at all (the very first `+1`
 *   of a session, or the first one after a more-recent anchor-resetting
 *   event — see below): no reset; the clock's existing anchor is left
 *   untouched, only the elapsed window is folded in as usual.
 *
 * Either way, `lastAdvancePress` is updated to THIS press's instant (press
 * memory updates on EVERY `+1`, whether or not it resets), so the NEXT
 * `+1` measures its own window against it. The subtraction stays correct
 * across any number of prior resets: a reset rebases the clock's own
 * pausedMs/playingMs AND the just-recorded press memory to the identical
 * new baseline in the same step, so a later delta against that memory is
 * always relative to whichever anchor is active at the time.
 *
 * Press memory is CLEARED (the field is simply absent) by any event that
 * routes through `freshOrderClock` — a session switch (`ensureSession`) or
 * an order capture (`captureOrderClock`'s `nextClock`, `'lastOrderEvent'`)
 * — so the anchor can never move backward past a more recent anchor event:
 * the next `+1` after either sees no `lastAdvancePress` and simply cannot
 * reset, exactly as if it were the first `+1` of a fresh clock.
 */
export function withDisplayAdvance(
  clock: OrderClock | null,
  sessionId: string,
  wallClockMs: number,
  replayIndex: number,
  playing: boolean,
): OrderClock {
  const base = ensureSession(clock, sessionId, wallClockMs, replayIndex, playing);
  const settled = accumulate(base, wallClockMs);
  const prevPress = settled.lastAdvancePress;

  if (prevPress) {
    const pausedSincePress = settled.pausedMs - prevPress.pausedMsAtPress;
    if (pausedSincePress >= LAST_JUMP_RESET_THRESHOLD_MS) {
      const playingSincePress = settled.playingMs - prevPress.playingMsAtPress;
      return {
        ...settled,
        playing,
        anchorKind: 'lastJump',
        anchorReplayIndex: prevPress.replayIndex,
        pausedMs: pausedSincePress,
        playingMs: playingSincePress,
        lastAdvancePress: {
          wallClockMs,
          replayIndex,
          pausedMsAtPress: pausedSincePress,
          playingMsAtPress: playingSincePress,
        },
      };
    }
  }

  return {
    ...settled,
    playing,
    lastAdvancePress: {
      wallClockMs,
      replayIndex,
      pausedMsAtPress: settled.pausedMs,
      playingMsAtPress: settled.playingMs,
    },
  };
}
