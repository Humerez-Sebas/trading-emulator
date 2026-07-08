# SDD Orchestration Guide

How implementation plans are executed in this repo (subagent-driven development).
Applies PHILOSOPHY §5.4 (role separation), §5.5 (risk-directed attention), §5.6
(deviation honesty). The superpowers skills (`brainstorming`, `writing-plans`,
`subagent-driven-development`, `requesting-code-review`) provide the generic mechanics;
this document records the repo-specific protocol layered on top.

## Roles

- **Orchestrator** (the main session): owns the ledger, dispatches tasks, never
  implements, never audits its own dispatches' output beyond mechanical diff-scans.
  Runs a state machine: BOOT → DISCOVER (read plan + ledger) → dispatch loop
  (brief → implement → verify → record) → FINAL AUDIT → CREATE PR.
- **Implementer** (typically Sonnet subagent): executes exactly one task brief, TDD,
  scope-bounded, commits task-scoped (pathspec), writes a task report with deviations.
- **Auditor** (typically Opus subagent): reviews per task (full mode) or the whole
  branch (batched mode). **Re-runs all gates personally** — implementer/orchestrator
  reports are claims, not evidence.

## Artifacts and where they live

- `.superpowers/sdd/progress.md` — the ledger, the single source of run truth.
  **Git-tracked** (everything else in `.superpowers/sdd/` is gitignored).
- `.superpowers/sdd/task-N-{brief,report,diff}.md`, `review-*.diff` — working artifacts,
  local only.
- The implementation plan lives in `docs/superpowers/plans/`, the spec in
  `docs/superpowers/specs/` (committed before the run starts).
- Historical note: one early run committed task artifacts into `docs/superpowers/plans/`
  — that was a mistake, not a convention.

## Ledger protocol (progress.md)

Each task entry records: status, commit hash, verification evidence (test count
progression, tsc/lint state), scope actually touched, **deviations** (classified inert /
requires-attention), and **FINAL-AUDIT ATTENTION flags** pointing the auditor at the
largest diffs and any private-API usage. Run-level header records: plan/RFC paths, branch
+ base commit, and the **run mode** (see below) — a mode change is a recorded decision,
never improvised silently.

## Run modes

- **Full mode:** per-task audit by Opus after each implementer dispatch, plus a final
  whole-branch audit. Default for high-risk work.
- **Batched mode (resource-constrained):** tasks grouped into few dispatches, task-scoped
  commits preserved, NO per-task audits, ONE final whole-branch Opus audit gating the PR.
  Validated in practice (RFC-013: 0 Critical/High/Medium findings). Choose it when
  account limits or cost demand it, and write the mode into the ledger header.
- Degraded dispatch: if an audit dispatch dies (session limits), the orchestrator may run
  that audit inline — record it in the ledger (happened in RFC-009).

## Task briefs

A brief must bound the task: files in scope, invariants that must hold (with the grep
that checks them), the tests to write first, what is explicitly out of scope, and the
STOP rule (pre-existing specs are authority — deviations get documented, not "fixed").

## Verification gates

Per task: `tsc` app+spec clean, `npx ng test --watch=false` green (record the count),
`npm run lint` 0. At final audit additionally: `npm run build` (watch for NEW chunk
types — vitest sentinel — not the known ~609 kB budget warning) and the invariant greps:
forbidden files zero-diff, no factory selectors, no new dependencies, reserved fields
(e.g. `syncPriceScale`) still have zero read sites.

## Final audit

Severity taxonomy: Critical / High / Medium / Low. The PR ships only on PASS ("Ship it")
with zero Critical/High/Medium. Lows may be **ruled no-fix with written reasons**
(test-code pragmatism ≠ production risk — PHILOSOPHY §3.5) so they aren't re-litigated.
The auditor verifies ledger arithmetic (test-count progression, commit hashes) and reads
the attention-flagged diffs line by line.

## Multi-phase work across sessions

One phase per session. Continuity comes from committed artifacts, not memory: a **master
prompt** document (paste into a fresh session; it picks up the next unmerged phase) and
per-phase **handoff** docs. Pattern proven across the 3-phase Supabase migration and the
13-RFC chart engine sequence.
