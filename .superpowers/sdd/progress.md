# SDD Progress Ledger — RFC-009 MultiChart Manager & Lifecycle

- **Plan:** `docs/superpowers/plans/2026-07-02-rfc-009-multichart-manager.md`
- **RFC:** `docs/architecture/rfcs/009-multichart-manager-and-lifecycle.md`
- **Branch:** `feature/rfc-009-multichart-manager` (based on feature/rfc-008-panel-system-layout @ 34b047d, rebased onto develop 99b9ed9 incl. PR #24/#25; RFC-008 PR: #26)
- **Base commit:** `34b047d`

## Task Progress

Task 1 (movePanel + lifecycle invariant suite): complete (commit 3884959, verified 2026-07-02: 828 tests green, tsc app+spec clean, lint 0; Opus review PASS, 0 High/Critical)
  - Adaptation documented: RFC's movePanel(id, targetCellId) -> (panelId, targetTabId, targetCellIndex) — GridCell has no id in frozen interfaces.
  - Low findings: (1) sourceTab O(tabs×cells) scan could be avoided (cosmetic); (2) same-tab move out of stacked cell where moved panel wasn't active is untested (correct by inspection, shares removePanel's expression).
Task 2 (derived visibility + keep-alive viewport): complete (commit 7cf875a, verified 2026-07-02: 832 tests green, tsc app+spec clean, lint 0; Opus review PASS, 0 High/Critical)
  - Reviewer confirmed: selectVisiblePanelIds single-slot memo OnPush-safe; identity-preservation test genuinely asserts instance equality; hidden panels change-detecting until Task 3 gating is the sanctioned D6 tradeoff; `visible` input staged (consumer arrives in Task 3).
Task 3 (mapper update-gating D6 + provider move): complete (commit ff3cf68, verified 2026-07-02: 836 tests green, tsc app+spec clean, lint 0; audit PASS, 0 High/Critical)
  - AUDIT MODE DEVIATION: the Opus reviewer dispatch was killed by the account session-usage limit (resets 9:30pm La Paz); the orchestrator performed the review inline with the identical checklist. Verified: gate semantics (suppress/resync/no-dup/cold-sub), chart.component.ts diff = exactly the removed providers line, DI sweep shows no NullInjectorError path (mapper injected only by ChartComponent + ChartPanelComponent; app-chart mounted only under panel/page providers), only the mapper spec changed among tests.
  - D6 seam established: panel + inner chart share one mapper instance per panel; five render feeds gated by visibility; panelChartView$ and sessionEnd signal ungated by design.
Task 4 (ChartRegistry + lifecycle/leak tests): complete (commit 1db6209, verified 2026-07-02: 842 tests green, tsc app+spec clean, lint 0; Opus review PASS, 0 High/Critical)
  - Sanctioned deviation confirmed faithful: gating test spies the panel's mapper (the real D6 seam) instead of the registry handle (a delegate with no internal call sites); plan's original spy would have observed nothing.
  - MEDIUM logged (fix folded into Task 5, same spec file): viewport gate test asserts the re-show true-path only; add a spy on the panel being HIDDEN asserting setUpdatesEnabled(false). Mechanism itself unit-covered in mapper spec.
  - Lows: handle→mapper delegate wiring untested (no external consumer yet); registry read API has no production consumer until RFC-010+.
Task 5 (hot create/close affordances): complete (commit 872f439, verified 2026-07-02: 845 tests green, tsc app+spec clean, lint 0, invariant greps empty; Opus review PASS, 0 High/Critical)
  - Also closed the Task-4 Medium: lifecycle gate test now asserts setUpdatesEnabled(false) on the hidden panel and (true) on the shown one.
  - Deviations (reviewed, behavior-preserving): a11y attrs/handlers on the close affordance; .grid:not([hidden]) query scoping (required by keep-alive DOM); test-only action cast.
  - Low logged: close "×" is a span[role=button] nested inside the cell-tab button — a11y smell; lift to a sibling control in a future pass.
Final audit: incomplete
