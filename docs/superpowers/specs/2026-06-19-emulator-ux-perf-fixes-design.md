# Emulator UX + performance fixes — Design

**Date:** 2026-06-19
**Status:** Approved (brainstorming) — ready for implementation plan
**Branch baseline:** `claude/emulator-ux-perf-fixes`, branched from `main` after PR #4
(the R2 transition) merged (`10a6631`). All four fixes touch code that now lives on
`main`: `interval-dialog`, `controls`, `ModalComponent`, the Markets R2 hub
download path, and the R2 branch of `crear-sesion`.

## 1. Goal

Four targeted fixes on top of the merged R2 transition: two small UX corrections,
and two performance items (one measurement-driven). No new features — polish +
responsiveness on the R2 flow.

## 2. Global constraints

- Angular 21 standalone + signals + NgRx; Spanish user-facing text; match
  surrounding files.
- `environment.dataSource` defaults to `'r2'`; the CSV/backend branches stay intact
  behind the flag — do not touch them. These fixes only affect the R2 path and
  shared UI primitives (`ModalComponent`, `custom-timeframe.ts`).
- Test runner is `ng test` (`cd emulador && npx ng test --no-watch`). Pure logic is
  unit-tested (TDD); the modal focus behaviour, the download performance, and the
  symbol-click responsiveness are browser-validated in the preview.
- App state is unix **seconds**; candle `time` is seconds.

## 3. Fixes

### Fix 1 — Custom-TF chip label uses M/H/D prefix (pure, TDD)

**Now:** `formatIntervalShort(min)` (`emulador/src/app/state/market/custom-timeframe.ts`)
returns a suffix style — `45m` / `2h` / `1D`. The toolbar chip in
`components/controls` renders it verbatim, which looks inconsistent next to the
`M1 / H1 / D1` quick buttons.

**Change:** return an MT5-style **prefix**, consistent with the standard buttons:
- whole days → `D<n>` (1440 → `D1`, 4320 → `D3`)
- whole hours → `H<n>` (120 → `H2`, 180 → `H3`)
- otherwise → `M<min>` (21 → `M21`, 90 → `M90`)

Only `formatIntervalShort` changes. `formatIntervalVerbose` (the Spanish line in the
dialog, e.g. "21 minutos") is unchanged. Update the `formatIntervalShort` unit test
to the new expectations.

### Fix 2 — Type-to-open focuses the input, not the × (browser-validated)

**Root cause:** `ModalComponent.ngAfterViewInit`
(`emulador/src/app/components/ui/modal.component.ts`) focuses `focusable()[0]`, and
the first focusable element in the panel is the header **× close button** (it
precedes the body). When the interval dialog opens via a digit keypress, the
modal's `queueMicrotask(() => first.focus())` wins over the dialog's own
"focus the input next tick", so the × gets focus and typing does not flow into the
input.

**Change:** give `ModalComponent` an optional **designated initial focus** — e.g. an
`autoFocus` input (a CSS selector resolved within the panel, or a boolean that makes
it prefer the body's first focusable over the header ×). The `interval-dialog`
designates its `<input>` as the initial focus so the opening digit lands in the
input and subsequent typing is fluid. Preserve the existing focus trap, ESC/backdrop
close, and return-focus-on-teardown. Keep the change reusable (other modals keep
current behaviour when they don't opt in).

### Fix 3 — Markets download performance (measure first, then optimize)

**Observed:** downloading an M1 timeframe in Mercados takes too long.

**Root causes identified (to be confirmed by measurement):**
- `DataOnboardingService.runJobs` is **sequential**: each partition does
  `download → ingest → record` and the next never overlaps.
- `ingest()` spawns a **fresh worker per partition** (`workerFactory()`) and
  terminates it, so **parquet-wasm is re-initialized for every file**.
- `ParquetDownloadService.downloadParquet` is a plain `fetch → arrayBuffer` (no
  pipeline, no concurrency). IndexedDB writes serialize per object store.

**Approach — two stages:**
1. **Measure:** instrument the download path to record, per partition, the time
   spent in (a) network fetch, (b) WASM decode, (c) IndexedDB insert. Run a real M1
   download and capture the breakdown (dev-only logging is fine).
2. **Optimize, guided by the data**, from these candidates (most-likely-impactful
   first): **reuse one long-lived WASM worker** across partitions (eliminates
   per-file re-init); **pipeline** (start the next download while the current file
   decodes/inserts); **bounded-concurrent downloads** (2–3) for the "download
   remaining" action. Ingest parallelism stays bounded because IndexedDB writes
   serialize per store. The final choice and concurrency level are set from the
   measured breakdown, not assumed.

Keep the `DataOnboardingService` public contract (`runJobs(manifest, jobs,
onProgress)`) and the per-job progress callback intact so the Markets UI keeps
working unchanged; the optimization is internal.

### Fix 4 — Symbol-click delay in New Session (repo: TDD; UI: browser-validated)

**Root cause:** in `crear-sesion`'s R2 branch, `pickR2Asset` eagerly reads **all
candles of all downloaded anchors** via `MarketDataRepository.getCandles` — for M1
that is hundreds of thousands to ~1M rows — only to compute the coverage date range.
`getCandles` itself does `index.getAll(range)` + `.map()` + `.sort()` over every row,
blocking the main thread for seconds on click.

**Change:** add a cheap coverage query to `MarketDataRepository`, e.g.
`getCoverage(symbol, tf): Promise<{ from: number; to: number } | null>`, that reads
only the **first and last** candle `time` via an index cursor (`openCursor` with
`'next'` and `'prev'`, one record each) — O(1)-ish, no full materialization.
`pickR2Asset` uses `getCoverage` to compute the selectable date range instantly, and
**defers** the heavy full-candle load to the "Confirmar" step (where a spinner is
acceptable). The pure/IndexedDB logic of `getCoverage` is unit-tested with
fake-indexeddb; the click responsiveness is browser-validated.

## 4. Testing

- **Unit (`ng test`):** `formatIntervalShort` new prefix mapping; `getCoverage`
  (first/last via cursor) against fake-indexeddb.
- **Browser-validated (preview):** interval-dialog type-to-open lands focus in the
  input and types fluidly; Markets M1 download is meaningfully faster after the
  optimization; New Session symbol click is instant and the chart still opens with
  candles after Confirmar.

## 5. Out of scope

- Any change to the CSV/backend path or the `series` store.
- Re-architecting the worker/WASM beyond what the measurement justifies.
- New product features.

## 6. Risks / watch-items

- Fix 2 touches the shared `ModalComponent` — keep the opt-in so existing modals
  (session-summary, csv-start-dialog, missing-dataset) behave exactly as before.
- Fix 3's optimization is data-driven; the plan sequences measure → decide →
  implement so the chosen strategy matches the real bottleneck.
- Fix 4's `getCoverage` must return seconds and handle the empty-store case (null).
