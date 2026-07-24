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

(further entries recorded as tasks complete)
