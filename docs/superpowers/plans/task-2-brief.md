### Task 2: Pipelining Network and CPU

**Files:**
- Modify: `emulador/src/app/services/market-data/data-onboarding.service.ts`

**Architecture:**
Instead of `await runJob(...)` sequentially, we will pre-fetch the next job's ArrayBuffer while the worker ingests the current one.

- [ ] **Step 1: Implement Pipelining in `runJobs`**

```typescript
// In data-onboarding.service.ts

  async runJobs(
    manifest: Manifest,
    jobs: OnboardingJob[],
    onProgress?: (progress: OnboardingProgress) => void,
  ): Promise<void> {
    if (!jobs.length) return;
    const total = jobs.length;
    const symbol = jobs[0].symbol;
    
    this.busySymbol.set(symbol);
    this.progress.set(null);
    
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
        this.progress.set(p);
        onProgress?.(p);
      }
    } finally {
      worker.terminate();
      this.busySymbol.set(null);
      this.progress.set(null);
    }
  }

  // Refactor runJob logic into a prepare step that resolves the buffer:
  private async prepareJob(manifest: Manifest, job: OnboardingJob) {
    const { symbol, tf, year } = job;
    const entry = this.manifests.getEntry(manifest, symbol, tf, year);
    if (!entry) throw new Error(`Partición ausente del manifest.`);
    
    const timeframe = TF_MAP[tf];
    const id = DataOnboardingService.datasetId(symbol, timeframe, year);
    
    const existing = await this.db.getDataset(id);
    if (existing && existing.etag === entry.etag) {
      return null; // Skipped
    }
    
    const buffer = await this.downloads.downloadParquet(symbol, tf, `${year}.parquet`);
    
    return {
      buffer,
      timeframe,
      existing: !!existing,
      record: {
        id, symbol, timeframe, year,
        size: entry.size, etag: entry.etag, updatedAt: entry.updatedAt
      }
    };
  }
```

- [ ] **Step 2: Run tests to verify pipelining works**

Run: `npx vitest run data-onboarding.service.spec.ts`
Expected: PASS (existing tests should still pass because the end outcome is identical, just pipelined).

- [ ] **Step 3: Commit**

```bash
git add src/app/services/market-data/data-onboarding.service.ts
git commit -m "perf(onboarding): pipeline network fetch with wasm ingestion"
```
