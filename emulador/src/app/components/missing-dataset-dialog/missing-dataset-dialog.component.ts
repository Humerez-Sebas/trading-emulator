import { Component, computed, input, output } from '@angular/core';
import type { RequiredDataset } from '../../services/session.service';
import { ModalComponent } from '../ui/modal.component';
import { ButtonDirective } from '../ui/button.directive';
import { BadgeDirective } from '../ui/badge.directive';

/**
 * Presentational dialog shown when an imported `.session.json` references market
 * datasets that are NOT in the local cache (Task 9). Lists the missing
 * partitions (symbol / timeframe / year) and offers to download them from R2.
 *
 * Pure UI: the parent (`SesionesPageComponent`) owns the actual download
 * (`DataOnboardingService.runJobs`) and feeds back `downloading`/`progress`/
 * `error`. The component emits `download`/`cancel`; the host decides what to do.
 */
@Component({
  selector: 'app-missing-dataset-dialog',
  standalone: true,
  imports: [ModalComponent, ButtonDirective, BadgeDirective],
  templateUrl: './missing-dataset-dialog.component.html',
  styleUrl: './missing-dataset-dialog.component.css',
})
export class MissingDatasetDialogComponent {
  /** Missing dataset references to list. The dialog renders when non-empty. */
  datasets = input<RequiredDataset[]>([]);
  /** A download is in progress (disables the action, shows the bar). */
  downloading = input(false);
  /** 0..100 download progress, or null when not started. */
  progress = input<number | null>(null);
  /** A download error message to surface, or '' when none. */
  error = input('');

  download = output<void>();
  cancel = output<void>();

  /** Human label for one missing partition, e.g. "XAUUSD · M1 · 2024". */
  label = (d: RequiredDataset): string =>
    d.year !== undefined
      ? `${d.symbol} · ${d.timeframe} · ${d.year}`
      : `${d.symbol} · ${d.timeframe}`;

  /** Clamped percentage for the progress bar width. */
  pct = computed(() => Math.max(0, Math.min(100, this.progress() ?? 0)));
}
