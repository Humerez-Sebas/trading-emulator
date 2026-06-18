import { inject, Inject, Injectable, InjectionToken } from '@angular/core';
import { Timeframe } from '../../models';
import { DatasetRecord } from '../market-data-db';
import { WorkspaceDbService } from '../workspace-db.service';
import type { ManifestTf, Manifest } from './manifest.service';
import { ManifestService } from './manifest.service';
import { ParquetDownloadService } from './parquet-download.service';

/** One unit of onboarding work: a single (symbol, tf, year) partition. */
export interface OnboardingJob {
  symbol: string;
  /** Lowercase manifest timeframe key. */
  tf: ManifestTf;
  /** Year string for `m1`, or `'all'` for `h1`/`d1`. */
  year: string;
}

/** Outcome of processing one job. */
export type JobOutcome = 'ingested' | 'skipped';

/** Progress reported once per completed job during a batch run. */
export interface OnboardingProgress {
  /** 1-based index of the job just completed. */
  index: number;
  total: number;
  job: OnboardingJob;
  status: JobOutcome;
}

/** Message the Parquet worker posts back when finished. */
type WorkerResponse =
  | { type: 'progress'; inserted: number; total: number }
  | { type: 'done'; inserted: number }
  | { type: 'error'; message: string };

/** Minimal Worker surface used here (kept narrow so a fake satisfies it). */
interface IngestWorker {
  postMessage(message: { buffer: ArrayBuffer; symbol: string; timeframe: string }): void;
  terminate(): void;
  onmessage: ((ev: MessageEvent<WorkerResponse>) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

/** Factory that spawns a fresh Parquet ingestion worker. */
export type WorkerFactory = () => IngestWorker;

/** Maps a lowercase manifest tf key to the uppercase `Timeframe` the stores use. */
const TF_MAP: Record<ManifestTf, Timeframe> = { m1: 'M1', h1: 'H1', d1: 'D1' };

/** Spawns the real Parquet worker (kept out of unit tests / the main bundle). */
function spawnParquetWorker(): IngestWorker {
  return new Worker(new URL('../../workers/parquet.worker', import.meta.url), {
    type: 'module',
  }) as unknown as IngestWorker;
}

/**
 * DI token for the worker factory. A bare function type (`WorkerFactory`) is not
 * a valid Angular injection token (it has no runtime value — NG2003), so the
 * orchestrator depends on this token, defaulting to the real worker spawner.
 * Unit tests bypass DI and pass a fake factory positionally via `new`.
 */
export const PARQUET_WORKER_FACTORY = new InjectionToken<WorkerFactory>('PARQUET_WORKER_FACTORY', {
  providedIn: 'root',
  factory: () => spawnParquetWorker,
});

/**
 * Orchestrates the Data Wizard's download → ingest → record flow.
 *
 * For each partition it consults the `datasets` store: a matching etag means
 * the local copy is current and the partition is skipped (no needless
 * re-download). Otherwise it downloads the Parquet bytes, hands them to the
 * off-thread ingestion worker, awaits the worker's `done`, and records the
 * `DatasetRecord` so the next launch can skip it.
 *
 * Re-ingestion dedup: the `candles` store has auto-increment ids and a
 * non-unique index, so re-running an already-present partition would DUPLICATE
 * candles. When a dataset already exists with a *different* etag, its candles
 * are cleared before the new ones are inserted.
 *
 * All collaborators are injected so the orchestration unit-tests with a fake
 * worker, a mocked download service and a stubbed db — no browser, no network.
 */
@Injectable({ providedIn: 'root' })
export class DataOnboardingService {
  constructor(
    private readonly db: WorkspaceDbService = inject(WorkspaceDbService),
    private readonly downloads: ParquetDownloadService = inject(ParquetDownloadService),
    @Inject(PARQUET_WORKER_FACTORY) private readonly workerFactory: WorkerFactory = spawnParquetWorker,
    // The manifest helpers are pure lookups (no I/O, no baseUrl needed), so a
    // plain instance is the default — keeps `runJob` injection-context free for
    // unit tests that construct the service with `new`.
    private readonly manifests: ManifestService = new ManifestService(),
  ) {}

  /** The composite datasets-store id for a job. */
  static datasetId(symbol: string, timeframe: Timeframe, year: string): string {
    return `${symbol}|${timeframe}|${year}`;
  }

  /**
   * Processes one partition. Returns `'skipped'` when the local etag already
   * matches the manifest, otherwise `'ingested'` after a successful worker run.
   * Rejects if the partition is missing from the manifest or the worker errors.
   */
  async runJob(manifest: Manifest, job: OnboardingJob): Promise<JobOutcome> {
    const { symbol, tf, year } = job;
    const entry = this.manifests.getEntry(manifest, symbol, tf, year);
    if (!entry) {
      throw new Error(
        `DataOnboardingService: partición ausente del manifest (${symbol}/${tf}/${year}).`,
      );
    }
    const timeframe = TF_MAP[tf];
    const id = DataOnboardingService.datasetId(symbol, timeframe, year);

    // 1) etag-skip: a current local copy needs no re-download.
    const existing = await this.db.getDataset(id);
    if (existing && existing.etag === entry.etag) {
      return 'skipped';
    }

    // 2) re-ingest of a changed partition: clear stale candles to avoid dupes.
    if (existing) {
      await this.db.clearDatasetCandles(symbol, timeframe);
    }

    // 3) download the parquet bytes for this partition (`<year>.parquet`).
    const buffer = await this.downloads.downloadParquet(symbol, tf, `${year}.parquet`);

    // 4) hand off to the worker and await its terminal message.
    await this.ingest(buffer, symbol, timeframe);

    // 5) record the dataset (size/etag/updatedAt straight from the manifest).
    const record: DatasetRecord = {
      id,
      symbol,
      timeframe,
      year,
      size: entry.size,
      etag: entry.etag,
      updatedAt: entry.updatedAt,
    };
    await this.db.putDataset(record);
    return 'ingested';
  }

  /**
   * Runs a batch of jobs in order, invoking `onProgress` once per completed
   * job. A failing job rejects the whole batch (the wizard surfaces the error).
   */
  async runJobs(
    manifest: Manifest,
    jobs: OnboardingJob[],
    onProgress?: (progress: OnboardingProgress) => void,
  ): Promise<void> {
    const total = jobs.length;
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      const status = await this.runJob(manifest, job);
      onProgress?.({ index: i + 1, total, job, status });
    }
  }

  /**
   * Posts the downloaded bytes into a fresh worker and resolves on `done`,
   * rejecting on `error` or a worker-level error. The worker is always
   * terminated when the promise settles.
   */
  private ingest(buffer: ArrayBuffer, symbol: string, timeframe: Timeframe): Promise<void> {
    const worker = this.workerFactory();
    return new Promise<void>((resolve, reject) => {
      worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
        const msg = ev.data;
        if (msg.type === 'done') {
          worker.terminate();
          resolve();
        } else if (msg.type === 'error') {
          worker.terminate();
          reject(new Error(msg.message));
        }
        // 'progress' messages are ignored here (wizard shows per-job progress).
      };
      worker.onerror = (err: unknown) => {
        worker.terminate();
        reject(err instanceof Error ? err : new Error(String(err)));
      };
      worker.postMessage({ buffer, symbol, timeframe });
    });
  }
}
