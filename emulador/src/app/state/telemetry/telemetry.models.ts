import type { DrawingPoint, DrawingType } from '../drawings/drawings.models';
import type {
  OrderFilled as OrderFilledFact,
  PositionClosed as PositionClosedFact,
} from '../trading/domain-facts';

/**
 * Telemetry envelope types (RFC-014 §4 — La Caja Negra).
 *
 * Storage-layer contract for `TelemetryDbService`: append-only, local-only,
 * candle-free. This module defines DATA ONLY — no framework imports, no
 * behavior (mirrors the I-10 idiom already applied to `domain-facts.ts`).
 *
 * Neutrality (N-1): every identifier here is objective vocabulary describing
 * WHAT happened (a seek, a jump, an order placement, a fill), never an
 * interpretation of it.
 */

/**
 * Append-only envelope persisted by `TelemetryDbService`. Loosely typed
 * (`kind: string`, `payload: object`) so the storage layer stays closed to
 * modification: a new v1+ event kind is a wider discriminated union below,
 * never a change to this shape or to the store's schema.
 */
export interface TelemetryEvent {
  seq: number;
  wallClockMs: number;
  marketTime: number | null;
  kind: string;
  payload: object;
}

/** The v1 event kinds (RFC-014 §4 table; RFC-016 §1 adds the management-event pair). */
export type TelemetryEventKindV1 =
  | 'ReplayJump'
  | 'PlaybackToggled'
  | 'SpeedChanged'
  | 'TimeElapsedBeforeOrder'
  | 'DrawingSnapshot'
  | 'OrderFilled'
  | 'PositionClosed'
  | 'OrderModified'
  | 'PositionModified';

/**
 * Multi-candle jump/fold landing (`jumpForward`, `jumpBack`, `advanceDisplay`).
 * `grain` is the replay-resolution candle duration in seconds at the moment
 * of capture (`selectReplayTfSeconds` — resolution when set, else the
 * display TF) — RESOLVED (T5b-i) from T5a's flagged open question: RFC §4
 * names the field without a type; "grain" reads as the granularity of the
 * jump (the candle duration being stepped over), not a `'fold' | 'review'`
 * discriminant of which command caused it — that distinction is already
 * implicit in `TelemetryEvent.kind` (`ReplayJump` is only ever emitted for
 * the fold/jump family, never for a plain single-candle advance).
 */
export interface ReplayJumpPayload {
  fromTime: number;
  toTime: number;
  grain: number;
}

export interface PlaybackToggledPayload {
  playing: boolean;
}

export interface SpeedChangedPayload {
  msPerCandle: number;
}

/**
 * Anchor for elapsed-time accounting at order placement: the most recent of
 * {session start, last order event, last qualifying `+1`} (RFC-016 D16.B
 * adds `'lastJump'` — a `+1` (`advanceDisplay`) press that follows a
 * qualifying pause (>= 3000 ms paused since the PREVIOUS `+1` press) resets
 * the anchor retroactively to that previous press's instant; see
 * `withDisplayAdvance` in `telemetry-anchors.ts`). The scrubber's own anchor
 * kind was removed pre-RFC-016 (D16.A, dead code — the scrubber was never
 * built).
 */
export type TimeElapsedAnchorKind = 'sessionStart' | 'lastOrderEvent' | 'lastJump';

export interface TimeElapsedBeforeOrderPayload {
  orderRef: string;
  anchorKind: TimeElapsedAnchorKind;
  pausedMs: number;
  playingMs: number;
  candlesRevealed: number;
}

/** One drawing in a `DrawingSnapshot` (G3: frozen copy-on-write vector). */
export interface DrawingSnapshotEntry {
  type: DrawingType;
  anchorPoints: DrawingPoint[];
  styleToken: string;
}

/** Captured at order placement and at position close. */
export interface DrawingSnapshotPayload {
  eventRef: string;
  drawings: DrawingSnapshotEntry[];
}

/** Mirrors the Task-4 reified fact, minus the discriminant (redundant with the envelope's `kind`). */
export type OrderFilledPayload = Omit<OrderFilledFact, 'kind'>;

/** Mirrors the Task-4 reified fact, minus the discriminant (redundant with the envelope's `kind`). */
export type PositionClosedPayload = Omit<PositionClosedFact, 'kind'>;

/**
 * A "management event" (RFC-016 §1): a physical SL/TP/entry modification of
 * a LIVE pending order. Exactly the changed field's `from`/`to` — no
 * direction/judgment (tighten/widen) field: that is read-side geometry,
 * derivable by comparing `from`/`to` against the order's side, never stored
 * (N-1). `entry`/`sl` mirror `PendingOrder.entryPrice`/`sl` (always
 * numbers); `tp` mirrors `PendingOrder.tp` (`number | null` — setting or
 * clearing a TP is itself a management event).
 */
export type OrderModifiedPayload =
  | { orderRef: string; field: 'sl' | 'entry'; from: number; to: number }
  | { orderRef: string; field: 'tp'; from: number | null; to: number | null };

/**
 * A "management event" (RFC-016 §1) on a LIVE position. Same neutrality
 * rule as {@link OrderModifiedPayload}: no direction/judgment field. `sl`
 * mirrors `Position.sl` (always a number); `tp` mirrors `Position.tp`
 * (`number | null`).
 */
export type PositionModifiedPayload =
  | { positionRef: string; field: 'sl'; from: number; to: number }
  | { positionRef: string; field: 'tp'; from: number | null; to: number | null };

/** Discriminated union tying each v1 kind to its exact payload shape. */
export type TelemetryEventV1 =
  | { kind: 'ReplayJump'; payload: ReplayJumpPayload }
  | { kind: 'PlaybackToggled'; payload: PlaybackToggledPayload }
  | { kind: 'SpeedChanged'; payload: SpeedChangedPayload }
  | { kind: 'TimeElapsedBeforeOrder'; payload: TimeElapsedBeforeOrderPayload }
  | { kind: 'DrawingSnapshot'; payload: DrawingSnapshotPayload }
  | { kind: 'OrderFilled'; payload: OrderFilledPayload }
  | { kind: 'PositionClosed'; payload: PositionClosedPayload }
  | { kind: 'OrderModified'; payload: OrderModifiedPayload }
  | { kind: 'PositionModified'; payload: PositionModifiedPayload };
