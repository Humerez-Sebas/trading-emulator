import type { ClosedTrade } from '../../state/trading/trading.models';
import type { TelemetryEvent } from '../../state/telemetry/telemetry.models';
import type { DrawingSnapshotEntry } from '../../state/telemetry/telemetry.models';
import { SceneSpec, SCENE_WINDOW_CANDLES } from './scene-spec';
import type { Waypoint } from './waypoints';

/**
 * Metadata passed by the caller (Task 7's page component) to resolve
 * the session's dataset references and symbol. Pure — the caller,
 * not `buildSceneSpec`, resolves what the session's datasets are.
 */
export interface SessionMeta {
  /** Symbol (e.g., 'EURUSD'). */
  symbol: string;
  /**
   * AnchorTf references in the format used by requiredDatasets
   * (e.g., ['1m'] or ['eurusd-1m'] — the exact format is documented
   * by the caller's session mapping logic).
   */
  datasetRefs: string[];
  /** Base timeframe in seconds (defines the window size). */
  baseTfSeconds: number;
}

/**
 * Pure deterministic construction of a SceneSpec for one waypoint of a trade
 * (RFC-016 §4.2-4.3). Zero Angular/NgRx imports.
 *
 * Window = [waypoint.time - 60·baseTfSeconds, waypoint.time + 60·baseTfSeconds]
 * (60 candles before and after, per design spec §2.4).
 *
 * DrawingSet: from trade's DrawingSnapshot telemetry event, close-time preferred,
 * fallback to placement snapshot, else [].
 *
 * TelemetryMarkers: opaque shape (implementation detail), contains management
 * events + tMae/tMfe markers within the window.
 *
 * Candle-free (N-5, invariant 2): never embeds candle arrays or rasterized data.
 *
 * @param trade The closed trade being examined
 * @param waypoint The specific waypoint (moment) to capture
 * @param sessionMeta Session-level context (symbol, datasets, TF)
 * @param events All telemetry events for the session (optional, defaults to [])
 * @returns A deterministic, candle-free SceneSpec
 */
export function buildSceneSpec(
  trade: ClosedTrade,
  waypoint: Waypoint,
  sessionMeta: SessionMeta,
  events?: readonly TelemetryEvent[],
): SceneSpec {
  const windowSeconds = SCENE_WINDOW_CANDLES * sessionMeta.baseTfSeconds;

  // Window = [cursorTime - 60·baseTfSeconds, cursorTime + 60·baseTfSeconds]
  const window = {
    t0: waypoint.time - windowSeconds,
    t1: waypoint.time + windowSeconds,
  };

  // Order geometry from the trade
  const orderGeometry = {
    side: trade.side,
    entryPrice: trade.entryPrice,
    sl: trade.sl,
    tp: trade.tp,
    lots: trade.lots,
  };

  // Extract DrawingSnapshot events for this trade
  const allEvents = events || [];
  const drawingSet = extractDrawingSet(trade.id, allEvents);

  // Build telemetry markers (opaque, management events + tMae/tMfe in window)
  const telemetryMarkers = buildTelemetryMarkers(
    trade,
    allEvents,
    window,
  );

  return {
    symbol: sessionMeta.symbol,
    datasetRefs: sessionMeta.datasetRefs,
    window,
    cursorTime: waypoint.time,
    orderGeometry,
    drawingSet,
    telemetryMarkers,
  };
}

/**
 * Extract the drawing set for a trade, preferring close-time snapshot
 * over placement-time snapshot.
 */
function extractDrawingSet(
  tradeId: string,
  events: readonly TelemetryEvent[],
): DrawingSnapshotEntry[] {
  // Look for DrawingSnapshot events for this trade
  const drawingEvents = events.filter(
    (e) =>
      e.kind === 'DrawingSnapshot' &&
      ((e.payload as { eventRef?: string }).eventRef === tradeId),
  );

  if (drawingEvents.length === 0) {
    return [];
  }

  // Prefer the close-time (latest) snapshot
  const latest = drawingEvents.sort((a, b) => (b.marketTime ?? 0) - (a.marketTime ?? 0))[0];
  return (((latest.payload as { drawings?: DrawingSnapshotEntry[] }).drawings) ?? []);
}

/**
 * Build opaque telemetry markers structure (management events + tMae/tMfe
 * in window, RFC-016 §4 "no seek vocabulary"). Shape is left to the
 * implementation; the read-side consumes this for event timeline construction.
 */
function buildTelemetryMarkers(
  trade: ClosedTrade,
  events: readonly TelemetryEvent[],
  window: { t0: number; t1: number },
): Record<string, unknown> {
  const markers: Record<string, Record<string, unknown>[]> = {
    management: [],
    extrema: [],
  };

  // Management events (OrderModified, PositionModified) for this trade within window
  const managementEvents = events.filter(
    (e) =>
      (e.kind === 'OrderModified' || e.kind === 'PositionModified') &&
      e.marketTime !== null &&
      e.marketTime >= window.t0 &&
      e.marketTime <= window.t1 &&
      (((e.payload as { orderRef?: string }).orderRef === trade.id) ||
        ((e.payload as { positionRef?: string }).positionRef === trade.id)),
  );

  for (const event of managementEvents) {
    markers['management'].push({
      kind: event.kind,
      time: event.marketTime,
      payload: event.payload,
    });
  }

  // MAE/MFE extrema markers
  if (
    trade.tMae !== undefined &&
    trade.tMae >= window.t0 &&
    trade.tMae <= window.t1
  ) {
    markers['extrema'].push({
      kind: 'MAE',
      time: trade.tMae,
      value: trade.mae,
    });
  }

  if (
    trade.tMfe !== undefined &&
    trade.tMfe >= window.t0 &&
    trade.tMfe <= window.t1
  ) {
    markers['extrema'].push({
      kind: 'MFE',
      time: trade.tMfe,
      value: trade.mfe,
    });
  }

  return markers;
}
