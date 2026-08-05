/**
 * Display copy for the supported instrument catalogue (RFC-020 / F21-3).
 *
 * The sizing kernel (`domain/sizing/asset-registry`) is deliberately math and
 * instrument data only — "no formatting, no user-facing copy, no view
 * helpers" (owner ruling Q1, `asset-registry.ts` module doc). The descriptive
 * name and the two-glyph monogram the asset selector shows are exactly that:
 * user-facing copy. They live here, on the view side, so the kernel keeps its
 * discipline and this module keeps its single job.
 *
 * Keys mirror `GENERATED_ASSETS`. A symbol with no entry (a legacy value
 * restored from persisted context, which the picker itself can no longer
 * produce) degrades to a name-less entry with a derived monogram — never a
 * fabricated instrument name, and never a fabricated calculation spec: the
 * numbers still come from `resolveAsset`, which declares its own provenance.
 */

/** Tint applied to the monogram; each maps to an existing theme token. */
export type AssetTone = 'accent' | 'warning' | 'down' | 'muted';

export interface AssetDisplay {
  /** Human name shown beside the ticker. Empty when the catalogue has none. */
  readonly name: string;
  /** One or two glyphs for the square identity mark. */
  readonly mark: string;
  readonly tone: AssetTone;
}

const CATALOG: Readonly<Record<string, AssetDisplay>> = {
  NAS100: { name: 'US Tech 100', mark: 'N', tone: 'accent' },
  SP500: { name: 'S&P 500', mark: 'S', tone: 'down' },
  US30: { name: 'US Wall Street 30', mark: '30', tone: 'accent' },
  XAUUSD: { name: 'Oro / Dólar', mark: 'Au', tone: 'warning' },
};

/**
 * Resolves display copy for a symbol. `symbol` is expected already trimmed and
 * uppercased (the callers pass `resolveAsset(...).symbol`). An unknown symbol
 * gets its first two characters as the mark and no descriptive name.
 */
export function assetDisplay(symbol: string): AssetDisplay {
  const known = Object.prototype.hasOwnProperty.call(CATALOG, symbol) ? CATALOG[symbol] : undefined;
  if (known) return known;
  return { name: '', mark: symbol.slice(0, 2) || '?', tone: 'muted' };
}
