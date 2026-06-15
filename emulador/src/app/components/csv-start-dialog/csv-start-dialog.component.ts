import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Actions, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { auditTime } from 'rxjs/operators';
import { MarketActions } from '../../state/market/market.actions';
import { ReplayActions } from '../../state/replay/replay.actions';
import { TradingActions } from '../../state/trading/trading.actions';
import { selectCurrentTime, selectDataRange } from '../../state/selectors';
import { ModalComponent } from '../ui/modal.component';
import { ButtonDirective } from '../ui/button.directive';
import { DatePickerComponent } from '../ui/date-picker.component';

/**
 * Mini date dialog for MANUAL CSV loads (wizard step-2 convergence): when a
 * CSV lands in a workspace whose replay cursor was never positioned
 * (currentTime === 0), ask for a start date (default ~70% into the dataset)
 * and an optional scheduled end. Workspaces that already have a cursor keep
 * the old behavior (no dialog). The check runs one tick AFTER csvLoaded so
 * the wizard flow — which dispatches goToTime right after its CSVs — never
 * triggers it. Fully offline: everything derives from the loaded dataset.
 */
@Component({
  selector: 'app-csv-start-dialog',
  standalone: true,
  imports: [ModalComponent, ButtonDirective, DatePickerComponent],
  templateUrl: './csv-start-dialog.component.html',
  styleUrl: './csv-start-dialog.component.css',
})
export class CsvStartDialogComponent {
  private store = inject(Store);

  open = signal(false);
  startDate = signal('');
  endDate = signal('');

  private currentTime = this.store.selectSignal(selectCurrentTime);
  range = this.store.selectSignal(selectDataRange);

  startEpoch = computed(() => {
    const d = this.startDate();
    if (!d) return null;
    const t = Date.parse(`${d}T00:00:00Z`);
    return Number.isNaN(t) ? null : Math.floor(t / 1000);
  });

  startValid = computed(() => {
    const r = this.range();
    const t = this.startEpoch();
    if (!r || t === null) return false;
    return t >= r.from && t <= r.to;
  });

  /** Optional end, parsed at END of day so the chosen day plays in full. */
  endEpoch = computed(() => {
    const d = this.endDate();
    if (!d) return null;
    const t = Date.parse(`${d}T23:59:59Z`);
    return Number.isNaN(t) ? null : Math.floor(t / 1000);
  });

  endValid = computed(() => {
    if (!this.endDate()) return true;
    const r = this.range();
    const start = this.startEpoch();
    const end = this.endEpoch();
    if (!r || start === null || end === null) return false;
    return end > start && this.endDate() <= this.isoDate(r.to);
  });

  valid = computed(() => this.startValid() && this.endValid());

  constructor() {
    inject(Actions)
      .pipe(ofType(MarketActions.csvLoaded), auditTime(0), takeUntilDestroyed())
      .subscribe(() => this.maybeOpen());
  }

  /** Opens only for never-positioned workspaces (manual CSV loads). */
  private maybeOpen(): void {
    const r = this.range();
    if (this.currentTime() !== 0 || !r) return;
    const suggested = r.from + (r.to - r.from) * 0.7;
    this.startDate.set(this.isoDate(suggested));
    this.endDate.set('');
    this.open.set(true);
  }

  isoDate(epoch: number): string {
    return new Date(epoch * 1000).toISOString().slice(0, 10);
  }

  onStart(event: Event): void {
    this.startDate.set((event.target as HTMLInputElement).value);
  }

  onEnd(event: Event): void {
    this.endDate.set((event.target as HTMLInputElement).value);
  }

  confirm(): void {
    if (!this.valid()) return;
    const start = this.startEpoch()!;
    const end = this.endEpoch();
    this.open.set(false);
    this.store.dispatch(ReplayActions.goToTime({ time: start }));
    if (end !== null) {
      this.store.dispatch(TradingActions.setSessionEnd({ time: end }));
    }
  }

  /** Keeps the pre-V2.5 behavior: empty chart, advance manually with +1. */
  skip(): void {
    this.open.set(false);
  }
}
