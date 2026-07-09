# SDD Progress Ledger — Workspace Panel & Layout Polish

**Plan:** `docs/superpowers/plans/2026-07-08-workspace-panel-layout-polish.md`
**Branch:** `fix/workspace-panel-layout-polish` (target: `develop`)
**Base commit:** `971e31b` (merge-base with develop)
**Execution:** subagent-driven-development. Implementer = `sdd-implementer` (sonnet). Final audit = `branch-auditor` (opus).

## Run notes
- Browser/preview verification is done by the USER, not by implementers. Implementers verify via `npx ng test --watch=false` + gates only; they must SKIP the plan's `preview_*` steps.
- Bug 1 = inactive tab/panel `[hidden]` never hides (CSS cascade). Bug 2 = destructive template shrink loses panel positions.
- Design decisions (locked with user): non-destructive/reversible "park cells" model; new tabs seed one active-symbol chart; new cells on GROW are empty "Sin panel".

## Tasks
- [x] Task 1: `[hidden]` CSS cascade fix (viewport + chart-panel) — no unit test (jsdom can't compute display; user verifies in browser)
- [x] Task 2: New tab seeds one active-symbol chart (`createTab` descriptor)
- [x] Task 3: Park-cells reducer model (`fitCells`, `applyGridTemplate` + focus repair, `selectVisiblePanelIds`)
- [x] Task 4: Viewport renders parked cells mounted-but-hidden (`renderedCount`)
- [x] Task 5: Effect noop→filter cleanup + docs (workspace-panels.md) + actions.ts stale-comment fix
- [x] Task 6: Chart focus on click/interactivity bugfix
- [x] Task 7: Derived/unloaded timeframe focus synchronization fix

## Completed
Task 1: complete (commit 971e31b..c84d9cc, review clean — Spec ✅, Quality Approved, 980/980)
Task 2: complete (commit c84d9cc..cea238f, review clean — Spec ✅, Quality Approved, 980/980; twoTabs() helper restructured byte-identical, verified no STOP-rule violation)
Task 3: complete (commit cea238f..9e71069, review clean — Spec ✅, Quality Approved, 984/984; fitCells cases + focus repair + selector slice verified by hand-trace, invariant test untouched)
Task 4: complete (commit 9e71069..8db3211, review clean — Spec ✅, Quality Approved, 985/985; keep-alive @for preserved, parked cells [hidden], test non-vacuous)
Task 5: complete (commit 8db3211..01458e4, review clean — Spec ✅, Quality Approved, 988/988; effect noop→filter + new layout.effects.spec.ts (3 tests) + docs + actions.ts comment; mapper untouched/deferred)
Task 6: complete (commit bdce54c..4bbeae9, review clean — Spec ✅, Quality Approved, 989/989; chartFocused output decoupled store focusing)
Task 7: complete (commit 5b4d759..f57d971, review clean — Spec ✅, Quality Approved, 992/992; syncTimeframeOnFocus check for loaded series)

ALL TASKS COMPLETE.

## Final audit (branch-auditor, opus) — 971e31b..f57d971
**VERDICT: PASS.** Gates re-run personally: tsc app+spec clean; `npx ng test --watch=false` = 74 files / 992 tests passed; lint 0; build success (only the known parquet/arrow budget warning). Invariant greps all pass (no factory selectors over panel/chart state; `layout-invariants.ts` vitest-free in prod bundle; engine purity; no new deps). Named risks cleared (fitCells lossless + position-preserving round-trip; no consumer assumes cells.length===template count; no dangling focusedPanelId; persistence round-trips clean; chart canvas focus works robustly via child outputs; unloaded timeframes sync cleanly). Zero Critical/Important/Minor findings. Ready for PR → develop.

## Minor findings rollup (for final audit triage)
- Task 3 flagged: stale doc comment on `LayoutActions.applyGridTemplate` in `layout.actions.ts` still describes the old merge behavior → fold into Task 5 (docs/comments cleanup).
