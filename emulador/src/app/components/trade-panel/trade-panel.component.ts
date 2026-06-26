import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Store } from '@ngrx/store';
import { ReplayActions } from '../../state/replay/replay.actions';
import { TradingActions } from '../../state/trading/trading.actions';
import { lotsForRisk, OrderSide, OrderType } from '../../state/trading/trading.models';
import { selectTradePanelView } from '../../state/selectors';
import { TrashIconComponent } from '../icons/trash-icon.component';
import { ButtonDirective } from '../ui/button.directive';
import { IconButtonDirective } from '../ui/icon-button.directive';
import { TooltipDirective } from '../ui/tooltip.directive';
import { DropdownComponent, DropdownOption } from '../ui/dropdown.component';
import { EmptyStateComponent } from '../ui/empty-state.component';

/**
 * Manual order entry panel: side, type, entry/SL/TP prices, % risk with
 * auto-sized lots, plus the lists of open positions and pending orders.
 */
@Component({
  selector: 'app-trade-panel',
  standalone: true,
  imports: [
    DecimalPipe,
    TrashIconComponent,
    ButtonDirective,
    IconButtonDirective,
    TooltipDirective,
    DropdownComponent,
    EmptyStateComponent,
  ],
  templateUrl: './trade-panel.component.html',
  styleUrl: './trade-panel.component.css',
})
export class TradePanelComponent {
  private store = inject(Store);

  view = this.store.selectSignal(selectTradePanelView);

  // --- order form state ---
  side = signal<OrderSide>('buy');
  orderType = signal<OrderType>('market');
  entryText = signal('');
  slText = signal('');
  tpText = signal('');
  /** Mirrors the workspace's risk %; editable locally, synced to the store. */
  riskText = linkedSignal(() => String(this.view().riskPct));

  /** Reference price for sizing: typed entry for pendings, market otherwise. */
  entryRef = computed(() => {
    if (this.orderType() === 'market') return this.view().price;
    const v = parseFloat(this.entryText());
    return isFinite(v) && v > 0 ? v : null;
  });

  sl = computed(() => {
    const v = parseFloat(this.slText());
    return isFinite(v) && v > 0 ? v : null;
  });

  tp = computed(() => {
    const v = parseFloat(this.tpText());
    return isFinite(v) && v > 0 ? v : null;
  });

  riskPct = computed(() => {
    const v = parseFloat(this.riskText());
    return isFinite(v) && v > 0 ? v : null;
  });

  lots = computed(() => {
    const entry = this.entryRef();
    const sl = this.sl();
    const risk = this.riskPct();
    if (entry === null || sl === null || risk === null) return 0;
    return lotsForRisk(this.view().balance, risk, entry, sl, this.view().contractSize);
  });

  riskUsd = computed(() => {
    const entry = this.entryRef();
    const sl = this.sl();
    if (entry === null || sl === null) return 0;
    return Math.abs(entry - sl) * this.lots() * this.view().contractSize;
  });

  slPoints = computed(() => {
    const entry = this.entryRef();
    const sl = this.sl();
    const pt = this.view().pointSize;
    if (entry === null || sl === null || !pt) return 0;
    return Math.round(Math.abs(entry - sl) / pt);
  });

  /** Validation message (Spanish, user-facing); null = the order is valid. */
  invalidReason = computed<string | null>(() => {
    const v = this.view();
    if (v.price === null) return 'Carga datos y avanza el replay';
    const entry = this.entryRef();
    if (entry === null) return 'Falta el precio de entrada';
    const sl = this.sl();
    if (sl === null) return 'Falta el stop loss';
    if (this.riskPct() === null) return 'Riesgo inválido';
    const buy = this.side() === 'buy';
    if (buy && sl >= entry) return 'El SL de una compra va debajo de la entrada';
    if (!buy && sl <= entry) return 'El SL de una venta va encima de la entrada';
    const tp = this.tp();
    if (this.tpText().trim() && tp === null) return 'TP inválido';
    if (tp !== null && buy && tp <= entry) return 'El TP de una compra va encima de la entrada';
    if (tp !== null && !buy && tp >= entry) return 'El TP de una venta va debajo de la entrada';
    const type = this.orderType();
    if (type === 'limit' && buy && entry >= v.price) return 'Un buy limit va debajo del precio';
    if (type === 'limit' && !buy && entry <= v.price) return 'Un sell limit va encima del precio';
    if (type === 'stop' && buy && entry <= v.price) return 'Un buy stop va encima del precio';
    if (type === 'stop' && !buy && entry >= v.price) return 'Un sell stop va debajo del precio';
    if (this.lots() <= 0) return 'Lotaje resultante inválido';
    return null;
  });

  readonly typeOptions: DropdownOption[] = [
    { value: 'market', label: 'Mercado' },
    { value: 'limit', label: 'Limit' },
    { value: 'stop', label: 'Stop' },
  ];

  setSide(side: OrderSide): void {
    this.side.set(side);
  }

  setType(value: string): void {
    const type = value as OrderType;
    this.orderType.set(type);
    // pre-fill the entry with the current price as a starting point
    if (type !== 'market' && !this.entryText() && this.view().price !== null) {
      this.entryText.set(String(this.view().price));
    }
  }

  onInput(field: 'entry' | 'sl' | 'tp' | 'risk', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (field === 'entry') this.entryText.set(value);
    else if (field === 'sl') this.slText.set(value);
    else if (field === 'tp') this.tpText.set(value);
    else {
      this.riskText.set(value);
      // share the risk % with the chart's context-menu flow (persisted)
      const riskPct = parseFloat(value);
      if (isFinite(riskPct) && riskPct > 0) {
        this.store.dispatch(TradingActions.setRiskPct({ riskPct }));
      }
    }
  }

  submit(): void {
    if (this.invalidReason() !== null) return;
    const v = this.view();
    const common = {
      side: this.side(),
      sl: this.sl()!,
      tp: this.tp(),
      riskPct: this.riskPct()!,
      time: v.time,
      contractSize: v.contractSize,
    };
    if (this.orderType() === 'market') {
      this.store.dispatch(TradingActions.openMarket({ ...common, price: v.price! }));
    } else {
      this.store.dispatch(
        TradingActions.placeOrder({
          ...common,
          orderType: this.orderType() as 'limit' | 'stop',
          entryPrice: this.entryRef()!,
        }),
      );
    }
    this.slText.set('');
    this.tpText.set('');
    this.entryText.set('');
  }

  closePosition(id: string): void {
    const v = this.view();
    if (v.price === null) return;
    this.store.dispatch(
      TradingActions.closePosition({
        id,
        price: v.price,
        time: v.time,
        contractSize: v.contractSize,
      }),
    );
  }

  cancelOrder(id: string): void {
    this.store.dispatch(TradingActions.cancelOrder({ id }));
  }

  /** Inline SL/TP editing of an open position (TP empty = remove it). */
  onPositionField(id: string, field: 'sl' | 'tp', event: Event): void {
    const raw = (event.target as HTMLInputElement).value.trim();
    if (field === 'tp') {
      const tp = raw === '' ? null : parseFloat(raw);
      if (tp === null || (isFinite(tp) && tp > 0)) {
        this.store.dispatch(TradingActions.modifyPosition({ id, tp }));
      }
      return;
    }
    const sl = parseFloat(raw);
    if (isFinite(sl) && sl > 0) {
      this.store.dispatch(TradingActions.modifyPosition({ id, sl }));
    }
  }

  /**
   * Inline entry/SL/TP editing of a pending order. Entry/SL changes re-size
   * the lots in the reducer (risk % constant), so the contract size travels
   * with the action.
   */
  onOrderField(id: string, field: 'entryPrice' | 'sl' | 'tp', event: Event): void {
    const raw = (event.target as HTMLInputElement).value.trim();
    const contractSize = this.view().contractSize;
    if (field === 'tp') {
      const tp = raw === '' ? null : parseFloat(raw);
      if (tp === null || (isFinite(tp) && tp > 0)) {
        this.store.dispatch(TradingActions.modifyOrder({ id, tp, contractSize }));
      }
      return;
    }
    const value = parseFloat(raw);
    if (isFinite(value) && value > 0) {
      this.store.dispatch(TradingActions.modifyOrder({ id, [field]: value, contractSize }));
    }
  }

  /** Moves the SL to the entry price (breakeven). */
  breakeven(id: string, entryPrice: number): void {
    this.store.dispatch(TradingActions.modifyPosition({ id, sl: entryPrice }));
  }

  onBalance(event: Event): void {
    const balance = parseFloat((event.target as HTMLInputElement).value);
    if (isFinite(balance) && balance > 0) {
      this.store.dispatch(TradingActions.setInitialBalance({ balance }));
    }
  }

  endSession(): void {
    const v = this.view();
    if (v.price === null) return;
    this.store.dispatch(ReplayActions.pause());
    this.store.dispatch(
      TradingActions.endSession({ price: v.price, time: v.time, contractSize: v.contractSize }),
    );
  }

  openSummary(): void {
    this.store.dispatch(TradingActions.openSummary());
  }

  sideLabel(side: OrderSide): string {
    return side === 'buy' ? 'Compra' : 'Venta';
  }

  typeLabel(type: OrderType): string {
    return type === 'market' ? 'Mercado' : type === 'limit' ? 'Limit' : 'Stop';
  }
}
