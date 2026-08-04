import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CalculadoraPageComponent } from './calculadora-page.component';
import {
  contractSizeFor,
  lotsForRisk,
  lotsForRiskDistance,
  pipSizeFor,
  riskUsdFor,
} from '../../domain/sizing/position-sizing';
import { LOTAJE_STORAGE_KEY } from '../../lotaje/persistence';

/**
 * RFC-020 Task D-1 — rewritten for the framework-free Lotaje view.
 *
 * This file is the DECLARED rewrite of the v1 `calculadora-page.component.spec.ts`
 * (32 `it()`, PR #53). It is authority from this task onward; the v1 version is
 * gone. Three declared deletions (RFC §6.2, D-21, dev-log §8.6.3), each with its
 * reason inline below where the deleted assertion used to live:
 *
 *   1. «Desde lotes» (manualLotsText/manualLots/manualRiskUsd/manualRiskPct/
 *      onManualLots and its three specs) — P3, product design §12 #3.
 *   2. `app-risk-slider` from this page, and its spec — product design §7.3, §12
 *      #12. The component itself is untouched; the emulator dock still uses it.
 *   3. The contract line (`… $/punto por lote`) and BOTH its specs — D-21
 *      (dev-log §8.6): the owner removed the surface those specs described, so
 *      this is not an edit of a still-live spec, it is D-1's own declared
 *      subtraction inside an already-declared rewrite.
 *
 * Every remaining v1 claim is either ported unchanged or RE-EXPRESSED (setup
 * changed, claim preserved) because two things moved out from under it:
 *
 *   - P2 cold start is `10 000 / 1 % / no symbol`, not the v1 prefilled
 *     acceptance case `5000 / 1 / US30 / 40000 / 39950` — so tests that used to
 *     rely on the v1 prefill now drive the DOM to the values they need.
 *   - P4 makes Method B (distance) the default, with Method A (entrada + SL)
 *     reachable by clicking `.lotaje-method-toggle`. Assertions that are
 *     specifically about the Entrada/Stop Loss PRICE fields (the F1/F3
 *     keystroke-fidelity tests) switch method first; assertions that only care
 *     about a resulting lot figure now drive the single stop-distance field
 *     directly, which is simpler and stays on the default path.
 *
 * Where a v1 assertion read an Angular signal directly (`componentInstance.entry()`)
 * there is no longer a component signal to read — the view is framework-free and
 * owns its own state internally. Those claims are re-expressed as an equivalent,
 * still-DOM-driven, still-regression-catching proof: drive the DOM to the exact
 * text that used to break the old bug, then assert the RENDERED lot figure
 * matches the real kernel function (`lotsForRisk`/`lotsForRiskDistance`, imported
 * from `domain/sizing/position-sizing` — never hand-derived) called with the same
 * numbers. A snapped-to-0 or NaN-collapsed value under the old bug produces a
 * visibly different (or absent) figure, so the regression-catching power is the
 * same; only the read mechanism changed from "peek a signal" to "observe the DOM".
 *
 * All specs below fire real DOM events (`el.value = …; el.dispatchEvent(new
 * Event('input'))` / `button.click()`) — never a direct state write. This is the
 * entire point of the port: both F1 and F3 shipped past a green suite once
 * because the old tests drove component signals via `.set()` and never crossed
 * the DOM.
 */
describe('CalculadoraPageComponent (Lotaje host)', () => {
  let currentFixture: ReturnType<typeof TestBed.createComponent<CalculadoraPageComponent>> | null =
    null;

  function create() {
    TestBed.configureTestingModule({});
    const fixture = TestBed.createComponent(CalculadoraPageComponent);
    fixture.detectChanges();
    currentFixture = fixture;
    return fixture;
  }

  // Task C-2 (orchestrator scope amendment): `ngAfterViewInit` calls
  // `mount(this.doc, win)` with exactly two arguments, and `this.doc.defaultView`
  // is the real ambient `window` in every TestBed test, so an omitted-argument
  // mount now reads persisted Lotaje context from real `window.localStorage`.
  // Under this suite's isolate:false runner (docs/engineering/testing.md) that
  // storage is shared across every test in this file, so the key is scrubbed
  // before AND after each test — never `localStorage.clear()`, which could
  // poison another spec file.
  beforeEach(() => {
    window.localStorage.removeItem(LOTAJE_STORAGE_KEY);
  });

  // `mount()`/`unmount()` own module-level state (the mounted DOM subtree, its
  // listeners). Under the suite's isolate:false runner every spec in this file
  // shares that module registry, so a fixture left un-destroyed would leak into
  // the next test's mount(). Destroying here forces ngOnDestroy() -> unmount()
  // between every single test, matching the isolate:false discipline in
  // docs/engineering/testing.md.
  afterEach(() => {
    currentFixture?.destroy();
    currentFixture = null;
    TestBed.resetTestingModule();
    window.localStorage.removeItem(LOTAJE_STORAGE_KEY);
  });

  function el(fixture: ReturnType<typeof create>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function inputByName(fixture: ReturnType<typeof create>, name: string): HTMLInputElement {
    const input = el(fixture).querySelector<HTMLInputElement>(`input[name="${name}"]`);
    if (!input) throw new Error(`no input[name="${name}"] found`);
    return input;
  }

  function setViaDom(fixture: ReturnType<typeof create>, name: string, text: string): void {
    const input = inputByName(fixture, name);
    input.value = text;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function typeKeystrokes(
    fixture: ReturnType<typeof create>,
    input: HTMLInputElement,
    text: string,
  ): void {
    let typed = '';
    for (const ch of text) {
      typed += ch;
      input.value = typed;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      // The field must show EXACTLY what was typed so far at every single
      // keystroke, including intermediate "1." / "1.0" states — this is F1.
      expect(input.value).toBe(typed);
    }
  }

  /** Clicks the Zone 2 method toggle (distance ⇄ prices). Real click, not a state write. */
  function switchMethod(fixture: ReturnType<typeof create>): void {
    const toggle = el(fixture).querySelector<HTMLButtonElement>('.lotaje-method-toggle');
    if (!toggle) throw new Error('no .lotaje-method-toggle button found');
    toggle.click();
    fixture.detectChanges();
  }

  /** Zone 1 (context) is DOM-driven for every test that needs a non-default balance/riskPct/symbol. */
  function setContext(
    fixture: ReturnType<typeof create>,
    v: { balance?: number; riskPct?: number; symbol?: string },
  ): void {
    if (v.balance !== undefined) setViaDom(fixture, 'balance', String(v.balance));
    if (v.riskPct !== undefined) setViaDom(fixture, 'riskPct', String(v.riskPct));
    if (v.symbol !== undefined) setViaDom(fixture, 'symbol', v.symbol);
  }

  function lotsValueText(fixture: ReturnType<typeof create>): string | null {
    return el(fixture).querySelector('.lotaje-lots-value')?.textContent?.trim() ?? null;
  }

  // ---------------------------------------------------------------------
  // (a) acceptance case — RE-EXPRESSED: v1 prefill -> DOM-driven cold start.
  // Method B (distance) is the default, so the stop is typed as a distance
  // (50) rather than as an entry/SL pair; distance is method-agnostic (same
  // |entry-SL|), so this is the same behavioural claim, not a new one.
  // ---------------------------------------------------------------------
  it('renders 1.00 lots, $50.00 risk and 50 pts for the acceptance case (5000 / 1% / US30, stop distance 50)', () => {
    const fixture = create();
    setContext(fixture, { balance: 5000, riskPct: 1, symbol: 'US30' });
    setViaDom(fixture, 'distance', '50');
    expect(lotsValueText(fixture)).toBe('1.00');
    expect(el(fixture).querySelector('.lotaje-risk-usd')?.textContent).toContain('50.00');
    expect(el(fixture).querySelector('.lotaje-stop-unit')?.textContent?.trim()).toBe('pts');
  });

  it('renders 0.22 lots for EURUSD when the labelled stop field contains 45 pips', () => {
    const fixture = create();
    setContext(fixture, { balance: 10000, riskPct: 1, symbol: 'EURUSD' });
    setViaDom(fixture, 'distance', '45');
    expect(el(fixture).querySelector('.lotaje-stop-unit')?.textContent?.trim()).toBe('pips');
    expect(lotsValueText(fixture)).toBe('0.22');
  });

  // (a2) parity invariant, RE-EXPRESSED onto the Method B kernel primitive
  // (`lotsForRiskDistance`) the view actually calls for the default method —
  // never a hand-derived figure, never a second sizing formula.
  function assertLotParityDistance(
    fixture: ReturnType<typeof create>,
    c: { balance: number; riskPct: number; symbol: string; distance: number },
  ) {
    setContext(fixture, c);
    setViaDom(fixture, 'distance', String(c.distance));
    const pipSize = pipSizeFor(c.symbol);
    const distanceInPrice = pipSize === null ? c.distance : c.distance * pipSize;
    const expected = lotsForRiskDistance(
      riskUsdFor(c.balance, c.riskPct),
      distanceInPrice,
      contractSizeFor(c.symbol),
    );
    expect(lotsValueText(fixture)).toBe(expected.toFixed(2));
  }

  it('parity: the rendered lot figure equals lotsForRiskDistance(...) for the acceptance case', () => {
    assertLotParityDistance(create(), { balance: 5000, riskPct: 1, symbol: 'US30', distance: 50 });
  });

  it('parity: the rendered lot figure equals lotsForRiskDistance(...) for a floor case', () => {
    assertLotParityDistance(create(), { balance: 100, riskPct: 0.1, symbol: 'US30', distance: 50 });
  });

  it('parity: the rendered lot figure equals lotsForRiskDistance(...) for a rounding case', () => {
    assertLotParityDistance(create(), {
      balance: 5000,
      riskPct: 1,
      symbol: 'EURUSD',
      distance: 60,
    });
  });

  // (b) SL = entry (distance 0) — RE-EXPRESSED via the distance field directly.
  it('shows the dedicated SL-equals-entry message instead of a lot figure', () => {
    const fixture = create();
    setContext(fixture, { balance: 5000, riskPct: 1, symbol: 'US30' });
    setViaDom(fixture, 'distance', '0');
    const text = el(fixture).textContent ?? '';
    expect(text).toContain('El SL coincide con la entrada.');
    expect(el(fixture).querySelector('.lotaje-hero')).toBeNull();
  });

  // (c) non-positive balance or risk — RE-EXPRESSED, cold-start symbol/distance driven explicitly.
  it('shows its own message for a non-positive balance, not a lot figure', () => {
    const fixture = create();
    setContext(fixture, { balance: 0, riskPct: 1, symbol: 'US30' });
    setViaDom(fixture, 'distance', '50');
    const text = el(fixture).textContent ?? '';
    expect(text).not.toContain('El SL coincide con la entrada.');
    expect(el(fixture).querySelector('.lotaje-hero')).toBeNull();
    expect(text.toLowerCase()).toContain('positivos');
  });

  it('shows its own message for a non-positive risk %, not a lot figure', () => {
    const fixture = create();
    setContext(fixture, { balance: 5000, riskPct: 0, symbol: 'US30' });
    setViaDom(fixture, 'distance', '50');
    expect(el(fixture).querySelector('.lotaje-hero')).toBeNull();
    expect((el(fixture).textContent ?? '').toLowerCase()).toContain('positivos');
  });

  // (d) the floor case WARNS — literal pin preserved (hand-verified business numbers, not fidelity plumbing).
  it('shows the minimum-lot floor warning naming both figures and the correct cause/direction (balance 100 / risk 0.1% / distance 50)', () => {
    const fixture = create();
    setContext(fixture, { balance: 100, riskPct: 0.1, symbol: 'US30' });
    setViaDom(fixture, 'distance', '50');
    const text = el(fixture).textContent ?? '';
    expect(text).toContain('mínimo de 0.01 lotes');
    expect(text).toContain('$0.50');
    expect(text).toContain('$0.10');
    expect(text).toContain('por encima');
    expect(el(fixture).querySelector('.lotaje-hero')).not.toBeNull();
  });

  // (d2) the rounding case (no floor involved) — literal pin preserved.
  it('warns about plain rounding (not the floor) and the correct "below" direction for an ordinary trade (5000 / 1% / EURUSD, distance 60 pips)', () => {
    const fixture = create();
    setContext(fixture, { balance: 5000, riskPct: 1, symbol: 'EURUSD' });
    setViaDom(fixture, 'distance', '60');
    const text = el(fixture).textContent ?? '';
    expect(text).toContain('redondeo');
    expect(text).toContain('$48.00');
    expect(text).toContain('por debajo');
    expect(text).not.toContain('mínimo de 0.01 lotes');
  });

  // (e) acceptance case does NOT warn — guard against an always-on warning.
  it('does NOT show the floor warning for the acceptance case', () => {
    const fixture = create();
    setContext(fixture, { balance: 5000, riskPct: 1, symbol: 'US30' });
    setViaDom(fixture, 'distance', '50');
    const text = el(fixture).textContent ?? '';
    expect(text).not.toContain('mínimo de 0.01 lotes');
    expect(text).not.toContain('redondeo al paso de 0.01 lotes');
  });

  // (f)/(g) DELETED — the contract line (D-21, dev-log §8.6.3). The v1 specs
  // 'shows the applied contractSize on screen' and 'shows $/pip por lote for a
  // forex symbol…' pinned `'1 $/punto por lote'` / `'10 $/pip por lote'` /
  // `'100,000 $/punto por lote'`, text that described a surface the owner
  // removed from the product (§3.3). Not ported, not re-expressed: the thing
  // they asserted no longer exists to assert about.

  // (h)/(i) DELETED — «Desde lotes» (P3). The v1 specs 'renders — instead of a
  // fabricated 0.00 $ …' and 'renders — instead of a fabricated 0.00 % …'
  // pinned the manual-lots inverse block's honest-dash behaviour. That block
  // (manualLotsText/manualLots/manualRiskUsd/manualRiskPct/onManualLots) is
  // deleted in full; there is nothing left to assert against.

  // ---------------------------------------------------------------------
  // F1 (HIGH) regression — DOM-driven, not `.set()`/signal-read. These are
  // specifically about the Entrada/Stop Loss PRICE fields, which only exist
  // in Method A — every test here switches method first via a real click.
  // ---------------------------------------------------------------------
  describe('F1 — decimal entry survives keystroke-by-keystroke typing (DOM-driven, Method A)', () => {
    it('an EURUSD-style entry (1.10952) typed left to right into Entrada never snaps to 0', () => {
      const fixture = create();
      switchMethod(fixture);
      const entry = inputByName(fixture, 'entry');
      typeKeystrokes(fixture, entry, '1.10952');
      setViaDom(fixture, 'sl', '1');
      // If the old bug were present, a mid-keystroke `Number('')` write-back
      // would have collapsed entry to 0, giving a completely different (and
      // for distance 1 vs 0.00952, wildly different) lot figure or an honest
      // state. Parity against the real kernel call proves the full decimal
      // survived — never a hand-derived figure.
      const expected = lotsForRisk(10000, 1, 1.10952, 1, contractSizeFor(''));
      expect(lotsValueText(fixture)).toBe(expected.toFixed(2));
    });

    it('a trailing-zero price (2650.50) typed into Stop Loss never snaps to 0', () => {
      const fixture = create();
      switchMethod(fixture);
      setViaDom(fixture, 'entry', '2700');
      const sl = inputByName(fixture, 'sl');
      typeKeystrokes(fixture, sl, '2650.50');
      const expected = lotsForRisk(10000, 1, 2700, 2650.5, contractSizeFor(''));
      expect(lotsValueText(fixture)).toBe(expected.toFixed(2));
    });

    it('clearing Entrada leaves it visibly empty (no 0 snap-back) and lands in an honest state', () => {
      const fixture = create();
      switchMethod(fixture);
      const entry = inputByName(fixture, 'entry');
      entry.value = '';
      entry.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(entry.value).toBe('');
      const text = el(fixture).textContent ?? '';
      expect(text.toLowerCase()).toContain('positivos');
      expect(el(fixture).querySelector('.lotaje-hero')).toBeNull();
    });

    it('clearing Stop Loss leaves it visibly empty and does not render a confident wrong lot figure', () => {
      const fixture = create();
      switchMethod(fixture);
      setViaDom(fixture, 'entry', '2700');
      const sl = inputByName(fixture, 'sl');
      sl.value = '';
      sl.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(sl.value).toBe('');
      expect(el(fixture).querySelector('.lotaje-hero')).toBeNull();
    });

    // Zone 1's risk field is always present regardless of method — no switch
    // needed. RE-EXPRESSED only in name: `riskPctFree` -> `riskPct`, because
    // the slider that justified the "free field" name is gone (declared
    // deletion #2) and there is now exactly one risk field.
    it('the Riesgo % field survives 1.5 typed left to right', () => {
      const fixture = create();
      const riskPct = inputByName(fixture, 'riskPct');
      typeKeystrokes(fixture, riskPct, '1.5');
      setContext(fixture, { balance: 10000, symbol: 'US30' });
      setViaDom(fixture, 'distance', '50');
      const expected = lotsForRiskDistance(riskUsdFor(10000, 1.5), 50, contractSizeFor('US30'));
      expect(lotsValueText(fixture)).toBe(expected.toFixed(2));
    });

    // 'Lotes survives 0.5 typed left to right' — DELETED («Desde lotes», P3).
    // 'the risk slider still updates the free Riesgo % field' — DELETED (app-risk-slider, §7.3).
  });

  // ---------------------------------------------------------------------
  // F2 (MEDIUM) regression — every text input must have an accessible name.
  // RE-EXPRESSED: `input[appInput]` (the Angular directive's host selector)
  // doesn't exist in the framework-free view; the equivalent marker is the
  // `.ui-input` CSS class the view applies directly (same class the directive
  // itself sets — see input.directive.ts). Broadened to also cover Method A's
  // fields (entry/SL), which the v1 page didn't have to distinguish.
  // ---------------------------------------------------------------------
  it('F2 — every input.ui-input has an accessible name (label wrap or aria-label), in both methods', () => {
    const fixture = create();
    function assertAllNamed() {
      const inputs = Array.from(el(fixture).querySelectorAll<HTMLInputElement>('input.ui-input'));
      expect(inputs.length).toBeGreaterThan(0);
      for (const input of inputs) {
        // `.labels` is the browser's own spec-accurate association — not
        // `closest('label')`, which is true for any descendant of a label
        // even one that doesn't actually name it.
        const hasLabelAssociation = input.labels !== null && input.labels.length > 0;
        const hasAriaLabel = input.hasAttribute('aria-label');
        const hasAriaLabelledby = input.hasAttribute('aria-labelledby');
        const named = hasLabelAssociation || hasAriaLabel || hasAriaLabelledby;
        expect(named, `input[name="${input.name}"] has no accessible name`).toBe(true);
      }
    }
    assertAllNamed(); // Method B (default): symbol, balance, riskPct, distance
    switchMethod(fixture);
    assertAllNamed(); // Method A: symbol, balance, riskPct, entry, sl
  });

  // ---------------------------------------------------------------------
  // F3 (HIGH) regression — DOM-driven, not `.set()`/signal-read.
  // ---------------------------------------------------------------------
  describe('F3 — comma decimal / trailing junk parses fully or refuses (DOM-driven)', () => {
    // Auditor's own reproduction, literal pin preserved verbatim (XAUUSD,
    // account 5000, risk 1%). Method A required — these are real gold prices,
    // not a distance. Comma-typed entry/SL must render the SAME lot figure as
    // the dot-typed version (0.20), never the truncated-parse figure (0.25).
    it('renders 0.20 lots for comma-typed 2650,50 -> 2648,00 on XAUUSD (not the truncated 0.25)', () => {
      const fixture = create();
      setContext(fixture, { balance: 5000, riskPct: 1, symbol: 'XAUUSD' });
      switchMethod(fixture);
      setViaDom(fixture, 'entry', '2650,50');
      setViaDom(fixture, 'sl', '2648,00');
      expect(lotsValueText(fixture)).toBe('0.20');
      expect(lotsValueText(fixture)).not.toBe('0.25');
    });

    it('renders the identical 0.20 lots for dot-typed 2650.50 -> 2648.00 on XAUUSD (parity with the comma case)', () => {
      const fixture = create();
      setContext(fixture, { balance: 5000, riskPct: 1, symbol: 'XAUUSD' });
      switchMethod(fixture);
      setViaDom(fixture, 'entry', '2650.50');
      setViaDom(fixture, 'sl', '2648.00');
      expect(lotsValueText(fixture)).toBe('0.20');
    });

    it('1.5abc typed into Entrada lands in the honest state, not a truncated 1.5', () => {
      const fixture = create();
      switchMethod(fixture);
      setViaDom(fixture, 'entry', '1.5abc');
      const text = el(fixture).textContent ?? '';
      expect(text.toLowerCase()).toContain('positivos');
      expect(el(fixture).querySelector('.lotaje-hero')).toBeNull();
    });

    it('1,234,56 (ambiguous multi-comma) typed into Entrada lands in the honest state', () => {
      const fixture = create();
      switchMethod(fixture);
      setViaDom(fixture, 'entry', '1,234,56');
      expect(el(fixture).querySelector('.lotaje-hero')).toBeNull();
      expect((el(fixture).textContent ?? '').toLowerCase()).toContain('positivos');
    });

    it('a lone "-" typed into Entrada lands in the honest state', () => {
      const fixture = create();
      switchMethod(fixture);
      setViaDom(fixture, 'entry', '-');
      expect(el(fixture).querySelector('.lotaje-hero')).toBeNull();
      expect((el(fixture).textContent ?? '').toLowerCase()).toContain('positivos');
    });

    // Mid-typing cases — must keep parsing or F3 breaks F1. RE-EXPRESSED via
    // kernel parity against a fixed SL, so the exact captured number is
    // provable without reading an internal signal.
    it('a lone "1." typed into Entrada parses to 1 (mid-typing, do not break F1)', () => {
      const fixture = create();
      switchMethod(fixture);
      setViaDom(fixture, 'entry', '1.');
      setViaDom(fixture, 'sl', '0');
      const expected = lotsForRisk(10000, 1, 1, 0, contractSizeFor(''));
      expect(lotsValueText(fixture)).toBe(expected.toFixed(2));
    });

    it('a lone "1," typed into Entrada parses to 1 (comma variant of mid-typing)', () => {
      const fixture = create();
      switchMethod(fixture);
      setViaDom(fixture, 'entry', '1,');
      setViaDom(fixture, 'sl', '0');
      const expected = lotsForRisk(10000, 1, 1, 0, contractSizeFor(''));
      expect(lotsValueText(fixture)).toBe(expected.toFixed(2));
    });

    it('1e5 typed into Entrada still parses to 100000', () => {
      const fixture = create();
      switchMethod(fixture);
      setViaDom(fixture, 'entry', '1e5');
      setViaDom(fixture, 'sl', '99900');
      const expected = lotsForRisk(10000, 1, 100000, 99900, contractSizeFor(''));
      expect(lotsValueText(fixture)).toBe(expected.toFixed(2));
    });

    it('-1 typed into Stop Loss still parses to a finite -1 (L6 depends on this)', () => {
      const fixture = create();
      switchMethod(fixture);
      setViaDom(fixture, 'entry', '1.1');
      setViaDom(fixture, 'sl', '-1');
      const expected = lotsForRisk(10000, 1, 1.1, -1, contractSizeFor(''));
      expect(lotsValueText(fixture)).toBe(expected.toFixed(2));
    });
  });

  // ---------------------------------------------------------------------
  // L8 — RE-EXPRESSED. `ui-dropdown` is an Angular component
  // (`components/ui/dropdown.component`) and the framework-free view cannot
  // import `components/*` (RFC §7.1 item 6, grep-checked). The claim under
  // test — picking a different symbol re-sizes through the registry — is
  // preserved by typing the symbol into the plain-text symbol field instead
  // of picking it from a dropdown.
  // ---------------------------------------------------------------------
  it('L8 — typing a different symbol into the symbol field re-sizes through the registry', () => {
    const fixture = create();
    setContext(fixture, { balance: 5000, riskPct: 1 });
    setViaDom(fixture, 'distance', '50');
    expect(contractSizeFor('')).toBe(1); // blank symbol falls to the point-based heuristic default
    expect(lotsValueText(fixture)).toBe('1.00');

    setViaDom(fixture, 'symbol', 'XAUUSD');
    expect(contractSizeFor('XAUUSD')).toBe(100);
    const expected = lotsForRiskDistance(riskUsdFor(5000, 1), 50, 100);
    expect(lotsValueText(fixture)).toBe(expected.toFixed(2));
    expect(lotsValueText(fixture)).toBe('0.01'); // hits the 0.01 floor, matching the v1 claim
  });

  // ---------------------------------------------------------------------
  // Host-specific specs (thin host: create container, mount, unmount).
  // ---------------------------------------------------------------------
  describe('thin host wiring', () => {
    it('creates a mount container and renders the Lotaje view into it', () => {
      const fixture = create();
      const container = el(fixture).querySelector('#lotaje-mount');
      expect(container).not.toBeNull();
      expect(container?.children.length).toBeGreaterThan(0);
      expect(container?.querySelector('.lotaje-zone--context')).not.toBeNull();
      expect(container?.querySelector('.lotaje-zone--question')).not.toBeNull();
      expect(container?.querySelector('.lotaje-zone--answer')).not.toBeNull();
    });

    it('calls unmount() on destroy, leaving the mount container empty', () => {
      const fixture = create();
      const container = el(fixture).querySelector('#lotaje-mount');
      expect(container?.children.length).toBeGreaterThan(0);
      fixture.destroy();
      currentFixture = null; // already destroyed; afterEach must not double-destroy
      expect(container?.children.length).toBe(0);
    });

    // Wave 4 audit L-3: `ngAfterViewInit`'s `mount(this.doc, win)` (line 43
    // above) is the ONLY production call site of the P1/P2 restore path. This
    // file's beforeEach/afterEach guarantee EMPTY storage for every other
    // test (the C-2 scope amendment, dev-log §16.4) — nothing else here seeds
    // real localStorage and asserts the host renders restored context. Seed
    // AFTER beforeEach has already scrubbed the key, so this cooperates with
    // that hygiene instead of racing it.
    it('restores a persisted context from real localStorage at the mount() call site', () => {
      window.localStorage.setItem(
        LOTAJE_STORAGE_KEY,
        JSON.stringify({
          v: 1,
          balanceText: '54321',
          riskPctText: '2',
          symbolText: 'EURUSD',
          method: 'distance',
        }),
      );

      const fixture = create();

      expect(inputByName(fixture, 'balance').value).toBe('54321');
      expect(inputByName(fixture, 'riskPct').value).toBe('2');
      expect(inputByName(fixture, 'symbol').value).toBe('EURUSD');
    });
  });
});
