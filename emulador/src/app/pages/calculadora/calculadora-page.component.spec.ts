import { TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { CalculadoraPageComponent } from './calculadora-page.component';
import { selectAssets } from '../../state/selectors';
import { contractSizeFor, lotsForRisk } from '../../state/trading/trading.models';

/**
 * Renders against DOM text (`fixture.nativeElement.textContent`), not
 * component internals — the claim under test is what the trader sees.
 * Every expected number below is a LITERAL, hand-computed constant: the
 * page's only source of a lot figure is `lotsForRisk` (composed inside the
 * component), never a copy of the formula here — except in the dedicated
 * parity test below, which calls the real `lotsForRisk` directly (that IS
 * the parity assertion; hand-deriving the arithmetic is what is forbidden).
 */
describe('CalculadoraPageComponent', () => {
  let store: MockStore;

  function create() {
    TestBed.configureTestingModule({
      providers: [provideMockStore()],
    });
    store = TestBed.inject(MockStore);
    store.overrideSelector(selectAssets, []);
    store.refreshState();
    const fixture = TestBed.createComponent(CalculadoraPageComponent);
    fixture.detectChanges();
    return fixture;
  }

  // Writes to the raw TEXT signals (F1: `balance`/`riskPct`/`entry`/`sl` are
  // now read-only `computed(() => parseFloat(...Text()))`, parsed from the
  // text the DOM actually holds — see the component's class doc). `String()`
  // round-trips exactly for every literal used across this suite.
  function setInputs(
    fixture: ReturnType<typeof create>,
    v: { balance: number; riskPct: number; symbol: string; entry: number; sl: number },
  ) {
    const c = fixture.componentInstance;
    c.balanceText.set(String(v.balance));
    c.riskPctText.set(String(v.riskPct));
    c.symbol.set(v.symbol);
    c.entryText.set(String(v.entry));
    c.slText.set(String(v.sl));
    fixture.detectChanges();
  }

  afterEach(() => {
    TestBed.resetTestingModule();
    store?.resetSelectors();
  });

  // (a) acceptance case — M3: pin each claim to its own element, not a
  // whole-page substring other fields could also produce.
  it('renders 1.00 lots, 50.00 risk and 50 puntos for the acceptance case (5000 / 1% / US30 40000->39950)', () => {
    const fixture = create();
    setInputs(fixture, { balance: 5000, riskPct: 1, symbol: 'US30', entry: 40000, sl: 39950 });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.lots-value')?.textContent?.trim()).toBe('1.00');
    expect(el.querySelector('.requested-risk-value')?.textContent?.trim()).toBe('50.00 $');
    expect(el.querySelector('.distance-value')?.textContent?.trim()).toBe('50 puntos');
  });

  // (a2) M3 — parity invariant: the page never reimplements sizing. The
  // rendered lot figure must equal `lotsForRisk` called directly from the
  // test (imported from `state/trading/trading.models`), for the
  // acceptance case, a floor case and a rounding case. Three separate `it`s
  // (rather than a loop over one `create()`) because `TestBed` only allows
  // one `configureTestingModule` per test — see `afterEach` above.
  function assertLotParity(c: {
    balance: number;
    riskPct: number;
    symbol: string;
    entry: number;
    sl: number;
  }) {
    const fixture = create();
    setInputs(fixture, c);
    const contractSize = contractSizeFor(c.symbol);
    const expectedLots = lotsForRisk(c.balance, c.riskPct, c.entry, c.sl, contractSize);
    const el = fixture.nativeElement as HTMLElement;
    // Mind the display format (`| number: '1.2-2'`): expectedLots is
    // already rounded to the 0.01 step by `lotsForRisk`, so `.toFixed(2)`
    // reproduces the same formatting without re-deriving the arithmetic.
    expect(el.querySelector('.lots-value')?.textContent?.trim()).toBe(expectedLots.toFixed(2));
  }

  it('parity: the rendered lot figure equals lotsForRisk(...) for the acceptance case', () => {
    assertLotParity({ balance: 5000, riskPct: 1, symbol: 'US30', entry: 40000, sl: 39950 });
  });

  it('parity: the rendered lot figure equals lotsForRisk(...) for a floor case', () => {
    assertLotParity({ balance: 100, riskPct: 0.1, symbol: 'US30', entry: 40000, sl: 39950 });
  });

  it('parity: the rendered lot figure equals lotsForRisk(...) for a rounding case', () => {
    assertLotParity({ balance: 5000, riskPct: 1, symbol: 'EURUSD', entry: 1.1, sl: 1.094 });
  });

  // (b) SL = entry — M2: assert the element is absent, not an unsatisfiable
  // substring (`preserveWhitespaces: false` renders '1.00lotes', no space,
  // so '0.00 lotes' can never appear regardless of what is on screen).
  it('shows the dedicated SL-equals-entry message instead of a lot figure', () => {
    const fixture = create();
    setInputs(fixture, { balance: 5000, riskPct: 1, symbol: 'US30', entry: 40000, sl: 40000 });
    const el = fixture.nativeElement as HTMLElement;
    const text = el.textContent ?? '';
    expect(text).toContain('El SL coincide con la entrada');
    expect(el.querySelector('.lots-hero')).toBeNull();
  });

  // (c) non-positive balance or risk
  it('shows its own message for a non-positive balance, not a lot figure', () => {
    const fixture = create();
    setInputs(fixture, { balance: 0, riskPct: 1, symbol: 'US30', entry: 40000, sl: 39950 });
    const el = fixture.nativeElement as HTMLElement;
    const text = el.textContent ?? '';
    expect(text).not.toContain('El SL coincide con la entrada');
    expect(el.querySelector('.lots-hero')).toBeNull();
    expect(text.toLowerCase()).toContain('positivos');
  });

  it('shows its own message for a non-positive risk %, not a lot figure', () => {
    const fixture = create();
    setInputs(fixture, { balance: 5000, riskPct: 0, symbol: 'US30', entry: 40000, sl: 39950 });
    const el = fixture.nativeElement as HTMLElement;
    const text = el.textContent ?? '';
    expect(el.querySelector('.lots-hero')).toBeNull();
    expect(text.toLowerCase()).toContain('positivos');
  });

  // (d) the floor case WARNS — M1: message must name the true cause (the
  // 0.01 minimum) and the true direction (the real risk landed above the
  // requested one).
  it('shows the minimum-lot floor warning naming both figures and the correct cause/direction (balance 100 / risk 0.1% / 40000->39950)', () => {
    const fixture = create();
    setInputs(fixture, { balance: 100, riskPct: 0.1, symbol: 'US30', entry: 40000, sl: 39950 });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('mínimo de 0.01 lotes');
    expect(text).toContain('$0.50');
    expect(text).toContain('$0.10');
    expect(text).toContain('por encima');
  });

  // (d2) M1 — the rounding case (no floor involved): an entirely ordinary
  // retail forex trade where rounding to the 0.01 broker step lands the
  // real risk BELOW the requested one. The old message lied on both counts
  // here (claimed the floor applied, claimed "above").
  it('warns about plain rounding (not the floor) and the correct "below" direction for an ordinary trade (5000 / 1% / EURUSD 1.1000->1.0940)', () => {
    const fixture = create();
    setInputs(fixture, { balance: 5000, riskPct: 1, symbol: 'EURUSD', entry: 1.1, sl: 1.094 });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('redondeo');
    expect(text).toContain('$48.00');
    expect(text).toContain('por debajo');
    expect(text).not.toContain('mínimo de 0.01 lotes');
  });

  // (e) the acceptance case does NOT warn — guard against an always-on warning
  it('does NOT show the floor warning for the acceptance case', () => {
    const fixture = create();
    setInputs(fixture, { balance: 5000, riskPct: 1, symbol: 'US30', entry: 40000, sl: 39950 });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('mínimo de 0.01 lotes');
    expect(text).not.toContain('redondeo al paso de 0.01 lotes');
  });

  // (f) applied contractSize appears on screen
  it('shows the applied contractSize on screen', () => {
    const fixture = create();
    setInputs(fixture, { balance: 5000, riskPct: 1, symbol: 'US30', entry: 40000, sl: 39950 });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('US30');
    expect(text).toContain('1 $/punto por lote');
  });

  // (g) L2 — a forex pair shows the pip-denominated unit, not the raw
  // $/point figure that is off by 100x for a pip distance; the raw
  // contractSize figure stays visible on the same line (spec §5
  // mitigation for a mistyped symbol).
  it('shows $/pip por lote for a forex symbol, keeping the raw contractSize figure visible', () => {
    const fixture = create();
    setInputs(fixture, { balance: 5000, riskPct: 1, symbol: 'EURUSD', entry: 1.1, sl: 1.094 });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('10 $/pip por lote');
    expect(text).toContain('100,000 $/punto por lote');
  });

  // (h) L1 — the inverse block must not fabricate a 0.00 when the quantity
  // is undefined: distance 0 (SL = entry) makes the USD figure undefined.
  it('renders — instead of a fabricated 0.00 $ in "Desde lotes" when SL = entry', () => {
    const fixture = create();
    setInputs(fixture, { balance: 5000, riskPct: 1, symbol: 'US30', entry: 40000, sl: 40000 });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.manual-risk-usd')?.textContent?.trim()).toBe('—');
    expect(el.querySelector('.manual-risk-pct')?.textContent?.trim()).toBe('—');
  });

  // (i) L1 — balance <= 0 makes the % figure undefined (division by a
  // non-positive quantity), previously hardcoded to a fabricated 0.
  it('renders — instead of a fabricated 0.00 % in "Desde lotes" when balance <= 0', () => {
    const fixture = create();
    setInputs(fixture, { balance: 0, riskPct: 1, symbol: 'US30', entry: 40000, sl: 39950 });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.manual-risk-pct')?.textContent?.trim()).toBe('—');
    // The USD figure IS still defined here (distance > 0): manualLots
    // defaults to 1, so it must render a real number, not a dash.
    expect(el.querySelector('.manual-risk-usd')?.textContent?.trim()).not.toBe('—');
  });

  // ---- F1 (HIGH) regression — DOM-driven, not `.set()`. Every numeric field
  // used to bind `[value]="signal()"` and write `signal.set(Number(target.value))`
  // on every `input` event. `<input type="number">` returns `''` from
  // `.value` for any invalid intermediate text ("1.", "-", a cleared field),
  // and `Number('')` is `0` — so mid-keystroke the signal collapsed to `0`
  // and Angular wrote "0" back into the field, destroying what was typed.
  // These tests drive the real `<input>` element, exactly the DOM path the
  // 14 tests above never touch (they all call `.set()` directly).
  describe('F1 — decimal entry survives keystroke-by-keystroke typing (DOM-driven)', () => {
    function inputByName(fixture: ReturnType<typeof create>, name: string): HTMLInputElement {
      const el = fixture.nativeElement as HTMLElement;
      const input = el.querySelector<HTMLInputElement>(`input[name="${name}"]`);
      if (!input) throw new Error(`no input[name="${name}"] found`);
      return input;
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
        // keystroke, including the intermediate "1." and "1.0" states that
        // the old Number()-on-every-keystroke write-back destroyed.
        expect(input.value).toBe(typed);
      }
    }

    it('EURUSD entry 1.10952 typed left to right into Entrada never snaps to 0', () => {
      const fixture = create();
      const entry = inputByName(fixture, 'entry');
      typeKeystrokes(fixture, entry, '1.10952');
      expect(fixture.componentInstance.entry()).toBeCloseTo(1.10952, 5);
    });

    it('a trailing-zero price (2650.50) typed into Stop Loss never snaps to 0', () => {
      const fixture = create();
      const sl = inputByName(fixture, 'sl');
      typeKeystrokes(fixture, sl, '2650.50');
      expect(fixture.componentInstance.sl()).toBeCloseTo(2650.5, 5);
    });

    it('clearing Entrada leaves it visibly empty (no 0 snap-back) and lands in an honest state', () => {
      const fixture = create();
      const entry = inputByName(fixture, 'entry');
      entry.value = '';
      entry.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(entry.value).toBe('');
      const text = fixture.nativeElement.textContent ?? '';
      expect(text.toLowerCase()).toContain('positivos');
      expect(fixture.nativeElement.querySelector('.lots-hero')).toBeNull();
    });

    it('clearing Stop Loss leaves it visibly empty and does not render a confident wrong lot figure', () => {
      const fixture = create();
      const sl = inputByName(fixture, 'sl');
      sl.value = '';
      sl.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(sl.value).toBe('');
      // A cleared SL must NOT produce a "0.00 lotes" confident-looking
      // figure (distance becomes undefined, not 0 — the SL-equals-entry
      // state is a different, more specific honest state).
      expect(fixture.nativeElement.querySelector('.lots-hero')).toBeNull();
    });

    it('the free Riesgo % field survives 1.5 typed left to right', () => {
      const fixture = create();
      const riskFree = inputByName(fixture, 'riskPctFree');
      typeKeystrokes(fixture, riskFree, '1.5');
      expect(fixture.componentInstance.riskPct()).toBeCloseTo(1.5, 5);
    });

    it('Lotes survives 0.5 typed left to right', () => {
      const fixture = create();
      const lots = inputByName(fixture, 'manualLots');
      typeKeystrokes(fixture, lots, '0.5');
      expect(fixture.componentInstance.manualLots()).toBeCloseTo(0.5, 5);
    });

    it('the risk slider still updates the free Riesgo % field (constraint 3 — do not break the one working direction)', () => {
      const fixture = create();
      const el = fixture.nativeElement as HTMLElement;
      const rangeInput = el.querySelector<HTMLInputElement>('app-risk-slider input[type="range"]');
      if (!rangeInput) throw new Error('no range input found inside app-risk-slider');
      rangeInput.value = '2.5';
      rangeInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      const riskFree = inputByName(fixture, 'riskPctFree');
      expect(riskFree.value).toBe('2.5');
      expect(fixture.componentInstance.riskPct()).toBeCloseTo(2.5, 5);
    });
  });

  // ---- F2 (MEDIUM) regression — every `input[appInput]` in the page must
  // have an accessible name: it sits inside a `<label>`, or it carries
  // `aria-label`/`aria-labelledby`. Previously every field group was a
  // `<div class="ui-field"><span>…</span><input …>`, giving screen readers
  // five indistinguishable "spin button" controls.
  it('F2 — every input[appInput] has an accessible name (label wrap or aria-label)', () => {
    const fixture = create();
    const el = fixture.nativeElement as HTMLElement;
    const inputs = Array.from(el.querySelectorAll<HTMLInputElement>('input[appInput]'));
    expect(inputs.length).toBeGreaterThan(0);
    for (const input of inputs) {
      // L11: `closest('label')` is true for ANY descendant of a label, even
      // one the label does not actually name (e.g. a label wrapping two
      // controls, where the browser's implicit-association algorithm names
      // only the first labelable descendant). `.labels` is the spec-accurate
      // association the browser itself computes.
      const hasLabelAssociation = input.labels !== null && input.labels.length > 0;
      const hasAriaLabel = input.hasAttribute('aria-label');
      const hasAriaLabelledby = input.hasAttribute('aria-labelledby');
      const named = hasLabelAssociation || hasAriaLabel || hasAriaLabelledby;
      expect(named, `input[name="${input.name}"] has no accessible name`).toBe(true);
    }
  });

  // ---- F3 (HIGH) regression — DOM-driven, not `.set()`. `parseFloat`
  // truncates at the first character it cannot consume instead of refusing
  // the whole string: `parseFloat('2650,50')` reads `2650` (dropping the
  // Spanish-keypad decimal comma with no NaN, no signal), and
  // `parseFloat('1.5abc')` reads `1.5`. Both must land in the honest state
  // instead of a confidently wrong lot figure.
  describe('F3 — comma decimal / trailing junk parses fully or refuses (DOM-driven)', () => {
    function inputByName(fixture: ReturnType<typeof create>, name: string): HTMLInputElement {
      const el = fixture.nativeElement as HTMLElement;
      const input = el.querySelector<HTMLInputElement>(`input[name="${name}"]`);
      if (!input) throw new Error(`no input[name="${name}"] found`);
      return input;
    }

    function setViaDom(fixture: ReturnType<typeof create>, name: string, text: string): void {
      const input = inputByName(fixture, name);
      input.value = text;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    }

    // Auditor's own reproduction: XAUUSD, account 5000, risk 1%. Comma-typed
    // entry/SL must render the SAME lot figure as the dot-typed version
    // (0.20), never the truncated-parse figure (0.25) that a 25%-oversized
    // position would come from.
    it('renders 0.20 lots for comma-typed 2650,50 -> 2648,00 on XAUUSD (not the truncated 0.25)', () => {
      const fixture = create();
      setInputs(fixture, { balance: 5000, riskPct: 1, symbol: 'XAUUSD', entry: 40000, sl: 39950 });
      setViaDom(fixture, 'entry', '2650,50');
      setViaDom(fixture, 'sl', '2648,00');
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.lots-value')?.textContent?.trim()).toBe('0.20');
      expect(el.querySelector('.lots-value')?.textContent?.trim()).not.toBe('0.25');
    });

    it('renders the identical 0.20 lots for dot-typed 2650.50 -> 2648.00 on XAUUSD (parity with the comma case)', () => {
      const fixture = create();
      setInputs(fixture, { balance: 5000, riskPct: 1, symbol: 'XAUUSD', entry: 40000, sl: 39950 });
      setViaDom(fixture, 'entry', '2650.50');
      setViaDom(fixture, 'sl', '2648.00');
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.lots-value')?.textContent?.trim()).toBe('0.20');
    });

    it('1.5abc typed into Entrada lands in the honest state, not a truncated 1.5', () => {
      const fixture = create();
      setViaDom(fixture, 'entry', '1.5abc');
      expect(fixture.componentInstance.entry()).toBeNaN();
      const text = fixture.nativeElement.textContent ?? '';
      expect(text.toLowerCase()).toContain('positivos');
      expect(fixture.nativeElement.querySelector('.lots-hero')).toBeNull();
    });

    it('1,234,56 (ambiguous multi-comma) typed into Entrada lands in the honest state', () => {
      const fixture = create();
      setViaDom(fixture, 'entry', '1,234,56');
      expect(fixture.componentInstance.entry()).toBeNaN();
    });

    it('a lone "-" typed into Entrada lands in the honest state', () => {
      const fixture = create();
      setViaDom(fixture, 'entry', '-');
      expect(fixture.componentInstance.entry()).toBeNaN();
    });

    // Mid-typing cases — must keep working or F3 breaks F1 (typing a decimal
    // left to right stalls if "1." or "1," parses to NaN mid-keystroke).
    it('a lone "1." typed into Entrada parses to 1 (mid-typing, do not break F1)', () => {
      const fixture = create();
      setViaDom(fixture, 'entry', '1.');
      expect(fixture.componentInstance.entry()).toBe(1);
    });

    it('a lone "1," typed into Entrada parses to 1 (comma variant of mid-typing)', () => {
      const fixture = create();
      setViaDom(fixture, 'entry', '1,');
      expect(fixture.componentInstance.entry()).toBe(1);
    });

    it('1e5 typed into Entrada still parses to 100000', () => {
      const fixture = create();
      setViaDom(fixture, 'entry', '1e5');
      expect(fixture.componentInstance.entry()).toBe(100000);
    });

    it('-1 typed into Stop Loss still parses to a finite -1 (L6 depends on this)', () => {
      const fixture = create();
      setViaDom(fixture, 'sl', '-1');
      expect(fixture.componentInstance.sl()).toBe(-1);
    });
  });

  // ---- L8 — the `ui-dropdown` branch (`@if (assetOptions().length)`) is
  // never rendered by the suite above (every test overrides `selectAssets`
  // to `[]`). This is a coverage gap, not a defect: exercise it against two
  // assets and confirm picking a symbol re-sizes through `contractSizeFor`
  // (the auditor's probe: with the prefilled defaults still in place —
  // balance 5000, riskPct 1%, entry 40000, SL 39950 — picking XAUUSD flips
  // contractSize from 1 (US30 falls through to the default) to 100, which
  // re-sizes `lotsForRisk` down to its 0.01 floor).
  it('L8 — renders the ui-dropdown when assets exist, and picking one re-sizes through contractSizeFor', () => {
    TestBed.configureTestingModule({
      providers: [provideMockStore()],
    });
    store = TestBed.inject(MockStore);
    store.overrideSelector(selectAssets, [
      { symbol: 'XAUUSD', lastModified: 1 },
      { symbol: 'US30', lastModified: 1 },
    ]);
    store.refreshState();
    const fixture = TestBed.createComponent(CalculadoraPageComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const dropdown = el.querySelector('ui-dropdown');
    expect(dropdown).not.toBeNull();

    fixture.componentInstance.onAssetPick('XAUUSD');
    fixture.detectChanges();
    expect(fixture.componentInstance.contractSize()).toBe(contractSizeFor('XAUUSD'));
    expect(fixture.componentInstance.contractSize()).toBe(100);
    expect(el.querySelector('.lots-value')?.textContent?.trim()).toBe('0.01');
  });
});
