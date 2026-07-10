# Decision Frameworks

Reusable decision trees for the choices that recur here. They encode PHILOSOPHY §3;
when a leaf conflicts with the user's explicit direction, the user wins.

## 1. What ceremony does this change need?

```
Is it governed by an existing RFC's frozen decisions/non-goals?
├─ Violates them → STOP. New RFC (or explicit user revocation). Never "just this once".
├─ Extends within them →
│   Multi-task, or touches persistence/domain boundaries?
│   ├─ Yes → spec + plan (docs/superpowers/) + SDD run + branch per git-workflow.md
│   └─ No  → direct branch + TDD + gates + normal PR
└─ Not RFC territory (product feature/fix) →
    Hard to reverse (schema, deletion, public API, external service)?
    ├─ Yes → brainstorm → spec → plan; versioned migration + round-trip tests
    └─ No  → smallest green step; additive first, cutover second
```

## 2. When to write an RFC (vs a spec, vs nothing)

Write an **RFC** when the change (a) reopens an audited core, (b) adds a new
architectural layer/system, or (c) freezes decisions future work must obey. Write a
**spec+plan** when behavior changes across multiple components but architecture doesn't.
Write **neither** for scoped fixes — the PR description carries the why. A multi-RFC
block additionally gets a **vision doc** with frozen decisions (D-ids) and explicit
non-goals *before* the first RFC is drafted.

## 3. When to introduce an abstraction

Only when it can name the concrete defect it prevents or the audited machinery it reuses
(complexity pays rent — PHILOSOPHY §2.8). Checks, in order: (1) Does audited machinery
already do this? Extend it. (2) Is the need measured/real, or anticipated? If
anticipated → **reserve, don't implement** (field/interface with zero read sites, audited
to stay unused). (3) Still needed → build it closed-core/open-extension, with its
invariant formulated as something grep-able.

## 4. When to add a dependency

Default: no. Ask: can plain DOM / existing deps do it acceptably? (LinkGroups popovers
skipped CDK this way.) If genuinely needed: check bundle impact (NEW chunk types, not
just size), run `npm ci --dry-run` after install (lockfile prune trap), and record the
justification in the PR. Audits grep for dependency changes — an unexplained one is a
finding.

## 5. When to optimize — and when to stop

```
Is there a measured gap against an explicit budget (16 ms/frame, UX latency)?
├─ No → don't optimize. If tempted, measure first; record rejected ideas WITH numbers
│        in performance.md (a rejection without a number will be re-proposed).
└─ Yes → profile to find the mechanism (not the component) →
         fix the mechanism → re-measure → stop when budget is met.
```
Never re-propose: download pipelining (<1 % — ingest-bound), web workers for replay
(render ≪ budget). Both rejections are measurement-backed; new numbers required to reopen.

## 6. When a review finding is "no-fix"

Rule no-fix only when: the risk is confined to test code (test pragmatism ≠ prod risk),
OR the "fix" would violate a stronger rule (touching pre-existing specs), OR it
duplicates an accepted, documented risk (D7-style). Always with a written reason in the
audit record — an unreasoned no-fix gets re-litigated forever. Anything touching a
production path is never no-fix on convenience grounds.

## 7. When to split vs merge tasks

Split until each task is the smallest unit that builds green in isolation. Merge when
type-coupling makes the intermediate state uncompilable (an action-surface rename and its
dispatchers are ONE task). Additive tasks (new inert code) precede cutover tasks (swap
consumers); proofs/e2e come last.

## 8. Which SDD run mode

Full mode (per-task audits) when: touching persistence/migration, reopening audited
code, or the plan has >2 requires-attention risks. Batched mode (single final audit)
when resources are constrained AND tasks are UI-layer/additive over audited machinery —
proven on RFC-013. Either way: task-scoped commits, ledger records the mode, final
whole-branch audit is never skipped.

## 9. When to create a skill / command / agent definition

Only for a workflow that has already recurred ≥2 times AND whose re-derivation cost is
real (protocols, gates, checklists — not knowledge that belongs in a doc). Prefer: doc in
`docs/engineering/` (knowledge) → command in `.claude/commands/` (repeatable procedure)
→ agent in `.claude/agents/` (role with its own context/discipline) — in that order of
escalation. Never create one speculatively.

## 10. Where does a piece of knowledge live?

```
Is it a decision future work must obey? → RFC / vision doc (D-id)
Is it operational judgment/procedure?   → docs/engineering/*.md
Is it domain understanding (why/trade-offs)? → docs/engineering/domain/*.md
Is it run state (task progress, evidence)?   → .superpowers/sdd/progress.md
Is it session-scoped agent state?            → agent memory (pointers only —
                                               promote anything durable into the repo)
```
The test for repo-worthiness: would a fresh agent without conversation history need it?
If yes, it goes in the repo. Conversations are buffers, not storage.
