/* eslint-disable @angular-eslint/prefer-inject -- constructor inject()-defaults keep this service unit-testable via direct construction (new Service(deps)) without TestBed; see services design note. */
import { inject, Inject, Injectable, InjectionToken, signal } from '@angular/core';
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
 * `runJobs` spawns ONE Parquet worker for the whole batch (see `ingestOn`)
 * instead of one per partition, eliminating per-file `parquet-wasm` re-init.
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
  private _busySymbol = signal<string | null>(null);
  public busySymbol = this._busySymbol.asReadonly();
  private _progress = signal<OnboardingProgress | null>(null);
  public progress = this._progress.asReadonly();

  constructor(
    private readonly db: WorkspaceDbService = inject(WorkspaceDbService),
    private readonly downloads: ParquetDownloadService = inject(ParquetDownloadService),
    @Inject(PARQUET_WORKER_FACTORY)
    private readonly workerFactory: WorkerFactory = spawnParquetWorker,
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
  async runJob(manifest: Manifest, job: OnboardingJob, worker: IngestWorker): Promise<JobOutcome> {
    const payload = await this.prepareJob(manifest, job);
    if (!payload) return 'skipped';

    if (payload.existing) {
      await this.db.clearDatasetCandles(job.symbol, payload.timeframe);
    }
    await this.ingestOn(worker, payload.buffer, job.symbol, payload.timeframe);
    await this.db.putDataset(payload.record);
    return 'ingested';
  }

  /**
   * Prepares a job by resolving its manifest entry, checking for an existing
   * local dataset, and downloading the parquet bytes if needed.
   * Returns `null` if the job should be skipped, otherwise a payload object
   * with the buffer and dataset record details.
   */
  private async prepareJob(manifest: Manifest, job: OnboardingJob) {
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
      return null;
    }

    // 3) download the parquet bytes for this partition (`<year>.parquet`).
    const buffer = await this.downloads.downloadParquet(symbol, tf, `${year}.parquet`);

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

    return {
      buffer,
      timeframe,
      existing: !!existing,
      record
    };
  }

  /**
   * Runs a batch of jobs in order, invoking `onProgress` once per completed
   * job. A failing job rejects the whole batch (the wizard surfaces the error).
   *
   * A single Parquet worker is spawned for the whole batch and reused across
   * partitions — `parquet-wasm` caches its WASM init internally, so one
   * worker instance means one init instead of one per partition. The worker
   * is always terminated when the batch settles (success or failure).
   * 
   * This pipelines the network and CPU work by pre-fetching the next job's 
   * ArrayBuffer while the worker ingests the current one.
   */
  async runJobs(
    manifest: Manifest,
    jobs: OnboardingJob[],
    onProgress?: (progress: OnboardingProgress) => void,
  ): Promise<void> {
    if (!jobs.length) return;
    const total = jobs.length;
    const symbol = jobs[0].symbol;
    
    this._busySymbol.set(symbol);
    this._progress.set(null);
    
    const worker = this.workerFactory();
    try {
      // Start downloading the first job immediately
      let nextDownload = this.prepareJob(manifest, jobs[0]);

      for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i];
        
        // Await the download (or skip resolution) of the CURRENT job
        const payload = await nextDownload;
        
        // Fire off the download for the NEXT job (if any) while we ingest the current one
        if (i + 1 < jobs.length) {
          nextDownload = this.prepareJob(manifest, jobs[i + 1]);
          nextDownload.catch(() => {}); // Prevent unhandled rejection events in the background
        }
        
        let status: JobOutcome = 'skipped';
        
        if (payload) {
          // We have a buffer, run ingestion
          if (payload.existing) {
            await this.db.clearDatasetCandles(symbol, payload.timeframe);
          }
          await this.ingestOn(worker, payload.buffer, symbol, payload.timeframe);
          await this.db.putDataset(payload.record);
          status = 'ingested';
        }

        const p = { index: i + 1, total, job, status };
        this._progress.set(p);
        onProgress?.(p);
      }
    } finally {
      worker.terminate();
      this._busySymbol.set(null);
      this._progress.set(null);
    }
  }

  /**
   * Posts the downloaded bytes into the given worker and resolves on `done`,
   * rejecting on `error` or a worker-level error. Does NOT terminate the
   * worker — the caller (`runJobs`) owns its lifecycle across the batch.
   */
  private ingestOn(
    worker: IngestWorker,
    buffer: ArrayBuffer,
    symbol: string,
    timeframe: Timeframe,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
        const msg = ev.data;
        if (msg.type === 'done') {
          resolve();
        } else if (msg.type === 'error') {
          reject(new Error(msg.message));
        }
        // 'progress' messages are ignored here (wizard shows per-job progress).
      };
      worker.onerror = (err: unknown) => {
        reject(err instanceof Error ? err : new Error(String(err)));
      };
      worker.postMessage({ buffer, symbol, timeframe });
    });
  }
}
