# Retire FastAPI Backend + Offline/Guest Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the now-dead FastAPI backend, the static *offline* build and the *guest* mode, leaving one Angular build that talks only to Supabase (auth + session sync) and Cloudflare R2 (market data) and **requires login**.

**Architecture:** Pure deletion/simplification. With `dataSource='r2'` + Supabase auth already live in every environment, nothing in the runtime path calls FastAPI; this plan deletes that dead code, relocates the still-used MT5→R2 Python pipeline to `pipeline/`, removes the offline build + guest auth states, and updates CI/branch-protection. No new features.

**Tech Stack:** Angular 21 standalone + NgRx (signals); Supabase JS; Cloudflare R2 (parquet-wasm → IndexedDB); Python pipeline (pandas/pyarrow/boto3); GitHub Actions; Vercel.

**Spec:** `docs/superpowers/specs/2026-06-23-retire-fastapi-offline-design.md`

## Global Constraints

- Angular 21 standalone + signals + NgRx; user-facing text in **Spanish**; imitate neighboring files.
- State and `candle.time` in **UNIX seconds**.
- **Login required:** the app no longer has guest/offline auth fallbacks; `authGuard` passes only `authenticated`, everything else → `/login?volver=<url>`.
- Canonical frontend commands (from `emulador/`): `npm run lint`, `npm run format:check`, `npx ng test --no-watch`, `npm run build`. Run **all four** before every commit that touches `emulador/`.
- Pipeline commands (from `pipeline/`): `python -m pytest -q`, `ruff check .`, `ruff format --check .`.
- Do **not** run `npm install` (it re-prunes the stabilized lockfile). No dependency changes are needed in this plan.
- **GitHub-side operations** (branch protection, PR creation, repo settings) go through the **GitHub MCP** (`mcp__github__*`), not `gh`/git. Workflow YAML *file contents* are edited locally and land via the PR.
- Platform: Windows; shell PowerShell + Bash. Use absolute paths / explicit `cd` per command.
- The `syncState` signal in `sesiones-page.component.ts` has a literal `'offline'` value — that is a **session-sync** state, NOT the auth status. **Never** touch it in this plan.

---

## Task 1: Markets page → R2-only

Collapse `mercados-page` to the R2 hub, deleting the backend/offline-catalog branch (its only use of `BackendApiService`, `user-symbols`, `offline-catalog`).

**Files:**
- Modify: `emulador/src/app/pages/mercados/mercados-page.component.ts`
- Modify: `emulador/src/app/pages/mercados/mercados-page.component.html` (delete the non-R2 `@else` block)
- Modify: `emulador/src/app/pages/mercados/mercados-page.component.css` (drop now-unused rules)
- Modify: `emulador/src/app/pages/mercados/mercados-page.component.spec.ts`

**Interfaces:**
- Consumes: `R2MarketsComponent` (selector `app-r2-markets`, unchanged).
- Produces: a `MercadosPageComponent` that renders only `<app-r2-markets>` (plus any existing page header), with no `BackendApiService`/`user-symbols`/`offline-catalog`/`WorkspaceDbService` references.

- [ ] **Step 1: Adjust the test first.** In `mercados-page.component.spec.ts`, remove cases covering the backend/offline catalog branch (symbol list, `toBackendSymbol`, `todos/mis` curation, `remove`). Keep/add a test asserting the component renders `<app-r2-markets>` and provides no `BackendApiService`.

- [ ] **Step 2: Run it, expect FAIL.** `cd emulador && npx ng test --no-watch -- mercados-page` → fails to compile (members still reference removed deps) or assertion fails.

- [ ] **Step 3: Strip the component.** In `mercados-page.component.ts`: remove imports/injects of `BackendApiService`, `UserSymbolsActions`, `userSymbolsFeature`, `WorkspaceDbService`, `DialogService`, `OfflineSymbol`/`DEFAULT_OFFLINE_CATEGORY`, and the UI imports only used by the dead branch (`SegmentedControlComponent`, `MenuComponent`, `BadgeDirective`, `TooltipDirective`, `EmptyStateComponent` if unused). Delete `isR2`/`offline`, `state`, `symbols`, `query`, `mode`, `selected`, `filtered`, `groups`, `load`, `toBackendSymbol`, `remove`, `setMode`, `isSelected`, `toggleSelected`, `onQuery`, `coverageSummary`, `tfTooltip`, `rangeLabel`, `compactCount`, the `constructor` data-init, and `CoverageSummary`/`MarketMode` types. Keep the class as a thin shell importing/rendering `R2MarketsComponent`.

- [ ] **Step 4: Strip the template.** In `mercados-page.component.html`, delete the entire non-R2 branch; keep the page header (if any) and `<app-r2-markets />`. Remove the now-dead CSS in the `.css`.

- [ ] **Step 5: Run the full suite + lint.** `cd emulador && npm run lint && npx ng test --no-watch && npm run build`. Expected: all green.

- [ ] **Step 6: Commit.**
```bash
git add emulador/src/app/pages/mercados/
git commit -m "refactor(mercados): collapse to the R2 hub, drop backend/offline catalog branch"
```

---

## Task 2: New Session wizard → R2-only

Strip the `backend` and `csv` branches from `crear-sesion`, leaving only the R2 flow (`loadR2Assets`/`pickR2Asset`/`confirmR2`).

**Files:**
- Modify: `emulador/src/app/pages/crear-sesion/crear-sesion-page.component.ts`
- Modify: `emulador/src/app/pages/crear-sesion/crear-sesion-page.component.html` (delete non-R2 `@else` blocks)
- Modify: `emulador/src/app/pages/crear-sesion/crear-sesion-page.component.css`
- Modify: `emulador/src/app/pages/crear-sesion/crear-sesion-page.component.spec.ts`

**Interfaces:**
- Consumes: `MarketDataRepository.getCoverage/getCandles`, `StorageManagerService.listDatasets`, `WorkspacesActions.switchAsset`, `r2-coverage.logic` (`intersectBounds`/`isStartValid`/`isEndValid`) — all unchanged.
- Produces: a wizard whose only data path is R2; no `BackendApiService`, `CsvLoaderService`, `offline-catalog`, or `WorkspaceDbService` catalog calls.

- [ ] **Step 1: Adjust the test first.** In the spec, delete tests for the CSV branch (`onCsvFiles`, mixed-symbol error, `confirmCsv`, `pickCatalogSymbol`, `loadCatalog`) and the backend branch (`api.symbols`, `confirm`/`downloadChunked`). Keep/extend R2 tests (`loadR2Assets`, `pickR2Asset`, date validation, `confirmR2`).

- [ ] **Step 2: Run it, expect FAIL.** `cd emulador && npx ng test --no-watch -- crear-sesion`.

- [ ] **Step 3: Strip the component.** In `crear-sesion-page.component.ts`: remove imports/injects of `BackendApiService`/`BackendSymbol`, `CsvLoaderService`, `offline-catalog` (`OfflineSymbol`/`ParsedTf`/`coverageFromParsed`/`DEFAULT_OFFLINE_CATEGORY`), `symbolFromFileName`/`derivePointSize` if now unused, and the `WorkspaceDbService` injection. Delete `isR2`, `source`, `dragOver`, `csvOnly`, `catalog`, `csvError`, `parsedFiles`, `parsedSymbol`, `symbols`, `selected`, the `coverage`/`chosenTfs`/`rangeLabel` helpers used only by csv/backend, and the methods `loadCatalog`, `onDragOver`, `onDrop`, `pickSymbol`, `onCsvFiles`, `pickCatalogSymbol`, `confirmCsv`, `confirm`, `newMeta`, plus `downloading`/`progress`/`downloadError`/`progressPct`/`STREAM_HYDRATE_THRESHOLD`. Make `dateRange`/`dateValid`/`endValid` unconditionally use the R2 path (drop the `if (this.isR2)` guards, keep the R2 body). Keep `R2Asset`, `R2_ANCHORS`, all `r2*` signals/methods, `step`/`selectedTfs`/`startDate`/`endDate`/`sessionName`, `startEpoch`/`endEpoch`/`step2Valid`, `next`/`back`/`isoDate`/`onDate`/`onEndDate`/`onName`, the constructor's R2 path.

- [ ] **Step 4: Strip the template + CSS.** In the `.html`, delete the `@else` (csv + backend) blocks and the dropzone/progress UI; keep the R2 step-1/2/3 markup. Remove dead CSS.

- [ ] **Step 5: Full suite + lint.** `cd emulador && npm run lint && npx ng test --no-watch && npm run build` → green.

- [ ] **Step 6: Commit.**
```bash
git add emulador/src/app/pages/crear-sesion/
git commit -m "refactor(crear-sesion): keep only the R2 flow, drop csv/backend branches"
```

---

## Task 3: Sessions page → R2-only

Drop the legacy CSV import branch in `sesiones-page`, keeping the R2 session import/export and the sync UI untouched.

**Files:**
- Modify: `emulador/src/app/pages/sesiones/sesiones-page.component.ts`
- Modify: `emulador/src/app/pages/sesiones/sesiones-page.component.html`
- Modify: `emulador/src/app/pages/sesiones/sesiones-page.component.spec.ts`

**Interfaces:**
- Produces: a Sessions page with no `environment.dataSource` reference; legacy `onImportSession` (csv) removed; R2 import/export + sync list retained.

- [ ] **Step 1: Read the file** to locate the `isR2 = environment.dataSource === 'r2'` flag (~line 223), the `onImportSession` (csv) method, and the comment (~line 625) marking the `dataSource==='csv'` path. Confirm `syncState` and its `'offline'` literal are separate (sync) — leave them alone.

- [ ] **Step 2: Adjust the test first.** Remove spec cases for the csv `onImportSession` branch; keep tests for the R2 session import/export + sync summary.

- [ ] **Step 3: Run it, expect FAIL.** `cd emulador && npx ng test --no-watch -- sesiones-page`.

- [ ] **Step 4: Strip the branch.** Delete the `isR2` flag and the `dataSource==='csv'` branch + the csv `onImportSession` method and any import/HTML element that only triggered it. Keep the R2 import/export handlers and the sync UI verbatim.

- [ ] **Step 5: Full suite + lint.** `cd emulador && npm run lint && npx ng test --no-watch && npm run build` → green.

- [ ] **Step 6: Commit.**
```bash
git add emulador/src/app/pages/sesiones/
git commit -m "refactor(sesiones): drop legacy csv import, keep R2 import/export + sync"
```

---

## Task 4: Remove the user-symbols feature + BackendApiService

After Tasks 1–2, `BackendApiService` and the `user-symbols` NgRx feature have no consumers.

**Files:**
- Delete: `emulador/src/app/state/user-symbols/` (actions, reducer, effects, and all `*.spec.ts`)
- Delete: `emulador/src/app/services/backend-api.service.ts`, `emulador/src/app/services/backend-api.service.spec.ts`
- Modify: `emulador/src/app/app.config.ts`

**Interfaces:**
- Produces: an `app.config.ts` with no `userSymbolsFeature`/`UserSymbolsEffects`; no `BackendApiService` anywhere in `src/`.

- [ ] **Step 1: Confirm no consumers remain.** `cd emulador && rg -n "BackendApiService|user-symbols|userSymbolsFeature|UserSymbolsEffects|UserSymbolsActions" src/` → only the files about to be deleted/edited appear.

- [ ] **Step 2: Delete the files.**
```bash
git rm -r emulador/src/app/state/user-symbols
git rm emulador/src/app/services/backend-api.service.ts emulador/src/app/services/backend-api.service.spec.ts
```

- [ ] **Step 3: Edit `app.config.ts`.** Remove the `userSymbolsFeature` import + its `provideStore` entry, and the `UserSymbolsEffects` import + its `provideEffects` argument.

- [ ] **Step 4: Full suite + lint.** `cd emulador && npm run lint && npx ng test --no-watch && npm run build` → green.

- [ ] **Step 5: Commit.**
```bash
git add emulador/src/app/app.config.ts
git commit -m "refactor: remove user-symbols feature and BackendApiService (dead)"
```

---

## Task 5: Remove authInterceptor

The interceptor only added `withCredentials`/refresh for `environment.backendUrl` requests; with the backend gone it has nothing to do.

**Files:**
- Delete: `emulador/src/app/auth/auth.interceptor.ts`, `emulador/src/app/auth/auth.interceptor.spec.ts`
- Modify: `emulador/src/app/app.config.ts`

- [ ] **Step 1: Confirm.** `cd emulador && rg -n "authInterceptor" src/` → only `app.config.ts` + the interceptor files.

- [ ] **Step 2: Delete + unwire.**
```bash
git rm emulador/src/app/auth/auth.interceptor.ts emulador/src/app/auth/auth.interceptor.spec.ts
```
In `app.config.ts`, change `provideHttpClient(withInterceptors([authInterceptor]))` to `provideHttpClient()` and drop the `withInterceptors` import + the `authInterceptor` import.

- [ ] **Step 3: Full suite + lint.** `cd emulador && npm run lint && npx ng test --no-watch && npm run build` → green.

- [ ] **Step 4: Commit.**
```bash
git add emulador/src/app/app.config.ts
git commit -m "refactor(auth): remove backend cookie-refresh interceptor (dead)"
```

---

## Task 6: Remove the CSV legacy repository + simplify the data-source provider

`dataSource` will be removed in Task 9; collapse the repository provider to the R2/IndexedDB implementation now.

**Files:**
- Delete: `emulador/src/app/domain/csv-legacy.repository.ts`
- Modify: `emulador/src/app/domain/market-data-repository.provider.ts`
- Modify: `emulador/src/app/domain/market-data.repository.ts` (drop `pickMarketDataRepository` + the `csv` option if it has no other use)
- Modify: `emulador/src/app/domain/market-data-repository.spec.ts`

**Interfaces:**
- Produces: `provideMarketDataRepository()` binds `MarketDataRepository` → `IndexedDbMarketDataRepository` unconditionally (no `WorkspaceDbService` dep).

- [ ] **Step 1: Adjust the test first.** In `market-data-repository.spec.ts`, remove cases for `pickMarketDataRepository('csv', …)`/`CsvMarketDataRepository`; keep/add a test that `provideMarketDataRepository()` yields an `IndexedDbMarketDataRepository`.

- [ ] **Step 2: Run it, expect FAIL.** `cd emulador && npx ng test --no-watch -- market-data-repository`.

- [ ] **Step 3: Simplify the provider.** Rewrite `market-data-repository.provider.ts`:
```ts
import { MarketDataRepository } from './market-data.repository';
import { IndexedDbMarketDataRepository } from './indexed-db.repository';

/** Binds the MarketDataRepository token to the R2/IndexedDB implementation. */
export function provideMarketDataRepository() {
  return { provide: MarketDataRepository, useClass: IndexedDbMarketDataRepository };
}
```
In `market-data.repository.ts`, delete `pickMarketDataRepository` and the `csv` branch (keep the abstract `MarketDataRepository` class/token). Delete `csv-legacy.repository.ts`.

- [ ] **Step 4: Confirm + full suite.** `cd emulador && rg -n "CsvMarketDataRepository|pickMarketDataRepository|csv-legacy" src/` → empty. Then `npm run lint && npx ng test --no-watch && npm run build` → green.

- [ ] **Step 5: Commit.**
```bash
git add emulador/src/app/domain/
git commit -m "refactor(domain): always use the R2/IndexedDB repository, drop csv-legacy"
```

---

## Task 7: Remove the offline CSV catalog (offline-catalog + workspace-db symbols store)

After Tasks 1–2 nothing uploads or lists CSV catalog symbols.

**Files:**
- Delete: `emulador/src/app/services/offline-catalog.ts` (+ its `*.spec.ts` if present)
- Modify: `emulador/src/app/services/workspace-db.service.ts`
- Modify: `emulador/src/app/services/workspace-db.service.spec.ts`

**Interfaces:**
- Produces: a `WorkspaceDbService` without `putSymbol`/`getSymbol`/`listSymbols`/`removeSymbol` and without creating the `symbols` store. `DB_VERSION` is **left unchanged** (existing DBs keep the orphan store harmlessly).

- [ ] **Step 1: Confirm consumers gone.** `cd emulador && rg -n "offline-catalog|OfflineSymbol|putSymbol|getSymbol\b|listSymbols|removeSymbol" src/` → only `workspace-db.service*` + `offline-catalog*`.

- [ ] **Step 2: Adjust the test first.** Remove `workspace-db.service.spec.ts` cases for the `symbols` store CRUD + `removeSymbol` cascade. Keep series/meta/folders cases.

- [ ] **Step 3: Run it, expect FAIL.** `cd emulador && npx ng test --no-watch -- workspace-db`.

- [ ] **Step 4: Delete + prune.** `git rm emulador/src/app/services/offline-catalog.ts` (and its spec if any). In `workspace-db.service.ts`, delete `putSymbol`/`getSymbol`/`listSymbols`/`removeSymbol` and the `symbols` object-store creation in `onupgradeneeded` (add a one-line comment noting `DB_VERSION` is intentionally not bumped). Remove any `OfflineSymbol` import.

- [ ] **Step 5: Full suite + lint.** `cd emulador && npm run lint && npx ng test --no-watch && npm run build` → green.

- [ ] **Step 6: Commit.**
```bash
git add emulador/src/app/services/
git commit -m "refactor(db): remove the offline CSV catalog (symbols store + offline-catalog)"
```

---

## Task 8: Login required — remove guest mode + the offline auth status

Behavioral change (TDD): `authGuard` passes only `authenticated`; the session check resolves `authenticated`/`anonymous`; no guest entry, no `offline` auth fallback.

**Files:**
- Modify: `emulador/src/app/state/auth/auth.reducer.ts`
- Modify: `emulador/src/app/state/auth/auth.actions.ts`
- Modify: `emulador/src/app/state/auth/auth.effects.ts`
- Modify: `emulador/src/app/auth/auth.guard.ts`
- Modify: `emulador/src/app/pages/auth/auth-page.component.{ts,html}`
- Modify: `emulador/src/app/app.html`
- Modify: `emulador/src/app/state/sync/session-sync.effects.ts`
- Delete: `emulador/src/app/state/auth/auth.effects.offline.spec.ts`
- Modify specs: `auth.guard.spec.ts`, `auth.reducer.spec.ts` (or equivalent), `auth.effects*.spec.ts`, `session-sync.effects.spec.ts`

**Interfaces:**
- Produces: `AuthStatus = 'unknown' | 'authenticated' | 'anonymous'`; `AuthActions` without `continueAsGuest`; `sessionResolved` payload `props<{ user: AuthUser | null }>()`; `authGuard` returns `true` only for `authenticated`.

- [ ] **Step 1: Write/adjust the failing tests first.**
  - `auth.guard.spec.ts`: `authenticated` → `true`; `anonymous` → `UrlTree('/login', { volver })`; remove `guest`/`offline` "pass" cases.
  - `auth.reducer.spec.ts`: `sessionResolved({ user })` → `authenticated` when user, `anonymous` when null; remove `continueAsGuest`/`offline` cases.
  - `auth.effects` spec: `check$` → `sessionResolved({ user })` (no guest short-circuit, no `offline` flag).
  - Delete `auth.effects.offline.spec.ts`.

- [ ] **Step 2: Run, expect FAIL.** `cd emulador && npx ng test --no-watch -- auth`.

- [ ] **Step 3: Edit the reducer.** In `auth.reducer.ts`, set `export type AuthStatus = 'unknown' | 'authenticated' | 'anonymous';`. `sessionResolved` → `status: user ? 'authenticated' : 'anonymous'`. Delete the `on(AuthActions.continueAsGuest, …)`. `loggedOut` stays `anonymous`.

- [ ] **Step 4: Edit actions.** In `auth.actions.ts`, remove `'Continue As Guest'`; change `'Session Resolved'` to `props<{ user: AuthUser | null }>()`; update its doc comment.

- [ ] **Step 5: Edit effects.** In `auth.effects.ts`: delete `GUEST_KEY`, `guestPersisted`, the `persistGuest$` effect, and the guest cleanup in `redirectAfterLogout$`. Rewrite `check$`:
```ts
check$ = createEffect(() =>
  this.actions$.pipe(
    ofType(AuthActions.checkSession),
    exhaustMap(() =>
      from(this.auth.getUser()).pipe(
        map((user) => AuthActions.sessionResolved({ user })),
        catchError(() => of(AuthActions.sessionResolved({ user: null }))),
      ),
    ),
  ),
);
```
Keep `init$`, `login$`, `navigateAfterAuth$`, `logout$`, and `redirectAfterLogout$` (minus the guest-key removal).

- [ ] **Step 6: Edit the guard.** In `auth.guard.ts`, map to `true` only when `status === 'authenticated'`, else `router.createUrlTree(['/login'], { queryParams: { volver: state.url } })`. Update the doc comment.

- [ ] **Step 7: Remove guest UI.** In `auth-page.component.{ts,html}` delete the "Continuar como invitado" button + its handler (and the `registrationEnabled`/`guestModeEnabled` references). In `app.html` delete the `@else if (status() === 'guest')` and `@else if (status() === 'offline')` pill blocks, leaving `@if (authenticated) { … } @else { iniciar sesión }`.

- [ ] **Step 8: Remove guest adoption in sync.** In `session-sync.effects.ts` (+spec) delete the "adopt guest sessions on login" path (and any `'guest'`/`'offline'` auth-status branch). Do **not** touch the sync `'offline'` *connectivity* state if present there.

- [ ] **Step 9: Full suite + lint.** `cd emulador && npm run lint && npx ng test --no-watch && npm run build` → green. Then `rg -n "continueAsGuest|guestPersisted|'guest'|guestModeEnabled" src/` → empty.

- [ ] **Step 10: Commit.**
```bash
git add emulador/src/app
git commit -m "feat(auth): require login — remove guest mode and the offline auth status"
```

---

## Task 9: Remove the offline build + purge env flags + simplify onboarding

Last step on the frontend: now that no code reads `dataSource`/`offlineOnly`/`backendUrl`/`registrationEnabled`/`guestModeEnabled`, delete them and the offline build.

**Files:**
- Delete: `emulador/src/environments/environment.offline.ts`
- Modify: `emulador/src/environments/environment.ts`, `environment.prod.ts`
- Modify: `emulador/angular.json` (remove the `offline` build + serve configurations)
- Modify: `emulador/src/app/components/data-wizard/onboarding-decision.ts`
- Modify: `emulador/src/app/components/data-wizard/data-wizard.guard.ts`
- Modify specs: `onboarding-decision.spec.ts`, `data-wizard.guard.spec.ts` (if present)

**Interfaces:**
- Produces: `environment` objects of shape `{ supabaseUrl, supabaseAnonKey, marketDataBaseUrl }`. `needsR2Onboarding(datasetCount: number): boolean` (no `dataSource` param).

- [ ] **Step 1: Confirm no readers remain.** `cd emulador && rg -n "environment\.(dataSource|offlineOnly|backendUrl|registrationEnabled|guestModeEnabled)" src/` → empty. (If anything appears, fix that file before continuing — it belongs to an earlier task.)

- [ ] **Step 2: Adjust onboarding tests first.** Update `onboarding-decision.spec.ts` to call `needsR2Onboarding(0) === true`, `needsR2Onboarding(3) === false`.

- [ ] **Step 3: Run, expect FAIL.** `cd emulador && npx ng test --no-watch -- onboarding-decision`.

- [ ] **Step 4: Simplify onboarding.** Rewrite `onboarding-decision.ts`:
```ts
/** First-launch redirect: a brand-new user (no datasets yet) goes to /mercados. */
export function needsR2Onboarding(datasetCount: number): boolean {
  return datasetCount === 0;
}
```
Update `data-wizard.guard.ts` to call `needsR2Onboarding(count)` without the `dataSource` argument.

- [ ] **Step 5: Trim the env files.** In `environment.ts` and `environment.prod.ts`, reduce the object + inline type to `{ supabaseUrl: string; supabaseAnonKey: string; marketDataBaseUrl: string }` with the existing Supabase/R2 values; delete `backendUrl`/`registrationEnabled`/`offlineOnly`/`guestModeEnabled`/`dataSource`. Delete `environment.offline.ts`.

- [ ] **Step 6: Remove the offline build config.** In `angular.json`, delete the `configurations.offline` block under `build` and the `configurations.offline` under `serve` (`emulador:build:offline`). Leave `production`/`development` intact.

- [ ] **Step 7: Verify the offline build is gone + full suite.** `cd emulador && (npm run build -- --configuration offline; echo "exit=$?")` → must FAIL (configuration not found). Then `npm run lint && npm run format:check && npx ng test --no-watch && npm run build` → green.

- [ ] **Step 8: Commit.**
```bash
git add emulador/src/environments emulador/angular.json emulador/src/app/components/data-wizard
git commit -m "chore(env): drop offline build + dead env flags (backendUrl/dataSource/guest)"
```

---

## Task 10: Relocate the R2 pipeline to `pipeline/`

Move the still-used MT5→R2 pipeline out of `backend/` so the next task can delete `backend/` wholesale.

**Files:**
- Move (`git mv`): `backend/parquet_builder.py` → `pipeline/parquet_builder.py`; `backend/r2_uploader.py` → `pipeline/r2_uploader.py`; `backend/manifest.py` → `pipeline/manifest.py`; `backend/tests/test_parquet_builder.py` → `pipeline/tests/test_parquet_builder.py`; `backend/tests/test_r2_uploader.py` → `pipeline/tests/test_r2_uploader.py`; `backend/tests/test_manifest.py` → `pipeline/tests/test_manifest.py`
- Create: `pipeline/requirements.txt`, `pipeline/requirements-dev.txt`, `pipeline/ruff.toml`

**Interfaces:**
- Produces: importable flat modules `parquet_builder`, `r2_uploader`, `manifest` under `pipeline/`, with `mt5_common` still resolved from the repo root.

- [ ] **Step 1: Move the files.**
```bash
mkdir -p pipeline/tests
git mv backend/parquet_builder.py backend/r2_uploader.py backend/manifest.py pipeline/
git mv backend/tests/test_parquet_builder.py backend/tests/test_r2_uploader.py backend/tests/test_manifest.py pipeline/tests/
```

- [ ] **Step 2: Fix test sys.path.** In each moved test, the module dir is now `pipeline/` (`dirname(dirname(__file__))`) — unchanged shape — and `mt5_common` lives at repo root. `test_parquet_builder.py`/`test_r2_uploader.py`/`test_manifest.py` insert `dirname(dirname(__file__))` (→ `pipeline/`): correct for the flat modules. Verify `import manifest` resolves inside `r2_uploader._main`/`_dry_run` (both files in `pipeline/`). Adjust any path hop that pointed at `backend/`.

- [ ] **Step 3: Add pipeline deps + ruff.** `pipeline/requirements.txt`:
```
pandas
pyarrow
boto3
```
`pipeline/requirements-dev.txt`:
```
-r requirements.txt
pytest
ruff
pip-audit
```
Copy `backend/ruff.toml` to `pipeline/ruff.toml` (same rules).

- [ ] **Step 4: Run the pipeline tests + lint.** `cd pipeline && python -m pytest -q && ruff check . && ruff format --check .` → green (MT5 tests are `importorskip`, so skipped).

- [ ] **Step 5: Commit.**
```bash
git add pipeline
git commit -m "refactor(pipeline): relocate MT5->R2 parquet/uploader/manifest out of backend/"
```

---

## Task 11: Delete the FastAPI backend + harvester

With the pipeline moved out, `backend/` holds only the FastAPI app, alembic, harvester and dead tests.

**Files:**
- Delete: the entire `backend/` directory.

- [ ] **Step 1: Confirm only dead code remains.** `git ls-files backend/` shows `app/`, `alembic/`, `alembic.ini`, `Dockerfile`, `harvester.py`, `scripts/create_user.py`, `tests/{conftest,test_auth,test_candles,test_ingest,test_user_symbols,test_health,test_harvester}.py`, `README.md`, `requirements*.txt`, `ruff.toml` — and **no** parquet/r2/manifest files (moved in Task 10).

- [ ] **Step 2: Confirm nothing references it.** `rg -n "backend/|from app\.|import app\b" --glob '!**/node_modules/**' .` → only docs/specs/plans and CI (handled in later tasks); no live code import.

- [ ] **Step 3: Delete.**
```bash
git rm -r backend
```

- [ ] **Step 4: Verify the pipeline still stands alone.** `cd pipeline && python -m pytest -q` → green.

- [ ] **Step 5: Commit.**
```bash
git commit -m "feat: remove the FastAPI backend (auth/symbols/candles/ingest) + harvester"
```

---

## Task 12: Delete infra (Docker / Postgres / Flagsmith / nginx)

**Files:**
- Delete: `infra/` (whole dir: `docker-compose.yml`, `docker-compose.full.yml`, `flagsmith/seed.py`)
- Delete: `emulador/Dockerfile`, `emulador/nginx.conf`

- [ ] **Step 1: Confirm no references.** `rg -n "docker-compose|flagsmith|nginx\.conf|infra/" --glob '!**/node_modules/**' .` → only docs + CI (CI handled in Task 13).

- [ ] **Step 2: Delete.**
```bash
git rm -r infra
git rm emulador/Dockerfile emulador/nginx.conf
```

- [ ] **Step 3: Commit.**
```bash
git commit -m "chore(infra): remove Docker/Postgres/Flagsmith/nginx stack (Supabase+R2 only)"
```

---

## Task 13: Update CI (`ci.yml`) and delete `cd.yml`

**Files:**
- Modify: `.github/workflows/ci.yml`
- Delete: `.github/workflows/cd.yml`

**Interfaces:**
- Produces: two required CI jobs — `Pipeline (lint · tests)` and `Frontend (lint · tests · build · audit)`; no Docker job; no offline build step; the `deploy` (Vercel · prod) job retained.

- [ ] **Step 1: Rewrite the backend job as the pipeline job.** Replace the `backend` job with:
```yaml
  pipeline:
    name: Pipeline (lint · tests)
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: pipeline
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
          cache: pip
          cache-dependency-path: pipeline/requirements*.txt
      - name: Install dependencies
        run: pip install -r requirements-dev.txt
      - name: Lint + format (ruff)
        run: |
          ruff check .
          ruff format --check .
      - name: Unit tests (pytest)
        run: python -m pytest -q
      - name: Dependency audit (pip-audit)
        run: pip-audit -r requirements.txt
```

- [ ] **Step 2: Drop the Docker job + offline build step.** Delete the entire `docker-build` job. In the `frontend` job delete the `- name: Offline static build` step. Update the `deploy` job's `needs:` from `[backend, frontend, docker-build]` to `[pipeline, frontend]`.

- [ ] **Step 3: Delete CD.** `git rm .github/workflows/cd.yml`.

- [ ] **Step 4: Validate YAML locally.** Confirm the file parses (e.g. `python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml'))"`).

- [ ] **Step 5: Commit.**
```bash
git add .github/workflows/ci.yml
git commit -m "ci: replace backend+docker jobs with a pipeline job; drop offline build and CD images"
```

---

## Task 14: Update `.env` / `.env.example` and rewrite the README

**Files:**
- Modify: `.env.example` (and `.env` if tracked — it is **not** committed; edit the local copy only if present)
- Modify: `README.md`
- Modify: `emulador/README.md` (align if it mentions the backend/offline build)

- [ ] **Step 1: Trim `.env.example`.** Keep only the R2 variables (`R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, optional `R2_ENDPOINT`) with a one-line comment each. Delete `POSTGRES_*`, `DATABASE_URL`, `JWT_SECRET`, `INGEST_API_KEY`, `CORS_ORIGINS`, `COOKIE_*`, `TIMESCALE_ENABLED`, `REGISTRATION_ENABLED`, `ENABLE_DOCS`, `FLAGSMITH_*`, `DEMO_*`, `BACKEND_URL`, `HARVEST_*`.

- [ ] **Step 2: Rewrite `README.md`.** New architecture diagram/text: *Angular 21 + NgRx SPA → Supabase (Auth + Postgres/RLS for session sync) + Cloudflare R2 (parquet → IndexedDB)*; data pipeline `pipeline/` (`parquet_builder` → `r2_uploader` → `manifest.json`). Delete the FastAPI/Postgres/Flagsmith/Docker/full-stack/harvester/usuario-demo sections and the "Despliegue estático ($0, solo frontend)" section. Keep the strategy scripts section (`scripts/`, `.mq5`). Document `pipeline/` usage + the R2 env vars. Update the "Tests y calidad" section to `cd pipeline && python -m pytest -q` + the frontend commands.

- [ ] **Step 3: Align `emulador/README.md`** if it references the backend, offline build or guest mode.

- [ ] **Step 4: Commit.**
```bash
git add .env.example README.md emulador/README.md
git commit -m "docs: rewrite README for the Supabase+R2 architecture; trim .env to R2 vars"
```

---

## Task 15: Branch protection + PR (GitHub MCP)

Finish-line, GitHub-side only — performed with the **GitHub MCP** (`mcp__github__*`), coordinated so the PR is not blocked by checks this PR removes.

- [ ] **Step 1: Open the PR via GitHub MCP.** Push the branch and create a PR `claude/retire-fastapi-backend` → `main` titled "Retire FastAPI backend + offline/guest mode (phase 3)". Body summarizes the deletions + the login-required change; ends with the Claude Code generated-by footer.

- [ ] **Step 2: Read current branch protection.** Via GitHub MCP, get `main`'s protection. Confirm the current required status checks include `Backend (lint · tests · audit)` and `Docker (compose config · image builds)` (which no longer run).

- [ ] **Step 3: Update required checks via GitHub MCP.** Set the required status check contexts to exactly `Pipeline (lint · tests)` and `Frontend (lint · tests · build · audit)` (drop `Backend` and `Docker`). Keep `strict` and the existing PR-required / no-approvals settings. Do this **before** attempting merge so the renamed/removed jobs don't block the PR.

- [ ] **Step 4: Verify CI is green on the PR**, then hand off to the human for merge (per the master prompt: stop and request merge at the end of the phase).

---

## Self-Review

**Spec coverage:**
- §3 backend refs → Tasks 1,2,3 (page branches), 4 (user-symbols + BackendApiService), 5 (interceptor), 6 (csv repo + provider), 9 (env flags). ✅
- §4 offline build + guest → Task 8 (guest/offline auth), Task 9 (offline build + `environment.offline.ts` + angular.json). ✅
- §5 Python (delete backend, drop harvester, relocate pipeline) → Tasks 10, 11. ✅
- §6 infra/CI/CD/branch-protection → Tasks 12, 13, 15. ✅
- §7 config/docs → Task 14. ✅
- §8 error/edge (offline status collapse, DB_VERSION not bumped) → Task 8 (offline removal), Task 7 (DB_VERSION note). ✅
- §9 verification (suite green, offline build gone, browser no localhost:8000) → per-task green gates + Task 9 Step 7; browser-validation noted for execution. ✅

**Placeholder scan:** No TBD/TODO; every code step shows the resulting code or an exact deletion + a grep/command to verify. ✅

**Type consistency:** `AuthStatus = 'unknown' | 'authenticated' | 'anonymous'` and `sessionResolved({ user })` are used consistently in Task 8; `needsR2Onboarding(datasetCount)` consistent across Task 9 Steps 2/4; `provideMarketDataRepository()` → `IndexedDbMarketDataRepository` consistent in Task 6. ✅

**Ordering safety:** consumers are stripped (Tasks 1–8) before their dependencies/flags are deleted (Tasks 6,7,9); the pipeline is moved (Task 10) before `backend/` is deleted (Task 11); the CI pipeline job (Task 13) lands after `pipeline/` exists (Task 10); branch protection is updated (Task 15) before merge. ✅
