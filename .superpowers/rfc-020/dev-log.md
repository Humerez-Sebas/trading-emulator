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

