# Onboarding & Session-Restore Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the concurrency, resource-leak and duplication findings from the architectural audit of the Data Wizard onboarding service and the session-restore flow, without changing user-visible behavior.

**Architecture:** `DataOnboardingService` is a `providedIn:'root'` singleton that owns the ephemeral download/ingest state as readonly signals. We add a service-level mutual-exclusion guard, an `AbortController` so a settling batch kills any in-flight prefetch, and we de-duplicate the per-job ingest body. Separately, we extract the triplicated "read anchor candles → pack `PendingCsv[]`" logic into one helper, and make the Markets page reactively refresh its catalog when a background download finishes (so navigating away and back no longer leaves a stale catalog).

**Tech Stack:** Angular 21 (standalone, signals, `effect()`), NgRx (store/effects), Vitest, IndexedDB (two object stores — `candles` raw + `series` workspace snapshot — in the `emulador-workspaces` DB), a Parquet/WASM Web Worker.

## Global Constraints

- Branch: `ui-polish` (implement here; do NOT create a new branch).
- Test runner: Vitest via `npm test` from `emulador/` (full suite ≈ 677 tests; keep it green after every task).
- Build check: `npm run build` from `emulador/` (Angular AOT).
- Lint/format gate (CI enforces both): run `npm run format` before every commit, and `npm run lint` must pass. CI runs `npm run format:check` and fails on any unformatted file.
- No new runtime dependencies. Keep the imperative, RxJS-free style inside `DataOnboardingService`.
- Preserve every existing public signature except where a task explicitly changes it; `onProgress` on `runJobs` STAYS (callers still use it).
- Commit message trailer (every commit): `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## Decisions & Scope (read before starting)

These came out of the audit + a verification pass. Two findings are deliberately **not** fixed; do not "helpfully" implement them:

- **R3 (alleged redundant IndexedDB write) — WONTFIX / invalid.** `repo.getCandles` reads the `candles` object store (raw R2 rows); `persistSeries$` writes the `series` object store (per-workspace denormalized snapshot). They are **different stores** in the same `emulador-workspaces` DB. `persistSeries$` materializes `candles → series` so the startup path (`init$ → getWorkspace → workspaceRestored`) has data without re-assembling raw rows. Skipping it would reintroduce a blank chart **on app restart**. Leave `persistSeries$` and the `thenLoad` flow exactly as they are.
- **R4 (large candle arrays through actions / dev deep-freeze) — ACCEPTED.** Candles must travel via `MarketActions.csvLoaded` to populate both market state and the `series` store. NgRx `strictActionImmutability` deep-freezes them in **dev only** (runtime checks are off in prod builds). Removing candles from NgRx state is a large rearchitecture and out of scope (YAGNI). The Task 4 helper avoids *duplicate* reads; that is the proportionate mitigation.
- **R1b (unify progress onto the service signal) — OPTIONAL, not in this plan.** Once Task 1's guard makes runs mutually exclusive, the service signal and each caller's local `progress` signal always agree, so the duplication is cosmetic, not a bug. Leaving `onProgress` in place keeps the change surface small.

In scope: **R1** (Task 1), **R7 + R6** (Task 2), **R5** (Task 3), **Task-3 duplication** (Task 4), **R2** (Task 5).

---

## File Structure

- `emulador/src/app/services/market-data/data-onboarding.service.ts` — add reentrancy guard, `AbortController` + `cancel()`, extract `processPayload`, clear worker handlers on settle. (Tasks 1–3.)
- `emulador/src/app/services/market-data/data-onboarding.service.spec.ts` — new tests for guard, abort, handler-clearing. (Tasks 1–3.)
- `emulador/src/app/services/market-data/parquet-download.service.ts` — accept an optional `AbortSignal` and forward it to `fetch`. (Task 3.)
- `emulador/src/app/services/market-data/parquet-download.service.spec.ts` — test the signal is forwarded. (Task 3.)
- `emulador/src/app/state/workspaces/load-anchor-candles.ts` — NEW: the shared `loadAnchorCandles` helper. (Task 4.)
- `emulador/src/app/state/workspaces/load-anchor-candles.spec.ts` — NEW: helper unit test. (Task 4.)
- `emulador/src/app/pages/sesiones/sesiones-page.component.ts` — use the helper in `restoreSession` + `dispatchOpen`. (Task 4.)
- `emulador/src/app/pages/crear-sesion/crear-sesion-page.component.ts` — use the helper in `confirmR2`. (Task 4.)
- `emulador/src/app/pages/mercados/r2-markets.component.ts` — `effect()` that refreshes the catalog when `busySymbol` returns to `null`. (Task 5.)
- `emulador/src/app/pages/mercados/r2-markets.component.spec.ts` — NEW: test the refresh-on-completion effect. (Task 5.)

---

### Task 1: Service-level reentrancy guard (R1)

The busy guard currently lives in `r2-markets.component.ts:137`, but `runJobs` has three callers on one singleton (`r2-markets`, `interval-dialog`, `sesiones`). Two concurrent `runJobs` corrupt `_busySymbol`/`_progress` and spawn two workers. Move the mutual exclusion into the service: a second concurrent call becomes a no-op.

**Files:**
- Modify: `emulador/src/app/services/market-data/data-onboarding.service.ts` (method `runJobs`, around line 187–197)
- Test: `emulador/src/app/services/market-data/data-onboarding.service.spec.ts`

**Interfaces:**
- Consumes: existing `FakeWorker`, `dbStub`, `makeService`, `MANIFEST`, `M1_JOB`, `H1_JOB` helpers already defined at the top of `data-onboarding.service.spec.ts`.
- Produces: no signature change. `runJobs(manifest, jobs, onProgress?)` still returns `Promise<void>`; it now returns early (resolves) when a batch is already in flight.

- [ ] **Step 1: Write the failing test**

Add to `data-onboarding.service.spec.ts`, inside the `describe('DataOnboardingService.runJobs (batch with progress)')` block:

```ts
it('is a no-op when a batch is already in flight (reentrancy guard)', async () => {
  const db = dbStub();
  // A worker we can hold open so the first batch stays mid-flight.
  let release: (() => void) | undefined;
  const held = new FakeWorker();
  held.postMessage = () => {
    queueMicrotask(() => {
      new Promise<void>((r) => (release = r)).then(() =>
        held.onmessage?.({ data: { type: 'done', inserted: 1 } } as MessageEvent),
      );
    });
  };
  const { svc, factory } = makeService({ db, worker: held });

  const first = svc.runJobs(MANIFEST, [M1_JOB]);
  // let it become busy
  for (let i = 0; i < 10 && !svc.busySymbol(); i++) await Promise.resolve();
  expect(svc.busySymbol()).toBe('XAUUSD');

  // a concurrent call must NOT spawn a second worker or change state
  await svc.runJobs(MANIFEST, [H1_JOB]);
  expect(factory).toHaveBeenCalledTimes(1);
  expect(svc.busySymbol()).toBe('XAUUSD');

  release!();
  await first;
  expect(svc.busySymbol()).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd emulador && npm test`
Expected: FAIL — the new test fails because the second `runJobs` currently spawns a second worker (`factory` called twice) and resets state.

- [ ] **Step 3: Write minimal implementation**

In `data-onboarding.service.ts`, in `runJobs`, change the opening guard from:

```ts
    if (!jobs.length) return;
    const total = jobs.length;
    const symbol = jobs[0].symbol;

    this._busySymbol.set(symbol);
```

to:

```ts
    if (!jobs.length) return;
    // Reentrancy guard: this singleton owns the busy state, so a second batch
    // dispatched while one is in flight (any of the 3 callers) is a no-op
    // instead of corrupting _busySymbol/_progress and spawning a 2nd worker.
    if (this._busySymbol()) return;
    const total = jobs.length;
    const symbol = jobs[0].symbol;

    this._busySymbol.set(symbol);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd emulador && npm test`
Expected: PASS — the new test passes and all existing tests stay green.

- [ ] **Step 5: Format, then commit**

```bash
cd emulador && npm run format
git add src/app/services/market-data/data-onboarding.service.ts src/app/services/market-data/data-onboarding.service.spec.ts
git commit -m "fix(onboarding): add service-level reentrancy guard to runJobs

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Extract `processPayload` + clear worker handlers (R7, R6)

The clear→ingest→put sequence is duplicated in `runJob` (lines ~121-126) and inline in the `runJobs` loop (lines ~220-225); they have already drifted (`job.symbol` vs `symbol`). Extract one private method. Also clear `worker.onmessage`/`worker.onerror` once a job settles, so a stray/late worker message can't resolve a stale promise.

**Files:**
- Modify: `emulador/src/app/services/market-data/data-onboarding.service.ts` (`runJob`, `runJobs` loop body, `ingestOn`)
- Test: `emulador/src/app/services/market-data/data-onboarding.service.spec.ts`

**Interfaces:**
- Consumes: the payload object returned by `prepareJob` — `{ buffer: ArrayBuffer; timeframe: Timeframe; existing: boolean; record: DatasetRecord }`.
- Produces: `private processPayload(payload, worker): Promise<void>` — clears candles if `existing`, ingests on the worker, records the dataset. Reused by `runJob` and `runJobs`.

- [ ] **Step 1: Write the failing test**

Add to `data-onboarding.service.spec.ts`, inside `describe('DataOnboardingService.runJob')`:

```ts
it('clears the worker message/error handlers after a job settles', async () => {
  const db = dbStub();
  const { svc, worker } = makeService({ db });
  await svc.runJob(MANIFEST, M1_JOB, worker as never);
  expect(worker.onmessage).toBeNull();
  expect(worker.onerror).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd emulador && npm test`
Expected: FAIL — `worker.onmessage` is the last-assigned handler (not null) because `ingestOn` never clears it.

- [ ] **Step 3: Write minimal implementation**

In `data-onboarding.service.ts`:

(a) Replace the body of `runJob` after the skip check:

```ts
  async runJob(manifest: Manifest, job: OnboardingJob, worker: IngestWorker): Promise<JobOutcome> {
    const payload = await this.prepareJob(manifest, job);
    if (!payload) return 'skipped';
    await this.processPayload(payload, worker);
    return 'ingested';
  }

  /** Clears stale candles (on re-ingest), runs the worker, records the dataset. */
  private async processPayload(
    payload: NonNullable<Awaited<ReturnType<DataOnboardingService['prepareJob']>>>,
    worker: IngestWorker,
  ): Promise<void> {
    if (payload.existing) {
      await this.db.clearDatasetCandles(payload.record.symbol, payload.timeframe);
    }
    await this.ingestOn(worker, payload.buffer, payload.record.symbol, payload.timeframe);
    await this.db.putDataset(payload.record);
  }
```

(b) In `runJobs`, replace the inline ingest block:

```ts
        if (payload) {
          // We have a buffer, run ingestion
          if (payload.existing) {
            await this.db.clearDatasetCandles(symbol, payload.timeframe);
          }
          await this.ingestOn(worker, payload.buffer, symbol, payload.timeframe);
          await this.db.putDataset(payload.record);
          status = 'ingested';
        }
```

with:

```ts
        if (payload) {
          await this.processPayload(payload, worker);
          status = 'ingested';
        }
```

(c) Clear handlers on settle in `ingestOn`:

```ts
  private ingestOn(
    worker: IngestWorker,
    buffer: ArrayBuffer,
    symbol: string,
    timeframe: Timeframe,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const settle = (done: () => void): void => {
        worker.onmessage = null;
        worker.onerror = null;
        done();
      };
      worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
        const msg = ev.data;
        if (msg.type === 'done') settle(resolve);
        else if (msg.type === 'error') settle(() => reject(new Error(msg.message)));
        // 'progress' messages are ignored here (wizard shows per-job progress).
      };
      worker.onerror = (err: unknown) => {
        settle(() => reject(err instanceof Error ? err : new Error(String(err))));
      };
      worker.postMessage({ buffer, symbol, timeframe });
    });
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd emulador && npm test`
Expected: PASS — the new handler-clearing test passes; every existing `runJob`/`runJobs` test (dedup, skip, re-ingest, error, single-worker reuse) stays green because behavior is unchanged.

- [ ] **Step 5: Format, then commit**

```bash
cd emulador && npm run format
git add src/app/services/market-data/data-onboarding.service.ts src/app/services/market-data/data-onboarding.service.spec.ts
git commit -m "refactor(onboarding): extract processPayload and clear worker handlers on settle

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: AbortController so a settling batch kills in-flight prefetch (R5)

The depth-1 pipeline prefetches job `i+1` while ingesting job `i`. If ingest fails, the prefetched download keeps running (`worker.terminate()` does not abort a `fetch`). Thread one `AbortSignal` through the downloads and abort it in `runJobs`'s `finally`; expose `cancel()` for future UI.

**Files:**
- Modify: `emulador/src/app/services/market-data/parquet-download.service.ts` (`downloadParquet`)
- Modify: `emulador/src/app/services/market-data/data-onboarding.service.ts` (`prepareJob`, `runJobs`, add `cancel()`)
- Test: `emulador/src/app/services/market-data/parquet-download.service.spec.ts`
- Test: `emulador/src/app/services/market-data/data-onboarding.service.spec.ts`

**Interfaces:**
- Produces: `downloadParquet(symbol, tf, file, signal?: AbortSignal): Promise<ArrayBuffer>` (4th param optional, backward compatible).
- Produces: `DataOnboardingService.cancel(): void` — aborts the active batch's downloads.
- Consumes: `prepareJob(manifest, job, signal?: AbortSignal)` now forwards the signal to `downloadParquet`.

- [ ] **Step 1: Write the failing tests**

(a) In `parquet-download.service.spec.ts`, add (the file already mocks `fetch`; mirror its existing setup):

```ts
it('forwards the AbortSignal to fetch', async () => {
  const fetchMock = vi.fn(() =>
    Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) } as Response),
  );
  vi.stubGlobal('fetch', fetchMock);
  const svc = new ParquetDownloadService('https://r2.example');
  const controller = new AbortController();
  await svc.downloadParquet('US30', 'd1', 'all.parquet', controller.signal);
  expect(fetchMock).toHaveBeenCalledWith(expect.any(String), { signal: controller.signal });
});
```

(b) In `data-onboarding.service.spec.ts`, inside `describe('DataOnboardingService.runJobs (batch with progress)')`:

```ts
it('aborts the shared download signal when the batch settles (kills in-flight prefetch)', async () => {
  const db = dbStub();
  const signals: (AbortSignal | undefined)[] = [];
  const download = vi.fn((_s: string, _tf: string, _f: string, signal?: AbortSignal) => {
    signals.push(signal);
    return Promise.resolve(new Uint8Array([1, 2, 3]).buffer);
  });
  // Worker errors on the first ingest -> the batch rejects.
  const worker = new FakeWorker({ response: 'error', errorMessage: 'boom' });
  const { svc } = makeService({ db, download, worker });

  await expect(svc.runJobs(MANIFEST, [M1_JOB, H1_JOB])).rejects.toThrow(/boom/);
  expect(signals.some((s) => s?.aborted)).toBe(true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd emulador && npm test`
Expected: FAIL — `downloadParquet` ignores a 4th arg (no `{ signal }` passed to fetch); `runJobs` creates no controller so no signal is ever aborted.

- [ ] **Step 3: Write minimal implementation**

(a) `parquet-download.service.ts` — change `downloadParquet`:

```ts
  async downloadParquet(
    symbol: string,
    tf: string,
    file: string,
    signal?: AbortSignal,
  ): Promise<ArrayBuffer> {
    if (!this.baseUrl) {
      throw new Error(
        'ParquetDownloadService: marketDataBaseUrl no configurado (define environment.marketDataBaseUrl para la fuente R2).',
      );
    }
    const url = `${this.baseUrl}/${MARKET_DATA_PREFIX}/${symbol}/${tf}/${file}`;
    const res = await fetch(url, { signal });
    if (!res.ok) {
      throw new Error(
        `ParquetDownloadService: no se pudo descargar el parquet ${symbol}/${tf}/${file} (HTTP ${res.status}).`,
      );
    }
    return res.arrayBuffer();
  }
```

(b) `data-onboarding.service.ts` — add a field and `cancel()` near the signals:

```ts
  private _progress = signal<OnboardingProgress | null>(null);
  public progress = this._progress.asReadonly();

  /** Aborts the downloads of the active batch (if any). */
  private activeAbort: AbortController | null = null;
  cancel(): void {
    this.activeAbort?.abort();
  }
```

(c) `prepareJob` — accept and forward the signal:

```ts
  private async prepareJob(manifest: Manifest, job: OnboardingJob, signal?: AbortSignal) {
```

and change the download call inside it:

```ts
    const buffer = await this.downloads.downloadParquet(symbol, tf, `${year}.parquet`, signal);
```

(d) `runJobs` — create the controller, thread the signal, abort in `finally`:

```ts
    this._busySymbol.set(symbol);
    this._progress.set(null);

    const controller = new AbortController();
    this.activeAbort = controller;
    const worker = this.workerFactory();
    try {
      // Start downloading the first job immediately
      let nextDownload = this.prepareJob(manifest, jobs[0], controller.signal);

      for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i];

        // Await the download (or skip resolution) of the CURRENT job
        const payload = await nextDownload;

        // Fire off the download for the NEXT job (if any) while we ingest the current one
        if (i + 1 < jobs.length) {
          nextDownload = this.prepareJob(manifest, jobs[i + 1], controller.signal);
          nextDownload.catch(() => undefined); // Prevent unhandled rejection events in the background
        }

        let status: JobOutcome = 'skipped';

        if (payload) {
          await this.processPayload(payload, worker);
          status = 'ingested';
        }

        const p = { index: i + 1, total, job, status };
        this._progress.set(p);
        onProgress?.(p);
      }
    } finally {
      controller.abort(); // kill any prefetch still in flight
      this.activeAbort = null;
      worker.terminate();
      this._busySymbol.set(null);
      this._progress.set(null);
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd emulador && npm test`
Expected: PASS — both new tests pass; existing download/onboarding tests stay green (the new param is optional and existing mocks ignore it).

- [ ] **Step 5: Format, then commit**

```bash
cd emulador && npm run format
git add src/app/services/market-data/parquet-download.service.ts src/app/services/market-data/parquet-download.service.spec.ts src/app/services/market-data/data-onboarding.service.ts src/app/services/market-data/data-onboarding.service.spec.ts
git commit -m "fix(onboarding): abort in-flight prefetch when a batch settles (AbortController + cancel)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Shared `loadAnchorCandles` helper (Task-3 duplication)

The "read each anchor TF's candles → pack `PendingCsv[]`" logic is copied in three places: `crear-sesion.confirmR2` (a sequential `for`), `sesiones.restoreSession` (a sequential `for`), and `sesiones.dispatchOpen` (a `Promise.all`). Extract one helper (concurrent read) and use it everywhere.

**Files:**
- Create: `emulador/src/app/state/workspaces/load-anchor-candles.ts`
- Test: `emulador/src/app/state/workspaces/load-anchor-candles.spec.ts`
- Modify: `emulador/src/app/pages/sesiones/sesiones-page.component.ts` (`restoreSession` lines ~678-687, `dispatchOpen` lines ~762-769)
- Modify: `emulador/src/app/pages/crear-sesion/crear-sesion-page.component.ts` (`confirmR2` lines ~177-185)

**Interfaces:**
- Produces: `loadAnchorCandles(repo: MarketDataRepository, symbol: string, tfs: Timeframe[]): Promise<PendingCsv[]>` — one `PendingCsv` per tf, `fileName` = `` `${symbol.toLowerCase()}_${tf.toLowerCase()}.csv` `` (matches the existing convention so no snapshot/behavior changes).
- Consumes: `MarketDataRepository.getCandles(symbol, tf)` and the `PendingCsv` type from `workspaces.actions`.

- [ ] **Step 1: Write the failing test**

Create `emulador/src/app/state/workspaces/load-anchor-candles.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { loadAnchorCandles } from './load-anchor-candles';
import type { Timeframe } from '../../models';
import type { Candle } from '../../models';

describe('loadAnchorCandles', () => {
  it('reads every tf and packs PendingCsv with the standard fileName', async () => {
    const m1: Candle[] = [{ time: 1, open: 1, high: 2, low: 0, close: 1 }];
    const h1: Candle[] = [{ time: 2, open: 1, high: 2, low: 0, close: 1 }];
    const repo = {
      getCandles: vi.fn((_s: string, tf: Timeframe) => Promise.resolve(tf === 'M1' ? m1 : h1)),
    };

    const out = await loadAnchorCandles(repo as never, 'US30', ['M1', 'H1']);

    expect(repo.getCandles).toHaveBeenCalledWith('US30', 'M1');
    expect(repo.getCandles).toHaveBeenCalledWith('US30', 'H1');
    expect(out).toEqual([
      { tf: 'M1', candles: m1, fileName: 'us30_m1.csv' },
      { tf: 'H1', candles: h1, fileName: 'us30_h1.csv' },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd emulador && npm test`
Expected: FAIL — `loadAnchorCandles` does not exist yet ("Failed to resolve import").

- [ ] **Step 3: Write minimal implementation**

Create `emulador/src/app/state/workspaces/load-anchor-candles.ts`:

```ts
import { Timeframe } from '../../models';
import { MarketDataRepository } from '../../domain/market-data.repository';
import { PendingCsv } from './workspaces.actions';

/**
 * Reads each anchor timeframe's cached candles for `symbol` and packs them as
 * the `PendingCsv[]` carried by `switchAsset({ thenLoad })`. Centralizes the
 * read-and-pack that the wizard (`confirmR2`) and the sessions page
 * (`restoreSession`, `dispatchOpen`) all need, so the chart already has data
 * before the replay cursor is positioned (the restore-race fix).
 */
export function loadAnchorCandles(
  repo: MarketDataRepository,
  symbol: string,
  tfs: Timeframe[],
): Promise<PendingCsv[]> {
  return Promise.all(
    tfs.map(async (tf) => ({
      tf,
      candles: await repo.getCandles(symbol, tf),
      fileName: `${symbol.toLowerCase()}_${tf.toLowerCase()}.csv`,
    })),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd emulador && npm test`
Expected: PASS.

- [ ] **Step 5: Use the helper at the three call sites**

In `sesiones-page.component.ts`, add the import near the other workspaces imports:

```ts
import { loadAnchorCandles } from '../../state/workspaces/load-anchor-candles';
```

Replace the `restoreSession` read loop (the block that builds `pending` with a `for (const tf of plan.selectedTfs)`):

```ts
    const pending: PendingCsv[] = [];
    for (const tf of plan.selectedTfs) {
      const timeframe = tf as Timeframe;
      const candles: Candle[] = await this.repo.getCandles(plan.symbol, timeframe);
      pending.push({
        tf: timeframe,
        candles,
        fileName: `${plan.symbol.toLowerCase()}_${tf.toLowerCase()}.csv`,
      });
    }
```

with:

```ts
    const pending = await loadAnchorCandles(
      this.repo,
      plan.symbol,
      plan.selectedTfs as Timeframe[],
    );
```

Replace the `dispatchOpen` read (the `const pending = await Promise.all(...)` block):

```ts
        const pending = await Promise.all(
          tfs.map(async (tf) => ({
            tf,
            candles: await this.repo.getCandles(card.symbol, tf),
            fileName: `${card.symbol.toLowerCase()}_${tf.toLowerCase()}.csv`,
          })),
        );
```

with:

```ts
        const pending = await loadAnchorCandles(this.repo, card.symbol, tfs);
```

In `crear-sesion-page.component.ts`, add the import:

```ts
import { loadAnchorCandles } from '../../state/workspaces/load-anchor-candles';
```

Replace the `confirmR2` read loop:

```ts
      const pending: PendingCsv[] = [];
      for (const tf of tfs) {
        const candles = await this.repo.getCandles(symbol, tf);
        pending.push({
          tf,
          candles,
          fileName: `${symbol.toLowerCase()}_${tf.toLowerCase()}.csv`,
        });
      }
```

with:

```ts
      const pending = await loadAnchorCandles(this.repo, symbol, tfs);
```

- [ ] **Step 6: Run the full suite + build to verify no regressions**

Run: `cd emulador && npm test && npm run build`
Expected: PASS — all existing `sesiones-page.component.spec.ts` and `crear-sesion-page.component.spec.ts` tests stay green (the `thenLoad` payload is byte-for-byte equivalent), build succeeds. If a now-unused import (`PendingCsv`, `Candle`) lints as unused, remove it.

- [ ] **Step 7: Format, then commit**

```bash
cd emulador && npm run format
git add src/app/state/workspaces/load-anchor-candles.ts src/app/state/workspaces/load-anchor-candles.spec.ts src/app/pages/sesiones/sesiones-page.component.ts src/app/pages/crear-sesion/crear-sesion-page.component.ts
git commit -m "refactor(sessions): extract loadAnchorCandles helper for the thenLoad packing

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Reactive catalog refresh on download completion (R2)

State was lifted to the service, but the "refresh datasets" side-effect still runs only in the component instance that called `runJobs`. If the user navigates away from Markets and back mid-download, the re-mounted page shows the live progress bar (lifted signal) but never refreshes its catalog when the download finishes. Add an `effect()` that reloads datasets when `busySymbol` transitions back to `null`.

**Files:**
- Modify: `emulador/src/app/pages/mercados/r2-markets.component.ts` (add `effect` import, a `refreshDatasets()` method, and the constructor effect)
- Test: `emulador/src/app/pages/mercados/r2-markets.component.spec.ts` (NEW)

**Interfaces:**
- Consumes: `this.onboarding.busySymbol` (readonly signal), `this.storage.listDatasets()`.
- Produces: no public API change; a `private async refreshDatasets()` and a constructor `effect`.

- [ ] **Step 1: Write the failing test**

Create `emulador/src/app/pages/mercados/r2-markets.component.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { R2MarketsComponent } from './r2-markets.component';
import { ManifestService } from '../../services/market-data/manifest.service';
import { DataOnboardingService } from '../../services/market-data/data-onboarding.service';
import { StorageManagerService } from '../storage-manager/storage-manager.service';
import { DialogService } from '../../components/ui/dialog.service';

describe('R2MarketsComponent — refresh on download completion', () => {
  const busy = signal<string | null>(null);

  function setup() {
    const manifest = { fetchManifest: vi.fn(() => Promise.resolve({ version: 1, symbols: {} })) };
    const storage = {
      listDatasets: vi.fn(() => Promise.resolve([])),
      totalBytes: vi.fn(() => 0),
    };
    const onboarding = {
      busySymbol: busy.asReadonly(),
      progress: signal(null).asReadonly(),
      runJobs: vi.fn(() => Promise.resolve()),
    };
    TestBed.configureTestingModule({
      providers: [
        R2MarketsComponent,
        { provide: ManifestService, useValue: manifest },
        { provide: StorageManagerService, useValue: storage },
        { provide: DataOnboardingService, useValue: onboarding },
        { provide: DialogService, useValue: {} },
      ],
    });
    const cmp = TestBed.inject(R2MarketsComponent);
    return { cmp, storage };
  }

  beforeEach(() => busy.set(null));

  it('reloads datasets when busySymbol returns to null', async () => {
    const { storage } = setup();
    TestBed.tick(); // run the initial effect + constructor load()
    await Promise.resolve();
    const callsAfterMount = storage.listDatasets.mock.calls.length;

    busy.set('US30'); // a download starts
    TestBed.tick();
    busy.set(null); // …and finishes
    TestBed.tick();
    await Promise.resolve();

    expect(storage.listDatasets.mock.calls.length).toBeGreaterThan(callsAfterMount);
  });
});
```

> Note: if `TestBed.tick()` is unavailable in this Angular/Vitest setup, use `TestBed.flushEffects()`; if neither exists, inject the component inside `TestBed.runInInjectionContext(() => new R2MarketsComponent())` and call `TestBed.flushEffects()`. Pick the one that compiles; the assertion is unchanged.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd emulador && npm test`
Expected: FAIL — without the effect, `listDatasets` is only called by the constructor `load()`, so the count does not increase after the busy→null transition.

- [ ] **Step 3: Write minimal implementation**

In `r2-markets.component.ts`, add `effect` to the Angular import:

```ts
import { Component, computed, effect, inject, signal } from '@angular/core';
```

Replace the constructor and add a refresh method:

```ts
  constructor() {
    void this.load();

    // The busy/progress state lives in the singleton service so it survives
    // navigation. The COMPLETION side-effect must too: when a background batch
    // finishes (busySymbol -> null) refresh the catalog, so navigating away and
    // back mid-download doesn't leave stale "Descargar" rows.
    let wasBusy = this.onboarding.busySymbol() !== null;
    effect(() => {
      const isBusy = this.onboarding.busySymbol() !== null;
      if (wasBusy && !isBusy) void this.refreshDatasets();
      wasBusy = isBusy;
    });
  }

  /** Re-reads the downloaded datasets (best-effort; keeps the current list on error). */
  private async refreshDatasets(): Promise<void> {
    try {
      this.datasets.set(await this.storage.listDatasets());
    } catch {
      /* keep the current list */
    }
  }
```

Then reuse it inside the component's own `runJobs` continuation (replace `this.datasets.set(await this.storage.listDatasets());` in `runJobs` with `await this.refreshDatasets();`) so there is one refresh path.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd emulador && npm test`
Expected: PASS — the new spec passes and the suite stays green.

- [ ] **Step 5: Build to verify AOT**

Run: `cd emulador && npm run build`
Expected: PASS.

- [ ] **Step 6: Format, then commit**

```bash
cd emulador && npm run format
git add src/app/pages/mercados/r2-markets.component.ts src/app/pages/mercados/r2-markets.component.spec.ts
git commit -m "fix(markets): refresh the catalog when a background download completes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage** (audit findings → tasks):
- R1 (concurrency guard) → Task 1. ✓
- R2 (stale catalog after navigation) → Task 5. ✓
- R3 (redundant write) → **WONTFIX**, documented in Decisions & Scope (cross-store materialization, load-bearing for startup). ✓
- R4 (large arrays / dev deep-freeze) → **ACCEPTED**, documented; duplicate reads removed by Task 4. ✓
- R5 (no AbortController) → Task 3. ✓
- R6 (worker message correlation) → Task 2 (clear handlers on settle). ✓
- R7 (runJob/runJobs duplication) → Task 2 (`processPayload`). ✓
- Task-3 component duplication → Task 4 (`loadAnchorCandles`). ✓
- R1b (progress unification) → consciously OUT (mitigated by Task 1's guard), documented. ✓

**2. Placeholder scan:** No "TBD/handle edge cases/similar to Task N". Every code step shows full code; every command shows the expected result. ✓

**3. Type consistency:** `processPayload(payload, worker)` uses `payload.record.symbol` + `payload.timeframe` (matches `prepareJob`'s return `{ buffer, timeframe, existing, record }`). `loadAnchorCandles(repo, symbol, tfs)` returns `PendingCsv[]` whose shape matches `MarketActions.csvLoaded`'s `{ tf, candles, fileName }` props (no `fromCache` is introduced — consistent with the R3 WONTFIX). `downloadParquet(..., signal?)` and `prepareJob(..., signal?)` agree on the optional 4th/3rd `AbortSignal`. `cancel()` and `activeAbort` agree. ✓
