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

**Working artifacts:** `.superpowers/calculadora/task-N-{brief,report}.md` (local only,
untracked — kept out of `.superpowers/sdd/` so the previous run's briefs there survive).

## Tasks

- [x] Task 1: `domain/risk/risk-calculator.ts` — four pure parameterized functions (LOW)
- [x] Task 2: `pages/calculadora/` — page composing `lotsForRisk`/`contractSizeFor` with
      the three honest states and the 0.01-floor warning (MEDIUM — correctness core)
- [ ] Checkpoint 1 — **GATE**: Batch A audit (Tasks 1+2). PASS required before Task 3.
- [ ] Task 3: lazy `/calculadora` route (`authGuard`, **no** `r2OnboardingGuard`) + nav
      link after «Nueva sesión» (LOW)
- [ ] Final: four gates + `npm run build` + invariant greps + whole-branch Opus audit
- [ ] PR → `main` (GitHub MCP), then back-merge `main → develop`

## Completed

### Task 1 — `feat(risk): módulo puro de cálculo de riesgo parametrizado`

- **Commit:** `5b3f521` (`4ff74e7..5b3f521`)
- **Scope actually touched:** exactly the two files in the brief —
  `emulador/src/app/domain/risk/risk-calculator.ts` (+44) and
  `risk-calculator.spec.ts` (+45). `git show --stat` confirms 2 files / +89 / −0;
  `git status` shows no stray staged or modified files.
- **Evidence — gates re-run by the ORCHESTRATOR, not taken from the report:**
  `npx tsc -p tsconfig.app.json --noEmit` clean · `npx tsc -p tsconfig.spec.json --noEmit`
  clean · `npx ng test --watch=false` → **76 files / 1009 tests passed** ·
  `npm run lint` → "All files pass linting" (0 problems).
- **Test-count arithmetic:** 1001 → 1009 = +8, and the plan's Task 1 block specifies
  exactly 8 `it()` blocks (4 `pipSizeFor` + 1 `priceDistance` + 1 `riskUsdFor` +
  2 `riskForLots`). Consistent.
- **Invariants:** `grep -rn "from '.*state/" emulador/src/app/domain/risk/` empty ·
  `Math.max(0.01` in `domain/risk/` empty · `@angular|@ngrx` in `domain/risk/` empty ·
  no `package.json`/lockfile diff vs `origin/main`. Verified against the committed source:
  `pipSizeFor` discards `XAU*`/`XAG*` before testing `/^[A-Z]{6}$/`, mirroring
  `contractSizeFor`.
- **Deviations (2, both inert):**
  1. `npm run format` reflowed the `riskForLots` signature onto one line — whitespace only.
  2. An additive module-level doc comment stating the Dependency Rule and the Futures
     exclusion, on top of the required `pipSizeFor` order comment.
- **One reported non-finding, checked and agreed:** the `spec-util` grep matches two
  **doc-comment** lines in `state/layout/layout-invariants.ts`, a pre-existing untouched
  file. Not an import, so kernel invariant 7 (no vitest in the prod bundle) holds. Inert.

### Task 2 — `feat(calculadora): página de dimensionado CFD/Forex con estados honestos`

- **Commit:** `085c08d` (`5b3f521..085c08d`)
- **Scope actually touched:** exactly the four files in the brief, all new —
  `calculadora-page.component.{ts,html,css,spec.ts}` under `pages/calculadora/`.
  `git show --stat` confirms 4 files / +549 / −0. **Task 3's files are untouched:**
  `git diff --stat origin/main -- app.routes.ts app.html` is empty.
- **Evidence — gates re-run by the ORCHESTRATOR:** tsc app clean · tsc spec clean ·
  `npx ng test --watch=false` → **77 files / 1016 tests passed** · `npm run lint` →
  "All files pass linting" (0 problems).
- **Test-count arithmetic:** 1009 → 1016 = +7, matching the 7 `it()` blocks (the plan's
  six required cases, with (c) split into balance and risk % — see deviations).
- **Composition rule verified by reading the source, not the report:**
  `calculadora-page.component.ts:5` imports `contractSizeFor`/`lotsForRisk` from
  `state/trading/trading.models`; `domain/risk/` still imports nothing from `state/`.
  Direction of dependency is page → {domain, state}, never domain → state.
- **The prohibition holds:** `grep -rn "lotsForRisk" pages/calculadora/` returns one
  import (line 5), one call site (line 65), and doc-comment prose. No second sizing
  formula; `Math.max(0.01` appears nowhere in either new directory.
- **The floor warning is two-sided,** which is the point: spec case (d) — 100 / 0.1 % /
  40000→39950 — asserts `$0.50` and `$0.10` render; case (e) asserts the acceptance case
  does **not** contain «mínimo de 0.01 lotes». A warning that always fires is not a
  warning, and (e) is what proves it does not.
- **Deviations (6 — five inert, one requires-attention):**
  - *Inert:* (1) a first-draft doc comment quoted `Math.max(0.01, …)` and tripped the
    implementer's own invariant grep; reworded **before** the commit, so the grep is
    genuinely clean rather than needing an auditor's judgment call — self-caught and
    self-reported. (2) ASCII-only commit body (the subject line keeps its accents).
    (3) seven tests instead of six. (4) `invalidReason` checks SL = entry before the
    non-positive branch — an unspecified priority, chosen to mirror `lotsForRisk`'s own
    order; no required case exercises the overlap. (5) inputs prefill with the acceptance
    case so the page opens on a working example.
  - *Requires-attention:* (6) the contract-size line uses one fixed wording,
    «{símbolo} → {contractSize} $/punto por lote», for **every** instrument. It is
    numerically true in this domain model (`contractSize` is $ per 1.0 price-unit per lot
    everywhere), but on a forex pair it renders «100000 $/punto por lote» beside a
    distance shown in pips, which may read oddly. Not a defect and not a sizing error —
    a copy decision the task was not asked to make. **Owner-visible item.**

## Deviations

- Task 1: two, both inert (formatter reflow; additive doc comment).
- Task 2: six — five inert, one **requires-attention** (#6, contract-size line wording).
  All are described above and were self-reported by the implementer.

## FINAL-AUDIT ATTENTION flags

- Nothing from Task 1: +89 lines across two new pure files, no private APIs, no DI.
- **Task 2 is the largest diff of the run (+549) and carries all of its arithmetic.**
  Read line by line: (a) that `lots` flows only from `lotsForRisk`; (b) that
  `minLotWarning`'s 1 % threshold cannot fire on the acceptance case nor stay silent on
  the 5× case; (c) that `invalidReason` replaces the lot figure instead of rendering
  beside it; (d) that `distanceValue` divides by `pipSize` only when it is non-null.
- No private-API use anywhere in the run. Public NgRx surface only
  (`store.selectSignal(selectAssets)`), no `dispatch`, no effects, no subscriptions.
