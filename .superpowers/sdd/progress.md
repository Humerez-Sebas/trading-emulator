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
- [ ] Task 4: Panel-scoped undo/redo with revision guard (D17.F)
- [ ] Task 5: Clipboard (D17.G) + per-panel shared-layer toggle (D17.H)
- [ ] Task 6: SessionPayloadV3 + migration chain + IndexedDB lift (D17.J) ⟨per-task audit⟩
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

### RUN STATE

Tasks 1, 2, 3 (+ two fix waves) complete and green at **152 files / 1862 tests**.
Next: Task 4 → Task 5 → Task 6 ⟨per-task audit⟩ → Task 9 → final whole-branch audit → PR
to `develop`.

(further entries recorded as tasks complete)
