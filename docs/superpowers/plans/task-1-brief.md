### Task 1: Lift State to DataOnboardingService

**Files:**
- Modify: `emulador/src/app/services/market-data/data-onboarding.service.ts`
- Modify: `emulador/src/app/services/market-data/data-onboarding.service.spec.ts`
- Modify: `emulador/src/app/pages/mercados/r2-markets.component.ts`

**Interfaces:**
- Produces: `busySymbol: Signal<string | null>`, `progress: Signal<OnboardingProgress | null>` in `DataOnboardingService`.

- [ ] **Step 1: Write the failing test**

```typescript
// Add to data-onboarding.service.spec.ts inside describe('DataOnboardingService.runJobs')
it('exposes busySymbol and progress signals during execution', async () => {
  const db = dbStub();
  // Worker that doesn't immediately resolve so we can check intermediate state
  let resolveWorker: (val?: any) => void;
  const slowWorker = new FakeWorker();
  slowWorker.postMessage = () => {
    queueMicrotask(() => {
      // Pause worker execution
      new Promise(r => resolveWorker = r).then(() => {
        slowWorker.onmessage?.({ data: { type: 'done', inserted: 10 } } as MessageEvent);
      });
    });
  };
  const { svc } = makeService({ db, worker: slowWorker });
  
  expect(svc.busySymbol()).toBeNull();
  expect(svc.progress()).toBeNull();

  const promise = svc.runJobs(MANIFEST, [M1_JOB, H1_JOB]);
  
  // Wait a microtask for the download to finish and worker to be invoked
  await Promise.resolve();
  
  expect(svc.busySymbol()).toBe('XAUUSD');
  // First job hasn't finished yet, progress is tracked via the callback logic or updated signals
  
  resolveWorker!(); // finish M1
  await Promise.resolve();
  await Promise.resolve();
  resolveWorker!(); // finish H1
  
  await promise;
  expect(svc.busySymbol()).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run data-onboarding.service.spec.ts`
Expected: FAIL (svc.busySymbol is not a function)

- [ ] **Step 3: Write minimal implementation in Service**

```typescript
// In data-onboarding.service.ts
import { signal } from '@angular/core';

export class DataOnboardingService {
  // ... existing code
  busySymbol = signal<string | null>(null);
  progress = signal<OnboardingProgress | null>(null);

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
      for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i];
        const status = await this.runJob(manifest, job, worker);
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
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run data-onboarding.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Refactor R2MarketsComponent**

```typescript
// In r2-markets.component.ts
// Remove local signals: busySymbol, progress
// Replace with computed properties reading from the service:
busySymbol = this.onboarding.busySymbol;
progress = this.onboarding.progress;

// In runJobs method, remove the manual signal setting:
  private async runJobs(symbol: string, jobs: OnboardingJob[]): Promise<void> {
    const manifest = this.manifest();
    if (!manifest || !jobs.length || this.busySymbol()) return;
    this.errorMsg.set('');
    try {
      await this.onboarding.runJobs(manifest, jobs, (p) => this.progress.set(p));
      this.datasets.set(await this.storage.listDatasets());
    } catch (e) {
      this.errorMsg.set((e as Error).message || 'La descarga falló. Vuelve a intentarlo.');
    }
  }
```

- [ ] **Step 6: Commit**

```bash
git add src/app/services/market-data/data-onboarding.service.* src/app/pages/mercados/r2-markets.component.ts
git commit -m "feat(onboarding): lift download state to DataOnboardingService"
```
