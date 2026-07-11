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

/** The v1 event kinds (RFC-014 §4 table). */
export type TelemetryEventKindV1 =
  | 'ReplaySeek'
  | 'ReplayJump'
  | 'PlaybackToggled'
  | 'SpeedChanged'
  | 'TimeElapsedBeforeOrder'
  | 'DrawingSnapshot'
  | 'OrderFilled'
  | 'PositionClosed';

/** Scrubber teleport (registered, never simulated — frozen navigation semantics). */
export interface ReplaySeekPayload {
  fromTime: number;
  toTime: number;
  direction: 'forward' | 'backward';
}

/**
 * Multi-candle jump. `grain` distinguishes the two jump commands: `'fold'`
 * for `Jump Forward` (processes fills for every crossed candle) vs.
 * `'review'` for `Jump Back` (pure navigation, no fills).
 */
export interface ReplayJumpPayload {
  fromTime: number;
  toTime: number;
  grain: 'fold' | 'review';
}

export interface PlaybackToggledPayload {
  playing: boolean;
}

export interface SpeedChangedPayload {
  msPerCandle: number;
}

/**
 * Anchor for elapsed-time accounting at order placement: the most recent of
 * {session start, last seek, last order event}.
 */
export type TimeElapsedAnchorKind = 'sessionStart' | 'lastSeek' | 'lastOrderEvent';

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

/** Discriminated union tying each v1 kind to its exact payload shape. */
export type TelemetryEventV1 =
  | { kind: 'ReplaySeek'; payload: ReplaySeekPayload }
  | { kind: 'ReplayJump'; payload: ReplayJumpPayload }
  | { kind: 'PlaybackToggled'; payload: PlaybackToggledPayload }
  | { kind: 'SpeedChanged'; payload: SpeedChangedPayload }
  | { kind: 'TimeElapsedBeforeOrder'; payload: TimeElapsedBeforeOrderPayload }
  | { kind: 'DrawingSnapshot'; payload: DrawingSnapshotPayload }
  | { kind: 'OrderFilled'; payload: OrderFilledPayload }
  | { kind: 'PositionClosed'; payload: PositionClosedPayload };
