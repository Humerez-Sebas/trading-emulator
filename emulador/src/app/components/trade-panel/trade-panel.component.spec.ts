import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TradePanelComponent } from './trade-panel.component';
import { ReplayActions } from '../../state/replay/replay.actions';
import { TradingActions } from '../../state/trading/trading.actions';
import { selectPlacementTime, selectTradePanelView } from '../../state/selectors';
import { lotsForRisk } from '@humerez-sebas/sizing-kernel';
import { closed, order, position } from '../../testing/fixtures';
import { Position } from '../../state/trading/trading.models';

/**
 * First spec for the order-entry panel (RFC-none — verification-integrity work).
 *
 * WHY THIS FILE EXISTS. `trade-panel.component.ts` is 283 lines of order entry —
 * the money-moving surface of the application — and had ZERO tests of any kind.
 * The two High-severity input defects this repo has shipped past a green suite
 * (the `/calculadora` bugs, and RFC-020 M-1) share one mechanism: the tests drove
 * component signals with `.set()` and never crossed the DOM, so an unbound input,
 * a wrong event name, or a control that is not rendered at all stayed invisible.
 *
 * So every test below goes through the REAL boundary, following the house
 * exemplar `src/app/lotaje/lotaje-view.spec.ts`:
 *   - the component is rendered with its REAL children (dropdown, risk slider,
 *     account card, empty state, tooltip/button directives — none are stubbed,
 *     because a stub cannot prove the template is wired to the real thing);
 *   - values arrive by `el.value = …; el.dispatchEvent(new Event('input'))` or
 *     `new Event('change')` — never by writing a signal;
 *   - clicks are real `HTMLElement.click()`;
 *   - the assertions are on what the user can observe (rendered text, disabled
 *     state, cleared fields) and on the store actions the panel dispatches,
 *     which are what actually move money.
 *
 * Sizing figures are never hand-derived: they are compared against the real
 * kernel function `lotsForRisk` from `@humerez-sebas/sizing-kernel`, called
 * with the same numbers, exactly as `calculadora-page.component.spec.ts` does.
 */

type TradePanelView = ReturnType<typeof selectTradePanelView.projector>;

/** A position as the selector emits it: the stored entity plus floating P/L. */
function openPosition(p: Partial<Position> = {}, pnl = 0): TradePanelView['positions'][number] {
  return { ...position(p), pnl };
}

/**
 * Baseline panel view: $10 000 balance, 1 % risk, price 4000 sitting on candle
 * 3600, US30-shaped contract/point size. Chosen so the sizing arithmetic is
 * exact — risk 1 % of 10 000 = $100, SL 10 points away, $100/point/lot ⇒ 0.10 lots.
 */
function panelView(overrides: Partial<TradePanelView> = {}): TradePanelView {
  return {
    balance: 10_000,
    initialBalance: 10_000,
    equity: 10_000,
    floating: 0,
    orders: [],
    positions: [],
    history: [],
    sessionEnded: false,
    summaryOpen: false,
    riskPct: 1,
    price: 4000,
    time: 3600,
    contractSize: 100,
    pointSize: 1,
    ...overrides,
  };
}

/**
 * Spying through a helper (rather than annotating with
 * `ReturnType<typeof vi.spyOn>`) keeps the ARGUMENT types of the spy, so
 * `dispatch.mock.calls[i][0]` is a typed action instead of an implicit `any`.
 */
function spyOnDispatch(target: MockStore) {
  return vi.spyOn(target, 'dispatch');
}

describe('TradePanelComponent (order entry, through the DOM)', () => {
  let store: MockStore;
  let dispatch: ReturnType<typeof spyOnDispatch>;
  let fixture: ComponentFixture<TradePanelComponent>;

  /**
   * `placementTime` defaults to 3540 while the view's cursor time is 3600, on
   * purpose: the two must NOT be interchangeable. Market orders keep cursor-time
   * semantics; pending orders are stamped at the reveal horizon (D14.B). A
   * regression that swaps one for the other is otherwise invisible.
   */
  function render(view: Partial<TradePanelView> = {}, placementTime = 3540) {
    store.overrideSelector(selectTradePanelView, panelView(view));
    store.overrideSelector(selectPlacementTime, placementTime);
    store.refreshState();
    fixture = TestBed.createComponent(TradePanelComponent);
    fixture.detectChanges();
    // Spy AFTER the first render so component construction cannot pollute the
    // call history; TestBed gives each test a fresh MockStore, so each test
    // gets a fresh spy with an empty history.
    dispatch = spyOnDispatch(store);
    return fixture;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TradePanelComponent],
      providers: [provideMockStore()],
    });
    store = TestBed.inject(MockStore);
  });

  // isolate:false discipline (docs/engineering/testing.md §"isolate:false discipline" #1):
  // forced selector results live on the module-level memoized selector, which
  // TestBed.resetTestingModule() does not undo — they must be released here or
  // they poison every later spec file in the same vitest worker.
  afterEach(() => store.resetSelectors());

  // ---- DOM helpers: the only way this file is allowed to talk to the component ----

  const el = () => fixture.nativeElement as HTMLElement;

  function q<T extends Element>(selector: string): T {
    const found = el().querySelector<T>(selector);
    if (!found) throw new Error(`missing element: ${selector}`);
    return found;
  }

  /** Types into a real `<input>` and fires the event the template listens for. */
  function type(selector: string, value: string, event: 'input' | 'change' = 'input') {
    const input = q<HTMLInputElement>(selector);
    input.value = value;
    input.dispatchEvent(new Event(event, { bubbles: true }));
    fixture.detectChanges();
  }

  function click(selector: string) {
    q<HTMLElement>(selector).click();
    fixture.detectChanges();
  }

  /** Clicks the first element matching `selector` whose text contains `text`. */
  function clickByText(selector: string, text: string) {
    const match = Array.from(el().querySelectorAll<HTMLElement>(selector)).find((node) =>
      node.textContent?.includes(text),
    );
    if (!match) throw new Error(`no ${selector} containing "${text}"`);
    match.click();
    fixture.detectChanges();
  }

  const ENTRY = '.order-form input[placeholder="Precio"]';
  const SL = '.order-form input[placeholder="Obligatorio"]';
  const TP = '.order-form input[placeholder="Opcional"]';
  const SUBMIT = 'button.submit';
  const HINT = '.order-form .hint';

  /** Picks an order type through the real dropdown (trigger click → option click). */
  function chooseType(label: string) {
    click('ui-dropdown .dd-trigger');
    clickByText('.dd-option', label);
  }

  // ---------------------------------------------------------------- sizing ----

  describe('lot sizing from DOM input', () => {
    it('sizes the lot from the stop loss typed into the SL field', () => {
      render();
      type(SL, '3990');

      const expected = lotsForRisk(10_000, 1, 4000, 3990, 100);
      expect(expected).toBeGreaterThan(0); // guards against asserting 0 === 0
      expect(q('.sizing strong').textContent?.trim()).toBe(expected.toFixed(2));
    });

    it('reports the money at risk and the stop distance in points', () => {
      render();
      type(SL, '3990');

      // |4000-3990| * 0.10 lots * 100 contract size = $100 = 1 % of the balance.
      expect(q('.sizing .row:nth-child(2)').textContent).toContain('100.00 $');
      expect(q('.sizing .row:nth-child(2)').textContent).toContain('10 pts');
    });

    it('re-sizes the lot when the risk slider is driven, and shares the new % with the store', () => {
      render();
      type(SL, '3990');
      type('app-risk-slider .numeric-input', '2');

      expect(dispatch).toHaveBeenCalledWith(TradingActions.setRiskPct({ riskPct: 2 }));
      expect(q('.sizing strong').textContent?.trim()).toBe(
        lotsForRisk(10_000, 2, 4000, 3990, 100).toFixed(2),
      );
    });

    it('drives the same path from the range slider', () => {
      render();
      type('app-risk-slider .native-slider', '3');

      expect(dispatch).toHaveBeenCalledWith(TradingActions.setRiskPct({ riskPct: 3 }));
    });

    it('caps the risk at the slider maximum instead of sizing an outsized lot', () => {
      render();
      type(SL, '3990');
      type('app-risk-slider .numeric-input', '99');

      expect(dispatch).toHaveBeenCalledWith(TradingActions.setRiskPct({ riskPct: 5 }));
      expect(q('.sizing strong').textContent?.trim()).toBe(
        lotsForRisk(10_000, 5, 4000, 3990, 100).toFixed(2),
      );
    });
  });

  // ------------------------------------------------------- market submission ----

  describe('market order submission', () => {
    it('dispatches openMarket with the SL from the DOM and the store price/time/contract size', () => {
      render();
      type(SL, '3990');
      type(TP, '4030');
      click(SUBMIT);

      expect(dispatch).toHaveBeenCalledWith(
        TradingActions.openMarket({
          side: 'buy',
          sl: 3990,
          tp: 4030,
          riskPct: 1,
          contractSize: 100,
          time: 3600, // cursor time — market orders are out of scope for D14.B
          price: 4000,
        }),
      );
    });

    it('submits with tp null when the take profit field is left empty', () => {
      render();
      type(SL, '3990');
      click(SUBMIT);

      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: TradingActions.openMarket.type, tp: null }),
      );
    });

    it('clears the entry/SL/TP fields after a successful submit', () => {
      render();
      type(SL, '3990');
      type(TP, '4030');
      click(SUBMIT);

      expect(q<HTMLInputElement>(SL).value).toBe('');
      expect(q<HTMLInputElement>(TP).value).toBe('');
    });

    it('sends the side chosen with the Vender toggle, not the default buy', () => {
      render();
      click('.side-toggle .side.sell');
      type(SL, '4010'); // valid for a sell: stop above the entry

      expect(q(SUBMIT).textContent).toContain('Abrir a mercado');
      click(SUBMIT);

      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: TradingActions.openMarket.type, side: 'sell', sl: 4010 }),
      );
    });
  });

  // ---------------------------------------------------------- invalid states ----

  describe('refuses to submit an unsound order', () => {
    it('requires a stop loss before the submit button is enabled', () => {
      render();

      expect(q(HINT).textContent).toContain('Falta el stop loss');
      expect(q<HTMLButtonElement>(SUBMIT).disabled).toBe(true);
      click(SUBMIT);
      expect(dispatch).not.toHaveBeenCalled();
    });

    it('rejects a non-positive stop loss instead of sizing off it', () => {
      render();
      type(SL, '0');

      expect(q(HINT).textContent).toContain('Falta el stop loss');
      expect(q<HTMLButtonElement>(SUBMIT).disabled).toBe(true);
    });

    it('refuses a buy whose stop sits above the entry (an instant loss)', () => {
      render();
      type(SL, '4010');

      expect(q(HINT).textContent).toContain('El SL de una compra va debajo de la entrada');
      expect(q<HTMLButtonElement>(SUBMIT).disabled).toBe(true);
      click(SUBMIT);
      expect(dispatch).not.toHaveBeenCalled();
    });

    it('refuses a sell whose stop sits below the entry', () => {
      render();
      click('.side-toggle .side.sell');
      type(SL, '3990');

      expect(q(HINT).textContent).toContain('El SL de una venta va encima de la entrada');
      expect(q<HTMLButtonElement>(SUBMIT).disabled).toBe(true);
    });

    it('refuses a buy take profit below the entry', () => {
      render();
      type(SL, '3990');
      type(TP, '3995');

      expect(q(HINT).textContent).toContain('El TP de una compra va encima de la entrada');
      expect(q<HTMLButtonElement>(SUBMIT).disabled).toBe(true);
      click(SUBMIT);
      expect(dispatch).not.toHaveBeenCalled();
    });

    it('tells the user to load data when there is no price yet, and blocks entry', () => {
      render({ price: null });

      expect(q(HINT).textContent).toContain('Carga datos y avanza el replay');
      expect(q<HTMLButtonElement>(SUBMIT).disabled).toBe(true);
    });
  });

  // ---------------------------------------------------------- pending orders ----

  describe('pending orders', () => {
    it('reveals an entry field prefilled with the current price when Limit is chosen', () => {
      render();
      expect(el().querySelector(ENTRY)).toBeNull(); // market: no entry field

      chooseType('Limit');

      expect(q<HTMLInputElement>(ENTRY).value).toBe('4000');
      expect(q(SUBMIT).textContent).toContain('Colocar orden');
    });

    it('stamps a placed order at the reveal horizon, not the raw cursor time (D14.B)', () => {
      render({}, 3540);
      chooseType('Limit');
      type(ENTRY, '3950');
      type(SL, '3940');
      click(SUBMIT);

      expect(dispatch).toHaveBeenCalledWith(
        TradingActions.placeOrder({
          side: 'buy',
          orderType: 'limit',
          entryPrice: 3950,
          sl: 3940,
          tp: null,
          riskPct: 1,
          contractSize: 100,
          time: 3540, // selectPlacementTime, NOT the view's time (3600)
        }),
      );
    });

    it('sizes a pending order off the typed entry, not the market price', () => {
      render();
      chooseType('Limit');
      type(ENTRY, '3950');
      type(SL, '3940');

      expect(q('.sizing strong').textContent?.trim()).toBe(
        lotsForRisk(10_000, 1, 3950, 3940, 100).toFixed(2),
      );
    });

    it('refuses a buy limit above the market price', () => {
      render();
      chooseType('Limit');
      type(ENTRY, '4050');
      type(SL, '4040');

      expect(q(HINT).textContent).toContain('Un buy limit va debajo del precio');
      expect(q<HTMLButtonElement>(SUBMIT).disabled).toBe(true);
    });

    it('refuses a buy stop below the market price', () => {
      render();
      chooseType('Stop');
      type(ENTRY, '3950');
      type(SL, '3940');

      expect(q(HINT).textContent).toContain('Un buy stop va encima del precio');
      expect(q<HTMLButtonElement>(SUBMIT).disabled).toBe(true);
    });
  });

  // --------------------------------------------------------- open positions ----

  describe('open positions', () => {
    const withPosition = {
      positions: [openPosition({ id: 'p1', side: 'buy', entryPrice: 4000, sl: 3990 }, 250)],
    };

    it('renders the position with its side, lots and floating P/L', () => {
      render(withPosition);

      const card = q('.trade-card');
      expect(card.querySelector('.card-badge')?.textContent?.trim()).toBe('COMPRA');
      expect(card.querySelector('.card-lots')?.textContent).toContain('0.10');
      expect(card.querySelector('.card-pnl')?.textContent).toContain('+250.00');
      expect(el().querySelector('ui-empty-state')).toBeNull();
    });

    it('closes the position at the store price and time', () => {
      render(withPosition);
      click('.trade-card .close-btn');

      expect(dispatch).toHaveBeenCalledWith(
        TradingActions.closePosition({ id: 'p1', price: 4000, time: 3600, contractSize: 100 }),
      );
    });

    it('moves the stop to the entry price on breakeven', () => {
      render(withPosition);
      click('.trade-card .be-btn');

      expect(dispatch).toHaveBeenCalledWith(TradingActions.modifyPosition({ id: 'p1', sl: 4000 }));
    });

    it('applies an inline stop edit', () => {
      render(withPosition);
      type('input[aria-label="Stop loss de la posición"]', '3995', 'change');

      expect(dispatch).toHaveBeenCalledWith(TradingActions.modifyPosition({ id: 'p1', sl: 3995 }));
    });

    it('removes the take profit when its field is cleared', () => {
      render(withPosition);
      type('input[aria-label="Take profit de la posición"]', '', 'change');

      expect(dispatch).toHaveBeenCalledWith(TradingActions.modifyPosition({ id: 'p1', tp: null }));
    });

    it('ignores a non-positive stop edit rather than dispatching a bad price', () => {
      render(withPosition);
      type('input[aria-label="Stop loss de la posición"]', '0', 'change');

      expect(dispatch).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------- pending cards ----

  describe('pending order cards', () => {
    const withOrder = {
      orders: [order({ id: 'o1', side: 'sell' as const, type: 'stop' as const, entryPrice: 3950 })],
    };

    it('labels the badge from the order type and side', () => {
      render(withOrder);

      expect(q('.trade-card.pending .card-badge').textContent?.trim()).toBe('STOP VENTA');
    });

    it('cancels the order', () => {
      render(withOrder);
      click('.trade-card.pending .close-btn');

      expect(dispatch).toHaveBeenCalledWith(TradingActions.cancelOrder({ id: 'o1' }));
    });

    it('carries the contract size when the entry is edited, so the reducer can re-size', () => {
      render(withOrder);
      type('input[aria-label="Precio de entrada de la orden"]', '3960', 'change');

      expect(dispatch).toHaveBeenCalledWith(
        TradingActions.modifyOrder({ id: 'o1', entryPrice: 3960, contractSize: 100 }),
      );
    });

    it('removes the order take profit when its field is cleared', () => {
      render(withOrder);
      type('input[aria-label="Take profit de la orden"]', '', 'change');

      expect(dispatch).toHaveBeenCalledWith(
        TradingActions.modifyOrder({ id: 'o1', tp: null, contractSize: 100 }),
      );
    });
  });

  // -------------------------------------------------------- session controls ----

  describe('session controls', () => {
    it('pauses the replay BEFORE closing everything at the last price', () => {
      render({ positions: [openPosition()] });
      clickByText('footer.foot button', 'Terminar sesión');

      // The whole call list, in order: pausing AFTER the close would settle the
      // open position at a price the replay had already moved past.
      expect(dispatch.mock.calls.map(([action]) => action)).toEqual([
        ReplayActions.pause(),
        TradingActions.endSession({ price: 4000, time: 3600, contractSize: 100 }),
      ]);
    });

    it('disables Terminar sesión while there is no price', () => {
      render({ price: null });

      const end = Array.from(el().querySelectorAll<HTMLButtonElement>('footer.foot button')).find(
        (b) => b.textContent?.includes('Terminar sesión'),
      );
      expect(end?.disabled).toBe(true);
    });

    it('offers the summary only once the session has history', () => {
      render();
      expect(el().querySelector('footer.foot')?.textContent).not.toContain('Resumen');

      render({ history: [closed({ id: 't1' })] });
      clickByText('footer.foot button', 'Resumen');
      expect(dispatch).toHaveBeenCalledWith(TradingActions.openSummary());
    });

    it('shows the empty state when there is nothing open', () => {
      render();

      expect(el().querySelector('ui-empty-state')).not.toBeNull();
      expect(el().textContent).toContain('No hay posiciones activas');
    });
  });

  // -------------------------------------------------------- initial balance ----

  describe('initial balance', () => {
    it('applies an edited initial balance', () => {
      render();
      type('.balance-edit input', '25000', 'change');

      expect(dispatch).toHaveBeenCalledWith(TradingActions.setInitialBalance({ balance: 25000 }));
    });

    it('ignores a non-positive balance', () => {
      render();
      type('.balance-edit input', '0', 'change');

      expect(dispatch).not.toHaveBeenCalled();
    });
  });
});
