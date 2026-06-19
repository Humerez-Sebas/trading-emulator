# Complete the R2 Transition — Design

**Date:** 2026-06-18
**Status:** Approved (brainstorming) — ready for implementation plan
**Branch baseline:** `claude/sad-feynman-e57266` (Trading Emulator v2; Tasks 1–11 + R2 fill done)

## 1. Goal

Make the Cloudflare R2 / Parquet data source the app's primary, persistent flow,
and finish the UX around it. Two things motivated this:

1. The custom-timeframe input added in Task 11 (a number box in the toolbar) is
   not the desired UX; replace it with a TradingView-style interval dialog.
2. The R2 Data Wizard is a one-shot — after onboarding, downloaded assets have no
   persistent home, and the three main pages (Mercados, Nueva sesión, Sesiones)
   still assume the backend/CSV model.

This is delivered as ONE spec with five milestones. CSV/backend behavior is kept
behind the existing `environment.dataSource` flag (rollback), so each restructured
page branches on `dataSource` rather than deleting the legacy path.

## 2. Current state (verified)

- `dataSource='r2'` works end-to-end (dev): wizard → R2 download → parquet-wasm
  worker ingest → IndexedDB `candles` → chart. R2 bucket `trading-emulator-data`
  filled with US30/NAS100/SP500/XAUUSD (M1 2024–2026 + H1 + D1 + `manifest.json`);
  public URL `https://pub-e67bee09f18745d49ba2ea16e15b537d.r2.dev`.
- Custom TF engine (Task 11) works: `MarketState.customTf/customSeries`,
  `changeCustomTimeframe`/`customTimeframeGenerated`, `MarketEffects.customTimeframe$`
  (aggregates loaded anchors via `generateCustomSeries`), `selectActiveCandles`
  branches to `customSeries`. The toolbar `<input type=number>` is the UX to replace.
- Pages today: **Mercados** = backend/offline-catalog symbol list (curation/search);
  **Nueva sesión** (`crear-sesion`) = 3-step wizard (asset → TFs + start/end date →
  name), source backend `downloadChunked` or CSV upload, confirms via
  `switchAsset({thenGoTo, thenSessionEnd, thenNewSession})`; **Sesiones** = session
  hub (folders/cards/equity) with CSV session import (`parseSessionCsv`) and an
  "Exportar CSV" trade-log button in the session-summary.
- Reusable R2 services already built: `ManifestService`, `ParquetDownloadService`,
  `DataOnboardingService` (download→worker ingest→datasets record), `MarketDataRepository`
  (CSV/R2 factory), `StorageManagerService` (list/usage/etag-diff/delete),
  `session.service` (`.session.json` build/parse/version-gate/missingDatasets +
  unwired `exportSession`), `TimeframeGenerator`/`custom-timeframe.ts`.

## 3. Decisions (from brainstorming)

1. **Interval trigger:** type-to-open only (a digit on the focused chart opens the modal).
2. **Units:** bare number = minutes; `H`=×60; `D`=×1440.
3. **Display:** unified canonical interval; if the value equals a loaded anchor it
   highlights that quick button, else shows a canonical custom chip.
4. **Unavailable anchor:** block + offer download (fetch ALL partitions of the missing
   anchor for the symbol, ingest, then apply).
5. **CSV:** flag off, keep code. `dataSource` defaults to `'r2'`; CSV code stays behind
   the flag as rollback; full deletion deferred to a later Phase-3 cleanup.
6. **Markets:** full R2 hub — absorbs the Data Wizard + Storage Manager; `/data-wizard`
   and `/almacenamiento` removed; first-launch guard routes to `/mercados`.
7. **Session JSON:** add `.session.json` export to the summary + per-card on Sesiones;
   KEEP "Exportar CSV" (trade log); replace the CSV session IMPORT with `.session.json`
   import + missing-dataset prompt + restore.

## 4. Global constraints

- **Coexistence via flag:** restructured pages render the R2 flow when
  `environment.dataSource==='r2'` and the existing backend/CSV flow otherwise. Do not
  delete CSV/backend code; gate it. The `series` IndexedDB store and the
  `switchAsset`/workspace/replay flow are SHARED by both paths — do not remove them.
- **Reuse, don't reinvent:** build on the existing services listed in §2.
- **Anchors only:** stored data remains M1/H1/D1; everything else is generated.
- **Testing:** pure logic is unit-tested under `ng test` (the canonical runner —
  raw `npx vitest run` cannot load @ngrx/TestBed specs). Modals, the global key
  trigger, downloads, and live session restore are browser-validated.
- **House style:** Angular 21 standalone + signals + NgRx; Spanish user-facing text.

## 5. Milestone designs

### M1 — TradingView-style interval input

**Component:** new `components/interval-dialog/` (modal overlay), mounted on the
emulador page, hidden by default. A `document` `keydown` listener (ignored when focus
is in `input`/`textarea`/`[contenteditable]`, and when already open) opens it on a
**digit** keypress, prefilling that digit. Shows: the text input, a live
interpretation line, and (when relevant) a missing-anchor notice + download action.
**Enter** applies, **Esc**/backdrop closes.

**Pure helpers (`state/market/custom-timeframe.ts`, unit-tested):**
- `parseInterval(raw): number | null` — `^\s*(\d+)\s*([hHdD]?)\s*$`; bare→min, H→×60,
  D→×1440; bounds 1–43200. (Generalizes the current `parseCustomTimeframe`.)
- `formatIntervalVerbose(min): string` — modal line: `"21 minutos"`, `"2 horas"`,
  `"1 día"` (exact h/d when divisible, else minutes), Spanish.
- `formatIntervalShort(min): string` — toolbar chip: `"45m"`, `"2h"`, `"1D"`.

**Apply logic:** if `min` equals a **loaded** anchor/TF (e.g. 60→H1, 1440→D1, 240→H4
when loaded) dispatch the existing `changeTimeframe(tf)` (so its quick button
highlights, no chip); else dispatch `changeCustomTimeframe(min)` and show the
canonical chip. Maps minutes→`Timeframe` via `TIMEFRAME_SECONDS`.

**Missing-anchor block + download:** as the user types, compute `anchorFor(min)` and
`pickBaseSeriesTf(loadedSeries, min)`. If nothing loaded can produce it: disable Enter,
show e.g. "Necesitas M1 para 45m" + a "Descargar M1" button. The button uses
`ManifestService` + `DataOnboardingService.runJobs` to fetch ALL partitions of that
anchor for the current symbol (M1→every manifest year), ingest to `candles`, load into
`market.series` (read back via `MarketDataRepository` → `csvLoaded`) with progress,
then auto-apply the interval.

**Removed:** the toolbar `<input type=number>` and `setCustomTf` in
`components/controls/controls.component.*`; the H1/D1 quick-button highlight reconciles
with the unified current interval.

### M2 — Markets = the R2 data hub

When `dataSource==='r2'`, `/mercados` becomes the single place to browse and manage R2
data, absorbing the Data Wizard and Storage Manager:
- **List** manifest symbols (`ManifestService.fetchManifest` → `listSymbols`).
- **Per-asset status:** for each symbol, diff manifest vs the `datasets` store to show
  which M1 years / H1 / D1 are downloaded vs available; an "actualización disponible"
  badge when a local etag differs from the manifest (`StorageManagerService` logic).
- **Download** missing partitions via `DataOnboardingService.runJobs` (progress).
- **Delete** downloaded data via `StorageManagerService.deleteDataset` (+ clear candles).
- **Routing:** remove `/data-wizard` and `/almacenamiento`; fold their logic into
  Markets; their standalone components are removed (services they used are kept and
  reused). `r2OnboardingGuard` redirects first-time users (empty `datasets`) to
  `/mercados`.
- Under `dataSource==='csv'`: Markets keeps its current backend/offline-catalog
  behavior unchanged (gated branch).

### M3 — New Session = R2-sourced

When `dataSource==='r2'`, the 3-step `crear-sesion` wizard is re-sourced:
- **Step 1:** list **downloaded** assets (symbols present in the `datasets` store).
- **Step 2:** pick TFs from the downloaded anchors; pick **start & end date** validated
  against the downloaded data's coverage (min/max candle time for the asset).
- **Step 3:** name + summary.
- **Confirm:** read candles via `MarketDataRepository.getCandles` for the selected
  anchors → `switchAsset({ symbol, selectedTfs, thenLoad, thenGoTo: start,
  thenSessionEnd: end, thenNewSession })` (same path the wizard uses today).
- Under `csv`: the existing backend/CSV-upload wizard stays (gated branch).

### M4 — Sessions = `.session.json` export/import

**Export:** build a `SessionSnapshot` (session.service shape: symbol, initialBalance,
startRange/endRange ms, replayTime ms, currentTimeframe minutes, playbackSpeed, trades,
pendingOrders, drawings, notes, anchorTimeframes, years) from live NgRx selectors;
call `session.service.exportSession`. Triggers: "Exportar sesión (.session.json)" in the
session-summary (on session end) and a per-session export action on Sesiones cards.
**Keep** "Exportar CSV" (trade log) unchanged.

**Import (replaces CSV import on Sesiones):** read file → `session.service.parse`
(version gate: ==1 load, >1 reject with "actualiza el emulador", <1 migrate seam) →
`findMissingDatasets` against the `datasets` store → if any missing, show a "Falta el
dataset — ¿descargar de R2?" modal listing them and offering download via
`DataOnboardingService` → once present, **restore** the session into NgRx: `switchAsset`
to the symbol with the required anchors loaded, then restore trading state
(trades/pendingOrders/balance), drawings/notes, and the replay cursor
(`state.replayTime`) + `currentTimeframe` + playbackSpeed → navigate to the chart.

**Units:** app state stores unix **seconds** (e.g. replay cursor, candle `time`), but the
`.session.json` v1 schema uses **milliseconds** for `startRange`/`endRange`/`replayTime`
and **minutes** for `currentTimeframe`. Export converts seconds→ms and the active
interval→minutes; import converts back (ms→seconds) before dispatching the restore.

This milestone completes the deferred Task 8/9 UI: the live snapshot assembly (export),
the missing-dataset modal, and the live restore (import).

### M5 — CSV flag + navigation cleanup

- `environment.dataSource` defaults to `'r2'` in dev, offline, and prod; `marketDataBaseUrl`
  set in each (the deployed offline origin must be added to the R2 bucket CORS policy —
  call this out; it is a deploy-time action, not code).
- All CSV/backend code (CsvMarketDataRepository, csv-loader, `csv-start-dialog`, backend
  `downloadChunked`/BackendApiService market paths, offline-catalog, demo-CSV seeding)
  stays intact and reachable when `dataSource==='csv'`. No deletion this iteration.
- Remove the `/data-wizard` and `/almacenamiento` routes (absorbed by Markets).

## 6. Testing

- **Unit (`ng test`):** `parseInterval`, `formatIntervalVerbose`/`Short`, the
  minutes↔loaded-TF mapping; manifest↔downloaded diffing (status per asset);
  `SessionSnapshot` build from a state fixture; the import restore-action mapping;
  New-Session date-range validation against downloaded coverage.
- **Browser-validated (Task-12-style):** the interval modal + global key trigger,
  Markets download/delete, missing-anchor download-then-apply, the New-Session R2 flow,
  and the `.session.json` export→delete-dataset→re-import "missing dataset" round-trip.

## 7. Risks / watch-items

- **Live session restore (M4)** is the most intricate piece — mapping `SessionFileV1`
  back into NgRx (trading + drawings + replay + market) across the `switchAsset` flow.
  Keep the snapshot/restore mapping pure and unit-tested; wire actions thinly.
- **Dual-mode branching (r2/csv)** on three pages adds surface; keep the csv branches as
  the existing code, untouched, behind a single `dataSource` check.
- **Deployed-origin CORS:** flipping offline/prod to `r2` means the deployed app's origin
  needs an R2 bucket CORS entry; the r2.dev public URL returns no CORS header by default.
- A minor wizard→navigate restore race exists today (chart shows 0 velas until reload);
  the M2/M3 re-source should dispatch restore before navigating to avoid it.

## 8. Out of scope

- Phase-3 deletion of CSV/backend code (separate later cleanup).
- Weekly/monthly custom intervals (only min/H/D).
- Any change to the harvester/uploader backend (already done).
