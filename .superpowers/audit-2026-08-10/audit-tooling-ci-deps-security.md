# TD Audit — Tooling, Static Enforcement, TypeScript Strictness, CI, Dependencies, Build Warnings, Security & Windows Workflow

Repo: `C:\Users\78701\Desktop\trading-emulator` · Branch `develop` · HEAD `a2ca53b`
(verified: `git log --oneline -1` → `a2ca53b Merge pull request #56 from Humerez-Sebas/chore/backmerge-main-into-develop`)
Date: 2026-08-10. Auditor mode: READ-ONLY (no repo file modified; only this report written).

---

## STATUS

**~92% complete.** All four verification gates, the production build, `npm ci --dry-run`,
`format:check`, and every strictness-flag probe were run to completion with fresh raw output.

### AREAS COMPLETE
- **1. TypeScript strictness** — all tsconfigs read; every currently-OFF flag measured with
  scratchpad configs (error counts per flag recorded below).
- **2. Lint & style tooling** — eslint config read, `npm run lint` run raw (EXIT=0),
  `npm run format:check` run raw (EXIT=0), stylelint absence confirmed for all 31 CSS files.
- **3. Build & warnings** — `npm run build` run raw (EXIT=0); full chunk table captured;
  bundle attributed to libraries; vitest-sentinel scan performed on `dist/`.
- **4. Dependencies** — package.json + `npm ls --depth=0` + `npm ci --dry-run` (EXIT=0);
  every dep cross-referenced against `src` imports; deep-import scan clean; pipeline deps read.
- **5. CI/CD** — `ci.yml` read in full; branch protection verified via GitHub MCP for all 58
  branches; local-vs-CI gate divergence identified.
- **7. Security** — innerHTML/sanitizer/eval/window.open/storage/secret scans all run.
- **8. Windows/shell workflow** — hooks, settings.json, commands, and `python` vs `py` verified
  empirically on this machine.

### AREAS PARTIAL
- **6. Static enforcement opportunities** — all six invariants checked for *current* compliance
  and for *existing* mechanism; proposed mechanisms and false-positive assessments written.
  NOT done: prototyping any candidate ESLint rule to empirically measure its false-positive rate
  against the real tree (recommended as the first step of any follow-up).
- **7. Security** — `pipeline/*.py` scanned only via the repo-wide tracked-file secret grep
  (`service_role|SECRET_ACCESS_KEY=...|JWT` patterns, clean). Individual pipeline files were not
  read line-by-line for credential handling; `r2_uploader.py` / `fill_r2.py` deserve a direct read.

### AREAS NOT STARTED
- None. (Every numbered area produced at least one evidenced finding.)

---

## RAW GATE EVIDENCE (fresh, this session, run from `emulador/`)

All gates were run raw — no `| tail`, no `| head`, no pipe that swallows the exit code.

```
$ npx tsc -p tsconfig.app.json --noEmit
EXIT=0                                     (no output)

$ npx tsc -p tsconfig.spec.json --noEmit
EXIT=0                                     (no output)

$ npx ng test --watch=false
 Test Files  182 passed (182)
      Tests  2373 passed (2373)
   Start at  21:19:59
   Duration  30.51s (transform 20.04s, setup 21.57s, import 43.49s,
                    tests 33.42s, environment 4094.15s)
EXIT=0

$ npm run lint
> ng lint
Linting "emulador"...
All files pass linting.
EXIT=0

$ npm run format:check
> prettier --check "src/**/*.{ts,html,css}"
Checking formatting...
All matched files use Prettier code style!
EXIT=0

$ npm ci --dry-run
up to date in 2s
164 packages are looking for funding
REAL_EXIT=0
```

**Verdict: the documented "develop is lint-clean, 0 problems" claim HOLDS as of a2ca53b.**
`npm ci --dry-run` succeeds — the npm-11.x optional-dep lockfile prune trap is NOT currently
present. Test count is now **2373 tests / 182 files** (MEMORY's last recorded figure was 1229 at
the end of the RFC-020 run, so the suite has grown substantially since).

### `npm run build` — RAW (EXIT=0)

```
Initial chunk files    | Names                          |  Raw size | Est. transfer
chunk-LMCKOV4N.js      | -                              | 219.12 kB |      48.58 kB
chunk-GPERLCK2.js      | -                              | 181.17 kB |      53.17 kB
chunk-5XP4DLYU.js      | -                              | 106.67 kB |      26.97 kB
chunk-RKOHTGBW.js      | -                              |  51.64 kB |      14.71 kB
main-64E3VM5X.js       | main                           |  34.02 kB |       8.97 kB
styles-OMZVO57W.css    | styles                         |  19.98 kB |       2.62 kB
chunk-7IAOOBGD.js      | -                              |  14.62 kB |       4.78 kB
chunk-6YLULN3M.js      | -                              |   6.69 kB |       1.70 kB
chunk-7LIZVGXE.js      | -                              |   3.98 kB |       1.47 kB
chunk-WYU4LLTQ.js      | -                              |   3.89 kB |       1.42 kB
chunk-GN663V53.js      | -                              |   3.69 kB |       1.45 kB
chunk-D36WZNOR.js      | -                              |   2.24 kB |     737 bytes
chunk-NHQ6MMHE.js      | -                              |   1.44 kB |     555 bytes
chunk-CS4IICSY.js      | -                              |   1.34 kB |     557 bytes
chunk-XMILIWU4.js      | -                              | 749 bytes |     749 bytes
chunk-57ISNX2G.js      | -                              | 378 bytes |     378 bytes
chunk-BYXBJQAS.js      | -                              |   0 bytes |       0 bytes
                       | Initial total                  | 651.60 kB |     168.81 kB

Lazy chunk files       | Names                          |  Raw size | Est. transfer
chunk-AJL774JP.js      | Arrow-dom                      | 216.38 kB |      42.88 kB
chunk-AD2UKQKD.js      | emulador-page-component        | 213.03 kB |      43.78 kB
chunk-FI44TU3B.js      | -                              | 190.41 kB |      53.09 kB
chunk-G4VEDQIF.js      | sesiones-page-component        |  53.35 kB |      12.93 kB
chunk-4XCTHBXM.js      | calculadora-page-component     |  47.28 kB |      10.45 kB
chunk-V7L7IHGK.js      | journal-page-component         |  45.87 kB |       8.93 kB
chunk-KPCHUAVT.js      | reflection-cabin-page-component|  36.23 kB |       9.78 kB
chunk-L6IDGVY5.js      | parquet_wasm                   |  34.19 kB |       7.16 kB
chunk-MVNXAZY3.js      | auth-page-component            |  33.78 kB |       8.10 kB
chunk-FAPJ2IS7.js      | -                              |  17.86 kB |       5.39 kB
chunk-4RWKQTZX.js      | crear-sesion-page-component    |  17.45 kB |       5.01 kB
chunk-FOU4F2XN.js      | mercados-page-component        |  15.45 kB |       4.57 kB
...and 8 more lazy chunks

Application bundle generation complete. [19.064 seconds] - 2026-08-11T01:18:20.695Z

▲ [WARNING] bundle initial exceeded maximum budget.
  Budget 500.00 kB was not met by 151.60 kB with a total of 651.60 kB.

Output location: ...\emulador\dist\emulador
EXIT=0
```

**Total build warnings: exactly ONE** (the budget warning). No CommonJS/optimization-bailout
warnings. No Sass deprecation warnings (there are zero `.scss` files — see F-06). No
unused-dependency warnings. No `anyComponentStyle` budget warning (the calculadora CSS file
noted in MEMORY is currently under the 20 kB line).

**vitest-sentinel scan of `dist/emulador/browser/`:**
```
$ grep -rlE 'vitest|@vitest|spec-util|expect\.getState' .
(no matches)
```
**Clean — no vitest leakage in the production bundle right now.**

---

## FINDINGS

---

### F-01 · The accepted bundle-budget warning is justified by a FALSE cause

**Category:** Build warnings / bundle weight / documentation accuracy
**Severity:** HIGH
**Scope:** `emulador/angular.json:43-54`, `CLAUDE.md:66-67`, `.claude/commands/verify-gates.md:16-17`

**Evidence (measured, not inferred).** Attribution of the initial chunks by grepping
minification-surviving string literals in `dist/emulador/browser/`:

| Initial chunk | Raw size | Attributed to | Marker evidence |
|---|---:|---|---|
| `chunk-LMCKOV4N.js` | **219.12 kB** | **@supabase/supabase-js** | `supabase`×63, `gotrue`×22 |
| `chunk-GPERLCK2.js` | 181.17 kB | Angular core | `Zone`×48, `zone`×28, `signal`×8, `NG0`×1 |
| `chunk-5XP4DLYU.js` | 106.67 kB | Angular router | `router`×79, `Router`×29 |
| `chunk-RKOHTGBW.js` | 51.64 kB | lightweight-charts | `crosshair`×2 |
| `main-64E3VM5X.js` | 34.02 kB | app entry | — |
| `styles-OMZVO57W.css` | 19.98 kB | global styles | — |
| `chunk-7IAOOBGD.js` | 14.62 kB | @ngrx | `@ngrx`×24 |

Apache Arrow (`Arrow-dom`, 216.38 kB, `RecordBatch`×82 / `Schema`×49) and `parquet_wasm`
(34.19 kB) appear under **Lazy chunk files**, NOT initial. They are correctly deferred behind
dynamic imports — `emulador/src/app/workers/parquet.worker.ts:45` (`await import('parquet-wasm')`)
and `:67` (`await import('apache-arrow')`); the only static Arrow reference is `import type`
at `emulador/src/app/workers/candles-writer.ts:14`, which erases at compile time.

**Observed pattern.** `CLAUDE.md:66-67` records the warning as "known-accepted,
Arrow/parquet-dominated", and `verify-gates.md:17` repeats "the 648 kB budget WARNING is
known-accepted". The measurement contradicts both: Arrow and parquet contribute **0 bytes** to
the initial graph. The single largest initial contributor is `@supabase/supabase-js` at 219 kB
(33.6% of the 651.60 kB initial total), pulled in eagerly by a root-provided service:

`emulador/src/app/auth/supabase.service.ts:2`
```ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';
```
`:9-15` — `@Injectable({ providedIn: 'root' })` with `createClient(...)` as a field initializer.

Only three files touch the package (`emulador/src/app/auth/supabase.service.ts:2` is the sole
**value** import; `supabase-auth.service.ts:2` and its spec use `import type`).

**Why it matters HERE.** The stale rationale is worse than the warning. Every future agent that
reads CLAUDE.md is told the overrun is structural and Arrow-shaped, i.e. *not actionable*. That
sentence converts a fixable 219 kB eager dependency into permanently invisible debt, and it will
keep absorbing new growth: the number in the docs (648 kB) is already stale against the measured
651.60 kB, so the budget is drifting upward under cover of an accepted warning.

**Concrete risk.** Login is required (no guest mode), so the auth chunk is genuinely needed on the
first route — but it is needed *at the auth route*, not in the initial graph for every cold load.
The failure mode is silent: initial size creeps toward the 1 MB `maximumError` and the first
build that crosses it turns CI red on `main` with no obvious culprit, because the warning everyone
has learned to ignore is the only early signal.

**Recommended direction.** (a) Correct the rationale in `CLAUDE.md` and `verify-gates.md` to name
the real contributors and the real number. (b) Separately evaluate deferring the Supabase client
behind a lazy provider / dynamic `import()` inside `SupabaseService`, so the 219 kB lands on the
auth route chunk rather than the initial graph. (c) Once measured, re-baseline the `initial`
budget to a number just above the true floor so the warning becomes a *signal* again.

**Migration difficulty:** (a) trivial (docs). (b) medium — `createClient` is currently a
synchronous field initializer consumed by `SupabaseAuthService`; deferring it means an async
accessor and touching auth call sites. (c) trivial once (b) lands or is rejected.

**Best mechanism:** angular.json budget re-baseline + a docs correction. Enforcement already
exists (the budget); it is the *interpretation* that is broken.

**Acceptance condition:** CLAUDE.md states the measured initial composition; the `initial`
`maximumWarning` is set to a value the current build does NOT exceed, so any future regression
produces a NEW warning rather than a louder version of an ignored one.

---

### F-02 · Zero branch protection on `main` or `develop` — CI is advisory, not a gate

**Category:** CI/CD · release safety
**Severity:** HIGH
**Scope:** GitHub repo `Humerez-Sebas/trading-emulator`; `.github/workflows/ci.yml`

**Evidence.** GitHub MCP `list_branches` (perPage 100) returned **58 branches, every one with
`"protected": false`** — including:
```
{"name":"develop","sha":"a2ca53b44f678dd285cd90f31ee644696664f32a","protected":false}
{"name":"main","sha":"ad69d7dd582bfa5c977b3816fb46101335df6c35","protected":false}
```

**Observed pattern.** MEMORY's open item "ni main ni develop están protegidas" is **CONFIRMED
still true**. `ci.yml` runs a real 5-step frontend job and a 4-step pipeline job on PRs to `main`,
but nothing prevents a direct push to `main`, and nothing prevents merging a PR whose checks are
red or still running.

**Why it matters HERE.** `main` is the production branch: `ci.yml:77-101` deploys `main` to Vercel
production on every push. With no protection, the `deploy` job's `needs: [pipeline, frontend]`
guard is the *only* thing standing between a bad commit and production — and it is bypassed
entirely by a direct `git push origin main`, which then triggers `push: branches: [main]` → CI →
and if CI fails the deploy is skipped, but if someone force-pushes or the workflow is edited in
the same commit, the guarantee evaporates.

**Concrete risk.** A single-maintainer repo with heavy agent automation is exactly the profile
where an accidental `git push` to the wrong remote branch is plausible. There is no mechanical
recovery: no required review, no required status check, no linear-history requirement, no
force-push block on the branch that deploys to production.

**Recommended direction.** Enable branch protection on `main` (require the `Pipeline` and
`Frontend` checks, block force-push, block deletion) and on `develop` (block force-push at
minimum). Per CLAUDE.md this has **no MCP/CLI path — it is an explicit human dashboard task**.

**Migration difficulty:** trivial (minutes in the GitHub UI), but requires the owner.

**Best mechanism:** GitHub branch protection rules / rulesets. Nothing in-repo can substitute.

**Acceptance condition:** `list_branches` reports `"protected": true` for `main` and `develop`,
and a PR with a failing check cannot be merged.

---

### F-03 · CI does not run on PRs to `develop` — the integration branch is unverified

**Category:** CI/CD
**Severity:** HIGH
**Scope:** `.github/workflows/ci.yml:3-7`

**Evidence.**
```yaml
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
```
This is the ONLY workflow file — `.github/workflows/` contains exactly `ci.yml`
(`ls -la .github/workflows/`).

**Observed pattern.** MEMORY's claim "CI does NOT run on PRs to develop" is **CONFIRMED by
config**. All RFC work lands via `feature/rfc-XXX-*` → PR to `develop` (CLAUDE.md git-essentials),
so the entire architectural work stream — RFC-014 through RFC-020, PRs #37/#45/#46/#47/#51/#56 —
merged into `develop` with **zero automated verification**. The only defense is the four local
gates, run by hand or by an agent, on a Windows box, with no artifact proving they ran.

**Why it matters HERE.** Combined with F-02 (nothing protected), `develop` accumulates unverified
work until the release PR to `main`, at which point CI runs for the first time against a large
multi-RFC block. That is the worst possible place to discover a break: maximum diff, minimum
bisectability, and a release under way. MEMORY already records the shape of this failure —
RFC-019's "Task 5 audit NOT PASS (a false invariant all four gates called green)".

**Concrete risk.** A lockfile drift, a Linux-vs-Windows path bug, or a Node-22-vs-local Node
difference is invisible until release time. Note that CI runs `npm ci` on Node 22 / ubuntu-latest
while all local verification happens on Windows with whatever Node is installed — an entire class
of divergence has no PR-time detector on the branch where the work actually lands.

**Recommended direction.** Add `develop` to the `pull_request.branches` list. This is a one-line
change to an existing workflow and costs one CI run per develop PR. (Explicitly NOT done here —
read-only audit.)

**Migration difficulty:** trivial.

**Best mechanism:** `on.pull_request.branches: [main, develop]`.

**Acceptance condition:** a PR targeting `develop` shows the `Pipeline` and `Frontend` checks.

---

### F-04 · The documented "four gates" are not the CI gates — `format:check` is a fifth

**Category:** CI/CD · agent workflow consistency
**Severity:** MEDIUM
**Scope:** `CLAUDE.md:55-63`, `.github/workflows/ci.yml:58-61`, `emulador/validate-ci.ps1`,
`.claude/commands/verify-gates.md:8-22`

**Evidence.** Three sources disagree on what "verified" means:

| Source | Gates listed |
|---|---|
| `CLAUDE.md:55-63` | tsc app · tsc spec · `ng test` · `npm run lint` (**four**) |
| `emulador/validate-ci.ps1:9-34` | tsc app · tsc spec · `ng test` · `npm run lint` (**four** — no format) |
| `.github/workflows/ci.yml:58-65` | `npm run lint` · **`npm run format:check`** · `ng test` · `npm run build` (**no tsc at all**) |
| `.claude/commands/verify-gates.md` | six/seven steps incl. `format:check`, `build`, `npm ci --dry-run` |

**Observed pattern.** CI runs a gate (`format:check`) that the kernel's "required before claiming
work done" list omits, and the kernel requires two gates (`tsc -p tsconfig.app.json`,
`tsconfig.spec.json`) that CI never runs. `validate-ci.ps1` — the file literally named
"validate-CI" — matches neither: it reproduces CLAUDE.md's four and omits the `format:check` and
`build` that CI actually enforces.

**Why it matters HERE.** MEMORY records commit `e8ccce8 chore(style): apply Prettier to the 20
files develop had drifted on` — a whole cleanup commit caused by exactly this gap: agents ran the
documented four, none of which is `format:check`, and drift accumulated until someone ran CI.
Conversely, CI cannot catch a type error that only `tsc -p tsconfig.spec.json` sees, because
`ng test`/`ng build` type-check the app graph, not the spec project in isolation.

*(Measured now: `format:check` EXIT=0 — develop is currently format-clean, consistent with the
`e8ccce8` cleanup having landed.)*

**Concrete risk.** "All gates green" is an ambiguous claim in this repo. An agent can honestly
report four green gates and still be one `prettier --check` away from red CI.

**Recommended direction.** Make one list canonical and derive the others from it — see F-11
(single `npm run verify` entry point). `validate-ci.ps1` should either call that script or be
deleted; today it is a third, silently-diverging definition.

**Migration difficulty:** trivial.

**Best mechanism:** an npm script that is the single definition, invoked identically by
CLAUDE.md, `verify-gates.md`, `validate-ci.ps1`, and `ci.yml`.

**Acceptance condition:** grep for the gate list returns exactly one authoritative definition.

---

### F-05 · Lint is untyped — the entire type-aware rule family is unavailable

**Category:** Lint tooling
**Severity:** MEDIUM
**Scope:** `emulador/eslint.config.js:7-50`

**Evidence.** The config extends `tseslint.configs.recommended` and `tseslint.configs.stylistic`
(`eslint.config.js:12-13`). **Neither `recommendedTypeChecked` / `strictTypeChecked` nor any
`languageOptions.parserOptions.project` / `projectService` appears anywhere in the file.** There
is no `parserOptions` block at all.

**What IS enforced today:** `eslint.configs.recommended`, `tseslint recommended` + `stylistic`,
`angular.configs.tsRecommended`, `angular.processInlineTemplates`, custom
`@angular-eslint/directive-selector` (attribute/`app`/camelCase) and `component-selector`
(element/`app`|`ui`/kebab-case), plus — notably good — `angular.configs.templateRecommended` **and
`templateAccessibility`** on `**/*.html` (`eslint.config.js:46-49`). Test files relax
`no-explicit-any` and `no-empty-function` (`:37-44`).

**Conspicuously absent:**
- `no-console` — *currently a non-issue*: a scan of all non-spec `.ts` under `src/app` found
  **0** occurrences of `console.log|debug|warn|error|info|table`. The discipline is real but
  unenforced; nothing stops the next debug statement from shipping.
- `@typescript-eslint/no-floating-promises`, `no-misused-promises`, `await-thenable`,
  `no-unnecessary-condition`, `require-await` — **all require the typed setup that does not
  exist**. In an app with NgRx effects, IndexedDB writes, workers, and a Supabase client, a
  floating promise is a realistic silent-failure source and there is no detector for it.
- RxJS rules (no `eslint-plugin-rxjs*` present) — no subscription-leak or operator-misuse lint.
- NgRx rules (no `@ngrx/eslint-plugin`) — the D8 factory-selector ban and NgRx conventions have
  no lint backing (see F-09).
- Import boundaries (`no-restricted-imports` / `eslint-plugin-boundaries` / dependency-cruiser) —
  see F-09; this is where the architectural invariants would live.

**Why it matters HERE.** CLAUDE.md invariant 8 ("no new runtime dependencies by default") makes
the typed-lint upgrade unusually attractive: `typescript-eslint` is **already a devDependency at
8.59.2**, so enabling `projectService: true` + `recommendedTypeChecked` adds **zero new packages**.
The blocker is purely the unmeasured violation count and lint runtime.

**Concrete risk.** The repo's most valuable rules are precisely the ones it cannot run. Floating
promises in effects/persistence code fail silently and are exactly the class of bug that
MEMORY's "a test that doesn't cross the boundary can't see the defect" lesson describes.

**Recommended direction.** Add `languageOptions.parserOptions.projectService: true` and layer
`tseslint.configs.recommendedTypeChecked` on `**/*.ts` (with the spec override retained). Measure
the violation count first; introduce the high-value rules (`no-floating-promises`,
`no-misused-promises`) as `error` and park the noisy ones (`no-unnecessary-condition`) off.

**Migration difficulty:** low-to-medium. Zero new dependencies. Expect a one-time violation
backlog (unmeasured — see RESUME BRIEF step 1) and a noticeably slower `npm run lint`.

**Best mechanism:** typed `typescript-eslint` (devDependency already present).

**Acceptance condition:** `npm run lint` runs with type information and
`@typescript-eslint/no-floating-promises` at `error` with 0 problems.

---

### F-06 · No Stylelint for 31 CSS files, and CSS is outside the format gate's blast radius

**Category:** Lint/style tooling
**Severity:** LOW-MEDIUM
**Scope:** `emulador/src/**/*.css` (31 files), `emulador/package.json:12-13`

**Evidence.**
```
$ find src -name '*.css' | wc -l   → 31
$ find src -name '*.scss' | wc -l  → 0
$ grep -i stylelint package.json   → NO stylelint in package.json
$ find . -maxdepth 2 -name '.stylelintrc*' -not -path './node_modules/*' → (none)
```
`angular.json:97-102` lints only `["src/**/*.ts", "src/**/*.html"]` — CSS is not in
`lintFilePatterns`. Prettier *does* cover CSS (`package.json:12-13` globs `{ts,html,css}`), so
formatting is checked, but **no CSS correctness/consistency rule exists at all**.

**Why it matters HERE.** This is a design-token-driven codebase — `DESIGN_SYSTEM.md` is the
"visual authority" and CLAUDE.md routes all UI work through `DESIGN.md` (tokens). A hard-coded
hex where a `var(--token)` belongs is a *token-system violation*, and today nothing detects it.
That is the single highest-value Stylelint rule available here
(`declaration-property-value-disallowed-list` on color properties, or a custom token rule).

Also relevant: MEMORY records "Angular CSS budget on calculadora — anyComponentStyle is 20 kB
DECIMAL on minified output; that file sits right at the line". The build produced **no**
`anyComponentStyle` warning this run, so the file is currently under budget — but the margin is
thin and CSS growth has no lint-level guard.

**Concrete risk.** Design-system drift is cumulative and invisible until a visual review; by then
the offending values are spread across many components.

**Recommended direction.** devDependency-only: `stylelint` + `stylelint-config-standard`, one npm
script, wired into the same `verify` entry point (F-11). Start with the token rule and
`no-duplicate-selectors`; do NOT start with the full standard config (that would produce a large,
low-value backlog).

**Migration difficulty:** low, but it adds devDependencies — needs the invariant-8 justification
conversation. Justification is strong *only* if the token rule is the goal; adopting Stylelint for
generic CSS hygiene alone would not clear this repo's bar.

**Best mechanism:** Stylelint (devDependency) with a deliberately minimal, token-focused rule set.

**Acceptance condition:** a hard-coded color in a component CSS file fails `npm run lint:css`.

---

### F-07 · TypeScript strictness: strong baseline, four meaningful flags off (all measured)

**Category:** TypeScript strictness
**Severity:** MEDIUM
**Scope:** `emulador/tsconfig.json`, `tsconfig.app.json`, `tsconfig.spec.json`

There are exactly **three** tsconfigs (plus `node_modules` copies). `tsconfig.app.json:4` and
`tsconfig.spec.json:4` both `extends: "./tsconfig.json"` and add only `outDir`/`types`/`include`
— **all strictness lives in the single root `tsconfig.json`**, so there is no per-project
weakening anywhere. That is a genuinely good baseline and worth stating plainly.

#### Strictness-flag table (ON/OFF verified by reading `tsconfig.json`; costs MEASURED)

| Flag | State | Source | Measured errors if enabled |
|---|---|---|---|
| `strict` | **ON** | `tsconfig.json:6` | — |
| `noImplicitAny` | **ON** (via `strict`) | `:6` | — |
| `strictNullChecks` | **ON** (via `strict`) | `:6` | — |
| `strictFunctionTypes` | **ON** (via `strict`) | `:6` | — |
| `strictPropertyInitialization` | **ON** (via `strict`) | `:6` | — |
| `useUnknownInCatchVariables` | **ON** (via `strict`) | `:6` | — |
| `noImplicitOverride` | **ON** | `:7` | — |
| `noPropertyAccessFromIndexSignature` | **ON** | `:8` | — |
| `noImplicitReturns` | **ON** | `:9` | — |
| `noFallthroughCasesInSwitch` | **ON** | `:10` | — |
| `isolatedModules` | **ON** | `:12` | — |
| **`noUncheckedIndexedAccess`** | **OFF** | absent | **139 errors** (app project) |
| **`exactOptionalPropertyTypes`** | **OFF** | absent | **28 errors** (app project) |
| **`noUnusedLocals`** | **OFF** | absent | **16 errors** (app project) |
| **`noUnusedParameters`** | **OFF** | absent | **3 errors** (app project) |
| `noUncheckedSideEffectImports` | **OFF** | absent | **0 errors** — free win |
| `verbatimModuleSyntax` | OFF | absent | 318 errors (style-only; not recommended) |
| **Angular `strictTemplates`** | **ON** | `:22` | — |
| **Angular `strictInjectionParameters`** | **ON** | `:20` | — |
| **Angular `strictInputAccessModifiers`** | **ON** | `:21` | — |
| Angular `fullTemplateTypeCheck` | n/a — subsumed by `strictTemplates` | `:22` | — |

**How measured.** Scratchpad tsconfigs that `extends` the repo config with one flag flipped, run
with `npx tsc -p <scratch> --noEmit`, error lines counted with
`grep -cE '^[^ ].*error TS[0-9]+'`. **No repo config was modified.** Raw results:

```
FLAG=noUncheckedIndexedAccess     EXIT=2 ERRORS=139
FLAG=exactOptionalPropertyTypes   EXIT=2 ERRORS=28
FLAG=noUnusedLocals               EXIT=2 ERRORS=16
FLAG=noUnusedParameters           EXIT=2 ERRORS=3
FLAG=noUncheckedSideEffectImports EXIT=0 ERRORS=0
FLAG=verbatimModuleSyntax         EXIT=2 ERRORS=318
```
Scratchpad path: `…\scratchpad\strict\app.<flag>.json` (contents reproduced in the RESUME BRIEF).
**Caveat:** `tsc` does not type-check Angular templates, so these counts cover `.ts` only; the
spec project was not separately measured (configs were written but not run — see RESUME BRIEF).

**Interpretation, per flag:**

- **`noUncheckedIndexedAccess` (139) — the one that matters most, and the most expensive.**
  This codebase is *dense* in array indexing over candle series: `candles[i]`, `bars[idx]`,
  partition lookups, `Record<symbol, …>` maps. `strictNullChecks` is on, but it does not make
  `candles[i]` return `Candle | undefined`. MEMORY's RFC-019 finding ("closed cross-TF lookahead
  bias") and the open `F19-2 foreign-symbol candles` item are both *exactly* the shape of bug this
  flag catches: an index that is legitimately out of range at a replay boundary, silently typed as
  present. 139 errors is a real project, not a weekend — but it is the highest-value strictness
  work available here.
- **`exactOptionalPropertyTypes` (28) — best effort/value ratio.** Directly relevant to the
  session-payload / DTO discipline (invariant 3/4): it stops `{ foo: undefined }` from
  satisfying `{ foo?: T }`, which is precisely how an "absent" field becomes an explicit
  `undefined` in a persisted Supabase payload. 28 errors is a focused afternoon.
- **`noUnusedLocals` (16) / `noUnusedParameters` (3) — cheap hygiene, 19 total.** Note these
  overlap with, but are not identical to, the ESLint `no-unused-vars` currently in effect
  (`tseslint recommended` flags unused vars but with different defaults for args/catch).
- **`noUncheckedSideEffectImports` (0) — enable it now, free.** Zero errors today; it prevents a
  typo'd side-effect import (`import './does-not-exist'`) from silently doing nothing.
- **`verbatimModuleSyntax` (318) — do NOT pursue.** Pure `import type` ceremony; 318 errors of
  churn for no bug class. Listed only so the number is not re-measured later.

**Recommended direction (ordered by value/cost):**
1. `noUncheckedSideEffectImports` — 0 errors, enable immediately.
2. `noUnusedParameters` (3) + `noUnusedLocals` (16) — one small PR.
3. `exactOptionalPropertyTypes` (28) — one focused PR; strongest DTO-integrity payoff.
4. `noUncheckedIndexedAccess` (139) — its own RFC-scale effort. Consider enabling it for the
   highest-risk directory first (`src/app/domain/chart/**` + `src/app/state/replay/**`) via a
   dedicated project reference rather than repo-wide in one step.

**Migration difficulty:** 1 = trivial · 2 = low · 3 = low-medium · 4 = high.
**Best mechanism:** `emulador/tsconfig.json` `compilerOptions` (single choke point — the two
child configs inherit automatically).
**Acceptance condition:** flag enabled in `tsconfig.json` and both `tsc` gates exit 0.

---

### F-08 · `spec-util` / vitest-importing files live inside the app compilation unit

**Category:** Static enforcement · build safety
**Severity:** MEDIUM
**Scope:** `emulador/tsconfig.app.json:9-14`, three files under `src/app`

**Evidence.** `tsconfig.app.json` includes `src/**/*.ts` and excludes only `src/**/*.spec.ts`.
Three non-`.spec.ts` files import vitest:
```
src/app/components/chart/lookahead-invariants.spec-util.ts:1:import { expect } from 'vitest';
src/app/state/layout/layout-invariants.spec-util.ts:1:import { expect } from 'vitest';
src/app/testing/workspace-db.stub.ts:1:import { vi } from 'vitest';
```
All three are therefore **inside the app project** that `npx tsc -p tsconfig.app.json` and
`ng build` compile. Current importers are exclusively specs (verified — all 11 importing files
end in `.spec.ts`), and the `dist/` scan found no vitest, so the bundle is clean **today**.

Encouragingly, the codebase already documents the trap at
`src/app/state/layout/layout-invariants.ts:10-12`: the pure `layout-invariants.ts` exists
specifically so production code has a version "free of test-only dependencies", with
`layout-invariants.spec-util.ts` wrapping it. That is the right pattern — it is just not enforced.

**Why it matters HERE.** CLAUDE.md invariant 7 states this exact failure mode: importing a
`*.spec-util.ts` "ships vitest into the prod bundle while tsc and tests stay green". **All four
gates are blind to it** — confirmed this session: tsc app EXIT=0, tsc spec EXIT=0, tests EXIT=0,
lint EXIT=0, with these three files sitting in the app graph the whole time. Only `npm run build`
+ a manual sentinel grep catches it, and `npm run build` is not one of the four gates.

**Concrete risk.** One `import { assertNoLookahead } from './lookahead-invariants.spec-util'` in a
non-spec file ships the vitest runtime to production. The naming convention (`.spec-util.ts`) is
the *only* current defense, and it is a convention, not a rule.

**Recommended direction.** ESLint `no-restricted-imports` — zero new dependencies:
restrict `vitest`, `@vitest/*`, and `**/*.spec-util` in a config block scoped to `**/*.ts` with an
override re-allowing them in `**/*.spec.ts`, `**/*.spec-util.ts`, and `src/app/testing/**`.

**False-positive assessment: very low.** The allowed set is exactly the three known test-only
locations, all of which already have a naming convention; a legitimate production import of
`vitest` does not exist by definition. The one maintenance cost is remembering to add new
test-only directories to the override — which is itself the desired friction.

Complementary hardening (either/or): add `"src/**/*.spec-util.ts"` and `"src/app/testing/**"` to
`tsconfig.app.json`'s `exclude`, which makes the app project fail to resolve the import at the
`tsc` gate. That is arguably stronger (it moves detection into an existing gate) but changes
compilation scope, so the ESLint rule is the safer first move.

**Migration difficulty:** trivial (one config block, currently 0 violations).
**Acceptance condition:** adding `import { vi } from 'vitest'` to a non-test `src/app` file fails
`npm run lint`.

---

### F-09 · Five of six architectural invariants have no mechanical enforcement

**Category:** Static enforcement
**Severity:** MEDIUM-HIGH
**Scope:** `CLAUDE.md:36-53` (invariants 1-8), `.claude/hooks/engine_purity_guard.py`

**Evidence — current compliance and current mechanism, per invariant:**

| # | Invariant | Complies now? | Enforced by |
|---|---|---|---|
| 1 | ChartEngine never imports Angular/NgRx | **YES** — `grep -rnE "from '@angular\|from '@ngrx" app/domain` → **0 matches** (including specs) | **nothing** |
| 2 | Engine core closed; new behavior = new Capability | n/a (process) | **`.claude/hooks/engine_purity_guard.py`** — agent-only, fail-open |
| 3 | Market-Data vs User-Workspace domain separation | not mechanically checkable as written | **nothing** |
| 4 | Session payloads candle-free | **YES** — `assertNoCandles` called at 8 sites | **runtime assertion** (`session-sync.mapping.ts:75`) |
| 5 | D8 factory-selector ban | **YES** — no `export const selectX = (id) =>` factory selectors found in `app/state` | **nothing** |
| 7 | No `*.spec-util.ts`/vitest imports in app code | **YES** (see F-08) | **nothing** |

Invariant 2 is the only one with a mechanism, and it is a Claude Code `PreToolUse` hook that
escalates to `permissionDecision: "ask"` for edits under `/domain/chart/` outside
`capabilities/` (`engine_purity_guard.py:43-55`). It is **fail-open by design** (`:59-62`,
`except Exception: pass`), **agent-only** (a human editing in VS Code is unaffected), and
**invisible to CI**.

**Why it matters HERE.** The invariants currently hold — that is the good news and the trap. Every
one of them is upheld by author discipline and code review, on a repo where the reviewer is
usually an agent working from a document. CLAUDE.md itself frames these as "never break these",
which is exactly the promise a mechanical check should back.

**Recommended direction — cheapest reliable mechanism per invariant, with FP assessment:**

| # | Mechanism | New deps | False-positive risk | Effort |
|---|---|---|---|---|
| 1 | ESLint `no-restricted-imports` (patterns `@angular/*`, `@ngrx/*`) in a config block scoped to `src/app/domain/chart/**` | none | **Very low** — currently 0 matches; the boundary is a directory, and the rule states the invariant verbatim. Only nuance: decide whether `.spec.ts` under `domain/chart` may use Angular test utils (today none do, so start strict). | trivial |
| 2 | Keep the hook; optionally add a CODEOWNERS-style review requirement. A lint rule cannot express "closed to modification". | none | n/a | none (already exists) |
| 3 | **Do not automate as stated.** "No leaks in DTOs" is a semantic property of type shapes, not an import graph. Best available proxy: `no-restricted-imports` between the two feature directories *if* they are cleanly separated on disk — **not verified this session**. | — | **HIGH if forced** — a rule here would fire on legitimate shared primitives and get disabled, which is worse than no rule. | — |
| 4 | Already enforced at runtime by `assertNoCandles`; a static rule adds nothing. Keep as is. | none | n/a | none |
| 5 | ESLint `no-restricted-syntax` matching an arrow-returning `createSelector` call, scoped to `src/app/state/**` | none | **Medium** — the AST shape (a function returning `createSelector(...)`) also matches legitimate helper factories. Recommend it **only** if a prototype run shows 0 current matches; otherwise leave D8 to review. | low, needs prototyping |
| 7 | See F-08 | none | Very low | trivial |

**Net recommendation:** implement **1 and 7 now** (both zero-dependency, both currently at 0
violations, both restate a written invariant exactly). Prototype **5** before adopting. Explicitly
**decline 3** — it fails the "high-value AND low-false-positive" bar as currently specified.

Both 1 and 7 land in the same `eslint.config.js` as new scoped config blocks, and both become CI
gates for free the moment F-03 is fixed (CI already runs `npm run lint`).

**Acceptance condition:** an `@angular/core` import added under `src/app/domain/chart/` fails
`npm run lint`.

---

### F-10 · Security posture: clean, with two items to note

**Category:** Security / client-side safety
**Severity:** LOW (no exploitable finding)
**Scope:** `emulador/src/**`, `.env*`, `emulador/src/environments/*`

**Evidence — scans run and results:**

- **Secrets in tracked files.** `git grep -nIE 'service_role|SERVICE_ROLE|sk_live|SECRET_ACCESS_KEY=…'`
  → **no matches**. A JWT scan (`git grep -nIoE 'eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}'`)
  returned exactly two hits: `environment.ts:9` and `environment.prod.ts:13`. Both decode to
  `"role":"anon"` — **the expected-public Supabase anon key. NO service-role key is present
  anywhere in the repo.** `supabase.service.ts:6-8` documents this correctly ("The anon key is
  public by design; Row-Level Security is the data protection").
- **`.env` handling.** `.env` exists on disk but is **untracked and ignored**
  (`git check-ignore -v .env` → `.gitignore:2:.env`); `git ls-files` shows only `.env.example`,
  whose R2 credential fields are all blank (`.env.example:7-16`). Correct.
- **XSS surface.** No `bypassSecurityTrust*`, no `DomSanitizer`, no `outerHTML`, no
  `insertAdjacentHTML`, no `document.write`, no `eval`, no `new Function`. The four `innerHTML`
  occurrences are all the literal clearing idiom `container.innerHTML = ''`
  (`lotaje/companion-window.ts:261`, `lotaje/lotaje-view.ts:1208,1401,1598`) — no data flows into
  them. `lotaje-view.ts:171` documents the deliberate choice: SVG built via
  `doc.createElementNS`, "never innerHTML".
- **`window.open`.** Only in `lotaje/companion-window.ts` (+ specs), and it is
  `window.open('', ...)` — a blank same-origin popup for the companion window
  (`companion-window.ts:21`), not a navigation to untrusted content. `rel=noopener` is not
  applicable; no `target="_blank"` anchors were found.
- **Storage.** `localStorage` holds UI/product state only: draggable positions
  (`ui/draggable.directive.ts:107,126`), settings (`state/settings/settings.reducer.ts:59,88`),
  current symbol (`state/workspaces/workspaces.effects.ts:257,327`), lotaje prefs
  (`lotaje/persistence.ts:54,93`). **No app code writes tokens to storage.**
- **Debug exposure.** **0** `console.*` calls in non-spec app code.

**Two items to note (neither a defect):**
1. `supabase.service.ts:14` sets `{ auth: { persistSession: true, autoRefreshToken: true } }`,
   which means the Supabase SDK persists the access+refresh token in `localStorage` under its own
   key. This is standard, intended for a login-required SPA, and the reason RLS is the real
   control — but it does mean an XSS anywhere in the app is a session-token compromise. That
   raises the value of F-06's CSS/template hygiene and the template-accessibility rules already
   enabled, and it is the strongest argument for keeping the zero-`innerHTML`-data-flow discipline.
2. CI runs `npm audit --audit-level=high || true` with **both** `|| true` **and**
   `continue-on-error: true` (`ci.yml:66-70`), and `pip-audit` on the pipeline side blocks
   (`ci.yml:40-41`). The npm audit result is therefore not merely non-blocking — it is
   double-suppressed and its output is never read by anyone. The comment explains the intent
   (Angular toolchain transitive advisories), which is legitimate; the debt is that a genuine
   high-severity advisory in a *direct* runtime dep would also be silently swallowed.

**Recommended direction.** No urgent action. For (2), consider narrowing to
`npm audit --omit=dev --audit-level=high` so *runtime* advisories are visible while dev-toolchain
noise stays suppressed — still non-blocking, but readable.

**Acceptance condition:** n/a (informational).

---

### F-11 · No single validation entry point — agents must hand-assemble shell invocations

**Category:** Windows/shell workflow · agent ergonomics
**Severity:** MEDIUM
**Scope:** `emulador/package.json:4-14`, `CLAUDE.md:55-67`, `.claude/commands/verify-gates.md`

**Evidence.** `package.json` scripts are: `ng`, `start`, `build`, `watch`, `test`,
`test:coverage`, `lint`, `format`, `format:check`. **There is no `verify`, no `typecheck`, no
`gates` script.** The two `tsc` gates are not scripts at all — every actor must type
`npx tsc -p tsconfig.app.json --noEmit` and `npx tsc -p tsconfig.spec.json --noEmit` by hand,
which is why the exact invocation is copy-pasted into CLAUDE.md, `verify-gates.md`,
`validate-ci.ps1`, and every SDD plan.

**Windows-specific friction, verified on this machine:**
- **`python` is the Microsoft Store stub.** Measured:
  ```
  $ which python → /c/Users/78701/AppData/Local/Microsoft/WindowsApps/python
  $ python --version → "Python was not found; run without arguments to install from the
                        Microsoft Store, or disable this shortcut from Settings > Apps..."
  $ which py → /c/Users/78701/AppData/Local/Programs/Python/Launcher/py
  $ py --version → Python 3.13.2
  ```
  MEMORY's trap is **confirmed live**. `.claude/settings.json` correctly uses `py` for all four
  hooks — but the *documentation* still tells agents to run `python`:
  - `CLAUDE.md:67` — ``cd pipeline && python -m pytest -q && ruff check .``
  - `.claude/commands/verify-gates.md:21` — same string
  - `README.md:107` — ``cd pipeline && python -m pytest -q``
  - plus 8 further occurrences across `docs/superpowers/plans/*`.
  `.claude/settings.json:19-20` allow-lists **both** `py -m pytest *` and `python -m pytest *`,
  so the permission layer silently permits the invocation that cannot work.
  (`ci.yml:39` using `python -m pytest -q` is correct — that runs on ubuntu with `setup-python`.)
- **`&&` chaining and `cd`.** The documented pipeline command chains with `&&`, which is invalid
  in PowerShell 5.1 (valid only in PS 7+). Combined with the `python` stub, the single most-copied
  pipeline command in the repo is doubly Windows-hostile.
- **Path separators / globs.** No issues found: `.claude/hooks/engine_purity_guard.py:41`
  normalizes with `fp.replace("\\", "/")`, and `:16-22` explicitly reconfigures stdio to UTF-8
  because "Windows hooks get cp1252 std streams". This is well-handled — worth preserving as the
  pattern for any new hook.

**Why it matters HERE.** Every agent session re-derives the same multi-command invocation from
prose, on a platform where one of the documented commands is broken and another uses shell syntax
the default shell may reject. That is a recurring per-session tax and a recurring source of
"gate reported green because it silently didn't run".

**Recommended direction — minimal script surface (zero new dependencies):**

```jsonc
// emulador/package.json — PROPOSED (not applied; this audit is read-only)
"typecheck:app":  "tsc -p tsconfig.app.json --noEmit",
"typecheck:spec": "tsc -p tsconfig.spec.json --noEmit",
"typecheck":      "npm run typecheck:app && npm run typecheck:spec",
"verify":         "npm run typecheck && npm run test -- --watch=false && npm run lint && npm run format:check",
"verify:full":    "npm run verify && npm run build"
```
Notes on the design: `&&` inside an npm script is executed by npm's own shell, **not** PowerShell,
so this removes the `&&` portability problem rather than propagating it. `verify` deliberately
includes `format:check` (closing F-04). `verify:full` is the branch-finalization gate. Nothing
here needs `npm-run-all` or any other package.

For the pipeline, the equivalent fix is to correct the documented command to `py -m pytest -q`
in `CLAUDE.md:67`, `verify-gates.md:21`, and `README.md:107` — or, better, to add a
`pipeline/` task runner entry so the interpreter name lives in exactly one place.

**Migration difficulty:** trivial. **Best mechanism:** npm scripts.
**Acceptance condition:** `CLAUDE.md`, `verify-gates.md`, and `ci.yml` all invoke
`npm run verify` (or its named sub-scripts) rather than spelling out raw commands, and
`validate-ci.ps1` either delegates to it or is removed.

---

### F-12 · Dependency surface is lean and healthy (no architectural dependency debt)

**Category:** Dependencies
**Severity:** LOW (informational — recorded so it is not re-investigated)
**Scope:** `emulador/package.json:17-47`, `pipeline/requirements*.txt`

**Measured.** **10 prod dependencies** (6 of them `@angular/*`) and **14 devDependencies**.
`npm ls --depth=0` resolves cleanly (EXIT=0, no `UNMET`/`invalid`).

**Cross-reference of every dependency against `src` imports:**

| Dependency | Files importing | Verdict |
|---|---:|---|
| `@angular/core` | 175 | used |
| `@ngrx/store` | 117 | used |
| `rxjs` | 37 (+12 via `rxjs/operators`) | used |
| `@ngrx/effects` | 31 | used |
| `lightweight-charts` | 30 | used |
| `@angular/router` | 22 | used |
| `@angular/common` | 18 | used |
| `@angular/platform-browser` | 4 | used |
| `@supabase/supabase-js` | 3 | used (1 value import — see F-01) |
| `apache-arrow` | 2 | used (1 dynamic, 1 `import type`) |
| `@angular/forms` | 1 | used |
| `@angular/compiler` | 0 static | **required** by Angular tooling/JIT — not unused |
| `parquet-wasm` | 0 static | **used via `await import('parquet-wasm')`** (`workers/parquet.worker.ts:45`) — a naive unused-dep check would flag this falsely |
| `tslib` | 0 static | **required** by `importHelpers: true` (`tsconfig.json:14`) |

**No unused production dependency.** **No duplicate libraries** solving the same problem (one
charting lib, one state lib, one data-format stack, one backend SDK). **No trivial-functionality
dependency** (no lodash/moment/uuid-class packages at all — notable and good).

**No deep imports into package internals:**
```
$ grep -rnE "from '[^'.][^']*/(dist|lib|esm|src|internal)/" src --include=*.ts → (no matches)
```
The only sub-path imports are `rxjs/operators` (12 files) — a legitimate public entrypoint, though
inconsistent with the 37 files importing operators from the `rxjs` root. Cosmetic only.

**Version consistency.** `package.json` pins `^21.2.0` for `@angular/*` while installed is
`21.2.16`, and `@angular/build`/`cli` are `^21.2.14` → `21.2.14`. All Angular packages resolve to
a single consistent minor. `typescript ~5.9.2` → `5.9.3` (correctly range-restricted for Angular
compatibility). No inconsistency found.

**Upgrade opportunities (reported separately from debt; nothing upgraded):** `npm notice New
minor version of npm available! 11.6.1 -> 11.19.0` — note `package.json:16` pins
`"packageManager": "npm@11.6.1"`, so this is a deliberate pin, and given MEMORY's npm-11.x
lockfile-prune history it should stay pinned until deliberately revisited.

**Pipeline deps.** `requirements.txt` is three unpinned lines (`pandas`, `pyarrow`, `boto3`);
`requirements-dev.txt` adds `pytest`, `pip-audit`, and **`ruff==0.16.0` pinned** with an excellent
inline comment explaining that a floating ruff turned CI red with no code change
(`requirements-dev.txt:4-8`). MEMORY confirms this drift is CLOSED. The remaining asymmetry: the
*runtime* deps are unpinned while the lint tool is pinned, so a `pandas`/`pyarrow` major could
break the pipeline job with no code change — the same failure the ruff comment warns about.
Low severity (personal-use pipeline), but worth a constraint file eventually.

---

## RESUME BRIEF

*Self-contained. A fresh agent with zero conversation history can paste this and continue.*

### (a) Role and remaining scope

You are a Principal Engineer performing a **READ-ONLY** technical-debt audit of the
`trading-emulator` repo at `C:\Users\78701\Desktop\trading-emulator`, branch `develop`, HEAD
`a2ca53b`. Your role covers: **Tooling, Static Enforcement, TypeScript Strictness, CI,
Dependencies, Build Warnings, Security & Windows-Workflow**.

**Absolute rules:** READ-ONLY on the repository — do not edit, refactor, delete, or create any
repo file; no `npm install`; no dependency upgrades; no pipeline/config modification. The **only**
writes permitted are files under
`C:\Users\78701\Desktop\trading-emulator\.superpowers\audit-2026-08-10\`.
Read-only verification/build commands ARE allowed, run from `emulador/`. **Never** pipe a gate
through `| tail`/`| head` or anything that swallows the exit code. Every claim needs `path:line` or
real command output. Separate MEASURED FACT / INTERPRETATION / RECOMMENDATION. Only propose an
automated rule if it is HIGH-VALUE and LOW-FALSE-POSITIVE.

The audit is ~92% done and this file already contains findings F-01…F-12. **Do not redo them.**

### (b) Commands already run — DO NOT RE-RUN (all outputs recorded above)

From `emulador/` (Git Bash):
| Command | Result |
|---|---|
| `npx tsc -p tsconfig.app.json --noEmit` | **EXIT=0**, no output |
| `npx tsc -p tsconfig.spec.json --noEmit` | **EXIT=0**, no output |
| `npx ng test --watch=false` | **EXIT=0** — 182 files / **2373 tests** passed, 30.51s |
| `npm run lint` | **EXIT=0** — "All files pass linting." |
| `npm run format:check` | **EXIT=0** — "All matched files use Prettier code style!" |
| `npm run build` | **EXIT=0** — 651.60 kB initial; **exactly one warning** (budget, 500 kB exceeded by 151.60 kB) |
| `npm ci --dry-run` | **EXIT=0** — "up to date in 2s" (lockfile healthy; no EUSAGE trap) |
| `npm ls --depth=0` | **EXIT=0**, clean tree (full list in F-12) |
| strictness probes (6 flags) | counts in F-07 table |
| `which python` / `python --version` | Store stub — "Python was not found…" |
| `which py` / `py --version` | `Python 3.13.2` — **`py` works, `python` does not** |
| `grep -rlE 'vitest\|@vitest\|spec-util' dist/emulador/browser` | **no matches** (bundle clean) |
| GitHub MCP `list_branches(perPage:100)` | 58 branches, **all `protected: false`**, incl. `main` and `develop` |

### Scratchpad tsconfigs used for strictness probing

Written to (session-scoped temp — **recreate if needed**):
`C:\Users\78701\AppData\Local\Temp\claude\C--Users-78701-Desktop-trading-emulator\748399ea-4056-4c65-b181-586ad2c687b4\scratchpad\strict\app.<FLAG>.json`

Exact template (one file per flag; `extends` the REPO config, never modifies it):
```json
{
  "extends": "C:/Users/78701/Desktop/trading-emulator/emulador/tsconfig.app.json",
  "compilerOptions": { "noUncheckedIndexedAccess": true, "outDir": "<SCRATCHPAD>/out/noUncheckedIndexedAccess" }
}
```
Generation + measurement loop actually used:
```bash
SP="<scratchpad>"; mkdir -p "$SP/strict"
BASE="C:/Users/78701/Desktop/trading-emulator/emulador/tsconfig.app.json"
for f in noUncheckedIndexedAccess exactOptionalPropertyTypes noUnusedLocals \
         noUnusedParameters noUncheckedSideEffectImports verbatimModuleSyntax; do
  printf '{\n "extends": "%s",\n "compilerOptions": { "%s": true, "outDir": "%s/out/%s" }\n}\n' \
    "$BASE" "$f" "$SP" "$f" > "$SP/strict/app.$f.json"
  out=$(npx tsc -p "$SP/strict/app.$f.json" --noEmit 2>&1); code=$?
  n=$(printf '%s\n' "$out" | grep -cE '^[^ ].*error TS[0-9]+')
  echo "FLAG=$f EXIT=$code ERRORS=$n"
done
```
Two spec-project probes were **written but never run**:
`spec.noUncheckedIndexedAccess.json` and `spec.both.json` (same template, `extends`
`…/tsconfig.spec.json`). Running them is remaining step 2.

### (c) Files read and what was concluded

| File | Conclusion |
|---|---|
| `emulador/tsconfig.json` | All strictness lives here. `strict`+`noImplicitOverride`+`noPropertyAccessFromIndexSignature`+`noImplicitReturns`+`noFallthroughCasesInSwitch` ON; Angular `strictTemplates`/`strictInjectionParameters`/`strictInputAccessModifiers` ON. |
| `emulador/tsconfig.app.json` | Only `outDir`/`types:[]`/include+exclude. **Excludes only `*.spec.ts`** → `spec-util`/`testing` files are in the app project (F-08). |
| `emulador/tsconfig.spec.json` | Only `outDir` + `types:["vitest/globals"]`. No weakening. |
| `emulador/eslint.config.js` | Untyped setup — no `parserOptions.project`/`projectService` anywhere (F-05). Template a11y rules ARE on. |
| `emulador/package.json` | 10 prod / 14 dev deps; **no `verify`/`typecheck` script** (F-11). `packageManager` pinned `npm@11.6.1`. |
| `emulador/angular.json` | budgets initial 500 kB warn / 1 MB error; `anyComponentStyle` 20/24 kB; lint patterns cover only `.ts`+`.html` (F-06); coverage thresholds lines/statements 80. |
| `.github/workflows/ci.yml` | **Only workflow.** `pull_request`+`push` on `main` ONLY (F-03). Frontend job = lint, format:check, ng test, build, npm audit (double-suppressed). **No tsc gate in CI** (F-04). Deploy to Vercel prod on push to main. |
| `emulador/validate-ci.ps1` | Third, diverging gate definition — 4 gates, no `format:check`/`build` (F-04). |
| `.claude/settings.json` | Hooks all use `py` (correct); allow-list contains BOTH `py` and `python` pytest (F-11). |
| `.claude/hooks/engine_purity_guard.py` | Enforces invariant 2 only; fail-open, agent-only, invisible to CI (F-09). Good Windows hygiene (UTF-8 stdio, path normalization). |
| `.claude/commands/verify-gates.md` | 6-7 steps; repeats the stale "648 kB known-accepted" line and the `python`+`&&` pipeline command. |
| `emulador/src/environments/environment{,.prod}.ts` | Identical anon-key + R2 URL. Anon role only — **no service-role key** (F-10). |
| `emulador/src/app/auth/supabase.service.ts` | Root-provided, eager `createClient` → the 219 kB initial chunk (F-01). |
| `emulador/src/app/workers/parquet.worker.ts` | `await import('parquet-wasm')` `:45` and `await import('apache-arrow')` `:67` → both correctly lazy (F-01). |
| `pipeline/ruff.toml`, `requirements*.txt` | ruff pinned 0.16.0 with a good rationale comment; runtime deps unpinned (F-12). |
| `.env.example`, `.gitignore` | `.env` untracked+ignored; example has blank credential fields (F-10). |

### (d) Dead ends / confirmed non-issues — do not re-investigate

- **`npm ci --dry-run` EUSAGE trap:** NOT present. EXIT=0.
- **vitest sentinel in the bundle:** NOT present. `dist/` scan clean.
- **CommonJS / optimization-bailout warnings:** none in the build output.
- **Sass deprecation warnings:** impossible — **0 `.scss` files**, 31 `.css`.
- **`anyComponentStyle` budget warning:** did not fire this build.
- **`console.*` in production code:** **0 occurrences**. `no-console` would be a 0-violation rule.
- **Deep imports into package internals (`pkg/dist/…`, `pkg/lib/…`):** **0 matches**.
- **Unused production dependencies:** none. Beware: `parquet-wasm` (dynamic import), `tslib`
  (`importHelpers`), and `@angular/compiler` (tooling) all look unused to a naive scan and are not.
- **Invariants 1, 5, 7 currently VIOLATED?** No — all three currently hold (0 matches each). The
  finding is the *absence of enforcement*, not a live breach.
- **`eval` / `new Function` / `bypassSecurityTrust*` / `DomSanitizer`:** 0 occurrences.
- **Attributing minified chunks by grepping library names** (`lightweight-charts`, `apache-arrow`)
  **does not work** — those strings are minified away. Use surviving *string literals* instead:
  `supabase`/`gotrue`, `Zone`/`signal`, `router`/`Router`, `crosshair`, `RecordBatch`/`Schema`,
  `@ngrx`. This is how the F-01 table was built.

### (e) ORDERED remaining steps

1. **Prototype the two recommended ESLint rules and MEASURE their false-positive rate.** Write a
   throwaway flat-config in the audit directory (never in `emulador/`) that adds
   (a) `no-restricted-imports` for `@angular/*`/`@ngrx/*` scoped to `src/app/domain/chart/**`, and
   (b) `no-restricted-imports` for `vitest`/`@vitest/*`/`**/*.spec-util` scoped to `**/*.ts` with
   overrides for `**/*.spec.ts`, `**/*.spec-util.ts`, `src/app/testing/**`. Run
   `npx eslint --config <scratch-config> "src/**/*.ts"` and record the violation count. Expected:
   0 for both. If 0, F-08/F-09 upgrade from "recommended" to "verified zero-cost".
2. **Run the two spec-project strictness probes** (`spec.noUncheckedIndexedAccess.json`,
   `spec.both.json`) so F-07's cost estimate covers specs as well as app code. The 139/28 figures
   are app-only today and understate total migration cost.
3. **Measure the typed-lint backlog for F-05.** Scratch flat-config layering
   `tseslint.configs.recommendedTypeChecked` + `parserOptions.projectService: true`; record total
   problems and, specifically, the `no-floating-promises` count. That number decides whether F-05
   is a small PR or a project.
4. **Read `pipeline/r2_uploader.py` and `pipeline/fill_r2.py` directly** for credential handling
   (env-var sourcing vs any hardcoded fallback). The repo-wide secret grep was clean, but these
   two files were never opened.
5. **Verify F-03 empirically** via GitHub MCP: list check-runs for a recent PR that targeted
   `develop` (e.g. #56 or #51) and confirm zero checks. Config reading is already conclusive; this
   is corroboration only.
6. **Optional:** quantify branch sprawl (58 branches, nearly all merged `feature/rfc-*` and
   `claude/*`) as a housekeeping finding. Low value; only if time permits.

---

*End of report. No repository file was modified during this audit.*
