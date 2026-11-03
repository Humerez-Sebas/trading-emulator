import type { ClosedTrade } from '../../state/trading/trading.models';
import type {
  TelemetryEvent,
  TimeElapsedBeforeOrderPayload,
} from '../../state/telemetry/telemetry.models';

/**
 * Fixed keyboard map (RFC-016 D16.D §2.3): Entry=1, Management=2, MAE=3, MFE=4, Exit=5.
 * Absent waypoints are simply missing from the array (keys don't recompact).
 */
export type WaypointSlot = 1 | 2 | 3 | 4 | 5;

/**
 * A single moment in a trade's journey reconstructed deterministically
 * (RFC-016 §4). One waypoint per slot; absent waypoints simply don't appear.
 *
 * Candle-free per invariant N-3 (CLAUDE.md invariant 2): no candle arrays,
 * no rasterized data. Pure function of trade, telemetry, and time.
 */
export interface Waypoint {
  /** Fixed slot: 1=Entry, 2=Management, 3=MAE, 4=MFE, 5=Exit. */
  slot: WaypointSlot;
  /** Market time of the moment (UTC seconds). */
  time: number;
  /** Domain-specific facts: shape varies by slot. */
  facts: object;
}

/**
 * Pure deterministic reconstruction of a trade's 5-node timeline (RFC-016 §4).
 * Zero Angular/NgRx imports; zero side effects.
 *
 * Semantics pinned by tests in waypoints.spec.ts:
 * - Entry (1): always present, openTime, entry price + risk distance + elapsed time
 * - Management (2): present iff >= 1 event in [openTime, closeTime], expandible sub-events
 * - MAE (3): present iff mae > 0 AND tMae defined, merges into Exit if within 1 baseTfSeconds
 * - MFE (4): present iff mfe > 0 AND tMfe defined, merges into Exit if within 1 baseTfSeconds
 * - Exit (5): always present, closeTime, profit + R + costs + merged MAE/MFE facts
 *
 * @param trade The closed trade record
 * @param events All telemetry events for the session (will be filtered to this trade's events)
 * @param baseTfSeconds Base timeframe in seconds (defines merge boundary)
 * @returns Array of waypoints, in slot order (1,2,3,4,5 where present)
 */
export function computeWaypoints(
  trade: ClosedTrade,
  events: readonly TelemetryEvent[],
  baseTfSeconds: number,
): Waypoint[] {
  const waypoints: Waypoint[] = [];

  // Entry (slot 1): always present
  waypoints.push(createEntryWaypoint(trade, events));

  // Collect management events (slot 2): OrderModified + PositionModified within [openTime, closeTime]
  const managementEvents = events.filter(
    (e) =>
      (e.kind === 'OrderModified' || e.kind === 'PositionModified') &&
      e.marketTime !== null &&
      e.marketTime >= trade.openTime &&
      e.marketTime <= trade.closeTime &&
      ((e.payload as { orderRef?: string }).orderRef === trade.id ||
        (e.payload as { positionRef?: string }).positionRef === trade.id),
  );

  if (managementEvents.length > 0) {
    // Sort by seq to ensure deterministic ordering
    managementEvents.sort((a, b) => a.seq - b.seq);
    waypoints.push(createManagementWaypoint(managementEvents));
  }

  // MAE (slot 3): present iff mae > 0 AND tMae defined, check merge condition
  let maeMerged = false;
  if (trade.mae !== undefined && trade.mae > 0 && trade.tMae !== undefined) {
    const shouldMerge = trade.tMae > trade.closeTime - baseTfSeconds;
    if (shouldMerge) {
      maeMerged = true;
    } else {
      waypoints.push(createMaeWaypoint(trade));
    }
  }

  // MFE (slot 4): present iff mfe > 0 AND tMfe defined, check merge condition
  let mfeMerged = false;
  if (trade.mfe !== undefined && trade.mfe > 0 && trade.tMfe !== undefined) {
    const shouldMerge = trade.tMfe > trade.closeTime - baseTfSeconds;
    if (shouldMerge) {
      mfeMerged = true;
    } else {
      waypoints.push(createMfeWaypoint(trade));
    }
  }

  // Exit (slot 5): always present, with merged MAE/MFE facts if applicable
  waypoints.push(createExitWaypoint(trade, maeMerged, mfeMerged));

  return waypoints;
}

function createEntryWaypoint(trade: ClosedTrade, events: readonly TelemetryEvent[]): Waypoint {
  const riskDistance = Math.abs(trade.entryPrice - trade.sl);

  // Look for TimeElapsedBeforeOrder event for this trade
  const elapsedEvent = events.find(
    (e) =>
      e.kind === 'TimeElapsedBeforeOrder' &&
      (e.payload as { orderRef?: string }).orderRef === trade.id,
  );

  const facts: Record<string, unknown> = {
    entryPrice: trade.entryPrice,
    riskDistancePrice: riskDistance,
    riskDistanceR: 1, // By definition, the initial risk distance is 1R
  };

  if (elapsedEvent) {
    facts['elapsedBeforeOrder'] = elapsedEvent.payload as TimeElapsedBeforeOrderPayload;
  }

  return {
    slot: 1,
    time: trade.openTime,
    facts,
  };
}

function createManagementWaypoint(events: TelemetryEvent[]): Waypoint {
  // Time is the first event's time
  const time = events[0].marketTime!;

  // Sub-events carry the full envelope
  const subEvents: Record<string, unknown>[] = events.map((e) => ({
    seq: e.seq,
    kind: e.kind,
    marketTime: e.marketTime,
    payload: e.payload,
  }));

  return {
    slot: 2,
    time,
    facts: {
      subEvents,
    },
  };
}

function createMaeWaypoint(trade: ClosedTrade): Waypoint {
  const excursionR = computeExcursionR(trade.mae!, trade.entryPrice, trade.sl);

  return {
    slot: 3,
    time: trade.tMae!,
    facts: {
      excursion: trade.mae,
      excursionR,
    },
  };
}

function createMfeWaypoint(trade: ClosedTrade): Waypoint {
  const excursionR = computeExcursionR(trade.mfe!, trade.entryPrice, trade.sl);

  return {
    slot: 4,
    time: trade.tMfe!,
    facts: {
      excursion: trade.mfe,
      excursionR,
    },
  };
}

function createExitWaypoint(trade: ClosedTrade, maeMerged: boolean, mfeMerged: boolean): Waypoint {
  const facts: Record<string, unknown> = {
    profit: trade.profit,
    rMultiple: trade.rMultiple,
    grossProfit: trade.grossProfit,
    commission: trade.commission,
  };

  // Add merged MAE facts if applicable
  if (maeMerged && trade.mae !== undefined && trade.mae > 0) {
    const excursionR = computeExcursionR(trade.mae, trade.entryPrice, trade.sl);
    facts['mergedMae'] = {
      excursion: trade.mae,
      excursionR,
      time: trade.tMae,
    };
  }

  // Add merged MFE facts if applicable
  if (mfeMerged && trade.mfe !== undefined && trade.mfe > 0) {
    const excursionR = computeExcursionR(trade.mfe, trade.entryPrice, trade.sl);
    facts['mergedMfe'] = {
      excursion: trade.mfe,
      excursionR,
      time: trade.tMfe,
    };
  }

  return {
    slot: 5,
    time: trade.closeTime,
    facts,
  };
}

/**
 * Compute excursion in R units (RFC-014 G4). Returns null when risk distance
 * is zero (degenerate SL == entry), matching excursion-stats.ts idiom.
 * A zero excursion is legitimate and is NOT treated as absent.
 */
function computeExcursionR(excursion: number, entryPrice: number, sl: number): number | null {
  const riskDistance = Math.abs(entryPrice - sl);
  if (riskDistance === 0) return null;
  return excursion / riskDistance;
}
