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
- [x] Checkpoint 1 — **GATE**: Batch A audit (Tasks 1+2) → **NOT PASS** (3 Medium) →
      fix commit `3a9185e` → **re-audit PASS ("Ship it")**
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

### Checkpoint 1 — Batch A audit (`branch-auditor`, Opus) over `4ff74e7..7df6356`

**VERDICT: NOT PASS.** All four gates green in the auditor's own re-run
(77/1016, tsc clean, lint 0, `format:check` clean, `npm run build` clean with no new
chunk types — only the known 611 kB Arrow/parquet budget warning). Every structural
invariant held: `domain/risk/` dependency-free, `lotsForRisk` the only lot source,
`pipSizeFor` correct on input classes the spec never listed (`''`, `XAUEUR`, `EURXAU`,
`EURUSDX`, `JPYUSD`), the honest states genuinely exclusive in the template, zero Task 3
scope leak, no new deps. The auditor also re-derived the baseline instead of trusting it:
1016 − 15 new `it()` = **1001**, 77 − 2 = **75**. The defects were in *what the code said*
and *what the tests actually proved*:

- **M1 (Medium).** `minLotWarning` fired on any >1 % difference but hardcoded both the
  floor narrative and the "above" direction. On an ordinary retail trade — 5000 / 1 % /
  EURUSD 1.1000→1.0940 — it rendered, inside a `role="alert"`: «El mínimo de 0.01 lotes
  arriesga $48.00, por encima de los $50.00 solicitados» while showing 0.08 lots. Two
  false claims (the floor never applied; $48 is *below* $50) next to the figures that
  contradict them. Spec §3.1 had assigned the rounding case to this same mechanism; the
  mechanism was reused, the wording never was — and the Task 2 report had not caught it.
- **M2 (Medium).** The three honest-state tests guarded the headline failure mode with
  `not.toContain('0.00 lotes')`, which `preserveWhitespaces: false` makes **unsatisfiable**
  — the DOM renders `1.00lotes`, no space. The guard could never fail.
- **M3 (Medium).** The acceptance test — spec §4's «el test que da sentido al trabajo» —
  asserted whole-page substrings that other fields also produce. The auditor deleted the
  lot figure from the DOM and the test still passed.
- **L1 (Low).** The inverse block rendered a fabricated `0.00 %` when balance ≤ 0.
- **L2 (Low).** «$/punto por lote» is the wrong unit off index CFDs (EURUSD showed
  «100,000 $/punto por lote» beneath a pip distance) — this was the Task 2 report's own
  requires-attention deviation #6, confirmed as Low: no path from that line to a wrong
  position size.
- **L3, L4 — ruled NO-FIX with written reasons** (`decision-frameworks.md` §6), so they
  are not re-litigated: `invalidReason`'s priority order (every ordering shows one of
  several simultaneously-true conditions; the message shown is never false; the order
  mirrors `lotsForRisk`'s own) and the two differently-clamped % inputs (spec §3 requires
  both; the clamp is pre-existing shared-primitive behaviour; the caption discloses it;
  verified no silent write-back).

### Fix — `fix(calculadora): mensaje de aviso honesto y tests que fijan lo que afirman`

- **Commit:** `3a9185e` (`7df6356..3a9185e`), 3 files, +193/−35, all inside
  `pages/calculadora/`. `domain/risk/`, `trading.models.ts`, `app.routes.ts` and
  `app.html` untouched.
- **Orchestrator decision (recorded, not improvised):** the fix brief covered **M1–M3
  plus L1 and L2**, not the Mediums alone. Both Lows live in the two files already open,
  both are cheap, and each defeats a purpose the spec states outright — L1 reproduces the
  «0.00 reads as valid» failure §3.1 exists to prevent, and L2 defeats §5's «make the
  applied assumption checkable before operating» (a trader cross-multiplying 60 pips ×
  100,000 gets 6,000,000 instead of $600). L3/L4 stay no-fix.
- **M1 closed:** the message now branches on cause (`lots() === 0.01 && actual > requested`
  = the floor signature — the minimum can only push risk *up*) and on direction, using
  only already-computed values. **No "raw lots before rounding" is computed anywhere**;
  that would have been the second sizing formula this run exists to prevent.
- **M2/M3 closed:** assertions now pin elements (`.lots-hero`, `.lots-value`,
  `.requested-risk-value`, `.distance-value`) instead of whole-page substrings, and the
  parity test spec §4 asked for now exists — three cases (acceptance, floor, rounding)
  comparing the rendered figure against `lotsForRisk` **called from the test**. Calling
  the real function is the parity assertion; hand-deriving the arithmetic is what stays
  forbidden.
- **Red-before-green evidence** (demanded in the brief, since a test that would have
  passed before the fix has closed nothing): M1 — reverted `minLotWarning` to the pre-fix
  one-liner and captured the new test failing with the audit's exact false string. M2 —
  the production code was already correct, so the implementer injected the regression the
  guard exists to catch (hero rendering beside the invalid-state message), showed all
  three new assertions red **and the reinstated old assertion passing** against the same
  regression. M3 — deleted `.lots-hero` from the template, showed the four new tests red
  while an old-style substring test still passed. All reverts removed before the commit;
  `git status` clean.
- **Evidence — gates re-run by the ORCHESTRATOR:** tsc app clean · tsc spec clean ·
  `npx ng test --watch=false` → **77 files / 1023 tests passed** · `npm run lint` 0 ·
  `npm run format:check` clean.
- **Test-count arithmetic:** 1016 → 1023 = +7 (14 `it()` in the page spec, up from 7).

### Checkpoint 1 re-audit (`branch-auditor`, Opus) over `3a9185e` — **PASS ("Ship it")**

Gates re-run by the auditor: 77 files / **1023 tests**, tsc app+spec clean, lint 0,
`format:check` clean, `npm run build` clean at 611.21 kB with **no new chunk types** (the
page is still tree-shaken out — correct, nothing routes to it before Task 3). Arithmetic
re-derived independently: the page spec now has 14 `it()` (was 7) → +7 → 1023, and
`git diff 5b3f521 HEAD -- domain/risk/` is empty, so the whole delta is the page spec.

**The auditor did not accept the fix report's red-before-green claim** — it injected its
own mutations. Mutation A bound the lots hero to `manualLots()` instead of `lots()` (the
mutation that had escaped the *entire* old suite) and reverted M1's message: the two
parity cases and the rounding test went red. Mutation B rendered the hero beside the
invalid message: all three honest-state guards went red. Six guards confirmed
load-bearing.

M1's boundary was mapped case by case rather than spot-checked — raw lots just under
0.01, just over, exactly 0.01 (no warning, correctly), and both sides of the 1 % threshold
(24.75 warns at relDiff 1.0101 %; 24.755 stays silent at 0.9897 %, exclusive per spec
«> 1 %»). The original false message now reads «El redondeo al paso de 0.01 lotes arriesga
$48.00, **por debajo de** los $50.00 solicitados.»

Two things the auditor examined hardest and cleared explicitly, so they are not
re-litigated: (1) at raw 0.008 the message says «mínimo de 0.01 lotes» although `Math.max`
never clamped (`round2(0.008)` is already 0.01) — true as rendered, and no smaller size is
tradeable either way, so the trader's takeaway is identical; (2) test (a) alone still
passes under Mutation A because the prefilled `manualLots = 1` coincidentally renders
`1.00` — the parity floor and rounding cases are what actually close M3, and they do.

**New finding L5 — ruled NO-FIX with written reasons, and OWNER-VISIBLE.**
`USDJPY → 1,000 $/pip por lote` overstates the pip value: the true value of one lot is
¥1,000 ≈ $6.70. The model performs **no quote-currency conversion**. No-fix because
(1) it is not introduced here and not a regression — it is a property of
`contractSizeFor`/`lotsForRisk` in the already-audited `trading.models.ts`, and it governs
every figure on the page identically (the same trade renders «Riesgo real $500.00» where
the true figure is ~$3.35); the previous «100,000 $/punto por lote» carried the identical
error in a unit nobody cross-checks. (2) Currency conversion is an explicit spec non-goal,
so there is no in-scope correct fix — inventing an FX rate here is exactly the
confident-wrong-number failure the Futures deferral exists to prevent. (3) Parity with the
emulator is this run's stated purpose; diverging on this one line would break the
invariant the feature exists to guarantee. **Consequence:** the deferred follow-up spec
(design doc §6) now has a second reason to exist beyond Futures — quote-currency
conversion. This goes in the PR body.

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
