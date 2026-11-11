import type { ClosedTrade } from '../../state/trading/trading.models';
import type { TelemetryEvent } from '../../state/telemetry/telemetry.models';

/**
 * Pure SL/TP reconstruction for a closed trade (RFC-016 MEDIUM-4). Zero
 * Angular/NgRx imports.
 *
 * `ClosedTrade.sl`/`tp` are the values AT CLOSE (the fill engine copies the
 * live position's `sl`/`tp`), so for a managed trade they are NOT the
 * geometry the trade was entered with. The truth lives in the telemetry:
 *
 * - `PositionModified` (`positionRef` === trade id, `field` 'sl' | 'tp') is a
 *   change to the LIVE position, with `from`/`to` and the replay time of the
 *   change. The initial value is the `from` of the earliest such event of that
 *   field; absent any, the trade never moved it and `trade.sl/tp` is it.
 * - `OrderModified` is an edit to the PENDING order before the fill. The
 *   position opened with that edit already applied, so it is not part of the
 *   live SL/TP history and is ignored here (a fill is not a modification).
 *
 * Replay is by `seq` (the append-only, monotonic envelope order), inclusive at
 * the requested time. Events with a null `marketTime` cannot be placed in time
 * and are ignored.
 */

type Field = 'sl' | 'tp';

interface Move {
  seq: number;
  time: number;
  from: number | null;
  to: number | null;
}

/** The trade's live-position moves of `field`, ordered by `seq`. */
function movesOf(trade: ClosedTrade, events: readonly TelemetryEvent[], field: Field): Move[] {
  const moves: Move[] = [];
  for (const e of events) {
    if (e.kind !== 'PositionModified' || e.marketTime === null) continue;
    const p = e.payload as {
      positionRef?: string;
      field?: string;
      from?: number | null;
      to?: number | null;
    };
    if (p.positionRef !== trade.id || p.field !== field) continue;
    moves.push({ seq: e.seq, time: e.marketTime, from: p.from ?? null, to: p.to ?? null });
  }
  return moves.sort((a, b) => a.seq - b.seq);
}

function initialOf(
  trade: ClosedTrade,
  events: readonly TelemetryEvent[],
  field: Field,
): number | null {
  const moves = movesOf(trade, events, field);
  return moves.length > 0 ? moves[0].from : trade[field];
}

function valueAt(
  trade: ClosedTrade,
  events: readonly TelemetryEvent[],
  field: Field,
  time: number,
): number | null {
  const moves = movesOf(trade, events, field);
  let value = moves.length > 0 ? moves[0].from : trade[field];
  for (const m of moves) {
    if (m.time <= time) value = m.to;
  }
  return value;
}

/** The SL the trade was entered with (`from` of its earliest sl move, else `trade.sl`). */
export function initialStopLoss(trade: ClosedTrade, events: readonly TelemetryEvent[]): number {
  return initialOf(trade, events, 'sl') ?? trade.sl;
}

/** The TP the trade was entered with (`null` = none). */
export function initialTakeProfit(
  trade: ClosedTrade,
  events: readonly TelemetryEvent[],
): number | null {
  return initialOf(trade, events, 'tp');
}

/** The SL in force at replay time `time` (inclusive of moves made at `time`). */
export function stopLossAt(
  trade: ClosedTrade,
  events: readonly TelemetryEvent[],
  time: number,
): number {
  return valueAt(trade, events, 'sl', time) ?? trade.sl;
}

/** The TP in force at replay time `time` (`null` = none). */
export function takeProfitAt(
  trade: ClosedTrade,
  events: readonly TelemetryEvent[],
  time: number,
): number | null {
  return valueAt(trade, events, 'tp', time);
}

/**
 * `|entry - initial SL|` in price units, or `null` when there was no usable SL
 * at entry (0 / non-finite) or the distance is zero. `null` renders as "—":
 * never 0 and never a fabricated 1R.
 */
export function initialRiskDistance(
  trade: ClosedTrade,
  events: readonly TelemetryEvent[],
): number | null {
  const sl = initialStopLoss(trade, events);
  if (!Number.isFinite(sl) || sl <= 0) return null;
  const distance = Math.abs(trade.entryPrice - sl);
  return distance > 0 ? distance : null;
}

/**
 * An excursion (price units, `undefined` = legacy-absent) in R of the INITIAL
 * risk, or `null` when either side is unknown. A zero excursion is real.
 */
export function excursionInInitialR(
  trade: ClosedTrade,
  events: readonly TelemetryEvent[],
  excursion: number | undefined,
): number | null {
  if (excursion === undefined) return null;
  const risk = initialRiskDistance(trade, events);
  return risk === null ? null : excursion / risk;
}
