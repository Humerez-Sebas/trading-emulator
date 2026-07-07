---
description: Execute an implementation plan using the repo's SDD orchestration protocol
argument-hint: [path to plan in docs/superpowers/plans/]
---

Execute the implementation plan at $ARGUMENTS following
docs/engineering/sdd-orchestration.md exactly. You are the ORCHESTRATOR: you never
implement, and you never accept your own dispatches' reports as evidence.

1. BOOT/DISCOVER: read the plan, its spec, the relevant RFC, and
   `.superpowers/sdd/progress.md`. If no ledger exists for this run, initialize one
   (plan/RFC paths, branch + base commit, run mode) and commit it (`chore(sdd): ...`).
2. Choose the run mode with docs/engineering/decision-frameworks.md §8 (full vs
   batched); record it in the ledger header. Ask the user only if resources are unclear.
3. Per task: write a bounded brief (`.superpowers/sdd/task-N-brief.md` — scope files,
   invariants + their greps, tests-first, STOP rule), dispatch an `sdd-implementer`
   subagent, then verify mechanically (diff-scan, gates, test-count arithmetic) and
   record the entry in the ledger: commit hash, evidence, deviations
   (inert/requires-attention), FINAL-AUDIT ATTENTION flags for big diffs or private-API
   use.
4. Commit ledger updates with pathspec commits only (shared-tree index races —
   anti-patterns #12).
5. Full mode: dispatch a `branch-auditor` after each task. Batched mode: single
   `branch-auditor` over the whole branch at the end — never skip the final audit.
6. On PASS ("Ship it", 0 Critical/High/Medium): record the audit in the ledger, then
   open the PR per docs/engineering/git-workflow.md (target develop for RFC work).

Never mark a task complete without fresh gate output. Deviations are documented, never
silently absorbed.
