import { OrderSide } from './trading.models';

/**
 * SimulationDomain (RFC-014 Task 4a): the order-lifecycle law, extracted into
 * a pure named module the reducers invoke (PHILOSOPHY §2.7 — an invariant
 * needs a mechanical detector; these are it). No framework imports, no IO —
 * only types from `trading.models.ts` (I-10 engine-purity idiom, extended to
 * this sibling domain module).
 */

/**
 * I-14 Order Geometry Coherence (DOMAIN_MODEL.md): a buy trade requires
 * `sl < entryPrice` and (`tp === null` or `tp > entryPrice`); a sell trade is
 * symmetric (`sl > entryPrice`, `tp === null` or `tp < entryPrice`). Boundary
 * equality (`sl === entryPrice`, `tp === entryPrice`) is INVALID — both
 * comparisons are strict, coherent with the sided execution predicates in
 * `fill-engine.ts` (Task 2), where a zero-distance SL/TP has no meaningful
 * risk/reward and `lotsForRisk` already collapses it to 0 lots.
 */
export function validateOrderGeometry(
  side: OrderSide,
  entryPrice: number,
  sl: number,
  tp: number | null,
): boolean {
  if (side === 'buy') {
    return sl < entryPrice && (tp === null || tp > entryPrice);
  }
  return sl > entryPrice && (tp === null || tp < entryPrice);
}

/**
 * I-15 SL Non-Widening (Asymmetric Trade Management, DOMAIN_MODEL.md):
 * doctrine states that once placed, an SL may tighten (break-even
 * management) but never widen; TP stays freely adaptable (not this
 * function's business — callers apply TP changes unconditionally).
 *
 * "Tighten" moves the stop toward/past entry, reducing risk: for a long that
 * is an INCREASE (`nextSl >= currentSl`); for a short, symmetric, a DECREASE
 * (`nextSl <= currentSl`). Equality (no-op move) is accepted on both sides.
 */
export function validateSlModification(
  side: OrderSide,
  currentSl: number,
  nextSl: number,
): boolean {
  return side === 'buy' ? nextSl >= currentSl : nextSl <= currentSl;
}
