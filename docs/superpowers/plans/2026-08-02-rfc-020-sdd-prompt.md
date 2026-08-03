# RFC-020 — SDD Orchestration Prompt

> **Paste this whole document into a fresh session.** It is self-contained: it assumes no memory of
> the design session. You are the **orchestrator**. You do not implement, and you do not audit your
> own dispatches beyond mechanical diff-scans.
>
> Protocol: `docs/engineering/sdd-orchestration.md`. This prompt layers RFC-020-specific wave
> sequencing and risk-based review batching on top of it.

---

## §0 — BOOT

Read, in this order. Do not skip and do not reorder — later documents assume earlier ones.

| # | Document | Why |
| :-- | :--- | :--- |
| 1 | `CLAUDE.md` | Kernel: invariants 1-8, the four gates, git rules, conventions |
| 2 | `docs/engineering/PHILOSOPHY.md` | §3.1 authority hierarchy, §5.4-5.7 roles / risk / deviation / STOP rule |
| 3 | `docs/engineering/sdd-orchestration.md` | Run protocol, ledger, run modes, audit taxonomy |
| 4 | `docs/architecture/rfcs/020-lotaje-position-sizer.md` | **The spec.** §1 is the Design Review verdict (D.20.1-6); P1-P8; frozen decisions |
| 5 | `docs/superpowers/plans/2026-08-02-rfc-020-lotaje-position-sizer-implementation-plan.md` | **The plan.** §0 corrections C1-C5 are binding over the RFC's prose |
| 6 | `.superpowers/rfc-020/dev-log.md` | Decision rationale; run state if resuming |
| 7 | `docs/superpowers/specs/2026-08-02-position-sizer-product-design.md` | UX authority — read before dispatching any Layer-D task |
| 8 | `docs/engineering/testing.md` | `ng test` vs bare vitest, flake recovery — needed by every task |
| 9 | `docs/engineering/domain/data-pipeline.md` | Pipeline conventions — read only when dispatching B-1 |

Read 7 and 9 only when dispatching the tasks that need them. Do not preload.

**After reading, state in one paragraph:** which single task changes the emulator's sizing
behaviour, which task is gated on a spike and why, and what the parity proof V3 is. If you cannot,
re-read items 4 and 5.

---

## §1 — Ground truth

| Fact | Value |
| :--- | :--- |
| Branch | `claude/lotaje-v2-core` |
| Base | `origin/main` @ `ad80b9f` (merge of PR #53) |
| PR target | **`main`** — declared product-track exception (RFC §6.1). This deviates from `git-workflow.md`; it is the owner's decision and is already documented |
| Design commit | RFC + plan + this prompt + dev-log + the four `2026-08-02-*` specs. **No `emulador/` source touched** |
| Expected baseline | **78 files / 1046 tests** — measured on `ad80b9f`, not claimed. **Re-verify it yourself anyway.** |

**First action, before any dispatch:** run all four gates raw from `emulador/`, on a clean tree, and
record the real numbers in the ledger. That output is the arithmetic origin for every task's
test-count progression. If it does not match 1046, the ledger records the real number and the
discrepancy — it does not "correct" the plan.

```
cd emulador && npx tsc -p tsconfig.app.json --noEmit && npx tsc -p tsconfig.spec.json --noEmit && npm run lint && npx ng test --watch=false
```

**Never** pipe a gate through `| tail` or `| head` — it swallows the non-zero exit and a real
failure reads as a pass. **Never** `npx vitest run`: it always fails (no TestBed env); only
`ng test` bootstraps the environment.

---

## §2 — Roles and run mode

| Role | Who | Contract |
| :--- | :--- | :--- |
| **Orchestrator** | this session | Owns the ledger. Dispatches. Never implements. Never audits its own dispatch beyond a mechanical diff-scan |
| **Implementer** | `sdd-implementer` subagent | Executes exactly one brief. TDD. Scope-bounded. Task-scoped pathspec commit. Writes a report with deviations classified |
| **Auditor** | `branch-auditor` subagent | **Re-runs all gates personally.** Implementer and orchestrator reports are claims, not evidence |

**Run mode: WAVED with risk-based review batching** (`decision-frameworks.md` §8). The ledger header
must record this mode. Batching is permitted **only** where this document says so.

---

## §3 — Waves

### Wave 0 — Spike (no production code)

| Task | Risk | Review |
| :--- | :--- | :--- |
| **S-1** companion-window spike | NONE | Orchestrator reads the report; no audit |

Dispatch S-1 **first and in parallel with Wave 1** — it blocks nothing in Waves 1-2.

**Precondition:** none.
**Gates:** none (no production code, no commit to `emulador/`).
**Exit:** `.superpowers/rfc-020/spike-s1-report.md` exists and states **GO** or **NO-GO**, with the
exact browser/OS versions recorded.

**The verdict changes the plan, so record it in the ledger the moment it lands:**
- **GO** → D-1 builds the framework-free view; Wave 4 is in scope.
- **NO-GO** → D-1 is re-scoped to an Angular view reusing `[appInput]` / `ui-dropdown` / TestBed;
  **Wave 4 is cut from the run** and the RFC is amended to record it. `domain/sizing/` stays
  framework-free either way.

Do not let a NO-GO be treated as a delay. It is a scope decision and it must reach the ledger.

### Wave 1 — PARALLEL, risk LOW

| Task | Layer | Risk | Independence |
| :--- | :--- | :--- | :--- |
| **A-1** kernel move + re-export | A (domain) | LOW | Touches `domain/sizing`, `trading.models.ts`, one import line |
| **B-1** registry generator, inert | B (infra) | LOW | Touches `pipeline/` + new `domain/sizing` files |

**These two are genuinely independent** — A-1 owns `position-sizing.ts`, B-1 owns
`asset-registry*.ts`. Neither imports the other in this wave.

**Review batching: PERMITTED.** Both are mechanical with no behaviour change; audit them together
after both land. Justification for the batch is recorded in the ledger.

**Precondition:** baseline recorded.
**Gates per task:** all four from `emulador/`; B-1 additionally `python -m pytest -q`,
`ruff check .`, `ruff format --check .` from `pipeline/`.
**Wave exit:** four gates green on the combined tree; tests ≥ baseline; the boundary grep is empty:

```
grep -rnE "@angular/|\.\./\.\./state/|\.\./\.\./components/|domain/chart" emulador/src/app/domain/sizing --include=*.ts
```

### Wave 2 — SEQUENTIAL, risk HIGH

| Task | Layer | Risk | Review |
| :--- | :--- | :--- | :--- |
| **C-1** registry cutover | C (state) | **HIGH** | **Individual audit. No batching.** |

**This is the only point in the entire run that touches the emulator's sizing.** `contractSizeFor`
and `pipSizeFor` become registry-backed. Their consumers —
`trading.reducer.ts:86,107,154`, `selectors.ts:245`, `chart.component.ts:958,1126`,
`trade-panel.component.ts:75` — are **not edited**; that they keep compiling is part of the proof.

**Parity proof V3 is the gate.** The auditor verifies personally:

1. `trading.models.spec.ts`, `fill-engine.spec.ts`, `trading.reducer.spec.ts` and
   `calculadora-page.component.spec.ts` (459 LOC) all pass **unmodified**.
2. Every intentional delta has its own named test stating the reason.
3. The report answers the `modifyOrder` question (`trading.reducer.ts:154` re-sizes pending orders
   from `riskPct + contractSize`): can a changed contract size move a restored session's pendings?
   **Read it; do not assume.**

**STOP rule, hard:** if any pre-existing spec requires editing, that is a behaviour change.
The implementer stops and reports. It does not edit the spec (PHILOSOPHY §5.7).

**Precondition:** Wave 1 audited green.

### Wave 3 — SEQUENTIAL, risk HIGH

| Task | Layer | Risk | Review |
| :--- | :--- | :--- | :--- |
| **D-1** the view | D (UI) | **HIGH** | **Individual audit. No batching.** |

**Precondition:** Wave 2 audited green **and** S-1 verdict recorded.

**Dispatch order inside the task is mandatory and is the whole point:**

1. **D-1.0 — port the v1 specs first.** 459 LOC encoding the F1 (DOM decimal entry) and F3 (comma
   decimal / trailing junk) fixes. Port the assertions against the new view and **watch them fail**
   before writing any view code. Those two bug classes shipped past a green suite once, because
   tests drove signals via `.set()` and never crossed the DOM. Ported specs must exercise real
   `input` events.
2. **D-1.1 — the view** (three zones per the product design §3).
3. **D-1.2 — the thin host** and the removal of the v1 panels.

**The strip is the redesign:** removing `app-risk-slider` from this page and deleting "Desde lotes"
(`calculadora-page.component.html:147-185` plus `manualLotsText` / `manualLots` / `manualRiskUsd` /
`manualRiskPct` / `onManualLots` and their specs) is a deliberate deletion of shipped tested code.
It must appear in the report as such, never as an incidental diff.

**Gates:** all four **plus `npm run build`**, watching for new chunk types.

### Wave 4 — MIXED, risk LOW-MED

| Task | Layer | Risk | Review |
| :--- | :--- | :--- | :--- |
| **D-2** Zone 1 + tokens | D | LOW | Batched |
| **D-3** copy action | D | MED | Batched |
| **D-4** Ficha + `$/point` guard-rail | D | LOW | Batched |
| **D-5** focus / select-on-focus / `Esc` / steppers | D | MED | Batched |
| **C-2** persistence | C | LOW | Batched |

**Review batching: PERMITTED** — one audit for the wave. All five sit on top of machinery already
audited in Waves 1-3 and none changes sizing.

D-2…D-5 may run sequentially in one dispatch chain; **C-2 is independent** of them and may run in
parallel.

**Binding for this wave:** no `storage`-event listener (C4 / D.20.2); the reserved `v` field has
**zero read sites** and the audit verifies it stays unread; the unit suffix is a **label, not a
control** (C3 / D.20.3) — a click handler on it is an automatic finding.

### Wave 5 — SEQUENTIAL, risk HIGH, gated

| Task | Layer | Risk | Review |
| :--- | :--- | :--- | :--- |
| **D-6** window adapter | D | **HIGH** | **Individual audit** |
| **D-7** window-only shortcuts | D | MED | With D-6 |

**Precondition:** S-1 verdict = **GO**. On NO-GO this wave does not run and the RFC is amended.

The window adapter is an architecture boundary. The audit verifies: it is **never a route**
(a second bootstrap fires `ROOT_EFFECTS_INIT` → `AuthEffects.init$:24` → `SessionSyncEffects:50`, a
second LWW actor); teardown on `pagehide` removes every listener; the clipboard is called on the
**target window's** `navigator`; and the companion imports nothing from `state/*`, `domain/chart/*`.

---

## §4 — Ledger and reports

Ledger at `.superpowers/rfc-020/dev-log.md`. Append per wave; never overwrite.

Every implementer report must carry:

1. **Commit hash** (pathspec commit; never `git add -A`).
2. **Test-count progression** — exact before/after and the arithmetic. Baseline 1046.
3. **Raw gate output pasted**, unpiped.
4. **Files actually touched** vs. the brief's scope table.
5. **Every deviation, classified `inert` or `requires-attention`.** Silent deviation is the one
   unrecoverable failure mode — the auditor cannot check what it is not told about.

Per-task invariant re-check before reporting:

```
grep -rn "spec-util" emulador/src/app --include=*.ts | grep -v "\.spec\.ts"     → zero
git diff --stat ad80b9f -- emulador/package.json emulador/package-lock.json     → empty
grep -rnE "@angular/|\.\./\.\./state/|domain/chart" emulador/src/app/domain/sizing --include=*.ts → empty
```

---

## §5 — Standing rules

- **Pre-existing specs are authority.** Needing to edit one means behaviour changed = STOP + report.
- **"Nothing else."** Any file outside the brief's scope table = STOP + report.
- **Never** `npx vitest run`. **Never** pipe a gate. `npm run lint` = 0 problems.
- **No new runtime dependencies.** After any `npm install`, `npm ci --dry-run` before committing the
  lockfile (npm 11.x prunes optional-dep entries; local green, CI EUSAGE).
- Do not touch `.opencode/`, `.superpowers/calculadora/`, `.superpowers/rfc-018/`,
  `.superpowers/rfc-019/`, `docs/superpowers/plans/task-*`.
- **Do not push.** Branch finalization and the PR are the owner's call.
- Open questions Q1-Q5 (RFC §7.2) are **owner decisions**. If a task blocks on one, stop and ask —
  do not decide it inside a dispatch.
