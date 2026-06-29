import { Component, computed, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { Timeframe } from '../../models';
import { MarketActions } from '../../state/market/market.actions';
import { WorkspacesActions } from '../../state/workspaces/workspaces.actions';
import {
  selectActiveTf,
  selectAssets,
  selectCurrentAsset,
  selectCurrentTime,
  selectCustomTf,
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
  imports: [TooltipDirective, DropdownComponent],
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
  utcOffset = this.store.selectSignal(selectUtcOffset);

  private currentTime = this.store.selectSignal(selectCurrentTime);

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
}
