# Progress Ledger

## Task 1: Lift State to DataOnboardingService
- Status: ✅ Complete
- Minor findings for final review:
  1. **Redundant signal mutation callback**: `src/app/pages/mercados/r2-markets.component.ts:140`. The component passes `(p) => this.progress.set(p)` as the `onProgress` callback to `runJobs`. Fix: Call `await this.onboarding.runJobs(manifest, jobs)` without the callback argument.
  2. **Public writable signals**: `src/app/services/market-data/data-onboarding.service.ts:91-92`. `busySymbol` and `progress` are exposed directly as `WritableSignal`s. They should be exposed as readonly signals (e.g., via `.asReadonly()`).

## Task 2: Pipelining Network and CPU
- Status: ✅ Complete
- Minor findings for final review:
  - None. (Important finding fixed in `4b6b8d00`).

## Task 3: Fix Archived Session Restore
- Status: ✅ Complete
- Minor findings for final review:
  1. **Sequential Promises**: `sesiones-page.component.ts:761-768`. The loop fetches timeframes sequentially. `Promise.all` could speed this up.
  2. **No try/catch on getCandles**: `sesiones-page.component.ts:762`. If IndexedDB fails, it will result in an unhandled promise rejection.
