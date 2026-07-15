import type { DrawingSnapshotEntry } from '../../state/telemetry/telemetry.models';

/**
 * A deterministic specification of one key moment of a trade (RFC-016 §4).
 * This is a VALUE OBJECT: never stored as rendered pixels, always
 * recomputed on demand via `RenderModel → ChartEngine`.
 *
 * Candle-free and framework-free (no Angular/NgRx imports) per engine
 * boundary invariant (CLAUDE.md invariant 1).
 *
 * TKM §2.1: SceneSpec = (symbol, datasetRefs, window, cursorTime,
 * orderGeometry, drawingSet, telemetryMarkers). Determinism property:
 * identical SceneSpec yields identical rendering because candle series
 * are immutable and the engine render path is pure.
 */
export interface SceneSpec {
  /** Symbol (e.g., 'EURUSD'). */
  symbol: string;
  /** AnchorTf references (e.g., timeframe strings), candle-free. */
  datasetRefs: string[];
  /** Market-time window [t0, t1] around the moment (UTC seconds). */
  window: { t0: number; t1: number };
  /** The exact moment reconstructed (UTC seconds). */
  cursorTime: number;
  /** Physical order/position geometry at the moment: entry, SL, TP, side, lots. */
  orderGeometry: {
    side: 'buy' | 'sell';
    entryPrice: number;
    sl: number;
    tp: number | null;
    lots: number;
  };
  /** Vector primitives present at the moment (frozen copy-on-write snapshot). */
  drawingSet: DrawingSnapshotEntry[];
  /**
   * Telemetry markers in the window (seeks, elapsed times, tMAE/tMFE).
   * OPAQUE structure; the read-side consumes this for event timeline
   * construction (D16.D, RFC-016 §4). Per D16.A, the term "seek" is BANNED:
   * the domain terms are "management event" (OrderModified, PositionModified)
   * and elapsed times (TimeElapsedBeforeOrder anchor kinds).
   */
  telemetryMarkers: object;
}

/**
 * Maximum evidence scenes per lesson (RFC-016 §2: "evidence has a per-lesson
 * cap", size guard pattern, J-2). Lessons with >= 6 scenes are rejected at
 * persistence time (lessons-db.service.ts, J-2).
 */
export const MAX_EVIDENCE_SCENES = 5;
