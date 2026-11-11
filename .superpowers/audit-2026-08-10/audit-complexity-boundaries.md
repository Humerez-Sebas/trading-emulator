# TD Audit — Complexity, Naming, Duplication, Dead Code, Boundaries & Encapsulation

Repo: `C:\Users\78701\Desktop\trading-emulator`, branch `develop`, HEAD `a2ca53b`
Auditor role: Principal Engineer, READ-ONLY. Date: 2026-08-10.
Scope of writes: only files under `.superpowers/audit-2026-08-10/`. No repository source was modified.

---

## STATUS

**~65% complete.**

### AREAS COMPLETE
- **(1) Function & method complexity** — mechanical measurement DONE (all functions in `emulador/src`, AST-based: LOC, branch count, max nesting, param count). Top-30 table below. Qualitative READ + verdict done for 5 of the top 8 (`doSwitch`, `handleMouseDown`, `onKeyDown`, `lotaje mount/onRootKeyDown` structural read, `open()` IDB family). Verdicts for the rest are marked NOT-READ.
- **(5) Dead code — unused exports** — mechanical scan DONE and *classified* (truly dead vs over-exported vs spec-only), including false-positive elimination (dynamic `import()` routes, `main.ts`, `angular.json` fileReplacements, HTML templates).
- **(6) Circular dependencies** — DONE (Tarjan SCC over the resolved import graph). Exactly 1 cycle.
- **(6) Deep relative paths + path aliases** — DONE (histogram + tsconfig inspection).
- **(3) Naming census — mechanical part** — DONE (low-information identifier census, boolean-prefix adherence, negated-boolean census).

### AREAS PARTIAL
- **(1) Complexity** — 3 of the top-8 functions not yet read for a coherence verdict (`trading-capability.render`, `fill-engine.processCandle`, `sizing-view-model.deriveLots`).
- **(2) File & module size** — fan-in/fan-out/export-count/LOC measured for all files; "distinct concepts + reasons to change" read done for 4 of the 11 named large files (`lotaje-view.ts`, `chart.component.ts`, `sesiones-page.component.ts`, `workspaces.effects.ts`). `selectors.ts`, `session-sync.service.ts`, `chart-model-mapper.service.ts`, `fill-engine.ts`, `chart-panel.component.ts`, `workspace-viewport.component.ts`, `drawings.reducer.ts`, `telemetry.effects.ts` measured but NOT read.
- **(3) Misleading names** — the highest-value sub-area. Started; 3 confirmed candidates below. NOT swept systematically across services/selectors/actions/signals/CSS classes.
- **(4) Duplication** — 6 concrete candidates found and classified with counts. NOT done: chart setup, DTO/mapping conversion, error translation, coordinate/math logic, selector logic, styling patterns, test setup. No token-based scan (jscpd/madge are NOT installed; installing is forbidden).
- **(5) Dead code — non-export forms** — unused *exports* done; NOT done: unreachable branches, commented-out implementations, migration/compat shims, dead feature flags, stale styles, stale tests, repo-root abandoned prototypes (`topbar-hud/` seen to exist, not assessed).

### AREAS NOT STARTED
- **(6)** Feature-to-feature import mapping and cross-layer violation scan (UI→infrastructure, domain→Angular, state→components). The engine-boundary invariant (`ChartEngine` must not import Angular/NgRx) was NOT verified.
- **(7) Public API / encapsulation** — the spec-only *export* list (92) exists, but the spec-only *class-member* scan was written and never run to completion; mutable-internal-exposure and "no clear public boundary" analysis not done.

---

## MEASURED BASELINE

Command: `node scratchpad/analyze.js` (source pasted in APPENDIX A).

```
files under emulador/src : 386 .ts  (202 non-spec, 184 spec) + 30 .html
non-spec TS LOC          : 33,562
unused exports (raw)     : 92
circular deps (SCC>1)    : 1
deep relative imports    : depth1=367  depth2=564  depth3=3
low-info identifiers     : 806 declarations
boolean declarations     : 107 (73 not is/has/can/should-prefixed)
negated-sense names      : 4 distinct / 50 occurrences
```

`emulador/tsconfig.json` has **no `paths` key** → no path aliases exist; every internal
import is relative. (Read: `emulador/tsconfig.json`.)

---

## FINDINGS SO FAR

### TD-01 — `doSwitch`: IO, temporal contract, and intent-translation fused in one 182-line method

- **Category:** Function complexity / mixed responsibility (commands + queries)
- **Severity:** HIGH
- **Scope:** `emulador/src/app/state/workspaces/workspaces.effects.ts`
- **Evidence:**
  - `src/app/state/workspaces/workspaces.effects.ts:274` — `doSwitch`, 182 LOC, 30 branches, max nesting 3, 3 params. Largest function in the repo.
  - `:275-286` — the first parameter is an **anonymous inline structural type with 9 optional fields** (`thenLoad? thenImport? thenRestore? thenNewSession? executionCosts? thenOpenSession? thenGoTo? thenSessionEnd?`). The concept has no name.
  - `:305-317` — IndexedDB write (`this.db.putMeta`) inside a try/catch swallow.
  - `:319-324` — IndexedDB read (`this.db.getWorkspace`) inside a second try/catch swallow.
  - `:325-329` — `localStorage.setItem` inside a third try/catch swallow.
  - `:330-455` — the remaining ~125 lines are a **pure** translation of the intent object into an ordered `Action[]`.
  - `:352-359, :396-401` — correctness depends on emission ORDER (`trading → drawings → layout/linkGroups → interval → speed`), documented in prose comments numbered `1) 2) 3) 3r) 4) 5) 6)`.
- **Observed pattern:** a command (persist + load + write localStorage) and a query (compute the action sequence) in one method; three silent `catch {}` blocks; an unnamed 9-field intent record; a temporal contract expressed only in comments.
- **Why it matters HERE:** this is the single funnel through which *every* session restore, `.session.json` import, wizard flow, and sessions-page open passes. RFC-011/018/019 all amended it (comments cite each). It is the highest-traffic change site in the state layer and the hardest to test, because exercising the pure part requires stubbing three IO calls.
- **Concrete risk:** a new `then*` intent added by the next RFC is added to a 182-line body whose ordering contract lives in comments; a mis-ordered `push` produces a session that restores with drawings owned by the wrong layout — exactly the class of bug RFC-018's comment at `:352` says was already hit once.
- **Recommended direction:** extract **two named concepts**, not N methods:
  1. `WorkspaceSwitchIntent` — a named type replacing the inline 9-field parameter (it already exists implicitly in `WorkspacesActions.switchAsset` props; verify and reuse rather than duplicate).
  2. `switchActionsFor(intent, restoredWorkspace): Action[]` — the pure intent→action translation, unit-testable with zero IO. `doSwitch` then reads: persist outgoing → load incoming → `return switchActionsFor(...)`.
  Do **not** split the pure part further: the numbered ordering is the logic.
- **Migration difficulty:** MEDIUM. Pure extraction, no behavior change; existing effects specs should pass unchanged.
- **Best mechanism:** one focused refactor PR with the extracted pure function covered by new tests.
- **Acceptance condition:** `switchActionsFor` has no `await`, no `this`, and a test that asserts the full emitted action ORDER for a `thenRestore` payload; `doSwitch` is under ~50 lines.

---

### TD-02 — Circular dependency: `lotaje-view.ts` ⇄ `companion-window.ts`

- **Category:** Dependency boundaries
- **Severity:** MEDIUM
- **Scope:** `emulador/src/app/lotaje/`
- **Evidence:**
  - `src/app/lotaje/lotaje-view.ts:61` — `import { openCompanionWindow } from './companion-window';`
  - `src/app/lotaje/companion-window.ts:26` — `import { getMountedState, LOTAJE_MOUNT_ID, mount, unmount } from './lotaje-view';`
  - This is the **only** cycle in the whole app graph (Tarjan over 202 non-spec modules, `analyze3.js`).
- **Observed pattern:** the view calls out to the companion opener; the companion reaches back into the view's mount lifecycle and its module-level state accessor.
- **Why it matters HERE:** `lotaje-view.ts` holds **13 module-level mutable variables** (`src/app/lotaje/lotaje-view.ts:91-109`: `currentState, currentDoc, currentWindow, currentRoot, refs, mountGeneration, copyAttemptGeneration, activeFeedbackTimer, assetMenuOpen, assetDismissHandler, riskSettingsOpen, riskSettingsDismissHandler, companionHost`). The cycle exists specifically so the companion can read that singleton (`getMountedState`, `src/app/lotaje/lotaje-view.ts:165`). Cycle + module singleton is the combination that makes the module untestable in isolation and order-dependent at import time.
- **Concrete risk:** import-order-sensitive initialization; and per repo memory, this codebase already lost time to `isolate:false` module-state leakage across spec files — a module-level singleton in a cycle is that same failure mode's natural habitat.
- **Recommended direction:** invert the edge. `companion-window.ts` should receive a **mount port** (`{ mount, unmount, readState }`) as an argument from the caller instead of importing the view. The named concept is `LotajeMountPort`. This removes the cycle without merging the files and without dissolving the deliberate framework-free design.
- **Migration difficulty:** LOW-MEDIUM (one parameter threaded from the page host).
- **Best mechanism:** focused PR; add a lint guard afterwards if one is cheap.
- **Acceptance condition:** `companion-window.ts` has no import from `./lotaje-view`; the SCC scan reports 0 cycles.

---

### TD-03 — `components/ui/index.ts` is a barrel that nobody uses (24 of 25 re-exports dead)

- **Category:** Dead code / boundaries
- **Severity:** LOW (but a *false* architectural signal, which is the real cost)
- **Scope:** `emulador/src/app/components/ui/`
- **Evidence:**
  - `src/app/components/ui/index.ts:1-24` — 25 re-exported symbols.
  - Exactly **one** file in the repo imports through the barrel: `src/app/components/toolbar-tools/toolbar-tools.component.ts:22` — `import { TooltipDirective } from '../ui';`
  - The other 24 re-exports have zero importers repo-wide (`analyze4.js`, class `TRULY DEAD`). Every consumer imports the implementation file directly instead (e.g. `chart.component.ts:53` imports `DialogService` from `../ui/dialog.service`).
- **Observed pattern:** a public entry point exists, is ignored, and the whole codebase reaches past it into implementation files.
- **Why it matters HERE:** the folder structure *looks* like it declares a UI-kit public API. It does not enforce one. Anyone reading `components/ui/index.ts` will believe there is a boundary that in practice is bypassed 100+ times.
- **Concrete risk:** a change to a "private" internal of any UI component is a breaking change to arbitrary callers; the barrel gives false confidence during refactors.
- **Recommended direction:** pick one and commit. Either (a) delete `index.ts` and accept direct imports as the convention, or (b) route all `components/ui/*` consumers through the barrel and forbid deep imports with an ESLint `no-restricted-imports` rule. (a) is cheaper and matches actual behavior; (b) is the one that buys something. Do not leave it as-is.
- **Migration difficulty:** (a) TRIVIAL; (b) MEDIUM.
- **Acceptance condition:** either the file is gone, or a lint rule fails on `from '.../ui/<file>'`.

---

### TD-04 — 30 genuinely dead exports and 61 needlessly-public exports

- **Category:** Dead code / encapsulation
- **Severity:** MEDIUM
- **Scope:** repo-wide
- **Evidence (mechanical, `analyze3.js` + `analyze4.js`):** 92 exports have no non-spec importer. Classified:
  - **TRULY DEAD — 31 flagged, 30 real** (1 false positive: `src/environments/environment.prod.ts:6 environment`, consumed via `angular.json` `fileReplacements` at `angular.json:37-42`). 24 of the 30 are the `components/ui/index.ts` barrel (TD-03). The remaining 6, all confirmed by grep:
    - `src/app/models.ts:118` `symbolFromFileName` — only surviving reference is a *comment* at `src/app/components/session-summary/session-summary.component.ts:113`.
    - `src/app/state/drawings/drawings.models.ts:79` `FIB_LEVELS` — dead duplicate (see TD-05).
    - `src/app/state/lessons/lessons.selectors.ts:6` `selectLessonsLoaded`.
    - `src/app/state/market/custom-timeframe.ts:24` `MAX_CUSTOM_TF_MINUTES` — an alias of `MAX_INTERVAL_MINUTES`; only surviving reference is a JSDoc `{@link}` at `:47`.
    - `src/app/state/selectors.ts:579` `selectLowerSeries` — superseded by `selectReplayLowerSeries` (`src/app/state/selectors.ts:607`).
    - `src/app/state/telemetry/telemetry.models.ts:133` `TelemetryEventV1` — dead union type.
  - **OVER-EXPORTED — 61**: exported but referenced only inside their own file. Representative: `src/app/state/market/market.reducer.ts:6 MarketState`, `src/app/state/replay/replay.reducer.ts:7 ReplayState`, `src/app/state/workspaces/workspaces.reducer.ts:5 WorkspacesState`, `src/app/state/auth/auth.reducer.ts:12 AuthState`, `src/app/domain/chart/chart-event-bus.ts:4 ChartEventMap`, `src/app/services/session.service.ts:274 classifySession`, `:301 migrateToCurrent`, `src/app/components/chart/chart-model-mapper.service.ts:96 composePanelDrawings`. Full list in `analysis4.json` (regenerate with APPENDIX A+B).
  - **SPEC-ONLY — 92 exports** have no non-spec importer but *are* imported by tests. Confirmed example: `src/app/state/selectors.ts:427 selectTradeChartView` — production references are now only prose comments (`src/app/components/chart/chart-model-mapper.service.ts:601`, `src/app/state/selectors.ts:311` both say the mapper "no longer consumes" it). This is a selector kept alive purely by its own tests. (List in `analysis3.json`; needs a per-item read before any deletion — many are legitimately test-only seams.)
- **Why it matters HERE:** the over-exported group is the encapsulation problem, not the dead group. 61 symbols advertise themselves as module API while being implementation details; that is what makes "everything knows about everything" possible later.
- **Concrete risk:** each `export` on an internal is a future accidental coupling site. `selectTradeChartView` is worse: a selector that tests assert on but production ignores is a test suite verifying a fiction.
- **Recommended direction:** (a) delete the 6 confirmed-dead non-barrel exports plus resolve TD-03; (b) drop the `export` keyword on the 61 over-exported symbols where no test needs them; (c) triage the 92 spec-only exports — each is either "delete the symbol and its test" or "this is a legitimate seam, document it".
- **Migration difficulty:** LOW for (a)/(b) (compiler-verified). MEDIUM for (c) — requires judgment per item.
- **Acceptance condition:** re-running `analyze3.js` reports 0 truly-dead exports; the spec-only list is annotated, not merely shortened.

---

### TD-05 — Verbatim duplication of shared behavior contracts

- **Category:** Duplication — HARMFUL
- **Severity:** MEDIUM
- **Scope:** trading state, sessions page, drawings
- **Evidence:**
  1. **`shortDate` — 2 byte-identical copies producing the SAME user-visible string.**
     - `src/app/state/trading/trading.reducer.ts:37-42`
     - `src/app/pages/sesiones/sesiones-page.component.ts:748-754`
     Both bodies, and both JSDoc lines, are identical. Both feed the same auto-name contract: `src/app/state/trading/trading.reducer.ts:449` builds `` `Importada · ${shortDate(lastClose)}` `` and `src/app/pages/sesiones/sesiones-page.component.ts:725` builds `` `Importada · ${this.shortDate(plan.thenGoTo)}` ``.
     **Classification: HARMFUL** even at 2 occurrences — the two copies are not merely similar, they must agree to keep one product contract stable, and nothing enforces it.
  2. **`FIB_LEVELS` — 2 byte-identical copies, one dead.**
     - `src/app/domain/chart/capabilities/drawings-primitive.ts:12` (live; used at `:149`, `:348`)
     - `src/app/state/drawings/drawings.models.ts:79` (dead — TD-04)
     **Classification: HARMFUL** (a second definition of a domain constant, currently silent because it's unused).
  3. **Three divergent price formatters.**
     - `src/app/components/chart/chart.component.ts:909` — decimals derived from the instrument's `pointSize`.
     - `src/app/pages/reflection/waypoint-timeline.component.ts:276` — decimals from a magnitude heuristic (`< 100 ? 5 : 2`) + trailing-zero strip.
     - `src/app/lotaje/format.ts:6` `formatMoney` — fixed 2dp with a `'—'` sentinel.
     **Classification: MIXED.** `formatMoney` is a different concept (money, not price) — COINCIDENTAL. But (a) vs (b) format *the same instrument's price* by two different rules, so the Reflection Cabin can print a price the chart would never print. That is a real inconsistency, not duplication per se.
  4. **Epoch→`yyyy-mm-dd` — 4 occurrences of `new Date(x*1000).toISOString().slice(0,10)`**: `src/app/components/csv-start-dialog/csv-start-dialog.component.ts:90`, `src/app/pages/crear-sesion/crear-sesion-page.component.ts:236`, `:279`, `src/app/services/session-sync.mapping.ts:169`. **Classification: HARMFUL (≥3 genuine repetitions of one concept)** → `isoDateOf(epochSeconds)`.
  5. **`'—'` no-value sentinel — 15 literal occurrences in non-spec code** across 10 files (`src/app/lotaje/format.ts:3` already names it `DASH`, but `DASH` is exported and imported only by specs). Sites include `src/app/components/session-summary/excursion-stats.ts:32`, `src/app/pages/journal/performance-grid.component.ts:31,36`, `src/app/pages/reflection/waypoint-facts.component.ts:24,29,35,167`. **Classification: HARMFUL for the constant** (one shared display token), **COINCIDENTAL for the surrounding formatters** (each formats a different quantity — do NOT unify them into one `format(value, kind)` switch).
- **Recommended direction:** one shared `shortDate`/`isoDateOf` in a display-formatting module the state layer may import; delete the dead `FIB_LEVELS`; promote `DASH` to the shared module. Explicitly do **not** build a universal formatter facade.
- **Migration difficulty:** LOW.
- **Acceptance condition:** `grep -c "getUTCDate()" ` over non-spec app code returns 1; `FIB_LEVELS` is defined once.

---

### TD-06 — Five hand-rolled IndexedDB adapters share ~40 lines of identical plumbing

- **Category:** Duplication — HARMFUL (plumbing), with a legitimate non-duplicated core
- **Severity:** MEDIUM
- **Scope:** `emulador/src/app/services/`, `emulador/src/app/domain/`
- **Evidence:**
  - `src/app/services/workspace-db.service.ts:50` `open()` — 86 LOC, 16 branches, nesting 4 (the deepest `open` of the family).
  - `src/app/services/telemetry-db.service.ts:87` `open()`
  - `src/app/services/lessons-db.service.ts:21` `open()` + `:44` `tx()`
  - `src/app/services/playbook-db.service.ts:20` `open()` + `:43` `tx()`
  - `src/app/domain/indexed-db.repository.ts:30` `open()` (variant: unversioned, `indexedDB.open(DB_NAME)` with the comment "no version => never upgrades")
  - `lessons-db.service.ts:21-46` and `playbook-db.service.ts:20-45` are identical modulo `DB_NAME`/`STORE`/result type — the comments even say so: `lessons-db.service.ts:32` "mirrors PlaybookDbService", `playbook-db.service.ts:31` "mirrors WorkspaceDbService".
  - `db.onversionchange` handler duplicated 4× (`lessons:33`, `playbook:32`, `telemetry:101`, `workspace:125`).
  - The promisify idiom `req.onerror = () => reject(req.error)` occurs **31 times** in non-spec app code.
- **Observed pattern:** the *databases* are deliberately separate — `telemetry-db.service.ts:7-25` documents the decision at length (a STOP-protected spec pins the shared DB's object-store count, so a 7th store is not addable), and `lessons`/`playbook` cite survival tiers. That decision is sound and is **not** the duplication.
- **Why it matters HERE:** the duplicated thing is the *connection lifecycle*, not the schema. The `onversionchange` release logic is a correctness detail (a stale connection blocks upgrades forever); four independent copies means a fix to it lands in one file and silently not the other three.
- **Concrete risk:** exactly the bug class the comment at `lessons-db.service.ts:31-32` is guarding against, fixed non-uniformly.
- **Recommended direction:** extract one named concept — `openSingleStoreDb(name, version, store, keyPath): Promise<IDBDatabase>` plus `promisify<T>(req: IDBRequest<T>)` — in a small infrastructure module. **Keep the five databases separate.** `workspace-db.service.ts` (multi-store, 6 stores, real migrations) should keep its own `open()`; it is not the same concept.
- **Migration difficulty:** LOW-MEDIUM. `lessons` + `playbook` are a mechanical swap; `telemetry` nearly so.
- **Acceptance condition:** `onversionchange` appears once for the single-store family; each of `lessons`/`playbook`/`telemetry` DB services loses its private `open()`.

---

### TD-07 — `handleMouseDown` and `onKeyDown`: high branch counts that are NOT a defect

- **Category:** Complexity — explicit NO-ACTION finding
- **Severity:** INFO (recorded to prevent a future "split it" reflex)
- **Evidence:**
  - `src/app/components/chart/chart.component.ts:1440` `handleMouseDown` — 115 LOC, **32 branches**, nesting 3. READ in full.
  - `src/app/components/chart/chart.component.ts:558` `onKeyDown` — 47 LOC, 27 branches, **nesting 6** (deepest in the repo). READ in full.
- **Interpretation:** `handleMouseDown` is a **hit-test priority chain**: scale-chrome guard (`:1449-1451`, documented D19.A) → middle-button ruler (`:1452-1460`) → active quick-ruler (`:1462`) → placing mode (`:1464`) → active drawing tool (`:1465`) → trade ×-button (`:1472`) → resize handle (`:1502`) → trade line (`:1506`) → trade-box edge (`:1516`) → drawing body (`:1528`). **The order IS the behavior.** Extracting eight predicates would scatter the one thing a reader must understand. VERDICT: **KEEP.** (Only nit: `getBoundingClientRect()` is called twice, `:1449` and `:1466`.)
- `onKeyDown`'s depth-6 comes from `if (panel focused) → if (ctrl/meta) → else-if chain → if (selection)`, each level a genuine, commented gate (`:562-563` explains the focus gate exists because listeners are window-level per panel). VERDICT: **KEEP**; the only defensible extraction is the `ctrl/meta` clipboard block as `handleClipboardShortcut(e, panelId)`, and it is optional.
- **Why this is worth writing down:** a line-count-driven audit would flag both. Both are coherent.

---

### TD-08 — Naming: the mechanical census, and what it does and does not mean

- **Category:** Naming
- **Severity:** LOW overall, with two MEDIUM pockets
- **Evidence (`naming.js`, non-spec app code only):**
  - **806 low-information declarations.** Top: `t`=90, `r`=73, `p`=66, `d`=53, `b`=49, `e`=48, `c`=45, `x`=41, `y`=40, `s`=37, `a`=36, `value`=35, `v`=28, `n`=21, `f`=21, `item`=18, `o`=18, `items`=16, `g`=14, `out`=11, `result`=9, `val`=8, `w`=8, `data`=7, `list`=4, `info`=3, `q`=3, `res`=2, `obj`=2.
  - Worst concentrations: `src/app/components/chart/chart.component.ts` (`t`, `r`, `p`, `x`, `y`, `c`, `e` throughout — e.g. `:453,457,462,464,473,924,925,1198,1244,1614,1618`), `src/app/components/chart/chart-model-mapper.service.ts` (`:114,115,117,201,409,420,437`), `src/app/components/custom-color-picker.component.ts` (`:11,15,17,20,61,67,73,76,99,393,407`).
  - **INTERPRETATION:** most of this is defensible. In `custom-color-picker.component.ts`, `h/s/v/r/g/b` are the *domain vocabulary* of colour space; in chart code `x`/`y` are pane coordinates and `t` is time. Renaming these to `horizontalCoordinate` would be worse. The genuinely low-value ones are the generic `value` (35), `item`/`items` (34), `data` (7), `result` (9), `out` (11), `info` (3), `res` (2), `obj` (2) — **~103 sites** — plus `d` (53), which is used for both `Date` and `Drawing` in the same codebase (`chart.component.ts:1533` `const d = this.panelDrawings.items.find(...)` vs `trading.reducer.ts:39` `const d = new Date(...)`). `d` is the only single letter with a genuine ambiguity cost.
  - **Boolean prefixes:** 107 boolean declarations, 73 without `is/has/can/should`. **INTERPRETATION: mostly a non-issue.** Adjective-form flags on data models (`visible`, `locked`, `playing`, `hidden`, `active`, `pending`, `loaded`) are idiomatic and read correctly at their call sites (`if (d.locked) return;` — `chart.component.ts:1544`). No action recommended on the bulk. The ones that do read badly are *predicate functions* named as adjectives: `src/app/state/layout/layout.models.ts:48` `panelTracksPrimarySeries`, `:61` `panelRendersTrades`, `:74` `panelMayExecute` — these are fine actually (verb form). Genuinely awkward: `src/app/components/workspace/workspace-viewport.component.ts:520` `tabAtCap()`, `src/app/components/chart/chart.component.ts:1433` `inPane(x,y)`.
  - **Negated booleans: 4 distinct names, 50 occurrences** — `hideTrades` (24), `hideSharedDrawings` (14), `hideTooltip` (9), `hideSharedLabel` (3). Declared at `src/app/state/layout/layout.models.ts:29,31`.
    **MEDIUM pocket:** `hideTrades`/`hideSharedDrawings` are *panel descriptor state*, read at `src/app/components/chart/chart-model-mapper.service.ts:92,107,152,342` and threaded through composition. Negated flags in a composition path produce double negatives at the read sites. Recommended direction: rename to `showTrades`/`showSharedDrawings` **only if** a session-payload migration is acceptable — these fields are persisted, so the rename is not free. If not, leave them and stop adding new `hide*` fields.
- **Acceptance condition (if actioned):** no new `hide*`/`no*`/`disable*` boolean is introduced; the ~103 generic-noun locals are renamed opportunistically as their files are touched, never as a sweep.

---

### TD-09 — Misleading names (PARTIAL — highest-value area, least complete)

- **Category:** Naming — semantics drifted from the name
- **Severity:** MEDIUM
- **Confirmed so far:**
  1. **`selectTradeChartView` (`src/app/state/selectors.ts:427`)** — the name says it is *the* trade chart view. No production code consumes it. `src/app/components/chart/chart-model-mapper.service.ts:601` and `src/app/state/selectors.ts:311` both document that the mapper "no longer consumes" it and that no "production consumer feeds the pane render from it anymore". It survives only in specs. A reader grepping for how trades reach the chart will land on a decommissioned selector.
  2. **`syncPriceScale` (`src/app/state/link-groups/link-groups.models.ts:9`)** — a boolean named like a live sync channel that is `RESERVED — accepted and stored, never read/applied by any code` (its own comment). It is round-tripped through `normalizeLinkGroup` (`:47`) and asserted by two specs (`link-groups.channels.spec.ts:70`, `link-groups.reducer.spec.ts:65`). **This is a frozen decision** (root `CLAUDE.md` invariant 6 names it explicitly as "reserved-unimplemented"), so it is a *documented* hazard, not drift. Recorded, no action recommended without an RFC.
  3. **`MAX_CUSTOM_TF_MINUTES` (`src/app/state/market/custom-timeframe.ts:24`)** — reads as a distinct policy limit; it is `= MAX_INTERVAL_MINUTES`, i.e. the same number under a second name, referenced only from a JSDoc.
- **NOT YET SWEPT:** services, effects, action names, signal names, CSS classes, component selectors, NgRx naming consistency. This is the single most valuable remaining task.

---

### TD-10 — File-size verdicts (measured for all; read-verdicts partial)

Measured with `analyze.js` (`loc | exports | fan-in | fan-out`):

| File | LOC | exp | in | out | Verdict |
|---|---|---|---|---|---|
| `src/app/lotaje/lotaje-view.ts` | 1724 | 5 | 5 | 8 | **SPLIT** — see below |
| `src/app/components/chart/chart.component.ts` | 1695 | 2 | 7 | 25 | **SPLIT LATER** |
| `src/app/pages/sesiones/sesiones-page.component.ts` | 1295 | 3 | 2 | 31 | **SPLIT** |
| `src/app/services/session-sync.service.ts` | 916 | 11 | 12 | 11 | not read |
| `src/app/components/chart/chart-model-mapper.service.ts` | 888 | 4 | 14 | 15 | not read |
| `src/app/state/selectors.ts` | 854 | **69** | **59** | 14 | not read — but see below |
| `src/app/state/trading/fill-engine.ts` | 585 | 11 | 21 | 4 | not read |
| `src/app/components/workspace/chart-panel.component.ts` | 582 | 1 | 4 | 10 | not read |
| `src/app/components/workspace/workspace-viewport.component.ts` | 544 | 1 | 4 | 10 | not read |
| `src/app/state/drawings/drawings.reducer.ts` | 542 | 1 | 19 | 6 | not read |
| `src/app/state/telemetry/telemetry.effects.ts` | 522 | 1 | 6 | 9 | not read |
| `src/app/state/workspaces/workspaces.effects.ts` | 457 | 1 | 3 | 19 | **SPLIT** (TD-01) |

**`lotaje-view.ts` — SPLIT.** Distinct concepts counted by reading its structure: (1) an inline SVG icon library (`:196-268`), (2) module-level mount singleton + lifecycle (`:91-109`, `mount` at `:1589`), (3) state transition + persistence side effect (`transitionState` `:313`), (4) asset dropdown menu behavior incl. focus management and outside-press dismissal (`:349-448`), (5) risk-settings disclosure (`:503-548`), (6) clipboard copy feedback with generation-counter invalidation (`:733-882`), (7) root keyboard routing (`onRootKeyDown` `:639`, 92 LOC / **36 branches** — the highest branch count in the repo), (8) the DOM builders (`buildHeader` `:892`, `buildAssetSelect` `:970`, `buildRiskFields` `:1084`, `buildZoneQuestionFields` `:1202`, `buildZoneAnswerBody` `:1400`). **Reasons to change** are independent: brand/visual (8), keyboard a11y (7), persistence schema (3), companion realm support (2). Seam: extract (1) `lotaje-icons.ts`, (6) `copy-feedback.ts`, and (4)+(5) as a shared `disclosure.ts` (both implement the same open/dismiss/return-focus pattern — 2 occurrences, so *not yet* an abstraction; extract them as two files, not one shared one, until a third appears). Keep the builders with the mount.

**`sesiones-page.component.ts` — SPLIT.** 10 injected services (`:219-228`). Five concept clusters with different reasons to change: (a) list projection — `allCards :278`, `mergedCards :330`, `searchedCards :361`, `filteredCards :378`, `rows :386`, `sidebar :389`, `groups :412`, `sortCards :460` (pure, testable, ~180 LOC); (b) session lifecycle commands — `open :757`, `rename :873`, `archive :918`, `remove :951`, `exportSession :1024`, `onImportSessionJson :607`; (c) missing-dataset download flow — `pendingDownload :593`, `missing :595`, `downloading :597`, `downloadProgress :599`, `downloadError :601`, `jobForDataset :687`, `confirmDownload :644`, `cancelDownload :673`, `closeMissingModal :678`; (d) folder CRUD + drag-and-drop — `:1096-1290`, 14 methods; (e) formatting — `returnPct :551`, `sparkPoints :574`, `shortDate :748`. Named seams: `SessionListProjection` (a), `MissingDatasetAcquisition` (c), `SessionFolderOrganizer` (d). (a) is the highest-value extraction: it is pure and currently untestable without the component.

**`chart.component.ts` — SPLIT LATER.** 1695 LOC, fan-out 25, ~60 members. It *is* the pointer/keyboard/menu surface of one chart pane, and its longest methods are coherent chains (TD-07). The one real seam is the **order-placement sub-machine** — `placing :440`, `placingInfo :468`, `placingHint :472`, `placingLines :488`, `updatePlacingHover :1065`, `handlePlacingClick :1099`, `finishPlacing :1129`, `cancelPlacing :1157`, `clearPlacing :1161`, `menuPlace :1032` — a named concept (`OrderPlacementController`) with its own state and lifecycle. Not urgent; do it when order placement next changes.

**`selectors.ts` — flagged, not read.** 69 exports / 59 importers is the largest single API surface and the widest fan-in in the app. It already contains at least 6 over-exported internals and 1 dead selector (TD-04). Needs its own read.

---

### TD-11 — Structure communicates less than it looks like it does

- **Category:** Boundaries — PARTIAL
- **Severity:** MEDIUM (provisional)
- **Evidence so far:**
  - **No path aliases.** `emulador/tsconfig.json` has no `paths`. All 934 internal imports are relative.
  - Depth histogram: `../` ×1 = 367, `../../` = 564, `../../../` = 3 (all three are `src/app/services/market-data/*` reaching `../../../environments/environment`: `manifest.service.ts`, `market-data.config.ts`, `parquet-download.service.ts`). **INTERPRETATION: deep relative paths are NOT a problem here** — the tree is shallow and `../../` dominating simply reflects `app/<layer>/<feature>/file.ts`. Do not add aliases to fix a problem that isn't present; the argument for aliases would be enforcement, not ergonomics.
  - The only *enforced* boundary evidence found so far is prose: `src/app/lotaje/lotaje-view.ts:1-6` states the framework-free rule and says it is "grep-checked in task reports" — i.e. enforced by human process, not by tooling. Root `CLAUDE.md` invariant 1 (engine never imports Angular/NgRx) is likewise unenforced by any lint rule found so far.
  - `state/` importing `components/`: NOT yet checked. `domain/` importing Angular: NOT yet checked. **These two checks are the top of the resume list.**
- **Provisional recommendation:** the folder names (`domain/`, `state/`, `services/`, `components/`, `pages/`) do describe an architecture; nothing mechanically prevents violating it. One ESLint `no-restricted-imports` zone config would convert several CLAUDE.md invariants from prose into build failures. Do not act on this until the cross-layer scan below is actually run.

---

## APPENDIX A — `analyze.js` (function/file metrics, exports, imports, cycles, deep paths)

Run with: `node <path>/analyze.js` — writes `analysis.json` next to itself. Requires nothing installed; it loads `emulador/node_modules/typescript` (5.9.3), which is already present. **madge and jscpd are NOT installed and must not be installed.**

```js
// Read-only static analysis of emulador/src/app using the TypeScript compiler API.
const path = require('path');
const fs = require('fs');
const ROOT = 'C:/Users/78701/Desktop/trading-emulator/emulador';
const ts = require(path.join(ROOT, 'node_modules', 'typescript'));
const APP = path.join(ROOT, 'src', 'app').replace(/\\/g, '/');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name).replace(/\\/g, '/');
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}
const allFiles = walk(APP);
const srcFiles = allFiles.filter((f) => !f.endsWith('.spec.ts') && !f.endsWith('.spec-util.ts'));
const rel = (f) => path.relative(ROOT, f).replace(/\\/g, '/');
const sf = new Map();
for (const f of allFiles) sf.set(f, ts.createSourceFile(f, fs.readFileSync(f, 'utf8'), ts.ScriptTarget.ES2022, true));

const funcs = [];
const isFuncLike = (n) => ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isFunctionExpression(n)
  || ts.isArrowFunction(n) || ts.isConstructorDeclaration(n) || ts.isGetAccessor(n) || ts.isSetAccessor(n);
function nameOf(n, src) {
  if (n.name && n.name.getText) return n.name.getText(src);
  if (ts.isConstructorDeclaration(n)) return 'constructor';
  const p = n.parent;
  if (p && ts.isVariableDeclaration(p) && p.name) return p.name.getText(src);
  if (p && ts.isPropertyDeclaration(p) && p.name) return p.name.getText(src);
  if (p && ts.isPropertyAssignment(p) && p.name) return p.name.getText(src);
  if (p && ts.isCallExpression(p)) {
    const g = p.parent;
    if (g && ts.isVariableDeclaration(g) && g.name) return g.name.getText(src) + ' (cb)';
    if (g && ts.isPropertyDeclaration(g) && g.name) return g.name.getText(src) + ' (cb)';
    return '(callback)';
  }
  return '(anon)';
}
function analyzeFunc(node, src) {
  let branches = 0, maxDepth = 0;
  const visit = (n, depth) => {
    let d = depth;
    if (ts.isIfStatement(n)) { branches++; d = depth + 1; }
    else if (ts.isConditionalExpression(n)) branches++;
    else if (ts.isForStatement(n) || ts.isForOfStatement(n) || ts.isForInStatement(n) || ts.isWhileStatement(n) || ts.isDoStatement(n)) { branches++; d = depth + 1; }
    else if (ts.isCaseClause(n)) { branches++; d = depth + 1; }
    else if (ts.isCatchClause(n)) { branches++; d = depth + 1; }
    else if (ts.isBinaryExpression(n)) {
      const k = n.operatorToken.kind;
      if (k === ts.SyntaxKind.AmpersandAmpersandToken || k === ts.SyntaxKind.BarBarToken || k === ts.SyntaxKind.QuestionQuestionToken) branches++;
    }
    if (d > maxDepth) maxDepth = d;
    n.forEachChild((c) => visit(c, d));
  };
  if (node.body) node.body.forEachChild((c) => visit(c, 0));
  const start = src.getLineAndCharacterOfPosition(node.getStart(src)).line + 1;
  const end = src.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
  return { branches, maxDepth, start, end, loc: end - start + 1 };
}
for (const f of srcFiles) {
  const src = sf.get(f);
  const visit = (n) => {
    if (isFuncLike(n)) funcs.push({ file: rel(f), name: nameOf(n, src), kind: ts.SyntaxKind[n.kind], params: n.parameters ? n.parameters.length : 0, ...analyzeFunc(n, src) });
    n.forEachChild(visit);
  };
  visit(src);
}
console.log(funcs.sort((a, b) => b.loc - a.loc).slice(0, 40).map((f) => [f.loc, f.branches, f.maxDepth, f.params, f.file + ':' + f.start, f.name].join(' | ')).join('\n'));
fs.writeFileSync(path.join(__dirname, 'analysis.json'), JSON.stringify({ funcs }, null, 1));
```

(The full original also computed exports/importers/cycles/deep-paths; APPENDIX B supersedes those parts with the corrected version.)

## APPENDIX B — `analyze3.js` (CORRECTED unused-export + cycle scan)

Supersedes the first version, which produced false positives. Corrections that MUST be kept:
walk `emulador/src` (not just `src/app`, or `main.ts` is missed); resolve **dynamic `import()`**
(the routes lazy-load every page component); check HTML templates; treat `src/environments/environment.prod.ts`
as live (`angular.json:37-42` `fileReplacements`).

```js
const path = require('path'); const fs = require('fs');
const ROOT = 'C:/Users/78701/Desktop/trading-emulator/emulador';
const ts = require(path.join(ROOT, 'node_modules', 'typescript'));
const SRC = path.join(ROOT, 'src').replace(/\\/g, '/');
function walk(dir, exts, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name).replace(/\\/g, '/');
    if (e.isDirectory()) walk(p, exts, out); else if (exts.some((x) => e.name.endsWith(x))) out.push(p);
  } return out;
}
const allTs = walk(SRC, ['.ts']), htmlFiles = walk(SRC, ['.html']);
const isSpec = (f) => f.endsWith('.spec.ts') || f.endsWith('.spec-util.ts') || f.includes('/app/testing/') || f.endsWith('test-setup.ts');
const srcFiles = allTs.filter((f) => !isSpec(f));
const rel = (f) => path.relative(ROOT, f).replace(/\\/g, '/');
const text = new Map(allTs.map((f) => [f, fs.readFileSync(f, 'utf8')]));
const sf = new Map(allTs.map((f) => [f, ts.createSourceFile(f, text.get(f), ts.ScriptTarget.ES2022, true)]));
const htmlAll = htmlFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
function resolveSpec(from, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(from), spec).replace(/\\/g, '/');
  for (const c of [base + '.ts', base + '/index.ts', base]) if (sf.has(c)) return c;
  return null;
}
const bySrc = new Map(), bySpec = new Map(), edges = new Map(), deepHist = {};
function record(from, spec, names) {
  const r = resolveSpec(from, spec); const m = spec.match(/^((\.\.\/)+)/);
  if (m) { const d = m[1].length / 3; deepHist[d] = (deepHist[d] || 0) + 1; }
  if (!r) return;
  if (!edges.has(from)) edges.set(from, new Set()); edges.get(from).add(r);
  const target = isSpec(from) ? bySpec : bySrc;
  if (!target.has(r)) target.set(r, new Map());
  for (const nm of names) { if (!target.get(r).has(nm)) target.get(r).set(nm, new Set()); target.get(r).get(nm).add(rel(from)); }
}
for (const f of allTs) {
  const src = sf.get(f);
  const visit = (n) => {
    if (ts.isImportDeclaration(n)) {
      const names = [];
      if (n.importClause) {
        if (n.importClause.name) names.push(n.importClause.name.text);
        const nb = n.importClause.namedBindings;
        if (nb) { if (ts.isNamedImports(nb)) for (const el of nb.elements) names.push((el.propertyName || el.name).text); else names.push('*'); }
      }
      record(f, n.moduleSpecifier.text, names);
    } else if (ts.isExportDeclaration(n) && n.moduleSpecifier) {
      const names = [];
      if (n.exportClause && ts.isNamedExports(n.exportClause)) for (const el of n.exportClause.elements) names.push((el.propertyName || el.name).text);
      else names.push('*');
      record(f, n.moduleSpecifier.text, names);
    } else if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = n.arguments[0];
      if (arg && ts.isStringLiteral(arg)) {
        const names = ['*DYNAMIC*']; const snippet = n.parent && n.parent.getText ? n.parent.getText(src) : '';
        const mm = snippet.match(/m\)\s*=>\s*m\.(\w+)/) || snippet.match(/\.(\w+)\s*\)/);
        if (mm) names.push(mm[1]);
        record(f, arg.text, names);
      }
    }
    n.forEachChild(visit);
  };
  visit(src);
}
function exportsOf(f) {
  const src = sf.get(f); const exps = [];
  src.forEachChild((n) => {
    if (ts.isExportDeclaration(n) && n.exportClause && ts.isNamedExports(n.exportClause)) {
      for (const el of n.exportClause.elements) exps.push({ name: el.name.text, kind: 'reexport', line: src.getLineAndCharacterOfPosition(el.getStart(src)).line + 1 });
      return;
    }
    const mods = ts.canHaveModifiers(n) ? ts.getModifiers(n) || [] : [];
    if (!mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) return;
    const line = src.getLineAndCharacterOfPosition(n.getStart(src)).line + 1;
    if (ts.isVariableStatement(n)) for (const d of n.declarationList.declarations) exps.push({ name: d.name.getText(src), line, kind: 'const' });
    else if (n.name) exps.push({ name: n.name.getText(src), line, kind: ts.SyntaxKind[n.kind].replace('Declaration', '').toLowerCase() });
  });
  return exps;
}
const unused = [], specOnly = [];
for (const f of srcFiles) {
  const s = bySrc.get(f) || new Map(), t = bySpec.get(f) || new Map();
  for (const e of exportsOf(f)) {
    if (s.has(e.name)) continue;
    if (s.has('*')) continue;
    if (new RegExp('\\b' + e.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(htmlAll)) continue;
    if (t.has(e.name)) specOnly.push({ file: rel(f), ...e, by: [...t.get(e.name)].slice(0, 3) });
    else unused.push({ file: rel(f), ...e });
  }
}
const nodes = srcFiles, idx = new Map(nodes.map((n, i) => [n, i])), adj = nodes.map(() => []);
for (const f of nodes) for (const r of (edges.get(f) || [])) if (idx.has(r)) adj[idx.get(f)].push(idx.get(r));
const cycles = []; { let index = 0; const st = [], on = new Array(nodes.length).fill(false);
  const ndx = new Array(nodes.length).fill(-1), low = new Array(nodes.length).fill(0);
  const strong = (v) => { ndx[v] = low[v] = index++; st.push(v); on[v] = true;
    for (const w of adj[v]) { if (ndx[w] === -1) { strong(w); low[v] = Math.min(low[v], low[w]); } else if (on[w]) low[v] = Math.min(low[v], ndx[w]); }
    if (low[v] === ndx[v]) { const c = []; let w; do { w = st.pop(); on[w] = false; c.push(w); } while (w !== v); if (c.length > 1) cycles.push(c.map((i) => rel(nodes[i]))); } };
  for (let v = 0; v < nodes.length; v++) if (ndx[v] === -1) strong(v); }
fs.writeFileSync(path.join(__dirname, 'analysis3.json'), JSON.stringify({ unused, specOnly, cycles, deepHist }, null, 1));
console.log('UNUSED:', unused.length, '| SPEC-ONLY:', specOnly.length, '| cycles:', JSON.stringify(cycles), '| deep:', JSON.stringify(deepHist));
```

`analyze4.js` then splits `analysis3.json.unused` into TRULY DEAD vs OVER-EXPORTED by counting
non-comment references inside the declaring file itself:

```js
const path=require('path'),fs=require('fs');
const ROOT='C:/Users/78701/Desktop/trading-emulator/emulador';
const a=require('./analysis3.json');const g={dead:[],overExported:[]};
for(const u of a.unused){const lines=fs.readFileSync(path.join(ROOT,u.file),'utf8').split(/\r?\n/);
 const re=new RegExp('\\b'+u.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b');let refs=0;const at=[];
 lines.forEach((l,i)=>{if(i+1===u.line)return;const t=l.trim();if(t.startsWith('//')||t.startsWith('*')||t.startsWith('/*'))return;if(re.test(l)){refs++;at.push(i+1);}});
 (refs===0?g.dead:g.overExported).push({...u,inFileRefs:refs,refLines:at.slice(0,4)});}
console.log('DEAD',g.dead.length,'OVER-EXPORTED',g.overExported.length);
fs.writeFileSync(path.join(__dirname,'analysis4.json'),JSON.stringify(g,null,1));
```

## APPENDIX C — top-30 functions by LOC (raw measurement)

`loc | branches | maxDepth | params | file:line | name`

```
182 | 30 | 3 | 3 | src/app/state/workspaces/workspaces.effects.ts:274 | doSwitch
137 | 14 | 3 | 1 | src/app/domain/chart/capabilities/trading-capability.ts:67 | render
117 |  9 | 2 | 5 | src/app/state/trading/fill-engine.ts:298 | processCandle
115 | 32 | 3 | 1 | src/app/components/chart/chart.component.ts:1440 | handleMouseDown
105 | 23 | 1 | 3 | src/app/lotaje/lotaje-view.ts:1589 | mount
105 | 18 | 2 | 1 | src/app/lotaje/sizing-view-model.ts:98 | deriveLots
 92 | 36 | 3 | 1 | src/app/lotaje/lotaje-view.ts:639 | onRootKeyDown
 91 |  1 | 0 | 0 | src/app/components/chart/chart.component.ts:625 | ngAfterViewInit
 87 |  1 | 1 | 4 | src/app/lotaje/lotaje-view.ts:1202 | buildZoneQuestionFields
 86 | 16 | 4 | 0 | src/app/services/workspace-db.service.ts:50 | open
 85 |  3 | 1 | 3 | src/app/lotaje/lotaje-view.ts:970 | buildAssetSelect
 81 | 15 | 3 | 2 | src/app/services/workspace-db.service.ts:52 | (anon, inside open)
 76 |  2 | 1 | 3 | src/app/lotaje/lotaje-view.ts:892 | buildHeader
 76 | 14 | 2 | 0 | src/app/services/session-sync.service.ts:462 | pullAndMergeSessions
 70 |  4 | 1 | 3 | src/app/lotaje/lotaje-view.ts:1400 | buildZoneAnswerBody
 69 |  0 | 0 | 3 | src/app/pages/reflection/frozen-scene-host.component.ts:90 | deriveFrozenRenderModel
 69 | 12 | 1 | 1 | src/app/pages/sesiones/sesiones-page.component.ts:1024 | exportSession
 68 | 10 | 2 | 6 | src/app/components/chart/chart.component.ts:751 | render
 67 | 15 | 3 | 1 | src/app/services/workspace-db.service.ts:54 | (anon, inside open)
 66 |  6 | 1 | 1 | src/app/pages/reflection/reflection-cabin-page.component.ts:221 | onSave
 64 | 11 | 2 | 2 | src/app/state/drawings/drawings.reducer.ts:155 | applyInverse
 60 |  5 | 2 | 1 | src/app/components/ui/tooltip.directive.ts:57 | render
 60 | 14 | 2 | 0 | src/app/services/session-sync.service.ts:401 | pullAndMergeFolders
 60 | 10 | 0 | 7 | src/app/state/trading/fill-engine.ts:77 | closeTrade
 60 | 11 | 3 | 2 | src/app/state/trading/fill-engine.ts:510 | computeSessionStats
 58 | 13 | 3 | 1 | src/app/pages/sesiones/sesiones-page.component.ts:951 | remove
 57 | 11 | 2 | 1 | src/app/components/chart/chart.component.ts:1273 | handleClick
 56 |  0 | 0 | 3 | src/app/lotaje/lotaje-view.ts:1084 | buildRiskFields
 55 |  9 | 2 | 2 | src/app/state/telemetry/telemetry-facts.ts:197 | diffManagementEvents
 54 | 15 | 2 | 3 | src/app/domain/reflection/waypoints.ts:45 | computeWaypoints
```

Highest branch counts (top 8): `lotaje-view.ts:639 onRootKeyDown` 36 · `chart.component.ts:1440 handleMouseDown` 32 · `workspaces.effects.ts:274 doSwitch` 30 · `trade-panel.component.ts:96 invalidReason` 29 · `chart.component.ts:558 onKeyDown` 27 · `lotaje-view.ts:1589 mount` 23 · `lotaje-view.ts:448 onAssetSelectKeyDown` 19 · `sizing-view-model.ts:98 deriveLots` 18.

Deepest nesting (top 5): `chart.component.ts:558 onKeyDown` 6 · `drawings-primitive.ts:83 draw` 5 · `drawings-primitive.ts:322 hitTestDrawing` 5 · `workspace-db.service.ts:50 open` 4 · `layout-invariants.ts:15 layoutInvariantViolation` 4.

Highest parameter counts: `selectors.ts:138 selectWorkspaceMetaSnapshot` cb = **11** · `chart-model-mapper.service.ts:837 buildTradingModel` = 10 · `trade-boxes-primitive.ts:85 zone` = 9 · `chart-model-mapper.service.ts:811 buildDrawingsModel` = 8 · `drawings-primitive.ts:134 drawFib` = 8 · `drawings-primitive.ts:166 drawRuler` = 8 · `trading-capability.ts:117 addPriceLine` = 8 · `selectors.ts:833 selectFloatingEquity` cb = 8 · `fill-engine.ts:77 closeTrade` = 7. (NOTE: NgRx `createSelector` projector arity is not a code smell — the 11-arg and 8-arg ones at `selectors.ts:138/833` are projectors, and their arity is dictated by the number of input selectors. The genuine smells are `buildTradingModel` (10) and `buildDrawingsModel` (8), which are ordinary functions.)

---

## RESUME BRIEF

Paste this whole section into a fresh session.

### (a) Role and remaining scope

You are a Principal Engineer performing a **READ-ONLY** technical-debt audit of the
`trading-emulator` repository at `C:\Users\78701\Desktop\trading-emulator`, branch `develop`,
HEAD `a2ca53b`. App code is `emulador/src/app`.

**ABSOLUTE RULES:** READ-ONLY on all repository source. The only writes permitted are files
under `C:\Users\78701\Desktop\trading-emulator\.superpowers\audit-2026-08-10\`. Do **not**
install packages (`madge`, `jscpd` are NOT installed and must stay that way). Every claim needs
`path/to/file.ts:line` evidence; counts must be generated mechanically. Separate
MEASURED FACT / INTERPRETATION / RECOMMENDATION. **Do not judge complexity by line count alone** —
explicitly name long-but-coherent functions that should be left alone, and short ones that hide
too much. Do not recommend splitting to satisfy arbitrary limits. Do not propose a shared
abstraction until the shared concept is real (≥3 genuine repetitions of the SAME concept).

Your assigned areas: (1) function/method complexity, (2) file & module size, (3) naming quality
incl. misleading names, (4) duplication textual AND conceptual, (5) dead code & obsolete
architecture, (6) import & dependency boundaries, (7) public API / encapsulation.

Continue the existing report at
`.superpowers\audit-2026-08-10\audit-complexity-boundaries.md` — append new TD-findings in the
same block format (Finding name / Category / Severity / Scope / Evidence / Observed pattern /
Why it matters HERE / Concrete risk / Recommended direction / Migration difficulty / Best
mechanism / Acceptance condition) and update `## STATUS`.

Final deliverable back to the coordinator: a digest of at most 140 lines containing the top-20
complexity table with SPLIT/KEEP verdicts, the circular-dependency list, the unused-export count,
deep-relative-path counts, the misleading-names list, the harmful-duplication list with counts,
and the 3 highest-leverage recommendations.

### (b) Commands already run — DO NOT RE-RUN

The three analysis scripts are pasted verbatim in APPENDIX A and APPENDIX B of the report. They
use `emulador/node_modules/typescript` (5.9.3, already installed). Re-create them in a scratch
directory only if you need to extend them. Their outputs, already captured:

- `386` .ts under `emulador/src` (`202` non-spec, `184` spec) + `30` .html; `33,562` non-spec LOC.
- Circular dependencies: **exactly 1** — `src/app/lotaje/lotaje-view.ts` ⇄ `src/app/lotaje/companion-window.ts`.
- Unused exports: **92 raw** → **31 truly dead** (30 real, 1 false positive) + **61 over-exported**; separately **92 spec-only exports**. Full lists in the report (TD-04).
- Deep relative imports: `../`=367, `../../`=564, `../../../`=3 (all three in `src/app/services/market-data/*` → `../../../environments/environment`).
- `emulador/tsconfig.json` has **no `paths`** — no aliases exist.
- Naming census: 806 low-info declarations (`t`=90, `r`=73, `p`=66, `d`=53, `b`=49, `e`=48, `c`=45, `x`=41, `y`=40, `value`=35, `item`/`items`=34 …); 107 boolean decls, 73 non-`is/has/can/should`; negated names = 4 distinct / 50 occurrences (`hideTrades` 24, `hideSharedDrawings` 14, `hideTooltip` 9, `hideSharedLabel` 3).
- IDB duplication counts: 5 `open()` implementations; `db.onversionchange` ×4; `req.onerror = () => reject(...)` ×31 in non-spec code.
- `'—'` literal: 15 occurrences in non-spec code.
- Top-30 function table: APPENDIX C.

### (c) Files already read and conclusions

| File | Conclusion |
|---|---|
| `emulador/tsconfig.json` | strict everywhere; no `paths`. |
| `emulador/angular.json:37-42` | `fileReplacements` → `environment.prod.ts` is LIVE, not dead. |
| `src/app/app.routes.ts` | every page is a dynamic `loadComponent` import — naive import scans WILL produce false "dead component" results. |
| `src/main.ts` | consumes `appConfig`/`App`; scans must include `src/`, not just `src/app/`. |
| `src/app/state/workspaces/workspaces.effects.ts` (esp. `:274-455`) | TD-01. SPLIT along IO vs pure-intent-translation. |
| `src/app/components/chart/chart.component.ts` (`:341-560`, `:558-624`, `:900-915`, `:1440-1560`, member index) | TD-07 KEEP the two big handlers; TD-10 SPLIT LATER on `OrderPlacementController`. |
| `src/app/pages/sesiones/sesiones-page.component.ts` (member index, `:748-760`) | TD-10 SPLIT: 5 clusters, 10 injected services. |
| `src/app/lotaje/lotaje-view.ts` (`:1-200`, `:91-109`, function index) | TD-02 + TD-10: 13 module-level mutables, 8 concepts, in the only import cycle. |
| `src/app/lotaje/companion-window.ts:26` | the other half of the cycle. |
| `src/app/lotaje/format.ts` | `DASH`/`formatMoney`/`formatLots`; `DASH` exported but spec-only. |
| `src/app/services/{lessons,playbook,telemetry,workspace}-db.service.ts`, `src/app/domain/indexed-db.repository.ts` | TD-06. Separate DBs = deliberate (documented at `telemetry-db.service.ts:7-25`); the *plumbing* duplication is the debt. |
| `src/app/state/link-groups/link-groups.models.ts` | `syncPriceScale` reserved-unimplemented — frozen by CLAUDE.md invariant 6, do not touch. |
| `src/app/state/trading/trading.reducer.ts:30-50` | `shortDate` duplicate #1. |
| `src/app/state/selectors.ts:1-60`, `:570-620` | `selectLowerSeries` dead; `selectTradeChartView` spec-only; 69 exports / 59 importers — NOT yet fully read. |
| `src/app/components/chart/chart-model-mapper.service.ts:1-100` | imports 20+ state symbols; `composePanelDrawings` over-exported. NOT fully read. |
| `src/app/components/ui/index.ts` | TD-03: 24/25 re-exports dead, 1 consumer. |

### (d) Dead ends / non-issues — do not re-investigate

- **Deep relative paths are NOT a problem.** `../../` dominating is just `app/<layer>/<feature>/`. Only 3 imports exceed depth 2. Do not recommend path aliases for ergonomics.
- **Boolean adjective naming is NOT a problem.** 73 "non-conforming" booleans are overwhelmingly idiomatic (`visible`, `locked`, `playing`, `hidden`, `active`). Do not recommend a rename sweep.
- **High-arity NgRx selector projectors are NOT a smell.** `selectors.ts:138` (11 params) and `:833` (8 params) are `createSelector` projectors; arity is forced by input count.
- **Separate IndexedDB databases are NOT duplication.** Deliberate, documented, STOP-rule-driven.
- **`environment.prod.ts` is NOT dead** (`angular.json` fileReplacements).
- **`syncPriceScale` is NOT accidental drift** — frozen decision, needs an RFC to change.
- **`madge` / `jscpd` are not installed**; the SCC cycle detection in APPENDIX B already replaces madge.
- The first version of the export scan (walking only `src/app`, ignoring dynamic imports) produced ~50 false positives including every routed page component. Use APPENDIX B, not that.

### (e) ORDERED remaining steps

1. **Cross-layer boundary scan (area 6) — highest value, cheapest.** Mechanically check, over non-spec code:
   - `src/app/domain/**` importing `@angular/*` or `@ngrx/*` (CLAUDE.md invariant 1 — `ChartEngine` must not);
   - `src/app/state/**` importing `src/app/components/**` or `src/app/pages/**`;
   - `src/app/components/**` importing `src/app/services/**` infrastructure directly vs through state;
   - page-to-page and feature-to-feature imports.
   Report each violation with `file:line`. Then judge whether the folder tree communicates the architecture or merely looks tidy.
2. **Misleading-names sweep (area 3) — the highest-value naming work, barely started.** Targets: `services/*.service.ts` (does the name match what it does — e.g. `session.service.ts` vs `session-sync.service.ts` vs `session-sync.mapping.ts` vs `session-migration.ts`, four names for adjacent concerns); `state/selectors.ts` (69 exports — look for selectors whose projector no longer matches the name, as `selectTradeChartView` already did); NgRx action/effect naming consistency; `src/app/models.ts` (a 64-importer junk-drawer name — is it a model module or a util module?); component `selector:` strings; CSS class names vs DESIGN_SYSTEM tokens.
3. **Read the 8 unread large files (area 2)** and give each a SPLIT/KEEP/SPLIT-LATER verdict with the seam named: `state/selectors.ts` (854), `services/session-sync.service.ts` (916), `components/chart/chart-model-mapper.service.ts` (888), `state/trading/fill-engine.ts` (585), `components/workspace/chart-panel.component.ts` (582), `components/workspace/workspace-viewport.component.ts` (544), `state/drawings/drawings.reducer.ts` (542), `state/telemetry/telemetry.effects.ts` (522).
4. **Finish the top-20 complexity verdicts (area 1)**: read `domain/chart/capabilities/trading-capability.ts:67 render` (137 LOC), `state/trading/fill-engine.ts:298 processCandle` (117 LOC, 5 params), `lotaje/sizing-view-model.ts:98 deriveLots` (105 LOC, 18 branches), `components/trade-panel/trade-panel.component.ts:96 invalidReason` (29 branches in 23 LOC — a strong candidate for *short but hiding too much*), `domain/chart/capabilities/drawings-primitive.ts:322 hitTestDrawing` (nesting 5). Also look for **short functions that hide too much** — the census above only found long ones.
5. **Finish duplication (area 4)**: chart setup/config, DTO↔domain mapping (`session-sync.mapping.ts` vs `session-migration.ts` vs `session.service.ts`), error translation, coordinate/math logic (`drawings-primitive.ts distToSegment` vs any other geometry), selector logic, CSS/styling patterns, and test setup (184 spec files — look for a copied TestBed preamble). Classify each HARMFUL / COINCIDENTAL / PREMATURE-ABSTRACTION-ALREADY-PRESENT with counts.
6. **Finish dead code (area 5)**: commented-out implementations, `@deprecated` markers, migration/compat shims (`session-migration.ts`, `drawings-migration.ts`, `LinkGroupWire.syncTrades` is one confirmed read-tolerated retired field), dead feature flags, stale CSS, stale specs. Assess repo-root `topbar-hud/` (a Next.js design prototype — CLAUDE.md says prototypes are scratch spaces at repo root and never part of the build; confirm it is excluded from the build and decide whether it is still warranted).
7. **Finish encapsulation (area 7)**: run the class-member spec-only scan (a partial `analyze2.js` existed; rewrite it to (i) walk all of `src`, (ii) exclude Angular-template-referenced members by scanning both `.html` files AND inline `template:` strings, (iii) exclude lifecycle hooks). Report the count of public members used only by tests. Then: mutable internals exposed externally (start with `lotaje-view.ts` `getMountedState`/`getMountedWindow`), and modules with no clear public boundary.
8. **Update `## STATUS`** and produce the ≤140-line digest.
