# CLOSEOUT MANDATE & ORCHESTRATION STATE

**Written:** 2026-08-12 · **Supersedes the STEP 2/STEP 3 scope in `RESUME-PROMPT.md` §A.**
**Assume zero conversational memory. Git is authoritative over every claim in any report.**

---

## 0. Where the campaign stands right now

| | |
|---|---|
| Baseline | `develop` @ `a2ca53b` — **re-verified against origin this session** |
| `git ls-remote origin refs/heads/develop` | `a2ca53b44f678dd285cd90f31ee644696664f32a` |
| `git ls-remote origin refs/heads/main` | `ad69d7dd582bfa5c977b3816fb46101335df6c35` |
| `git ls-remote origin 'refs/heads/agent/*'` | **empty — nothing pushed, isolation intact** |
| `develop` mutated? | **No.** No commit/merge/rebase. Only untracked files added under `.superpowers/audit-2026-08-10/`. |

### Agent status as reconciled from git (NOT from PROGRESS.md, which lagged in 3 of 5 cases)

| Agent | Branch | Git-verified state at resume | Action taken this session |
|---|---|---|---|
| **A** Landing | `agent/landing-product-showcase` | 2 commits; build scaffold only (`build.mjs`, `serve.mjs`, `vercel.json`, `package.json`, `.gitignore`). `landing/src/styles/tokens.css` **untracked**. No HTML/CSS/JS content. | **Respawned** with corrected brief |
| **B** Units | `agent/unit-authority` | 4 commits; `UNIT_AUTHORITY_INVESTIGATION.md` committed. **COMPLETE.** No app code changed. | Not respawned; under adversarial re-verification by orchestrator |
| **C** Sync | `agent/session-sync-red-team` | 2 commits; **fix + 228 lines of tests already committed** (`e538d0e`). `SESSION_SYNC_RED_TEAM.md` (273 ln) **untracked**. | **Respawned** with corrected brief |
| **D** Verification | `agent/verification-integrity` | 2 commits; **all 19 selector leaks fixed** (both batches). `trade-panel.component.spec.ts` (538 ln) **untracked & unverified**. `ci.yml` **unchanged**. No report. | **Respawned** with corrected brief |
| **E** Routing | `agent/routing-hygiene` | 7 commits; `.claudeignore`, RFC 017–020 headers, ROADMAP, CLAUDE.md, verify-gates/README, ledger routing **all landed**. Items 7/8/10 open. | **Respawned** with corrected brief |

**Lesson already banked:** every respawned agent's `PROGRESS.md` understated its own branch.
Never accept a ledger's self-assessment; diff the branch.

---

## 1. The extended closeout mandate (owner instruction, 2026-08-12)

The goal is no longer "finish the synthesis". It is a **complete adversarial closeout**, then a
**next-campaign design**. Ordered obligations:

### 1.1 Finish, then verify — do not accept "complete" on a report's word
For every agent independently reconcile
`PROGRESS.md` vs `git status` vs `git log develop..HEAD` vs the actual diff vs verification evidence.
Before accepting an agent as complete, confirm **all** of:
deliverables exist · implementation exists where applicable · work is committed · no important
uncommitted files remain · gates/tests actually run · reported evidence matches repo state ·
no work escaped its worktree · `develop` untouched · nothing pushed or merged.
**Challenge any claim not supported by evidence before it enters the synthesis.**

### 1.2 Checkpoint before every large operation
Before big test suites, builds, browser verification, Vercel operations, the final synthesis, or
any new agent wave: commit branch work, update `PROGRESS.md`s, and update this file + the resume
index. **The session must remain restartable at all times.**

### 1.3 Adversarial classification
Every significant conclusion gets one of:
`CONFIRMED BY INDEPENDENT REVIEW` / `SUPPORTED BUT NOT FULLY PROVEN` / `REFUTED` /
`OWNER DECISION REQUIRED` / `DEFERRED`.
Special scrutiny on findings that **reverse** the original audit — two plausible "unit bugs" have
already turned out not to be arithmetic defects.

### 1.4 Agent B gets special review (§4 of the mandate)
Independently reconstruct the mechanism. The claim under test: correctness must be judged from
**`spreadPoints × pointSize`** (a matched pair whose product alone reaches a fill), **not** from
comparing `pointSize` against `tickSize` in isolation. Reported figures to verify against real
code, not to quote on trust: current index model ≈ **3.00%** friction; comparables ≈ **3.18%**
(EURUSD) / **7.00%** (XAUUSD); proposed `pointSize = tickSize` "fix" ≈ **0.04%**.
The synthesis must answer explicitly:
- **Gold** — was the suspected XAUUSD sizing bug real? (expected: **NO**, intentional D.20.6)
- **Indices** — is `pointSize = 1` actually defective? (use the independently reviewed verdict)
- **Remaining real problem** — is it now only the user-facing `pts` vocabulary / cross-surface
  semantics between Lotaje and TradePanel rather than the arithmetic?
Produce a final semantic truth table for **EURUSD, XAUUSD, NAS100, US30, SP500** distinguishing
`tickSize` · `pipSize` · `pointSize`/broker point · display distance · spread unit · `priceDelta`.
**Do not silently redefine D.20.6.**

### 1.5 The I1 finding must be adjudicated as possible *expired scaffolding*
Evidence already gathered (see `ORCHESTRATOR-INVARIANT-EVIDENCE.md`): the sunset TODO says remove
the getters once Drawings/TradingCapability exist; both exist; both already take the series by
constructor. So the expiry condition may already have fired, making the raw handles **expired
migration scaffolding, not an architectural rule needing suppression.**
Correct order is therefore
`remove obsolete bridge → prove no required consumers remain → negative tests → then detector`,
**not** `add lint rule → add suppressions for current violations`.
**Never create a permanent exception for something the architecture already intended to delete.**

### 1.6 Final invariant adjudication — new taxonomy
`CURRENT LAW` / `TEMPORARY RFC CONSTRAINT` / **`EXPIRED MIGRATION CONSTRAINT`** / `SUPERSEDED` /
`VIOLATED AND MUST BE RESTORED` / `OWNER DECISION REQUIRED`.
For every `CURRENT LAW` record: written rule · actual current state · detector today · proposed
detector · existing backlog · **precondition before the detector can be enabled**.
Never encode stale prose merely because it exists.

### 1.7 Agent C — definitive reachability answer
Answer exactly one of `NOT REACHABLE` / `THEORETICALLY REACHABLE` /
`REACHABLE ABOVE <condition>` / `REACHABLE TODAY`.
Inspect the diff; verify the historical defect via negative probe; confirm the new tests fail when
the protection is removed; run the relevant tests raw. State whether the fix **changes protocol
semantics** or merely **makes the existing protocol safe**. Then classify
`HOTFIX / MAINTENANCE` vs `RFC-LEVEL CHANGE` vs `DEFER`.
**Do not bury a destructive reachable bug in a future RFC to preserve the original roadmap.**

### 1.8 Agent D — quality over line count
Selector isolation: confirmed leakers, fixes, whether the documented rule still makes sense,
whether mechanical enforcement is now appropriate.
TradePanel: judge whether specs truly cross `user input → component behavior → order action/state
consequence`. **Reject tests that replicate implementation details.** Perform at least one negative
probe proving the suite catches a real break.
CI: state exactly which trigger changed and which gates run. **Do not imply branch protection was
configured — it remains a manual GitHub dashboard action.**

### 1.9 Agent E — routing truth
Review ROADMAP · RFC statuses · CLAUDE.md · design-system routing · ledger routing · `.claudeignore`
· stale worktree classification · anything Agent E *disproved*.
Explicitly separate **safe recommendation** from **action already performed**.
**Never auto-prune pre-existing worktrees** — one detached checkout (`30c2219`, the ancestry-graft
commit) is historically significant.

### 1.10 Agent A — real product/design review, not "build passed"
Inspect the landing visually; explain its narrative top to bottom. It must read as a
**deliberate-practice and learning instrument**, never as a broker, generic SaaS dashboard,
profitability promise, or fake trading platform. Check visual emphasis for: market replay · chart
workspace · multi-panel · chart/link sync · execution · trade overlays · **position-sizing
calculator (deserves real product emphasis, not a feature card)** · Journal/Reflection ·
Playbook/rule adherence · learning/knowledge engine.

### 1.11 Multi-symbol honesty
Future multi-symbol may be previewed strongly, but must be unmistakably labeled
`COMING NEXT` / `IN DEVELOPMENT` / `FUTURE CAPABILITY` / `ON THE ROADMAP`.
It must never imply multi-symbol execution/runtime ships today. **Product truth beats marketing.**

### 1.12 Visual provenance — three distinct categories, never blurred
`REAL PRODUCT CAPTURE` / `FAITHFUL RECONSTRUCTION FROM CURRENT PRODUCT` / `FUTURE CONCEPT`.
If auth prevented real screenshots, report that precisely. Prefer real captures for current
functionality if they become possible. Future multi-symbol imagery stays clearly conceptual.

### 1.13 Vercel — the actual state, in this exact shape
```
VERCEL STATE:      DEPLOYED / CONFIGURED BUT NOT DEPLOYED / BLOCKED
Project:           <actual project name/id if created>
Preview URL:       <actual URL, only if real>
Local production build: PASS / FAIL
Remote verification:    PASS / PARTIAL / NOT RUN
Blocker:           <only if applicable>
```
Must be a **NEW** Vercel project. **NEVER modify or deploy over `prj_KpNe7NDXP95iXljbwcZCh4Wcv0Wo`**
(the emulator's production project). **Never fabricate a URL. Never claim deployment from config
files alone.** If an owner decision is genuinely required to create the project, stop *only that
operation*, finish everything else, and report the exact decision needed.

### 1.14 The synthesis must include a dedicated audit-corrections section
Shape: `ORIGINAL AUDIT FINDING → NEW EVIDENCE → FINAL VERDICT`, covering at least XAUUSD sizing,
index `pointSize`, the I1 raw-handles/direct-call interpretation, any SessionSync severity
correction, and anything else agents refuted. **Purpose: stop future agents rediscovering
disproven claims.** Then separate sections for confirmed defects · intentional behavior ·
architectural debt · stale docs/expired scaffolding · owner decisions · branch integration plan
(`MERGE AS-IS` / `MERGE AFTER <change>` / `DO NOT MERGE` / `RESEARCH ONLY`) + safest order.
**Do not merge anything.**

### 1.15 Then design the next campaign
Buckets: `OPUS-WORTHY` / `CHEAPER-AGENT SUITABLE` / `OWNER/DESIGN DECISION` / `DEFER`.
Opus is reserved for substantial ambiguity, architectural reasoning, adversarial investigation,
product-system design, hard cross-boundary analysis. **Never Opus for** formatting, dead-export
deletion, comment cleanup, lint autofixes, mechanical renames, obvious dependency bumps, CSS polish.
Propose **3–5 parallel candidate tracks**, each with: track name · why now · question it resolves ·
evidence available · files/architecture involved · mutates production? · dependencies · risk ·
durable deliverable · why Opus specifically adds value.
Rank `P0` (do while Opus available) / `P1` / `P2` / `DEFER`, and give the recommended combination
for **1**, **3**, and **5** parallel agents.
Write `NEXT-WAVE-PROPOSAL.md` and, if the recommendation is strong, `NEXT-WAVE-MASTER-PROMPT.md`.
**Do NOT create worktrees or dispatch the next wave** — the owner authorises tracks first.

### 1.16 Guiding principle
Optimise for **high-cost uncertainty permanently eliminated before Opus usage expires**, not for
amount of code produced.

---

## 2. Invariant hard boundaries (unchanged, still binding)

- Baseline `develop` @ `a2ca53b`. If it moves, **STOP and report** — never silently rebase anyone.
- **NEVER mutate `develop`.** No commits, merges, rebases, force-pushes. Nothing pushed to origin.
  No agent branch merged without explicit owner approval.
- Each agent works ONLY in its own worktree, commits ONLY to its own branch.
- Do NOT create worktrees under `.claude/worktrees/` (~152,368 stale files pollute agent search).
- Do NOT delete or prune any pre-existing worktree; recommend commands, the owner runs them.
- **EVIDENCE BEFORE MUTATION.** Classify: confirmed defect / intentional decision / stale doc /
  architectural debt / owner decision.
- **THE CANONICAL WARNING:** an earlier audit "proved" Gold sizing broken because XAUUSD has no
  `pipSize`. **REFUTED** — D.20.6 (`.superpowers/rfc-020/dev-log.md:2564-2569`) defines non-FX
  displayed points as whole price units and the code follows it. Never assume
  `tickSize`/`pipSize`/`pointSize` are interchangeable because their values differ.
- Gates run raw from `emulador/`, never through `| tail`/`| head`, never bare `npx vitest run`.

---

## 3. Files that carry this campaign's state

| File | Role |
|---|---|
| `RESUME-PROMPT.md` | Original cold-start index (its STEP 2/3 scope is superseded by this file) |
| **`CLOSEOUT-MANDATE-AND-STATE.md`** | **This file — current authority on scope and state** |
| `ORCHESTRATOR-INVARIANT-EVIDENCE.md` | Orchestrator's own measured I1/I3 evidence + baseline re-verification |
| `PARALLEL_EVOLUTION_SYNTHESIS.md` | The deliverable being completed (§1 baseline and §5 units already written) |
| `TRADING_EMULATOR_ENGINEERING_EVOLUTION_AUDIT.md` | The audit that justifies the campaign |
| `<worktree>/PROGRESS.md` × 5 | Per-agent ledgers — **treat as lagging git, always reconcile** |
| `NEXT-WAVE-PROPOSAL.md` | To be written at closeout |
| `NEXT-WAVE-MASTER-PROMPT.md` | To be written if the recommendation is strong |
