import { Component, computed, inject, signal } from '@angular/core';
import { DatasetRecord } from '../../services/market-data-db';
import { ButtonDirective } from '../../components/ui/button.directive';
import { BadgeDirective } from '../../components/ui/badge.directive';
import { EmptyStateComponent } from '../../components/ui/empty-state.component';
import { StorageManagerService } from './storage-manager.service';
import { formatBytes } from './storage-manager.logic';

/**
 * Storage Manager (Task 7) — ongoing dataset management for the R2/Parquet
 * source. Lists the downloaded datasets and their disk usage, checks the live
 * manifest for updates (etag diff), and deletes datasets to free IndexedDB
 * space. Distinct from the Data Wizard (Task 6), which is first-time onboarding.
 */
@Component({
  selector: 'app-storage-manager',
  standalone: true,
  imports: [ButtonDirective, BadgeDirective, EmptyStateComponent],
  templateUrl: './storage-manager-page.component.html',
  styleUrl: './storage-manager-page.component.css',
})
export class StorageManagerPageComponent {
  private svc = inject(StorageManagerService);

  datasets = signal<DatasetRecord[]>([]);
  updatedIds = signal<Set<string>>(new Set());
  loading = signal(true);
  checking = signal(false);
  error = signal('');
  /** Id of the dataset currently being deleted (disables its row). */
  busyId = signal<string | null>(null);

  totalLabel = computed(() => formatBytes(this.svc.totalBytes(this.datasets())));

  /** Exposed for the template's size column. */
  readonly fmt = formatBytes;

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    try {
      this.datasets.set(await this.svc.listDatasets());
    } catch (e) {
      this.error.set((e as Error).message);
    }
    this.loading.set(false);
  }

  async checkUpdates(): Promise<void> {
    this.checking.set(true);
    this.error.set('');
    try {
      this.updatedIds.set(await this.svc.checkForUpdates(this.datasets()));
    } catch (e) {
      this.error.set((e as Error).message);
    }
    this.checking.set(false);
  }

  hasUpdate(d: DatasetRecord): boolean {
    return this.updatedIds().has(d.id);
  }

  async remove(d: DatasetRecord): Promise<void> {
    this.busyId.set(d.id);
    this.error.set('');
    try {
      await this.svc.deleteDataset(d);
      await this.reload();
      const remaining = new Set(this.updatedIds());
      remaining.delete(d.id);
      this.updatedIds.set(remaining);
    } catch (e) {
      this.error.set((e as Error).message);
    }
    this.busyId.set(null);
  }
}
