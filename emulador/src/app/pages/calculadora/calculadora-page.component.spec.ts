import { TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { CalculadoraPageComponent } from './calculadora-page.component';
import { selectAssets } from '../../state/selectors';

/**
 * Renders against DOM text (`fixture.nativeElement.textContent`), not
 * component internals — the claim under test is what the trader sees.
 * Every expected number below is a LITERAL, hand-computed constant: the
 * page's only source of a lot figure is `lotsForRisk` (composed inside the
 * component), never a copy of the formula here.
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

  // (a) acceptance case
  it('renders 1.00 lots, 50.00 risk and 50 puntos for the acceptance case (5000 / 1% / US30 40000->39950)', () => {
    const fixture = create();
    setInputs(fixture, { balance: 5000, riskPct: 1, symbol: 'US30', entry: 40000, sl: 39950 });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('1.00');
    expect(text).toContain('lotes');
    expect(text).toContain('50.00');
    expect(text).toContain('50 puntos');
  });

  // (b) SL = entry
  it('shows the dedicated SL-equals-entry message instead of "0.00 lotes"', () => {
    const fixture = create();
    setInputs(fixture, { balance: 5000, riskPct: 1, symbol: 'US30', entry: 40000, sl: 40000 });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('El SL coincide con la entrada');
    expect(text).not.toContain('0.00 lotes');
  });

  // (c) non-positive balance or risk
  it('shows its own message for a non-positive balance, not a lot figure', () => {
    const fixture = create();
    setInputs(fixture, { balance: 0, riskPct: 1, symbol: 'US30', entry: 40000, sl: 39950 });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('El SL coincide con la entrada');
    expect(text).not.toContain('0.00 lotes');
    expect(text.toLowerCase()).toContain('positivos');
  });

  it('shows its own message for a non-positive risk %, not a lot figure', () => {
    const fixture = create();
    setInputs(fixture, { balance: 5000, riskPct: 0, symbol: 'US30', entry: 40000, sl: 39950 });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('0.00 lotes');
    expect(text.toLowerCase()).toContain('positivos');
  });

  // (d) the 5x floor case WARNS
  it('shows the minimum-lot floor warning naming both figures (balance 100 / risk 0.1% / 40000->39950)', () => {
    const fixture = create();
    setInputs(fixture, { balance: 100, riskPct: 0.1, symbol: 'US30', entry: 40000, sl: 39950 });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('0.01');
    expect(text).toContain('$0.50');
    expect(text).toContain('$0.10');
  });

  // (e) the acceptance case does NOT warn — guard against an always-on warning
  it('does NOT show the floor warning for the acceptance case', () => {
    const fixture = create();
    setInputs(fixture, { balance: 5000, riskPct: 1, symbol: 'US30', entry: 40000, sl: 39950 });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('mínimo de 0.01 lotes');
  });

  // (f) applied contractSize appears on screen
  it('shows the applied contractSize on screen', () => {
    const fixture = create();
    setInputs(fixture, { balance: 5000, riskPct: 1, symbol: 'US30', entry: 40000, sl: 39950 });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('US30');
    expect(text).toContain('1 $/punto por lote');
  });
});
