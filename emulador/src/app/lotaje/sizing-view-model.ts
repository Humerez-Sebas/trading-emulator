/**
 * Pure state + derivation for the Lotaje view (RFC-020 Task D-1). No DOM, no
 * Angular — `deriveLots`/`switchMethod` are plain functions of a plain
 * object, testable without a document. `lotsForRisk`/`lotsForRiskDistance`
 * (via `domain/sizing/position-sizing`) are the ONLY source of a lot figure
 * anywhere in this module — no second sizing formula, no
 * `Math.max(0.01, …)` reimplemented here.
 *
 * Product design authority: docs/superpowers/specs/2026-08-02-position-sizer-product-design.md
 * §4.1 (method B default, conversion never resets), §4.2 (display units
 * derive from the symbol), §7.4 (validation rules), §8.2/§8.3 (empty states,
 * verbatim messages).
 */
import {
  lotsForRisk,
  lotsForRiskDistance,
  priceDistance,
  riskForLots,
  riskUsdFor,
} from '../domain/sizing/position-sizing';
import { resolveAsset, type AssetSource } from '../domain/sizing/asset-registry';
import { parseDecimal } from './parse-decimal';

export type Method = 'distance' | 'prices';

export interface LotajeState {
  readonly balanceText: string;
  readonly riskPctText: string;
  readonly symbolText: string;
  readonly method: Method;
  /** Method B — the stop in the symbol's displayed unit (`pips` or `pts`). */
  readonly distanceText: string;
  /** Method A — memorized even while in Method B (P4: convert, never reset). */
  readonly entryText: string;
  /** Method A only. Recomputed (never hand-edited) when converting FROM distance. */
  readonly slText: string;
}

/** P2 — cold start: 10 000 / 1% / no symbol, Method B (distance), stop blank. */
export const INITIAL_STATE: LotajeState = {
  balanceText: '10000',
  riskPctText: '1',
  symbolText: '',
  method: 'distance',
  distanceText: '',
  entryText: '',
  slText: '',
};

export const MSG_SL_EQUALS_ENTRY = 'El SL coincide con la entrada.';
export const MSG_NON_POSITIVE = 'La cuenta, el riesgo y la entrada deben ser valores positivos.';

export interface LotajeDerived {
  readonly balance: number;
  readonly riskPct: number;
  /** Trimmed, NOT uppercased — `resolveAsset` uppercases internally. This field itself stays raw; the
   *  chip does NOT echo it verbatim (since D-4 the chip renders `resolveAsset(trimmed).symbol`, the
   *  canonical uppercase form — see `lotaje-view.ts`). */
  readonly symbol: string;
  readonly contractSize: number;
  readonly pipSize: number | null;
  readonly unitLabel: 'pts' | 'pips';
  readonly symbolSource: AssetSource;
  /** True only when there IS a symbol and the registry fell back to the name-shape heuristic for it. */
  readonly isHeuristic: boolean;
  /** Stop distance normalized to price units for the sizing kernel. */
  readonly distance: number;
  readonly requestedRiskUsd: number;
  /** The only lot figure in this module — always from the kernel, never NaN (0 minimum). */
  readonly lots: number;
  readonly actualRiskUsd: number;
  readonly invalidReason: string | null;
  readonly minLotWarning: string | null;
}

/** Converts between the displayed stop unit and the kernel's price units. */
function convertDistance(
  distance: number,
  pipSize: number | null,
  direction: 'display-to-price' | 'price-to-display',
): number {
  const priceUnitsPerDisplayUnit = pipSize ?? 1;
  return direction === 'display-to-price'
    ? distance * priceUnitsPerDisplayUnit
    : distance / priceUnitsPerDisplayUnit;
}

/**
 * Computes every derived value from raw state. Mirrors the v1 page's
 * `computed()` graph (invalidReason / minLotWarning semantics are UNCHANGED
 * for Method A — see the two doc comments below); Method B is the same
 * doctrine applied to a single distance value instead of an entry/SL pair.
 */
export function deriveLots(state: LotajeState): LotajeDerived {
  const balance = parseDecimal(state.balanceText);
  const riskPct = parseDecimal(state.riskPctText);
  const symbol = state.symbolText.trim();

  // One resolveAsset() call for all three registry facts (contractSize,
  // pipSize, provenance) — contractSizeFor()/pipSizeFor() are one-line
  // delegations to the same function, so calling them separately here would
  // just repeat the same lookup twice for no benefit.
  const resolved = resolveAsset(symbol);
  const contractSize = resolved.contractSize;
  const pipSize = resolved.pipSize;
  const unitLabel: 'pts' | 'pips' = pipSize !== null ? 'pips' : 'pts';
  const isHeuristic = symbol !== '' && resolved.source === 'heuristic';

  const entry = parseDecimal(state.entryText);
  const sl = parseDecimal(state.slText);
  const distance =
    state.method === 'distance'
      ? convertDistance(parseDecimal(state.distanceText), pipSize, 'display-to-price')
      : priceDistance(entry, sl);

  const requestedRiskUsd = riskUsdFor(balance, riskPct);

  let lots: number;
  if (state.method === 'distance') {
    // `lotsForRiskDistance` does NOT itself guard `balance>0`/`riskPct>0` —
    // only `lotsForRisk` does (see position-sizing.ts: a negative balance
    // times a negative risk % yields a POSITIVE riskUsd, which would turn a
    // should-be-0 into a real lot figure). Method A calls the guarded
    // wrapper directly; Method B calls the lower-level primitive because it
    // has a distance already, not an entry/SL pair, so the SAME guard is
    // reproduced here rather than silently lost.
    lots =
      balance > 0 && riskPct > 0
        ? lotsForRiskDistance(requestedRiskUsd, distance, contractSize)
        : 0;
  } else {
    lots = lotsForRisk(balance, riskPct, entry, sl, contractSize);
  }

  // Real risk for the CHOSEN lots, purely for the min-lot/rounding warning's
  // materiality check — never fed back into `lots`. `riskForLots` takes an
  // entry/SL pair and computes `priceDistance(entry, sl) * lots *
  // contractSize` internally; feeding it `(distance, 0)` reuses that exact
  // kernel arithmetic for a value we already have as a magnitude, without
  // inventing a second formula in this module.
  const actualRiskUsd = riskForLots(lots, distance, 0, contractSize);

  const positiveQuestion =
    state.method === 'distance' ? distance > 0 : entry > 0 && Number.isFinite(sl);

  /**
   * Honest states (product design §8.2/§8.3, messages verbatim). Checked in
   * the same order as `lotsForRisk`'s own evaluation (distance first) so the
   * two mirror each other. For Method A this is byte-identical to the v1
   * page's `invalidReason`; for Method B, `entry > 0` becomes `distance > 0`
   * (the "the question" field itself must be a sensible positive magnitude)
   * and there is no separate `Number.isFinite(sl)` clause because Method B
   * has no SL field — the equivalent guard is already covered by requiring
   * `distance` itself to be finite-and-positive.
   */
  let invalidReason: string | null = null;
  if (distance === 0) {
    invalidReason = MSG_SL_EQUALS_ENTRY;
  } else if (!(balance > 0) || !(riskPct > 0) || !positiveQuestion) {
    invalidReason = MSG_NON_POSITIVE;
  }

  /**
   * Honest state 3 (min-lot floor OR plain 0.01 rounding) — a WARNING
   * alongside a real lot figure, never a replacement. Only meaningful when
   * `invalidReason === null`. Material difference: requested risk > 0 and the
   * real risk differs from it by more than 1%. Ported verbatim from the v1
   * page's `minLotWarning`.
   */
  let minLotWarning: string | null = null;
  if (invalidReason === null && requestedRiskUsd > 0) {
    const diff = Math.abs(actualRiskUsd - requestedRiskUsd) / requestedRiskUsd;
    if (diff > 0.01) {
      const atFloor = lots === 0.01 && actualRiskUsd > requestedRiskUsd;
      const cause = atFloor ? 'El mínimo de 0.01 lotes' : 'El redondeo al paso de 0.01 lotes';
      const direction = actualRiskUsd > requestedRiskUsd ? 'por encima de' : 'por debajo de';
      minLotWarning = `${cause} arriesga $${actualRiskUsd.toFixed(2)}, ${direction} los $${requestedRiskUsd.toFixed(2)} solicitados.`;
    }
  }

  return {
    balance,
    riskPct,
    symbol,
    contractSize,
    pipSize,
    unitLabel,
    symbolSource: resolved.source,
    isHeuristic,
    distance,
    requestedRiskUsd,
    lots,
    actualRiskUsd,
    invalidReason,
    minLotWarning,
  };
}

/** Kills float noise from a subtraction before it round-trips into a text field (e.g. 1.1 - 0.006). */
function roundForDisplay(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}

/**
 * P4 — method state, frozen: switching method CONVERTS, never resets.
 *
 * distance -> prices: the memorized `entryText` is kept as-is; the displayed
 * distance is converted to price units and `slText` is RECOMPUTED as `entry -
 * distance` (a fixed, documented convention — SL below entry — chosen because
 * direction is mathematically irrelevant to the sizing result (product design
 * §4.3) and it is the only direction every worked example in this codebase
 * actually uses). If entry or distance is not a valid finite number (e.g. the
 * very first switch, cold start, both blank), `slText` is left UNCHANGED rather
 * than clobbered — nothing typed is ever lost, even when there is nothing yet
 * to derive from.
 *
 * prices -> distance: the current |entry - SL| is converted from price units
 * to the symbol's displayed unit before it becomes `distanceText`. If entry or
 * SL is not a valid finite number, `distanceText` is left UNCHANGED (the same
 * "never lose what's there" rule).
 */
export function switchMethod(state: LotajeState): LotajeState {
  const pipSize = resolveAsset(state.symbolText.trim()).pipSize;
  if (state.method === 'distance') {
    const entry = parseDecimal(state.entryText);
    const distance = convertDistance(parseDecimal(state.distanceText), pipSize, 'display-to-price');
    const canDerive = Number.isFinite(entry) && Number.isFinite(distance);
    return {
      ...state,
      method: 'prices',
      slText: canDerive ? String(roundForDisplay(entry - distance)) : state.slText,
    };
  }
  const entry = parseDecimal(state.entryText);
  const sl = parseDecimal(state.slText);
  const distance = convertDistance(priceDistance(entry, sl), pipSize, 'price-to-display');
  return {
    ...state,
    method: 'distance',
    distanceText: Number.isFinite(distance)
      ? String(roundForDisplay(distance))
      : state.distanceText,
  };
}
