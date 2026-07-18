# SDD Run Ledger — RFC-017 Compositional Panel Sync & Layer Composition

- **RFC (spec):** `docs/architecture/rfcs/017-compositional-panel-sync.md` (D17.A–L)
- **Technical spec:** `docs/superpowers/specs/2026-07-16-rfc-017-compositional-panel-sync-design.md`
  (§4 pipeline diagram = rendering contract). Visual spec:
  `docs/superpowers/specs/2026-07-16-rfc-017-trade-visualization-concepts.md` (Ghost Rails).
- **Plan:** `docs/superpowers/plans/2026-07-16-rfc-017-implementation-plan.md` (9 tasks)
- **Branch:** `feature/rfc-017-compositional-panel-sync` @ base `64f19b3` (origin/develop)
- **Run mode (decision-frameworks §8): TIERED** — per-task `branch-auditor` review on the
  high-risk tasks (Task 3 store restructure/cutover; Task 6 persistence/migration;
  Task 7 reopened trading capability), batched (no per-task audit) on the additive tasks
  (1, 2, 4, 5, 8), ONE final whole-branch audit gating the PR. Precedent: RFC-014's
  tiered reviews (opus on money path). Implementer = `sdd-implementer`.
- **Baseline evidence (fresh, 2026-07-16):** tsc app ✓, tsc spec ✓, `ng test`
  1362/1362 green (112 files), lint 0 problems.
- **Run decisions:**
  - **STOP exception class (declared in plan Global Constraints):** pre-existing specs
    asserting the superseded V2 drawings shape/API (flat `items[]` slice,
    `restoreDrawingsForSymbol`, global `selectedId`, per-symbol `DrawingCollection`
    internals) MAY be adapted preserving intent; every edit is enumerated per task
    below. Authorized by the RFC-017 mission (schema replacement is the deliverable).
    All other pre-existing specs remain untouchable (STOP/BLOCKED).
  - Previous run's ledger (RFC-014, merged) replaced — recoverable from git history.
    Local artifacts of the RFC-016 run archived to `.superpowers/sdd/archive-rfc016-run/`.

## Tasks

- [ ] Task 1: LinkGroup composition channels (`syncDrawings`, `syncTrades`)
- [ ] Task 2: Drawing schema expansion + target resolution + pure migration functions
- [ ] Task 3: Entity store + owner index + per-panel selection + mapper composition + chart cutover ⟨per-task audit⟩
- [ ] Task 4: Panel-scoped undo/redo with revision guard (D17.F)
- [ ] Task 5: Clipboard (D17.G) + per-panel shared-layer toggle (D17.H)
- [ ] Task 6: SessionPayloadV3 + migration chain + IndexedDB lift (D17.J) ⟨per-task audit⟩
- [ ] Task 7: Trade layer gating + Ghost Rails primitives ⟨per-task audit⟩
- [ ] Task 8: Position HUD chip + Design System token registration
- [ ] Task 9: Finalization — invariant greps, build, docs closure

## Task entries

(recorded as tasks complete)
