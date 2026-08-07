/**
 * Sizing kernel (CFD/Forex): pure, framework-free math shared by the emulator
 * and the (future) Lotaje companion tool (RFC-020, D.20.1). Nothing here
 * imports Angular, NgRx, or anything under `state/`/`components/` — per the
 * Dependency Rule, dependencies point toward the domain, never the other way.
 *
 * Kernel size discipline (owner ruling Q1): math and instrument data only —
 * no formatting, no user-facing copy, no view helpers.
 *
 * Out of scope (v1): Futures mode — blocked until the owner's broker
 * multipliers and tick sizes are available.
 */

import { resolveAsset } from './asset-registry';

/**
 * Pip size. Backed by the asset registry (RFC-020 Task C-1, D.20.4):
 * `resolveAsset` computes `pipSize` the same way for every symbol regardless
 * of provenance (curated or heuristic) — see `AssetSpec.pipSize`. Evaluation
 * order (metals before the 6-letter regex, JPY before the flat 0.0001) lives
 * in `resolveAsset`'s heuristic branch now; this function's signature is
 * unchanged.
 */
export function pipSizeFor(symbol: string): number | null {
  return resolveAsset(symbol).pipSize;
}

/** Entry↔SL distance in price units. Always >= 0. */
export function priceDistance(entry: number, sl: number): number {
  return Math.abs(entry - sl);
}

/** Risk in account currency for a given percentage. */
export function riskUsdFor(balance: number, riskPct: number): number {
  return (balance * riskPct) / 100;
}

/** Inverse of lotsForRisk: real risk in currency when trading `lots`. */
export function riskForLots(lots: number, entry: number, sl: number, contractSize: number): number {
  return priceDistance(entry, sl) * lots * contractSize;
}

/**
 * Contract size (units per 1.0 lot) by symbol. Backed by the asset registry
 * (RFC-020 Task C-1, D.20.4): `resolveAsset` resolves generated MT5 data ->
 * manual override -> name-shape heuristic (gold = 100 oz, silver = 5000 oz,
 * 6-letter forex pairs = 100,000, anything else = 1 $/point per lot). The
 * heuristic branch reproduces this function's old body exactly, evaluation
 * order included. Signature unchanged.
 */
export function contractSizeFor(symbol: string): number {
  return resolveAsset(symbol).contractSize;
}

/**
 * Lot size so that a loss of `distanceInPrice` per unit costs exactly
 * `riskUsd`. Rounded to the nearest 0.01 lot (broker step), minimum 0.01.
 *
 * This is the primitive `lotsForRisk` wraps (D.20.1). It trusts its inputs —
 * callers that derive `riskUsd` from a balance/riskPct pair must validate
 * those upstream themselves. See `lotsForRisk`, which keeps its own
 * `balance > 0` / `riskPct > 0` guards rather than delegating to a
 * `riskUsd > 0` check here: a negative balance times a negative risk %
 * also yields a positive `riskUsd`.
 */
export function lotsForRiskDistance(
  riskUsd: number,
  distanceInPrice: number,
  contractSize: number,
): number {
  if (!(distanceInPrice > 0) || !(riskUsd > 0)) return 0;
  const lossPerLot = distanceInPrice * contractSize;
  const lots = riskUsd / lossPerLot;
  return Math.max(0.01, Math.round(lots * 100) / 100);
}

/**
 * Lot size so that hitting the SL loses `riskPct` % of the balance.
 * Rounded to the nearest 0.01 lot (broker step), minimum 0.01.
 *
 * Wraps `lotsForRiskDistance`, but keeps its own `balance > 0` /
 * `riskPct > 0` guards: collapsing them into a single `riskUsd > 0` check on
 * the primitive is NOT equivalent — a negative balance with a negative risk
 * % produces a positive `riskUsd`, which would turn today's `0` into a real
 * lot figure (a money bug).
 */
export function lotsForRisk(
  balance: number,
  riskPct: number,
  entryPrice: number,
  sl: number,
  contractSize: number,
): number {
  if (!(balance > 0) || !(riskPct > 0)) return 0;
  const distance = priceDistance(entryPrice, sl);
  const riskUsd = riskUsdFor(balance, riskPct);
  return lotsForRiskDistance(riskUsd, distance, contractSize);
}
