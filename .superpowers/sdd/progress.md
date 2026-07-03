# SDD Progress Ledger — RFC-010 Synchronization

- **Plan:** `docs/superpowers/plans/2026-07-02-rfc-010-synchronization.md`
- **RFC:** `docs/architecture/rfcs/010-synchronization.md`
- **Branch:** `feature/rfc-010-synchronization` (off develop @ 5867ac5 — RFC-008 PR #26/#28 + RFC-009 PR #27 merged)
- **Base commit:** `5867ac5`

## Task Progress

Task 1 (linkGroups NgRx feature + setPanelLinkGroup): complete (commit 14f306e, verified 2026-07-03: 853 tests green, tsc app+spec clean, lint 0; Opus review PASS, 0 High/Critical)
  - removeGroup deliberately leaves orphaned PanelDescriptor.linkGroupId (documented); Task 2 router must treat a dangling group id as unlinked (reviewer verified the planned route() guard does exactly that).
  - Lows (optional polish): add assertLayoutConsistent to one setPanelLinkGroup spec; removeGroup Object.fromEntries pattern noted as house-consistent.
Task 2 (ChartSyncRouter group-scoped fan-out, idempotent apply): complete (commit 4b42921, verified 2026-07-03: 860 tests green, tsc app+spec clean, lint 0; Opus review PASS, 0 High/Critical)
  - SAFE-STATE confirmed: router constructed nowhere in production; panel apply handles are inert no-ops until Task 3; loop cannot form in this commit.
  - Reviewer's loop trace ratified the plan's two-mechanism design: origin-exclusion + idempotence alone do NOT close A->B->A (the echo's originator was never an apply target); Task 3's ChartEngine applyingSync guard is the load-bearing second mechanism.
  - MEDIUMS folded into Task 3 (adjacent files): (1) re-key applyIfChanged on the APPLIED value per event type (time for crosshair, {from,to} for range) — raw MouseEventParams stringify makes crosshair idempotence inert; (2) add a crosshair idempotence test; (3) fix router doc comment to name the engine guard as load-bearing.
  - Deviations reviewed OK: GATE Record type (lint), typed vi.fn generics (spec-only), inert panel stubs (required-methods contract defensible; replaced in Task 3).
Task 3 (ChartPanel wiring + ChartEngine guarded apply seam): complete (commits fd6e8a3 + 317c2e1 + fix cc35aa5, verified 2026-07-03: 872 tests green x2, tsc app+spec clean, lint 0; initial Opus audit FAIL [1 High], fix re-audited PASS, 0 High/Critical)
  - HIGH (closed): lightweight-charts v5 fires range callbacks on the NEXT animation frame — the synchronous applyingSync flag could not catch the echo. Fix: one-shot suppressNextRangeEvent armed before setVisibleLogicalRange, consumed value-independently by the next range callback, cleared in catch on throw. Re-auditor verified against v5.2 source: RAF coalescing (two rapid applies -> one echo) and crosshair's internal skipEvent=true both confirmed.
  - Also closed in fd6e8a3: Task-2 Mediums (idempotence re-keyed on applied values; crosshair idempotence test; honest doc comments).
  - Residual LOW (documented, no fix): identical-range apply fires no echo -> armed flag would consume the next genuine user event; masked by router value-idempotence, self-heals next interaction.
  - HANDOFF to Task 5 e2e: real-RAF loop regression must cover (i) coalesced double-apply, (ii) user-drag racing the echo window (converges, no sustained oscillation), (iii) no-value-change apply not swallowing the next real drag; 3+-panel topology for the idempotence net.
Task 4 (replay clock fan-out + freeze-on-last verification suite): complete (commit 82e71ee, verified 2026-07-03: 877 tests green, tsc spec clean, lint 0; Opus review PASS, 0 High/Critical)
  - Pure-test task, zero production code; D5 claims held on first run (nothing falsified). Reviewer ratified fidelity: selectReplayIndex stays the single-chart path; panelChartView$ is the per-panel fan-out surface — both use the same audited lastIndexAtOrBefore primitive.
Task 5 (viewport ChartSyncRouter wiring + e2e feedback-loop regression): incomplete
Final audit: incomplete
