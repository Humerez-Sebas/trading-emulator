You are the **orchestrator**. You do not implement and you do not audit your own
dispatches beyond mechanical diff-scans.

Protocol: `docs/engineering/sdd-orchestration.md`. This prompt layers the
product-track (PR → `main`) specifics on top of it.

---

## §0 — BOOT

Read, in this order. Do not skip and do not reorder — later documents assume earlier ones.

| # | Document | Why |
| :-- | :--- | :--- |
| 1 | `CLAUDE.md` | Kernel: invariants, gates, git rules, conventions |
| 2 | `docs/engineering/PHILOSOPHY.md` | §3.1 authority hierarchy, §5.4–5.6 roles/risk/deviation |
| 3 | `docs/engineering/sdd-orchestration.md` | Run protocol, ledger, run modes, audit taxonomy |
| 4 | `docs/superpowers/specs/2026-08-01-calculadora-riesgo-design.md` | **The spec.** Scope, non-goals, the dependency-rule decision, the three honest states |
| 5 | `docs/superpowers/plans/2026-08-01-calculadora-riesgo.md` | **The plan.** Its Global Constraints are binding over the spec's prose |
| 6 | `.superpowers/calculadora/dev-log.md` | Ledger. **Create it if absent** — this is a new run |
| 7 | `docs/engineering/testing.md` | `ng test` vs bare vitest, flake recovery — needed by every task |
| 8 | `docs/engineering/git-workflow.md` | Two-track flow + the back-merge rule this run must honor |

**After reading, state in one paragraph:** why `domain/risk/` must not import from
`state/`, and which single mechanism keeps the page's risk figure honest rather than
merely exact. If you cannot answer the second half, re-read item 4 §3.1.

---

## §1 — Ground truth

| Fact | Value |
| :--- | :--- |
| Branch | `claude/calculadora-riesgo` |
| Base | `origin/main` @ `35e43da` |
| PR target | **`main`** — product track (`git-workflow.md` §Two-track flow). This is NOT RFC work; it is not governed by an RFC and must not go to `develop` |
| Design commits | `b6a1ab4` (spec), `0c1ed52` (plan). No `emulador/` source touched yet |
| Expected baseline | **UNKNOWN. Measure it.** `origin/main` is ~400 commits behind `develop`; any test count you remember from a develop-based run is wrong here |

**First action, before any dispatch:** run all four gates raw from `emulador/`, on a clean
tree, and record the real numbers in the ledger. That output is the arithmetic origin for
every task's test-count progression.

```bash
cd emulador && npx tsc -p tsconfig.app.json --noEmit && npx tsc -p tsconfig.spec.json --noEmit && npm run lint && npx ng test --watch=false
```

Never pipe a gate through `| tail` or `| head` — it swallows the non-zero exit and a real
failure reads as a pass.

**Base-drift warning specific to this run.** Do not assume anything from RFC-014..019
exists on this base. `MarketState` is single-symbol, the mapper carries `utcOffset` in
some places, and `develop`-only modules are absent. Verified present on `35e43da`:
`state/trading/trading.models.ts` (with `contractSizeFor`/`lotsForRisk`),
`components/risk-slider.component.ts`, the `ui/` primitives, `app.routes.ts`, `app.html`.
Anything else, verify before depending on it.

---

## §2 — Roles and run mode

| Role | Who | Contract |
| :--- | :--- | :--- |
| **Orchestrator** | this session | Owns the ledger. Dispatches. Never implements. Never audits its own dispatch beyond a mechanical diff-scan |
| **Implementer** | `sdd-implementer` subagent | Executes exactly one brief. TDD. Scope-bounded. Task-scoped pathspec commit. Writes a report with deviations |
| **Auditor** | `branch-auditor` subagent (Opus) | **Re-runs all gates personally.** Implementer and orchestrator reports are claims, not evidence |

**Run mode: SEQUENTIAL with one batched review** (`decision-frameworks.md` §8; the ledger
header must record this).

| Task | Risk | Review | Justification |
| :--- | :--- | :--- | :--- |
| Task 1 | LOW | **Batch A** (post-Task 2) | Four pure functions, no DI, no I/O |
| Task 2 | **MEDIUM** | **Batch A** (post-Task 2) | The 0.01-floor warning is the correctness core of the feature |
| Task 3 | LOW | Final whole-branch audit only | Route + nav link; no logic |

**No wave parallelism, deliberately.** Task 2 consumes Task 1's module and Task 3 mounts
Task 2's page: the dependency chain is total. Three worktrees plus three `npm ci` runs to
parallelize nothing would cost more than the run itself. A run-mode change is a **recorded
decision**, never improvised.

---

## §3 — The dispatch loop

### Task 1 — pure module (`sdd-implementer`, SHORT brief)

`domain/risk/risk-calculator.ts` + its spec. The plan carries the full failing-test block;
the brief points at it rather than restating it.

The one thing the brief must state as prose, not code: **`pipSizeFor`'s evaluation order is
the whole task.** `XAUUSD` and `XAGUSD` are six-letter symbols, so a naive "6 letters ⇒
forex ⇒ 0.0001" rule assigns them pips that do not exist. Metals are discarded first —
exactly as `contractSizeFor` checks `XAU*`/`XAG*` before `/^[A-Z]{6}$/`. Pairs containing
`JPY` use pip `0.01`, not `0.0001`.

### Task 2 — page (`sdd-implementer`, LONG brief)

This is where the run can go wrong. The brief must carry, verbatim:

- **The composition rule.** `risk-calculator.ts` stays parameterized and importing
  **nothing** from `state/`; the *page* imports `contractSizeFor`/`lotsForRisk` and wires
  them. An implementer who "simplifies" by importing `state/` into `domain/risk/` has
  inverted the Dependency Rule and the task fails.
- **The prohibition, as a sentence:** *the only source of a lot figure is `lotsForRisk`.*
  No local sizing formula, anywhere, for any reason.
- **The 0.01-floor case with its numbers.** balance 100, risk 0.1 %, entry 40000, SL 39950,
  `contractSize` 1 → requested 0.10 USD, `lotsForRisk` returns 0.01, real risk 0.50 USD
  (5×). The warning must fire here **and must not fire** on the acceptance case
  (5000 / 1 % / 40000 / 39950 → 1.00 lot, 50 USD). A warning that always fires is not a
  warning.
- **The three honest states** (spec §3.1) — SL = entry, non-positive inputs, and the floor
  — render *instead of* a lot figure, never beside it.

### Checkpoint 1 (post-Task 2) — **GATE**

1. Four gates, raw.
2. **Batch A** — one `branch-auditor` dispatch covering Tasks 1 and 2 together. Zero
   Critical/High/Medium.
3. Ledger: two task entries with commit hashes, test-count progression, scope actually
   touched, deviations classified inert / requires-attention.

**PASS required before Task 3.** Task 3 exposes the page to users; routing to a page whose
arithmetic has not been audited is the wrong order.

### Task 3 — route, nav, branch close (`sdd-implementer`, SHORT brief)

Lazy `/calculadora` with `canActivate: [authGuard]` and **no `r2OnboardingGuard`** (the
calculator needs no datasets — same treatment as `/mercados` and `/sesiones`), placed
**before** the `{ path: '**' }` wildcard. Nav link after "Nueva sesión" in `app.html`.

### Final

1. Four gates + `npm run build`. Watch for NEW chunk types; the bundle-budget warning is
   known-accepted and Arrow/parquet-dominated — it is not a regression of this branch.
2. Invariant greps (§4).
3. Ledger: final gate evidence and every deviation.
4. **Whole-branch Opus audit.** PASS = zero Critical/High/Medium. Lows may be ruled no-fix
   **with written reasons** so they are not re-litigated (PHILOSOPHY §3.5).
5. PR to **`main`** via the GitHub MCP.
6. **Back-merge `main → develop`** after the merge (§7 item 8).

**Degraded-run fallback:** if the session cannot finish, ship **Task 1 + Task 2** with the
route omitted. The module and the page are independently correct and testable; an
unrouted page is dead code, not a defect. Task 3 then becomes a five-minute follow-up.
Record the split as a ledger decision.

---

## §4 — Task scope and acceptance

Authoritative boundaries live in the plan, Tasks 1–3. Each brief must restate:

1. **Files in scope** — exact paths from the plan's File Structure.
2. **Invariants that must hold**, each with the grep that checks it:
   - `grep -rn "from '.*state/" emulador/src/app/domain/risk/` → **zero** (Dependency Rule)
   - `grep -rn "lotsForRisk" emulador/src/app/pages/calculadora/` → the import and its call
     sites only; **no second sizing formula anywhere**
   - `grep -rn "Math.max(0.01" emulador/src/app/pages/calculadora/ emulador/src/app/domain/risk/`
     → **zero** (the floor belongs to `lotsForRisk`; re-implementing it is the duplication
     this run exists to prevent)
   - `grep -rn "spec-util" emulador/src/app --include=*.ts | grep -v "\.spec\.ts"` → zero
     (kernel inv. 7)
   - `git diff --stat origin/main -- emulador/package.json` → no dependency additions
3. **Tests to write first** — TDD order, from the plan's test block.
4. **Explicitly out of scope** — the futures mode in its entirety. No `FUTURES_CONTRACTS`,
   no `contractsForRisk`, no disabled tab, no placeholder. It is blocked on broker
   contract specs the project does not have; inventing multipliers would produce confident
   wrong sizing. It gets its own spec later.
5. **The STOP rule** — pre-existing specs are authority. A task that cannot proceed without
   editing a spec beyond TestBed providers **STOPS and reports**. No pre-declared
   exceptions exist in this run: it adds files and touches two, and should break nothing.

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
- `npm run lint` must report **0 problems**.
- `npm run format` before every commit; CI runs `format:check`.
- At final audit additionally: `npm run build`, plus the §4 invariant greps.
- Record the test count after every task; the progression must be arithmetically consistent
  with the §1 baseline.

**Fresh output is the only acceptable evidence.** "The gates passed" without pasted output
is not a claim the orchestrator may record.

---

## §6 — Operating principles

- **Context isolation.** Each implementer gets its brief and reads its own files. It does
  not receive this prompt, the other tasks' briefs, or the design conversation.
- **Spec-scoped.** Implementers do not fix adjacent problems they notice. They report them.
- **Deviation honesty** (PHILOSOPHY §5.6). Every departure from the plan goes in the
  ledger, classified **inert** or **requires-attention**. Silent deviation is the one
  unrecoverable failure mode — the auditor cannot check what it is not told about.
- **Pathspec commits.** `git commit <paths> -m "..."`. Never `git add -A` — the tree
  carries `.opencode/` and untracked ledgers that belong to other runs.
- **TDD.** Failing test first, every task.
- **Angular 21 syntax.** Consult the `context7` MCP for the in-use version's official docs
  before writing Signals / `computed` / standalone / new-control-flow code. Never rely on
  training-data recall for framework APIs.
- **Lockfile.** After ANY `npm install`, run `npm ci --dry-run` before committing it
  (npm 11.x prunes optional-dep entries; local stays green, CI fails EUSAGE).
- **Do not invent members.** The plan's code shapes are targets, not transcriptions —
  where they disagree with the tree, the tree wins and the report says so.
- **Protected paths** — never touch without explicit approval: `pipeline/**`, `.claude/`
  hooks / `settings.json` / `steering.md`, `CLAUDE.md`.
- **Language.** Spanish for the UI copy and the spec/plan; English for briefs, reports and
  the ledger (`CLAUDE.md` §Conventions).

---

## §7 — Definition of done → PR

1. **Tasks 1–3 green**, each with its own task-scoped commit and ledger entry.
2. **Four gates green** with fresh raw output; `npm run build` clean of new chunk types.
3. **The acceptance case passes as a test:** 5000 / 1 % / US30 40000 → 39950 = **1.00 lot**,
   50 USD, 50 points — resolved **through `lotsForRisk`**, never a local copy.
4. **The floor warning fires on the 5× case and stays silent on the acceptance case.**
5. **Invariant greps clean** (§4) — especially zero `state/` imports under `domain/risk/`.
6. **Ledger** carries every deviation and the final gate evidence.
7. **Whole-branch Opus audit PASS** — zero Critical/High/Medium; any Low ruled no-fix with
   written reasons.
8. **PR to `main`** via the GitHub MCP. Body: what/why, evidence (test counts before/after,
   gate output), and an explicit note that the futures mode is deferred to its own spec for
   lack of broker contract specs. Branch protection has no MCP/CLI path — if it blocks the
   merge, say so in the PR as a human dashboard task.
9. **Back-merge `main → develop`** immediately after the merge, tree clean, gates re-run
   there (`git-workflow.md` §Two-track flow). This branch touches no file that diverges
   between the two, so the merge should be clean; **a conflict means something landed
   outside the declared scope — stop and investigate.** This step is part of finishing the
   PR, not a separate chore, and RFC-020 must not be cut from `develop` until it is done.
