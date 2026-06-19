/* eslint-disable @angular-eslint/prefer-inject -- constructor inject()-defaults keep this service unit-testable via direct construction (new Service(deps)) without TestBed; see services design note. */
import { inject, Injectable } from '@angular/core';
import type { DatasetRecord } from '../../services/market-data-db';
import { WorkspaceDbService } from '../../services/workspace-db.service';
import { ManifestService } from '../../services/market-data/manifest.service';
import { datasetTotalBytes, updatedDatasetIds } from './storage-manager.logic';

/**
 * Ongoing dataset management (Storage Manager, Task 7). Reads the `datasets`
 * cache, reports usage, detects updates against the live R2 manifest, and frees
 * space by deleting a dataset's metadata AND its candle rows. The wizard
 * (Task 6) owns first-time downloads; this owns the lifecycle afterwards.
 */
@Injectable({ providedIn: 'root' })
export class StorageManagerService {
  // Constructor injection (with inject() defaults) so the service unit-tests by
  // direct construction — `new StorageManagerService(db, manifests)` — without
  // an Angular injection context / TestBed.
  constructor(
    private readonly db: WorkspaceDbService = inject(WorkspaceDbService),
    private readonly manifests: ManifestService = inject(ManifestService),
  ) {}

  /** All cached datasets (sorted by id by the db layer). */
  listDatasets(): Promise<DatasetRecord[]> {
    return this.db.listDatasets();
  }

  /** Total bytes the given datasets occupy. */
  totalBytes(datasets: DatasetRecord[]): number {
    return datasetTotalBytes(datasets);
  }

  /**
   * Fetches the current manifest and returns the ids of datasets with a newer
   * etag upstream (an update is available). Throws if the manifest can't be
   * fetched (e.g. `marketDataBaseUrl` unset) — the caller surfaces it.
   */
  async checkForUpdates(datasets: DatasetRecord[]): Promise<Set<string>> {
    const manifest = await this.manifests.fetchManifest();
    return updatedDatasetIds(datasets, manifest);
  }

  /**
   * Removes a dataset entirely: its `datasets` row AND every candle of that
   * (symbol, timeframe) in the `candles` store, reclaiming the space.
   */
  async deleteDataset(dataset: DatasetRecord): Promise<void> {
    await this.db.deleteDataset(dataset.id);
    await this.db.clearDatasetCandles(dataset.symbol, dataset.timeframe);
  }
}
