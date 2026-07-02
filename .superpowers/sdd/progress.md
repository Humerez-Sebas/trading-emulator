# SDD Progress Ledger — RFC-008 Panel System & Layout Foundation

- **Plan:** `docs/superpowers/plans/2026-07-01-rfc-008-panel-system-layout.md`
- **RFC:** `docs/architecture/rfcs/008-panel-system-and-layout-foundation.md`
- **Branch:** `feature/rfc-008-panel-system-layout`
- **Base commit:** `cc9891c` (develop @ merge of PR #23)

## Task Progress

Task 1 (NgRx layout feature): complete (commit 256cddf, verified 2026-07-01: 803 tests green, tsc app+spec clean; Opus review PASS, 0 High/Critical)
  - Low findings logged for final audit: (1) `normalizeCells` `orphaned[0]` fallback branch uncovered by tests; (2) closeTab of a NON-active tab path untested; (3) no-op branches untested (addPanel out-of-range cellIndex, applyGridTemplate unknown tabId, same-size template relabel).
Task 2 (ChartSyncBus skeleton): complete (commit b7a0f80, verified 2026-07-01: 808 tests green, tsc app+spec clean; Opus review PASS, 0 High/Critical)
  - Low findings (informational, reviewed as sound): (1) necessary `as PanelSyncEvent` cast in emit(), mirrors audited chart-event-bus pattern; (2) emit-after-destroy is a silent no-op (standard Subject semantics, relied on by Task 4 spec).
Task 3 (ChartModelMapper D8 panel derivation): complete (commit 69759c2, verified 2026-07-01: 813 tests green incl. isolation test, tsc app+spec clean; Opus review PASS, zero findings)
  - Note for future reviewers: run specs via `ng test` / `npm test` (Angular builder wires TestBed init); bare `npx vitest run` fails by design.
Task 4 (ChartPanelComponent + chartReady output): complete (commit 8b91017, verified 2026-07-01: 818 tests green x2 independent runs, tsc app+spec clean; Opus review PASS, 0 High/Critical; audited chart.component.ts diff = exactly the 4 sanctioned additive hunks)
  - Low finding (out of scope, investigated): reviewer's suite run once showed selectors.spec.ts `selectFloatingPnl > prices off the replay-series candle` failing (817/818); two subsequent orchestrator runs were 818/818 green and the test is deterministic — most likely interference from two concurrent `ng test` processes sharing the .angular cache. Not an RFC-008 regression; watch during final audit.
Task 5 (WorkspaceViewport host): complete (commits 9584dc6 + fix-loop c39995a, verified 2026-07-02: 823 tests green, tsc app+spec clean, lint clean in RFC-008 files; Opus review PASS, 0 High/Critical)
  - Fix loop executed: 2 branch-introduced lint errors corrected (removePanel rest-destructure -> Object.fromEntries filter; spec type -> interface). Reviewer confirmed behavior-identical.
  - Low findings logged: (1) no explicit test asserting ChartSyncBus.destroy() on viewport ngOnDestroy; (2) panelLabel duplicates ChartPanelComponent.headerLabel logic (different injection contexts, acceptable).
  - Repo quality stewardship (user-mandated, commit 31d14d3): mt5_common.py -> pipeline/ (59 py-tests green, ruff clean), removed dock-redesign-hud/ + playback-controller-hud/ + diff dumps, untracked .agents/, added .claudeignore, gitignored diff dumps.
  - Out-of-scope debt tracked via follow-up chips: 18 pre-existing lint errors on develop (task_ba2c42cc); intermittent flakiness in trading-capability.spec.ts / selectors.spec.ts reproduced on untouched baseline (task_34d65c91).
Final audit: incomplete
