# RFC-020 — Dev Log

**Run:** Lotaje (Position Sizer) v2 — design session
**Branch:** `claude/lotaje-v2-core` @ `ad80b9f` (= `origin/main`, merge of PR #53)
**Date opened:** 2026-08-02
**Language:** English (agent artifact)

This log records the **run**, not the product. Product decisions live in RFC-020.

---

## §1 — Session 1: Design Review + artifact generation

### 1.1 Verified ground truth (measured, not assumed)

| Fact | Command / file | Value |
| :--- | :--- | :--- |
| Branch and HEAD | `git rev-parse` | `claude/lotaje-v2-core` @ `ad80b9f` == `origin/main` |
| Test baseline | `npx ng test --watch=false` | **78 files / 1046 tests, all passing** |
| v1 page structure | `calculadora-page.component.html:13,100,147` | three `<section class="panel">` |
| v1 spec size | `wc -l` | 459 LOC (page) + 45 LOC (`risk-calculator.spec.ts`) |
| Kernel today | `domain/risk/risk-calculator.ts` | 44 LOC |
| Sizing functions | `trading.models.ts:190` / `:202` | `contractSizeFor` / `lotsForRisk` |
| Sizing consumers | grep | `trading.reducer.ts:86,107,154` · `selectors.ts:245` · `chart.component.ts:958,1126` · `trade-panel.component.ts:75` |
| Persistence precedent | `settings.reducer.ts:16,54,78` + `settings.effects.ts:12` | key + per-field guard + persist effect |
| JWT storage | `supabase.service.ts:14` | `persistSession: true` |
| Second-bootstrap actors | `auth.effects.ts:24` · `workspaces.effects.ts:54` · `session-sync.effects.ts:50` | `ROOT_EFFECTS_INIT` chain |
| Canonical symbol list | `fill_r2.py:54` · `update_r2.py:302` | `US30,NAS100,SP500,XAUUSD` |
| The four `2026-08-02-*` specs | `git ls-files --others` | **untracked**; absent from `origin/main` and every commit |

### 1.2 Design Review verdict

| ID | Verdict | One-line reason |
| :--- | :--- | :--- |
| **D.20.1** vanilla view | **AMEND** | Justified only by the second mount, which is spike-gated → spike moves to Wave 0; the view is conditional on it |
| **D.20.2** localStorage | **AMEND** | No encryption (proven); `storage`-event sync **out of scope** — machinery without a verified consumer |
| **D.20.3** unit toggle | **REJECT** | `pipSizeFor` → `null` for all four curated symbols; the toggle has no valid second state |
| **D.20.4** curated registry | **AMEND** | `nasdaq`/`sp500` are not MT5 symbol names here; read `HARVEST_SYMBOLS` instead |
| **D.20.5** git product-track | **KEEP, risk corrected** | Owner's call (PHILOSOPHY §3.1 level 1); its stated risk was understated by an order of magnitude |
| **D.20.6** UX P1-P8 | **KEEP except P7, P8** | P8 falls with D.20.3; P7 amended — restricting `Enter` to the window breaks the design's own metric |

### 1.3 Architecture decisions taken during the review

**A — The spike ordering was inverted, and that was the most consequential finding.**
The proposal put the companion-window spike in Wave 5, after the framework-free view was already
built. But the view's only justification is the second mount, and the second mount depends on a
question no authoritative source answers (clipboard inside a Document PiP window). Building the
expensive thing before pricing the option it serves is backwards. The spike is cheap, touches no
production code, and blocks nothing in Waves 1-2. It moved to Wave 0 with an explicit NO-GO branch
that re-scopes D-1 to an Angular view.

**B — D.20.3 was resolved by a code fact, not by a design argument.**
The preliminary decision asked us to choose between two toggle semantics (reinterpret vs. convert)
and to settle validation and persistence for each. Reading `pipSizeFor`
(`domain/risk/risk-calculator.ts:24`) against the curated set dissolved the question: `US30`,
`NAS100` and `SP500` are not six-letter symbols and `XAUUSD` starts with `XAU`, so **all four
resolve to `null` — points**. A control whose alternate state is invalid for the entire catalogue is
not a convenience; it is a one-click ×10, in the exact direction the product design names as
dangerous. Rejecting it removed three open sub-questions at once.

**C — The `storage` listener is machinery looking for a consumer.**
The repo listens to no `storage` event anywhere today. Whether one is needed depends on Q2 (are the
page and the companion open simultaneously?), which is unanswered. Per PHILOSOPHY §2.6 it is
reserved, not implemented — keeping untested machinery out of a HIGH-risk wave.

**D — The registry generator reads `HARVEST_SYMBOLS` rather than owning a second list.**
Beyond fixing the wrong symbol names, this makes registry coverage and R2 candle coverage identical
by construction. The two can never drift, because there is one list.

**E — Encryption was rejected with a proof, not a preference.**
`supabase.service.ts:14` sets `persistSession: true`, so the JWT already lives in this origin's
`localStorage`. Our key sits beside it: an XSS that reads ours already reads the token, and a
cipher key held in the same origin is stolen with the data. The absence of encryption is now
documented so it is not re-litigated.

### 1.4 Deviations from the brief given to this session

| # | Deviation | Class | Reason |
| :--- | :--- | :--- | :--- |
| 1 | **Step 0 (back-merge `main`→`develop`) NOT executed, NOT dispatched, NOT pushed** | **requires-attention** | The brief's premise is materially wrong — see §2. The authorised action was a routine 33-commit hygiene merge; the measured reality is a reunification of two histories with no recent common ancestor and a silent-data-loss failure mode. Escalated to the owner rather than executed |
| 2 | Preliminary decisions 1-4 and P7-P8 changed rather than adopted | inert | The brief commissioned a Design Review with final authority and instructed that artifacts reflect the verdict, not the premises |
| 3 | Wave numbering differs from the brief (spike moved 5 → 0) | inert | §1.3-A. Recorded in the plan as binding correction C1 |

---

## §2 — BLOCKER: the back-merge premise is wrong

**Status: not executed. Owner decision required.**

The brief framed Step 0 as routine hygiene — "develop is 33 commits behind main after PR #53" —
and pre-authorised a push to `origin/develop`. Measurement contradicts the framing:

| Measurement | Command | Result |
| :--- | :--- | :--- |
| Merge base | `git merge-base origin/develop origin/main` | `7b5e977` — **2026-06-30**, merge of PR #14 |
| Divergence | `git rev-list --left-right --count` | develop **+400** · main **+33** |
| Conflicts | `git merge-tree --write-tree` | **65 files**: **45 `add/add`**, 20 `content` |
| Base contains `chart-engine.ts`? | `git cat-file -e` | **No** |
| Content delta | `git diff --shortstat origin/develop origin/main -- emulador/src` | 267 files, +2 000, **−34 416** |
| RFCs on develop, absent from main | `git ls-tree` | **015, 016, 017, 018, 019** |

**What this means.** The two branches have not been merged since 2026-06-30, so git has no useful
common ancestor. 45 of the 65 conflicts are `add/add` — both branches independently created the
same file — including `chart-engine.ts`, `fill-engine.ts`, `session-sync.*` and their specs. There
is no base to three-way-merge against, so each of those 45 files is a manual decision about which
branch is authoritative across ~34 k lines of divergence.

**Why it was not delegated.** The failure mode is silent. Because the `.spec.ts` files sit in the
same conflict list as their implementations, taking `main`'s side consistently for a subsystem
deletes RFC-015..019 work **and its tests together** — leaving all four gates green. A test-count
drop would be the only signal, and the brief's Step 0 mandates no baseline comparison. Pushing that
to a shared branch is not recoverable by a normal revert once other work lands on top.

**Recommended path (owner's call, not taken here):**

1. Treat it as a **history reunification**, not a back-merge; give it its own run and ledger.
2. Record `origin/develop`'s test count **before** starting; it is the only mechanical detector of
   silently dropped work.
3. Resolve `add/add` conflicts by **subsystem**, not file-by-file: RFC-015..019 subsystems take
   develop's side wholesale; the 33 product commits (calculadora, server-time fix, R2 refresh) take
   main's side wholesale; only genuinely shared files (`CLAUDE.md`, `.gitignore`, `progress.md`,
   the docs) get line-level resolution. `progress.md` merges by append, never overwrite.
4. Gate on **test count ≥ develop's pre-merge count**, not merely on green gates.
5. Only then push.

**This does not block RFC-020.** The four artifacts are written on `claude/lotaje-v2-core`, cut from
`main`; nothing in this run depends on `develop`.

---

## §3 — Artifacts generated

| # | Path | Language |
| :-- | :--- | :--- |
| 1 | `docs/architecture/rfcs/020-lotaje-position-sizer.md` | Spanish |
| 2 | `docs/superpowers/plans/2026-08-02-rfc-020-lotaje-position-sizer-implementation-plan.md` | English |
| 3 | `docs/superpowers/plans/2026-08-02-rfc-020-sdd-prompt.md` | English |
| 4 | `.superpowers/rfc-020/dev-log.md` | English |

Committed alongside them: the four `docs/superpowers/specs/2026-08-02-*.md` source specs, which
were untracked. Without them the RFC would cite paths that exist in no commit.

**No `emulador/` source was touched in this session.**

---

## §4 — Owner queue

| # | Item | Type |
| :--- | :--- | :--- |
| **Q1** | Accept the Shared Kernel size discipline (math + instrument data only; no formatting, copy or view helpers), enforced by audit grep? | Decision — blocks Task A-1 |
| **Q2** | Are the page and the companion ever open **simultaneously**? If no, the `storage` listener is never built | Decision — blocks Wave 4 |
| **Q3** | Does MT5's volume field on Spanish Windows require a decimal comma? | Answered by spike S-1.c |
| **Q4** | **`develop` ↔ `main` reunification** (§2) — how and when. Not a mechanical back-merge | Decision — outside RFC-020 |
| **Q5** | Branch protection on `main` | **Human dashboard task** — no MCP/CLI path |
| **Q6** | On spike NO-GO, confirm the D-1 re-scope to an Angular view and the removal of Wave 4 from the RFC | Decision — contingent |

---

## §5 — Run state

| Field | Value |
| :--- | :--- |
| Phase | Design complete; implementation **not started** |
| Next action | Owner answers Q1-Q2, then dispatch Wave 0 (S-1) and Wave 1 (A-1, B-1) |
| Gates at close of session | Not re-run — no `emulador/` source changed. Baseline stands at 78 files / 1046 tests |
| Push | **None.** Local commit only |

---

## §6 — Session 2: owner rulings (2026-08-03)

**Append-only.** This section **supersedes §5's "Next action" row**; §1-§5 stand as written and are
not edited. The rulings below are level-1 authority (PHILOSOPHY §3.1) and close the owner queue
opened in §4.

### 6.1 Verdict and run state accepted

The owner accepted **D.20.1 – D.20.6** as written and confirmed that **not executing the back-merge
was correct**. Nothing is pushed to `develop` in this run. Commit `24dd48d` stands as the design
commit.

### 6.2 Rulings

| # | Ruling | Effect on the run |
| :--- | :--- | :--- |
| **Q1** | **ACCEPTED.** Shared Kernel size discipline binds: *math and instrument data only — no formatting, no user-facing copy, no view helpers*, enforced by audit grep | **Task A-1 is unblocked.** The discipline is now a standing invariant for `domain/sizing/`, checked in every task's pre-report invariant sweep, not only in A-1 |
| **Q2** | **NO.** The page and the companion are **never used simultaneously**; the companion exists only to copy | The `storage`-event listener is **not built**, and its **reservation is withdrawn** (§6.3). Wave 4 / Task C-2 is persist-on-change + read-on-mount, full stop |
| **Q4** | **DELEGATED.** `develop` ↔ `main` reunification is a real task with its own ledger, designed by a **separate Opus agent in a separate run**. Target: reunified once RFC-020 lands | **Explicitly out of scope for this run and for any RFC-020 dispatch.** No agent working RFC-020 touches `develop` |
| **Q5** | **HUMAN.** Branch protection on `main` — the owner does it in the GitHub dashboard | Out of scope. No MCP/CLI path exists; do not attempt |
| **Q6** | **CONTINGENT, pre-approved.** On S-1 = NO-GO the owner accepts the D-1 re-scope to an Angular view and the removal of Wave 4 from the RFC | The orchestrator does **not** need to stop and ask on NO-GO. It records the verdict in the ledger, re-scopes D-1, cuts Wave 4, and continues |

**Q4 — the delegated brief, as ruled** (recorded verbatim so the other run inherits it):
per-subsystem resolution — RFC-015..019 subsystems take **develop**'s side wholesale; the 33 product
commits take **main**'s side wholesale; `docs/`, `CLAUDE.md` and `progress.md` resolve at line level,
with `progress.md` merged **by append, never overwrite**. Gate: `develop`'s pre-merge test count
**plus** four green gates.

### 6.3 Reservation withdrawn — and the two that survive

Q2's answer retires a reservation. Precision matters here, because D.20.2 carried **three**
distinct reserved items and only one is affected:

| Reserved item | Origin | Status after §6.2 |
| :--- | :--- | :--- |
| `storage`-event cross-surface sync | D.20.2, pending Q2 | **WITHDRAWN.** Not reserved, not implemented, no field, no interface. If it is ever wanted it re-enters as its own decision with its own rationale — it is no longer a dormant seam anyone may "finish" |
| `v` schema-version field on `emulador.calculadora` | D.20.2, for future payload migration | **STANDS.** Zero read sites; the audit verifies it stays unread (PHILOSOPHY §2.6) |
| Account profiles / presets schema | RFC §7.1 item 8 | **STANDS.** Zero read sites |

A future agent reading "reserved" in RFC §1.2 must apply this table: the sync is gone, the `v` field
and the profiles schema are not.

### 6.4 Documentation drift created by these rulings

Recorded rather than silently fixed — the artifacts were committed at `24dd48d` and still phrase
these as open:

| Artifact | Stale wording | Correct reading after §6.2 |
| :--- | :--- | :--- |
| RFC §1.2 (D.20.2) | *"queda reservada, no implementada"* (the `storage` sync) | Withdrawn, not reserved (§6.3) |
| RFC §7.2 | Q1/Q2/Q4/Q5 listed as open | Answered; only Q3 (spike) and Q6 (contingent, pre-approved) remain |
| Plan §0 C4 | *"reserved with zero read sites until Q2 is answered"* | Q2 answered; the listener is cut |
| SDD prompt §5 | *"Open questions Q1-Q5 … If a task blocks on one, stop and ask"* | Only Q3 remains, and S-1 answers it |

**This ledger section is the authority on all four points.** Aligning the artifact wording is a
documentation-only follow-up, offered to the owner and not performed unasked.

---

## §7 — Run state (supersedes §5)

| Field | Value |
| :--- | :--- |
| Phase | Design complete and **owner-ratified**; implementation not started |
| Owner queue | **Closed** except Q3 (answered by spike S-1.c) and Q6 (contingent, pre-approved) |
| Next action | Dispatch **Wave 0 (S-1)** and **Wave 1 (A-1, B-1)** in parallel. No further owner input required to start |
| Blocked | Nothing |
| Out of scope for every RFC-020 dispatch | `develop` (Q4, delegated run) · branch protection (Q5, human) |
| Gates | Not re-run; no `emulador/` source changed. Baseline stands at **78 files / 1046 tests** |
| Push | **None.** Local commits only |

---

## §8 — Session 3: implementation run

**Append-only.** §1-§7 stand as written. This section is the ledger of the implementation run and
supersedes §7's "Next action" row.

### 8.0 Run header

| Field | Value |
| :--- | :--- |
| Plan | `docs/superpowers/plans/2026-08-02-rfc-020-lotaje-position-sizer-implementation-plan.md` (§0 C1-C5 binding) |
| RFC | `docs/architecture/rfcs/020-lotaje-position-sizer.md` (§1 verdict D.20.1-6 normative) |
| SDD prompt | `docs/superpowers/plans/2026-08-02-rfc-020-sdd-prompt.md` |
| Branch | `claude/lotaje-v2-core` |
| Base | `origin/main` @ `ad80b9f` |
| HEAD at run open | `775a865` (design commits only; no `emulador/` source touched) |
| PR target | **`main`** — declared product-track exception (RFC §6.1 / D.20.5, owner decision, PHILOSOPHY §3.1 level 1) |
| **Run mode** | **WAVED with risk-based review batching** (`decision-frameworks.md` §8) — see 8.0.1 |
| Ledger | this file (`.superpowers/rfc-020/dev-log.md`), appended per wave |
| Out of scope for every dispatch | `develop` (Q4, delegated run) · branch protection on `main` (Q5, human dashboard) · pushing (owner's call) |

#### 8.0.1 Run mode and where batching is permitted

Not uniform. Review effort is budgeted by risk (PHILOSOPHY §5.5), and each batch is justified here
rather than improvised:

| Wave | Tasks | Risk | Review |
| :--- | :--- | :--- | :--- |
| 0 | S-1 spike | NONE | Orchestrator reads the report. No audit — no production code, no commit to `emulador/` |
| 1 | A-1, B-1 | LOW | **Batched (permitted).** Both are mechanical with no behaviour change, and they are file-disjoint: A-1 owns `position-sizing.ts`, B-1 owns `asset-registry*.ts`; neither imports the other in this wave. One audit after both land |
| 2 | C-1 | **HIGH** | **Individual audit. No batching.** The only task in the run that changes the emulator's sizing |
| 3 | D-1 | **HIGH** | **Individual audit. No batching.** Replaces shipped, tested UI |
| 4 | D-2…D-5, C-2 | LOW-MED | **Batched (permitted).** All five sit on machinery already audited in Waves 1-3; none changes sizing |
| 5 | D-6, D-7 | **HIGH** | **Individual audit.** Gated on S-1 = GO; architecture boundary (second document, no second bootstrap) |

Plus one **final whole-branch audit** gating the PR, which is never skipped.

### 8.1 Baseline — measured, not claimed

Run first, before any dispatch, on a clean tree at `775a865`, raw from `emulador/`, no pipes:

| Gate | Command | Result |
| :--- | :--- | :--- |
| tsc app | `npx tsc -p tsconfig.app.json --noEmit` | exit **0**, no output |
| tsc spec | `npx tsc -p tsconfig.spec.json --noEmit` | exit **0**, no output |
| lint | `npm run lint` | exit **0** — `All files pass linting.` |
| tests | `npx ng test --watch=false` | exit **0** — `Test Files 78 passed (78)` · `Tests 1046 passed (1046)` |

**Baseline = 78 files / 1046 tests.** This **matches** the plan's expected figure, so no discrepancy
to record. It is the arithmetic origin for every task's test-count progression.

Working tree at run open: clean except four untracked directories that are explicitly off-limits to
every dispatch (`.opencode/`, `.superpowers/calculadora/`, `.superpowers/rfc-018/`,
`.superpowers/rfc-019/`).

### 8.2 Orchestrator deviation — Wave 1 runs sequentially, not in parallel

**Class: requires-attention** (a documented departure from the SDD prompt's wave table, decided by
the orchestrator, not by any implementer).

The prompt marks Wave 1 **PARALLEL** on the grounds that A-1 and B-1 are independent. They are
independent in **files** — A-1 owns `position-sizing.ts`, B-1 owns `asset-registry*.ts`, neither
imports the other — but they are **not independent in the build sandbox**, and that is what decides
how they can be run:

1. Both must run `npx ng test --watch=false` in the same `emulador/` directory. The Angular
   unit-test builder runs vitest with `isolate: false` and shares `.angular/cache` and
   `node_modules/.vite`; `docs/engineering/testing.md` records the optimizeDeps cache race as the
   mechanism behind the PR #23 flakes. Two concurrent runs invite exactly that race.
2. Test-count arithmetic would stop being attributable. Each agent would observe the other's specs
   landing mid-run, and that arithmetic is the auditor's primary detector of silently dropped or
   skipped specs (`testing.md` §Evidence discipline).

**Resolution:** S-1 still ran fully in parallel (it touches no tree and makes no commit). A-1 ran to
completion, then B-1 was dispatched with A-1's post-task count as its starting number. **The batched
Wave 1 review is unaffected** — both tasks are still audited together, which is what the batching
permission in 8.0.1 actually grants.

**Cost:** wall-clock only. **Benefit:** attributable arithmetic and no cache race in the wave whose
whole claim is "no behaviour change".

### 8.3 Task A-1 — kernel move + pure re-export

| Field | Value |
| :--- | :--- |
| Status | **COMPLETE**, orchestrator diff-scan passed |
| Commit | `2d943cd` — `refactor(rfc-020): move sizing kernel to domain/sizing, re-export from trading.models (D.20.1)` |
| Tests | **1046 → 1053** (+7, all in the new `position-sizing.spec.ts`: 4 for `lotsForRiskDistance`, 1 for the negative-balance/negative-riskPct guard, 2 equivalence). File count unchanged at 78 — one spec moved out, one moved in |
| Gates | tsc app 0 · tsc spec 0 · lint `All files pass linting` · `ng test` 78 files / 1053 tests, 0 failures |
| Report | `.superpowers/rfc-020/task-a1-report.md` (untracked per `.superpowers/rfc-020/.gitignore`) |

**Scope check (orchestrator, mechanical).** `git show --stat 2d943cd` = exactly 6 files, all inside
the brief's scope table: `domain/sizing/position-sizing.{ts,spec.ts}` added,
`domain/risk/risk-calculator.{ts,spec.ts}` deleted, `trading.models.ts` (−35/+9),
`calculadora-page.component.ts` (±4).

**The parity property holds, and it was verified mechanically, not taken on report.**
`git diff ad80b9f..2d943cd --name-only` over `trading.reducer.ts`, `selectors.ts`,
`chart.component.ts`, `trade-panel.component.ts` and `trading.models.spec.ts` returns **nothing** —
none of the five consumers was touched, and all of them still compile and pass. `trading.models.ts`
now ends in a single line:

```ts
export { contractSizeFor, lotsForRisk } from '../../domain/sizing/position-sizing';
```

That is plan correction **C5** satisfied literally.

**The money-bug guard was kept, as instructed.** `lotsForRisk` retains its own
`!(balance > 0) || !(riskPct > 0)` checks rather than delegating to a `riskUsd > 0` test on the new
primitive. Not equivalent: a negative balance with a negative risk % yields a *positive* `riskUsd`,
so the delegation would have converted today's `0` into a real lot figure. There is now a named spec
for exactly that input.

**Deviations declared by the implementer — both verified inert:**

| # | Deviation | Class | Orchestrator finding |
| :--- | :--- | :--- | :--- |
| D1 | Also updated one doc-comment string in `calculadora-page.component.ts` (`domain/risk/risk-calculator.ts` → `domain/sizing/position-sizing.ts`), where the brief said "import path only" | **inert** | **Caused by the brief, not by the implementer.** The brief's own invariant `grep -rn "domain/risk" emulador/src` demands zero hits, which a stale doc-comment would have failed. Prose only, in a file already in scope |
| D2 | The invariant grep `grep -rn "spec-util" … \| grep -v "\.spec\.ts"` is **not** empty | **inert, pre-existing** | **Confirmed a false positive in the grep, not a violation.** Both hits are comment prose at `state/layout/layout-invariants.ts:10,12` describing the pure-production-twin pattern; the only real `spec-util` *imports* are in `.spec.ts` files, which is permitted. The file is untouched by this task and predates the branch. Invariant 7 holds |

**Grep refinement carried forward to every later task in this run.** The `spec-util` detector as
written cannot distinguish an import from a comment naming the file, so it will keep firing on
`layout-invariants.ts`. The precise form is:

```
grep -rnE "from '.*spec-util'|require\(.*spec-util" emulador/src/app --include=*.ts | grep -v "\.spec\.ts"
```

Recorded here so the final auditor does not re-litigate D2, and so no future implementer either
"fixes" untouched pre-existing prose or waves through a real import (PHILOSOPHY §3.5).

**FINAL-AUDIT ATTENTION:** none for this task. Largest diff is `position-sizing.ts` at 110 added
lines, all relocated or the new primitive; no private-API use; no new dependency
(`git diff --stat ad80b9f..2d943cd -- emulador/package.json emulador/package-lock.json` = empty).

### 8.4 Task B-1 — registry generator, inert

| Field | Value |
| :--- | :--- |
| Status | **COMPLETE**, orchestrator diff-scan passed |
| Commit | `33970ff` — `feat(rfc-020): generate the MT5-sourced asset registry, inert (D.20.4)` |
| Tests | **1053 → 1064** (+11, all in the new `asset-registry.spec.ts`). Files 78 → 79. Pipeline: 121 passed |
| Gates | tsc app 0 · tsc spec 0 · lint 0 problems · `ng test` 79 files / 1064 tests · `pytest` 121 passed · `ruff check` clean · `ruff format --check` clean |
| Report | `.superpowers/rfc-020/task-b1-report.md` |

**Scope check (orchestrator, mechanical).** `git show --stat 33970ff` = exactly 5 files, all inside
the brief's scope table, **760 insertions, 0 deletions** — consistent with a purely additive, inert
task. `pipeline/tests/conftest.py`, `pipeline/mt5_common.py`, `position-sizing.ts` and
`trading.models.ts` are all absent from the diff: the shared `FakeMT5` double was **not** widened
(`symbol_info` was monkeypatched from inside the new test file, as the brief required), and A-1's
kernel was not pre-emptively rewired.

**The registry holds real broker data.** Generated read-only from the live terminal
(`initialize`/`symbol_info`/`account_info`/`terminal_info`/`shutdown` only; no trading call, no GUI
interaction). Provenance header: `mt5:Five Percent Online Ltd@2026-08-03`.

| Symbol | contractSize | tickSize | volumeStep | volumeMin | digits | currency |
| :--- | ---: | ---: | ---: | ---: | ---: | :--- |
| `NAS100` | 1 | 0.01 | 0.01 | 0.01 | 2 | USD |
| `SP500` | 1 | 0.01 | 0.01 | 0.01 | 2 | USD |
| `US30` | 1 | 0.01 | 0.01 | 0.01 | 2 | USD |
| `XAUUSD` | 100 | 0.01 | 0.01 | 0.01 | 2 | USD |

#### 8.4.1 The finding that governs Task C-1: **the cutover has zero deltas**

This is the most consequential fact produced by Wave 1, and it **contradicts the plan's
expectation**, so it is recorded before C-1 is briefed rather than discovered inside it.

The plan (Task C-1 §4) anticipates deltas: *"Expected deltas: six-letter non-FX instruments
(`BTCUSD`: 100000 → registry/heuristic-correct value) and any curated symbol whose MT5 value differs
from the heuristic."* Measured against the real registry, **neither class exists:**

1. **No curated symbol differs.** Today's heuristic gives `US30`/`NAS100`/`SP500` → `1` (not
   six letters) and `XAUUSD` → `100` (`XAU*`). MT5 reports exactly `1`, `1`, `1`, `100`. The
   name-shape heuristic was *right* for all four.
2. **No uncurated symbol changes either.** `resolveAsset` falls through generated → manual →
   heuristic, `MANUAL_ASSETS` is empty, and `heuristicContractSize`/`heuristicPipSize` reproduce
   `contractSizeFor`/`pipSizeFor` exactly, evaluation order included. So `BTCUSD` still resolves to
   `100000` — **through the heuristic branch, unchanged.**

**Therefore C-1 is a pure refactor with no behaviour change for any input**, and parity proof V3
should come out clean with **zero** named-delta tests. That is the safest possible outcome for the
run's highest-risk task, but it must not be mistaken for the task having been skipped.

**Binding instruction carried into the C-1 brief:** C-1 **must not manufacture** the delta the plan
expected. Adding `BTCUSD` (or anything else) to `MANUAL_ASSETS`, or altering the heuristic to make
the registry "win", would be an unrequested change to the emulator's sizing inside the one task
nobody wants surprises in. C-1 measures, finds zero, and reports zero.

#### 8.4.2 Open finding for the owner — the `BTCUSD` defect is **not** fixed by this RFC

RFC §2.1 motivates the work partly with `contractSizeFor('BTCUSD') === 100000`, *"un error de cinco
órdenes de magnitud en una herramienta de dinero real."* Per 8.4.1, that defect **survives RFC-020
unchanged**, because the registry is curated (RFC §1.4 chose *curado, no barrido completo*) and
`BTCUSD` is not in `HARVEST_SYMBOLS`.

This is **not** a contradiction to resolve inside a dispatch — the curated design is deliberate and
frozen, and `MANUAL_ASSETS` exists precisely as the seam for it (empty by design today). It is
recorded here as an **owner-facing finding**: if correcting `BTCUSD` and similar six-letter non-FX
symbols is wanted, it is a one-entry `MANUAL_ASSETS` addition with its own tests, and it belongs to
a decision the owner makes, not to this run's scope.

**Deviations declared — all four verified inert:**

| # | Deviation | Class | Orchestrator finding |
| :--- | :--- | :--- | :--- |
| D1 | First draft typed `AssetSource` as a union keyed off `typeof GENERATED_SOURCE` and annotated the generated constant `: string`; lint rejected it (`no-inferrable-types`) | **inert** | Root-caused rather than patched — the annotation existed to protect a union that had already been widened to `string`. Correct resolution; final gates green |
| D2 | `currency` sourced from MT5's `currency_profit` (not `currency_base`/`currency_margin`) | **inert** | Sound: `currency_profit` is the currency P&L is denominated in, which is what a USD-account risk tool needs (RFC §7.1 no-goal 8). Documented in code |
| D3 | `broker_name()` prefers `account_info().company` over `terminal_info().company` | **inert** | The two genuinely differ on this machine (`Five Percent Online Ltd` vs `WSFunded Ltd.`) — a prop-firm/white-label split. Preferring the account's broker is right: provenance must identify **whose** contract sizes these are. Discrepancy documented in the docstring |
| D4 | `AssetSpec` nullability pinned: `tickSize`/`volumeStep`/`volumeMin`/`digits`/`currency` are nullable and `null` whenever `source === 'heuristic'` | **inert** | Correct modelling — a bare name yields only name-derived facts. Makes "we don't actually know this" unrepresentable as a fake number |

**FINAL-AUDIT ATTENTION (2 items):**

1. **`asset-registry.ts:69-85` duplicates the heuristic** rather than importing
   `contractSizeFor`/`pipSizeFor`. Deliberate, and correctly reasoned: C-1 rewires
   `position-sizing.ts` to call `resolveAsset`, so an import here becomes a **circular dependency**
   the moment C-1 lands. The declared tripwire against drift is an equivalence spec in
   `asset-registry.spec.ts` that *does* import `position-sizing.ts` (safe in a spec, no runtime
   edge). **Auditor: verify that equivalence spec actually exists, covers both functions, and would
   fail if either copy drifted** — the duplication is only acceptable while the tripwire is real.
2. **`pipeline/export_symbols.py` is the largest single new file (257 LOC)** and it talks to a live
   trading terminal. Verify by reading that it calls **only** `initialize`, `symbol_info`,
   `account_info`, `terminal_info`, `shutdown` — no trading API, no order function, no
   `symbol_select` side effect beyond what the pipeline already does.

### 8.5 Task S-1 — companion-window spike: **verdict GO**

| Field | Value |
| :--- | :--- |
| Status | **COMPLETE.** No production code, no commit — `git status` byte-identical to session start |
| **Verdict** | **GO**, on **`documentPictureInPicture`**. Both mechanisms pass the decisive probes; PiP is the one to build |
| Report | `.superpowers/rfc-020/spike-s1-report.md` (the authority; this is a summary) |
| Browsers | Edge `151.0.4129.59` and Brave `151.0.7922.71` |

**Consequences, applied now (owner ruling Q6 pre-approved both branches):**

- **D-1 builds the framework-free view.** No re-scope to Angular.
- **Wave 4 stays in scope.** **Wave 5 (D-6/D-7) is unlocked.**
- `domain/sizing/` stays framework-free either way — already true after A-1/B-1.

**What was proven.** In two real Chromium browsers, a same-origin companion opened from a **trusted
click** hosted a mounted framework-free view **and** a live same-origin iframe, and wrote `2.22` to
the **Windows** clipboard from its own realm — verified by reading the OS clipboard back through
PowerShell after every write, against a unique sentinel per attempt. That closes S-1.b and S-1.d,
which are the only two gating probes.

#### 8.5.1 Binding input to Task D-6 — the target-window navigator is a hard requirement

The plan's line *"Clipboard is called on the **target window's** `navigator`"* is now a **measured
requirement, not a stylistic preference.** Calling the **opener's** navigator from inside the
companion fails with:

```
NotAllowedError: Failed to execute 'writeText' on 'Clipboard': Document is not focused.
```

because once the companion holds focus, the opener document does not. This is a latent bug that
**passes casual manual testing and fails in real use**. D-6's audit must check it explicitly.

#### 8.5.2 Why PiP beats `window.open` — a Win32 z-order fact

Both mechanisms pass S-1.b and S-1.d identically; **S-1.a separates them.** The PiP window carries
`WS_EX_TOPMOST` (`0x00200108`); MT5's maximized main window does not (`0x00000100`). Win32
z-banding therefore guarantees PiP floats over MT5 **regardless of focus**. The `window.open` popup
shares MT5's z-band and disappears behind it on the first click on MT5 — which is exactly the
moment the tool is being used. PiP also survives the opener tab going `visibilityState: hidden`.

**Sizing measurement for D-6:** PiP floors width at **240 CSS px**; a requested 380×520 is granted
exactly. But see the undetermined list — PiP may remember a user-resized size and override the
request, so **D-6 must not assume the requested size is what it gets**.

#### 8.5.3 A tooling trap, recorded so it is not repeated

**The in-app Browser pane would have produced a false NO-GO.** It is Electron
(`Claude/1.24012.9 Chrome/148 Electron/42.7.0`), where `documentPictureInPicture` throws
`InvalidStateError: Internal error: no window` and `window.open` returns `null`. Those are
**embedder host-policy facts, not web-platform facts.** The spike correctly discarded them and drove
real browsers over CDP instead, hit-testing every click with `elementFromPoint` before dispatch.

Had it reported the Electron result as the platform's answer, this run would have cut Wave 4 and
Wave 5 and re-scoped D-1 on a measurement artifact. Recorded per PHILOSOPHY §4.5: the incident
becomes a named rule — **the Browser pane is not a conformance oracle for window/clipboard APIs.**

#### 8.5.4 S-1.c (owner question Q3) — **undetermined, and it may have two answers**

MT5 was **not** touched, by instruction. The report carries a numbered ~30-second owner probe under
`## Owner probe — S-1.c (Q3)`.

Indicative-only evidence, explicitly not a conclusion: the **running** terminal (WSFunded) has no
`Language=` key and inherits Windows' `en-US`, which points to a **dot**; but a second terminal on
this machine (FTMO) has `Language=Spanish` in its `terminal.ini`, so **the accepted separator may
differ per terminal.**

**This gates only D-3's copy payload in Wave 4.** It gates nothing in Waves 1-3 and it did not gate
this GO.

**Seven items are listed as explicitly undetermined** in the report rather than assumed — including
that all measurements used **throwaway browser profiles**, so a site-level clipboard block in the
owner's real profile is unverified. **Auditor and D-6 implementer: read that list before relying on
any spike number.**

### 8.6 Decision **D-21** — the companion's contract line is removed

| Field | Value |
| :--- | :--- |
| **Decision** | The **contract line** under the lot figure — `US30 · 1 $/punto por lote · $2.22/punto` — is **removed from the product**, and with it the term `$/punto`. Zone 3 holds the lot figure, its label and the copy affordance. Nothing else |
| **Authority** | **Owner, 2026-08-03.** PHILOSOPHY §3.1 level 1 — explicit user direction, which outranks the frozen product design |
| **Classification** | **requires-attention** |
| **Type** | **A render change, not a logic change** (see 8.6.3) |
| **Status of D.20** | **Unchanged.** D-21 does not reopen the Design Review verdict D.20.1-6, is not a STOP, and is not optional. It is documentation of a decision already taken |

**Why it is classified requires-attention, not inert.** It removes a mitigation the design named
in writing. Product design §4.1 justified defaulting to Method B (distance) by three mitigations
against a mistyped magnitude, and the position's `$/point` was the second and the only *new* one.
Two survive — the dollar risk visible and constant in Zone 1, and the unit as a suffix inside the
field. The trade-off in §13 #1 is therefore now carried with **less cover than the design assumed**,
which is a real change to the product's safety argument and must not be filed as cosmetic. The
owner's reversal clause on that trade-off ("one magnitude error in real use and the default flips")
stands unchanged and becomes the primary remaining guard.

#### 8.6.1 Propagation — what was edited, in the owner's order

| # | File | Edit |
| :--- | :--- | :--- |
| 1 | `.superpowers/rfc-020/dev-log.md` | This section (§8.6) — the decision record |
| 2 | product design §3.3 | Third bullet (the contract line) deleted, replaced by the D-21 note; the term `$/punto` gone from the zone |
| 3 | product design §6.1 | Level 5 removed — the attention hierarchy is now **four** levels: figure → dollar risk → stop field → context |
| 4 | product design §9.1 | Token-mapping row *Línea de contrato* removed |
| 5 | product design §13 #1 | The `$/punto` mitigation struck; three mitigations → two, named explicitly |
| 6 | plan, Task D-4 | Heading and body: `Contract line adds the resulting position's $/point` removed. **The Ficha del activo is intact and still opens from the chip** |

**Four further edits in the product design, declared — consistency propagation, not new decisions.**
The owner's instruction was to leave the three documents *consistent*; these four are the places
where the removed line is still drawn or counted, and leaving them would have had a future Layer-D
implementer build the thing D-21 deletes:

| # | Location | Edit | Class |
| :--- | :--- | :--- | :--- |
| a | §3 ASCII diagram | The rendered line `US30 · 1 $/punto por lote · $2.22/punto` removed from Zone 3 | inert |
| b | §4.1 mitigation list | Item 2 (the position's `$/point`) removed; list renumbered to two, with the reason written | **requires-attention** — this is the §13 #1 edit's factual source; the owner enumerated exactly the two survivors |
| c | §4.4 "Qué se calcula solo" | `el valor por punto de la posición` removed — it is no longer rendered anywhere | inert |
| d | §5.1 disclosure level 0 | `la línea de contrato` removed; "**Seis cosas**" → "**Cinco cosas**" | inert |

#### 8.6.2 Residual drift, recorded rather than silently fixed

Two documents the owner did not name still describe the removed line. Following the §6.4 precedent
in this ledger, they are recorded here — **this section is the authority** — and not edited unasked:

| Artifact | Stale wording | Correct reading after D-21 |
| :--- | :--- | :--- |
| `docs/superpowers/plans/2026-08-02-rfc-020-sdd-prompt.md` §3, Wave 4 table | `D-4 Ficha + $/point guard-rail` | `D-4 Ficha del activo`. The plan (§0-binding) and this ledger govern task content |
| `docs/superpowers/specs/2026-08-02-position-sizer-architecture-validation.md:444` | V2's mitigation lists a *"visible contract line"* | The registry with declared provenance and the min-lot/rounding warning remain V2's mitigations; the contract line does not |

Both are one-line fixes, offered to the owner, not performed.

#### 8.6.3 Why it is a render change — and the one place it does subtract a test

**It changes no arithmetic.** No kernel function, no registry lookup, no reducer, no selector is
touched. Concretely:

- **Parity proof V3 (Wave 2 / C-1) is unaffected.** Its four specs — `trading.models.spec.ts`,
  `fill-engine.spec.ts`, `trading.reducer.spec.ts`, `calculadora-page.component.spec.ts` — assert
  sizing behaviour and v1 page behaviour, and C-1 renders nothing. They still must pass
  **unmodified**, exactly as before.
- **No unmodified spec changes because of D-21**, and the STOP rule (PHILOSOPHY §5.7) is untouched:
  no task may edit a pre-existing spec to accommodate it.
- Waves 1 and 2 are entirely unaffected. D-21 first bites in **Wave 3 (D-1)**.

**The one interaction, stated so no later dispatch trips over it.** The *v1* page renders its own
contract-size line (`calculadora-page.component.html:139,141`) and two v1 assertions pin its text
(`calculadora-page.component.spec.ts:175,187` — `'1 $/punto por lote'` and
`'100,000 $/punto por lote'`). D-1 already deletes and rewrites that page and ports its specs as a
**declared** rewrite. Under D-21 those two assertions are **not ported**, because the surface they
describe no longer exists. That is a subtraction inside D-1's already-declared deletion scope — it
is **not** an edit of an unmodified spec, and it must appear in D-1's report as a declared deletion
alongside "Desde lotes" and `app-risk-slider`.

---

## §9 — Run state: **PAUSED after Wave 1 implementation** (2026-08-03)

Paused by the owner mid-run, at the usage limit. Nothing is half-finished: Waves 0 and 1 are
complete and committed, and the run stops on a clean tree at a natural boundary.

| Field | Value |
| :--- | :--- |
| Waves complete | **0 (S-1, GO)** and **1 (A-1, B-1)** — implementation only |
| Waves outstanding | Wave 1 **audit** (not yet dispatched), then 2, 3, 4, 5, final audit, PR |
| HEAD | `31786b9` |
| Tests | **1064** (79 files). Baseline was 1046 |
| Gates | Green as of B-1's run. **Not re-run by an auditor yet — that is the next action** |
| Working tree | Clean except the four permanently off-limits untracked dirs |
| Push | **None.** All commits local, as instructed |
| Owner queue | Q1/Q2/Q4/Q5 closed (§6.2). **Q3 open** — S-1.c owner probe, gates only D-3. Q6 resolved moot by the GO |

**Commits on the branch from this run, in order:**

| Hash | What |
| :--- | :--- |
| `f0be21b` | ledger opened, baseline measured |
| `2d943cd` | **A-1** — kernel move + pure re-export |
| `995a3b9` | ledger: A-1 + the Wave 1 sequencing deviation |
| `33970ff` | **B-1** — MT5-sourced asset registry, inert |
| `31786b9` | ledger: B-1 + the zero-delta finding |

**The next action is a `branch-auditor` over Wave 1 (commits `2d943cd` + `33970ff`).** It must
re-run all gates personally — no report in this ledger is evidence (PHILOSOPHY §1.1, §5.4).

**Resumption brief:** `docs/superpowers/plans/2026-08-03-rfc-020-resume-prompt.md`. It is written to
be pasted into a cold session with no memory of this one.

### 9.1 Two findings awaiting an owner decision — neither blocks resumption

1. **`BTCUSD` is not fixed by this RFC** (§8.4.2). RFC §2.1 cites it as motivation, but the curated
   registry does not cover it and the heuristic fallback returns the same `100000` as before.
   Fixing it is a one-entry `MANUAL_ASSETS` addition with tests — an owner decision, not this run's
   scope.
2. **S-1.c / Q3 may differ per terminal** (§8.5.4). Two MT5 terminals on this machine disagree on
   configured language. The 30-second probe is in the spike report; it gates only D-3.

---

## §10 — Session 4: resume (2026-08-03). **Supersedes §9's run state**

**Append-only.** §1-§9 stand as written.

### 10.1 One correction to the resume brief, before anything else

`docs/superpowers/plans/2026-08-03-rfc-020-resume-prompt.md` §1 records **HEAD at pause = `31786b9`**.
Measured on resume, HEAD was **`72a21a7`** — the commit that recorded the S-1 GO verdict (§8.5) and
wrote the resume brief itself. The brief could not name the commit that contained it. Benign, but
recorded rather than glossed: the resume brief's own §1 table is off by one commit, and §9's commit
list omits `72a21a7` for the same reason.

### 10.2 Owner decision **D-21** applied

Registered at **§8.6** and propagated across the three documents the owner named, plus four declared
consistency edits inside the product design and two residual-drift items left unfixed on the record.
Commit **`0249683`** — `docs(rfc-020): record and propagate owner decision D-21 (remove the contract
line)`, **3 files, +105/−21, no `emulador/` or `pipeline/` source touched.**

D-21 is a **render change, not a logic change** (§8.6.3): parity proof V3 is unaffected, no
unmodified spec changes because of it, and it first bites in Wave 3 (D-1). It does **not** reopen the
D.20 verdict.

### 10.3 Tree re-verified on resume — measured, not inherited

The resume brief's instruction was to trust nothing. Four gates, raw, from `emulador/`, chained so a
non-zero exit stops the chain, **no pipes**:

```
npx tsc -p tsconfig.app.json --noEmit && npx tsc -p tsconfig.spec.json --noEmit && npm run lint && npx ng test --watch=false
```

| Gate | Result |
| :--- | :--- |
| tsc app | exit **0**, no output |
| tsc spec | exit **0**, no output |
| lint | exit **0** — `All files pass linting.` |
| tests | `Test Files 79 passed (79)` · `Tests 1064 passed (1064)` · duration 24.42 s |

**Whole chain exit code 0. 79 files / 1064 tests — exactly the figure §9 claimed**, so the paused
state was accurate and the arithmetic origin 1046 → 1053 → 1064 still stands for the auditor to
re-derive.

*Ordering note, for honesty:* the gate run was started before the D-21 commit landed and finished
after it. That changes nothing — all three D-21 files are documentation (`docs/superpowers/**`,
`.superpowers/**`); none is an input to `tsc`, `ng test` or `ng lint`. The evidence is valid for the
tree at `0249683`.

### 10.4 Next action — Wave 1 audit dispatched

`branch-auditor` dispatched over **`2d943cd` (A-1) + `33970ff` (B-1)**, batched per §8.0.1. Brief at
`.superpowers/rfc-020/wave1-audit-brief.md`, report to `.superpowers/rfc-020/wave1-audit-report.md`.
It re-runs all seven gates (four TS + `pytest`/`ruff check`/`ruff format --check`) personally and is
pointed at the three FINAL-AUDIT ATTENTION items from §8.3/§8.4, plus one addition by the
orchestrator: **it must independently verify the zero-delta finding of §8.4.1**, because that finding
is about to be handed to C-1 as a binding instruction and it contradicts what the plan anticipated.
Verifying it after C-1 acts on it would be the wrong order.

**C-1 is not dispatched until that audit comes back green.**

### 10.5 Wave 1 audit — **NOT PASS** (0 Critical / 0 High / **1 Medium** / 4 Low)

Report: `.superpowers/rfc-020/wave1-audit-report.md`. The auditor re-ran all seven gates personally
and left the tree byte-identical (every mutation reverted, nothing pushed, MT5 never touched).

| Gate | Auditor's own result |
| :--- | :--- |
| tsc app / tsc spec | no output, exit 0 (both) |
| lint | `All files pass linting.` exit 0 |
| `ng test` | `Test Files 79 passed (79)` · `Tests 1064 passed (1064)`, exit 0, **no skipped/todo line** |
| `pytest` / `ruff check` / `ruff format --check` | `121 passed` · `All checks passed!` · `14 files already formatted` |
| `npm run build` (extra, not required this wave) | `Initial total 611.87 kB`, **no new chunk types**, exit 0 |

**The arithmetic was re-derived, not accepted.** The auditor first validated the identity it would
rely on — `it.each` / `test(` / `it.skip` / `it.only` all zero at both ends, so `it()` count ≡ test
count — then measured 1046 → 1053 (+7) → 1064 (+11) by counting at each commit. The +7 is
`position-sizing.spec.ts` 15 `it()` **minus** the deleted `risk-calculator.spec.ts` 8. It also
`diff`ed the relocated assertions old-vs-new: **zero differences**. And
`git diff --name-status ad80b9f..HEAD -- '*.spec.ts'` = one `D`, two `A`, **zero `M`** — no
pre-existing spec was edited anywhere on the branch.

#### 10.5.1 **F-1 (Medium)** — the declared tripwire has a hole. §8.4's ATTENTION #1 claim was false

`asset-registry.spec.ts:71` vs `asset-registry.ts:70`. The equivalence loop's symbols are
`['EURUSD','GBPJPY','USDJPY','BTCUSD','XAGUSD','ABC']` — **none is an `XAU*` symbol**, and `XAUUSD`
is in `GENERATED_ASSETS`, so it never reaches the heuristic. Mutating
`if (symbolUpper.startsWith('XAU')) return 100;` → `return 999;` leaves **the full suite green,
79 files / 1064 tests, exit 0.**

Seven of the eight heuristic branches *are* load-bearing (the order swap goes red with
`expected 100000 to be 5000`; dropping `XAU` from `heuristicPipSize` goes red). This one is not.

**This directly falsifies what §8.4 asserted** — that the equivalence spec "would fail if either copy
drifted." It would not, for gold's contract size. Since the duplication was accepted *only* on the
strength of that tripwire, and since **C-1's brief was about to inherit the claim**, this is exactly
the finding the audit existed to catch. Failure scenario, in the auditor's words: a legitimate
correction to gold's contract size lands in `contractSizeFor` (whose value specs pin it in three
files), `asset-registry.ts:70` keeps the stale `100`, and after C-1 wires `contractSizeFor` →
`resolveAsset` every non-curated `XAU*` symbol silently mis-sizes.

**Remedy: one string.** `'XAUEUR'` added to that array — six letters *and* `XAU`-prefixed, so it
reaches the heuristic and pins both the value and the evaluation order. Dispatched as a fix task;
brief at `.superpowers/rfc-020/task-w1fix-brief.md`, red-before-green mandatory.

#### 10.5.2 The four Lows — all **ruled no-fix with written reasons** (PHILOSOPHY §3.5)

Recorded so they are not re-litigated at the final audit:

| # | Finding | Why no-fix |
| :--- | :--- | :--- |
| **F-2** | `lotsForRisk` diverges from the pre-move function when `balance × riskPct / 100` underflows to `0` (`1e-300, 1e-25` → old `0.01`, new `0`; 7 other vectors identical) | Unreachable (needs ≲5e-322) and **the new value is the safer one**. "Fixing" it would restore a path that returns a tradeable lot for a zero risk budget |
| **F-3** | `export_symbols.py:205` emits unquoted keys; `HARVEST_SYMBOLS=XAUUSD.m` would render invalid TS | Fails loudly at the next tsc gate, never produces a wrong number, dev-host script |
| **F-4** | A-1 translated the relocated doc comments Spanish→English without declaring it (ledger declares only D1/D2) | Behaviour-free; reverting yields a mixed-language module. **Ledger addendum, not a code change** — recorded here as A-1 deviation **D3** |
| **F-5** | This ledger carried 4 of B-1's 8 implementer-declared deviations | D6 was promoted to an attention item and D7 is the plan's own design; **D5** (`pipSize` computed independently of `source`) and **D8** (read-only probe run) appeared in no row. The auditor re-judged both independently: **correct and within permission**. Recorded now |

#### 10.5.3 The three attention items, and the zero-delta claim

- **§3.1 tripwire — PARTIAL** (that is F-1). Both copies were verified **token-identical**
  independently of any test, by normalised body extraction: `IDENTICAL: True` for both functions,
  evaluation order included. So there is no drift *today*; what is missing is the detector for
  tomorrow.
- **§3.2 `export_symbols.py` — CLEAN.** Never run, MT5 never touched. Full API surface is
  `initialize`, `symbol_info`, `account_info`, `terminal_info`, `shutdown`, `last_error`; the
  negative grep for `order_send|order_check|positions_|symbol_select|history_*|TRADE_ACTION` is
  empty. Raises `SimboloNoEncontrado` on `None`. Reads `HARVEST_SYMBOLS` with `fill_r2.py:54`'s exact
  default (C2 satisfied). **Strongest evidence:** the auditor re-rendered the artifact from
  `render_ts` against a stub `MetaTrader5` and got a **byte-identical, order-independent** match to
  the committed file — it is genuinely this generator's output, unedited by hand.
- **§3.3 A-1 parity — HOLDS.** All five consumer paths were confirmed to **exist at `ad80b9f`**, so
  the empty diff is a real negative rather than five typos. The money-bug guard was proven
  non-vacuous by mutation: deleting `!(balance > 0) || !(riskPct > 0)` turns the named spec red
  (`expected 0.1 to be +0`).
- **Zero-delta claim (§8.4.1) — CONFIRMED on all four sub-claims.** Generated values match the
  heuristic four-for-four; `MANUAL_ASSETS` empty; fall-through generated → manual → heuristic with
  `source` set on all three paths; all four curated resolve `pipSize === null`, and that assertion is
  live (killed by mutation). **C-1's binding "measure, find zero, report zero" instruction stands.**

Also verified clean: kernel-boundary grep, the precise `spec-util` grep (Trap 1 not re-litigated), no
dependency diff, no factory selectors, `syncPriceScale` still zero production reads, kernel size
discipline in all three new files, and — a check the brief did not ask for — the registry is
**absent from the built bundle** (`grep -rl "Five Percent Online\|resolveAsset" emulador/dist` → no
match), so B-1's "inert" is true at bundle level, not merely in source.

#### 10.5.4 Two carry-forwards into C-1's brief

Both come from the auditor and neither is a defect in Wave 1:

1. **`SP500` is pinned by no spec anywhere.** Post-cutover only 3 of the 4 curated contract sizes are
   regression-pinned. C-1 should close that gap in `position-sizing.spec.ts`, which is already in its
   scope table.
2. **The equivalence spec becomes tautological once `contractSizeFor` *is* `resolveAsset`.** After
   C-1 the tripwire stops being a tripwire, so value-pinning specs — not the equivalence loop — must
   carry the anti-drift weight from that point on. C-1's brief must say so explicitly.

#### 10.5.5 Two corrections the auditor made to the orchestrator's brief

Recorded because the brief was the orchestrator's work, not a dispatch's: the non-source commit list
omitted `24dd48d`, `0301caf` and `775a865` (all three verified source-free by the auditor), and the
ledger-only commit `be54d8a` landed mid-audit, so HEAD moved from `0249683` to `be54d8a` during the
run. Neither changes the verdict; both are the kind of drift that makes a scope-scan unreliable if
left unstated.

### 10.6 F-1 fix — the tripwire is now load-bearing on gold

| Field | Value |
| :--- | :--- |
| Status | **COMPLETE**, orchestrator diff-scan passed |
| Commit | `7d83b1a` — `test(rfc-020): cover the XAU contract-size branch in the heuristic equivalence tripwire (F-1)` |
| Diff | **1 file, +1/−1.** `asset-registry.spec.ts:71` — `'XAUEUR'` appended to the equivalence loop's symbol array. Nothing else |
| Tests | **1064 → 1064**, unchanged — the symbol is one more iteration inside the existing `it()`, not a new test case |
| Gates | tsc app 0 · tsc spec 0 · lint `All files pass linting.` · `ng test` 79 files / 1064 tests, exit 0 |
| Report | `.superpowers/rfc-020/task-w1fix-report.md` |

**Scope check (orchestrator, mechanical).** `git show --stat 7d83b1a` = exactly one file, and the
diff is the single array line. **`asset-registry.ts` is absent from the commit** — the production
heuristic was not touched, which is the whole point: the fix adds a detector, it does not change
behaviour.

**Red-before-green, which is what makes this a closure rather than a gesture.** With `'XAUEUR'` in
place, the implementer re-applied the auditor's exact mutation (`asset-registry.ts:70`,
`return 100;` → `return 999;`) and the suite failed **inside the equivalence spec** —
`asset-registry.spec.ts:73`, `AssertionError: expected 999 to be 100`, 1063/1064 otherwise green.
Before the fix that same mutation left all 1064 green. The mutation was then reverted and `git diff`
on `asset-registry.ts` confirmed empty (no output, exit 0) before the commit; it was never staged.

**Why `'XAUEUR'` and not a new value-assertion spec.** It is six letters *and* `XAU`-prefixed, so it
is absent from `GENERATED_ASSETS`, reaches the heuristic, and pins **both** the value (`100`) and the
evaluation order (metal before the six-letter regex) in one symbol — a naive six-letter-first
implementation returns `100000` and fails. It closes the hole inside the existing tripwire instead of
adding a parallel assertion that could itself drift.

**Deviations declared — two, both inert:** the pre-existing uncommitted `dev-log.md` edit and the
four off-limits untracked dirs already in the shared tree (untouched, and excluded automatically by
the pathspec commit); and the mutate/revert cycle on `asset-registry.ts`, which the brief itself
mandated as the evidence requirement and which left the file byte-identical.

**F-1 is closed.** A focused re-audit over `7d83b1a` follows; the whole-branch audit at the end of
the run is still never skipped.

### 10.7 Wave 1 re-audit — **PASS ("Ship it")**. Wave 2 unblocked

Same auditor, resumed with its own Wave 1 context intact so it would re-run **its own** mutation with
its own methodology rather than a fresh agent's approximation. Scoped to the fix; the full Wave 1
sweep was not redone, because it had already cleared and the whole-branch audit still runs at the
end. `wave1-audit-report.md` §0 is marked superseded, the original NOT PASS is preserved unedited as
the record, and §11 carries the re-audit.

**0 Critical / 0 High / 0 Medium / 4 Low** — the same four Lows, unchanged and still no-fix.

| Gate (auditor's own run, clean tree, pre-mutation) | Result |
| :--- | :--- |
| tsc app / tsc spec | exit 0 (both) |
| lint | `All files pass linting.` exit 0 |
| `ng test` | `Test Files 79 passed (79)` · `Tests 1064 passed (1064)`, exit 0, no `skipped`/`todo` |

Pipeline gates correctly skipped — `git show --name-only 7d83b1a` is one `.spec.ts`, no Python.

**The mutation now goes red, and red in the right place.** Re-running the identical mutation
(`asset-registry.ts:70`, `return 100;` → `return 999;`):

```
FAIL  src/app/domain/sizing/asset-registry.spec.ts > resolveAsset — símbolo fuera del registro cae
a la heurística > reproduce pipSizeFor/contractSizeFor EXACTAMENTE, orden de evaluación incluido
AssertionError: expected 999 to be 100 // Object.is equality
 ❯ src/app/domain/sizing/asset-registry.spec.ts:73:33
Test Files  1 failed | 78 passed (79)   ·   Tests  1 failed | 1063 passed (1064)   ·   exit 1
```

Against `1064 passed`, exit 0 for the same mutation before the fix. It fails on the `contractSize`
assertion at `:73:33` — the intended detector, nothing incidental. Reverted; `git diff` on
`asset-registry.ts` empty, line 70 reads `return 100;`.

**Nothing was weakened, and the coverage claim is now true as written.** The diff is a pure append —
all six original symbols retained over a byte-identical implementation
(`git diff --stat 33970ff..HEAD -- asset-registry.ts` is **empty**). The evaluation-order mutation
still goes red with the same two failures. **Tripwire branch coverage is 8 of 8**, so ledger §8.4
ATTENTION #1's assertion is finally accurate rather than aspirational. `XAUEUR` was confirmed absent
from `GENERATED_ASSETS`, so the fix is not vacuous. Spec integrity re-confirmed:
`git diff --name-status ad80b9f..HEAD -- '*.spec.ts'` → one `D`, two `A`, **zero `M`**.

Tree at close: `git diff` and `git diff --cached` empty, only the four off-limits untracked dirs in
`git status`. Nothing pushed, `develop` untouched, MT5 never contacted.

**Wave 1 is complete and audited. Wave 2 (C-1) is unblocked.**

---

## §11 — Wave 2: Task C-1, the registry cutover

### 11.1 C-1 — implementation complete, orchestrator diff-scan passed

| Field | Value |
| :--- | :--- |
| Status | **COMPLETE**, awaiting individual audit (HIGH risk, no batching) |
| Commit | `25a0ec2` — `feat(rfc-020): back contractSizeFor/pipSizeFor with the asset registry (D.20.4)` |
| Diff | **exactly 2 files**, +88/−23: `position-sizing.ts` (+16/−23) and `position-sizing.spec.ts` (+72) |
| Tests | **1064 → 1072** (+8, matching the 8 new literal pins). Files unchanged at 79 |
| Gates | tsc app 0 · tsc spec 0 · lint 0 problems · `ng test` 79 files / 1072 tests |
| Report | `.superpowers/rfc-020/task-c1-report.md` |

**The cutover is exactly the delegation, and nothing else.** Both bodies collapse to one line each —
`return resolveAsset(symbol).pipSize;` and `return resolveAsset(symbol).contractSize;` — with
**signatures unchanged**. The import direction is the safe one: `position-sizing.ts` imports
`./asset-registry`, never the reverse, which is precisely the inversion the Wave 1 duplication exists
to permit.

**Parity proof V3 holds, verified mechanically rather than by report.**
`git diff --name-status ad80b9f..HEAD -- '*.spec.ts'` returns one `D`
(`risk-calculator.spec.ts`, A-1's relocation), two `A` (`asset-registry.spec.ts`,
`position-sizing.spec.ts`) and **zero `M`**. No pre-existing spec was edited anywhere on the branch,
so the four V3 gate specs — `trading.models.spec.ts`, `calculadora-page.component.spec.ts`,
`fill-engine.spec.ts`, `trading.reducer.spec.ts` — are byte-identical to `ad80b9f` and passing.

**Zero deltas, and the way it was proven is the interesting part.** The implementer wrote the eight
literal pins **first, against the un-cut-over code** (1072 green), then landed the cutover and the
same 1072 stayed green. *The count not moving a second time is the proof.* `MANUAL_ASSETS` untouched
and empty; the heuristic untouched; `contractSizeFor('BTCUSD') === 100000` still pinned explicitly as
documenting the known defect rather than approving it. **The prohibition in §8.4.1 was respected: C-1
measured, found zero, reported zero.**

### 11.2 The `modifyOrder` finding — the mechanism exists; this commit gives it nothing to fire on

The plan demanded this be **read**, not assumed. Read at `trading.reducer.ts:153-165`:
`contractSize` is destructured **straight from the dispatched action**, which traces through
`state/selectors.ts:245-247` (`selectContractSize`) to a **live `contractSizeFor(currentAsset)` call
at edit time** — it is never a persisted field.

So the answer is more precise than "no": **the mechanism by which a changed contract size could move
a restored session's pending order does exist**, and it would fire on the next edit rather than on
restore. It is inert here **only because this commit changes no contract size for any symbol**. That
distinction matters for any future task that does change one — it is not protected by persistence.
`Position` objects carry their own fixed `lots`/`riskUsd` and are unaffected either way.

### 11.3 Deviations declared — two inert, two requires-attention

| # | Deviation | Class | Orchestrator note |
| :--- | :--- | :--- | :--- |
| D1/D2 | Spec-file-only import additions | **inert** | Within the brief's own instructions |
| **D3** | `asset-registry.spec.ts:65-76`'s equivalence spec is **now tautological** — it compares `resolveAsset(...).contractSize` to `contractSizeFor(...)`, which *is* that expression after the cutover | **requires-attention** | **Predicted by the Wave 1 audit (§10.5.4) and deliberately left unedited** — the file is outside C-1's scope table. The eight new literal pins in `position-sizing.spec.ts` take over its anti-drift role. **The auditor rules on whether it is retired or re-pointed at literals** |
| **D4** | A now-stale `INERT` doc comment in `asset-registry.ts` (the registry is no longer inert — `position-sizing.ts` imports it) | **requires-attention** | Correctly flagged rather than fixed: `asset-registry.ts` is outside C-1's scope. A one-line prose correction for the auditor to rule on |

Both requires-attention items are the same shape and the right shape: a scope-bounded implementer
found two things that need changing in a file it was told not to touch, and **reported them instead
of touching it**.

### 11.4 C-1 audit — **PASS ("Ship it")**, 0 Critical / 0 High / 0 Medium / **3 Low**

Report: `.superpowers/rfc-020/c1-audit-report.md`. Tree left exactly as found.

| Gate (auditor's own run) | Result |
| :--- | :--- |
| tsc app / tsc spec | exit 0 (both) |
| lint | `All files pass linting.` exit 0 |
| `ng test` | `Test Files 79 passed (79)` · `Tests 1072 passed (1072)`, exit 0 |
| `npm run build` | `Initial total 612.62 kB`, exit 0 — **no circular-dependency warning of any kind**, no new chunk types; the budget warning is the only warning in the output |

Arithmetic re-derived independently: 1046 → 1064 → **1072** (+8 = the eight new `it()`), 79 files
throughout, no drop anywhere.

#### 11.4.1 The zero-delta claim survived a real attack — **126 symbols, 0 divergences**

This is the evidence that matters, and it is stronger than what §11.1 originally rested on. The
auditor extracted `contractSizeFor` from `ad80b9f:trading.models.ts` and `pipSizeFor` from
`ad80b9f:domain/risk/risk-calculator.ts` **by brace-matching the committed blobs** (verbatim, no
transcription), transpiled both old and new with the repo's own `tsc --strict`, and compared with
`Object.is` over a **126-symbol corpus**: the four curated symbols, 27 case variants, the heuristic
classes including `EURXAU` / `XAU` / `XAUU` / `JPYUSD` / `AJPYBC`, boundary shapes from `''` through
`ABCDEFGH` / `EURUSDX` / `123456`, **14 broker-suffixed forms** (`XAUUSD.m`, `.raw`, `#`, `_i`,
`-ECN`, `US30.cash`…), prototype-key probes (`constructor`, `__proto__`, `toString`), and accented
and full-width symbols.

**`CORPUS SIZE: 126` · `DIVERGENCES: 0`.**

**The harness was proven falsifiable rather than assumed so:** injecting `XAUUSD` generated
`contractSize` 100 → 1 in a scratchpad copy produced `DIVERGENCES: 5`, through every case variant.
And the cutover is **not** cosmetic — the four curated symbols now resolve with
`source = "mt5:Five Percent Online Ltd@2026-08-03"`, not `'heuristic'`. Zero delta here is a genuine
**equality of two different code paths**, not one path renamed.

**Structural checks:** no import cycle (`position-sizing → asset-registry → asset-registry.generated`,
acyclic; `asset-registry.ts` names `position-sizing.ts` only in comment prose). **RFC §4.3 satisfied
in the artifact, not just the source** — `grep -rl "Five Percent Online" emulador/dist` resolves to
`chunk-PE4VUUMO.js`, an **initial** chunk, so the registry ships at load time and the synchronous
reducer/selector contract holds. Grep for `async|await|import(|Promise|indexedDB|fetch(` over
non-spec `domain/sizing` → empty. `asset-registry*.ts` byte-unchanged since `7d83b1a`;
`MANUAL_ASSETS` still `{}` — **no manufactured delta**.

**All eight pins are load-bearing**, each killed by at least one mutation: XAU→999 kills XAUEUR ·
XAG→999 kills XAGUSD · six-letter→999 kills EURUSD, GBPJPY **and** BTCUSD · JPY→0.0001 kills the
GBPJPY pip pin · fallback→999 kills ABC · generated SP500→999 kills the SP500 pin (**closing the
Wave 1 gap**) · removing SP500 from `GENERATED_ASSETS` kills the curated-source pin.

#### 11.4.2 A correction to §11.1's own reasoning, accepted

§11.1 proved zero deltas by **TDD ordering** — pins written first, green before and after. The
auditor's objection is correct and worth keeping: **the pins and the cutover landed in the same
commit**, so that ordering cannot be verified from history and therefore rests on the implementer's
word. The 126-symbol differential reaches the same conclusion **from git blobs alone and is
reproducible by anyone**. *That* is the citable proof of zero deltas; the TDD ordering is corroboration,
not evidence.

#### 11.4.3 A correction to §11.2 — positions are **not** unaffected

§11.2 recorded the implementer's finding that `Position` objects "carry their own fixed `lots`/`riskUsd`
and are unaffected." The auditor verified the `modifyOrder` reasoning as **correct** —
`trading.reducer.ts:140` destructures `contractSize` from the action; dispatchers pass
`view().contractSize` / `ctx.contractSize` → `selectTradePanelView` (`:645-649`) / `selectFillContext`
(`:592-607`) → `selectContractSize` (`:245-247`) → live `contractSizeFor(symbol ?? '')`; neither
`PendingOrder` nor `Position` carries a `contractSize` field — and then sharpened it twice:

1. **The trigger is narrower than "the next edit."** `trading.reducer.ts:153` guards on
   `entryPrice !== undefined || sl !== undefined`, so a **TP-only** edit (dispatched at
   `trade-panel:228` *with* `contractSize`) does **not** re-size the pending order.
2. **"Positions unaffected" is true of *sizing* but false of *valuation*** — recorded as audit
   finding **C1-L3**. `contractSize` is a live input to `floatingPnl` (`selectors.ts:636-639`) and to
   `profitOf` / `closeTrade` (`fill-engine.ts:18-31`) via `selectFillContext` →
   `replay.effects.ts:174-179`, `closePosition`, `endSession`. **A future contract-size change
   re-values every open position immediately**, not merely pending orders on edit.

**§11.2 is superseded on this point by this subsection.** The operational consequence is worth
stating plainly for whoever regenerates the registry: **a registry regeneration changes displayed and
realised P&L without changing a line of code.**

#### 11.4.4 Rulings on D3 and D4 — both **fix**, not no-fix

| ID | Finding | Ruling |
| :--- | :--- | :--- |
| **C1-L1** (D3) | The equivalence `it()` at `asset-registry.spec.ts:65-76` is fully neutralised. **Measured:** mutating `XAU` 100→999 now leaves that file **11 passed (11)**; one commit earlier the identical mutation turned it red at `:73:33` | **RETIRE it.** The drift it guarded is now **impossible by construction** — C-1 deleted the second copy — and the eight proven pins lose no coverage. Decisive factor: its own comment at `:66-70` still calls it *«el tripwire que lo detecta»*, so it is **false reassurance**, which is worse than absence |
| **C1-L2** (D4) | `asset-registry.ts:10-12` — *"INERT: nothing in the app imports `resolveAsset` yet…"*. Both clauses are now false, and the registry ships in the initial bundle | **CORRECT it**, and remove the "tripwire" reference at `:98-100` along with the retirement above |

**Orchestrator decision, recorded rather than improvised.** Both are Lows and could be ruled no-fix.
They are being **fixed** instead, for the reason the calculadora run used in the same position: a Low
that *defeats a purpose the artifact states outright* is not a convenience item. This one is sharper
than that — F-1 was a Medium precisely because a tripwire that cannot fail is dangerous, and leaving
a **fully** dead tripwire whose comment advertises it as live would re-create that exact hazard one
commit after closing it. Cost is a few lines; the alternative is a documented lie in the codebase.

Between the auditor's two options — retire, or re-point the loop at a literal table — **retire**.
Re-pointing would duplicate coverage the eight pins already provide through the same code path, and
`decision-frameworks` favours not maintaining two assertions of one fact.

**This will move the test count 1072 → 1071.** A *falling* count is normally the signal that a spec
was silently dropped, so it is declared here in advance, with the measurement that justifies it: the
retired `it()` is provably incapable of failing.

**Also to fix in the same pass:** the auditor found the same tautology inside the **eighth pin's
second assertion** (M6 left it green while SP500 was wrong by 999×). Its *first* assertion is what M7
kills, so the pin survives — but the dead half should go with the rest.

---

## §12 — C-1 audit cleanup, two owner decisions, and the interruption

**Append-only.** §1-§11 stand as written.

### 12.1 C1-L1 / C1-L2 closed — `04f6db9`

| Field | Value |
| :--- | :--- |
| Commit | `04f6db9` — `chore(rfc-020): retire the neutralised drift tripwire and correct the registry's stale prose (C1-L1, C1-L2)` |
| Diff | **3 files, +11/−25** |
| Tests | **1072 → 1071**, exactly the drop pre-declared in §11.4.4 |
| Gates | tsc app 0 · tsc spec 0 · lint `All files pass linting` · `ng test` 79 files / 1071 tests |

Three edits, all as ruled: the dead equivalence `it()` at `asset-registry.spec.ts:65-76` retired
along with its now-unused `contractSizeFor`/`pipSizeFor` import; the stale `INERT` paragraph at
`asset-registry.ts:10-12` replaced with `LIVE since RFC-020 Task C-1`, stating that the file is now
on the **load-time path of the emulator's sizing**; and the tautological half of the eighth pin
(`position-sizing.spec.ts:174`) deleted, its live half (`source` ≠ `'heuristic'`) kept.

**Orchestrator diff-scan.** Both `asset-registry.ts` hunks sit entirely inside `/** */` blocks —
**comment-only, no executable line moved**, `return 100;` intact.
`git diff --name-status ad80b9f..HEAD -- '*.spec.ts'` still returns one `D`, two `A`, **zero `M`**.

**The falling count was proven safe rather than asserted safe.** A dropping test count is the primary
detector of silently removed coverage, so the brief required a mutation: with the retirement in
place, mutating `asset-registry.ts:70` (`XAU` → `999`) **still goes red** — now at
`position-sizing.spec.ts:134`, the `XAUEUR` pin, `1 failed | 1070 passed (1071)`. A dead detector was
removed; the live one that replaced it fires.

### 12.2 A residual falsehood the cleanup did not reach — and the pattern behind it

`04f6db9` corrected two comments and left a third describing the two-copy world C-1 abolished. The
`NOTE on the duplication above` block preceding `resolveAsset` still says *"re-implement … rather than
importing them"* and, worst of all, ***"If the heuristic ever changes, both copies must change
together."*** **There is one copy.** C-1 deleted the other; `heuristicContractSize`/`heuristicPipSize`
are the sole implementation of the name-shape fallback, and `contractSizeFor`/`pipSizeFor` reach them
through `resolveAsset`. That sentence is the kind that sends a future reader hunting for a second
implementation — or restoring one. The circular-dependency warning inside the block stays, with its
framing inverted: do not import `position-sizing.ts` here **because `position-sizing.ts` imports this
file**.

Fixed rather than recorded, for consistency with §11.4.4's own ruling: the point of C1-L2 was that
false statements do not get to live in the codebase, and stopping one sentence short would be
arbitrary.

**Named lesson — comments outlive the code they describe (PHILOSOPHY §4.5).** This is the **third**
instance in this run: B-1's `INERT` header, the tripwire claim, and now the duplication note. All
three asserted an **architectural relationship** — what imports what, what duplicates what, what
guards what — and a cutover falsified all three while `tsc`, `lint`, the suite and the build stayed
green. **No gate in this repo can catch a false comment.** The rule to inherit: *when a task performs
a cutover, its brief must explicitly require auditing the comments that assert architectural
relationships in every file it touches.* Carried into every remaining brief in this run.

### 12.3 Owner decisions, 2026-08-03 (authority: owner, PHILOSOPHY §3.1 level 1)

#### 12.3.1 **Q3 is CLOSED — the decimal separator is the dot.**

MT5 uses the **dot**. **D-3's copy payload is `2.22` — dot, two decimals, no unit, no label, no
whitespace.** No separator logic, no setting, no reserved field.

This resolves **S-1.c**, the one probe the spike deliberately left undetermined (§8.5.4), and it does
so by owner decision rather than by the probe: **the 30-second owner probe in the spike report is no
longer needed and must not be requested.** The spike's indicative evidence pointed the same way (the
running WSFunded terminal has no `Language=` key and inherits Windows' `en-US`), and the terminal-may-
differ caveat is now moot as a gate — the owner has decided the payload.

**The owner queue is now fully closed.** Q1, Q2, Q4, Q5 closed in §6.2; Q6 resolved moot by the S-1
GO; **Q3 closed here.** Nothing in this run escalates to the owner again — record and continue.

*Documentation drift, recorded not fixed* (the §6.4 / §8.6.2 precedent; **this subsection is the
authority**): RFC §7.2 still lists Q3 as open; the plan's Task D-3 still says *"Separator confirmed by
S-1.c"*; the spike report §4 item 1 and §5 still present it as undetermined with a probe. **D-3's
brief will carry the resolved answer directly**, so no dispatch can read the stale wording as live.

#### 12.3.2 Scope discipline — the curated four are the comparison surface

**Owner note:** the registry/cutover comparison should have covered **only the four frozen curated
symbols — `US30`, `NAS100`, `SP500`, `XAUUSD`** — not a broader symbol corpus.

**Explicitly: this does not invalidate the completed zero-delta proof, and no rework is requested.**
The C-1 audit's 126-symbol differential (§11.4.1) stands as recorded; its verdict for the curated
four is a strict subset of what it measured, and all four were covered with zero divergences.

**Applied going forward:** where a task compares, pins or reasons about registry behaviour, the
frozen surface is those four symbols. The heuristic fallback remains real code and keeps its existing
pins — §11.4.1's mutation results show each is load-bearing — but breadth beyond the curated set is
not something a future task should generate or be asked to defend. This is consistent with RFC §1.4
(*curado, no barrido completo*) and with §8.4.2's ruling that `BTCUSD` is deliberately out of scope.

### 12.4 The interruption, recorded

The run stopped mid-dispatch at a session limit: the residual-prose fix (§12.2) was dispatched and
**terminated before returning**. Verified on resume — **it committed nothing**: HEAD was still
`04f6db9`, the working tree clean apart from the four permanently off-limits untracked dirs, and the
stale NOTE block byte-for-byte unchanged. No partial state to unwind. The fix was re-dispatched
unchanged.

### 12.5 Tree re-verified on resume

Four gates, raw, chained from `emulador/` so a non-zero exit stops the chain, **no pipes**:

| Gate | Result |
| :--- | :--- |
| tsc app / tsc spec | exit 0, no output (both) |
| lint | exit 0 — `All files pass linting.` |
| tests | `Test Files 79 passed (79)` · `Tests 1071 passed (1071)` · 7.74 s |

**Whole chain exit 0.** Matches §12.1 exactly, so the interrupted session left the tree in the state
the ledger claims. Branch is **18 commits ahead of `origin/main`**; nothing pushed.

**Next: Wave 3 — D-1, the view.** Dispatched only after the §12.2 prose fix returns, never alongside
it: `domain/sizing/` and `pages/calculadora/` are file-disjoint but **not sandbox-disjoint** (§10 /
resume-brief 5.1.2 — concurrent `ng test` runs share `.angular/cache` and `node_modules/.vite`, the
optimizeDeps race behind the PR #23 flakes, and concurrent runs also destroy attributable test-count
arithmetic).

### 12.6 The residual prose fix — `bf2b211`

| Field | Value |
| :--- | :--- |
| Commit | `bf2b211` — `docs(rfc-020): the heuristic is no longer a duplicate - correct the resolveAsset NOTE (C1-L2)` |
| Diff | **1 file, +8/−8** — `asset-registry.ts` only |
| Tests | **1071**, unchanged (a comment cannot move the count) |
| Gates | tsc app 0 · tsc spec 0 · lint 0 problems · `ng test` 79 files / 1071 tests |

**Orchestrator diff-scan:** filtering the diff for changed lines that are *not* comment-body lines
returns **nothing** — the change is comment-only, no executable line moved, `return 100;` intact.

The block now states what is true: `heuristicContractSize`/`heuristicPipSize` are the **sole**
implementation of the name-shape fallback, `resolveAsset` uses them as the last resort after
generated and manual, `position-sizing.ts`'s functions are one-line delegations, **the import
direction is `position-sizing.ts → asset-registry.ts` and must never be reversed**, and the behaviour
is pinned by the literal-value pins in `position-sizing.spec.ts`. The implementer confirmed the
premise by reading `position-sizing.ts` first rather than taking the brief's word for it.

**C1-L1 and C1-L2 are both fully closed.** All three C-1 audit Lows are now dispositioned: L1 and L2
fixed, L3 (positions re-valued, not merely re-sized) absorbed as the §11.4.3 ledger correction.

### 12.7 Wave 3 dispatched — D-1, and a plan conflict resolved on the record

**Deviation from the plan, class: requires-attention.** The plan's Task D-1 places the framework-free
view at `emulador/src/app/domain/sizing/view/`. **The brief overrides that path.** It contradicts two
higher authorities:

- **Owner ruling Q1** (§6.2, PHILOSOPHY §3.1 **level 1**): the Shared Kernel discipline is a
  *standing invariant for `domain/sizing/`* — **math and instrument data only; no formatting, no
  user-facing copy, no view helpers.** A view is all three, and this view carries verbatim Spanish UI
  copy.
- **The plan's own §1 layer table**: Layer A owns `domain/sizing/*` and **never touches UI**; the View
  is Layer D.

So the plan contradicts itself, and the authority hierarchy decides it rather than taste: a level-1
owner ruling outranks a plan path. **The view lives at `emulador/src/app/lotaje/`** — a Layer-D
feature directory, sibling to `domain/`, which keeps the kernel pure and gives RFC §7.1 item 6 ("the
tool depends on no `state/*` and no `domain/chart`") a single grep target. Cheap to reverse if the
owner prefers another home; nothing outside the new directory depends on the name.

**Also bound into the D-1 brief:**

- The framework-free boundary is grep-enforced over `lotaje/`, spec files included, and
  **`mount(doc, win)`/`unmount()` must take their document and window as arguments** — never the
  globals. D-6 mounts this same view into a PiP window, a **different realm** (`win.navigator !==
  window.navigator`, measured in S-1), and one global reference breaks it.
- **The `*.spec.ts` invariant changes shape here.** Through Wave 2 it required **zero `M`**; from D-1
  it requires **exactly one** — `calculadora-page.component.spec.ts`, inside the declared rewrite
  scope of RFC §6.2. **Any other `M` is a STOP.** Recorded because the invariant's whole value is
  that a reader knows which value is correct at which commit.
- **The prefill reconciliation.** Several v1 assertions rely on the page's prefilled acceptance case;
  P2 fixes cold start at `10 000 / 1 % / no symbol` and persistence is a later wave. Ported
  assertions must **re-express** those claims by driving the DOM, never drop them, and every
  re-expression is listed with before/after.
- **The §12.2 lesson is now a brief requirement**, not just a ledger note: D-1 must re-read every
  comment in every file it touches, because it deletes a page whose comments describe panels,
  «Desde lotes», the slider and the contract line — all of which cease to exist.
- Scope fences against later tasks: **no** `--text-hero` token (D-2), **no** copy action (D-3), **no**
  Ficha (D-4), **no** focus/shortcuts/steppers (D-5), **no** persistence (C-2). Three automatic
  findings if produced: a click handler on the unit suffix, a `storage` listener, or a "Calcular"
  button.

Gates for D-1 are the four **plus `npm run build`**. Test count starts at **1071** and will move in
both directions.

---

## §13 — Wave 3: Task D-1, the view

### 13.1 D-1 — implementation complete, orchestrator diff-scan passed

| Field | Value |
| :--- | :--- |
| Status | **COMPLETE**, awaiting individual audit |
| Commit | `a61ca59` — `feat(rfc-020): framework-free Lotaje view with a thin Angular host (D.20.1, P3)` |
| Diff | **12 files, +1741/−842** — 8 new under `lotaje/`, 4 rewritten under `pages/calculadora/` |
| Tests | **1071 → 1125.** Files 79 → 83 |
| Report | `.superpowers/rfc-020/task-d1-report.md` |

**Test arithmetic, and it reconciles:** −32 (the old page spec, wholly replaced) +28 (the rewritten
host spec) +58 (four new `lotaje/` spec files) = **1125**. Of the 32 v1 `it()`, **6 were deleted by
the three declared deletions** and **26 were ported or re-expressed** — the report lists every one.

**Scope check (orchestrator, mechanical).** All 12 files sit inside the brief's scope table.
`git diff --name-status ad80b9f..HEAD -- '*.spec.ts'` returns **exactly one `M`** —
`calculadora-page.component.spec.ts`, the declared rewrite — with everything else `A` or `D`. That is
the new correct value of the invariant per §12.7, and it holds.

**The mandatory ordering was followed and is evidenced.** The spec was rewritten first and run
against the not-yet-built structure: **28/28 red**, failing with `NG0201: No provider found for Store`
— the old component required NgRx and the new one does not. That is a real red, captured before any
view code existed.

### 13.2 Six declared `requires-attention` deviations — the first is a product question

All six were self-flagged by the implementer, which is the behaviour the protocol wants. The
orchestrator's reading, pending the auditor's independent ruling:

| # | Deviation | Orchestrator note |
| :--- | :--- | :--- |
| **1** | **The symbol chip.** The brief said "render the chip, but it opens nothing yet"; the implementer shipped an **always-visible free-text `input[name="symbol"]`** inside it, with **no press behaviour and no selection list**, and re-expressed the L8 `ui-dropdown` test as a plain-text-field test (`components/*` is banned in `lotaje/`) | **See §13.3 — this one is not routine** |
| 2 | `ViewEncapsulation.None` on the host — unavoidable, since vanilla `createElement` DOM never receives Angular's `_ngcontent-*` attribute. Makes the page CSS **global**; mitigated by a `lotaje-` prefix | **First use in this repo.** Auditor asked to verify every selector is incapable of leaking |
| 3 | `mount()` looks for `#lotaje-mount` and creates one on `doc.body` only if absent | Sensible reconciliation of a two-argument signature with a routed host |
| 4 | Method switch reconstructs `sl = entry − distance` | P4 fixes "converts, never resets" but not the direction; direction is irrelevant to sizing (§4.3). Documented and round-trip tested |
| 5 | **The Method-B money-bug guard.** `lotsForRiskDistance` has no `balance>0`/`riskPct>0` guard — only `lotsForRisk` does, because a negative balance × a negative risk % yields a *positive* `riskUsd`. `deriveLots` reproduces that guard for the Method-B path rather than silently losing it | **The right instinct.** This is the same money bug A-1 was careful to preserve, one level up. `domain/sizing/*` untouched. Auditor asked to mutation-verify it is non-vacuous |
| 6 | Zone 1 DOM order (cuenta → riesgo → símbolo) vs visual order via CSS `order` | Product design §7.1 explicitly permits DOM and focus order to diverge |

### 13.3 The symbol chip — a real design gap, currently owned by no task

Product design **§3.1** specifies *«un chip pulsable, no un desplegable siempre abierto… Pulsarlo
abre selección + texto libre»*. D-1 ships the opposite shape: an always-visible free-text field, no
press, no selection list.

**The implementer's justification is sound as far as it goes** — several claims this task had to port
(the XAUUSD comma/dot F3 tests, EURUSD parity, L8) simply cannot be expressed as DOM-driven
assertions without *some* way to set a symbol, and the brief's "the chip opens nothing yet" was
written about the **Ficha** (D-4's metadata panel), not about symbol entry. It flagged the ambiguity
loudly instead of burying it, and explicitly warned against the decision being "silently inherited."

**But the gap is real and must not be inherited silently, so it is recorded here as owner-visible:**
§3.1's press-to-open disclosure model and the selection list are, as of this commit, implemented by
**no task in the plan**. D-4 owns the *Ficha* opening from the chip; D-5 owns `Alt+S` focusing it;
neither owns the chip's own press-to-open selection.

**Provisional assignment (orchestrator): extend Task D-4 in Wave 4** to cover the chip's press-to-open
selection + free text, since D-4 already owns "opens from the symbol chip." The D-1 auditor has been
asked to rule on both halves — whether the always-visible input is an acceptable **interim** state,
and whether that assignment is right. **If the owner's intent was "no symbol input of any kind until
D-4," this is the place to say so.**

### 13.4 A verification gap, disclosed rather than worked around

**No in-browser visual check was performed.** `/calculadora` sits behind `authGuard` and this repo has
no guest mode (CLAUDE.md: *login is required*). The dev server was started, `/calculadora` correctly
redirected to `/login`, and the implementer **refused to enter credentials** — which is right, both
as policy and as a standing prohibition, and it disclosed the gap instead of working around it.

**Consequence, stated plainly:** the run's most UI-heavy task ships on **1125 passing tests and
structural assertions — with no pixel-level confirmation that the three zones render as designed.**
The auditor is asked to quantify the residual risk and to say what can be closed structurally
(computed styles in jsdom) versus what needs a human looking at the page. **This is an owner-facing
item:** a visual pass on `/calculadora` before the PR merges is the only thing that closes it, and it
needs the owner's own logged-in session.

### 13.5 D-1 audit — **NOT PASS** (0 Critical / **1 High** / 0 Medium / 3 Low)

Report: `.superpowers/rfc-020/d1-audit-report.md`. Tree left as found.

| Gate (auditor's own run) | Result |
| :--- | :--- |
| tsc app / tsc spec | exit 0 (both) |
| lint | `All files pass linting.` exit 0 |
| `ng test` | `Test Files 83 passed (83)` · `Tests 1125 passed (1125)`, exit 0 |
| `npm run build` | `Initial total 612.58 kB`, exit 0 — **no new chunk types, no vitest sentinel, no circular-dependency warning** |

Arithmetic re-derived: 1071 (79 files) → 1125 (83). `git diff --name-status … '*.spec.ts'` = exactly
one `M`.

**The decisive check passed — the ported regressions are load-bearing.** Four mutations:
`parseDecimal` → `parseFloat` = **5 red** (including the XAUUSD `2650,50 → 2648,00` case);
`type="number"` = **7 red**; a canonicalising write-back = **4 red**; removing the Method-B money-bug
guard = **1 red**. The old file had 24 `.set()`/`componentInstance.` lines; the new one has **none**.
**The re-expression argument holds** — asserting the rendered figure against a real kernel call
retains full detection power. **All 26 surviving v1 claims were matched row by row against the diff**,
and `risk-slider.component.{ts,spec.ts}` is byte-identical to `ad80b9f`.

#### 13.5.1 **D1-H1 (HIGH)** — the «pips» suffix labels a field consumed as price units

`sizing-view-model.ts:90` derives the unit label from `pipSize`; `:96`/`:109` pass the typed value
**straight into `lotsForRiskDistance(riskUsd, distanceInPrice, contractSize)` with no conversion.**
Measured by running the committed `deriveLots` (balance `10 000`, risk `1 %`):

| Symbol | suffix | types | **rendered** | correct | warning |
| :--- | :--- | ---: | ---: | ---: | :--- |
| `EURUSD` | **pips** | `45` | **0.01** | **0.22** | `El mínimo de 0.01 lotes arriesga $45000.00…` |
| `US30` | pts | `50` | 2.00 | 2.00 | none |

**Two harms.** The lot is wrong by the pip factor — *under*-sized, the safe direction, which is why
this is High and not Critical. But the **stated risk is wrong by 10 000× in the dangerous
direction**: `$45 000` against a true `$4.50`, printed on the figure §3.1 calls *«el ancla honesta de
toda la herramienta»*. It contradicts §4.2, §4.4, RFC §1.3, and §4.1's mitigation #2 — **one of only
two left after D-21 removed the third.** It also reaches `switchMethod`, which writes `|entry − sl|`
into the «pips» field.

**Why no gate caught it:** `sizing-view-model.spec.ts:110` uses EURUSD with a **price-unit** distance
while `:185` asserts `unitLabel === 'pips'` for GBPJPY — the two facts never meet in one test.

**It was undeclared.** The report's §9.1 records only *"unit suffix abbreviated to pts/pips"*.

**Ruling: fix by conversion, not by relabelling.** Product design §4.2 is frozen — the unit is derived
per symbol, **pips** for FX. The design wants pip-denominated entry; the code never implemented it.
Forcing `pts` everywhere would override a frozen decision. So: `pipSize !== null` → 1 typed unit =
`pipSize` price units; `pipSize === null` → 1 price unit, **unchanged** (the `pts` path is pinned by
the ported acceptance case). Three sites: the value into `lotsForRiskDistance`, **`actualRiskUsd` at
`:120`** (the `$45 000` half — fixing the lot and leaving the risk is not a fix), and `switchMethod`
in both directions. The helper goes in the view's derivation layer, **never** in `domain/sizing/*`
(owner ruling Q1).

**Status: dispatched, then stopped by the owner before it committed anything.** Verified: HEAD
remained `ff4fa91`, tree clean. **This is the first item of the next session.**

#### 13.5.2 Deviation rulings — all six accepted

**The symbol chip: ACCEPTED as interim**, with a condition. The chip has **no** click handler (proven
— clicking leaves `innerHTML` byte-identical), so "opens nothing yet" is honoured; v1 already had a
free-text symbol field, so this **preserves capability rather than inventing it**. **L8 preserves its
claim** — the dropdown was the *mechanism*, never the claim, and the re-expression now crosses the
DOM where v1 called `onAssetPick()` directly. **The auditor's condition:** the chip is the *enabler*
of D1-H1, so it is acceptable **once H1 closes, not alongside it**.

`ViewEncapsulation.None`: **ACCEPTED, verified leak-proof** — every rule's subject is a `.lotaje-*`
class, the only bare-element selectors are gated behind one, no `:root`/`*`/`html`/`body`, and
`.lotaje-` appears nowhere else in `emulador/src`. Angular does **not** remove `None` styles on
destroy, so the sheet persists once visited; residual risk nil today. **The `lotaje-` prefix is
hereby reserved** — no other surface may adopt it. It also *fixed* a pre-existing P6 violation (v1
used `--down` for the warning). Container fallback, fixed SL reconstruction, the money-bug guard and
the DOM-vs-visual order: **all accepted**, tab order confirmed as §7.2's cuenta → riesgo → símbolo →
stop.

#### 13.5.3 The three Lows

- **D1-L1 (owner-visible, no-fix here).** Cold start renders *«La cuenta, el riesgo y la entrada deben
  ser valores positivos.»* while cuenta and riesgo **are** positive and **no «entrada» field exists**
  in Method B. §8.2 arguably calls for a third message. **The §8 messages are frozen verbatim, so
  inventing a third is a product decision, not an implementer's** — it goes to the owner.
- **D1-L2 → assigned.** §3.1's press-to-open chip + selection list is now written into the plan's
  **Task D-4** (Wave 4), with the auditor's condition that the list must be sourced **without
  importing `components/*`** (the view is framework-free and must mount into the PiP window).
- **D1-L3 → folded into the H1 fix.** No DOM assertion that the warning *accompanies* the figure;
  exact location supplied (`calculadora-page.component.spec.ts:217-226`).

#### 13.5.4 What the auditor closed on the visual gap, and what remains

Two slices closed **structurally**: `.ui-input` is defined in `src/styles/ui-primitives.css` and
loaded **globally** via `angular.json:33`, so the vanilla DOM really is themed; and **all 27
`var(--token)` references resolve** against the global definitions (0 missing) — an undefined token
collapses silently and **no test would see it**.

**What still needs human eyes:** the CSS-`order` reflow in Zone 1, whether the figure reads as the
hero at its placeholder size, suffix/value overlap at the fixed 88/96 px widths, the 560 px
breakpoint, and contrast. *«None can break the arithmetic; all can make it unusable while green.»*

---

## §14 — Session 6: resume, D1-H1 closure, and Wave 3 PASS

**Append-only.** §1-§13 stand as written. The original D-1 NOT PASS remains the historical record;
this section records its fix and independent re-audit.

### 14.1 Resume state — measured, not inherited

The resume prompt named `7ad0de6`, but the actual HEAD was **`be42ab3`**, its documentation-only
child (`docs(rfc-020): resume prompt #2 for a fresh session, paused mid-Wave-3`). The branch was
**25 commits ahead of `origin/main`**, not 24. Neither discrepancy touched `emulador/` or changed the
D-1 code under audit.

The tracked tree was clean. `git status --short --branch` showed only the four permanently off-limits
untracked directories: `.opencode/`, `.superpowers/calculadora/`, `.superpowers/rfc-018/`, and
`.superpowers/rfc-019/`. The spec invariant already had its post-D-1 shape: exactly one `M`,
`calculadora-page.component.spec.ts`; all `lotaje/` specs were `A` relative to `ad80b9f`.

Fresh gates ran sequentially, raw and unpiped, from `emulador/` before the fix dispatch:

| Gate | Result |
| :--- | :--- |
| tsc app | exit **0**, no output |
| tsc spec | exit **0**, no output |
| lint | exit **0** — `All files pass linting.` |
| tests | exit **0** — `Test Files 83 passed (83)` · `Tests 1125 passed (1125)` |

**Whole chain exit 0.** This matches §13.5 exactly, so the interrupted fix dispatch left no partial
state and **83 files / 1125 tests** is the attributable starting point.

### 14.2 D1-H1 + D1-L3 fix — `ea06fb4`

| Field | Value |
| :--- | :--- |
| Status | **COMPLETE**, orchestrator mechanical diff-scan passed |
| Commit | `ea06fb4` — `fix(rfc-020): convert pip-denominated distance to price units before sizing (D1-H1)` |
| Parent | `be42ab3` exactly — one task commit, no interleaving |
| Diff | **3 files, +122/−22**: `lotaje/sizing-view-model.{ts,spec.ts}` and `pages/calculadora/calculadora-page.component.spec.ts` |
| Tests | **1125 → 1131** (+5 view-model tests, +1 DOM test), files unchanged at 83 |
| Gates | tsc app 0 · tsc spec 0 · lint 0 problems · `ng test` 83 files / 1131 tests · build 612.58 kB, accepted budget warning only |
| Report | `.superpowers/rfc-020/task-d1fix-report.md` |

**TDD evidence.** Before the production edit, the two focused spec files had **8 conversion-specific
failures**: EURUSD lots and exact risk, GBPJPY parity, the converted rounding-warning dollars, both
method-switch directions, and their DOM equivalents. The unchanged US30 acceptance case was run
separately and stayed green before and after; the brief's stale request to make all five listed cases
red was corrected rather than manufacturing a failure on the points path.

**The fix is in the view derivation layer, where Q1 requires it.** One private named helper,
`convertDistance`, maps display → price and price → display with `pipSize ?? 1`. The same normalized
price distance now feeds `lotsForRiskDistance` and `actualRiskUsd`; both `switchMethod` directions use
the inverse conversions. `domain/sizing/*` is byte-untouched by the task.

**D1-L3 is closed in the same commit.** The existing minimum-lot DOM case now asserts that
`.lotaje-hero` and the warning coexist, while the honest-state cases continue to assert replacement.

**Mechanical scope scan:** the commit descends directly from the dispatch HEAD and contains exactly
the three brief-scoped files. `lotaje-view.ts`, `domain/sizing/*`, package manifests, lockfile,
pipeline, state, and all off-limits paths are absent. The framework-free grep is empty. The precise
production `spec-util` import grep is empty. The branch-wide spec diff still has exactly one `M`, the
declared Calculadora rewrite.

**Deviations — all `inert`, none `requires-attention`:** stale brief HEAD corrected by the dispatch;
affected EURUSD cases narrowly re-expressed from price-unit literals to pip-denominated literals;
the RED count honestly reported as eight conversion failures with US30 separately green; the direct
EURUSD lot/risk claim split into two tests; and the local report written after, and excluded from, the
pathspec commit.

### 14.3 D-1 re-audit — **PASS ("Ship it")**

Report: `.superpowers/rfc-020/d1-audit-report.md`, **RE-AUDIT APPENDIX**. The original NOT PASS and
its reproduction remain unchanged above the appendix. The previous auditor session identifier was
not recoverable, so a fresh independent `branch-auditor` audited
`be42ab3..ea06fb4`; it made no fix and left the tracked tree byte-identical.

**Verdict: 0 Critical / 0 High / 0 Medium / 2 Low.** D1-H1 and D1-L3 are closed. The two surviving
Lows retain their written dispositions: D1-L1 remains an owner copy decision/no-fix in D-1, and
D1-L2 remains assigned to Task D-4's press-to-open selection + free-text scope.

The auditor re-ran the original money-path cases independently:

| Case | Independent result |
| :--- | :--- |
| EURUSD, 10 000 / 1 %, displayed 45 pips | normalized `0.0045` · **0.22 lots** · **$99.00 actual risk** |
| EURUSD minimum-lot case, displayed 45 pips | **0.01 lots** · **$4.50 actual risk**, warning direction correct |
| GBPJPY, displayed 30 pips | normalized `0.3` · **0.33 lots** · price/distance round trip returns `30` |
| US30, displayed 50 pts | normalized `50` · **1.00 lots** · **$50.00**, unchanged |

Two mutations proved the coverage is load-bearing: reinstating raw display-distance semantics made
9/60 focused tests fail while US30 stayed green; breaking only `actualRiskUsd` made exactly the three
risk-sensitive assertions fail. Both mutations were fully reverted before the gates and verdict.

Fresh auditor gates, sequential and unpiped:

| Gate | Auditor result |
| :--- | :--- |
| tsc app | exit **0**, no output |
| tsc spec | exit **0**, no output |
| lint | exit **0** — `All files pass linting.` |
| tests | exit **0** — `Test Files 83 passed (83)` · `Tests 1131 passed (1131)`; no skipped/todo state |
| build | exit **0** — initial total **612.58 kB**; no new chunk type, vitest sentinel, or circular-dependency warning; known budget warning only |

Arithmetic was re-derived from committed blobs: **1125 + 5 + 1 = 1131**, files **83 + 0 = 83**.
Dependencies, framework boundary, production `spec-util` imports, task scope, comment semantics, and
the exact one-`M` spec invariant all passed independently.

**Wave 3 is complete and audited PASS. Wave 4 is unblocked.** Its five implementations still run
strictly sequentially because the Angular/Vite caches are shared, followed by the one permitted
batched Wave 4 audit. The whole-branch final audit remains mandatory.

### 14.4 Visual-test identity — current MCP cannot mint the required session

The owner authorized a dedicated Supabase test identity and required session injection rather than
typing a password into a form. The connected MCP was checked against the current Supabase Auth
documentation before any write:

- `auth.admin.createUser()` is the supported user-creation path, but it requires a server-side
  secret/service-role credential. The MCP exposes project URL and publishable keys, not an Auth
  Admin call or a secret key.
- Creating a user returns a user, **not a session**. Supabase documents no admin operation that mints
  an ordinary user's access/refresh pair without a sign-in flow.
- `auth.admin.generateLink()` still requires a secret-key Admin call and subsequent link/OTP
  verification before a session exists.
- `auth.setSession({ access_token, refresh_token })` is the supported way to install an already-valid
  pair into a `persistSession: true` client; it does not mint the pair.
- Direct inserts into managed `auth.users` / `auth.identities` are not a supported hosted-user
  provisioning flow and do not create a valid login session. They were not attempted.

**Disposition:** no test identity was created, so there is no identity or secret to record. No token,
credential, SQL write, form login, or auth bypass occurred. Per the owner's explicit fallback, the
in-browser visual pass remains an **owner task**, non-blocking for the run: CSS-order reflow, hero
hierarchy, suffix/value overlap at 88/96 px, the 560 px breakpoint, and contrast. Structural coverage
from §13.5.4 remains valid but is not misrepresented as a visual pass.

---

## §15 — Wave 4 implementation (batched review)

**Run rule:** D-2, D-3, D-4, D-5, and C-2 run strictly sequentially despite their file-level
independence. No Angular test/build process overlaps another. Individual task reports are claims;
the wave receives one independent audit only after all five task-scoped commits land.

### 15.1 Task D-2 — context strip + hero token

| Field | Value |
| :--- | :--- |
| Status | **IMPLEMENTATION COMPLETE**, orchestrator mechanical diff-scan passed; awaits batched Wave 4 audit |
| Commit | `0f4237e` — `feat(rfc-020): complete Lotaje context strip and hero token (D-2)` |
| Parent | `58e275c` exactly |
| Diff | **3 files, +27/−22**: `src/styles.css`, Calculadora CSS, and comment-only `lotaje-view.ts` |
| Tests | **83 → 83 files**, **1131 → 1131 tests** (+0/−0) |
| Gates | tsc app 0 · tsc spec 0 · `ng test` 83/1131 · lint 0 problems · build **612.60 kB**, known budget warning only |
| Report | `.superpowers/rfc-020/task-d2-report.md` |

The task added the single global `--text-hero: 44px` token with its one-dominant-figure restriction,
made `.lotaje-lots-value` its sole production consumer, set `--leading-none`, and overrode the token
to exactly **36px** on `.lotaje-root` inside the existing 560px compact query. Zone 1's derived dollar
risk now carries the specified `--text-md`/mono/tabular/`--text` secondary hierarchy. No executable
view code or DOM changed.

**Mechanical scope scan:** the commit descends directly from its dispatch HEAD and contains exactly
the three brief paths. `lotaje-view.ts` changed comments only. Specs, package files, lockfile,
`domain/sizing/*`, later-task behavior, and off-limits paths are absent. The branch-wide spec diff
still has exactly one `M`, the Calculadora rewrite.

**Evidence strategy:** no fake CSS test was added. Pre-edit source probes showed the absent token,
the live D-1 placeholder, and the missing risk hierarchy; post-edit token/consumer/boundary probes
plus the production build established the structural contract. This does not claim the unavailable
authenticated visual pass.

**Deviation:** one `inert`, zero `requires-attention`. `rg` was not on PowerShell's PATH, so the
implementer reran the same expressions and arguments with VS Code's bundled ripgrep. No behavior,
scope, or evidence meaning changed.

### 15.2 Task D-3 — target-realm copy action

| Field | Value |
| :--- | :--- |
| Status | **IMPLEMENTATION COMPLETE**, orchestrator mechanical diff-scan passed; awaits batched Wave 4 audit |
| Commit | `714b9a8` — `feat(rfc-020): add target-realm Lotaje copy action (D-3)` |
| Parent | `cd2544d` exactly |
| Diff | **3 files, +582/−40**: `lotaje-view.{ts,spec.ts}` and Calculadora CSS |
| Tests | **83 files unchanged**, **1131 → 1140** (`−1` inert D-1 case + `10` D-3 cases = net `+9`) |
| Gates | tsc app 0 · tsc spec 0 · `ng test` 83/1140 · lint 0 problems · build **612.60 kB**, known budget warning only |
| Report | `.superpowers/rfc-020/task-d3-report.md` |

The result figure is now a native, named copy button. It writes the exact rendered bare payload
(`2.22`, dot, two decimals) through the **mounted target window's** `navigator.clipboard`, never the
ambient/opener realm. Fulfilment alone produces `Copiado` and the tokenized 1200ms accent state;
rejection or synchronous throw produces the exact visible fallback. No input change auto-copies.

The honest-state doctrine remains intact: a neutral `.lotaje-copy-shell` owns stable geometry, but
`.lotaje-hero`, the numeric value, and `lotes` remain absent when the honest message replaces them.
A visible native glyph-only button stays disabled in the affordance slot. Minimum-lot/rounding states
keep an enabled real-lot copy action and their accompanying warning.

**TDD evidence:** replacing the one inert D-1 copy case with ten behavior cases yielded exactly
`10 failed / 14 passed` before production code and `24 passed` after. The cases pin exact payload,
target-vs-ambient realm, no auto-copy, fulfilled timing, rejected/synchronous failure, honest-state
disablement, warning-state copy, stale promise settlements, realm-owned timers, and unmount/remount
teardown under `isolate:false`.

**Mechanical scope scan:** direct parent, exactly the three brief files, no package/lock/kernel/host
spec/later-task path. The branch-wide spec invariant remains exactly one `M`; `lotaje-view.spec.ts`
remains `A` relative to `ad80b9f`. Boundary and production `spec-util` checks are empty.

**Deviation:** one `inert`, zero `requires-attention`. During GREEN, an `HTMLCollection` assertion was
converted to `Array.from(content.children)` so the matcher could pin the same exact child order; no
behavior, scope, or coverage changed.

**FINAL-AUDIT ATTENTION:** read D-3 line by line. It is the wave's largest diff and introduces
asynchronous clipboard settlement, two generations, target-realm timer ownership, and teardown
guards. Independently attack out-of-order fulfil/reject, render invalidation, unmount/remount, and the
requirement that no ambient navigator or bare timer path exists.
