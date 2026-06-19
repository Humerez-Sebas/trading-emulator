# Emulator UX + Performance Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four targeted fixes on the merged R2 transition — MT5-style custom-TF label, fluid type-to-open focus, instant New-Session symbol click, and faster Markets downloads.

**Architecture:** Angular 21 (standalone + signals) + NgRx. Pure logic is unit-tested under `ng test`; modal focus, download performance and click responsiveness are browser-validated in the preview. Changes touch only the R2 path and shared UI primitives; the CSV/backend branches stay intact behind `environment.dataSource`.

**Tech Stack:** Angular 21, NgRx, IndexedDB (fake-indexeddb in tests), parquet-wasm worker, Vitest via `@angular/build:unit-test` (`ng test`), lightweight-charts.

**Spec:** `docs/superpowers/specs/2026-06-19-emulator-ux-perf-fixes-design.md` (read it first).

## Global Constraints

- **Stack/style:** Angular 21 standalone components + signals + NgRx. Spanish user-facing text. Match surrounding files.
- **Coexistence:** do NOT touch the CSV/backend branches or the `series` store. These fixes affect only the R2 path and shared primitives (`ModalComponent`, `custom-timeframe.ts`, `MarketDataRepository`).
- **Times:** app state and candle `time` are unix **seconds**.
- **Per-task skills (REQUIRED):** each task names the skills to invoke before coding. Installed in this repo via the Skills CLI: `angular-component`, `angular-signals`, `angular-testing` (analogjs), plus superpowers `test-driven-development` and `systematic-debugging`. Invoke the named skills with the Skill tool at task start.
- **Test runner:** `cd emulador && npx ng test --no-watch` is canonical (currently 630 passing). Pure specs may also run via `npx vitest run <spec>`.
- **CI gates (run before every commit that touches `emulador/`):** from `emulador/` run `npm run lint`, `npm run format:check` (or `npm run format` to fix), `npx ng test --no-watch`, and `npm run build`. CI (`.github/workflows/ci.yml`) fails the Vercel deploy if any of these fail. The IndexedDB test isolation in `src/test-setup.ts` is already wired — do not remove it.

---

## Milestone 1 — Custom-TF label (M/H/D prefix)

### Task 1: `formatIntervalShort` uses MT5-style prefix (pure, TDD)

**Skills:** superpowers:test-driven-development, angular-testing (analogjs).

**Files:**
- Modify: `emulador/src/app/state/market/custom-timeframe.ts`
- Test: `emulador/src/app/state/market/custom-timeframe.spec.ts`

**Interfaces:**
- Produces: `formatIntervalShort(min: number): string` — unchanged signature, new output: whole days → `D<n>`, whole hours → `H<n>`, else `M<min>`. Consumed by `controls.component` (chip) and `interval-dialog` (the "Necesitas … para …" notice). `formatIntervalVerbose` is unchanged.

- [ ] **Step 1: Update the failing test.** Replace the existing `formatIntervalShort` describe in `custom-timeframe.spec.ts` with:

```ts
describe('formatIntervalShort', () => {
  it('uses MT5-style prefix (M/H/D), consistent with the M1/H1/D1 buttons', () => {
    expect(formatIntervalShort(45)).toBe('M45');
    expect(formatIntervalShort(90)).toBe('M90');
    expect(formatIntervalShort(120)).toBe('H2');
    expect(formatIntervalShort(180)).toBe('H3');
    expect(formatIntervalShort(1440)).toBe('D1');
    expect(formatIntervalShort(4320)).toBe('D3');
  });
});
```

- [ ] **Step 2: Run, verify it fails.** `cd emulador && npx vitest run src/app/state/market/custom-timeframe.spec.ts` → FAIL (returns `45m`/`2h`/`1D`).

- [ ] **Step 3: Implement** in `custom-timeframe.ts` — replace `formatIntervalShort` body with:

```ts
export function formatIntervalShort(min: number): string {
  if (min % 1440 === 0) return `D${min / 1440}`;
  if (min % 60 === 0) return `H${min / 60}`;
  return `M${min}`;
}
```

- [ ] **Step 4: Run, verify it passes.** Same command → PASS.

- [ ] **Step 5: Confirm no other assertion expects the old format.** `cd emulador && npx vitest run` is not needed; instead grep: search `src` for `'45m'`, `"2h"`, `'1D'` string assertions tied to `formatIntervalShort`. Only `custom-timeframe.spec.ts` asserts it (the chip/notice templates have no string test). If any other spec asserts the old suffix form, update it to the prefix form.

- [ ] **Step 6: Gate + commit.** `cd emulador && npx ng test --no-watch` (still green) and `npm run lint && npm run format:check`. Then:

```bash
git commit -am "feat(timeframe): custom-TF chip uses MT5-style M/H/D prefix"
```

- [ ] **Step 7 (browser-validate):** in the preview, type `21` on the chart → Apply → the toolbar chip reads `M21` (not `21m`); a 2-hour custom reads `H2`.

---

## Milestone 2 — Type-to-open focuses the input

### Task 2: `ModalComponent` designated initial focus + interval-dialog opt-in (browser-validated)

**Skills:** angular-component, angular-signals (analogjs). Reference: `web-accessibility` (akillness/oh-my-skills) for focus-management/ARIA best practices.

**Files:**
- Modify: `emulador/src/app/components/ui/modal.component.ts`
- Modify: `emulador/src/app/components/interval-dialog/interval-dialog.component.html`

**Interfaces:**
- Produces: `ModalComponent` gains `autoFocus = input('')` — a CSS selector resolved within the panel; when set and matched, that element receives focus on open instead of `focusable()[0]` (which is the header ×). Other modals that don't set it keep current behaviour.

- [ ] **Step 1:** Read `modal.component.ts` and `interval-dialog.component.html/.ts` to confirm the structure (the input is `#input` / `.interval-input`; the modal's `ngAfterViewInit` focuses `focusable()[0]`, i.e. the × button, via `queueMicrotask`).

- [ ] **Step 2: Add the input + use it** in `modal.component.ts`. Add to the class (near the other `input(...)` declarations):

```ts
/** CSS selector (within the panel) to focus on open; falls back to the first
 * focusable element when empty or unmatched. Lets a dialog put focus on its
 * primary control instead of the header × button. */
autoFocus = input('');
```

Replace the body of `ngAfterViewInit` with:

```ts
ngAfterViewInit(): void {
  this.previouslyFocused = document.activeElement as HTMLElement | null;
  document.body.style.overflow = 'hidden';
  const panel = this.panel().nativeElement;
  const sel = this.autoFocus();
  const target =
    (sel ? panel.querySelector<HTMLElement>(sel) : null) ?? this.focusable()[0] ?? panel;
  queueMicrotask(() => target.focus());
}
```

- [ ] **Step 3: Opt the interval dialog in.** In `interval-dialog.component.html`, add `[autoFocus]="'.interval-input'"` to the opening `<app-modal …>` tag:

```html
<app-modal title="Cambiar temporalidad" size="sm" [autoFocus]="'.interval-input'" (closed)="close()">
```

(Leave the dialog's own `queueMicrotask(() => this.input()?.nativeElement.focus())` in `onGlobalKeydown` as-is — it now agrees with the modal's target.)

- [ ] **Step 4: Gate.** `cd emulador && npm run build && npx ng test --no-watch && npm run lint && npm run format:check` — all clean (no spec changes; the suite must stay 630). Fix anything broken.

- [ ] **Step 5: Commit.**

```bash
git commit -am "fix(modal): designated initial focus so type-to-open lands in the interval input"
```

- [ ] **Step 6 (browser-validate, the real gate):** in the preview, press a digit (e.g. `9`) on the chart → the modal opens with the **input focused** (caret in the field, × NOT highlighted); keep typing `0` → field shows `90` fluidly; Enter applies. Confirm other modals (session-summary, csv-start-dialog, missing-dataset) still open/focus/close normally.

---

## Milestone 3 — Instant New-Session symbol click

### Task 3: `MarketDataRepository.getCoverage` (cheap first/last via cursor) (TDD)

**Skills:** superpowers:test-driven-development, angular-testing (analogjs).

**Files:**
- Modify: `emulador/src/app/domain/market-data.repository.ts` (abstract method)
- Modify: `emulador/src/app/domain/indexed-db.repository.ts` (cursor impl)
- Modify: `emulador/src/app/domain/csv-legacy.repository.ts` (impl so the abstract class still compiles)
- Test: `emulador/src/app/domain/market-data-repository.spec.ts`

**Interfaces:**
- Produces: `getCoverage(symbol: string, timeframe: Timeframe): Promise<{ from: number; to: number } | null>` on `MarketDataRepository` — earliest and latest candle `time` (seconds) for the symbol+tf, or `null` when none. Consumed by Task 4. No full materialization.

- [ ] **Step 1: Write the failing test** in `market-data-repository.spec.ts` (it already uses `fake-indexeddb` + seeds the `candles` store; follow its existing `IndexedDbMarketDataRepository` setup). Add:

```ts
it('getCoverage returns first/last candle time without loading all rows', async () => {
  await db.putDataset(dataset({ id: 'XAUUSD|M1|2024', timeframe: 'M1', year: '2024' }));
  await bulkInsertCandles([
    candle(1000, 'XAUUSD', 'M1'),
    candle(3000, 'XAUUSD', 'M1'),
    candle(2000, 'XAUUSD', 'M1'),
    candle(500, 'XAUUSD', 'H1'),
  ]);
  const repo = new IndexedDbMarketDataRepository();
  expect(await repo.getCoverage('XAUUSD', 'M1')).toEqual({ from: 1000, to: 3000 });
  expect(await repo.getCoverage('XAUUSD', 'H1')).toEqual({ from: 500, to: 500 });
  expect(await repo.getCoverage('XAUUSD', 'D1')).toBeNull();
});
```

(Use the spec's existing `dataset()`/`candle()`/`bulkInsertCandles` helpers and DB setup — mirror the existing `getCandles` test's arrange block exactly.)

- [ ] **Step 2: Run, verify it fails.** `cd emulador && npx ng test --no-watch` → FAIL (`getCoverage` not a function). (This spec needs the Angular test env; use `ng test`, not raw vitest.)

- [ ] **Step 3: Declare the abstract method** in `market-data.repository.ts`, after `getCandles`:

```ts
  /**
   * Earliest and latest candle `time` (unix seconds UTC) for the symbol+tf, or
   * `null` when there are none. Cheap: reads only the two edge rows.
   */
  abstract getCoverage(symbol: string, timeframe: Timeframe): Promise<{ from: number; to: number } | null>;
```

- [ ] **Step 4: Implement in `indexed-db.repository.ts`** — add a private edge helper and the method:

```ts
  /** @inheritdoc */
  async getCoverage(
    symbol: string,
    timeframe: Timeframe,
  ): Promise<{ from: number; to: number } | null> {
    const db = await this.open();
    const range = IDBKeyRange.bound([symbol, timeframe, -Infinity], [symbol, timeframe, +Infinity]);
    const from = await this.edgeTime(db, range, 'next');
    if (from === null) return null;
    const to = await this.edgeTime(db, range, 'prev');
    return { from, to: to ?? from };
  }

  /** The `time` of the first (`next`) or last (`prev`) row in the index range. */
  private edgeTime(
    db: IDBDatabase,
    range: IDBKeyRange,
    dir: 'next' | 'prev',
  ): Promise<number | null> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CANDLES_STORE, 'readonly');
      const req = tx.objectStore(CANDLES_STORE).index(CANDLES_BY_SYMBOL_TF_TIME).openCursor(range, dir);
      req.onsuccess = () => {
        const cursor = req.result;
        resolve(cursor ? (cursor.value as CandleRecord).time : null);
      };
      req.onerror = () => reject(req.error);
    });
  }
```

- [ ] **Step 5: Implement in `csv-legacy.repository.ts`** so the abstract class compiles (the CSV path is not perf-critical here; derive from the existing `getCandles`):

```ts
  /** @inheritdoc */
  async getCoverage(
    symbol: string,
    timeframe: Timeframe,
  ): Promise<{ from: number; to: number } | null> {
    const candles = await this.getCandles(symbol, timeframe);
    if (!candles.length) return null;
    return { from: candles[0].time, to: candles[candles.length - 1].time };
  }
```

- [ ] **Step 6: Run, verify it passes.** `cd emulador && npx ng test --no-watch` → the new test PASSES and the suite stays green.

- [ ] **Step 7: Gate + commit.** `npm run lint && npm run format:check && npm run build`. Then:

```bash
git commit -am "feat(repo): MarketDataRepository.getCoverage (cheap first/last via cursor)"
```

### Task 4: New Session uses `getCoverage` and defers the heavy candle load (pure helper TDD + UI browser-validated)

**Skills:** angular-component, angular-signals (analogjs), superpowers:test-driven-development.

**Files:**
- Modify: `emulador/src/app/pages/crear-sesion/r2-coverage.logic.ts` (add `intersectBounds`)
- Test: `emulador/src/app/pages/crear-sesion/r2-coverage.logic.spec.ts`
- Modify: `emulador/src/app/pages/crear-sesion/crear-sesion-page.component.ts`
- Modify: `emulador/src/app/pages/crear-sesion/crear-sesion-page.component.html` (Confirmar loading state)

**Interfaces:**
- Consumes: `MarketDataRepository.getCoverage` (Task 3).
- Produces: `intersectBounds(boundsByTf, selectedTfs): { from: number; to: number } | null` — intersection (max from, min to) of per-anchor bounds for the selected TFs.

- [ ] **Step 1: Failing test** in `r2-coverage.logic.spec.ts`:

```ts
import { intersectBounds } from './r2-coverage.logic';
describe('intersectBounds', () => {
  it('intersects per-anchor bounds over the selected TFs (max from, min to)', () => {
    const bounds = { M1: { from: 1000, to: 2000 }, H1: { from: 1200, to: 1800 } } as const;
    expect(intersectBounds(bounds, ['M1', 'H1'])).toEqual({ from: 1200, to: 1800 });
    expect(intersectBounds(bounds, ['M1'])).toEqual({ from: 1000, to: 2000 });
  });
  it('returns null when nothing selected or no bounds present', () => {
    expect(intersectBounds({}, ['M1'])).toBeNull();
    expect(intersectBounds({ M1: { from: 1, to: 2 } }, [])).toBeNull();
  });
});
```

- [ ] **Step 2: Run, verify it fails.** `cd emulador && npx vitest run src/app/pages/crear-sesion/r2-coverage.logic.spec.ts`.

- [ ] **Step 3: Implement** in `r2-coverage.logic.ts`:

```ts
/** Intersection (max from, min to) of the selected anchors' bounds, or null. */
export function intersectBounds(
  boundsByTf: Partial<Record<Timeframe, { from: number; to: number }>>,
  selectedTfs: Timeframe[],
): { from: number; to: number } | null {
  const chosen = selectedTfs
    .map((tf) => boundsByTf[tf])
    .filter((b): b is { from: number; to: number } => !!b);
  if (!chosen.length) return null;
  return {
    from: Math.max(...chosen.map((b) => b.from)),
    to: Math.min(...chosen.map((b) => b.to)),
  };
}
```

(`Timeframe` is already imported in this file; reuse the import.)

- [ ] **Step 4: Run, verify it passes.** Same vitest command → PASS.

- [ ] **Step 5: Rewire the component.** In `crear-sesion-page.component.ts`:
  - Add a bounds signal and import `intersectBounds`:
    ```ts
    /** R2: cheap per-anchor coverage bounds (seconds), read on pick via getCoverage. */
    boundsByTf = signal<Partial<Record<Timeframe, { from: number; to: number }>>>({});
    ```
  - Change `r2Range` to use bounds instead of full series:
    ```ts
    r2Range = computed(() =>
      intersectBounds(this.boundsByTf(), [...this.selectedTfs()] as Timeframe[]),
    );
    ```
  - Replace `pickR2Asset` so the click only reads cheap coverage (no full candles):
    ```ts
    /** R2 step 1 -> 2: read each downloaded anchor's cheap coverage (first/last). */
    async pickR2Asset(asset: R2Asset): Promise<void> {
      this.r2Loading.set(true);
      this.r2Error.set('');
      try {
        const entries = await Promise.all(
          asset.tfs.map(
            async (tf) => [tf, await this.repo.getCoverage(asset.symbol, tf)] as const,
          ),
        );
        const bounds: Partial<Record<Timeframe, { from: number; to: number }>> = {};
        for (const [tf, b] of entries) if (b) bounds[tf] = b;
        this.boundsByTf.set(bounds);
        this.r2Symbol.set(asset.symbol);
        this.r2Tfs.set(asset.tfs);
        this.selectedTfs.set(new Set(asset.tfs));
        this.defaultDate();
        this.step.set(2);
      } catch (e) {
        this.r2Error.set((e as Error).message || 'No se pudieron leer las velas descargadas.');
      }
      this.r2Loading.set(false);
    }
    ```
  - Replace `confirmR2` so the heavy candle load happens here (deferred from the click), with the loading flag on:
    ```ts
    async confirmR2(): Promise<void> {
      const symbol = this.r2Symbol();
      const start = this.startEpoch();
      if (!symbol || start === null || this.r2Loading()) return;
      const tfs = [...this.selectedTfs()] as Timeframe[];
      this.r2Loading.set(true);
      this.r2Error.set('');
      try {
        const pending: PendingCsv[] = [];
        for (const tf of tfs) {
          const candles = await this.repo.getCandles(symbol, tf);
          pending.push({
            tf,
            candles,
            fileName: `${symbol.toLowerCase()}_${tf.toLowerCase()}.csv`,
          });
        }
        this.store.dispatch(
          WorkspacesActions.switchAsset({
            symbol,
            selectedTfs: tfs,
            thenLoad: pending,
            thenNewSession: { name: this.sessionName().trim() || null },
            thenGoTo: start,
            thenSessionEnd: this.endEpoch() ?? undefined,
          }),
        );
        await this.router.navigateByUrl('/');
      } catch (e) {
        this.r2Error.set((e as Error).message || 'No se pudieron cargar las velas.');
        this.r2Loading.set(false);
      }
    }
    ```
  - Remove the now-unused `seriesByTf` signal and the `coverageRange` import. If `coverageRange` (and its `r2-coverage.logic.spec.ts` tests) is no longer referenced anywhere, delete it and its tests (YAGNI); otherwise leave it.

- [ ] **Step 6: Confirmar loading state** in `crear-sesion-page.component.html` — the R2 confirm button must reflect `r2Loading()` (disable + show "Cargando…") so the deferred load is visible. Find the R2 step-3 confirm button and bind `[disabled]="r2Loading()"` and label it `{{ r2Loading() ? 'Cargando…' : 'Crear sesión' }}` (match the existing wording/structure of that button).

- [ ] **Step 7: Gate.** `cd emulador && npm run build && npx ng test --no-watch && npm run lint && npm run format:check` — all clean. Fix any spec that referenced `seriesByTf`/`coverageRange`.

- [ ] **Step 8: Commit.**

```bash
git commit -am "perf(new-session): instant symbol pick via getCoverage; defer candle load to confirm"
```

- [ ] **Step 9 (browser-validate):** in the preview New-Session R2 flow, click a symbol with M1 downloaded (e.g. US30) → step 2 appears **instantly** (no multi-second freeze); pick dates; "Crear sesión" shows the loading state while it loads, then the chart opens positioned with candles.

---

## Milestone 4 — Faster Markets downloads (measure, then optimize)

### Task 5: Instrument the download path and measure the breakdown (systematic-debugging)

**Skills:** superpowers:systematic-debugging (measure before optimizing).

**Files:**
- Modify: `emulador/src/app/services/market-data/data-onboarding.service.ts` (per-partition timing)
- Optionally modify: `emulador/src/app/workers/parquet.worker.ts` (decode-vs-insert timing) only if ingest dominates

**Interfaces:** none new — internal instrumentation only. Deliverable is the measured breakdown + a recommendation written into the task report.

- [ ] **Step 1:** Read `data-onboarding.service.ts` (`runJob`/`ingest`) and `workers/parquet.worker.ts` to see the download→ingest flow and the worker's message protocol.

- [ ] **Step 2: Add coarse timing** in `runJob` around the two phases (dev-visible `console.debug`):

```ts
const tFetch0 = performance.now();
const buffer = await this.downloads.downloadParquet(symbol, tf, `${year}.parquet`);
const tFetch1 = performance.now();
await this.ingest(buffer, symbol, timeframe);
const tIngest1 = performance.now();
console.debug(
  `[r2-perf] ${id}: fetch=${Math.round(tFetch1 - tFetch0)}ms ingest=${Math.round(tIngest1 - tFetch1)}ms bytes=${buffer.byteLength}`,
);
```

- [ ] **Step 3: Build + run in the preview.** `cd emulador && npm run build`, then in the preview download an M1 timeframe for one symbol (3 year-partitions). Capture, per partition, `fetch` vs `ingest` ms and bytes, plus the wall-clock total.

- [ ] **Step 4: If `ingest` dominates,** add decode-vs-insert timing inside `parquet.worker.ts` (timestamp before/after the parquet-wasm decode and around the IndexedDB bulk insert) and re-run, so Task 6 knows whether the cost is WASM init/decode or IndexedDB writes. If `fetch` dominates, note that pipelining/parallel downloads is the lever.

- [ ] **Step 5: Record findings.** Write the breakdown + a one-paragraph recommendation (which of: persistent worker reuse / pipeline / bounded-parallel downloads, and the concurrency level) into the task report. Do NOT remove the `console.debug` yet — Task 6 keeps it until the optimization is validated, then removes it.

- [ ] **Step 6: Gate + commit** (instrumentation only, no behaviour change). `npm run lint && npm run format:check && npx ng test --no-watch`:

```bash
git commit -am "chore(r2-perf): instrument download path (fetch vs ingest timing)"
```

### Task 6: Apply the measured optimization (systematic-debugging + angular-signals)

**Skills:** superpowers:systematic-debugging, angular-signals (analogjs).

> **Controller note:** dispatch this task only after Task 5's breakdown is known, and tailor the scope to it. The persistent-worker change below is a guaranteed win (it eliminates per-file parquet-wasm re-init) and is the baseline deliverable; add pipelining / bounded-parallel downloads **only if** Task 5 shows fetch or end-to-end latency still dominates.

**Files:**
- Modify: `emulador/src/app/services/market-data/data-onboarding.service.ts`

**Interfaces:**
- Unchanged public contract: `runJobs(manifest, jobs, onProgress?)` and the per-job `OnboardingProgress` callback keep working so the Markets UI is untouched. The optimization is internal.

- [ ] **Step 1: Reuse one worker per batch.** Today `ingest()` calls `this.workerFactory()` and `worker.terminate()` per partition, so parquet-wasm initializes for every file. Refactor so a single worker is created once per `runJobs` batch and reused across partitions (the worker already caches its WASM init internally, so one instance ⇒ one init), then terminated when the batch finishes. Concretely:
  - Change `ingest(buffer, symbol, timeframe)` to accept the worker: `private ingestOn(worker: IngestWorker, buffer, symbol, timeframe): Promise<void>` — same one-shot `onmessage`/`onerror` resolve/reject logic, but do NOT `terminate()` inside it (only resolve/reject; the batch owns the lifecycle).
  - In `runJobs`, create the worker once and dispose it in a `finally`:
    ```ts
    async runJobs(manifest, jobs, onProgress?) {
      const total = jobs.length;
      const worker = this.workerFactory();
      try {
        for (let i = 0; i < jobs.length; i++) {
          const status = await this.runJob(manifest, jobs[i], worker);
          onProgress?.({ index: i + 1, total, job: jobs[i], status });
        }
      } finally {
        worker.terminate();
      }
    }
    ```
  - Thread the `worker` through `runJob(manifest, job, worker)` to `ingestOn`. Keep the etag-skip + clear-stale-candles + record steps unchanged. (A skipped partition simply never posts to the worker.)

- [ ] **Step 2 (only if Task 5 shows fetch/end-to-end still dominates): overlap download with ingest.** Prefetch the next partition's bytes while the current one ingests — e.g. kick off `downloadParquet` for job `i+1` before awaiting `ingestOn` for job `i`, bounding in-flight downloads to 2–3. Keep ingest strictly sequential (IndexedDB writes serialize per store). Set the concurrency to the value Task 5's data supports.

- [ ] **Step 3: Update/extend tests.** The existing `data-onboarding.service.spec.ts` constructs the service with a fake worker factory and asserts the runJobs flow. Update it so the fake factory returns ONE worker reused across jobs and assert: (a) the factory is called once per `runJobs`, (b) all non-skipped partitions are ingested, (c) the worker is terminated once at the end. Keep RED→GREEN discipline (write/adjust the assertion first, see it fail, then implement).

- [ ] **Step 4: Remove the Task-5 `console.debug`** instrumentation (or guard it behind a clearly dev-only flag) now that the optimization is in.

- [ ] **Step 5: Gate.** `cd emulador && npm run build && npx ng test --no-watch && npm run lint && npm run format:check` — all clean (suite stays green).

- [ ] **Step 6: Commit.**

```bash
git commit -am "perf(r2): reuse one parquet-wasm worker per download batch (+pipeline if measured)"
```

- [ ] **Step 7 (browser-validate):** in the preview, download an M1 timeframe again and compare the wall-clock total against Task 5's baseline; confirm it is meaningfully faster and the data still ingests correctly (chart renders, candle counts match).

---

## Self-review notes (coverage)

- Spec Fix 1 → Task 1. Fix 2 → Task 2. Fix 4 (symbol-click) → Tasks 3–4. Fix 3 (download perf, measure-first) → Tasks 5–6. All spec sections covered.
- Measure-first honored: Task 5 produces the breakdown; Task 6's baseline (worker reuse) is unconditional, while pipeline/parallel are gated on Task 5's data (controller tailors the dispatch).
- Coexistence: only the R2 path + shared primitives (`ModalComponent`, `custom-timeframe.ts`, `MarketDataRepository`, `data-onboarding`) change; CSV/backend branches and the `series` store are untouched. `csv-legacy.repository` gets `getCoverage` only to satisfy the abstract contract.
- Every task names its skills and ends with the CI gate (lint + format:check + ng test + build) before committing — these are the checks `ci.yml` enforces before the Vercel deploy.
