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

/**
 * Pip size. Evaluated IN THIS ORDER — the same order `contractSizeFor` below
 * uses — because the order is the contract, not an implementation detail.
 *
 *  1) metals (`XAU*`, `XAG*`) -> null   (measured in points even though they
 *     are 6 letters — a naive "6 letters ⇒ forex" rule would give them
 *     nonexistent pips)
 *  2) 6-letter pairs with JPY   -> 0.01  (applying 0.0001 here would inflate
 *     the pip distance ×100)
 *  3) other 6-letter pairs      -> 0.0001
 *  4) any other symbol          -> null  (indices and CFDs: points, not pips)
 */
export function pipSizeFor(symbol: string): number | null {
  const s = symbol.toUpperCase();
  if (s.startsWith('XAU') || s.startsWith('XAG')) return null;
  if (/^[A-Z]{6}$/.test(s)) return s.includes('JPY') ? 0.01 : 0.0001;
  return null;
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
export function riskForLots(
  lots: number,
  entry: number,
  sl: number,
  contractSize: number,
): number {
  return priceDistance(entry, sl) * lots * contractSize;
}

/**
 * Contract size (units per 1.0 lot) by symbol: gold = 100 oz, silver =
 * 5000 oz, 6-letter forex pairs = 100,000. Anything else (US30, NAS100 and
 * other index CFDs) uses the broker-typical 1 $/point per lot — the old 100
 * fallback inflated index P/L and risk a hundredfold.
 */
export function contractSizeFor(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s.startsWith('XAU')) return 100;
  if (s.startsWith('XAG')) return 5000;
  if (/^[A-Z]{6}$/.test(s)) return 100000;
  return 1;
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
