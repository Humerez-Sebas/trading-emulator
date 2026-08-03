/**
 * Asset registry (RFC-020, D.20.4/§4): the real source of truth for
 * per-symbol instrument data, generated from MT5's own `symbol_info()`
 * (`pipeline/export_symbols.py` -> `asset-registry.generated.ts`).
 *
 * `resolveAsset(symbol)` resolves generated -> manual -> heuristic (RFC-020
 * §4.2) and ALWAYS sets `source` so provenance is declarable at the point of
 * use (the Ficha del activo, Task D-4) rather than buried in a file header.
 *
 * INERT: nothing in the app imports `resolveAsset` yet, and
 * `contractSizeFor`/`pipSizeFor` in `position-sizing.ts` are untouched. The
 * cutover is Task C-1, a separate, individually-audited task.
 *
 * Kernel size discipline (owner ruling Q1): math and instrument data only —
 * no formatting, no user-facing copy, no view helpers.
 */

import {
  GENERATED_ASSETS,
  GENERATED_SOURCE,
  type GeneratedAssetRecord,
} from './asset-registry.generated';

/**
 * Where a resolved spec's numbers came from — always set, never omitted.
 * One of `'manual'`, `'heuristic'`, or `GENERATED_SOURCE`
 * (`'mt5:<broker>@<date>'`). Deliberately typed as plain `string`, not a
 * union pinned to today's literal `GENERATED_SOURCE` value — that value
 * changes every time the registry regenerates, and a literal-type union
 * would force a type edit on every regen for zero safety benefit.
 */
export type AssetSource = string;

export interface AssetSpec {
  readonly symbol: string;
  /** Units per 1.0 lot. Always known (heuristic guarantees a number). */
  readonly contractSize: number;
  /**
   * Pip size in price units, or `null` for "measured in points" (indices,
   * metals, and anything outside the 6-letter FX shape). Computed the SAME
   * way regardless of `source` — pip-vs-point is a naming convention, not an
   * MT5 field, so it cannot come from the generated registry (D.20.3).
   */
  readonly pipSize: number | null;
  /** `null` when the source is `'heuristic'` — a bare name gives no MT5 data
   * beyond contract size / pip convention. */
  readonly tickSize: number | null;
  readonly volumeStep: number | null;
  readonly volumeMin: number | null;
  readonly digits: number | null;
  readonly currency: string | null;
  readonly source: AssetSource;
}

/**
 * Manual overrides (RFC-020 §4.2): outrank the heuristic but never the
 * generated MT5 registry. Empty today — no symbol needs a hand-set spec yet.
 * Add an entry only when a real symbol needs a value the registry/heuristic
 * get wrong (e.g. a broker-specific quirk not covered by `HARVEST_SYMBOLS`).
 */
const MANUAL_ASSETS: Readonly<Record<string, GeneratedAssetRecord>> = {};

/**
 * Reproduces `contractSizeFor` from `position-sizing.ts` EXACTLY, including
 * evaluation order (metals before the 6-letter regex) — see the module
 * comment above `resolveAsset` for why this is a deliberate duplication, not
 * an import.
 */
function heuristicContractSize(symbolUpper: string): number {
  if (symbolUpper.startsWith('XAU')) return 100;
  if (symbolUpper.startsWith('XAG')) return 5000;
  if (/^[A-Z]{6}$/.test(symbolUpper)) return 100000;
  return 1;
}

/**
 * Reproduces `pipSizeFor` from `position-sizing.ts` EXACTLY, including
 * evaluation order (metals before the 6-letter regex — a naive "6 letters ⇒
 * forex" rule would give XAUUSD/XAGUSD nonexistent pips).
 */
function heuristicPipSize(symbolUpper: string): number | null {
  if (symbolUpper.startsWith('XAU') || symbolUpper.startsWith('XAG')) return null;
  if (/^[A-Z]{6}$/.test(symbolUpper)) return symbolUpper.includes('JPY') ? 0.01 : 0.0001;
  return null;
}

/**
 * Resolves a symbol to its full `AssetSpec`: generated MT5 registry first,
 * then a manual override, then the name-shape heuristic. `pipSize` is always
 * computed independently of the other three (see `AssetSpec.pipSize`).
 *
 * NOTE on the duplication above: `heuristicContractSize`/`heuristicPipSize`
 * re-implement `contractSizeFor`/`pipSizeFor` from `position-sizing.ts`
 * rather than importing them. This is deliberate: Task C-1 (RFC-020) rewires
 * `position-sizing.ts` to call `resolveAsset` FROM this file. Importing
 * `position-sizing.ts` here would create a circular dependency the moment
 * C-1 lands. If the heuristic ever changes, both copies must change
 * together — the equivalence spec in `asset-registry.spec.ts` (which DOES
 * import `position-sizing.ts`, safe in a spec file with no runtime edge) is
 * the tripwire that catches drift.
 */
export function resolveAsset(symbol: string): AssetSpec {
  const upper = symbol.toUpperCase();
  const pipSize = heuristicPipSize(upper);

  const generated = GENERATED_ASSETS[upper];
  if (generated) {
    return {
      symbol: upper,
      pipSize,
      source: GENERATED_SOURCE,
      ...generated,
    };
  }

  const manual = MANUAL_ASSETS[upper];
  if (manual) {
    return {
      symbol: upper,
      pipSize,
      source: 'manual',
      ...manual,
    };
  }

  return {
    symbol: upper,
    pipSize,
    contractSize: heuristicContractSize(upper),
    tickSize: null,
    volumeStep: null,
    volumeMin: null,
    digits: null,
    currency: null,
    source: 'heuristic',
  };
}
