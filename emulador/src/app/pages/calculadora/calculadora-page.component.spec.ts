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

  function setInputs(
    fixture: ReturnType<typeof create>,
    v: { balance: number; riskPct: number; symbol: string; entry: number; sl: number },
  ) {
    const c = fixture.componentInstance;
    c.balance.set(v.balance);
    c.riskPct.set(v.riskPct);
    c.symbol.set(v.symbol);
    c.entry.set(v.entry);
    c.sl.set(v.sl);
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
});
