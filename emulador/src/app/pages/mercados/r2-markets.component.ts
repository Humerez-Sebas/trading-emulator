import { Component, computed, inject, signal } from '@angular/core';
import { DatasetRecord } from '../../services/market-data-db';
import { ButtonDirective } from '../../components/ui/button.directive';
import { BadgeDirective } from '../../components/ui/badge.directive';
import { EmptyStateComponent } from '../../components/ui/empty-state.component';
import { DialogService } from '../../components/ui/dialog.service';
import { ManifestService, Manifest } from '../../services/market-data/manifest.service';
import {
  DataOnboardingService,
  OnboardingJob,
  OnboardingProgress,
} from '../../services/market-data/data-onboarding.service';
import { StorageManagerService } from '../storage-manager/storage-manager.service';
import { formatBytes } from '../storage-manager/storage-manager.logic';
import { AssetCatalogEntry, buildCatalog } from './r2-catalog.logic';
import { buildMissingJobs, hasPendingPartitions, partitionToJob } from './r2-jobs.logic';

type State = 'loading' | 'ok' | 'error';

/** Uppercase form of a manifest tf, matching `DatasetRecord.timeframe`. */
function toUpperTf(tf: 'm1' | 'h1' | 'd1'): string {
  return tf.toUpperCase();
}

/**
 * Markets R2 data hub (Task 5) — the single place to manage R2/Parquet data.
 *
 * Absorbs the former Data Wizard (download) and Storage Manager (delete/usage):
 * on init it fetches the manifest + downloaded datasets and renders
 * {@link buildCatalog} as one card per symbol, each partition showing its
 * downloaded / available / "actualización disponible" status. The user can
 * download a missing partition (or everything pending for a symbol) and delete
 * a downloaded one. It manages data ONLY — starting a session lives in New
 * Session, so no `switchAsset` is dispatched here.
 *
 * Rendered exclusively when `environment.dataSource === 'r2'`; the csv/backend
 * Markets branch is untouched (gated in the parent template).
 */
@Component({
  selector: 'app-r2-markets',
  standalone: true,
  imports: [ButtonDirective, BadgeDirective, EmptyStateComponent],
  templateUrl: './r2-markets.component.html',
  styleUrl: './r2-markets.component.css',
})
export class R2MarketsComponent {
  private manifestService = inject(ManifestService);
  private onboarding = inject(DataOnboardingService);
  private storage = inject(StorageManagerService);
  private dialog = inject(DialogService);

  state = signal<State>('loading');
  errorMsg = signal('');

  private manifest = signal<Manifest | null>(null);
  private datasets = signal<DatasetRecord[]>([]);
  query = signal('');

  /** The per-symbol catalog (manifest ∩ local), filtered by the search box. */
  catalog = computed<AssetCatalogEntry[]>(() => {
    const m = this.manifest();
    if (!m) return [];
    const all = buildCatalog(m, this.datasets());
    const q = this.query().trim().toLowerCase();
    return q ? all.filter((e) => e.symbol.toLowerCase().includes(q)) : all;
  });

  /** Number of downloaded datasets (drives the usage line visibility). */
  datasetCount = computed(() => this.datasets().length);

  /** Total bytes occupied by all downloaded datasets, human-readable. */
  totalLabel = computed(() => formatBytes(this.storage.totalBytes(this.datasets())));

  /** Symbol currently downloading (disables its actions), or null. */
  busySymbol = signal<string | null>(null);
  /** Id of the dataset currently being deleted, or null. */
  deletingId = signal<string | null>(null);
  progress = signal<OnboardingProgress | null>(null);

  progressPct = computed(() => {
    const p = this.progress();
    if (!p || !p.total) return 0;
    return Math.min(100, Math.round((p.index / p.total) * 100));
  });

  readonly hasPending = hasPendingPartitions;

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.state.set('loading');
    this.errorMsg.set('');
    try {
      const [manifest, datasets] = await Promise.all([
        this.manifestService.fetchManifest(),
        this.storage.listDatasets(),
      ]);
      this.manifest.set(manifest);
      this.datasets.set(datasets);
      this.state.set('ok');
    } catch (e) {
      this.errorMsg.set((e as Error).message);
      this.state.set('error');
    }
  }

  onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  /** Count of downloaded partitions for a symbol (card summary line). */
  downloadedCount(entry: AssetCatalogEntry): number {
    return entry.partitions.filter((p) => p.downloaded).length;
  }

  /** Human label for a partition: a year (m1) or "Todo" (h1/d1). */
  partitionLabel(p: AssetCatalogEntry['partitions'][number]): string {
    return p.tf === 'm1' ? p.partition : 'Todo';
  }

  /** Download every missing/stale partition for a symbol. */
  async downloadAll(entry: AssetCatalogEntry): Promise<void> {
    await this.runJobs(entry.symbol, buildMissingJobs(entry));
  }

  /** Download (or refresh) a single partition. */
  async downloadPartition(
    symbol: string,
    p: AssetCatalogEntry['partitions'][number],
  ): Promise<void> {
    await this.runJobs(symbol, [partitionToJob(symbol, p)]);
  }

  /** Runs a batch of jobs with progress, then refreshes the catalog. */
  private async runJobs(symbol: string, jobs: OnboardingJob[]): Promise<void> {
    const manifest = this.manifest();
    if (!manifest || !jobs.length || this.busySymbol()) return;
    this.busySymbol.set(symbol);
    this.errorMsg.set('');
    this.progress.set(null);
    try {
      await this.onboarding.runJobs(manifest, jobs, (p) => this.progress.set(p));
      this.datasets.set(await this.storage.listDatasets());
    } catch (e) {
      this.errorMsg.set((e as Error).message || 'La descarga falló. Vuelve a intentarlo.');
    }
    this.busySymbol.set(null);
    this.progress.set(null);
  }

  /** Delete a downloaded partition (its row + candles) behind a confirm. */
  async deletePartition(symbol: string, p: AssetCatalogEntry['partitions'][number]): Promise<void> {
    const id = `${symbol}|${toUpperTf(p.tf)}|${p.partition}`;
    const record = this.datasets().find((d) => d.id === id);
    if (!record || this.deletingId()) return;

    const ok = await this.dialog.confirm({
      title: 'Eliminar datos descargados',
      message: `Se borrarán los datos de ${symbol} ${record.timeframe} (${this.partitionLabel(p)}) de este navegador. ¿Continuar?`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;

    this.deletingId.set(id);
    this.errorMsg.set('');
    try {
      await this.storage.deleteDataset(record);
      this.datasets.set(await this.storage.listDatasets());
    } catch (e) {
      this.errorMsg.set((e as Error).message);
    }
    this.deletingId.set(null);
  }
}
