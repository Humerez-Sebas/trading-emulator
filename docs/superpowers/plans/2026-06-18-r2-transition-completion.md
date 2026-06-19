# Complete the R2 Transition — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make R2/Parquet the app's primary, persistent flow — replace the toolbar number-box with a TradingView-style interval dialog, turn Markets into the R2 data hub, re-source New Session from downloaded data, and make Sessions import/export `.session.json` — while keeping CSV/backend behind the `dataSource` flag.

**Architecture:** Angular 21 (standalone + signals) + NgRx. Each restructured page branches on `environment.dataSource` ('r2' = new flow, 'csv' = existing flow untouched). New R2 logic reuses services already built: `ManifestService`, `ParquetDownloadService`, `DataOnboardingService`, `MarketDataRepository`, `StorageManagerService`, `session.service`, `TimeframeGenerator`, `custom-timeframe.ts`.

**Tech Stack:** Angular 21, NgRx Store/Effects, IndexedDB (fake-indexeddb in tests), Vitest via `ng test`, lightweight-charts.

**Spec:** `docs/superpowers/specs/2026-06-18-r2-transition-completion-design.md` (read it first).

## Global Constraints

- **Flag coexistence:** `environment.dataSource` is `'csv' | 'r2'`, default `'r2'`. Restructured pages render the R2 flow when `'r2'`, else the existing backend/CSV flow. NEVER delete CSV/backend code; gate it. The `series` IndexedDB store + `switchAsset`/workspace/replay flow are SHARED — do not remove.
- **Reuse, don't reinvent** the services listed above. Confirm their real signatures by reading the files before use.
- **Anchors only:** stored data is M1/H1/D1; all other intervals are generated in memory.
- **Test runner:** `ng test` is canonical (`cd emulador && npx ng test --no-watch`). Raw `npx vitest run` cannot load @ngrx/TestBed specs ("@angular/compiler not available") — not a real failure; use it only for pure (non-@ngrx) specs.
- **Pure logic is unit-tested; modals, the global key trigger, downloads, and live session restore are browser-validated** (preview), not in CI.
- **House style:** standalone components, signals, NgRx; Spanish user-facing text; match surrounding files.
- **Times:** app state is unix **seconds**; `.session.json` v1 uses **milliseconds** + minutes — convert at the export/import boundary only.

---

## Milestone 1 — TradingView-style interval input

### Task 1: Interval parse + format helpers (pure)

**Files:**
- Modify: `emulador/src/app/state/market/custom-timeframe.ts`
- Test: `emulador/src/app/state/market/custom-timeframe.spec.ts`

**Interfaces:**
- Produces: `parseInterval(raw: string | number, max?: number): number | null`; `formatIntervalVerbose(min: number): string`; `formatIntervalShort(min: number): string`. (Keep existing `pickBaseSeriesTf`, `generateCustomSeries`. `parseCustomTimeframe` is renamed to `parseInterval` with unit support; update the one caller in `controls.component.ts` — removed in Task 3 anyway.)

- [ ] **Step 1: Write failing tests** in `custom-timeframe.spec.ts`:

```ts
import { parseInterval, formatIntervalVerbose, formatIntervalShort } from './custom-timeframe';

describe('parseInterval', () => {
  it('parses bare minutes', () => { expect(parseInterval('45')).toBe(45); expect(parseInterval(90)).toBe(90); });
  it('parses H as hours and D as days (case-insensitive, trims)', () => {
    expect(parseInterval('2H')).toBe(120); expect(parseInterval(' 2h ')).toBe(120);
    expect(parseInterval('1D')).toBe(1440); expect(parseInterval('3d')).toBe(4320);
  });
  it('rejects junk, zero, fractional, out-of-range', () => {
    for (const bad of ['', 'abc', '0', '-5', '4.5', '2W', '99999999']) expect(parseInterval(bad)).toBeNull();
  });
});
describe('formatIntervalVerbose', () => {
  it('uses minutos / horas / días, singular for 1', () => {
    expect(formatIntervalVerbose(21)).toBe('21 minutos');
    expect(formatIntervalVerbose(120)).toBe('2 horas');
    expect(formatIntervalVerbose(60)).toBe('1 hora');
    expect(formatIntervalVerbose(1440)).toBe('1 día');
    expect(formatIntervalVerbose(90)).toBe('90 minutos'); // not a whole hour
  });
});
describe('formatIntervalShort', () => {
  it('compact canonical', () => {
    expect(formatIntervalShort(45)).toBe('45m');
    expect(formatIntervalShort(120)).toBe('2h');
    expect(formatIntervalShort(1440)).toBe('1D');
  });
});
```

- [ ] **Step 2: Run, verify fail.** `cd emulador && npx vitest run src/app/state/market/custom-timeframe.spec.ts` → FAIL (parseInterval not exported).

- [ ] **Step 3: Implement** in `custom-timeframe.ts`:

```ts
export const MAX_INTERVAL_MINUTES = 43_200; // 30 días

export function parseInterval(raw: string | number, max = MAX_INTERVAL_MINUTES): number | null {
  const s = String(raw).trim();
  const m = /^(\d+)\s*([hHdD]?)$/.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  const mult = m[2] === '' ? 1 : m[2].toLowerCase() === 'h' ? 60 : 1440;
  const minutes = n * mult;
  if (!Number.isInteger(minutes) || minutes <= 0 || minutes > max) return null;
  return minutes;
}

export function formatIntervalVerbose(min: number): string {
  if (min % 1440 === 0) { const d = min / 1440; return `${d} ${d === 1 ? 'día' : 'días'}`; }
  if (min % 60 === 0) { const h = min / 60; return `${h} ${h === 1 ? 'hora' : 'horas'}`; }
  return `${min} ${min === 1 ? 'minuto' : 'minutos'}`;
}

export function formatIntervalShort(min: number): string {
  if (min % 1440 === 0) return `${min / 1440}D`;
  if (min % 60 === 0) return `${min / 60}h`;
  return `${min}m`;
}
```

Keep `parseCustomTimeframe` as a thin alias (`export const parseCustomTimeframe = parseInterval;`) until Task 3 removes its last caller, to avoid breaking the build mid-milestone.

- [ ] **Step 4: Run, verify pass.** Same command → PASS.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "feat(timeframe): interval parse (min/H/D) + verbose/short formatters"`

### Task 2: minutes → loaded-TF mapping (pure)

**Files:**
- Modify: `emulador/src/app/state/market/custom-timeframe.ts`
- Test: `emulador/src/app/state/market/custom-timeframe.spec.ts`

**Interfaces:**
- Consumes: `TIMEFRAME_SECONDS`, `Timeframe`, `TIMEFRAME_ORDER` from `../../models`.
- Produces: `loadedTfForMinutes(minutes: number, loadedTfs: Timeframe[]): Timeframe | null` — the loaded TF whose seconds equal `minutes*60`, else null. Used by the dialog's apply logic to decide `changeTimeframe` vs `changeCustomTimeframe`.

- [ ] **Step 1: Failing test:**

```ts
import { loadedTfForMinutes } from './custom-timeframe';
describe('loadedTfForMinutes', () => {
  it('returns the loaded TF matching the exact minutes', () => {
    expect(loadedTfForMinutes(60, ['M1','H1','D1'])).toBe('H1');
    expect(loadedTfForMinutes(1440, ['H1','D1'])).toBe('D1');
  });
  it('null when no loaded TF matches', () => {
    expect(loadedTfForMinutes(45, ['H1','D1'])).toBeNull();
    expect(loadedTfForMinutes(60, ['D1'])).toBeNull();
  });
});
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement:**

```ts
import { Timeframe, TIMEFRAME_ORDER, TIMEFRAME_SECONDS } from '../../models';

export function loadedTfForMinutes(minutes: number, loadedTfs: Timeframe[]): Timeframe | null {
  const target = minutes * 60;
  const set = new Set(loadedTfs);
  for (const tf of TIMEFRAME_ORDER) {
    if (set.has(tf) && TIMEFRAME_SECONDS[tf] === target) return tf;
  }
  return null;
}
```

- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit.** `git commit -am "feat(timeframe): loadedTfForMinutes mapping helper"`

### Task 3: IntervalDialogComponent (modal, type-to-open, apply, block+download)

**Files:**
- Create: `emulador/src/app/components/interval-dialog/interval-dialog.component.ts` (+ `.html`, `.css`)
- Modify: `emulador/src/app/pages/emulador/emulador-page.component.ts` (host `<app-interval-dialog>`)
- Modify: `emulador/src/app/components/controls/controls.component.ts` + `.html` + `.css` (remove the `<input type=number>`, `setCustomTf`, `customTf` import usage that backed the old box; keep H1/D1 quick buttons; their `.active` reconciles with the unified interval — H1 active when `activeTf==='H1' && customTf===null`).

**Interfaces:**
- Consumes: `parseInterval`, `formatIntervalVerbose`, `loadedTfForMinutes`, `pickBaseSeriesTf` (custom-timeframe.ts); `anchorFor` (`services/timeframe-generator.ts`); `MarketActions.changeTimeframe`/`changeCustomTimeframe`; `marketFeature.selectSeries`/`selectActiveTf`/`selectCustomTf`; `selectCurrentAsset`; `ManifestService`, `DataOnboardingService` (download missing anchor); `MarketDataRepository` (read back ingested candles). Read these files for exact signatures first.

- [ ] **Step 1:** Read `controls.component.*`, `services/data-onboarding.service.ts`, `services/market-data/manifest.service.ts`, `state/market/market.actions.ts`, `state/selectors.ts` to confirm signatures.

- [ ] **Step 2:** Create `IntervalDialogComponent` (standalone, signals). Behavior:
  - `open = signal(false)`, `raw = signal('')`. A `@HostListener('document:keydown', ['$event'])` (or `effect`-registered listener) opens it when `!open()`, the event target is not an `input`/`textarea`/`[contenteditable]`, and `event.key` is a digit `0-9` → set `raw` to that digit, `open=true`, focus the input next tick.
  - `minutes = computed(() => parseInterval(this.raw()))`; `verbose = computed(() => { const m = this.minutes(); return m ? formatIntervalVerbose(m) : ''; })`.
  - Loaded TFs from `selectSeries` (keys with non-empty arrays). `neededAnchor = computed(...)`: when `minutes()` set and `pickBaseSeriesTf(series, minutes())` is null → `anchorFor(minutes())` (the missing anchor); else null.
  - `canApply = computed(() => this.minutes() !== null && this.neededAnchor() === null)`.
  - Template: input bound to `raw` (`(input)`/`(keyup.enter)="apply()"`, `(keyup.esc)="close()"`), the `verbose()` line, and — when `neededAnchor()` — a notice `"Necesitas {{neededAnchor()}} para {{formatIntervalShort(minutes())}}"` + a "Descargar {{neededAnchor()}}" button (`(click)="downloadAnchor()"`) with a progress indicator.
  - `apply()`: if `!canApply()` return; `const min = this.minutes()!; const tf = loadedTfForMinutes(min, loadedTfs); tf ? dispatch(changeTimeframe({tf})) : dispatch(changeCustomTimeframe({minutes: min}));` then `close()`.
  - `downloadAnchor()`: fetch manifest (`ManifestService.fetchManifest`), build the jobs = ALL partitions of `neededAnchor()` for the current symbol (M1→every year via `listM1Years`; H1/D1→`'all'`), run `DataOnboardingService.runJobs(manifest, jobs, onProgress)`, then for the downloaded anchor read candles via `MarketDataRepository.getCandles(symbol, anchorTf)` and `dispatch(MarketActions.csvLoaded({tf: anchorTf, candles, fileName: ...}))` so the generator can aggregate; then `apply()`.

- [ ] **Step 3:** Host it: add `<app-interval-dialog />` to `emulador-page.component.ts` template + imports.

- [ ] **Step 4:** Remove the old toolbar number input from `controls.component.html` and the `setCustomTf`/number-input plumbing in `controls.component.ts` (keep `customTf` signal only if still used for button highlight; otherwise remove). Add a small CSS for the modal in `interval-dialog.component.css` (reuse `--space-*`, `--surface-2`, `--accent` tokens like other components).

- [ ] **Step 5:** Build + the existing suite: `cd emulador && npm run build && npx ng test --no-watch`. Expected: build clean; all tests pass (the custom-timeframe specs from Tasks 1-2 included).

- [ ] **Step 6: Commit.** `git commit -am "feat(timeframe): TradingView-style interval dialog (type-to-open, min/H/D, block+download); remove toolbar number box"`

- [ ] **Step 7 (browser-validate):** In preview (`/loop`-style not needed): type `90` on the chart → modal shows "90 minutos"; if M1 missing, shows "Necesitas M1…" + Descargar; Enter applies and the chart re-renders. (Manual; note results.)

---

## Milestone 2 — Markets = the R2 data hub

### Task 4: Manifest⟷downloaded status diffing (pure)

**Files:**
- Create: `emulador/src/app/pages/mercados/r2-catalog.logic.ts`
- Test: `emulador/src/app/pages/mercados/r2-catalog.logic.spec.ts`

**Interfaces:**
- Consumes: `Manifest`, `ManifestTf` (`services/market-data/manifest.service.ts`); `DatasetRecord` (`services/market-data-db.ts`).
- Produces: `buildCatalog(manifest: Manifest, datasets: DatasetRecord[]): AssetCatalogEntry[]` where `AssetCatalogEntry = { symbol; partitions: { tf: 'm1'|'h1'|'d1'; partition: string; downloaded: boolean; updateAvailable: boolean }[] }`. `updateAvailable` = downloaded && local etag !== manifest etag.

- [ ] **Step 1: Failing test** — build a manifest (XAUUSD m1:{2024,2025}, h1:{all}) + datasets ([m1|2024 etag e-old]) and assert: 2024 downloaded with updateAvailable when manifest etag differs; 2025 not downloaded; h1 not downloaded. (Write concrete fixtures + assertions.)
- [ ] **Step 2: Run, verify fail.** `npx vitest run src/app/pages/mercados/r2-catalog.logic.spec.ts`
- [ ] **Step 3: Implement** `buildCatalog` (iterate manifest symbols→tf→partitions; look up `datasets` by `${symbol}|${TF}|${partition}` where TF is uppercase and partition is the year or `'all'`; compute downloaded + updateAvailable).
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit.** `git commit -am "feat(markets): manifest-vs-downloaded catalog diffing (pure)"`

### Task 5: Markets R2 hub UI + absorb wizard/storage-manager + routing

**Files:**
- Modify: `emulador/src/app/pages/mercados/mercados-page.component.ts` + `.html` + `.css`
- Modify: `emulador/src/app/app.routes.ts` (remove `/data-wizard` and `/almacenamiento`; update `r2OnboardingGuard` target → `/mercados`)
- Modify: `emulador/src/app/components/data-wizard/data-wizard.guard.ts` (redirect to `/mercados`)
- Delete: `emulador/src/app/components/data-wizard/` and `emulador/src/app/pages/storage-manager/` component files (KEEP the reusable logic by moving any still-needed pure helpers into Markets or a shared spot; `StorageManagerService`, `storage-manager.logic.ts` stay — re-home under `services/market-data/` if cleaner). Keep their `.spec.ts` for the moved logic.

**Interfaces:**
- Consumes: `buildCatalog` (Task 4); `ManifestService`; `DataOnboardingService.runJobs`; `StorageManagerService` (listDatasets, deleteDataset, checkForUpdates); `WorkspaceDbService.listDatasets`; `environment.dataSource`.

- [ ] **Step 1:** Read `mercados-page.component.*`, `pages/storage-manager/*`, `components/data-wizard/*` to plan the merge.
- [ ] **Step 2:** Add an `r2` branch to `MercadosPageComponent`: when `environment.dataSource==='r2'`, on init fetch the manifest + `listDatasets()` and render `buildCatalog(...)` — one card per symbol showing downloaded vs available partitions, a "Descargar" action per missing partition (or per symbol) via `DataOnboardingService.runJobs` with progress, a "Eliminar" per downloaded dataset via `StorageManagerService.deleteDataset`, and an "actualización disponible" badge from `checkForUpdates`. Keep the existing backend/offline-catalog branch for `'csv'`.
- [ ] **Step 3:** Remove the `/data-wizard` and `/almacenamiento` routes; point `r2OnboardingGuard` at `/mercados`. Delete the absorbed components; re-home any pure logic still imported (e.g. `storage-manager.logic.ts`) so nothing dangles.
- [ ] **Step 4:** Build + tests: `npm run build && npx ng test --no-watch`. Fix any imports broken by the deletions. Expected: clean.
- [ ] **Step 5: Commit.** `git commit -am "feat(markets): R2 data hub (catalog+download+delete+updates); absorb Data Wizard + Storage Manager"`
- [ ] **Step 6 (browser-validate):** Fresh IndexedDB + `dataSource='r2'` → guard routes to `/mercados`; download a TF; status updates; delete works.

---

## Milestone 3 — New Session = R2-sourced

### Task 6: New Session R2 source + date validation

**Files:**
- Create: `emulador/src/app/pages/crear-sesion/r2-coverage.logic.ts` (+ spec) — pure: `downloadedCoverage(datasets, candlesCounts?)` / date-range from the loaded series; and `clampStartEnd(...)` validation mirroring the existing `dateValid`/`endValid` but sourced from downloaded data.
- Modify: `emulador/src/app/pages/crear-sesion/crear-sesion-page.component.ts` + `.html`

**Interfaces:**
- Consumes: `MarketDataRepository.getCandles`; `WorkspaceDbService.listDatasets`/`getWorkspace`; `WorkspacesActions.switchAsset` (`thenLoad`, `thenGoTo`, `thenSessionEnd`, `thenNewSession`); `DatasetRecord`.
- Produces: the date-range helper used by the wizard step 2 validation.

- [ ] **Step 1:** Write the failing pure-helper spec (date-range from a set of downloaded anchors → `{from,to}` in seconds; start/end validation). Run, verify fail.
- [ ] **Step 2:** Implement the pure helper. Run, verify pass.
- [ ] **Step 3:** Add an `r2` branch to `CrearSesionPageComponent`: step 1 lists downloaded assets (`listDatasets` → unique symbols); step 2 offers the downloaded anchors as TFs + start/end date validated against the downloaded coverage; confirm reads candles via `MarketDataRepository.getCandles` per selected anchor and dispatches `switchAsset({ symbol, selectedTfs, thenLoad: pending, thenGoTo: startSec, thenSessionEnd: endSec, thenNewSession })`, then navigates to `/`. Keep the existing backend/CSV branches for `'csv'`. To avoid the known restore race, ensure the switchAsset/restore is dispatched before `navigateByUrl('/')` (it already is — confirm).
- [ ] **Step 4:** Build + tests. Expected clean.
- [ ] **Step 5: Commit.** `git commit -am "feat(new-session): R2-sourced wizard (downloaded assets + start/end) "`
- [ ] **Step 6 (browser-validate):** Create a session from a downloaded asset with a start+end date; chart opens positioned correctly with candles.

---

## Milestone 4 — Sessions = `.session.json` export/import

### Task 7: SessionSnapshot build + restore mapping (pure)

**Files:**
- Modify: `emulador/src/app/services/session.service.ts` (add pure builders/mappers; keep existing export/parse/missingDatasets)
- Test: `emulador/src/app/services/session.service.spec.ts`

**Interfaces:**
- Consumes: `SessionFileV1`, `SessionSnapshot`, `AnchorTf`, `TradingData`, `Drawing`, `Candle`.
- Produces: `snapshotFromState(state): SessionSnapshot` (maps live NgRx slices → snapshot; **seconds→ms**, active interval→minutes); `restorePlan(file: SessionFileV1): { symbol; selectedTfs; thenGoTo; currentTimeframe; trading; drawings; ... }` (maps a parsed file → the values the import will dispatch; **ms→seconds**). Keep these PURE (take plain inputs, return plain outputs) so they unit-test without TestBed.

- [ ] **Step 1: Failing tests** — round-trip: a state fixture → `snapshotFromState` → `buildSessionFile` → `parse` → `restorePlan` yields back the same symbol, seconds-based cursor, minutes interval, trades/drawings. Assert unit conversion (a replayTime of 1_700_000_000s → 1_700_000_000_000ms in the file → back to seconds). Run, verify fail.
- [ ] **Step 2: Implement** the two pure mappers. Run, verify pass.
- [ ] **Step 3: Commit.** `git commit -am "feat(session): pure snapshot-from-state + restore-plan mappers (s↔ms)"`

### Task 8: Session JSON export wiring

**Files:**
- Modify: `emulador/src/app/components/session-summary/session-summary.component.ts` + `.html` (add "Exportar sesión" next to "Exportar CSV")
- Modify: `emulador/src/app/pages/sesiones/sesiones-page.component.ts` + `.html` (per-card "Exportar sesión" action in the card menu)

**Interfaces:**
- Consumes: `snapshotFromState` (Task 7); `session.service.exportSession`; the selectors needed to assemble the snapshot (`selectCurrentAsset`, trading/replay/drawings/market selectors).

- [ ] **Step 1:** In the session-summary, assemble a `SessionSnapshot` from the store (via `snapshotFromState` fed by `selectSignal`s) and call `exportSession(...)` on a new "Exportar sesión (.session.json)" button. Keep "Exportar CSV".
- [ ] **Step 2:** Add the same per-session export to the Sesiones card menu (for the active session; archived sessions export their stored `trading`+cursor).
- [ ] **Step 3:** Build + tests. Expected clean.
- [ ] **Step 4: Commit.** `git commit -am "feat(session): .session.json export from summary + Sesiones cards"`
- [ ] **Step 5 (browser-validate):** End a session → "Exportar sesión" downloads a `.session.json` containing `requiredDatasets` and no candles.

### Task 9: Session JSON import + missing-dataset modal + restore

**Files:**
- Create: `emulador/src/app/components/missing-dataset-dialog/` (modal listing missing datasets + download action) — or inline in Sesiones if small.
- Modify: `emulador/src/app/pages/sesiones/sesiones-page.component.ts` + `.html` (replace `onImportSession` CSV path with `.session.json` import when `dataSource==='r2'`; keep CSV import under `'csv'`).

**Interfaces:**
- Consumes: `session.service.parse`, `findMissingDatasets`, `restorePlan` (Task 7); `DataOnboardingService.runJobs` + `ManifestService` (download missing); `WorkspacesActions.switchAsset` + trading/drawings/replay restore actions (read `state/trading/trading.actions.ts`, `state/replay/replay.actions.ts`, `state/drawings/drawings.actions.ts` for the exact restore actions; if no single "restore full trading state" action exists, add one — e.g. `TradingActions.restoreSession({ trading })` — with a reducer case, as its own sub-step with a test).

- [ ] **Step 1:** Read the trading/replay/drawings actions+reducers to determine how to inject a restored session. If a full-restore action is missing, add `TradingActions.restoreSession` + reducer case first (TDD: reducer test asserting state replaced).
- [ ] **Step 2:** Implement import: read file → `parse` → on `future`/`invalid` show the reason; on `ok` → `findMissingDatasets(session)`; if non-empty, open the missing-dataset modal listing them with a "Descargar de R2" action (`DataOnboardingService.runJobs` over the missing partitions) → on success, proceed; then `restorePlan(file)` → dispatch `switchAsset` (load the required anchors) + the trading/drawings/replay restore + interval (`changeTimeframe`/`changeCustomTimeframe` for `currentTimeframe`) → `navigateByUrl('/')`.
- [ ] **Step 3:** Gate: this replaces the CSV import only when `dataSource==='r2'`; keep `parseSessionCsv` path for `'csv'`.
- [ ] **Step 4:** Build + tests. Expected clean.
- [ ] **Step 5: Commit.** `git commit -am "feat(session): .session.json import — version gate, missing-dataset download, live restore"`
- [ ] **Step 6 (browser-validate):** Export a session, delete its dataset in Markets, re-import the JSON → "Falta el dataset — ¿descargar?" appears → download → session restores and the chart opens. (This is Checkpoint 3 of the original spec.)

---

## Milestone 5 — CSV flag default + navigation cleanup

### Task 10: dataSource='r2' across envs + route/CORS finalization

**Files:**
- Modify: `emulador/src/environments/environment.ts` (already `'r2'`), `environment.offline.ts`, `environment.prod.ts` (`dataSource: 'r2'` + `marketDataBaseUrl` = the public R2 URL).
- Modify: `emulador/src/app/app.routes.ts` (confirm `/data-wizard` + `/almacenamiento` removed — done in Task 5).

- [ ] **Step 1:** Set `dataSource: 'r2'` and `marketDataBaseUrl: 'https://pub-e67bee09f18745d49ba2ea16e15b537d.r2.dev'` in `environment.offline.ts` and `environment.prod.ts` (type already allows it). Leave CSV code intact.
- [ ] **Step 2:** Build all configs: `npm run build` and `npm run build -- --configuration offline`. Expected clean.
- [ ] **Step 3: Commit.** `git commit -am "chore(env): default dataSource=r2 across dev/offline/prod"`
- [ ] **Step 4 (deploy note, NOT code):** The deployed offline origin (e.g. the Vercel domain) must be added to the R2 bucket CORS `AllowedOrigins` (dashboard) — r2.dev returns no CORS header by default. Document in the PR description.

---

## Self-review notes (coverage)

- Spec M1 → Tasks 1-3. M2 → Tasks 4-5. M3 → Task 6. M4 → Tasks 7-9. M5 → Task 10. All spec sections covered.
- Risk areas (per spec §7): the live restore (Task 9) gets its own restore-action sub-step; dual-mode branching is additive (csv branches untouched); deployed-origin CORS is a documented deploy step (Task 10 Step 4).
- Browser-validated items are explicit per task; pure logic (Tasks 1,2,4,6,7) is unit-tested via TDD with concrete code.
