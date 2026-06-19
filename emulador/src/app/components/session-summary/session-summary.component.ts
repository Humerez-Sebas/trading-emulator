import { Component, computed, inject } from '@angular/core';
import { DatePipe, DecimalPipe, PercentPipe } from '@angular/common';
import { Store } from '@ngrx/store';
import { TradingActions } from '../../state/trading/trading.actions';
import { tradingFeature } from '../../state/trading/trading.reducer';
import { buildSessionCsv } from '../../state/trading/session-csv';
import { ClosedTrade } from '../../state/trading/trading.models';
import { drawingsFeature } from '../../state/drawings/drawings.reducer';
import { marketFeature } from '../../state/market/market.reducer';
import {
  selectCurrentAsset,
  selectDataRange,
  selectCurrentTime,
  selectLoadedTfs,
  selectMsPerCandle,
  selectSessionStats,
  selectTradingData,
} from '../../state/selectors';
import {
  AnchorTf,
  SessionService,
  snapshotFromState,
  yearsInRange,
} from '../../services/session.service';
import { TrashIconComponent } from '../icons/trash-icon.component';
import { DialogService } from '../ui/dialog.service';
import { ModalComponent } from '../ui/modal.component';
import { ButtonDirective } from '../ui/button.directive';

/** The only timeframes a session may reference (anchors). */
const ANCHOR_TFS: readonly AnchorTf[] = ['M1', 'H1', 'D1'];

/** End-of-session summary modal: metrics, equity sparkline, trade table. */
@Component({
  selector: 'app-session-summary',
  standalone: true,
  imports: [
    DatePipe,
    DecimalPipe,
    PercentPipe,
    TrashIconComponent,
    ModalComponent,
    ButtonDirective,
  ],
  templateUrl: './session-summary.component.html',
  styleUrl: './session-summary.component.css',
})
export class SessionSummaryComponent {
  private store = inject(Store);
  private dialogs = inject(DialogService);
  private sessionService = inject(SessionService);

  stats = this.store.selectSignal(selectSessionStats);
  history = this.store.selectSignal(tradingFeature.selectHistory);
  initialBalance = this.store.selectSignal(tradingFeature.selectInitialBalance);
  balance = this.store.selectSignal(tradingFeature.selectBalance);
  asset = this.store.selectSignal(selectCurrentAsset);

  // ---- .session.json export ----
  private dataRange = this.store.selectSignal(selectDataRange);
  private currentTime = this.store.selectSignal(selectCurrentTime);
  private activeTf = this.store.selectSignal(marketFeature.selectActiveTf);
  private customTf = this.store.selectSignal(marketFeature.selectCustomTf);
  private playbackSpeed = this.store.selectSignal(selectMsPerCandle);
  private tradingData = this.store.selectSignal(selectTradingData);
  private drawings = this.store.selectSignal(drawingsFeature.selectItems);
  private loadedTfs = this.store.selectSignal(selectLoadedTfs);

  /** History sorted by close time, as shown in the table. */
  trades = computed(() => [...this.history()].sort((a, b) => a.closeTime - b.closeTime));

  /** Equity curve as SVG polyline points in a 220x56 viewBox. */
  sparkline = computed(() => {
    const curve = this.stats().equityCurve;
    if (curve.length < 2) return '';
    const min = Math.min(...curve);
    const max = Math.max(...curve);
    const range = max - min || 1;
    const w = 220;
    const h = 56;
    const pad = 3;
    return curve
      .map((v, i) => {
        const x = pad + (i / (curve.length - 1)) * (w - pad * 2);
        const y = h - pad - ((v - min) / range) * (h - pad * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  });

  close(): void {
    this.store.dispatch(TradingActions.closeSummary());
  }

  exportCsv(): void {
    const csv = buildSessionCsv(this.history());
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // `<symbol>_sesion.csv`: symbolFromFileName() resolves it on re-import
    const symbol = (this.asset() ?? 'emulador').toLowerCase();
    a.download = `${symbol}_sesion.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Exports the active session as a `.session.json` (no candle data). */
  exportSession(): void {
    const range = this.dataRange();
    const snapshot = snapshotFromState({
      symbol: this.asset() ?? '',
      initialBalance: this.initialBalance(),
      startRangeSec: range?.from ?? 0,
      endRangeSec: range?.to ?? 0,
      replayTimeSec: this.currentTime(),
      activeTf: this.activeTf(),
      customTfMinutes: this.customTf(),
      playbackSpeed: this.playbackSpeed(),
      trades: this.tradingData().history,
      pendingOrders: this.tradingData().orders,
      drawings: this.drawings(),
      notes: [],
      anchorTimeframes: this.loadedTfs().filter((tf): tf is AnchorTf =>
        ANCHOR_TFS.includes(tf as AnchorTf),
      ),
      years: yearsInRange(range?.from ?? 0, range?.to ?? 0),
    });
    this.sessionService.exportSession(snapshot);
  }

  /** Shows/hides the trade's box on the chart (per-trade toggle). */
  toggleBox(t: ClosedTrade): void {
    this.store.dispatch(
      TradingActions.setTradeBoxHidden({ id: t.id, hidden: t.boxHidden !== true }),
    );
  }

  /** Deletes the trade's box from the chart (the row stays in the table). */
  async deleteBox(t: ClosedTrade): Promise<void> {
    const confirmed = await this.dialogs.confirm({
      title: 'Eliminar caja del trade',
      message: '¿Eliminar la caja de este trade del gráfico? No se puede deshacer.',
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!confirmed) return;
    this.store.dispatch(TradingActions.deleteTradeBox({ id: t.id }));
  }

  outcomeLabel(t: ClosedTrade): string {
    switch (t.outcome) {
      case 'tp':
        return 'TP';
      case 'sl':
        return 'SL';
      case 'manual':
        return 'Manual';
      case 'session-end':
        return 'Expirado';
    }
  }

  profitFactorLabel(): string {
    const pf = this.stats().profitFactor;
    return pf === Infinity ? '∞' : pf.toFixed(2);
  }
}
