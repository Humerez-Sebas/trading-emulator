# COLD-START RESUME PROMPT — Trading Emulator Parallel Evolution

> Paste the block in §A into a fresh Claude Code session. Everything needed is on disk;
> no conversation history is required.

---

## A. THE PROMPT (paste this)

```
You are resuming the Principal Engineering Orchestrator role on the `trading-emulator`
repository. A previous session was interrupted by a usage limit. NOTHING is in your
memory — everything is on disk. Do not restart the work; continue it.

STEP 1 — Re-establish state before doing anything else.
Read, in this order:
  1. .superpowers/audit-2026-08-10/RESUME-PROMPT.md   (this file — the index)
  2. .superpowers/audit-2026-08-10/PARALLEL_EVOLUTION_SYNTHESIS.md  (baseline + agent status)
  3. .superpowers/audit-2026-08-10/TRADING_EMULATOR_ENGINEERING_EVOLUTION_AUDIT.md  (the audit
     that justifies all of this work — read at least §1, §4, §12, §13 and the A/B/C/D sections)

Then run these read-only commands and reconcile what you find against the documents above:
  git -C C:/Users/78701/Desktop/trading-emulator status --short --branch
  git -C C:/Users/78701/Desktop/trading-emulator worktree list
  git -C C:/Users/78701/Desktop/trading-emulator log --oneline --all --not develop

For EACH of the five agent worktrees below, read its PROGRESS.md and its git log:
  C:/Users/78701/Desktop/trading-emulator-landing       (agent/landing-product-showcase)
  C:/Users/78701/Desktop/trading-emulator-units         (agent/unit-authority)
  C:/Users/78701/Desktop/trading-emulator-sync          (agent/session-sync-red-team)
  C:/Users/78701/Desktop/trading-emulator-verification  (agent/verification-integrity)
  C:/Users/78701/Desktop/trading-emulator-routing       (agent/routing-hygiene)
Command per worktree:
  git -C <path> log --oneline develop..HEAD ; git -C <path> status --short

STEP 2 — Decide what still needs doing.
Each PROGRESS.md ends with a `## RESUME BRIEF` that is a self-contained prompt. For every
agent whose STATUS is not 100%, spawn a fresh Opus subagent with that RESUME BRIEF as its
prompt, restating the hard boundaries below. Run them in parallel. Do not duplicate work
already recorded as done, and do not re-run measurements already recorded with their output.

STEP 3 — Synthesis.
When all five are complete, perform the adversarial Principal Architect synthesis described
in §D of this file and finish PARALLEL_EVOLUTION_SYNTHESIS.md.

HARD BOUNDARIES (unchanged, non-negotiable):
- Baseline is develop @ a2ca53b. Verify develop has not moved; if it has, STOP and report
  rather than silently rebasing anyone.
- NEVER mutate `develop`. No commits, merges, rebases or force-pushes on it. Nothing is
  pushed to origin. No agent branch is merged without explicit owner approval.
- Each agent works ONLY inside its own worktree and commits ONLY to its own branch.
- Do NOT create worktrees under `.claude/worktrees/` — that directory already holds ~152,368
  stale files and pollutes agent search. Use siblings on Desktop.
- Do NOT delete or prune any pre-existing worktree. One of them is a detached checkout at
  30c2219, the ancestry-graft commit. Recommend commands; the owner runs them.
- EVIDENCE BEFORE MUTATION. Before calling anything a defect, check the implementation, the
  tests, and the decision records (RFCs, `.superpowers/rfc-*/dev-log.md`). Distinguish
  confirmed defect / intentional decision / stale doc / architectural debt / owner decision.
- THE CANONICAL WARNING: an earlier audit "proved" Gold sizing was broken because XAUUSD has
  no pipSize. That was REFUTED — decision D.20.6 (.superpowers/rfc-020/dev-log.md:2564-2569)
  defines non-FX displayed points as whole price units, and the code correctly follows it.
  Never assume tickSize/pipSize/pointSize are interchangeable because their values differ.
- Gates run raw from `emulador/`, never piped through `| tail`/`| head` (it hides the exit
  code), never bare `npx vitest run`.
```

---

## B. Index of work already completed

### B1. Engineering Evolution Audit — COMPLETE
`.superpowers/audit-2026-08-10/` (untracked). 9 specialist reports + 8 `-v2` addenda + synthesis.

| File | Contents |
|---|---|
| `TRADING_EMULATOR_ENGINEERING_EVOLUTION_AUDIT.md` | **The deliverable.** Executive assessment, heatmap, 15 top findings, anti-patterns, practices-not-to-adopt, conventions, evolution program E0–E7, RFC-021..024 proposal, Angular 22 verdict, npm audit plan, GO/NO-GO |
| `00-RESUME-INDEX.md` | Audit-phase index with per-specialist digests |
| `audit-types-domain-units.md` (+`-v2`) | Type smells, 24 silent fallbacks, s/ms + timezone risk |
| `audit-tests.md` (+`-v2`) | Source-text tests (0), DOM-crossing 11.9%, 19 selector leaks |
| `audit-angular-ngrx-rxjs.md` (+`-v2`) | Invariants I1–I6 verdicts, state ownership, RxJS counts |
| `audit-complexity-boundaries.md` (+`-v2`) | Largest functions, 1 cycle, 92 unused exports, SPLIT/KEEP table |
| `audit-perf-lifecycle-persistence.md` (+`-v2`) | Hot path, leak ledger, silent-incorrect paths, S6 |
| `audit-tooling-ci-deps-security.md` (+`-v2`) | Raw gates, bundle attribution, CI/branch protection, strictness costs |
| `audit-styling-ui-a11y.md` (+`-v2`) | Token census, light-theme defects, 8 dropdown impls |
| `audit-comments-docs-agents.md` (+`-v2`) | Comment buckets, doc source-of-truth, worktree pollution |
| `audit-churn-shotgun-history.md` (+`-v2`) | 54-day churn, co-change, shotgun surgery, defect clusters |

**Audit headline:** the codebase is healthy (0 `any`, 0 source-text tests, 0 leaks, 1 cycle,
all gates green). Debt is concentrated in three mechanisms: unenforced invariants, verification
blind at boundaries, and stale routing metadata. **GO for a narrow verification-first evolution;
NO-GO for a broad refactor.**

**Key verdicts that must not be re-litigated:**
- F21-2 (Gold sizing) is **NOT a bug** — it satisfies D.20.6. The defect is the ambiguous `pts`
  label meaning different things in Lotaje vs TradePanel.
- Angular 22: **NO-GO now.** NgRx 22 is RC-only (`latest` = 21.1.1), Angular 22 requires
  TypeScript `>=6.0 <6.1` (repo has 5.9.x) and Node `^22.22.3` (local 22.13.0).
- Angular **21.2.19** (`v21-lts`) fixes all 6 production CVEs inside the existing `^21.2.0`
  range with zero breaking changes. Never `npm audit fix --force` (it downgrades the CLI).

### B2. Baseline for the parallel session — VERIFIED
`develop` @ **`a2ca53b`**, zero drift from origin, clean tree. All four gates run raw by the
orchestrator: tsc app 0, tsc spec 0, lint 0 ("All files pass linting."), ng test 0 —
**182 files / 2373 tests passed.**

### B3. Five parallel agent streams — IN PROGRESS

| Agent | Branch / worktree | Mission | Deliverable file |
|---|---|---|---|
| **A** | `agent/landing-product-showcase` · `…-landing` | Standalone `landing/`, product-as-hero, Vercel-ready | `LANDING_PRODUCT_BRIEF.md`, `LANDING_IMPLEMENTATION_REPORT.md` |
| **B** | `agent/unit-authority` · `…-units` | tick/pip/point semantics; verdict on index `pointSize` | `UNIT_AUTHORITY_INVESTIGATION.md` |
| **C** | `agent/session-sync-red-team` · `…-sync` | Prove/refute `absence ⇒ deletion` reachability | `SESSION_SYNC_RED_TEAM.md` |
| **D** | `agent/verification-integrity` · `…-verification` | TradePanel DOM tests, 19 selector leaks, CI on develop | `VERIFICATION_INTEGRITY_REPORT.md` |
| **E** | `agent/routing-hygiene` · `…-routing` | Stale ROADMAP/RFC headers, `.claudeignore` | `ROUTING_HYGIENE_REPORT.md` |

Every agent maintains `PROGRESS.md` at its worktree root, committed continuously, ending in a
self-contained `## RESUME BRIEF`. **Git is the source of truth for their progress, not this file.**

---

## C. Owner decisions still outstanding

1. **Index `pointSize`** — `execution-costs.ts:76` returns `1` where the generated registry says
   `0.01` for NAS100/SP500/US30. Agent B is adjudicating. If it returns
   `OWNER DECISION REQUIRED`, this is the highest-value question in the whole programme.
2. **`pts` vocabulary** — Lotaje `pts` = price units; TradePanel `pts` = broker points. Fixing
   requires a product wording decision; D.20.6 must not be revoked implicitly.
3. **Next product wave** — the repo documents no plan beyond RFC-016. RFC sequencing is
   provisional until the owner states the next direction (multi-symbol is the presumed candidate).
4. **Vercel target for the landing** — must be a NEW project; the emulator's production project
   (`prj_KpNe7NDXP95iXljbwcZCh4Wcv0Wo`) must not be touched.
5. **Branch protection** — no GitHub MCP/CLI path; a human dashboard action. `main` (auto-deploys
   to production) and `develop` are both currently unprotected across 58 branches.
6. **Product screenshots** — login is required with no guest mode; an agent cannot authenticate.
   Owner signing in once at the local dev server would let real captures replace reconstructions.

---

## D. What synthesis must still produce

Finish `PARALLEL_EVOLUTION_SYNTHESIS.md` with:
1. Baseline *(already written)*
2. Per-agent outcome: mission · verdict · key evidence · implementation · commit SHA · action
3. Decisions discovered, separated into: confirmed defects / intentional behaviour / stale docs /
   architectural debt / owner decisions / future product decisions
4. Landing: path, framework, narrative, sections, current vs future, Vercel state, URL if real
5. Units: final semantic truth table + `pointSize` verdict
6. SessionSync: reachability verdict + severity
7. Verification: boundary tests added + CI state
8. Routing: corrections + remaining stale areas
9. Revised roadmap based on the NEW evidence — do not preserve the audit's provisional RFC
   numbering out of inertia; if SessionSync is destructively reachable today, elevate it; if
   `pointSize` is correct, close it explicitly
10. Integration plan: per branch — `MERGE AS-IS` / `MERGE AFTER <changes>` / `DO NOT MERGE` /
    `RESEARCH ONLY`; plus the safest order where branches touch overlapping files
11. **Work suitable for cheaper/future agents** — mechanical items that do not need Opus-level
    reasoning: lint cleanup, 30 dead exports, comment cleanup, CSS polish, dependency
    housekeeping, `file:///` link fixes, plan status banners

**Invariant adjudication before any lint rule.** For each architectural invariant classify:
`CURRENT LAW` / `TEMPORARY RFC CONSTRAINT` / `SUPERSEDED` / `VIOLATED AND MUST BE RESTORED` /
`OWNER DECISION REQUIRED`. **Never turn stale prose into a permanent lint rule.** Known state:
I1 clause 1 holds (0 violations) but clause 2 is violated via public `chartApi`/`seriesApi`;
I2 is violated (5 core edits post-registry); I3 holds for cloud DTOs but is violated locally by
`Workspace` embedding `Candle[]`; I4 and I5 genuinely hold; I6 (state-first) does not hold.
