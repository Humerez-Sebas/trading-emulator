import { Component, computed, inject } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Store } from '@ngrx/store';
import { Timeframe, symbolFromFileName } from '../../models';
import { CsvLoaderService } from '../../services/csv-loader.service';
import { MarketActions } from '../../state/market/market.actions';
import { ReplayActions } from '../../state/replay/replay.actions';
import { TradingActions } from '../../state/trading/trading.actions';
import { isSessionCsv, parseSessionCsv } from '../../state/trading/session-csv';
import { PendingCsv, WorkspacesActions } from '../../state/workspaces/workspaces.actions';
import {
  selectActiveTf,
  selectAssets,
  selectCurrentAsset,
  selectCurrentTime,
  selectFloatingPnl,
  selectMsPerCandle,
  selectPlaying,
  selectProgress,
  selectSessionTfs,
  selectTfLastTimes,
  selectUtcOffset,
} from '../../state/selectors';
import { TooltipDirective } from '../ui/tooltip.directive';
import { DropdownComponent, DropdownOption } from '../ui/dropdown.component';

@Component({
  selector: 'app-controls',
  standalone: true,
  imports: [DatePipe, DecimalPipe, TooltipDirective, DropdownComponent],
  templateUrl: './controls.component.html',
  styleUrl: './controls.component.css',
})
export class ControlsComponent {
  private store = inject(Store);
  private csvLoader = inject(CsvLoaderService);

  tfs = this.store.selectSignal(selectSessionTfs);
  private tfLastTimes = this.store.selectSignal(selectTfLastTimes);
  activeTf = this.store.selectSignal(selectActiveTf);
  assets = this.store.selectSignal(selectAssets);
  currentAsset = this.store.selectSignal(selectCurrentAsset);
  playing = this.store.selectSignal(selectPlaying);
  msPerCandle = this.store.selectSignal(selectMsPerCandle);
  progress = this.store.selectSignal(selectProgress);
  utcOffset = this.store.selectSignal(selectUtcOffset);
  floatingPnl = this.store.selectSignal(selectFloatingPnl);

  private currentTime = this.store.selectSignal(selectCurrentTime);

  /** Clock in the chosen time zone (the data stays in UTC). */
  clockMs = computed(() => {
    const t = this.currentTime();
    return t > 0 ? (t + this.utcOffset() * 3600) * 1000 : null;
  });

  error = '';
  info = '';

  readonly speeds = [
    { ms: 1000, label: '1 vela/s' },
    { ms: 500, label: '2 velas/s' },
    { ms: 250, label: '4 velas/s' },
    { ms: 100, label: '10 velas/s' },
  ];

  readonly speedOptions: DropdownOption[] = this.speeds.map((s) => ({
    value: String(s.ms),
    label: s.label,
  }));
  assetOptions = computed<DropdownOption[]>(() =>
    this.assets().map((a) => ({ value: a.symbol, label: a.symbol })),
  );

  async onFiles(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    this.error = '';
    this.info = '';
    // group parsed files per asset symbol (derived from the file name)
    const bySymbol = new Map<string, PendingCsv[]>();
    for (const file of Array.from(input.files)) {
      try {
        const text = await file.text();
        // exported backtesting sessions share the button with candle CSVs
        if (isSessionCsv(text)) {
          this.importSession(text, file.name);
          continue;
        }
        const { tf, candles, fileName } = this.csvLoader.parseText(text, file.name);
        const symbol = symbolFromFileName(fileName);
        const list = bySymbol.get(symbol) ?? [];
        list.push({ tf, candles, fileName });
        bySymbol.set(symbol, list);
      } catch (e) {
        this.error = (e as Error).message;
      }
    }
    const current = this.currentAsset();
    for (const [symbol, files] of bySymbol) {
      if (symbol === current) {
        // same asset: merge directly into the active workspace
        for (const f of files) this.store.dispatch(MarketActions.csvLoaded(f));
      } else {
        // other asset: snapshot the current one and switch (or create)
        this.store.dispatch(WorkspacesActions.switchAsset({ symbol, thenLoad: files }));
      }
    }
    input.value = '';
  }

  /**
   * Imports a session CSV (the file exported from the summary). The active
   * session of the target workspace is archived automatically, never lost.
   */
  private importSession(text: string, fileName: string): void {
    const trades = parseSessionCsv(text);
    if (!trades.length) {
      this.error = `${fileName}: sin trades reconocibles (¿es un CSV de sesión del emulador?)`;
      return;
    }
    const symbol = symbolFromFileName(fileName);
    if (symbol === this.currentAsset()) {
      this.store.dispatch(
        TradingActions.sessionImported({ trades, currentCursor: this.currentTime() }),
      );
      const lastClose = trades.reduce((max, t) => Math.max(max, t.closeTime), 0);
      if (lastClose > 0) this.store.dispatch(ReplayActions.goToTime({ time: lastClose }));
    } else {
      // e.g. "us30_sesion.csv" -> US30: switch (or create) that workspace
      this.store.dispatch(WorkspacesActions.switchAsset({ symbol, thenImport: { trades } }));
    }
    this.info =
      `Sesión importada en ${symbol} (${trades.length} trades). ` +
      `El avance previo, si lo había, quedó guardado en "Sesiones".`;
  }

  onAsset(symbol: string): void {
    if (symbol && symbol !== this.currentAsset()) {
      this.store.dispatch(WorkspacesActions.switchAsset({ symbol }));
    }
  }

  setTf(tf: Timeframe): void {
    this.store.dispatch(MarketActions.changeTimeframe({ tf }));
  }

  /** True when this TF was harvested with less coverage than the replay cursor
   * (its data ends before "now"), so switching to it would jump back in time. */
  isShortTf(tf: Timeframe): boolean {
    const last = this.tfLastTimes()[tf];
    const t = this.currentTime();
    return last !== undefined && t > 0 && last < t;
  }

  /** Tooltip for a short-coverage TF: the last date it has data for. */
  shortTfTip(tf: Timeframe): string {
    const last = this.tfLastTimes()[tf];
    if (last === undefined) return '';
    const d = new Date((last + this.utcOffset() * 3600) * 1000);
    const when = d.toLocaleDateString('es', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
    return `Solo hay datos hasta ${when} en esta temporalidad`;
  }

  step(): void {
    this.store.dispatch(ReplayActions.advanceCandle());
  }

  stepBack(): void {
    this.store.dispatch(ReplayActions.stepBack());
  }

  play(): void {
    this.store.dispatch(ReplayActions.play());
  }

  pause(): void {
    this.store.dispatch(ReplayActions.pause());
  }

  setSpeed(value: string): void {
    this.store.dispatch(ReplayActions.changeSpeed({ msPerCandle: +value }));
  }
}
