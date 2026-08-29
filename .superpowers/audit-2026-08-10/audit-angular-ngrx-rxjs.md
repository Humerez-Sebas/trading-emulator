# Technical-Debt Audit — Angular / NgRx / RxJS / State Ownership

**Repo:** `C:\Users\78701\Desktop\trading-emulator` · **Branch:** `develop` · **HEAD:** `a2ca53b`
**Auditor role:** Angular / NgRx / RxJS / State-Ownership Auditor · **Mode:** READ-ONLY
**Date:** 2026-08-10
**Stack (measured, `emulador/package.json`):** `@angular/core ^21.2.0`, `@ngrx/store ^21.1.1`, `rxjs ~7.8.0`, 14 runtime deps.

---

## STATUS

**~70% complete.**

### AREAS COMPLETE
- **(1) Invariant verification I1–I6** — all six have a verdict with evidence. I5 fully verified (mechanical). I1/I2 verified including a real violation. I4 verified. I3 partially (see PARTIAL).
- **(5) RxJS** — the RxJS surface is small enough (12 `.subscribe()` total) that it was audited exhaustively. All operator choices enumerated and judged.
- **(6) Immutability** — mechanically swept; conclusion is that this is a NON-ISSUE (see dead ends). Recorded so it is not re-run.
- **(3-partial) NgRx actions-as-events-vs-commands** — mechanically counted: 99 actions, 13 event-shaped, 86 command-shaped.
- **(3-partial) `state/selectors.ts`** — read in full (853 lines), verdict recorded.
- **(2-partial) Change-detection strategy** — mechanically counted: 61 components, 28 OnPush, 33 without. Full list of offenders captured.

### AREAS PARTIAL
- **(2) Angular architecture** — read in full or in substantial part: `chart.component.ts`, `chart-model-mapper.service.ts`, `chart-panel.component.ts`, `workspace-viewport.component.ts`, `sesiones-page.component.ts`, `app.ts`, `app.config.ts`, `playbook-hotkeys.directive.ts`, `dialog.service.ts`. **NOT read:** `custom-color-picker.component.ts` (417), `ui/date-picker.component.ts` (347), `ui/dropdown.component.ts` (324), `interactive-candles.component.ts` (339), `reflection-cabin-page.component.ts` (382), `frozen-scene-host.component.ts` (349), the `journal-viz/*` charts. Template-expression audit done by grep across all 29 HTML files but only 3 templates read in context.
- **(3) NgRx** — reducers `drawings.reducer.ts` (head only), `layout.reducer.ts` (TF-sync region), `trading.reducer.ts` (NOT read). Effects: `workspaces.effects.ts` (read ~full), `replay.effects.ts` (read), `trading.effects.ts` (read, first 110 lines), `session-sync.effects.ts` (read full), `layout.effects.ts` + `settings.effects.ts` (read full), `telemetry.effects.ts` (structure + doc header only, 521 lines not read line-by-line). `market.effects.ts`, `auth.effects.ts`, `lessons.effects.ts`, `playbook.effects.ts` NOT read.
- **(4) State ownership** — 9 of 9 stores identified and tabled, but 3 rows are UNVERIFIED (settings, telemetry, market-data cache) — see table.
- **(7) Accidental frameworks** — `ChartEventBus`, `Capability` system, `ChartModelMapper` memo layer judged. `ChartSyncBus`/`ChartSyncRouter`, `WorkspaceDbService`, `SessionSyncService` (915 lines) only partially judged.

### AREAS NOT STARTED
- **(2)** Smart-vs-presentational classification across the full 53-component set; `output()` vs `EventEmitter` sweep; feature-folder organization verdict; `services/` responsibility map (18 files / 3966 LOC).
- **(3)** State-shape normalization review of `trading.reducer.ts` (470) and `telemetry.effects.ts` (521); UI-only-state-in-global-store sweep beyond the two instances already found.
- **(7)** `lotaje/` (7 files / 2488 LOC — a second, parallel chart/window stack) entirely unexamined.

---

## INVARIANT VERDICT TABLE (I1–I6)

| # | Invariant | TRUE today? | Documented? | Encoded structurally? | Tested? | Violation risk |
|---|---|---|---|---|---|---|
| **I1** | `ChartEngine` never imports Angular/NgRx; comms only as immutable `RenderModel` + `ChartEventBus` | **HALF.** Clause 1 TRUE. Clause 2 **VIOLATED** | Yes (CLAUDE.md #1) | **No** — no lint boundary rule, no path restriction | **No** — no arch test found | **HIGH** for clause 2, LOW for clause 1 |
| **I2** | Engine core closed to modification; new behavior = new `Capability` | **NO** — core edited 5× post-registry | Yes (CLAUDE.md #2, `capability.ts:6-9`) | **No** | **No** | **HIGH** |
| **I3** | Market Data domain ⟂ User Workspace domain, no DTO leaks | **PARTIAL / UNVERIFIED** | Yes | Partially (separate slices) | Unknown | MEDIUM |
| **I4** | Session payloads candle-free (`assertNoCandles`) | **YES** | Yes | Yes — runtime assertion at 4 write sites | **Yes** — 6 spec assertions | **LOW** |
| **I5** | Per-instance `ChartModelMapper` memoization; factory selectors banned | **YES** — zero factory selectors found | Yes, extensively | Partially (`@Injectable()` non-root + per-panel provider) | **Yes** (RFC-008 isolation test) | **LOW** |
| **I6** | State-first; motion/render/components must not be alternate truth | **NO** — multiple violations | Yes | **No** | **No** | **HIGH** |

### I1 — evidence
- **Clause 1 holds.** `grep -rn "from '@angular\|from '@ngrx" emulador/src/app/domain/` → **0 matches**. Only non-domain import under `domain/chart/` is `rxjs` in `domain/chart/chart-sync-bus.ts:2`.
- **Clause 2 violated.** `domain/chart/chart-engine.ts:25` `public get chartApi(): IChartApi` and `:28` `public get seriesApi(): ISeriesApi<'Candlestick'>` hand the raw lightweight-charts handles out. `components/chart/chart.component.ts:568-570` captures both, then makes **25 direct library calls** (`this.series.*` ×21, `this.chart.*` ×4) — e.g. `chart.component.ts:805` `this.series.update(...)`, `:1042` `this.series.createPriceLine(...)`, `:1390` `this.chart.timeScale()`, `:1393` `this.series.priceToCoordinate(...)`. Data therefore crosses the boundary as a live mutable object graph, not as immutable `RenderModel`.
- Not encoded: `emulador/eslint.config.js` (51 lines) has **no** `no-restricted-imports`, no boundary plugin, no path zone rules.

### I2 — evidence
- `git log --oneline -- emulador/src/app/domain/chart/chart-engine.ts` → **14 commits**. The capability registry landed at `c97daf0`; **5 commits modified the core after it**: `5ab3605`, `78d21c8`, `90d24dc`, `317c2e1` (new `applyCrosshair`/`applyVisibleRange` methods), `cc35aa5`, `5255081`, `a10d089` (`paneRect`).
- `chart-engine.ts:246` `paneRect()` carries an in-code defence: *"Does NOT violate kernel invariant 2 … this adds no engine BEHAVIOR"*. The defence may be right; the point is that the invariant is adjudicated by prose in each PR, never by a mechanism.
- Only **4 capabilities** exist (`drawings`, `countdown`, `session`, `trading`) while `chart.component.ts` renders preview SL/TP price lines itself (`:1042`, `:1050`, `:1111`, `:1164`) — a fifth rendering concern that skipped the extension point.

### I5 — evidence (the one invariant that is genuinely, mechanically true)
- `grep -rn "return createSelector"` across `emulador/src/app` → **0 matches**. No selector factory anywhere.
- Per-instance memoization is real and deliberate: `chart-model-mapper.service.ts` holds **7 independent per-instance memo slots** (`lastFormingInputs:304`, `lastCandlesInputs:458`, `lastMarkerInputs:501`, `lastBoxInputs:534`, `lastTradeInputs:570`, `lastDrawingsInputs:667`, `lastPanelInputs:731`) plus two memo combinators (`memoizeMap:201`, `memoizeObject:216`).
- `chart-model-mapper.service.ts:484-499` documents *why* the ban exists, correctly identifying that NgRx's `.projector` is itself single-slot-memoized and thrashes at N panels.
- Alternative-to-factory pattern is used consistently elsewhere: `state/lessons/lessons.selectors.ts:13` and `state/playbook/playbook.selectors.ts` build ONE memoized `Record<key, T[]>` map instead of per-key selectors, each with an explicit "D8 ban" comment.

### I4 — evidence
`services/session-sync.mapping.ts:75` defines `assertNoCandles`; enforced at `session-sync.mapping.ts:197`, `session-sync.service.ts:112`, `lessons-db.service.ts:62`, `playbook-db.service.ts:61`. Tested at `session-sync.mapping.spec.ts:97-105`, `:336`, `:570`, `lessons-db.service.spec.ts:44`, `playbook-db.service.spec.ts:49`.

### I6 — evidence
Violated by TD-1, TD-2, TD-4, TD-6 below.

---

## STATE-OWNERSHIP TABLE

| State | Nominal owner | # sources of truth | Verdict |
|---|---|---|---|
| Replay position (`currentTime`) | `replayFeature` (`state/replay/replay.reducer.ts`) | 1 | **CLEAN** |
| Trades / positions / orders / history | `tradingFeature` (`state/trading/trading.reducer.ts`) | **3** — store + `WorkspaceMeta.trading` in IndexedDB (2 independent writers) | **BROKEN** → TD-1 |
| Session list / folders (sessions page) | *none* — `SesionesPageComponent` local signals | **3** — store, IndexedDB, Supabase | **BROKEN** → TD-2 |
| Drawings | `drawingsFeature` (normalized: `entities`+`ownerIndex`+`selection`+`revisions`+`history`) | 1 (well-normalized) | **CLEAN** (best-in-repo) |
| Layout / panels / tabs | `layoutFeature` | 1 | CLEAN |
| Active timeframe | **AMBIGUOUS** — `market.activeTf` AND `layout.panels[focusedPanelId].timeframe` | **2**, bidirectionally mirrored | **BROKEN** → TD-4 |
| Link groups | `linkGroupsFeature` | 1 | CLEAN |
| Chart render caches (window, times, colors, drag) | `ChartComponent` private fields (~24) | 1 (derived), but not inspectable/testable | **SMELL** → TD-6 |
| Panel "has been visible" latch | `ChartPanelComponent.hasBeenVisible` signal, written by an `effect()` | 1 | SMELL → TD-7 |
| Telemetry anchors (`pendingJumpOrigin`, `orderClock`) | `TelemetryEffects` mutable fields (`telemetry.effects.ts:195`, `:205`) | 1, but lives only in an effect instance, lost on reload | SMELL (documented as deliberate) |
| Settings | `settingsFeature` + localStorage (`settings.effects.ts` persist) | **UNVERIFIED** (likely 2, write-through) | UNVERIFIED |
| Market data cache (candles) | `marketFeature.series` + IndexedDB `SERIES_STORE`/`CANDLES_STORE` | **UNVERIFIED** | UNVERIFIED |
| Workspace (per-asset aggregate) | `workspacesFeature` + `WorkspaceDbService` | 2 (write-through via `persistMeta$`) | see TD-1 |
| Playbook rules mirror in a directive | `playbookFeature` + `PlaybookHotkeysDirective.bySlot`/`loaded` | **2** (mutable field copies) | SMELL → TD-8 |

---

## MEASURED FACTS (mechanical counts — do not re-derive)

| Metric | Value | How measured |
|---|---|---|
| Components total | **61** | `grep -rl "@Component" --include=*.ts \| grep -v spec` |
| Components with `OnPush` | **28** (46%) | `grep -rl "ChangeDetectionStrategy.OnPush"` |
| Components **without** `OnPush` | **33** (54%) | per-file loop, list below |
| Zoneless? | **NO** — `app.config.ts` has no `provideZonelessChangeDetection()` | read `app.config.ts` in full |
| `.subscribe()` calls (non-spec) | **12** | 6 in `chart.component.ts`, 2 in `playbook-hotkeys.directive.ts`, 1 each in `chart-sync-router.ts`, `dialog.service.ts`, `csv-start-dialog.component.ts`, `app.ts` |
| `takeUntilDestroyed` adoption | **8 / 12 = 67%** | remaining 4 all have explicit teardown → **leak count = 0** |
| `shareReplay` / `publishReplay` / `share()` | **0** | grep |
| `new Subject`/`BehaviorSubject`/`ReplaySubject` | **3** total, all justified | `chart-model-mapper.service.ts:195,228`, `chart-sync-bus.ts:33` |
| `switchMap` / `concatMap` / `mergeMap` / `exhaustMap` | 5 / 9 / 7 / 6 | all sites enumerated; **0 semantically wrong** (see dead ends) |
| `catchError` sites | **19**, of which **12 are `→ EMPTY`** (silent swallow) | grep |
| NgRx actions total | **99** | node script over `state/*/*.actions.ts` |
| Event-shaped actions | **13 (13%)** | past-tense/`Loaded`/`Resolved`/`Synced`/`Generated`/`Restored`/`Imported` |
| Command-shaped actions | **86 (87%)** | remainder |
| `createSelector` in `state/selectors.ts` | **43** | grep -c |
| Factory selectors | **0** | `grep -rn "return createSelector"` |
| `inject()` calls | **120** | grep |
| Constructor-param DI (real, non-domain) | **1** (`chart-sync-router.ts:61-64`) | rest are `= inject()` defaults or plain value classes |
| `signal(` / `computed(` / `linkedSignal` / `toSignal` / `toObservable` | 55 / 29 files / 4 / 2 / 0 | grep |
| `effect(` (non-NgRx) | **14 sites** across 8 files | grep |
| `@HostListener` | **9** (all `document:`/`window:` global listeners) | grep |
| `\| async` pipe usages | **0** | grep — the app is fully `selectSignal`-based in templates |
| `store.selectSignal` calls | **98** | grep |

**Components without OnPush (33):** `app.ts`, `chart/chart.component.ts`, `controls/`, `csv-start-dialog/`, `drawing-toolbar/`, `floating-pnl/`, `floating-toolbar/`, `icons/trash-icon`, `interval-dialog/`, `missing-dataset-dialog/`, `playback-controller/`, `playbook-panel/`, `session-summary/`, `settings-panel/`, `side-dock/`, `toolbar-tools/`, `trade-panel/`, `ui/color-field`, `ui/date-picker`, `ui/dialogs/confirm-dialog`, `ui/dialogs/delete-session-dialog`, `ui/dialogs/prompt-dialog`, `ui/dropdown`, `ui/empty-state`, `ui/menu`, `ui/modal`, `ui/segmented-control`, `pages/auth/`, `pages/crear-sesion/`, `pages/emulador/`, `pages/mercados/mercados-page`, `pages/mercados/r2-markets`, `pages/sesiones/`.

---

## FINDINGS SO FAR

### TD-1 — Two independent writers to one IndexedDB record; a cloud delete can be silently resurrected
- **Category:** State ownership / data integrity
- **Severity:** **HIGH**
- **Scope:** `state/workspaces/workspaces.effects.ts`, `services/session-sync.service.ts`, `services/workspace-db.service.ts`
- **Evidence:**
  - `state/workspaces/workspaces.effects.ts:198-235` — `persistMeta$` debounces 300 ms, does `getMeta(current)` → merge → `putMeta(...)`, i.e. a **non-transactional read-modify-write**, explicitly re-applying `activeClientUpdatedAt`/`activeSyncedAt` it just read.
  - `services/session-sync.service.ts:540-546` — `markActiveDirty()` does its **own** `getMeta` → mutate `activeClientUpdatedAt` → `putMeta`, on the same record, from a different async chain (`session-sync.effects.ts:66-82`, debounce 2000 ms).
  - `services/workspace-db.service.ts:144-152` — `putMeta` is a bare `put` in its own transaction. No optimistic-concurrency check, no version field.
  - `services/session-sync.service.ts:511-522` — `pullAndMergeSessions()` sets `item._meta.trading = defaultTradingData()` and clears `activeSessionId` for a symbol whose session the cloud says was deleted (D1 removal) — **including the symbol currently open in the store**, with no store dispatch.
- **Observed pattern:** three writers (NgRx `persistMeta$`, `markActiveDirty`, `pullAndMergeSessions`) mutate one `WorkspaceMeta` row with no arbitration; only one of them (the store) also feeds the UI.
- **Why it matters HERE:** the record holds the trader's session — balance, open positions, closed-trade history. This is the app's most valuable durable artifact.
- **Concrete risk:** (a) lost update — `markActiveDirty` stamps a fresh clock, then `persistMeta$` writes the stale clock it read 300 ms earlier over it, so the session never syncs; (b) resurrection — `pullAndMergeSessions` blanks `meta.trading` per the cloud's delete, then `persistMeta$` fires 300 ms later and writes the still-live store state back, and `markActiveDirty` marks it dirty, pushing the deleted session back to the cloud.
- **Recommended direction:** make the store the sole writer of `meta.trading`/`activeSessionId`. Sync must express its outcomes as **actions** (`Sync Removed Session`, `Sync Won With Cloud Copy`), reduced into the store, with persistence flowing out through the existing single `persistMeta$` path. Split the LWW clock fields into their own object store so no writer ever needs to read-modify-write a record it doesn't own.
- **Migration difficulty:** **High** — touches sync, effects, and the sessions page.
- **Best mechanism:** RFC (this crosses `session-sync.md` and `replay-trading.md` domains).
- **Acceptance condition:** exactly one call site of `db.putMeta` writes `trading`/`sessions`/`activeSessionId`; a test proves a cloud delete of the OPEN symbol's session leaves it deleted after ≥2 s of subsequent replay ticks.

### TD-2 — `SesionesPageComponent` is an application controller with 3 unreconciled data sources
- **Category:** Angular architecture / state ownership
- **Severity:** **HIGH**
- **Scope:** `pages/sesiones/sesiones-page.component.ts` (1294 lines)
- **Evidence:**
  - `:219-228` — **10 injected dependencies** (`Store`, `WorkspaceDbService`, `Router`, `DialogService`, `SessionService`, `StorageManagerService`, `MarketDataRepository`, `DataOnboardingService`, `ManifestService`, `SessionSyncService`).
  - **50 methods** (`:373`–`:1290`), of which 22 are `async` and perform I/O.
  - `:232-257` — 15 local signals holding **domain** data: `metas`, `folders`, `cloudSummaries`, `localDatasets`, plus `syncState`.
  - `:278-319` — `allCards` computed reconciles store-live state against IndexedDB metas with an inline `const live = meta.symbol === current` branch: **the merge rule for "which copy of a session is true" lives in a template-facing computed.**
  - `:917-948` (`archive`), `:951-1006` (`remove`) — every mutation is written **twice**, once as `this.store.dispatch(...)` for the current asset and once as a hand-rolled IndexedDB mutation (`meta.sessions = [...]; meta.trading = ...; await this.db.putMeta(meta)`) for every other asset. The two paths are kept equivalent only by eye.
  - `:471-501` — `reload()` swallows every failure into empty arrays (`catch { this.metas.set([]) }`), so a transient IndexedDB error renders as "you have no sessions".
  - No `OnPush`; `:488` binds `[attr.points]="sparkPoints(card.equity, 300, 40)"` — an O(n) string build per card **per change-detection cycle** in a zone-based app (`sparkPoints` at `:574-588` does two spreads of the whole equity array plus a map+join).
- **Observed pattern:** a page component that owns persistence, sync, migration, navigation, and drag-and-drop.
- **Why it matters HERE:** this is the screen where sessions are deleted and renamed. Its correctness is the correctness of the archive.
- **Concrete risk:** archive/delete divergence between the current asset and any other; `sparkPoints` re-running for every card on every mouse move.
- **Recommended direction:** lift the session list into a `sessions` NgRx feature with effects owning IndexedDB + Supabase reads; the component becomes presentational + dispatch. Move `sparkPoints` output into the card model (computed once per card).
- **Migration difficulty:** **High**.
- **Best mechanism:** RFC.
- **Acceptance condition:** the component injects ≤3 dependencies, contains zero `await this.db.*` calls, and `allCards` no longer branches on `meta.symbol === current`.

### TD-3 — Effect execution order (class field declaration order) is load-bearing for trading correctness
- **Category:** NgRx / temporal coupling
- **Severity:** **HIGH**
- **Scope:** `state/trading/trading.effects.ts`, `state/workspaces/workspaces.effects.ts`
- **Evidence:**
  - `state/trading/trading.effects.ts:64-67` — literal comment: *"Scheduled end … **Declared after processFills$** so the fills of that final candle are applied before closing."* `processFills$` (`:21`) and `endOnSchedule$` (`:66`) both `ofType(ReplayActions.goToTime)`. NgRx subscribes effects in property-declaration order, so **moving a class field silently changes whether the last candle's SL/TP fills before the session closes.**
  - `state/workspaces/workspaces.effects.ts:290-448` — `doSwitch()` returns an ordered `Action[]` flattened by `mergeMap((actions) => actions)` (`:188`). `:341-343` documents the required order: *"Order matters: trading → drawings → layout/linkGroups … → interval → speed"*. Nine optional continuation fields (`thenLoad`, `thenImport`, `thenRestore`, `thenNewSession`, `thenOpenSession`, `thenGoTo`, `thenSessionEnd`, `selectedTfs`, `executionCosts`) are packed into a single `switchAsset` command payload — an orchestration script smuggled through an action.
  - `components/workspace/workspace-viewport.component.ts:441-451` — `closeTab()` dispatches `purgePanelDrawings` **then** `closeTab`; the doc comment concedes *"this is two dispatches for one user gesture, not one atomic action"*. Any other caller of `closeTab` leaks orphaned drawings.
- **Observed pattern:** correctness encoded in ordering rather than in state or in a single atomic action.
- **Why it matters HERE:** the ordered pair in `trading.effects.ts` decides money outcomes (does the final SL fill?), and it is invisible to every one of the four verification gates.
- **Concrete risk:** a formatter, an import reorder, or a refactor that groups effects by topic silently changes trading results with all tests green. This is the exact failure mode recorded in the RFC-019 memory ("the Task 5 audit NOT PASS — a false invariant all four gates called green").
- **Recommended direction:** for the trading pair, make the coupling explicit in *data* — have `processFills$` emit a terminal `Candle Processed` event that `endOnSchedule$` listens for, instead of both racing on `goToTime`. For `closeTab`, add a single `Close Tab` action reduced by both `layout` and `drawings` reducers (NgRx supports multi-reducer actions natively).
- **Migration difficulty:** Medium.
- **Best mechanism:** targeted refactor + a regression spec.
- **Acceptance condition:** a spec that registers `TradingEffects` with the two effect fields in **reversed** declaration order and still asserts the final candle fills before `endSession`.

### TD-4 — Active timeframe has two mirrored owners
- **Category:** NgRx / state ownership
- **Severity:** **MEDIUM**
- **Scope:** `state/layout/layout.reducer.ts`, `state/layout/layout.effects.ts`
- **Evidence:**
  - `state/layout/layout.effects.ts:19-45` — `syncTimeframeOnFocus$`: focusing a panel dispatches `MarketActions.changeTimeframe({ tf: panel.timeframe })`, mutating the **global** `market.activeTf`.
  - `state/layout/layout.reducer.ts:255-266` and `:268-280` — the reverse direction: `MarketActions.changeTimeframe` / `changeCustomTimeframe` write `panels[focusedPanelId].timeframe`.
  - The cycle is broken only by two identity guards (`:259` `if (panel.timeframe === tf) return state;`, `:252`), not by structure.
- **Observed pattern:** bidirectional mirror between a global slot and a per-entity field.
- **Why it matters HERE:** `market.activeTf` feeds `selectActiveTfSeconds` → `selectReplayTfSeconds` → `selectFillContext` (`state/selectors.ts:463`, `:600`, `:700`). So **which panel has focus changes the replay's advance grain and the fill context.** RFC-019's `selectExecutionSeries` (`selectors.ts:629`) mitigates fill *fidelity* by walking the finest series regardless, but the cursor step size still follows focus.
- **Concrete risk:** clicking an H4 observation panel silently changes each replay tick from 1 minute to 4 hours; a future edit to either guard reintroduces an infinite dispatch loop.
- **Recommended direction:** name one owner. Either `layout.panels[focusedPanelId].timeframe` is the truth and `market.activeTf` becomes a derived selector, or vice versa. Do not keep both writable.
- **Migration difficulty:** Medium.
- **Best mechanism:** RFC amendment (touches frozen 008-012 decisions).
- **Acceptance condition:** only one of the two is written by a reducer; a test asserts no action round-trips between the layout and market slices.

### TD-5 — `chart.component.ts`: one class, ~9 responsibilities, no `OnPush`, 5 hand-registered DOM listeners
- **Category:** Angular architecture
- **Severity:** **MEDIUM-HIGH**
- **Scope:** `components/chart/chart.component.ts` (1694 lines)
- **Evidence — responsibility breakdown (46 methods):**
  1. **Engine lifecycle + capability registration** — `:625-650`
  2. **Windowed candle rendering / lazy prepend** — `render:751`, `renderWindow:853`, `maybeLoadMore:869`, `applyForming:841`; state `renderedIdx/renderedTf/renderedZone/renderedCandles/winStart/renderedTimes/renderedFormingTime/loadingMore` (`:498-516`)
  3. **Theme/colour application** — `applyColors:730` plus 7 mutable colour fields (`:526-532`)
  4. **Right-click context menu** — `handleContextMenu:914`, `menuFit:974`, `menuHideBox:957`, `menuPlace:1032`
  5. **A modal date dialog** (its own inline template, ARIA, validation) — `:162-189`, `menuGoToDate:996`, `confirmDateDialog:1013`, `dialogValid` computed `:466`
  6. **Interactive order placement state machine** — `PlacingState` (`:102`), `updatePlacingHover:1065`, `handlePlacingClick:1099`, `finishPlacing:1129`, `cancelPlacing:1157`, plus direct `createPriceLine` previews (`:1042/1050/1111`)
  7. **Trade-line dragging with a live points/lots/R readout** — `dragTradeLine:1198`, `dragReadout:1237`
  8. **Drawing creation/selection/drag/snap** — `handleClick:1273`, `applySnap:1388`, `handleMouseDown:1440`, `handleDragMove:1586`, `endDrag:1628`, `pasteClipboardAt:1339`
  9. **Global keyboard shortcut router** (Delete/undo/redo/copy/paste/Escape, with focus gating and a typing-target guard) — `onKeyDown:557-604`
- **Also:** `:625-712` registers **5** listeners by hand (`window keydown/keyup/mouseup`, `el mousedown/mousemove/contextmenu/auxclick`) with manual removal in `ngOnDestroy:1678`; `NgZone.run()` is called manually **9 times**; no `ChangeDetectionStrategy.OnPush`.
- **Observed pattern:** the size is **not coherent** — it is a mixture. Items 4, 5, 6, 7 have no dependency on items 2 and 8 beyond shared access to `this.series`.
- **Why it matters HERE:** every panel instantiates one. At 8 panels that is 8× the listener set and 8× the CD cost of a non-OnPush component in a zone-based app during high-frequency replay.
- **Concrete risk:** the "Ir a fecha" dialog and the placement state machine are untestable without a full lightweight-charts DOM; this is precisely the "a test that doesn't cross the boundary can't see the defect" lesson already recorded twice in project memory.
- **Recommended direction:** extract, in order of independence: (a) the date dialog into a `ui/` component; (b) the placement state machine into a framework-free class taking a price-conversion port; (c) the render window into a `RenderWindow` helper. Add `OnPush`.
- **Migration difficulty:** Medium (each extraction is independent).
- **Best mechanism:** SDD plan, one task per extraction.
- **Acceptance condition:** file under 900 lines; the placement state machine has unit tests with no DOM.

### TD-6 — Render state is component-private, defeating the state-first invariant (I6)
- **Category:** State ownership / I6
- **Severity:** **MEDIUM**
- **Scope:** `components/chart/chart.component.ts`
- **Evidence:** ~24 private mutable fields hold what the user actually sees — `renderedIdx:498`, `renderedTf:499`, `renderedCandles:502`, `winStart:504`, `renderedTimes:506`, `renderedFormingTime:508`, `panelDrawings:518`, `tradeMarkers:578`, `tradeBoxes:579`, `lastTradeView:581`, `draft:536`, `draftP1:535`, `quickRuler:538`, `drag:540`, `lineDrag:583`, `placingLines:490`, `displayZone:525`, `accent/up/down/tpZone/slZone/boxFillAlpha/boxBorderAlpha:526-532`.
- **Observed pattern:** the store says what data exists; the component decides what is painted. The two can disagree and nothing detects it.
- **Why it matters HERE:** CLAUDE.md's I6 says the UI reflects state. Here the *window* (which 12 000 of N candles are painted, `RENDER_WINDOW:87`) is a second, invisible truth that no selector, no test, and no telemetry can observe.
- **Concrete risk:** a rewind/jump that leaves `winStart` stale paints a correct dataset at the wrong offset — a lookahead-class defect of exactly the family RFC-019 closed, but in a layer with no invariant test.
- **Recommended direction:** promote the *window descriptor* (`{ start, end, tf, zone }`) — not the candles — into observable state or at minimum into a `readonly` accessor the panel spec can assert on.
- **Migration difficulty:** Low-Medium.
- **Best mechanism:** SDD task.
- **Acceptance condition:** a spec can assert the painted window after a rewind without touching lightweight-charts.

### TD-7 — `effect()` used as a state-propagation bridge (4 sites)
- **Category:** Angular / signals
- **Severity:** **LOW-MEDIUM**
- **Scope:** `components/workspace/chart-panel.component.ts`, `components/workspace/workspace-viewport.component.ts`
- **Evidence:**
  - `chart-panel.component.ts:471-473` — `effect(() => { if (this.visible()) this.hasBeenVisible.set(true); })` — an effect whose only job is to write another signal (a sticky latch).
  - `chart-panel.component.ts:474` — `effect(() => this.mapper.configurePanel(this.descriptor()))` — pushes signal state into an RxJS `ReplaySubject`.
  - `chart-panel.component.ts:475` — `effect(() => this.mapper.setUpdatesEnabled(this.visible()))`.
  - `workspace-viewport.component.ts:409-411` — `effect(() => this.syncRouter.setState({ panels: this.panels(), linkGroups: this.linkGroups() }))` — pushes store state into a framework-free router's mutable field.
- **Context7 check (Angular v21 official source):** signal writes inside `effect()` are now **unconditionally allowed** (`BASE_EFFECT_NODE` hardcodes `consumerAllowSignalWrites: true`; `allowSignalWrites` is deprecated and warns). So these are **not API violations** — they are design smells only.
- **Why it matters HERE:** each is a place where the reactive graph's edge is invisible to `computed()`. `hasBeenVisible` is genuinely derivable (`linkedSignal` with a custom `equal`, or a `computed` over a monotone source) and would then be inspectable.
- **Concrete risk:** low today. The `configurePanel`/`setState` bridges are the pragmatic signal→RxJS/imperative adapters and are defensible; only the latch is avoidable.
- **Recommended direction:** convert the latch; leave the three bridges but document them as adapters in `workspace-panels.md`.
- **Migration difficulty:** Low.
- **Best mechanism:** inline cleanup.
- **Acceptance condition:** zero `effect()` whose body writes only a signal of the same component.

### TD-8 — Store state copied into mutable directive fields
- **Category:** State ownership
- **Severity:** **LOW**
- **Scope:** `state/playbook/playbook-hotkeys.directive.ts`
- **Evidence:** `:14-15` — two `store.select(...).subscribe(...)` calls whose only body is `this.bySlot = m` / `this.loaded = l`; teardown is hand-rolled at `:18-21`.
- **Why it matters HERE:** it is the only place in the app that reads the store this way; 98 other sites use `selectSignal`. It is a lone inconsistency, and it hand-rolls teardown that `takeUntilDestroyed` (or `selectSignal`) gives free.
- **Recommended direction:** replace both with `store.selectSignal(...)`; delete the constructor and the two fields.
- **Migration difficulty:** **Trivial** (≈8 lines).
- **Best mechanism:** inline cleanup.
- **Acceptance condition:** file has no `.subscribe()`.

### TD-9 — 33 of 61 components lack `OnPush` in a zone-based app
- **Category:** Angular / performance
- **Severity:** **MEDIUM**
- **Scope:** app-wide; full list in MEASURED FACTS above.
- **Evidence:** `app.config.ts` has no `provideZonelessChangeDetection()`, so zone.js drives global change detection. The non-OnPush set includes the two heaviest surfaces (`chart.component.ts`, `sesiones-page.component.ts`) and every `ui/` primitive (`dropdown`, `date-picker`, `modal`, `menu`, `segmented-control`, `color-field`), which are the components most often rendered N times.
- **Aggravating measured fact:** template expressions that recompute per CD tick — `pages/sesiones/sesiones-page.component.html:488` `sparkPoints(card.equity, 300, 40)`; `components/workspace/workspace-viewport.component.ts:401` `activeTabTemplate` declared as a **plain arrow-function property, not a `computed()`**, and read from the template; `pages/journal/performance-grid.component.html:71,81` `excursionLabel(stats().maeRMean)`; `session-summary.component.html:165,181,182` `outcomeLabel(t)`/`maeR(t)`/`mfeR(t)` inside a `@for`.
- **Mitigating measured fact:** the app uses **0** `| async` pipes and **98** `selectSignal` reads, so signal-based CD is already viable — adding `OnPush` is mostly mechanical.
- **Recommended direction:** add `OnPush` to the 27 leaf/`ui` components first (near-zero risk), then the four page components, then `chart.component.ts` last. Convert the four parameterized template calls into `computed()`/precomputed model fields.
- **Migration difficulty:** Low per component; Medium in aggregate.
- **Best mechanism:** one SDD task, batched by folder.
- **Acceptance condition:** every `@Component` declares `changeDetection`, enforced by an ESLint rule (`@angular-eslint/prefer-on-push-component-change-detection`).

### TD-10 — 12 of 19 `catchError` sites swallow to `EMPTY`
- **Category:** RxJS / observability
- **Severity:** **MEDIUM**
- **Scope:** `state/sync/session-sync.effects.ts`, `state/lessons/lessons.effects.ts`, `state/playbook/playbook.effects.ts`
- **Evidence:** `session-sync.effects.ts:52`, `:80`, `:103`; `lessons.effects.ts:78`, `:108`, `:151`; `playbook.effects.ts:81`, `:118`, `:161`; plus `lessons.effects.ts:57` and `playbook.effects.ts:56` which swallow a hydration failure into an **empty result** (`hydrated({ lessons: [] })`) — indistinguishable from "the user has no lessons".
- **Also:** `pages/sesiones/sesiones-page.component.ts:471-479` does the same with `try/catch` → `this.metas.set([])`.
- **Observed pattern:** the swallow is deliberate and documented (`session-sync.effects.ts:26-29`: keeping the long-lived stream alive). The problem is not the swallow, it is that **nothing is recorded**.
- **Why it matters HERE:** the app has a dedicated telemetry subsystem (`state/telemetry/`, its own IndexedDB) yet sync failures produce zero signal. A user whose cloud sync has been failing for a week sees an identical UI to one whose sync works.
- **Concrete risk:** silent divergence between local and cloud; unfalsifiable "my session disappeared" reports.
- **Recommended direction:** keep `catchError → EMPTY` for stream survival, but `tap` the error into the existing telemetry sink first, and distinguish "empty" from "failed" in the hydration actions (`hydrated({ lessons: [], failed: true })`).
- **Migration difficulty:** Low.
- **Best mechanism:** SDD task.
- **Acceptance condition:** zero bare `catchError(() => EMPTY)`; each has an observable side effect.

### TD-11 — Duplicated derivation between the state layer and the mapper
- **Category:** NgRx / layering
- **Severity:** **LOW-MEDIUM**
- **Scope:** `state/selectors.ts`, `components/chart/chart-model-mapper.service.ts`
- **Evidence:**
  - `chart-model-mapper.service.ts:60-64` `computeCountdown()` reimplements `state/selectors.ts:544-552` `selectCandleCountdown` verbatim (same bucket math, same `formatCountdown` call).
  - `chart-model-mapper.service.ts:464-482` `resolvePanelCandles()` calls `generateCustomSeries` — the same custom-TF generation the market slice owns (`marketFeature.selectCustomSeries`, `state/selectors.ts:203-210`). Two independent generators for the same synthetic series.
  - `chart-model-mapper.service.ts:347-407` `chartView$` and `:780-803` `panelChartView$` are two overlapping per-panel derivations, both computing `lastIndexAtOrBefore(candles, currentTime)` from the same inputs into different shapes (`{tf,candles,idx,displayZone,forming,countdown}` vs `{symbol,timeframe,candles,idx,displayZone}`), consumed by `chart.component.ts:653` and `chart-panel.component.ts:376` respectively.
  - `state/selectors.ts:746-749` `floatingPnl()` duplicates `state/trading/fill-engine.ts:50-51` (identical `dir`/`entryPrice` arithmetic).
  - `state/selectors.ts:288-292` claims `snapToCandle` is reused by the mapper, but `grep -rn "snapToCandle"` shows it is used **only inside `selectors.ts`** — the mapper reaches the same logic through `selectTradeMarkers.projector` (`:523`). The doc comment is stale.
- **Why it matters HERE:** the countdown and the forming candle are what the trader reads as "time left"; two implementations can drift and only one is covered by `selectors.spec.ts`.
- **Recommended direction:** export the pure bucket/countdown helper once (from the market domain) and have both the selector and the mapper call it. Fold `panelChartView$` into `chartView$` (the former is a strict subset plus `symbol`).
- **Migration difficulty:** Low.
- **Best mechanism:** inline refactor + spec.
- **Acceptance condition:** one definition of the countdown; one per-panel view stream.

### TD-12 — `state/selectors.ts` (853 lines) — NOT a junk drawer, but it holds presentation and domain arithmetic
- **Category:** NgRx / layering
- **Severity:** **LOW**
- **Scope:** `state/selectors.ts`
- **Verdict:** the file is **coherent and unusually well documented** — 43 `createSelector` calls, each with a rationale comment, organized into market → trading → replay-resolution → fill-context sections. It is a *barrel of cross-slice derivations*, which is a legitimate role, not a dumping ground. Explicitly **not** a finding of the "junk drawer" kind.
- **What does belong elsewhere:**
  - **Presentation formatting:** `formatCountdown:530` (`MM:SS`/`HH:MM:SS`), and Spanish marker text built inside a selector — `:326` `text: \`${side === 'buy' ? 'C' : 'V'} ${lots}\`` and `:337` `text: \`${sign}$${Math.abs(t.profit).toFixed(2)}\``. UI copy in the state layer.
  - **Domain arithmetic:** `floatingPnl:746` (duplicate of `fill-engine.ts:50`), `snapToCandle:293` (a binary search).
  - **Known dead weight, self-declared:** `selectTradeChartView:427` carries *"it may have no production consumer left after F3"* — confirmed by grep (mapper consumes raw slices instead). It is kept alive by its own spec.
- **Recommended direction:** move `formatCountdown` + marker text to a presentation module; move `floatingPnl`/`snapToCandle` next to `fill-engine.ts`; retire `selectTradeChartView` + `selectTradeMarkers`' store wiring once TEDS Phase 4 Task 6 runs (already scheduled — do not pre-empt).
- **Migration difficulty:** Low.
- **Acceptance condition:** no string literal intended for the user appears in `state/**`.

### TD-13 — 87% of actions are commands; the store is largely a setter API
- **Category:** NgRx / modelling
- **Severity:** **LOW** (informational — naming is *consistent*, the ratio is the observation)
- **Evidence:** 99 actions total; **13** event-shaped (`Session Resolved`, `Auth Success`, `Auth Failure`, `Logged Out`, `Lessons Synced`, `Csv Loaded`, `Custom Timeframe Generated`, `Replay Resolution Generated`, `Rules Synced`, `End Of Data`, `Session Imported`, `Workspace Restored`, `Assets Loaded`); **86** command-shaped (`Set Panel Timeframe`, `Change Grid`, `Open Market`, `Pick Tool`, …). Per feature: layout 15/15 commands, settings 9/9, drawings 11/11, link-groups 6/6, trading 23/24.
- **Naming consistency: GOOD.** Every action follows `[Source] Verb Object` via `createActionGroup` (`source:` present in all 11 action files), commands imperative, events past-tense. There is no drift to fix.
- **Interpretation:** a command-heavy store is a defensible choice for a single-user local-first app, and the trading slice is where it matters least (`Open Market`, `Close Position` are genuinely commands). The cost shows up where a *user gesture* fans out into multiple commands whose order matters — see TD-3 (`closeTab`, `switchAsset`'s nine `then*` fields). Those are the specific cases worth converting to events.
- **Recommended direction:** no blanket change. Convert only the multi-dispatch gestures identified in TD-3.

### TD-14 — Accidental frameworks: verdicts
- **Category:** Abstraction cost
- **Severity:** informational

| Abstraction | Size | Verdict |
|---|---|---|
| `ChartEventBus` (`domain/chart/chart-event-bus.ts`) | **38 lines**, 3 event types | **JUSTIFIED — keep.** This is the cheapest possible typed pub/sub and it is exactly what makes I1 clause 1 true. Not a framework. |
| `Capability` system (`domain/chart/capability.ts`) | **34 lines** interface, 4 implementations, engine registry `chart-engine.ts:168-178` | **JUSTIFIED but LEAKY.** The abstraction is sound and cheap. Its problem is not cost, it is that it is **bypassed** — see I2/TD-5 (preview price lines drawn straight on `seriesApi`). Value is only realized if the escape hatch closes. |
| `ChartModelMapper` memo layer (`chart-model-mapper.service.ts`, 887 lines) | 7 memo slots + 2 memo combinators + a `gated()` operator | **JUSTIFIED, at high documentation cost.** It is the entire mechanism behind I5 and it demonstrably works (zero factory selectors app-wide). But ~40% of the file is comment explaining why hand-rolled memoization is necessary, and it couples to an NgRx internal (`.projector`, `:523`, `:556`). Watch for a 4th and 5th slot; that is the signal to reify a small `memoOn(inputs, compute)` helper. |
| `ChartSyncBus` + `ChartSyncRouter` (`domain/chart/chart-sync-bus.ts` 49 lines + `components/workspace/chart-sync-router.ts` 133) | 2 classes | **UNVERIFIED** — not audited. |
| `WorkspaceDbService` (460) / `SessionSyncService` (915) | generic-ish repositories | **PARTIAL** — `SessionSyncService` has 23 methods spanning sessions, folders, playbook rules and lessons; it is on the edge of being a god-service. See TD-1. Full verdict pending. |

---

## DEAD ENDS / CONFIRMED NON-ISSUES (do not re-investigate)

1. **Factory selectors — none exist.** `grep -rn "return createSelector"` → 0. I5 is genuinely clean. Two files (`lessons.selectors.ts:13`, `playbook.selectors.ts`) even carry explicit "no per-X factory selectors (D8 ban)" comments with a correct one-map alternative.
2. **Angular/NgRx imports under `domain/`** — 0 matches. I1 clause 1 is clean.
3. **Immutability / in-place mutation — a NON-ISSUE.** Swept `state/`, `domain/`, `services/`, `components/`, `pages/`. Every `push`/`sort` found operates on a **locally constructed** array. The two that looked dangerous were checked and cleared: `domain/reflection/build-scene-spec.ts:106` and `domain/reflection/waypoints.ts:68` both sort the result of a `.filter()` (a fresh array). `state/playbook/playbook.selectors.ts:10` sorts after `.filter()`. `state/selectors.ts:340` sorts a locally built `markers`. `drawings.reducer.ts:47` pushes into a freshly built `ownerIndex`. Reducers are uniformly immutable and go further than required (`clearSelectionsAmong:70` returns `null` to allow identity-return). **No mutation-driven stale views exist.** The only mutation worth noting is object-level, not array-level: `sesiones-page.component.ts:929-943` and `session-sync.service.ts:513-521` mutate the `WorkspaceMeta` object fetched from IndexedDB before writing it back — captured under TD-1, not as an immutability finding.
4. **Subscription leaks — none.** All 12 `.subscribe()` sites have teardown (8 via `takeUntilDestroyed`, 2 via `DestroyRef.onDestroy`, 1 via a held `Subscription` + `destroy()`, 1 self-unsubscribing in `dialog.service.ts:57-63`).
5. **Higher-order operator misuse — none found.** All 27 sites checked. Saves use `concatMap` (9 sites, correct — ordered, no cancellation); auth and pull-and-merge use `exhaustMap` (6 sites, correct — ignore concurrent triggers); `switchMap` is used only where cancellation is right (`autoplay$` at `replay.effects.ts:157`, hydration reads); `mergeMap` is used to flatten `Action[]` (correct idiom). **No `switchMap` on a save action.**
6. **`shareReplay` misuse — no `shareReplay` in the codebase at all.** Multicasting is handled by the NgRx store itself.
7. **Nested subscriptions — none.** No `.subscribe()` inside a `.subscribe()`.
8. **`async` pipe / observable-vs-signal tension — resolved already.** 0 `| async`, 98 `selectSignal`, 2 `toSignal`, 0 `toObservable`. Templates are uniformly signal-based; observables survive only where genuinely stream-shaped (effects, the mapper's `combineLatest` pipelines). **Do not recommend a Signals migration** — the boundary is already drawn correctly.
9. **`state/selectors.ts` is not a junk drawer** — see TD-12. Do not re-read the whole file.
10. **Action naming is consistent** — `createActionGroup` with a `source:` in all 11 files. No naming cleanup needed; only the *ratio* is interesting (TD-13).
11. **`constructor` DI vs `inject()`** — effectively resolved: 120 `inject()` calls, exactly 1 genuine constructor-param DI (`chart-sync-router.ts:61-64`, a framework-free class where it is correct). Some services use the `param: T = inject(T)` default-value idiom (`session-sync.service.ts:41-42`, `data-onboarding.service.ts:103-104`, `storage-manager.service.ts:20-21`) — a testability affordance, not debt.

---

## THREE HIGHEST-LEVERAGE RECOMMENDATIONS (current ranking)

1. **Give `WorkspaceMeta.trading` exactly one writer (TD-1).** Three uncoordinated writers to the record holding the trader's balance and trade history, with a demonstrable resurrect-a-deleted-session race. Highest value at risk; no test can currently see it.
2. **Kill declaration-order-as-correctness in `TradingEffects` (TD-3).** `endOnSchedule$` must be declared after `processFills$` or the final candle's SL/TP never fills — invisible to all four verification gates, and a reformat can break it. Cheap to fix (one event action), catastrophic to leave.
3. **Encode I1/I2 mechanically instead of in prose (I1/I2 + TD-5).** Add an ESLint `no-restricted-imports` zone for `domain/chart/**` (cheap, makes clause 1 permanent) and, more importantly, remove the `chartApi`/`seriesApi` getters so the 25 direct library calls in `chart.component.ts` must become capabilities. Every invariant in CLAUDE.md that is *documented but not encoded* has already drifted (I2 has 5 core edits, I6 has 24 private render fields); I5 is the only one that is encoded-in-practice and it is the only one that held.

---

## RESUME BRIEF

*(Self-contained — a fresh agent with zero conversation history can start here.)*

### (a) Role and remaining scope

You are a **Principal Engineer performing a READ-ONLY technical-debt audit** of the `trading-emulator` repository at `C:\Users\78701\Desktop\trading-emulator`, branch `develop`, HEAD `a2ca53b`. Your specialty is **Angular / NgRx / RxJS / State Ownership**.

**ABSOLUTE RULES:** READ-ONLY on all repository source. The ONLY files you may write are under `C:\Users\78701\Desktop\trading-emulator\.superpowers\audit-2026-08-10\`. Every claim needs `path/to/file.ts:line` evidence. Counts must be generated mechanically — no invented metrics. Separate MEASURED FACT / INTERPRETATION / RECOMMENDATION. **Do not** recommend replacing RxJS with Signals wholesale or rewriting NgRx without concrete failure modes (and note: item 8 in DEAD ENDS already establishes the signal/observable boundary is correctly drawn — do not revisit). For any Angular 21 API question, consult the `context7` MCP (`libraryId: /angular/angular`) rather than recall.

App code lives under `emulador/src/app` (NOT repo-root `src/`). Read `docs/engineering/PHILOSOPHY.md` before non-trivial judgement calls.

**Deliverable:** append to / revise this same file, then return a digest of **at most 140 lines** containing: the I1–I6 verdict table, the state-ownership table, the RxJS counts, the responsibility breakdown of the 3 largest components, and the 3 highest-leverage recommendations. Do not pad.

**Remaining investigation scope** (the numbered areas from the original brief that are not yet closed):
- **(2) Angular architecture** — smart vs presentational classification; `output()` vs `EventEmitter`; component boundaries; feature-folder organization; `services/` responsibility map; the unread components listed in AREAS PARTIAL.
- **(3) NgRx** — `trading.reducer.ts` (470) and `drawings.reducer.ts` (541, only the head read) for "reducers doing too much"; `telemetry.effects.ts` (521) line-by-line; state normalization; UI-only state persisted globally.
- **(4) State ownership** — resolve the 3 UNVERIFIED rows (settings, market-data cache, telemetry).
- **(7) Accidental frameworks** — `ChartSyncBus`/`ChartSyncRouter`, `WorkspaceDbService`, `SessionSyncService`, and the entirely unexamined `lotaje/` stack (7 files / 2488 LOC).

### (b) Commands already run — DO NOT RE-RUN

All run from `C:/Users/78701/Desktop/trading-emulator/emulador/src/app` unless noted.

| Command | Key output |
|---|---|
| `git log --oneline -1` (repo root) | `a2ca53b Merge pull request #56 from Humerez-Sebas/chore/backmerge-main-into-develop` |
| LOC-per-directory loop over `*.ts` excluding specs | auth 3/77 · components 53/10076 · domain 26/3112 · **lotaje 7/2488** · pages 27/4331 · services 18/3966 · state 62/8713 · workers 2/237 · **204 src files total** |
| `wc -l` over components/pages/services | chart.component 1694 · sesiones-page 1294 · session-sync.service 915 · chart-model-mapper 887 · chart-panel 581 · workspace-viewport 543 · workspace-db.service 460 · custom-color-picker 417 · session.service 383 · reflection-cabin-page 382 · session-sync.mapping 354 · frozen-scene-host 349 · date-picker 347 · interactive-candles 339 · dropdown 324 |
| `wc -l state/*/*.ts` | drawings.reducer 541 · telemetry.effects 521 · fill-engine 584 · trading.reducer 470 · workspaces.effects 456 · journal-read.models 431 · layout.reducer 331 |
| `grep -rn "from '@angular\|from '@ngrx" domain/` | **NONE** |
| `grep -rn "from 'rxjs" domain/chart/` | 1 hit: `chart-sync-bus.ts:2` |
| `grep -rn "return createSelector"` (whole app) | **NONE** — no factory selectors |
| `grep -rc "createSelector" state/selectors.ts` | **43** |
| OnPush loop over all `@Component` files | **61 components, 28 OnPush, 33 without** (full offender list is in MEASURED FACTS) |
| `grep -rn "\.subscribe(" --include=*.ts . \| grep -v spec \| wc -l` | **12** — chart.component 6, playbook-hotkeys 2, chart-sync-router 1, dialog.service 1, csv-start-dialog 1, app.ts 1 |
| `grep -rn "takeUntilDestroyed"` non-spec | 11 raw occurrences = 3 imports + **8 uses** → 67% adoption; remaining 4 have manual teardown; **0 leaks** |
| operator greps (`switchMap`/`concatMap`/`mergeMap`/`exhaustMap`) | 5 / 9 / 7 / 6 — every site listed and judged correct |
| `grep -rn "catchError"` non-spec | 19 sites, **12 are `→ EMPTY`** |
| `grep -rn "shareReplay\|publishReplay\|share("` | **NONE** |
| `grep -rn "new Subject\|new BehaviorSubject\|new ReplaySubject"` | **3** — `chart-model-mapper.service.ts:195` (ReplaySubject), `:228` (BehaviorSubject), `chart-sync-bus.ts:33` (Subject) |
| `grep -rn "effect("` non-spec, excluding createEffect | **14 sites** / 8 files: `chart.component.ts:424`; `chart-panel.component.ts:471,474,475`; `workspace-viewport.component.ts:409`; `journal-page.component.ts:124,129`; `r2-markets.component.ts:94`; `cabin-trade-list.component.ts:151`; `frozen-scene-host.component.ts:273`; `lesson-form.component.ts:155`; `reflection-cabin-page.component.ts:154,161,168` |
| signal API counts | `signal(` 55 · `computed(` in 29 files · `linkedSignal` 4 · `toSignal` 2 · `toObservable` **0** |
| `grep -rn "= inject("` non-spec | **120**; genuine constructor DI: **1** (`chart-sync-router.ts:61-64`) |
| `grep -rn "\| async"` in html+ts | **0** |
| `grep -rn "selectSignal"` non-spec | **98** |
| `grep -rn "@HostListener\|@HostBinding"` | **9 HostListener, 0 HostBinding** — `app.ts:39`, `drawing-toolbar:41`, `interval-dialog:100`, `toolbar-tools:125,131`, `ui/draggable.directive:38`, `journal-page:173`, `reflection-cabin-page:335`, `playbook-hotkeys.directive:24` |
| node script counting actions over `state/*/*.actions.ts` | **99 actions, 13 event-shaped, 86 command-shaped** — full event list in TD-13 |
| `git log --oneline -- emulador/src/app/domain/chart/chart-engine.ts \| wc -l` | **14 commits** (5 after the capability registry `c97daf0`) |
| `git log --oneline -- .../capability.ts \| wc -l` | **1** |
| `grep -c "this.series[?.!]"` / `"this.chart[?.!]"` in chart.component.ts | **21 / 4** |
| in-place mutation sweep (`push\|splice\|sort\|reverse\|unshift\|shift\|pop`) over state/domain/services/components/pages | ~60 hits, **all cleared** — see DEAD ENDS #3 |
| template computation grep over all 29 HTML files | offenders: `sesiones-page.html:488` `sparkPoints(card.equity,300,40)`; `performance-grid.html:71,81`; `time-of-day-table.html:23`; `session-summary.html:165,181,182` |
| `node -e` on `emulador/package.json` | `@angular/core ^21.2.0`, `@ngrx/store ^21.1.1`, `rxjs ~7.8.0`, 14 runtime deps |
| context7 `/angular/angular` — "when not to use effect(), writing signals in effect" | **`BASE_EFFECT_NODE` hardcodes `consumerAllowSignalWrites: true`; `allowSignalWrites` is deprecated and warns in dev.** Signal writes in effects are unconditionally legal in v21. `linkedSignal` is stable/`@publicApi 20.0`. NG0602: no `effect()` inside `computed()`. |

### (c) Files already READ and what was concluded

| File | Read | Conclusion |
|---|---|---|
| `emulador/eslint.config.js` | **full (51 lines)** | Only `directive-selector`/`component-selector` rules + spec overrides. **No import-boundary rule, no OnPush rule.** This is why I1/I2/I6 are unenforced. |
| `emulador/src/app/app.config.ts` | **full** | 11 feature reducers, 11 effect classes. **No `provideZonelessChangeDetection()`** → zone-based CD. |
| `app.ts` | **full** | Root component, no OnPush, 1 `takeUntilDestroyed` subscribe writing `data-theme` to `<html>`, 1 `@HostListener('document:mousedown')`. Small; fine. |
| `state/selectors.ts` | **full (853)** | Coherent, well-documented, 43 selectors. NOT a junk drawer → TD-12. Holds `formatCountdown:530`, Spanish marker text `:326/:337`, `floatingPnl:746` (dup of fill-engine), `snapToCandle:293` (stale doc claim). `selectTradeChartView:427` self-declares as possibly dead. |
| `components/chart/chart-model-mapper.service.ts` | **full (887)** | **The I5 mechanism, and it works.** 7 per-instance memo slots + 2 combinators + `gated()`. Duplicates countdown (`:60`) and custom-series generation (`:464`). Two overlapping streams `chartView$:347` / `panelChartView$:780`. Couples to NgRx `.projector` internals `:523,:556`. |
| `components/chart/chart.component.ts` | **~700 of 1694** (imports, template, class fields to `:520`, DOM handlers `:552-624`, `ngAfterViewInit:625-712`) + full method inventory via grep | 46 methods, ~9 responsibilities (TD-5), 24 private render-state fields (TD-6), 25 direct lightweight-charts calls (I1 violation), 5 hand-registered listeners, 9 manual `NgZone.run()`, no OnPush. **NOT read: `:720-1694`** (the render/drag/drawing method bodies). |
| `pages/sesiones/sesiones-page.component.ts` | **~500 of 1294** (`:215-380` state + computeds, `:460-560` constructor/reload, `:574-600` sparkPoints, `:900-1030` archive/remove) + full method inventory | 10 deps, 50 methods, 3 data sources, dual write paths → TD-2. **NOT read: `:600-900` (import/download/restore/open), `:1030-1294` (export, folders, drag-and-drop).** |
| `components/workspace/chart-panel.component.ts` | **`:350-520` of 581** | 3 `effect()` bridges `:471-475` → TD-7. Otherwise a clean presentational panel: `selectSignal` + `computed` + dispatch. `toSignal(mapper.panelChartView$)` at `:376`. |
| `components/workspace/workspace-viewport.component.ts` | **`:380-543` of 543** | `activeTabTemplate:401` is a plain arrow property (not `computed`) → TD-9. `closeTab:441` does 2 dispatches for 1 gesture → TD-3. `crypto.randomUUID()` in the component (deliberate, keeps reducer pure). |
| `domain/chart/chart-engine.ts` | **`:180-261` + API grep** | 261 lines, 12 public members. `chartApi`/`seriesApi` getters `:25,:28` are the I1 leak. `paneRect:246` carries an in-code I2 defence. |
| `domain/chart/chart-event-bus.ts` | **full (38)** | Minimal typed pub/sub. Keep. |
| `domain/chart/capability.ts` | **full (34)** | Sound plugin interface, Spanish docs. 1 commit ever. |
| `state/workspaces/workspaces.effects.ts` | **~full (456)** | `switch$`/`doSwitch:290-448` = ordered `Action[]` orchestration script with 9 `then*` fields → TD-3. `persistMeta$:198` non-transactional RMW → TD-1. `init$:167` uses `switchMap`+`mergeMap` (correct). |
| `state/sync/session-sync.effects.ts` | **full (105)** | 3 effects, all `dispatch:false`, all `catchError → EMPTY` → TD-10. `flushOnEdit$:66` debounce 2000. |
| `state/trading/trading.effects.ts` | **`:20-110`** | `processFills$:21` and `endOnSchedule$:66` both `ofType(goToTime)`; declaration order is load-bearing → **TD-3, the single sharpest finding**. **NOT read past `:110`.** |
| `state/replay/replay.effects.ts` | **`:50-180`** | `autoplay$:155` double `switchMap` (correct). `foldForwardFills:170` emits an unbounded synchronous `Action[]` per jump. `mergeMap` used to flatten arrays. |
| `state/layout/layout.effects.ts` | **full (47)** | `syncTimeframeOnFocus$` → TD-4. |
| `state/settings/settings.effects.ts` | **full (20)** | One `tap`-persist to localStorage. Fine. |
| `state/layout/layout.reducer.ts` | **`:245-300`** | The reverse half of the TF mirror `:255-280` → TD-4. |
| `state/drawings/drawings.reducer.ts` | **`:1-120` of 541** | Excellent: normalized `entities`+`ownerIndex`+`selection`+`revisions`+`history`+`clipboard`, uniformly immutable, identity-returns. `activeTool`/`clipboard` are UI-only state in the global store (minor). **NOT read: `:120-541`.** |
| `state/market/market.reducer.ts` | **`:1-50`** | `MarketState` = series/files/activeTf/selectedTfs/customTf/customSeries/resolutionSeries/resolutionFor. Two generated-series caches live in the store. |
| `state/workspaces/workspaces.models.ts` | **`:1-60`** | `Workspace` mixes market data (`series`, `files`) with workspace data (`trading`, `sessions`, `layout`, `panels`, `linkGroups`) in ONE IndexedDB record — **this is the I3 lead to pursue.** `WorkspaceMeta = Omit<Workspace,'series'>`. |
| `state/telemetry/telemetry.effects.ts` | **header `:1-60` + structure grep** | All effects `dispatch:false` (documented N-2 passivity). Holds mutable `pendingJumpOrigin:195`, `orderClock:205`. `syncJumpOrigin$:222` subscribes `actions$` with **no `ofType`** (every action in the app). **NOT read line-by-line.** |
| `services/session-sync.service.ts` | **method list + `pullAndMerge:388-460` + `pullAndMergeSessions:462-535` + `markActiveDirty:540`** | 23 methods across 4 entities. `:513-521` blanks `meta.trading` → TD-1. **NOT read: playbook/lessons push-pull, `flushDirtySessions:326`.** |
| `services/workspace-db.service.ts` | **`:144-160` + store-name grep** | `putMeta` is a bare `put`, no concurrency control. 7 object stores: META, SERIES, FOLDERS, DATASETS, CANDLES, SYNC, (LEGACY). |
| `services/journal-data.service.ts` | `:168-182` only | `.sort()` on a fresh `.map()` result — clean. |
| `state/lessons/lessons.selectors.ts` | **full (~30)** | Exemplary D8-compliant one-map pattern. |
| `state/playbook/playbook-hotkeys.directive.ts` | **full (40)** | → TD-8. |
| `components/ui/dialog.service.ts` | `:40-66` | Imperative `createComponent` + promise-wrapped `result` subscribe, self-unsubscribing. Fine. |
| `domain/reflection/build-scene-spec.ts`, `domain/reflection/waypoints.ts`, `state/journal/journal-read.models.ts` | targeted line ranges | All checked for mutation; **all clean** (sort-after-filter). |

### (d) Dead ends — see the DEAD ENDS section above (11 items). Do not re-investigate any of them.

### (e) ORDERED remaining steps

1. **Close I3 (highest-value unknown).** Read `state/workspaces/workspaces.models.ts` in full and `services/session-sync.mapping.ts` (354 lines, especially `toPayload`). Question to answer with evidence: does the wire/DB DTO leak Market-Data fields (`series`, `files`, `selectedTfs`, `activeTf`) into User-Workspace payloads? The `Workspace` interface already mixes both. Verdict currently PARTIAL/UNVERIFIED.
2. **Read `state/trading/reducer.ts` (470) and the rest of `drawings.reducer.ts` (`:120-541`).** Judge "reducers doing too much" — specifically whether `trading.reducer` embeds fill-engine domain logic that belongs in `fill-engine.ts`, and whether the drawings undo/redo history is a second reducer wearing the same hat.
3. **Read `state/telemetry/telemetry.effects.ts` in full (521).** Specifically `syncJumpOrigin$:222` (subscribes every action in the app — quantify the cost) and the two mutable anchor fields. Decide whether the effect-local mutable state is a legitimate documented exception or a 4th source of truth.
4. **Resolve the 3 UNVERIFIED state-ownership rows** — settings (store + localStorage), market-data cache (`marketFeature.series` + IndexedDB SERIES_STORE + CANDLES_STORE + the R2 layer), telemetry (own IndexedDB).
5. **Finish the component sweep.** Read `custom-color-picker.component.ts` (417), `ui/date-picker.component.ts` (347), `ui/dropdown.component.ts` (324) — the brief asks specifically for their responsibility count and whether the size is coherent or a mixture. Then sweep for `new EventEmitter` vs `output()` (`grep -rn "EventEmitter\|@Output"`) and for `document.`/`window.` direct DOM use outside `chart.component.ts`.
6. **Audit `lotaje/`** (7 files / 2488 LOC) — completely unexamined and it imports `domain/chart` (`lotaje/companion-window.ts`, `lotaje/lotaje-view.ts` both appeared in the `domain/chart` importer list). It is a second window/chart stack; determine whether it duplicates the mapper/engine wiring.
7. **Judge `ChartSyncBus`/`ChartSyncRouter`** (49 + 133 lines) and finish the `SessionSyncService` god-service verdict for TD-14.
8. **Re-rank the three highest-leverage recommendations** once the above lands, and write the ≤140-line digest.
