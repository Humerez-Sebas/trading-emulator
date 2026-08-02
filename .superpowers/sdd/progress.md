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
- [x] Task 3: lazy `/calculadora` route (`authGuard`, **no** `r2OnboardingGuard`) + nav
      link after «Nueva sesión» (LOW) — **committed, gates NOT yet re-run by the
      orchestrator (see below)**
- [x] Final gates + `npm run build` + invariant greps (all green, recorded below)
- [x] Whole-branch Opus audit → **NOT PASS** (1 High, 1 Medium) → fix `dfa5dc9` →
      re-audit **NOT PASS** (1 High, fix-introduced) → fix `8b6093a` →
      **re-audit PASS ("Ship it")**
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

### Task 3 — `feat(calculadora): ruta lazy /calculadora y enlace de navegación`

- **Commit:** `8140c56` (`3c252be..8140c56`), 3 files, +46/−0.
- **Scope actually touched (orchestrator diff-scan):** `app.routes.ts` (+10),
  `app.html` (+1), `app.routes.spec.ts` (+35, new). Nothing else; `git status` clean apart
  from the four pre-existing untracked dirs.
- **Read from the committed source, not the report:** the route sits **between**
  `sesiones/crear` and `{ path: '**' }` — before the wildcard, as required — carries
  `canActivate: [authGuard]` with **no `r2OnboardingGuard`** and a comment saying why, and
  loads lazily via `loadComponent`. The nav link is on the line after «Nueva sesión»,
  without `[routerLinkActiveOptions]` (correct: `/calculadora` is nobody's prefix, same as
  `/mercados`).
- **Evidence — gates re-run by the ORCHESTRATOR on resume (2026-08-02):** tsc app clean ·
  tsc spec clean · `npx ng test --watch=false` → **78 files / 1028 tests passed** ·
  `npm run lint` 0 · `npm run format:check` clean. `app.spec.ts` stayed green untouched.
- **Test-count arithmetic:** 1023 → 1028 = +5, matching the 5 assertions in the new
  `app.routes.spec.ts`.
- **Honest note from the implementer's report, carried forward for the auditor:** during
  TDD only 3 of the 5 new assertions went red pre-implementation. The two guard-membership
  assertions passed **vacuously**, because `calculadoraRoute?.canActivate` was `undefined`
  and vitest's `toContain`/`not.toContain` do not throw on an undefined actual. The
  implementer states they are non-vacuous now that the route exists. That claim is worth a
  mutation check in the final audit, not a re-read.
- **Deviations (2, both inert):** the new `app.routes.spec.ts` (pre-authorized in the
  brief — the plan's File Structure lists only the two modified files, but the protocol
  requires a failing test first, and a route with the wrong guard is exactly what a diff
  read misses); and the optional nav-link render test was skipped, as the brief permitted.

_(The run was paused here at the owner's request for one session, then resumed. Task 3's
gates and the branch-level verification below were run on resume.)_

## Final branch verification (orchestrator, 2026-08-02)

- **Four gates + `format:check`:** all green at `4cf1252` — 78 files / **1028 tests**,
  tsc app+spec clean, lint 0, Prettier clean.
- **`npm run build`:** success. Initial total **611.53 kB** (the auditor measured
  611.21 kB pre-Task-3; the +0.32 kB is the route entry itself). **No new chunk types** —
  no vitest sentinel. The one new lazy chunk is `calculadora-page-component` at 10.93 kB,
  which is precisely what Task 3 was for: before the route existed the page was
  tree-shaken out entirely. The 500 kB budget warning is the known-accepted
  Arrow/parquet-dominated baseline, not a regression of this branch.
- **Invariant greps — all clean:**
  - `grep -rn "from '.*state/" emulador/src/app/domain/risk/` → **empty** (Dependency Rule)
  - `grep -rn "Math.max(0.01" pages/calculadora/ domain/risk/` → **empty** (the floor stays
    `lotsForRisk`'s alone)
  - `grep -rn "lotsForRisk(" emulador/src/app --include=*.ts` → in this branch's surface,
    exactly one app call site (`calculadora-page.component.ts:65`) plus the parity test.
    All other hits are pre-existing (`chart.component.ts`, `trade-panel.component.ts`,
    `trading.reducer.ts` and their specs) and untouched by this branch.
  - `spec-util` in app code → only the two known-inert doc-comment lines in
    `state/layout/layout-invariants.ts`
  - `git diff --stat origin/main -- package.json package-lock.json` → **empty**
- **Whole-branch diff vs `origin/main`:** 13 files, +1750/−28 — 3 committed docs
  (spec, plan, orchestrator prompt), the ledger, and 9 code files. Nothing outside the
  declared scope.

## Whole-branch audit (`branch-auditor`, Opus) over `b8ae481..70dfe74` — **NOT PASS**

Every gate green in the auditor's own run (78/1028, lint 0, Prettier clean, build
611.53 kB with no new chunk types), every kernel invariant clean, and the ledger
arithmetic re-derived from scratch rather than accepted: `it()` counts 8 + 14 + 5 = 27,
`1028 − 27 = 1001`, `78 − 3 = 75`, and `git diff --name-only origin/main...HEAD | grep
spec.ts` returns **only those three files** — no pre-existing spec was edited, so the
derivation is airtight. It also killed all three Task 3 route-test mutations
(adding `r2OnboardingGuard`, emptying `canActivate`, moving the wildcard), closing the
implementer's honest vacuity note, and probed the route against the **real** Store and
Router: the page lazy-loads, renders correctly with `assets: []`, and an anonymous user
does not reach it.

Two findings, both in the page's **input surface** — invisible to every previous check
because all 14 page tests set the component's signals directly and none crossed the DOM:

- **F1 (HIGH).** The five numeric fields bound `[value]="signal()"` and did
  `signal.set(Number(target.value))` on every `input` event. `Number('')` is `0`, and
  `<input type="number">` returns `''` for any invalid intermediate text (`"1."`, `"-"`,
  a cleared field). So mid-keystroke the signal collapsed to `0`, the binding changed, and
  Angular wrote `"0"` back into the field. **Typing `1.10952` left to right was
  impossible** — the field snapped to `0` at the decimal point, every time, in Entrada,
  Stop Loss, the free Riesgo % field and Lotes. Clearing a field was impossible too. On a
  page titled *CFD/Forex*, whose own suite uses `EURUSD 1.1 → 1.094`, the shipped UI could
  not accept those values from a keyboard. Index CFDs have integer prices, which is
  exactly why the prefilled acceptance case and all 14 tests passed.
- **F2 (MEDIUM).** None of the six inputs had an accessible name — `<div class="ui-field">`
  plus a `<span>` with no `for`, and inputs with no `id`/`aria-label`. A screen reader
  announced five indistinguishable spin buttons on a page whose whole purpose is putting
  the right number in the right field. Production path, so §6 bars a convenience no-fix.
- **L6, L7, L8 — ruled NO-FIX with written reasons.** L6: `invalidReason` does not reject
  a *finite* negative SL — spec §3.1 lists exactly three honest states, and `lotsForRisk`
  has the identical behaviour, so rejecting it here would break the emulator-parity
  invariant this feature exists to guarantee; the correct home is `trading.models.ts`,
  which this branch may not touch. L7: the symbol echoes un-normalized (`eurusd`) —
  display-only, every figure correct. L8: the `ui-dropdown` branch had no coverage —
  test-code only, and the auditor exercised it against the real store and found it
  correct.

### Final fix — `fix(calculadora): entradas que aceptan decimales y campos con nombre accesible`

- **Commit:** `dfa5dc9` (`70dfe74..dfa5dc9`), 3 files, +286/−37, all inside
  `pages/calculadora/`. Frozen files confirmed untouched:
  `git diff --stat 70dfe74 -- domain/risk/ app.routes.ts app.html app.routes.spec.ts` is
  empty.
- **F1 closed by a design change, and the reason is worth keeping.** The implementer
  probed jsdom directly and found that `<input type="number">.value` sanitizes incomplete
  float text to `''` *on assignment*, before any Angular code runs — so **neither** repo
  precedent cited in the brief could have survived while keeping `type="number"`. The five
  fields became `type="text" inputmode="decimal"` with raw string signals (`entryText`, …)
  bound to `[value]` and parsed by separate `computed(() => parseFloat(...))` — which is
  structurally the `trade-panel.component.ts` pattern. `parseFloat('')` is `NaN`, never
  `0`, so a cleared field drives an honest state instead of a confident wrong figure.
- **Two consequential guards, both reasoned in-code:** `invalidReason` gained
  `!Number.isFinite(sl())` — a **NaN check, not a positivity check**, so L6's ruled-no-fix
  behaviour (finite negative SL still produces a figure, matching `lotsForRisk`) is
  deliberately preserved; and `manualRiskUsd` gained NaN guards, since the inverse block
  does not sit behind `invalidReason`.
- **Red-before-green evidence:** 7 failures captured against the unfixed component (fields
  snapping to `0`; no accessible name), then green with `1.10952` and `2650.50` surviving
  keystroke-by-keystroke DOM entry. The new tests drive the real `<input>`
  (`el.value = …; dispatchEvent(new Event('input'))`), which is what makes them able to
  fail at all.
- **L8 coverage added** (dropdown renders; `onAssetPick('XAUUSD')` re-sizes through
  `contractSizeFor`) — green before the fix too, confirming it was a gap, not a defect.
- **Evidence — gates re-run by the ORCHESTRATOR:** tsc app+spec clean ·
  `npx ng test --watch=false` → **78 files / 1037 tests passed** · lint 0 ·
  `format:check` clean · `npm run build` success, initial total **611.53 kB unchanged**,
  no new chunk types.
- **Test-count arithmetic:** 1028 → 1037 = +9 (page spec 14 → 23).
- **Implementer-flagged for audit attention (honest, not a defect claim):** the Riesgo
  group was wrapped in `<label>` per the brief's literal six-field list even though it
  holds two controls (the slider and the free field), made safe by an explicit `aria-label`
  on the free field.

## Whole-branch re-audit over `dfa5dc9` — **NOT PASS** (1 High, introduced by the fix)

F1 and F2 confirmed genuinely closed, with the auditor's own probes rather than the
report's: every intermediate keystroke of `1.10952` and `2650.50` survives, the trailing
zero is not canonicalized away, clearing lands in the honest state, all six inputs have
accessible names (checked via `input.labels`, the spec-accurate association, not
`closest()`), L6's finite-negative-SL behaviour is preserved exactly, and **no NaN reaches
the screen**. Both F1 mutations were killed (reverting the field to `type="number"`;
reinstating the numeric write-back). The `type="number"` sanitization claim was verified
independently and the design change stands.

**One correction the auditor put on the record, worth keeping:** the code comment implies
*no* `type="number"` approach could have worked. Not quite — `risk-slider`'s
`parseFloat` + `isNaN` guard would have stopped the clobbering (which is why that
component has no such bug). What it could not do is distinguish a **cleared** field from a
mid-decimal one, since `.value` is `''` for both, leaving a stale value behind an empty
box. The design change is still the right call; the justification as written is stronger
than the facts support.

- **F3 (HIGH).** `parseFloat` stops at the first character it cannot consume and returns
  the prefix. `parseFloat('2650,50')` is **`2650`** — and the comma is the decimal
  separator on a Spanish numeric keypad and on a Spanish-locale phone's
  `inputmode="decimal"` keypad, in an app whose UI is Spanish throughout. Measured on
  XAUUSD / 5000 / 1 %: `2650,50 → 2648,00` renders **0.25 lots** where `2650.50 → 2648.00`
  renders 0.20 — a **25 % oversized position**, with no honest state, no warning, the field
  still displaying `2650,50`, and «Riesgo real 50.00 $» *false* (the real loss at the true
  2.5-point stop is $62.50). `parseFloat('1.5abc')` → `1.5` shares the root cause. This is
  the failure class the spec itself cites when deferring Futures — «dimensionado
  incorrecto con apariencia de autoridad» — and the F1 fix caused it by moving off
  `type="number"`, which is what had been normalizing the comma.
- **L9, L10, L11 — ruled NO-FIX with written reasons.** L9: clearing Cuenta/Riesgo feeds
  `NaN` to `app-risk-slider`, so `[style.width.%]` emits `NaN%`, the CSSOM rejects it and
  the thumb keeps its last valid position while the field is empty — cosmetic, no NaN text
  on screen, and the stale pixel lives in the shared `risk-slider.component.ts` this branch
  may not widen scope to touch. L10: the Riesgo `<label>` wraps two controls so the
  slider's computed name absorbs the tooltip text — verbose, but a strict improvement over
  no name, and the alternative means editing the same shared component. L11 was test-code
  only and got fixed anyway in the next commit. **L8 is now closed** — the dropdown-branch
  test the auditor recommended exists.

### F3 fix — `fix(calculadora): parsear el número completo o rechazarlo (coma decimal)`

- **Commit:** `8b6093a` (`85ad656..8b6093a`), 2 files, +131/−12. Template unchanged;
  `domain/risk/`, `app.routes.ts`, `app.html`, `components/` all confirmed zero-diff.
- **The fix is one helper, deliberately:** `parseDecimal` = trim → empty-as-`NaN` →
  comma-to-dot → `Number(...)`, which unlike `parseFloat` requires the **whole** string to
  parse. All five computeds use it, so the parsing rule cannot drift between fields. The
  `Number('') === 0` trap is handled before `Number` sees the string, with a comment saying
  why — that is the F1 bug class and it must not come back.
- **What the DOM holds did not change.** `2650,50` keeps displaying as `2650,50` while the
  user types; only how the text is *read* changed. The two load-bearing carve-outs hold:
  mid-typing (`1.`, `1,`) still parses, so F1 stays closed, and finite negatives (`-1`)
  still parse, so L6's no-fix ruling stays true.
- **Red-before-green:** 3 of the 9 new tests failed against the unmodified `parseFloat`
  code — the comma-typed XAUUSD scenario rendering `0.25` instead of `0.20`, plus `1.5abc`
  and `1,234,56` parsing to non-`NaN`.
- **L11 closed in the same commit:** the accessible-name test now uses
  `input.labels.length > 0` instead of `closest('label') !== null`, which was true for any
  descendant of a label even when the label did not name it.
- **Evidence — gates re-run by the ORCHESTRATOR:** tsc app+spec clean ·
  `npx ng test --watch=false` → **78 files / 1046 tests passed** · lint 0 ·
  `format:check` clean · `npm run build` success, initial total **611.53 kB unchanged**.
- **Test-count arithmetic:** 1037 → 1046 = +9 (page spec 23 → 32).

## Whole-branch re-audit over `8b6093a` — **PASS ("Ship it")**

Gates re-run by the auditor: 78 files / **1046 tests**, tsc clean, lint 0, Prettier clean,
build **611.53 kB unchanged**, no new chunk types (the lazy `calculadora-page-component`
chunk grew 11.67 → 11.70 kB). Arithmetic re-derived: 32 + 8 + 5 = 45 new `it()`;
`1046 − 45 = 1001` = the baseline; `78 − 3 = 75` files.

- **F3 closed at the DOM.** The original reproduction now renders **identically** for both
  separators: `2650,50 → 2648,00` and `2650.50 → 2648.00` both give `2.5 puntos` and
  **0.20 lots**. The whole behaviour table walked and confirmed, including `1e5` → 100000,
  `+40100` → 40100, `  5  ` → 5, `1_000` → honest state, and grouped input in either
  locale format (`40.000,50`, `40,000.50`) landing on the honest state rather than a
  plausible wrong number.
- **F1 not broken again** — `1.10952` and `2650.50` re-verified keystroke by keystroke,
  trailing zero intact, clearing still honest; the comma path now works end to end
  (`2650,` → `2650,5` → `2650,50` → parsed 2650.5). `replace(',', '.')` replacing only the
  first comma is inert: `1,234,56` lands on `NaN` either way.
- **L6 re-verified precisely.** The auditor corrected a conflation in my own re-audit
  request: a negative *entry* correctly gets the honest state via `!(entry > 0)`, while a
  negative *SL* (EURUSD entry 1.1 / SL −1) still renders a real `0.01` lot figure with
  `invalid-state = null` — which is the behaviour L6 was ruled no-fix to preserve, for
  parity with `lotsForRisk`.
- **Both mutations killed.** Reverting `parseDecimal` → `parseFloat` turned 3 tests red
  (including the exact F3 symptom, `expected '0.25' to be '0.20'`); dropping *only* the
  comma normalisation turned 2 red — so the normalisation is independently load-bearing,
  not carried by the `Number` change. **L11's fix is load-bearing too:** turning Entrada's
  `<label>` back into a `<div>` fails the accessible-name test for the right reason.
- **Nothing frozen moved.** `git diff --stat origin/main...HEAD -- src/app/components/
  src/app/state/` is **empty** across the whole branch — `risk-slider.component.ts` and
  `trading.models.ts` are untouched, which is exactly what L9/L10 were ruled no-fix to
  protect.

### New Low — L12, ruled NO-FIX with written reasons

`Number` accepts three literal forms `parseFloat` rejected: `Infinity`, `0x10` → 16,
`0b101` → 5 (also `0o17` → 15). Measured: `Infinity` in Cuenta renders «∞ lotes»;
in Entrada it trips the floor warning loudly («arriesga $Infinity»); in Stop Loss the
`!Number.isFinite(sl())` guard already catches it. **No-fix, three reasons.** (a) Every
one requires typing a Latin letter into the middle of a number — impossible from a numeric
keypad. That is categorically different from F3, where the comma *was* the default decimal
key on the target locale's keypad; that difference is precisely why F3 was High and this
is Low. (b) The output is not a confident wrong figure — `∞` is unmistakable and cannot be
acted on, and the hex/binary forms need a deliberate `0x`/`0b` prefix and land so far off
that the floor warning fires. (c) The available fix — a post-normalisation shape regex —
would have to admit `1e5`, `+40100`, `.5`, `-1` and the mid-typing states `1.` and `1,`
that F1 depends on: a fourth round on an input path that has already produced one High,
spent on input nobody types. Documented accepted risk with a bounded, non-deceptive
failure mode, not a convenience ruling.

### Standing no-fix rulings at ship time

L3 (`invalidReason` priority) · L4 (two differently-clamped % inputs) · **L5 (no
quote-currency conversion — OWNER-VISIBLE, goes in the PR body)** · L6 (finite negative
SL) · L7 (symbol echoed un-normalised) · L9 (risk-slider stale visuals on a cleared
field) · L10 (Riesgo label's verbose computed name) · L12 (above). **L8 and L11 are
closed** by the last two fix commits.

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
