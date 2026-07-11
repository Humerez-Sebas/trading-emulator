import { TradeOutcome } from './trading.models';

/**
 * Reified domain facts (RFC-014 Task 4b): the engine's fill/close events,
 * turned into first-class, serializable records instead of only being
 * implicit in the resulting book/history diff. Consumed by the Task-5
 * telemetry observer (a `dispatch:false` effect reading `TradingState.
 * lastFacts` via `concatLatestFrom`, since effects run after reducers).
 *
 * Pure data — no behavior, no framework imports (I-10 idiom extended to
 * this sibling module, matching `simulation-domain.ts`).
 */

/**
 * An order (limit/stop) filled and became an open position this candle.
 * `tradeId` is the id shared across the order → position → closed-trade
 * lifecycle (they all reuse the same `PendingOrder.id`/`Position.id`).
 */
export interface OrderFilled {
  kind: 'OrderFilled';
  tradeId: string;
  /**
   * OPTIONAL at emission: the pure engine (`fill-engine.ts`) is series-index-
   * agnostic (I-10 — it never reads a base series, only the one candle/
   * subCandles it's given), so it cannot compute an index into the base
   * series. Left unset here; resolved downstream by whoever holds the base
   * series (the Task-5 telemetry observer), by locating `marketTime` in it.
   */
  fillBaseIndex?: number;
  /** Actual entry price applied, including slippage for stop entries (RFC-014 §2). */
  executedPrice: number;
  /** Candle time (UTC seconds) the fill occurred on. */
  marketTime: number;
}

/**
 * A position closed this candle — via engine SL/TP exit, a manual close, or
 * session end. `outcome`/`ambiguous`/`executedPrice` mirror the same-named
 * fields the engine already computes for the resulting `ClosedTrade`.
 */
export interface PositionClosed {
  kind: 'PositionClosed';
  tradeId: string;
  outcome: TradeOutcome;
  /**
   * SL and TP were both inside the same candle and no lower-TF series was
   * available to disambiguate: resolved pessimistically (SL first). Always
   * `false` for manual/session-end closes (nothing to disambiguate).
   */
  ambiguous: boolean;
  /** Actual exit price applied, including slippage for SL exits (RFC-014 §2). */
  executedPrice: number;
  /** Candle/close time (UTC seconds) the position closed on. */
  marketTime: number;
}

export type DomainFact = OrderFilled | PositionClosed;
