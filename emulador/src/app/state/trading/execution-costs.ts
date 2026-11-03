/**
 * Per-trade execution costs (RFC-014 §2). Spread and slippage are expressed
 * in POINTS — the broker convention, portable across an instrument's price
 * scale — while commission is a flat per-lot round-turn fee in account
 * currency. `pointSize` is the session's resolved minimum price increment
 * (RFC-014 D14.D): resolving it HERE, once, at session/context-configuration
 * time (mirrors `contractSizeFor`'s "resolve once from the symbol, thread
 * explicitly" idiom in `trading.models.ts`) keeps the fill engine pure —
 * `processCandle`/`closeTrade` never read config, derive a point size from
 * candle data, or do IO (I-10); they just multiply through `pointsToPrice`.
 */
export interface ExecutionCosts {
  /** Bid/Ask spread, in points (Ask = Bid + spreadPoints·pointSize — D14.D). */
  spreadPoints: number;
  /** Flat commission per lot, charged once per closed trade (round-turn). */
  commissionPerLot: number;
  /** Deterministic adverse slippage on stop-type executions, in points. */
  slippagePoints: number;
  /** Session's resolved minimum price increment (see class doc above). */
  pointSize: number;
}

/**
 * No costs: every sided predicate/price the engine derives from this
 * degenerates to today's behavior exactly (V-1 anchor). `pointSize` is a
 * placeholder (1) — irrelevant since it only ever multiplies a zero.
 */
export const ZERO_COSTS: ExecutionCosts = {
  spreadPoints: 0,
  commissionPerLot: 0,
  slippagePoints: 0,
  pointSize: 1,
};

type AssetClass = 'Forex' | 'Índices' | 'Metales' | 'Cripto';

/**
 * Default cost presets by asset class. These are STARTING DEFAULTS, not a
 * live broker feed — real spreads/commissions vary by broker and liquidity.
 * Each preset's `pointSize` is a class-representative value; `costPresetFor`
 * refines it per exact symbol (e.g. XAU vs XAG within Metales) via
 * `pointSizeFor`. UI to edit these per session is Task 6 (out of scope here).
 */
export const COST_PRESETS: Record<AssetClass, ExecutionCosts> = {
  // 5-digit ECN-style forex: ~1 pip spread (10 points of a 0.00001 pointSize),
  // $7/lot round-turn commission — a common ECN/raw-spread broker shape.
  Forex: { spreadPoints: 10, commissionPerLot: 7, slippagePoints: 2, pointSize: 0.00001 },
  // Index CFDs (US30/NAS100/SP500…): spread-only is the broker norm, no commission.
  Índices: { spreadPoints: 2, commissionPerLot: 0, slippagePoints: 1, pointSize: 1 },
  // Metals: wider spread, no commission (gold-representative pointSize; see pointSizeFor).
  Metales: { spreadPoints: 30, commissionPerLot: 0, slippagePoints: 5, pointSize: 0.01 },
  // Crypto CFDs: high volatility → wide spread and slippage, no commission.
  Cripto: { spreadPoints: 50, commissionPerLot: 0, slippagePoints: 20, pointSize: 1 },
};

/**
 * Session-level point-size resolution (D14.D), mirroring `contractSizeFor`'s
 * symbol-prefix classification — a static default from the symbol string,
 * NOT derived from candle data (that idiom, `derivePointSize`, needs a loaded
 * series and lives in the selectors layer for display purposes only).
 *
 * Resolves asset class via `assetClassOf` to ensure crypto symbols (e.g.
 * BTCUSD, ETHUSD) correctly resolve to pointSize: 1 instead of being
 * misclassified by the 6-letter forex regex.
 */
function pointSizeFor(symbol: string): number {
  const s = symbol.toUpperCase();
  // Metals: XAU/XAG have fine-grained point sizes (differ within the class)
  if (s.startsWith('XAU')) return 0.01;
  if (s.startsWith('XAG')) return 0.001;

  // For all other assets, classify by asset class and return its point size
  const cls = assetClassOf(symbol);
  if (cls === 'Forex') return 0.00001;
  // Cripto, Índices, and unrecognized all use 1 (whole-point convention)
  return 1;
}

/** Symbol → asset class, mirroring `contractSizeFor`'s prefix/shape checks. Unrecognized → null. */
function assetClassOf(symbol: string): AssetClass | null {
  const s = symbol.toUpperCase();
  if (!s) return null;
  if (s.startsWith('XAU') || s.startsWith('XAG')) return 'Metales';
  if (/^(BTC|ETH|XRP|LTC|BNB|SOL|ADA|DOGE|DOT|AVAX)/.test(s)) return 'Cripto';
  if (/^[A-Z]{6}$/.test(s)) return 'Forex';
  if (/^[A-Z]{2,5}\d{2,4}$/.test(s)) return 'Índices'; // US30, NAS100, SP500, GER40…
  return null;
}

/**
 * Resolves a session's default execution costs from its symbol, mirroring
 * `contractSizeFor`. A symbol this resolver can't classify gets
 * {@link ZERO_COSTS} — no assumed spread/commission for an unknown
 * instrument — rather than guessing a class.
 */
export function costPresetFor(symbol: string): ExecutionCosts {
  const cls = assetClassOf(symbol);
  if (!cls) return ZERO_COSTS;
  return { ...COST_PRESETS[cls], pointSize: pointSizeFor(symbol) };
}

/**
 * Converts a points quantity (spread/slippage) to price units. The ONE place
 * this multiplication happens (D14.D) — every caller (the Ask derivation, the
 * slippage adjustment) goes through this instead of inlining `points * size`.
 */
export function pointsToPrice(points: number, pointSize: number): number {
  return points * pointSize;
}

/**
 * A partial user override of the three editable cost fields (new-session
 * dialog, RFC-014 G1). `null` on a field means "use the resolved preset's
 * value for it" — `pointSize` is intentionally absent: it is never
 * user-editable (D14.D), always resolved from the symbol.
 */
export interface CostOverride {
  spreadPoints: number | null;
  commissionPerLot: number | null;
  slippagePoints: number | null;
}

/**
 * Merges a partial override on top of a resolved preset (RFC-014 G1: "el
 * diálogo de nueva sesión muestra el preset resuelto y permite modificarlo").
 * Each editable field uses the override when it is a finite number >= 0
 * (sensible constraint — an invalid entry silently falls back to the preset
 * rather than persisting garbage); `pointSize` always comes from the preset.
 */
export function effectiveCosts(preset: ExecutionCosts, override: CostOverride): ExecutionCosts {
  const pick = (value: number | null, fallback: number): number =>
    value !== null && Number.isFinite(value) && value >= 0 ? value : fallback;
  return {
    spreadPoints: pick(override.spreadPoints, preset.spreadPoints),
    commissionPerLot: pick(override.commissionPerLot, preset.commissionPerLot),
    slippagePoints: pick(override.slippagePoints, preset.slippagePoints),
    pointSize: preset.pointSize,
  };
}
