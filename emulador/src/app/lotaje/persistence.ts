/**
 * RFC-020 Task C-2. Framework-free persistence for Lotaje CONTEXT only —
 * the four fields the trader would otherwise have to retype after a page
 * refresh: raw balance/risk-percent/symbol text and the active method.
 * Everything else the view holds (the typed distance/entry/SL, derived
 * lots, asset metadata, Ficha/disclosure state, copy feedback, focus) is
 * deliberately NEVER read or written here (RFC-020 §1.2 D.20.2).
 *
 * Storage access always goes through the caller-supplied `Window`, never the
 * ambient `window`/`localStorage` — the mounted view may later run inside a
 * second realm (Task D-6), and this module has no opinion on which realm
 * that is. Every property access, `getItem`, `setItem`, `JSON.parse`, and
 * `JSON.stringify` call is wrapped in `try/catch`: a read/parse failure
 * degrades to fresh P2 defaults, a write failure is silently ignored
 * (D.20.2 §c, mirroring the `settings.reducer.ts` / `draggable.directive.ts`
 * pattern) and never rolls back the already-transitioned in-memory view.
 *
 * `v` is a reserved schema-version field for a future migration
 * (PHILOSOPHY §2.6) — written once as the literal `1`, never read, branched
 * on, compared, or destructured. dev-log §6.3 distinguishes this reservation
 * (which stands) from the `storage`-event cross-surface sync, which RFC-020
 * Q2 withdrew entirely: this module owns no listener and no synchronization
 * state of any kind.
 */
import { INITIAL_STATE, type Method } from './sizing-view-model';

export const LOTAJE_STORAGE_KEY = 'emulador.calculadora';

export interface LotajeContext {
  readonly balanceText: string;
  readonly riskPctText: string;
  readonly symbolText: string;
  readonly method: Method;
}

function freshContext(): LotajeContext {
  return {
    balanceText: INITIAL_STATE.balanceText,
    riskPctText: INITIAL_STATE.riskPctText,
    symbolText: INITIAL_STATE.symbolText,
    method: INITIAL_STATE.method,
  };
}

/**
 * Reads and per-field-guards the stored context. A missing key, malformed
 * JSON, a non-object/array/primitive root, or any read failure all degrade
 * to fresh P2 defaults. The parsed root is never spread and never indexed by
 * anything other than the four named context fields, so an unexpected
 * property on it (including a disguised `v`) is never touched.
 */
export function loadLotajeContext(win: Window): LotajeContext {
  try {
    const raw = win.localStorage.getItem(LOTAJE_STORAGE_KEY);
    if (raw === null) return freshContext();

    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return freshContext();
    }

    const root = parsed as Partial<Record<keyof LotajeContext, unknown>>;
    return {
      balanceText:
        typeof root.balanceText === 'string' ? root.balanceText : INITIAL_STATE.balanceText,
      riskPctText:
        typeof root.riskPctText === 'string' ? root.riskPctText : INITIAL_STATE.riskPctText,
      symbolText:
        typeof root.symbolText === 'string' ? root.symbolText : INITIAL_STATE.symbolText,
      method:
        root.method === 'distance' || root.method === 'prices'
          ? root.method
          : INITIAL_STATE.method,
    };
  } catch {
    return freshContext();
  }
}

/**
 * Best-effort save of only the four context fields, plus the reserved
 * unread `v: 1`. Accepts anything structurally compatible with
 * `LotajeContext` (the mounted view passes its full runtime `LotajeState`,
 * which carries more fields) but serializes only these five properties, in
 * this exact order.
 */
export function saveLotajeContext(win: Window, context: LotajeContext): void {
  try {
    const payload = JSON.stringify({
      v: 1,
      balanceText: context.balanceText,
      riskPctText: context.riskPctText,
      symbolText: context.symbolText,
      method: context.method,
    });
    win.localStorage.setItem(LOTAJE_STORAGE_KEY, payload);
  } catch {
    // Quota, private mode, or storage disabled — never surfaced to the
    // caller; the already-transitioned in-memory view stays correct.
  }
}
