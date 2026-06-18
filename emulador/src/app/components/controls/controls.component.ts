import { Component, computed, inject } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Store } from '@ngrx/store';
import { Timeframe } from '../../models';
import { MarketActions } from '../../state/market/market.actions';
import { ReplayActions } from '../../state/replay/replay.actions';
import { WorkspacesActions } from '../../state/workspaces/workspaces.actions';
import {
  selectActiveTf,
  selectAssets,
  selectCurrentAsset,
  selectCurrentTime,
  selectCustomTf,
  selectFloatingPnl,
  selectMsPerCandle,
  selectPlaying,
  selectProgress,
  selectSessionTfs,
  selectTfLastTimes,
  selectUtcOffset,
} from '../../state/selectors';
import { formatIntervalShort } from '../../state/market/custom-timeframe';
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

  tfs = this.store.selectSignal(selectSessionTfs);
  private tfLastTimes = this.store.selectSignal(selectTfLastTimes);
  activeTf = this.store.selectSignal(selectActiveTf);
  /** Active custom timeframe in minutes (null when a standard TF is shown). */
  customTf = this.store.selectSignal(selectCustomTf);
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

  onAsset(symbol: string): void {
    if (symbol && symbol !== this.currentAsset()) {
      this.store.dispatch(WorkspacesActions.switchAsset({ symbol }));
    }
  }

  setTf(tf: Timeframe): void {
    this.store.dispatch(MarketActions.changeTimeframe({ tf }));
  }

  /** Compact label for the active custom interval chip, e.g. "90m", "2h". */
  customChipLabel(): string {
    const m = this.customTf();
    return m !== null ? formatIntervalShort(m) : '';
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
