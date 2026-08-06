/** Formatting helpers. No sizing math lives here — display only. */

export const DASH = '—';

/** `$X.XX`, or the honest dash when the input isn't a finite number (e.g. a cleared field). */
export function formatMoney(n: number): string {
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : DASH;
}

/** `X.XX`. The kernel (`lotsForRisk`/`lotsForRiskDistance`) never returns NaN — always >= 0. */
export function formatLots(n: number): string {
  return Number.isFinite(n) ? n.toFixed(2) : DASH;
}
