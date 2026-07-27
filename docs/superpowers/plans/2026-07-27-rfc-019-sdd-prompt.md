# RFC-019 — SDD Orchestration Prompt

> **Paste this whole document into a fresh session.** It is self-contained: it assumes no
> memory of the design session. You are the **orchestrator**. You do not implement and you
> do not audit your own dispatches beyond mechanical diff-scans.
>
> Protocol: `docs/engineering/sdd-orchestration.md`. This prompt layers RFC-019-specific
> wave parallelism and review batching on top of it.

---

## §0 — BOOT

Read, in this order. Do not skip and do not reorder — later documents assume earlier ones.

| # | Document | Why |
| :-- | :--- | :--- |
| 1 | `CLAUDE.md` | Kernel: invariants, gates, git rules, conventions |
| 2 | `docs/engineering/PHILOSOPHY.md` | §3.1 authority hierarchy, §5.4-5.6 roles/risk/deviation |
| 3 | `docs/engineering/sdd-orchestration.md` | Run protocol, ledger, run modes, audit taxonomy |
| 4 | `docs/architecture/rfcs/019-pane-guard-cross-tf-forming.md` | **The spec.** D19.A-J, N19-1..5, compatibility table |
| 5 | `docs/superpowers/plans/2026-07-27-rfc-019-implementation-plan.md` | **The plan.** §0 corrections are binding over the RFC's prose |
| 6 | `.superpowers/rfc-019/dev-log.md` | Decision rationale, run state if resuming |
| 7 | `docs/engineering/domain/replay-trading.md` | Replay cursor, resolution, fills — context for Tasks 1-2 |
| 8 | `docs/engineering/domain/workspace-panels.md` | Panel model, per-panel derivation, D8 — context for Task 2 |
| 9 | `docs/engineering/domain/chart-engine.md` | Engine boundary, capabilities — context for Tasks 3-4 |
| 10 | `docs/engineering/testing.md` | `ng test` vs bare vitest, flake recovery — needed by every task |

**Read 7-9 only when dispatching the tasks that need them.** Do not preload all three.

**After reading, state in one paragraph:** the two defects, which one is a fidelity defect,
and which single task fixes it. If you cannot, re-read item 4.

---

## §1 — Ground truth

| Fact | Value |
| :--- | :--- |
| Branch | `feature/rfc-019-pane-guard-cross-tf-forming` |
| Base | `develop` @ `0e66392` (the RFC-018 merge, PR #46) |
| PR target | **`develop`** — architectural/RFC track. **Never PR an individual RFC to `main`** (`CLAUDE.md` §Git) |
| Design commit | RFC + plan + this prompt + dev log, already committed. No `emulador/` source touched |
| Expected baseline | RFC-018 closed at **1989 tests**. **This is a claim, not evidence — re-verify it yourself.** |

**First action, before any dispatch:** run all four gates raw from `emulador/`, on a clean
tree, and record the real numbers in the ledger. That output is the arithmetic origin for
every task's test-count progression. If it does not match 1989, the ledger records the
real number and the discrepancy — it does not "correct" the plan.

```bash
cd emulador && npx tsc -p tsconfig.app.json --noEmit && npx tsc -p tsconfig.spec.json --noEmit && npm run lint && npx ng test --watch=false
```

Never pipe a gate through `| tail` or `| head` — it swallows the non-zero exit and a real
failure reads as a pass.

---

## §2 — Roles and run mode

| Role | Who | Contract |
| :--- | :--- | :--- |
| **Orchestrator** | this session | Owns the ledger. Dispatches. Never implements. Never audits its own dispatch beyond a mechanical diff-scan. |
| **Implementer** | `sdd-implementer` subagent | Executes exactly one brief. TDD. Scope-bounded. Task-scoped pathspec commit. Writes a report with deviations. |
| **Auditor** | `branch-auditor` subagent (Opus) | **Re-runs all gates personally.** Implementer and orchestrator reports are claims, not evidence. |

**Run mode: TIERED with batched review** (`decision-frameworks.md` §8; ledger header must
record this).

| Task | Risk | Review | Justification |
| :--- | :--- | :--- | :--- |
| Task 1 | LOW | **Batch A** (post-Wave 1) | Mechanical extraction of a pure fn; no behavior change |
| Task 3 | LOW | **Batch A** (post-Wave 1) | 8-line accessor + guard in 3 handlers; pattern exists at 2 sites |
| Task 4 | LOW | **Batch A** (post-Wave 1) | Isolated in 1 vanilla-TS file; no side effects |
| Task 2 | **HIGH** | **Batch B — individual audit, post-Wave 2. PASS required to proceed.** | D-B1 correctness, multi-panel, lookahead, new memo slot |
| Task 5 | LOW | **Batch A** (post-Wave 3) | Test-only; touches no production logic |

**Saving vs. the RFC-018 model:** 3-4 per-task audit dispatches avoided. Risk-directed
attention (PHILOSOPHY §5.5) concentrates the expensive review where the correctness lives.

A mode change is a **recorded decision**, never improvised. If an audit dispatch dies on
session limits, the orchestrator may run that audit inline — and records that it did
(precedent: RFC-009).

---

## §3 — The dispatch loop

### Wave 1 — parallel (3 implementers, separate worktrees)

Tasks 1, 3 and 4 touch **disjoint file sets** (plan §1 overlap table). Dispatch all three
simultaneously.

**Worktree strategy:**

```bash
git worktree add ../rfc019-t1 -b rfc019/task-1 feature/rfc-019-pane-guard-cross-tf-forming
git worktree add ../rfc019-t3 -b rfc019/task-3 feature/rfc-019-pane-guard-cross-tf-forming
git worktree add ../rfc019-t4 -b rfc019/task-4 feature/rfc-019-pane-guard-cross-tf-forming
```

Each implementer receives its worktree path and runs its own gates there. `node_modules`
is not shared across worktrees — either symlink it or run `npm ci` per worktree, and
record which you chose. **After `npm install` of any kind, run `npm ci --dry-run` before
touching the lockfile** (npm 11.x silently prunes optional-dep entries; local stays green,
CI fails EUSAGE — recovery in `docs/engineering/testing.md`).

**Merge back, in this order** (T1 last is wrong — T1 is the dependency; merge it first so
a T2 dispatch can start the moment Wave 1 closes):

```bash
git merge --no-ff rfc019/task-1 && git merge --no-ff rfc019/task-4 && git merge --no-ff rfc019/task-3
git worktree remove ../rfc019-t1 && git worktree remove ../rfc019-t3 && git worktree remove ../rfc019-t4
```

Conflicts are not expected. If one appears, it means a task exceeded its declared file
scope — **stop and investigate**, do not resolve it silently.

**Failure isolation:** if one Wave 1 task fails its gates, **the other two continue**.
Re-dispatch only the failed one with the failure evidence appended to its brief. Do not
serialize the wave because one member stumbled.

**Brief length:** Tasks 3 and 4 get **SHORT** briefs. They touch isolated files with
known patterns; the plan already carries the code shapes. A long brief for a 40-line
change wastes implementer context that is better spent reading the real file. Task 1's
brief is medium (it creates a new module and must verify `fill-engine`'s index contract
rather than assume it).

### Checkpoint 1 (post-Wave 1)

1. Four gates, raw, on the merged branch.
2. **Batch A audit part 1** — one `branch-auditor` dispatch covering Tasks 1, 3, 4
   together.
3. Ledger: three task entries with commit hashes, test-count progression, scope actually
   touched, deviations classified inert / requires-attention.

### Wave 2 — sequential (1 implementer)

**Task 2.** Depends on Task 1's `aggregateFormingCandle` and shares
`chart-model-mapper.service.ts` with it — which is precisely why it is not in Wave 1.

Its brief is **long and explicit**. It must carry, verbatim:

- Plan §0 **C1** — the `panelRendersTrades` override. This is the single most likely way
  to get this task wrong, and the brief must say why: `hideTrades` suppressing forming
  **reintroduces the lookahead defect**.
- The full 9-scenario test matrix.
- The D-B1 rule stated as a sentence, not just as code: *`idx - 1` is conditioned on
  `subGrain`, never on `forming != null`.*
- The single-panel byte-identity requirement (scenario 1).

### Checkpoint 2 (post-Wave 2) — **GATE**

1. Four gates, raw.
2. **Batch B — individual `branch-auditor` audit of Task 2.** Zero Critical/High/Medium.
3. **PASS is required to proceed to Wave 3.** If it fails, fix and re-audit. Do not roll
   Task 5 forward "to save a dispatch" — Task 5's entire purpose is to independently check
   Task 2, and it is worthless if written against known-broken behavior.

### Wave 3 — sequential (1 implementer)

**Task 5.** Additive test code. Depends on Waves 1+2 being green.

Critical instruction for its brief: **if a scenario fails, that is a Task 2 defect —
report it, do not patch the assertion.** An implementer who weakens `assertNoLookahead` to
make it pass has destroyed the deliverable.

### Checkpoint 3 (post-Wave 3)

1. Four gates, raw.
2. **`assertNoLookahead` specifically** — confirm both that it passes on current behavior
   and that Task 5 Step 2 demonstrates it *fails* on the pre-RFC shape. An invariant that
   cannot fail is not an invariant.
3. **Batch A audit part 2** — `branch-auditor` on Task 5.

### Final

1. Four gates + `npm run build` (watch for NEW chunk types — vitest sentinel; the
   ~609 kB budget warning is known-accepted, Arrow/parquet-dominated).
2. Invariant greps (§5).
3. Docs pass: register RFC-019 in `docs/architecture/ROADMAP.md`; update the dev log.
4. **Whole-branch Opus audit.** PASS = "Ship it", zero Critical/High/Medium. Lows may be
   ruled no-fix **with written reasons** so they are not re-litigated
   (PHILOSOPHY §3.5).
5. PR to `develop` via the GitHub MCP.

**Task ordering flexibility:** the orchestrator may reorder *within* a wave, and may
promote Task 2 to ship alone if the run degrades (session limits, a blocked task). The
lookahead fix outranks every other change in this RFC. A reorder is a ledger entry.

---

## §4 — Task scope and acceptance

Authoritative boundaries live in the plan, §3, Tasks 1-5. Each brief must restate:

1. **Files in scope** — exact paths, from the plan's overlap table.
2. **Invariants that must hold**, each with the grep that checks it:
   - `grep -rn "selectFormingCandle(" emulador/src --include=*.ts` → zero calls **with an
     argument** (D8 factory-selector ban)
   - `grep -rn "panelRendersTrades" emulador/src/app/components/chart/chart-model-mapper.service.ts`
     → zero hits inside `chartView$` (plan §0 C1)
   - `grep -rn "spec-util" emulador/src/app --include=*.ts | grep -v "\.spec\.ts"` → zero
     (kernel inv. 7)
   - `git diff --stat origin/develop -- emulador/package.json` → no dependency additions
3. **Tests to write first** — the task's scenario table, TDD order.
4. **Explicitly out of scope** — the plan states this per task; copy it.
5. **The STOP rule** — pre-existing specs are authority. A task that cannot proceed
   without editing a spec beyond TestBed providers **STOPS and reports**. The only
   pre-declared exception is Task 4's `drawings-capability.spec.ts:64-65` destroy-guard
   assertions, whose intent is unchanged.

---

## §5 — Verification gates (non-negotiable)

Per task, from `emulador/`, **raw, never piped**:

```bash
npx tsc -p tsconfig.app.json --noEmit
npx tsc -p tsconfig.spec.json --noEmit
npx ng test --watch=false
npm run lint
```

- `npx ng test --watch=false` — **never** bare `npx vitest run`; it always fails (no
  TestBed env).
- `npm run lint` must report **0 problems**; `develop` is lint-clean.
- At final audit additionally: `npm run build`, plus the §4 invariant greps.
- Record the test count after every task. The progression must be arithmetically
  consistent with the §1 baseline — the auditor verifies this.

**Fresh output is the only acceptable evidence.** "The gates passed" without pasted output
is not a claim the orchestrator may record.

---

## §6 — Operating principles

- **Context isolation.** Each implementer gets its brief and reads its own files. It does
  not receive this prompt, the other tasks' briefs, or the design conversation.
- **Spec-scoped.** Implementers do not fix adjacent problems they notice. They report them
  (the plan's §5 follow-ups already list two known ones: ROADMAP registration and the
  F19-2 foreign-symbol candle-sourcing defect).
- **Deviation honesty** (PHILOSOPHY §5.6). Every departure from the plan is written into
  the ledger, classified **inert** or **requires-attention**. Silent deviation is the one
  unrecoverable failure mode — the auditor cannot check what it is not told about.
- **Pathspec commits.** `git commit <paths> -m "..."`. Never `git add -A`. Never sweep the
  user's unrelated dirty files into a commit. Parallel actors sharing a tree make this
  mandatory, not stylistic.
- **TDD.** Failing test first. For Task 5 specifically, the helper must be *proven to
  fail* on the pre-RFC shape before it is accepted (plan Task 5, Step 2).
- **`assertNoLookahead` must pass** — it is a DoD item, not a nice-to-have. It is the
  durable artifact of this RFC; the patches are not.
- **Angular 21 syntax.** Consult the `context7` MCP for the in-use version's official docs
  before writing or changing Signals / `linkedSignal` / `resource()` / standalone /
  new-control-flow code. Never rely on training-data recall for framework APIs.
- **Lockfile.** After ANY `npm install`, run `npm ci --dry-run` before committing the
  lockfile.
- **Do not invent members.** Tasks 3 and 4 must read the real `ChartEngine` /
  `DrawingsPrimitive` fields. The plan's code shapes are targets, not transcriptions —
  where they disagree with the tree, the tree wins and the report says so.
- **Protected paths** — never touch without explicit approval: `pipeline/**`,
  `.claude/` hooks / `settings.json` / `steering.md`, `CLAUDE.md`.

---

## §7 — Definition of done → PR

1. **Tasks 1-5 green**, each with its own task-scoped commit and ledger entry.
2. **Four gates green** with fresh raw output; `npm run build` clean of new chunk types.
3. **`assertNoLookahead` passes** the full Task 5 matrix, **and** provably fails on the
   pre-RFC shape.
4. **Single-panel byte-identity spec green** (Task 2, scenario 1) — the most common
   configuration must be unchanged.
5. **Invariant greps clean** (§4).
6. **Docs updated:** RFC-019 registered in `docs/architecture/ROADMAP.md`; dev log carries
   every deviation and the final gate evidence.
7. **Whole-branch Opus audit PASS** — zero Critical/High/Medium; any Low ruled no-fix with
   written reasons.
8. **PR to `develop`** via the GitHub MCP, body summarizing D19.A-J, the two defect
   classes, and the N19-1..5 invariants. Branch protection and Supabase auth admin have no
   MCP/CLI path — if either is implicated, say so in the PR as a human dashboard task.

**Degraded-run fallback:** if the session cannot complete all five tasks, ship **Task 1 +
Task 2** alone. That is the lookahead fix, it is independently correct, and it is worth
more than the other three combined. Tasks 3-5 then become a follow-up run against the same
RFC. Record the split as a ledger decision.
