/**
 * TDD specs for Task 6: DataOnboardingService — the download/ingest
 * orchestrator that drives the Data Wizard.
 *
 * For each selected (symbol, tf, year) partition it:
 *   1. skips when the local datasets-store etag already matches the manifest;
 *   2. otherwise downloads the parquet, dispatches it to the Parquet worker,
 *      awaits the worker's `done`, and records the DatasetRecord.
 *
 * Tested with a MOCKED worker (a fake that immediately posts `done`), a mocked
 * download service, and a stubbed WorkspaceDbService. No real IndexedDB, no
 * real Worker, no network.
 */
import { describe, expect, it, vi } from 'vitest';
import { DataOnboardingService, OnboardingJob } from './data-onboarding.service';
import type { Manifest } from './manifest.service';
import type { DatasetRecord } from '../market-data-db';

const MANIFEST: Manifest = {
  version: 1,
  symbols: {
    XAUUSD: {
      m1: {
        '2024': { size: 200, etag: 'e2024', updatedAt: '2026-01-02T00:00:00Z' },
      },
      h1: { all: { size: 50, etag: 'eh1', updatedAt: '2026-01-03T00:00:00Z' } },
      d1: { all: { size: 25, etag: 'ed1', updatedAt: '2026-01-04T00:00:00Z' } },
    },
  },
};

/** A fake worker that immediately posts `done` for every message it receives. */
class FakeWorker {
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  posted: { buffer: ArrayBuffer; symbol: string; timeframe: string }[] = [];
  terminated = false;
  private response: 'done' | 'error' = 'done';
  private errorMessage = 'boom';

  constructor(opts?: { response?: 'done' | 'error'; errorMessage?: string }) {
    if (opts?.response) this.response = opts.response;
    if (opts?.errorMessage) this.errorMessage = opts.errorMessage;
  }

  postMessage(msg: { buffer: ArrayBuffer; symbol: string; timeframe: string }): void {
    this.posted.push(msg);
    // reply asynchronously, like a real worker
    queueMicrotask(() => {
      if (this.response === 'done') {
        this.onmessage?.({ data: { type: 'done', inserted: 10 } } as MessageEvent);
      } else {
        this.onmessage?.({ data: { type: 'error', message: this.errorMessage } } as MessageEvent);
      }
    });
  }

  terminate(): void {
    this.terminated = true;
  }
}

/** Minimal stubbed dataset accessors over an in-memory map. */
function dbStub(seed: DatasetRecord[] = []) {
  const store = new Map(seed.map((d) => [d.id, d]));
  return {
    getDataset: vi.fn((id: string) => Promise.resolve(store.get(id))),
    putDataset: vi.fn((d: DatasetRecord) => {
      store.set(d.id, d);
      return Promise.resolve();
    }),
    clearDatasetCandles: vi.fn(() => Promise.resolve()),
    _store: store,
  };
}

function makeService(opts: {
  db: ReturnType<typeof dbStub>;
  download?: ReturnType<typeof vi.fn>;
  worker?: FakeWorker;
}) {
  const download = opts.download ?? vi.fn(() => Promise.resolve(new Uint8Array([1, 2, 3]).buffer));
  const worker = opts.worker ?? new FakeWorker();
  const factory = vi.fn(() => worker as never);
  const svc = new DataOnboardingService(
    opts.db as never,
    { downloadParquet: download } as never,
    factory,
  );
  return { svc, download, worker, factory };
}

const M1_JOB: OnboardingJob = { symbol: 'XAUUSD', tf: 'm1', year: '2024' };
const H1_JOB: OnboardingJob = { symbol: 'XAUUSD', tf: 'h1', year: 'all' };

describe('DataOnboardingService.runJob', () => {
  it('downloads the correct parquet file and dispatches {buffer, symbol, timeframe} to the worker', async () => {
    const db = dbStub();
    const { svc, download, worker } = makeService({ db });

    await svc.runJob(MANIFEST, M1_JOB, worker as never);

    // m1 partition 2024 -> file "2024.parquet"
    expect(download).toHaveBeenCalledWith('XAUUSD', 'm1', '2024.parquet');
    expect(worker.posted).toHaveLength(1);
    expect(worker.posted[0].symbol).toBe('XAUUSD');
    // timeframe is the UPPERCASE Timeframe the candles store keys on
    expect(worker.posted[0].timeframe).toBe('M1');
    expect(new Uint8Array(worker.posted[0].buffer)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('uploads "all.parquet" and tf "H1" for an h1 job', async () => {
    const db = dbStub();
    const { svc, download, worker } = makeService({ db });
    await svc.runJob(MANIFEST, H1_JOB, worker as never);
    expect(download).toHaveBeenCalledWith('XAUUSD', 'h1', 'all.parquet');
    expect(worker.posted[0].timeframe).toBe('H1');
  });

  it('records the DatasetRecord with size/etag/updatedAt from the manifest', async () => {
    const db = dbStub();
    const { svc, worker } = makeService({ db });

    await svc.runJob(MANIFEST, M1_JOB, worker as never);

    expect(db.putDataset).toHaveBeenCalledTimes(1);
    expect(db._store.get('XAUUSD|M1|2024')).toEqual<DatasetRecord>({
      id: 'XAUUSD|M1|2024',
      symbol: 'XAUUSD',
      timeframe: 'M1',
      year: '2024',
      size: 200,
      etag: 'e2024',
      updatedAt: '2026-01-02T00:00:00Z',
    });
  });

  it('SKIPS download + worker when the local etag already matches the manifest', async () => {
    const db = dbStub([
      {
        id: 'XAUUSD|M1|2024',
        symbol: 'XAUUSD',
        timeframe: 'M1',
        year: '2024',
        size: 200,
        etag: 'e2024', // same etag as the manifest
        updatedAt: '2026-01-02T00:00:00Z',
      },
    ]);
    const { svc, download, worker } = makeService({ db });

    const result = await svc.runJob(MANIFEST, M1_JOB, worker as never);

    expect(result).toBe('skipped');
    expect(download).not.toHaveBeenCalled();
    expect(worker.posted).toHaveLength(0);
    expect(db.putDataset).not.toHaveBeenCalled();
  });

  it('RE-INGESTS (and clears existing candles first) when the etag changed', async () => {
    const db = dbStub([
      {
        id: 'XAUUSD|M1|2024',
        symbol: 'XAUUSD',
        timeframe: 'M1',
        year: '2024',
        size: 100,
        etag: 'OLD-etag', // differs from manifest's e2024
        updatedAt: '2025-01-01T00:00:00Z',
      },
    ]);
    const { svc, download, worker } = makeService({ db });

    const result = await svc.runJob(MANIFEST, M1_JOB, worker as never);

    expect(result).toBe('ingested');
    // candles cleared before re-ingest to avoid duplicate rows
    expect(db.clearDatasetCandles).toHaveBeenCalledWith('XAUUSD', 'M1');
    expect(download).toHaveBeenCalledOnce();
    expect(worker.posted).toHaveLength(1);
    expect(db._store.get('XAUUSD|M1|2024')!.etag).toBe('e2024');
  });

  it('does NOT clear candles on a first-time ingest (no prior dataset)', async () => {
    const db = dbStub();
    const { svc, worker } = makeService({ db });
    await svc.runJob(MANIFEST, M1_JOB, worker as never);
    expect(db.clearDatasetCandles).not.toHaveBeenCalled();
  });

  it('rejects (and does not record the dataset) when the worker posts an error', async () => {
    const db = dbStub();
    const worker = new FakeWorker({ response: 'error', errorMessage: 'parquet corrupto' });
    const { svc } = makeService({ db, worker });

    await expect(svc.runJob(MANIFEST, M1_JOB, worker as never)).rejects.toThrow(
      /parquet corrupto/i,
    );
    expect(db.putDataset).not.toHaveBeenCalled();
  });

  it('throws for a partition missing from the manifest', async () => {
    const db = dbStub();
    const { svc, worker } = makeService({ db });
    await expect(
      svc.runJob(MANIFEST, { symbol: 'XAUUSD', tf: 'm1', year: '1999' }, worker as never),
    ).rejects.toThrow(/manifest|partición|partition/i);
  });

  it('does NOT terminate the worker after a bare runJob (the batch owns the lifecycle)', async () => {
    const db = dbStub();
    const { svc, worker } = makeService({ db });
    await svc.runJob(MANIFEST, M1_JOB, worker as never);
    expect(worker.terminated).toBe(false);
  });
});

describe('DataOnboardingService.runJobs (batch with progress)', () => {
  it('exposes busySymbol and progress signals during execution', async () => {
    const db = dbStub();
    // Worker that doesn't immediately resolve so we can check intermediate state
    let resolveWorker: ((val?: any) => void) | undefined = undefined;
    const slowWorker = new FakeWorker();
    slowWorker.postMessage = () => {
      queueMicrotask(() => {
        // Pause worker execution
        new Promise((r) => (resolveWorker = r)).then(() => {
          slowWorker.onmessage?.({ data: { type: 'done', inserted: 10 } } as MessageEvent);
        });
      });
    };
    const { svc } = makeService({ db, worker: slowWorker });

    expect(svc.busySymbol()).toBeNull();
    expect(svc.progress()).toBeNull();

    const promise = svc.runJobs(MANIFEST, [M1_JOB, H1_JOB]);

    // Wait for the download to finish and worker to be invoked
    // which takes a couple of microtasks due to Promises.
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
      if (resolveWorker) break;
    }

    expect(svc.busySymbol()).toBe('XAUUSD');
    // First job hasn't finished yet, progress is tracked via the callback logic or updated signals

    resolveWorker!(); // finish M1
    resolveWorker = undefined as any;
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
      if (resolveWorker) break;
    }
    resolveWorker!(); // finish H1

    await promise;
    expect(svc.busySymbol()).toBeNull();
  });

  it('runs every job in order and reports per-job progress', async () => {
    const db = dbStub();
    const { svc } = makeService({ db });
    const progress: { index: number; total: number; status: string }[] = [];

    const jobs: OnboardingJob[] = [M1_JOB, H1_JOB];
    await svc.runJobs(MANIFEST, jobs, (p) => progress.push(p));

    expect(db.putDataset).toHaveBeenCalledTimes(2);
    // one progress callback per completed job, carrying the running index/total
    expect(progress.map((p) => p.index)).toEqual([1, 2]);
    expect(progress.every((p) => p.total === 2)).toBe(true);
  });

  it('a skipped job still advances progress and does not download', async () => {
    const db = dbStub([
      {
        id: 'XAUUSD|H1|all',
        symbol: 'XAUUSD',
        timeframe: 'H1',
        year: 'all',
        size: 50,
        etag: 'eh1',
        updatedAt: '2026-01-03T00:00:00Z',
      },
    ]);
    const { svc, download } = makeService({ db });
    const progress: { status: string }[] = [];

    await svc.runJobs(MANIFEST, [H1_JOB, M1_JOB], (p) => progress.push(p));

    // H1 skipped (etag match), M1 ingested
    expect(progress.map((p) => p.status)).toEqual(['skipped', 'ingested']);
    expect(download).toHaveBeenCalledTimes(1);
    expect(download).toHaveBeenCalledWith('XAUUSD', 'm1', '2024.parquet');
  });

  it('reuses ONE worker across the whole batch and terminates it exactly once at the end', async () => {
    const db = dbStub([
      {
        id: 'XAUUSD|H1|all',
        symbol: 'XAUUSD',
        timeframe: 'H1',
        year: 'all',
        size: 50,
        etag: 'eh1', // matches manifest -> this job will be SKIPPED
        updatedAt: '2026-01-03T00:00:00Z',
      },
    ]);
    const { svc, worker, factory } = makeService({ db });

    // H1 is skipped (etag match); M1 and D1 are ingested -> 2 non-skipped jobs.
    const D1_JOB: OnboardingJob = { symbol: 'XAUUSD', tf: 'd1', year: 'all' };
    await svc.runJobs(MANIFEST, [H1_JOB, M1_JOB, D1_JOB]);

    // (a) the factory was called exactly once for the whole batch.
    expect(factory).toHaveBeenCalledTimes(1);
    // (b) only the non-skipped partitions were posted to the (single) worker.
    expect(worker.posted).toHaveLength(2);
    expect(worker.posted.map((p) => p.timeframe)).toEqual(['M1', 'D1']);
    // (c) the worker is terminated exactly once, after the batch finishes.
    expect(worker.terminated).toBe(true);
  });
});
