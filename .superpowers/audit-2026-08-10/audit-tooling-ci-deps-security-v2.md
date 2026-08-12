## STATUS

**100% complete.**

**AREAS COMPLETE:** two architectural ESLint prototypes; spec strictness probes; typed-lint backlog; pipeline credential handling; empirical develop-PR check runs.

**AREAS PARTIAL:** none.

**AREAS NOT STARTED:** optional branch-sprawl finding; omitted as low value.

## FINDINGS SO FAR

The original established a green baseline, CI/branch-protection gaps, bundle attribution, app strictness costs, and unenforced invariants.
It explicitly found no dependency/security crisis and no npm lockfile trap.
This addendum measures the remaining spec/lint costs and proves two import rules have zero backlog.

### F-13 [SEQ] - Spec compilation makes `noUncheckedIndexedAccess` an RFC-sized migration

- **Finding name:** Spec strictness cost completed
- **Category:** TypeScript strictness
- **Severity:** MEDIUM
- **Scope:** app plus spec compilation graphs
- **Evidence:** scratch `C:\Users\78701\AppData\Local\Temp\opencode\spec.noUncheckedIndexedAccess.json` extends `emulador/tsconfig.spec.json`, enables `noUncheckedIndexedAccess`, sets project `node_modules` as `typeRoots`; raw command from `emulador/`: `npx tsc -p "C:\Users\78701\AppData\Local\Temp\opencode\spec.noUncheckedIndexedAccess.json" --noEmit; $exit=$LASTEXITCODE; "DIRECT_EXIT=$exit"; exit $exit` -> `DIRECT_EXIT=2`, 883 diagnostics. `spec.both.json` additionally enables `exactOptionalPropertyTypes`; same raw command -> exit 2, 934 diagnostics. Diagnostics counted from raw captures with `node -e "const fs=require('fs');const s=fs.readFileSync(process.argv[1],'utf8');console.log((s.match(/^.*error TS\d+:/gm)||[]).length)" <capture>`.
- **Observed pattern:** the spec project imports app code and heavily indexes fixtures/arrays; app-only 139 materially understated the gate migration.
- **Why it matters HERE:** strictness changes compete with `[SEQ]` correctness work and should not be smuggled into a feature RFC.
- **Concrete risk:** a broad non-null assertion sweep creates test noise and hides real boundary fixes.
- **Recommended direction:** enable free `noUncheckedSideEffectImports` now; treat indexed access as a dedicated staged program.
- **Migration difficulty:** HIGH
- **Best mechanism:** Planned strictness program
- **Acceptance condition:** both app/spec tsc pass with the flag and no broad assertion suppression.

### F-14 - Typed lint should be introduced rule-first, not preset-first

- **Finding name:** Typed ESLint backlog measured
- **Category:** Lint tooling
- **Severity:** MEDIUM
- **Scope:** TypeScript source/specs
- **Evidence:** scratch `eslint-typed.cjs` loads the repo config via `createRequire`, adds `tseslint.configs.recommendedTypeChecked`, and sets `parserOptions: { projectService:true, tsconfigRootDir:'C:/Users/78701/Desktop/trading-emulator/emulador' }`. Exact raw command: `npx eslint --config "C:\Users\78701\AppData\Local\Temp\opencode\eslint-typed.cjs" src; $exit=$LASTEXITCODE; "DIRECT_EXIT=$exit"; exit $exit` -> 2,392 errors, exit 1. A narrow config with only `@typescript-eslint/no-floating-promises` reports 4; `['error',{ignoreVoid:false}]` reports 23, including `state/telemetry/telemetry.effects.ts:519` and `services/telemetry-db.service.ts:190,196`.
- **Observed pattern:** the preset is high-noise; one targeted promise rule has a bounded, correctness-relevant backlog.
- **Why it matters HERE:** default `ignoreVoid` misses the confirmed telemetry rejection path.
- **Concrete risk:** enabling the preset causes suppression churn; enabling the default promise rule leaves real unhandled rejections invisible.
- **Recommended direction:** introduce project-service typing with only `no-floating-promises` and `ignoreVoid:false`; triage 23 sites before gating.
- **Migration difficulty:** LOW-MEDIUM
- **Best mechanism:** Targeted typed ESLint rule
- **Acceptance condition:** every site awaits, handles rejection, or uses a documented safe wrapper; lint then reports zero.

### F-15 [CAP] - Two kernel import rules are verified zero-backlog

- **Finding name:** Architectural import prototypes
- **Category:** Static enforcement
- **Severity:** MEDIUM-HIGH
- **Scope:** chart domain and production/test boundary
- **Evidence:** `eslint-domain-boundary.cjs` extends the repo flat config and scopes `no-restricted-imports` patterns `['@angular/*','@ngrx/*']` to `src/app/domain/chart/**/*.ts`. Command `npx eslint --config "C:\Users\78701\AppData\Local\Temp\opencode\eslint-domain-boundary.cjs" src/app/domain/chart; $exit=$LASTEXITCODE; "DIRECT_EXIT=$exit"; exit $exit` -> exit 0. `eslint-test-boundary.cjs` bans path `vitest` and patterns `['@vitest/*','**/*.spec-util','**/*.spec-util.ts']` under `src/**/*.ts`, then disables the rule for specs/spec-utils/testing/test-setup. Command against `src` -> exit 0.
- **Observed pattern:** both invariants hold entirely through discipline today and have zero migration backlog under the prototypes.
- **Why it matters HERE:** I1 clause 1 and invariant 7 can become executable at no dependency cost, exactly as PHILOSOPHY 2.7 requires.
- **Concrete risk:** future framework or test-runtime imports pass current tsc/tests and may contaminate the engine or production bundle.
- **Recommended direction:** adopt both scoped rules unchanged in principle; retain the build sentinel as defense in depth.
- **Migration difficulty:** TRIVIAL
- **Best mechanism:** Existing ESLint `no-restricted-imports`
- **Acceptance condition:** representative forbidden imports fail lint while current tests/test utilities remain allowed.

### F-16 - CI absence on develop is empirically corroborated

- **Finding name:** Develop PRs carry no repository verification checks
- **Category:** CI/CD
- **Severity:** HIGH
- **Scope:** PRs #51/#56 and `.github/workflows/ci.yml`
- **Evidence:** exact commands `gh pr view 56 --json number,title,baseRefName,headRefName,headRefOid,mergeCommit,statusCheckRollup` and the same for 51. Both return `baseRefName:"develop"`; each rollup contains only `Vercel` and `Vercel Preview Comments`, no Pipeline/Frontend repository check. Config independently limits PR CI to main at `.github/workflows/ci.yml:3-7`.
- **Observed pattern:** architectural RFC/back-merge work reaches develop with hosting previews but no type/test/lint/build evidence.
- **Why it matters HERE:** parallel feature branches need fast, independent failure detection before integration.
- **Concrete risk:** Linux/lockfile/format/build failures surface only in the eventual large release PR.
- **Recommended direction:** trigger CI on develop PRs and require checks via branch protection.
- **Migration difficulty:** TRIVIAL YAML; owner dashboard action for protection
- **Best mechanism:** GitHub Actions plus ruleset
- **Acceptance condition:** a develop-targeted PR shows repository frontend/pipeline checks and cannot merge red.

### F-17 - Pipeline credential handling is clean

- **Finding name:** R2 credential-source verification
- **Category:** Security
- **Severity:** INFO
- **Scope:** Python pipeline
- **Evidence:** `pipeline/r2_uploader.py:35-56` requires account, bucket, access-key, and secret-key environment variables; `pipeline/fill_r2.py:37-47` optionally reads `.env` through `os.environ.setdefault`, preserving existing environment values.
- **Observed pattern:** no embedded secret or credential fallback.
- **Why it matters HERE:** direct reads confirm the earlier repository grep was not masking a file-local fallback.
- **Concrete risk:** none found.
- **Recommended direction:** no change.
- **Migration difficulty:** NONE
- **Best mechanism:** Preserve current environment-only contract
- **Acceptance condition:** tracked pipeline files continue to contain no credential literals.

## RESUME BRIEF

- **Role/scope:** read-only tooling/CI/deps/security audit at `develop` / `a2ca53b`.
- **Probe configs:** all under `C:\Users\78701\AppData\Local\Temp\opencode`; repo configs were never modified. Strict JSON is `{ "extends":".../tsconfig.spec.json", "compilerOptions": { <flags>, "typeRoots":[".../emulador/node_modules"], "outDir":".../out/..." } }`.
- **Outputs:** spec indexed-access 883/exit2; combined 934/exit2; typed preset 2392/exit1; floating promises 4 default and 23 with `ignoreVoid:false`; both import prototypes exit0; PR #51/#56 have Vercel-only checks.
- **Dead ends:** initial temp configs without project `typeRoots` produced TS2688 setup errors and were discarded; do not count them. No baseline gates/build/install rerun.
- **Remaining steps:** synthesis only; prefer targeted typed lint over the full preset.
- **Digest spec:** preserve green baseline and original F-01-F-04; add F-13-F-17 and call import rules verified zero-backlog.
