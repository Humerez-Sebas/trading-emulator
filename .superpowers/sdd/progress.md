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
- [ ] Task 2: Drawing schema expansion + target resolution + pure migration functions
- [ ] Task 3: Entity store + owner index + per-panel selection + mapper composition + chart cutover ⟨per-task audit⟩
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

(further entries recorded as tasks complete)
