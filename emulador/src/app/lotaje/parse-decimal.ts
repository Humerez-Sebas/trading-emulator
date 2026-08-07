/**
 * Ported verbatim (behaviour, not text) from the v1
 * `pages/calculadora/calculadora-page.component.ts` — this is the F1/F3 fix,
 * and it is a requirement of interaction (product design §7.4), not an
 * implementation detail. Framework-free: no Angular, no DOM. `emulador/src/app/lotaje`
 * may depend on `domain/sizing/*` but this file needs none of it — it is pure
 * text parsing.
 *
 * ---- F1 (decimal entry) ----
 * Every numeric field in the view is `type="text" inputmode="decimal"` bound
 * to a RAW STRING, never `type="number"`: `<input type="number">.value`
 * sanitizes any intermediate text that isn't yet a valid float ("1.", "-", a
 * lone ".") to `''` on assignment, even via plain script assignment — no
 * component-side guard can recover text the DOM already discarded. The raw
 * text is parsed at READ time only, via this function; nothing is ever
 * written back to the DOM mid-edit from a `computed`.
 *
 * ---- F3 (comma decimal / trailing junk) ----
 * `parseFloat` stops at the first character it cannot consume and returns
 * the truncated prefix instead of refusing: `parseFloat('2650,50')` is
 * `2650` (silently dropping the Spanish-keypad decimal comma), and
 * `parseFloat('1.5abc')` is `1.5`. Neither produces `NaN`, so neither reaches
 * an honest state; both produce a confidently wrong lot figure. This function
 * normalizes the comma separator, then hands the WHOLE string to `Number()`,
 * which (unlike `parseFloat`) returns `NaN` for any trailing/embedded junk.
 * Mid-typing states ("1.", "1,") must still parse (F1 depends on it) and
 * finite negatives ("-1") must still parse (a ruled no-fix depends on it) —
 * `Number` already handles both correctly.
 */
export function parseDecimal(text: string): number {
  const trimmed = text.trim();
  // Number('') is 0, not NaN — must be handled before Number sees it, or
  // this reintroduces the F1 bug class (an empty field reading as zero).
  if (trimmed === '') return NaN;
  return Number(trimmed.replace(',', '.'));
}
