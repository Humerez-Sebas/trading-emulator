# SDD Progress Ledger — Calculadora de riesgo (CFD/Forex) v1

**Plan:** `docs/superpowers/plans/2026-08-01-calculadora-riesgo.md`
**Spec:** `docs/superpowers/specs/2026-08-01-calculadora-riesgo-design.md`
**Orchestrator prompt:** `docs/superpowers/2026-08-01-calculadora-orchestrator-prompt.md`
**RFC:** none — product track (`decision-frameworks.md` §1: not RFC territory; additive
feature over audited machinery, nothing hard to reverse).
**Branch:** `claude/calculadora-riesgo` (target: **`main`**, product track)
**Base commit:** `b8ae481` (= `origin/main` tip; branch carries only the three doc commits
plus merge `0509bf5` on top of it)
**Baseline test count:** **75 files / 1001 tests** passed (`npx ng test --watch=false`,
2026-08-02).

## Run mode — SEQUENTIAL, one batched review + final whole-branch audit

`decision-frameworks.md` §8 leaf: **batched mode**. Nothing here touches persistence or
migration, nothing reopens audited code (`trading.models.ts` is *consumed*, never
edited), and the plan carries no requires-attention risk of the kind that forces full
mode. All three tasks are additive: two new files, one new page, one route + one nav
link.

One deviation from plain batched mode, recorded as a decision: **Checkpoint 1 after
Task 2** runs a `branch-auditor` dispatch over Tasks 1+2 together (Batch A) *before*
Task 3. Reason: the 0.01-lot floor warning is the correctness core of the feature, and
Task 3 is what exposes the page to users — routing to arithmetic that has not been
audited is the wrong order. The final whole-branch audit still runs and still gates
the PR.

**No wave parallelism, deliberately.** The dependency chain is total (Task 2 consumes
Task 1's module; Task 3 mounts Task 2's page). Three worktrees plus three `npm ci` runs
to parallelize nothing would cost more than the run.

**Roles:** Implementer = `sdd-implementer`. Auditor = `branch-auditor` (Opus), which
re-runs every gate personally — implementer and orchestrator reports are claims, not
evidence.

## Base-drift note

`origin/main` is ~400 commits behind `develop`. Nothing from RFC-014..019 exists on this
base. Verified present on `b8ae481` by the orchestrator before dispatch:
`state/trading/trading.models.ts:190,202` (`contractSizeFor`, `lotsForRisk`),
`components/risk-slider.component.ts` (clamps to 0.1–5 → the page needs its own free
numeric field, per spec §3), `components/ui/` primitives (`index.ts` exports
`InputDirective`, `ButtonDirective`, `BadgeDirective`, `DropdownComponent`),
`state/selectors.ts:63` (`selectAssets` → `AssetMeta[] = { symbol, lastModified }`),
`app.routes.ts`, `app.html`. Note: the UI primitives live under
`components/ui/`, **not** `src/app/ui/` as the orchestrator prompt stated.

## Tasks

- [ ] Task 1: `domain/risk/risk-calculator.ts` — four pure parameterized functions (LOW)
- [ ] Task 2: `pages/calculadora/` — page composing `lotsForRisk`/`contractSizeFor` with
      the three honest states and the 0.01-floor warning (MEDIUM — correctness core)
- [ ] Checkpoint 1 — **GATE**: Batch A audit (Tasks 1+2). PASS required before Task 3.
- [ ] Task 3: lazy `/calculadora` route (`authGuard`, **no** `r2OnboardingGuard`) + nav
      link after «Nueva sesión» (LOW)
- [ ] Final: four gates + `npm run build` + invariant greps + whole-branch Opus audit
- [ ] PR → `main` (GitHub MCP), then back-merge `main → develop`

## Completed

_(nothing yet)_

## Deviations

_(none yet)_

## FINAL-AUDIT ATTENTION flags

_(none yet)_
