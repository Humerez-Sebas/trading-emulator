# SDD Run Ledger — RFC-017 Compositional Panel Sync & Layer Composition

- **RFC (spec):** `docs/architecture/rfcs/017-compositional-panel-sync.md` (D17.A–L)
- **Technical spec:** `docs/superpowers/specs/2026-07-16-rfc-017-compositional-panel-sync-design.md`
  (§4 pipeline diagram = rendering contract).
- **Plan:** `docs/superpowers/plans/2026-07-16-rfc-017-implementation-plan.md` (9 tasks)
- **Branch:** `feature/rfc-017-compositional-panel-sync` @ base `af3d8ca` (origin/develop,
  post TEDS-consolidation PR #43). Freshly re-cut 2026-07-24; the prior run's stale base
  (`64f19b3`) is preserved as local branch `feature/rfc-017-stale-backup-64f19b3`.
- **SCOPE CHANGE (TEDS supersession):** Tasks **7 and 8 are OUT OF SCOPE** — the
  trade-visualization layer (Ghost Rails geometry, corner Position HUD) was superseded by
  the TEDS grammar (`TEDS_GRAMMAR.md` §10) and re-planned into the separate
  `docs/superpowers/specs/2026-07-TEDS-implementation-plan.md`. **This run = Tasks 1–6 + 9.**
- **Run mode (decision-frameworks §8): TIERED** — per-task `branch-auditor` review on the
  high-risk tasks (Task 3 store restructure/cutover; Task 6 persistence/migration),
  batched (no per-task audit) on the additive tasks (2, 4, 5), ONE final whole-branch
  audit gating the PR. Implementer = `sdd-implementer`.
- **Baseline evidence (fresh, 2026-07-24, on this branch):** tsc app ✓, tsc spec ✓,
  `ng test` **1798/1798 green (148 files)**, lint 0 problems.
- **Baseline RE-VERIFIED by the orchestrator at run resume** (2026-07-24, HEAD `17c378c`,
  clean tree): all four gates run raw in one chained command, **exit 0** — tsc app ✓,
  tsc spec ✓, lint 0 problems, `ng test` **148 files / 1798 tests passed**. This is the
  arithmetic origin for every task's test-count progression below.
- **New standing rules (2026-07-22 tooling, PR #43):** consult the `context7` MCP before
  writing Angular 21 code; never mask gate exit codes with `| tail`/`| head`.
- **Run decisions:**
  - **STOP exception class (declared in plan Global Constraints):** pre-existing specs
    asserting the superseded V2 drawings shape/API (flat `items[]` slice,
    `restoreDrawingsForSymbol`, global `selectedId`, per-symbol `DrawingCollection`
    internals) MAY be adapted preserving intent; every edit is enumerated per task below.
    All other pre-existing specs remain untouchable (STOP/BLOCKED).
  - **Task 1 carried over:** implemented in the prior (stale-based) run and preserved by
    cherry-pick onto the fresh develop base — re-verified green here (commits
    `b8493d7`, `e0b2b48`, `213f6b5`, `257fdea`). The run RESUMES at Task 2.

## Tasks

- [x] Task 1: LinkGroup composition channels (`syncDrawings`, `syncTrades`) — cherry-picked, re-verified 2026-07-24
- [x] Task 2: Drawing schema expansion + target resolution + pure migration functions — DONE 2026-07-24
- [x] Task 3: Entity store + owner index + per-panel selection + mapper composition + chart cutover ⟨per-task audit⟩ — implemented 2026-07-24, audit pending
- [x] Task 4: Panel-scoped undo/redo with revision guard (D17.F) — DONE 2026-07-24
- [x] Task 5: Clipboard (D17.G) + per-panel shared-layer toggle (D17.H) — DONE 2026-07-24
- [x] Task 6: SessionPayloadV3 + migration chain + IndexedDB lift (D17.J) ⟨per-task audit⟩ — implemented 2026-07-24, audit pending
- [ ] ~~Task 7: Trade layer gating + Ghost Rails primitives~~ — SUPERSEDED by TEDS (out of scope)
- [ ] ~~Task 8: Position HUD chip + Design System token registration~~ — SUPERSEDED by TEDS (out of scope)
- [ ] Task 9: Finalization — invariant greps, build, docs closure

## Task entries

### Task 1 — LinkGroup composition channels (`syncDrawings`, `syncTrades`) — DONE (carried over)
- Adds `syncDrawings` / `syncTrades` composition-channel flags to LinkGroup (defaults per
  RFC-017 §5). Implemented in the prior run; cherry-picked onto base `af3d8ca` with zero
  conflicts and re-verified: tsc ✓, `ng test` 1798/1798, lint 0. New tests:
  `state/link-groups/link-groups.channels.spec.ts`,
  `components/workspace/link-groups-menu.component.channels.spec.ts` + widened LinkGroup fixtures.

### Task 2 — Drawing schema expansion + target resolution + pure migration — DONE

- **Commits:** `4112b1f` (models + pure modules), `f66c52b` (new specs), `ed9a7cb`
  (chart construction site + mapper `descriptor()`), `5420613` (STOP-exception fixture
  widening). Range `ddf7537..5420613`.
- **Evidence (implementer, raw, exit 0 on all four):** tsc app ✓, tsc spec ✓, lint 0
  problems, `ng test` **150 files / 1809 tests passed**.
- **Test-count arithmetic (orchestrator-verified):** 1798 → 1809 = **+11**, matching
  6 `it()` in `drawing-ownership.spec.ts` + 5 in `drawings-migration.spec.ts`;
  files 148 → 150 = the two new spec files. Consistent.
- **Scope actually touched (orchestrator diff-scan, `git diff --stat ddf7537..HEAD`):**
  15 files, +357/−8. In-scope app code: `drawings.models.ts` (+11),
  `drawing-ownership.ts` (new, 27), `drawings-migration.ts` (new, 60),
  `chart-model-mapper.service.ts` (+8), `chart.component.ts` (+24/−8). New specs:
  `drawing-ownership.spec.ts` (55), `drawings-migration.spec.ts` (96). No out-of-scope
  file touched; `package.json`/`package-lock.json` untouched; `domain/chart/render-model.ts`
  zero-diff (the DTO stayed `{id,kind,p1,p2}` as required).
- **STOP-exception spec edits (8 files, all enumerated, all verified additive by the
  orchestrator — no assertion deleted, weakened, or repurposed; every edit only adds the
  five now-required `Drawing` fields to an existing fixture):**
  1. `services/session-migration.spec.ts` — `drawing()` factory (+5)
  2. `services/session-sync.mapping.spec.ts` — `activeDrawings()` fixture (+5)
  3. `state/drawings/drawings.reducer.spec.ts` — `drawing()` factory + the
     `restoreDrawingsForSymbol` inline fixture (+10)
  4. `state/telemetry/telemetry-drawings.spec.ts` — `rect()` factory + two inline
     fixtures (+22/−1)
  5. `state/telemetry/telemetry.trading.jump-50-profile.spec.ts` — the 8-drawing
     generated array (+5)
  6. `state/telemetry/telemetry.trading.spec.ts` — three inline fixtures (+15)
  7. `state/workspaces/session-persistence.e2e.spec.ts` — two inline fixtures (+10)
  8. `state/workspaces/workspaces.effects.spec.ts` — one inline fixture (+12/−1)
- **Deviations:** one, classified **inert** — at the `chart.component.ts` construction
  site the draft-clearing assignments (`draftP1`/`draft` → null) were moved ABOVE the
  defensive `descriptor == null` early return, so the no-descriptor path also clears the
  in-progress draft instead of leaving it stuck on screen. Strictly better behavior on a
  path that cannot occur in a configured panel; no dispatch and no owner fabricated,
  exactly as the brief required.
- **FINAL-AUDIT ATTENTION:**
  - `chart.component.ts` `handleClick` is the one place every new `Drawing` field is
    populated at once, and this repo has **no `chart.component.spec.ts`** — the
    construction site is covered only indirectly. Pre-existing coverage gap, not
    introduced here, but it is the highest-risk unverified line of this task.
  - `chart-model-mapper.service.ts` uses a `toSignal(...)` field initializer for the new
    `descriptor` signal (implementer verified the API against the `context7` Angular
    docs). Worth an eyeball for injection-context correctness at final audit.
  - Legacy persisted records (IndexedDB `Workspace.drawings`, `SessionPayloadV2`
    collections) now claim the new required fields at the type level while lacking them
    at runtime. This is the **planned, deliberate gap** closed by Task 6's read-time
    lift — flagged so the auditor does not read it as an escape.

### Task 3 — Entity store + ownerIndex + per-panel selection + composition + cutover — IMPLEMENTED (audit pending)

- **Commits:** `ee95bfb` (store restructure), `9e1bdc7` (mapper composition), `6633e28`
  (chart + toolbar cutover), `887629f` (persistence bridge), `04d92f2` (`selectItems`
  consumer migration), `5bdd809` (STOP-exception spec adaptations).
  Range `d4d054c..5bdd809`.
- **Evidence (implementer, raw, exit 0 on all four):** tsc app ✓, tsc spec ✓, lint 0,
  `ng test` **152 files / 1843 tests passed**.
- **Test-count arithmetic (orchestrator-verified):** 1809 → 1843 = **+34**; files
  150 → 152 = `drawings.reducer.entity.spec.ts` (306 lines) +
  `chart-model-mapper.composition.spec.ts` (235 lines). Consistent.
- **Scope actually touched (orchestrator diff-scan):** 24 files, +1004/−206. This is the
  largest diff of the run.
- **Deviations — inert (5, per report):** `pickTool` no longer clears a selection (the
  action carries no `panelId` and selection is per-panel now); `restoreDrawings` resets
  `activeTool` where `clearDrawings` did not (pre-authorized in the brief);
  `groupDrawingsBySymbol` takes a flat array (pre-authorized interface refinement);
  `pushDrawings()` gained a small O(k) per-call DTO `.map()` (outside the §4.1
  zero-allocation contract, which binds the mapper memo only); the cloud-restore flatten
  in `sesiones-page.component.ts` dropped a now-unreachable `?? meta.drawings` fallback.
- **Deviations — REQUIRES ATTENTION (3, all forwarded to the per-task audit):**
  1. **Scope expanded past the brief's file list**, forced by retiring
     `drawingsFeature.selectItems`/`selectSelectedId` (a hard compile-time dependency):
     `components/session-summary/session-summary.component.ts` and
     `state/telemetry/telemetry.effects.ts` (+ 5 specs) now read the new
     `selectAllDrawings`. **Both are behavior widenings** — the `.session.json` export and
     the RFC-014 `DrawingSnapshot` telemetry fact now cover the WHOLE session's drawings
     (every panel/symbol) instead of the previously-current symbol's slice. The
     implementer did not review this against RFC-014's own telemetry invariants.
  2. `state/workspaces/session-persistence.e2e.spec.ts` adapted (it drove the retired
     `restoreDrawingsForSymbol` directly) — inside the declared STOP-exception class by
     content, but not named in the brief's file inventory.
  3. Composition memo keys on the WHOLE `selection` record reference (as the technical
     spec §4.1 specifies), so any panel's `selectDrawing` invalidates every other panel's
     memo. Inherent to the specified 5-reference tuple; narrowing it would need a
     per-panel-parameterized store derivation, which D8 forbids.
- **STOP-exception specs adapted (report §"Pre-existing specs adapted"):**
  `drawings.reducer.spec.ts` (the big one — every describe ported to the entity API;
  the `restoreDrawingsForSymbol` block **removed with no replacement**, the action being
  fully retired with zero app call sites; the `clearDrawings` block re-expressed through
  `restoreDrawings({drawings: []})`), `session-persistence.e2e.spec.ts`,
  `session-summary.component.spec.ts`, and four `state/telemetry/*.spec.ts` fixture
  re-pointings. `drawings-migration.spec.ts` gained 3 new `groupDrawingsBySymbol` cases
  (pure addition, not an adaptation).
- **FINAL-AUDIT ATTENTION:** largest diff of the branch; the telemetry/export widening
  above; the reducer's `ownerIndex` incremental maintenance and the mapper's
  reference-stability memo are the two correctness cores.

### Task 3 — PER-TASK AUDIT #1: **FAIL** (1 High, 3 Medium, 4 Low) — 2026-07-24

`branch-auditor` (Opus) re-ran all four gates personally and confirmed them green
(152 files / 1843 tests, lint 0) and **independently verified the ledger arithmetic**
(counted `it()` deltas per file: +22 entity spec, +11 composition spec, +3 migration spec,
−2 reducer spec = **+34**, 1809 → 1843 ✓). It also verified as CORRECT: the zero-allocation
memo (returns the previous array by reference; the spec asserts `toBe` identity), the §4
diagram stage order, `entities`/`ownerIndex` agreement on every path, genuine
identity-return rejections, ownership immutability, D8 compliance, and every
STOP-exception spec adaptation (intent preserved, no assertion weakened).

Findings requiring fixes:
- **H1** — `chart-model-mapper.service.ts` filtered `d.symbol === descriptor.symbol`, but
  `PanelDescriptor.symbol` uses `''` as a live sentinel meaning "the active asset"
  (`layout.models.ts:23`). Every hot-added panel/tab AND the cold-start `panel-1` carry
  `''`, there is no `setPanelSymbol` action, and nothing resolved it — so those panels
  composed ZERO drawings and **the shared group layer never rendered**. Orchestrator
  independently confirmed the sentinel before acting.
- **M1** — nothing invalidated `selection[panelId]` when composition stopped including the
  selected drawing, so the toolbar trash stayed enabled over an invisible selection and
  permanently deleted it (no undo until Task 4).
- **M2** — closing a panel orphaned its drawings forever (UUID panel ids ⇒ the owner key
  is unreclaimable); they stayed in every payload, unrenderable and undeletable.
- **M3** — the RFC-014 G3 `DrawingSnapshot` fact captured the whole session's drawings
  while the trading panel now paints a composed subset, so reflection scenes would show
  analysis the trader never had on screen.
- **L1** — decision/RFC ids in new code comments (branch convention, cf. `257fdea`).
- Ruled **no-fix** by the auditor with written reasons: `pickTool` no longer clearing a
  selection (no interaction hazard; a global clear is worse under per-panel semantics);
  the memo keying on the whole `selection` record (accepted by technical spec §4.1 —
  `selectDrawing` fires per click, never per frame, so the 16 ms budget is untouched, and
  narrowing it would need a D8-banned parameterized derivation); the report's off-by-one
  test-count breakdown (net +34 is correct).

**OWNER DECISION (escalated and answered during the run):** closing a panel
**cascade-deletes that panel's own drawings, disclosed in the UI** — mirroring D17.L.
Group-owned drawings survive; the Spanish copy reads "…y sus dibujos locales", where
"locales" is load-bearing. Auto-reassignment stays banned (Invariant 1). This is a new
product decision RFC-017 never made — **Task 9 must record it in the RFC's deviations
section.**

### Task 3 — FIX WAVE (all audit findings) — DONE

- **Commits:** `afd3c7b` (H1 sentinel resolution), `396398e` (M1 selection invalidation +
  M2 reducer cascade + L1), `a8db521` (M2 tab-close wiring + UI disclosure),
  `1ea48a1` (M3 telemetry scoping). Range `c542d9b..1ea48a1`.
- **Evidence (implementer, raw, exit 0 on all four):** tsc app ✓, tsc spec ✓, lint 0,
  `ng test` **152 files / 1861 tests passed**.
- **Test-count arithmetic (orchestrator-verified):** 1843 → 1861 = **+18**; file count
  unchanged at 152 because every new case extended an existing spec file. Consistent.
- **Scope (orchestrator diff-scan):** 14 files, +479/−29 — every file traceable to a
  named finding.
- **Fixes as landed:** `effectivePanelSymbol()` in `layout.models.ts` + `selectCurrentAsset`
  added as a 6th memo reference in the composition (H1); reducer handlers on
  `setSyncDrawings(false)` / `setPanelLinkGroup` clearing stale group-owned selections
  (M1); `purgePanelDrawings({panelIds})` + `on(LayoutActions.removePanel)` sharing one
  purge helper, with `closeTab()` dispatching the purge for its tab's panels (M2);
  a parameterless active-asset+visible selector feeding both telemetry capture sites (M3).
- **Disclosed deviations:** the tab-close path is **two dispatches in one gesture**, not
  one atomic action, because the tab→panels mapping lives only in the layout slice (the
  single-panel `removePanel` path IS atomic). `drawings.reducer.ts` carries three
  unrelated fixes across two commits at file granularity — read `396398e`'s full diff
  rather than assuming a 1:1 message-to-hunk mapping. L1's second cited "I-14" location
  never existed (only one citation was in the file) — inert.
- **FINAL-AUDIT ATTENTION:** H1's `chart.component.ts` stamping half has no dedicated
  spec (this repo has no `chart.component.spec.ts` at all — pre-existing gap); the M3
  spec adaptations lean on a specific NgRx `MockStore` `overrideSelector` behavior for
  nested-selector resolution (implementer verified it against `node_modules` source).

### Task 3 — PER-TASK AUDIT #2: **FAIL** (1 Medium, 4 Low) — 2026-07-24

`branch-auditor` (Opus) re-ran all four gates **plus `npm run build`** personally: tsc app
✓, tsc spec ✓, lint 0, `ng test` **152 files / 1861 tests**, build exit 0 with
`Initial total 642.43 kB` — **no new chunk types**, and `grep -rl vitest dist/…` empty
(the vitest-sentinel check is clean). It re-derived the arithmetic for BOTH ranges
independently (fix wave +18 with 0 removed and no new files → 1861; Task 3 itself
44 added − 10 removed = +34 → 1843) and re-ran every invariant grep.

**Every audit-#1 finding confirmed genuinely closed**, each by adversarial reading rather
than by trusting the report:
- **H1 CLOSED** — the auditor swept every `descriptor.symbol` read repo-wide; the only
  other one (`PanelChartView.symbol`) has zero consumers. The zero-allocation contract
  still holds at six references: `Store.select` carries `distinctUntilChanged` and
  `selectCurrentAsset` only changes at boot or on `workspaceRestored`, so `combineLatest`
  does not re-fire per replay tick.
- **M1 CLOSED** — it enumerated every path that can drop a drawing out of a panel's
  composition and confirmed each is handled or unreachable (`setDrawingVisible` has zero
  dispatch sites; there is no `setPanelSymbol`; `workspaceRestored` resets `selection`).
- **M2 CLOSED on state** — `purgePanelIds` provably touches only `panel:` owner keys;
  group-owned drawings survive; the tab path's panel ids match exactly what the layout
  reducer removes, parked cells included. **The tab path's non-atomicity was RULED
  ACCEPTABLE**: both dispatches are synchronous in one call stack, and the only observer
  (`persistMeta$`) is `debounceTime(300)`, collapsing the pair into one write.
- **M3 CLOSED** — the auditor verified the spec is genuinely sensitive rather than a mock
  artifact: with 3 fixtures it fails under every wrong implementation (old selector → 3,
  symbol-only → 2, visible-only → 2, non-flowing override → 0), and `resetSelectors()` in
  `afterEach` prevents `isolate:false` leakage.
- **L1 CLOSED** — the one remaining citation is pre-existing code merely re-indented.
- It also read `396398e` in full and confirmed no unmentioned fourth change was hiding at
  file granularity.

New findings:
- **M-1 (Medium)** — the panel/tab close cascade was disclosed **only via `aria-label`**,
  which renders nothing for a sighted user, so a trader could lose drawings with no
  warning they could see (and no undo until Task 4). The repo's own precedent added by
  this same task (`link-groups-menu.component.ts:75-76`) sets BOTH `aria-label` and
  `title`; the mirror was half-built, and the two specs asserted only `aria-label`,
  locking in the incomplete version.
- **L-1 (Low, not ruled no-fix)** — `closeTab()` dispatched the irreversible purge BEFORE
  `LayoutActions.closeTab`, which the layout reducer no-ops on the last tab; only a
  template guard ~350 lines away made it unreachable.
- Ruled **no-fix** with written reasons: **L-2** — active-asset scoping still is not
  literally "what was on screen" for RFC-014 G3 (a drawing in an inactive tab or behind a
  cell sibling counts; a secondary-symbol panel's drawings do not), but it restores exact
  pre-RFC-017 semantics and strictly narrows audit #1's over-capture, so it is a repair,
  not a regression — **exact composed-panel fidelity is a new RFC-017/RFC-014 design
  question, and the selector's doc comment overclaims and should be softened → Task 9**.
  **L-3** — an unreachable defensive branch in `purgePanelIds` is untested (revisit if
  Task 4/5 make cross-panel selection of a local drawing possible). **L-4** — a stale
  "five composition inputs" comment in the composition spec → Task 9 docs sweep.
- **Doc drift noted for Task 9:** `CLAUDE.md` cites the accepted bundle overage as
  "~609 kB"; the real figure is now **642.43 kB**.

### Task 3 — RE-AUDIT FIX WAVE — DONE, closure orchestrator-verified

- **Commit:** `4cb80f8` (2 files, +31/−2). Range `1ea48a1..4cb80f8`.
- **Evidence (implementer, raw, exit 0 on all four):** tsc app ✓, tsc spec ✓, lint 0,
  `ng test` **152 files / 1862 tests passed** (1861 → 1862 = +1, a new last-tab guard
  spec; the two M-1 specs were widened in place, adding assertions without adding cases).
- **Orchestrator verification (mechanical diff-read against the auditor's own acceptance
  criteria, both findings being attribute-presence/statement-order facts):**
  M-1 — `[attr.title]` now present on BOTH close controls, carrying strings identical to
  their `aria-label`s (`'Cerrar ' + tab.name + ' y sus dibujos locales'` and
  `'Cerrar ' + panelLabel(pid) + ' y sus dibujos locales'`); no `TooltipDirective`
  introduced, matching the precedent. **CLOSED.**
  L-1 — `if (this.workspace().tabs.length <= 1) return;` now sits immediately after
  `event.stopPropagation()`, ahead of the purge dispatch; both dispatches remain in one
  synchronous call stack. Implementer used `<= 1` rather than `=== 1` deliberately
  (fail-safe, stricter than the reducer). **CLOSED.**
- **Decision (recorded, not improvised):** a third full `branch-auditor` dispatch was NOT
  spent on a two-attribute/one-statement change. Both findings are mechanically
  verifiable facts, verified above, and **the mandatory final whole-branch Opus audit
  re-reviews this diff along with everything else.** Task 3 is treated as PASSED for the
  purpose of proceeding to Task 4; the final audit remains the true gate.

### Task 4 — Panel-scoped undo/redo with revision guard (D17.F) — DONE

- **Commits:** `f76efee` (models + actions + reducer), `71bb34a` (focused-panel keyboard
  gating), `328d7fd` (edge-rulings specs). Range `d72a970..328d7fd`.
- **Evidence (implementer, raw, exit 0 on all four):** tsc app ✓, tsc spec ✓, lint 0,
  `ng test` **153 files / 1882 tests passed**.
- **Test-count arithmetic (orchestrator-verified):** 1862 → 1882 = **+20**, matching
  exactly 20 `it()` in the new `drawings.history.spec.ts`; files 152 → 153 = that one new
  file. Consistent.
- **Scope (orchestrator diff-scan):** 5 files, +634/−8 — exactly the brief's file list,
  nothing else. Additive task: **no pre-existing spec needed adapting**, as predicted.
- **Grep (orchestrator):** zero RFC/decision/task ids in NEW non-spec comments.
- **In-scope extension, deliberate and disclosed:** the brief also directed a fix to the
  pre-existing `Delete` key handler. `chart.component.ts`'s `onKeyDown` is a **window-level
  listener registered once per panel**, so with two panels each holding a selection of a
  *different* drawing (explicitly allowed by per-panel selection, D17.E) a single Delete
  keypress deleted in BOTH panels. Delete is now gated on `focusedPanelId` and guarded
  against input focus, the same idiom undo/redo establishes. Same defect class the idiom
  exists to prevent.
- **Deviation — requires attention (coverage, pre-existing):** the focused-panel keyboard
  specs (Ctrl+Z on an unfocused panel; the input-focus guard suppressing undo and Delete)
  were **not written**, using the brief's own escape hatch. There is no
  `chart.component.spec.ts` in this repo and no harness for one: every spec touching
  `ChartComponent` (`chart-panel.component.spec.ts`) replaces it with a template-only stub
  because the real component boots a live `ChartEngine`/lightweight-charts canvas in
  `ngAfterViewInit`. The sibling component using the identical input-focus-guard idiom
  (`drawing-toolbar.component.ts`) also has no spec — a pre-existing gap in this class of
  components, not one introduced here. The dispatched actions are fully covered by the 20
  reducer specs; only the DOM-event→dispatch wiring is unverified, at the same coverage
  level the pre-existing `Delete` handler already had.
- **FINAL-AUDIT ATTENTION:** the undo/redo reducer mechanics are the correctness core —
  in particular the load-bearing difference between the **stale** path (command DROPPED,
  pop continues within the same action) and the **locked** path (command RETAINED, identity
  return, no further popping). Also worth a read: that undo restores `owner` verbatim from
  the recorded command rather than recomputing it, and that recreate/delete undos keep
  `entities` and `ownerIndex` in agreement. This is the third consecutive task whose
  keyboard wiring is unverified by automation — the accumulated `ChartComponent` coverage
  gap is worth a ruling at final audit.

### Task 5 — Clipboard (D17.G) + per-panel shared-layer toggle (D17.H) — DONE

- **Commits:** `995fdc8` (clipboard state), `e278857` (layout toggle + composition),
  `57a20d4` (keyboard + panel-header control). Range `0dd3ae8..57a20d4`.
- **Evidence (implementer, raw, exit 0 on all four):** tsc app ✓, tsc spec ✓, lint 0,
  `ng test` **155 files / 1905 tests passed**.
- **Test-count arithmetic (orchestrator-verified):** 1882 → 1905 = **+23** = 13 `it()` in
  the new `drawings.clipboard.spec.ts` + 7 in the new `layout.hide-shared.spec.ts` + 3
  added to the existing composition spec; files 153 → 155 = the two new files. Consistent.
- **Scope (orchestrator diff-scan):** 12 files, +652/−25 — exactly the brief's file list.
  **No pre-existing spec touched**, as an additive task should manage.
- **Grep (orchestrator):** zero RFC/decision/task ids in NEW non-spec comments.
- **Orchestrator spot-check of the two risky hunks:** the composition change is a
  one-condition guard (`!descriptor.hideSharedDrawings && …`) on the shared union only —
  entities untouched, other panels unaffected, and the descriptor was already one of the
  six memoized references so no seventh input was added. The `applyNewDrawing` extraction
  is verbatim-identical to the previous `addDrawing` body; `addDrawing` still resets
  `activeTool: 'none'` while paste deliberately does not (commented distinction).
- **Deviations — inert (3):** Ctrl+C/Ctrl+V wired into `chart.component.ts`'s existing
  keyboard surface rather than `chart-panel.component.ts` as the plan sketched (the brief
  mandated this — Task 4 made `chart.component` the single focused-panel-gated keyboard
  surface, and a second surface would reintroduce the multi-panel defect Task 4 fixed);
  `addDrawing`'s body extracted into a shared `applyNewDrawing` helper reused by paste, so
  the two creation paths cannot drift (behavior-preserving, pre-existing assertions
  unchanged); a defensive selected/clipboard-presence guard added on the Ctrl+C/Ctrl+V
  interception beyond the brief's literal text.
- **FINAL-AUDIT ATTENTION:** paste is the ONLY new drawing-creating path and it routes
  through `resolveDrawingTarget` — the same rule as hand-drawing — so RFC Invariant 1
  (zero *implicit* copying) holds by construction; worth confirming no other path clones.
  Also worth reading: `applyNewDrawing` sits on Task 4's audited history path, and the
  clipboard is runtime-only (reset by both hydration paths, never persisted or synced).

### Task 6 — `SessionPayloadV3` + V2→V3 migration + IndexedDB lift (D17.J) — IMPLEMENTED (audit pending)

- **Commits:** `076e73c` (V3 wire shape + `migrateV2ToV3`), `dfbf56d` (toPayload/fromPayload
  cutover + V2 bridge deletion), `a7e9983` (IndexedDB read-time lift + reducer guard),
  `0fd060d` (new specs), `4ef196b` (STOP-exception adaptations).
  Range `133c09e..4ef196b`.
- **Evidence (implementer, raw, exit 0 on all four):** tsc app ✓, tsc spec ✓, lint 0,
  `ng test` **156 files / 1921 tests passed**.
- **Test-count arithmetic (orchestrator-verified):** counted `it()` in the range —
  **+24 added, −8 removed = net +16**; 1905 → 1921 ✓. Files 155 → 156 = the single new
  `session-migration.v3.spec.ts`. The 8 removals are the deleted `groupDrawingsBySymbol`
  bridge tests plus superseded V2-shape cases. Consistent.
- **Scope (orchestrator diff-scan):** 19 files, +707/−174. All in the brief's declared
  scope or its STOP-exception class. One out-of-domain touch,
  `state/playbook/playbook-invariants.spec.ts`, is a **single-line fixture update**
  (`drawings: {}` → `drawings: { version: 2, items: [] }`) forced by the `PayloadInput`
  type change — verified minimal, no assertion touched.
- **Deviation — REQUIRES ATTENTION (process):** the implementer **self-disclosed that it
  wrote the production code BEFORE the new specs** (`session-migration.v3.spec.ts`, the
  reducer-guard test, the workspace-legacy-lift test), inverting the mandatory TDD order.
  The tests exist and were run fresh (the first full run surfaced exactly the 5 expected
  STOP-exception failures and nothing outside that class), but they were never watched red
  against a missing implementation. **This is the material risk of this task**: specs
  written after the code can encode what the code does rather than what the spec requires.
  Forwarded to the audit as its primary lead.
- **Deviations — inert (2, per report):** `migrateV2ToV3` always re-derives
  owner/zIndex/locked/visible rather than conditionally preserving an already-tagged item
  (harmless — no real V2 payload can carry one); `isSessionPayloadV3` adds a
  `layout`/`panels` shape check beyond the brief's literal spec (strictly more
  conservative).
- **Observation for the auditor to rule on (orchestrator grep, not pre-judged):** three
  NEW non-spec comments carry decision/RFC citations, which the plan's Global Constraints
  forbid and which branch commit `257fdea` and the Task 3 audit's L1 both enforced —
  `session-sync.mapping.ts` ("(D9)"), `session-sync.models.ts` ("V3 extends V2 in place
  (D9)"), `workspaces.effects.ts` ("RFC-011's persisted layout/panels"). Mitigating
  context: the models one deliberately parallels the adjacent pre-existing V2 doc comment,
  which uses the identical phrasing.
- **FINAL-AUDIT ATTENTION:** the two genuinely new logic blocks are `migrateV2ToV3` and
  `liftWorkspaceDrawings`/`withLiftedDrawings`; and the cloud-open assertion in
  `sesiones-page.component.spec.ts` was **rewritten rather than merely re-shaped** — its
  behavioral proof changed, so it needs its own read.

### Task 6 — PER-TASK AUDIT: **FAIL** (1 Medium, 6 Low) — 2026-07-24

`branch-auditor` (Opus) re-ran all four gates personally — tsc app ✓, tsc spec ✓, lint 0,
`ng test` **156 files / 1921 tests** — and re-derived the arithmetic independently
(+24 `it()` / −8 = net +16; the 8 removals = 3 deleted bridge tests + 5 retitle-in-place
cases, **no still-valid guarantee vanished**). Every invariant grep re-run and clean:
`groupDrawingsBySymbol` gone, `assertNoCandles` single definition still on the `toPayload`
write path (kernel #4 holds), `DB_VERSION = 6` unchanged with no new object store,
`package*.json` and `domain/` zero-diff, D8 intact, `session-migration.ts` pure.
**Runtime-only state provably cannot reach the wire** — `revisions`/`history`/`clipboard`
have zero occurrences in the selectors, workspace models, payload models or mapping.

**The TDD-inversion lead was largely discharged.** The auditor derived the fidelity table
from technical spec §7 *before* reading the spec file, and found
`session-migration.v3.spec.ts` genuinely adversarial rather than code-shaped: its
`legacyItem()` fixture deliberately builds each input as a FULL `Drawing` with
`symbol:'WRONG-SYMBOL'`, `owner:{id:'stale-owner'}`, `zIndex:999`, `locked:true`,
`visible:false`, so any copy-through implementation fails; EURUSD is shown only by the
SECOND panel, so "always first panel" fails; the zIndex case uses two buckets and asserts
`0,1,2`, so a per-symbol restart fails; the corrupt-layout case pins the
replace-layout-BEFORE-migrating ordering with a `ghost-panel` fixture. The predicted
post-hoc-spec risk materialized only as L3/L4, both test-side.

**M1 (Medium) — a legacy `.session.json` import silently discards every drawing.**
`restoreDrawings` has a **second dispatcher that bypasses the read-time lift**: the
`thenRestore` branch (`workspaces.effects.ts:281`), fed straight from the on-disk file via
`plan.drawings as Drawing[]` (`sesiones-page.component.ts:736`) — a raw cast of
`unknown[]`, never lifted. A `.session.json` exported before this branch carries legacy
`{id,kind,p1,p2}` items; `isWellFormedV1` accepts the file, then this task's new reducer
guard (`if (!d.owner) continue;`) skips **every** item, `entities` comes back `{}`, the UI
reports success ("Sesión importada…"), and the debounced `persistMeta$` writes the empty
snapshot over IndexedDB. **Attribution, on the record:** the inability to restore these
was introduced by Tasks 2–5 (at `133c09e` this path threw a `TypeError`); Task 6's guard
is what converted a loud failure into a silent one. It is a **regression against shipped
`develop`** and is not no-fixable — a production data path. Medium rather than High only
because the source file survives on disk. The coverage gap that let it through:
`workspaces.effects.spec.ts:428` exercises this path with `drawings: []`.

Low findings — **ruled no-fix with written reasons, do not re-litigate:** **L2** the
read-time lift can pair `ws.layout` with a fallback `panels` map (unreachable — every
writer writes both together); **L4** two adapted assertions in `session-migration.spec.ts`
became tautologies (`f(x) === f(x)`), but the concrete guarantee **moved** to the v3 spec
and coverage is net stronger; **L5** `parseSessionPayload` no longer applies the defensive
layout fallback to V3 (unreachable, damage is a degraded layout not data loss, and the
naive fix would orphan drawings whose `owner` points into the discarded layout — a real
defect traded for a hypothetical one); **L6** the cloud write path stamps
`schemaVersion: 3` on un-lifted legacy `meta.drawings`, but this is **strictly better than
the deleted bridge** (which baked a permanently wrong `symbol: 'undefined'`); the field is
merely absent and self-heals through the read-time lift, a path the auditor traced end to
end. Booked for the final audit: L5's and L6's durable fixes are design decisions.

Lows to fold into **Task 9's sweep:** **L1** — of the three flagged decision-id comments,
two are ruled no-fix (`session-sync.models.ts:100` deliberately mirrors the adjacent
pre-existing V2 doc comment; `session-sync.mapping.ts:208` is a rewrite that *stripped* a
task/RFC citation and kept only the decision id — a net reduction), but
`workspaces.effects.ts:47`'s "RFC-011" is a real violation carrying no load. **Also
recorded:** `task-6-report.md` asserts "Comments in new code contain no task/RFC/decision
IDs", which is **false** for all three sites — nothing was concealed (the orchestrator's
own grep caught it and this ledger recorded it before the audit), but a gating report must
not assert a constraint was met when a grep says otherwise. **L3** — the workspace-lift
fixture uses `singlePanelLayoutFor`, so `panel-migrated-1` is also what the *fallback*
produces: an implementation ignoring `ws.layout`/`ws.panels` entirely would pass
identically. Production code verified correct by line-by-line read; the fixture needs a
two-panel layout with a non-default panel id.

**Auditor's own verdict on the STOP-exception adaptations:** all seven preserve intent, and
the rewritten cloud-open assertion in `sesiones-page.component.spec.ts` is **stronger, not
weaker** — verified against the fixture that `p1` really is the first panel in layout order
showing `XAUUSD`, and the test now proves the migration end-to-end through the real
cloud-open path instead of asserting passthrough.

### Task 6 — AUDIT FIX WAVE — DONE, closure orchestrator-verified

- **Commit:** `74a25a2` (2 files, +184/−29). Range `7f5e0f7..74a25a2`.
- **Evidence (implementer, raw, exit 0 on all four):** tsc app ✓, tsc spec ✓, lint 0,
  `ng test` **156 files / 1922 tests passed** (1921 → 1922 = +1: the new `2r5` case; `2r4`
  was rewritten in place).
- **M1 fixed** by extracting `resolveOwnerLayout` + `liftLegacyDrawings` out of
  `liftWorkspaceDrawings` and lifting `thenRestore.drawings` before the `restoreDrawings`
  dispatch — one shared helper, so the two read paths cannot drift.
- **The implementer OVERRODE the fix brief on owner resolution, and was right to.** The
  brief said to resolve against the store's CURRENT layout; the implementer used the
  target workspace `ws`'s own persisted layout instead, reasoning that the current/`meta`
  layout is the outgoing asset's. **Orchestrator verified this against
  `layout.reducer.ts:279-289`:** `workspaceRestored` installs
  `ws.layout && ws.panels ? those : singlePanelLayoutFor(ws.symbol, ws.activeTf ?? 'M1')`,
  and `resolveOwnerLayout(symbol, ws?.activeTf, ws?.layout, ws?.panels)` returns **exactly
  that same pair** — so the owner resolves against the layout `workspaceRestored` actually
  installs, not an approximation. The brief's instruction would have resolved against the
  pre-switch layout and orphaned the drawings. Deviation classified **inert and superior**.
- **L3 fixed:** the workspace-lift fixture now uses a two-panel layout with non-default
  ids where the matching panel is not first, so it can no longer pass under an
  implementation that ignores `ws.layout`/`ws.panels`.
- **L1 fixed:** the "RFC-011" citation stripped from `workspaces.effects.ts`; the two
  no-fix sites left untouched as ruled. The implementer also corrected the false
  "no task/RFC/decision IDs" claim in its own Task 6 report.
- **Side effect worth noting:** `resolveOwnerLayout` is all-or-nothing by construction,
  which incidentally closes **L2** (the layout/panels pairing asymmetry the auditor ruled
  no-fix-because-unreachable) — the mixed pair is now unrepresentable.
- **Decision (recorded, not improvised):** as with Task 3's second fix wave, a further full
  `branch-auditor` dispatch was NOT spent here. The load-bearing logic was verified by the
  orchestrator directly against the reducer it must mirror, and **the mandatory final
  whole-branch Opus audit re-reviews this diff along with everything else.** Task 6 is
  treated as PASSED for the purpose of proceeding to Task 9; the final audit remains the
  true gate.

### RUN STATE

Tasks 1–6 complete and green at **156 files / 1922 tests**. Next: **Task 9**
(invariant greps, `npm run build`, docs closure) → final whole-branch audit → PR to
`develop`.

Task 9 docs/sweep backlog (accumulated, do not lose): RFC deviations section must record
**the owner's panel-close cascade decision** and the
**`selectActiveAssetVisibleDrawings` fidelity caveat** (its doc comment overclaims);
`CLAUDE.md`'s accepted bundle overage is stale ("~609 kB" → measured **642.43 kB**); sweep
the stale "five composition inputs" comment at
`chart-model-mapper.composition.spec.ts:261`; and the accumulated **`ChartComponent`
keyboard-wiring coverage gap** (three tasks' worth) needs a ruling at the final audit.

Task 9 carries a docs backlog accumulated by the audits, recorded here so it is not lost:
RFC deviations section must record **the owner's panel-close cascade decision** and the
**`selectActiveAssetVisibleDrawings` fidelity caveat** (its doc comment overclaims and
should be softened); sweep the stale "five composition inputs" comment at
`chart-model-mapper.composition.spec.ts:261`; and `CLAUDE.md`'s accepted bundle overage is
stale — it says "~609 kB", the measured figure is now **642.43 kB**.

(further entries recorded as tasks complete)
