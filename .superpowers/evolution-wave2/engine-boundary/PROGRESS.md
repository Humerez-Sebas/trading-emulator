# Wave 2 / Agent C - Engine Boundary Restoration - PROGRESS

Worktree: `C:\Users\78701\Desktop\trading-emulator-engine-boundary`
Branch: `agent/engine-boundary-restoration`
Base SHA: `894d72be95f8ad4b8d63e629114e486e825b13d7`
Checkpoint: `a736da843a4d35490fd93007d14e9da6ff4ad932`

## Status

**C-R5/C-R6 IMPLEMENTED; INDEPENDENT ACCEPTANCE AND FINAL FIVE GATES PENDING.** The prior
acceptance at `b06fb62` covered C-R1 through C-R4 but was superseded by the 2026-08-20
whole-range findings. Current implementation checks are green; this ledger does not claim a
new independent verdict or final full-gate run.

- [x] 22 production bridge call sites migrated to narrow contracts.
- [x] `chartApi` and `seriesApi` deleted; no generic getter/handle replacement added.
- [x] Capability construction routed through a closed built-in ID registry; hosts cannot
  provide executable constructors.
- [x] Trading placement previews and hit-test results are handle-free at the host boundary.
- [x] Frozen scene migrated.
- [x] Checkpoint boundary spec corrected with runtime exact-name checks plus a compile-time
  `keyof ChartEngine` public-output contract.
- [x] Local import detector enabled at zero backlog and zero suppressions, including direct
  exported aliases of tracked named/namespace bindings.
- [x] Five requested trade-guard indentation blocks corrected only.
- [x] Mandatory lint mutation and additional renamed-getter mutation both failed as expected,
  were restored exactly, and clean restoration was verified.
- [x] `ENGINE_PUBLIC_CONTRACT.md` and `ENGINE_BOUNDARY_RESTORATION_REPORT.md` created.
- [x] Historical five-gate evidence retained and clearly separated from current C-R5/C-R6
  implementation checks.

## Targeted Evidence

Boundary current failure (RED): targeted `chart-engine.boundary.spec.ts` exited `1`, with
`1 failed / 17 passed`; the false reflection assertion reported private runtime fields
`chart` and `mainSeries`.

Boundary GREEN: targeted spec exited `0`, `19 passed (19)`; spec TypeScript exited `0`.

Detector RED: `node eslint-rules/no-chart-handles.test.js` exited `1` because the rule module
did not yet exist. Detector GREEN: the same command exited `0`; direct `src/app` lint exited
`0` with the rule enabled.

Trade-guard targeted verification: `13 passed (13)`, exit `0` after indentation-only repair.

## Detector State

- Scope: non-spec `src/app/**/*.ts`; chart-domain imports are allowed but exports remain
  checked, while non-domain raw-handle imports are rejected.
- Forbidden outside the chart domain: four named raw-handle imports and all
  `lightweight-charts` namespace imports.
- Allowed: payload/data imports, including `LogicalRange`, `MouseEventParams`, `Time` and
  `UTCTimestamp`.
- Exported aliases: immediate tracked named, qualified, indexed, member-indexed and whole
  namespace handle roots are rejected; data-only equivalents pass.
- Production backlog: zero.
- Rule suppressions: zero.
- Dependencies/lockfiles: unchanged.

## Negative Probes

1. Temporary `IChartApi` named import in `chart.component.ts`: targeted lint exit `1`,
   `2 errors` total, including exactly `1 engine-boundary/no-chart-handles` failure. Restored;
   same lint exit `0`; file diff and status clean.
2. Temporary public `renamedChartHandle: IChartApi` getter in `ChartEngine`: spec TypeScript
   exit `1`, `TS2554` at the `expectTypeOf` equality. Restored; spec TypeScript exit `0`;
   file diff and status clean.

## Commits After Checkpoint

```text
b4cb0c9 test(chart): enforce the public engine handle boundary
a9ba615 chore(lint): enforce the chart handle boundary
a34f3b6 style(chart): repair trade guard fixture indentation
57c7813 fix(chart): close capability registration contract
a33d639 fix(lint): reject exported chart handle aliases
9e64211 fix(lint): reject nested chart handle aliases
```

## Historical Gates

```text
npx tsc -p tsconfig.app.json --noEmit   exit 0
npx tsc -p tsconfig.spec.json --noEmit  exit 0
npx ng test --watch=false               exit 1
  Test Files 184 passed | 1 failed (185)
  Tests      2444 passed | 1 failed (2445)
  only candles-writer.spec.ts 25k-row case: timeout at 5000 ms
  raw full retry: same one failure, exit 1
npx ng test --watch=false --include=src/app/workers/candles-writer.spec.ts
  exit 0, 1 file / 9 tests passed, test time 2.08 s
npm run lint                             exit 0, All files pass linting
npm run build                            exit 0, initial 651.83 kB
  1 known warning: 500 kB budget exceeded by 151.83 kB
```

An earlier setup step ran `npm ci` successfully; `package.json` and `package-lock.json`
remained unchanged. No dependency/lockfile mutation, push, merge or deploy occurred.

## Closeout Findings And Evidence

- C-R1: `registerCapability` now returns `void`; `getCapability` is keyed by
  `CapabilityApiMap` and returns only handle-free facades. The generic-return mutation made
  spec TypeScript fail at the `expectTypeOf<void>` contract; inverse restoration was green.
- C-R2: detector coverage now includes dot/indexed TypeScript import types and named/star
  direct re-exports. Chart-domain files run the rule in import-allowed/export-denied mode.
- C-R3: `npm run lint` runs `node eslint-rules/no-chart-handles.test.js` before `ng lint`.
- C-R4: install history wording corrected while preserving unchanged package/lock files.
- Independent review `ses_00402de38ffet2fHXAeapj5aSZ` rejected the first closeout attempt:
  two High and three Medium findings. The raw event payload and domain-re-export findings
  were verified and fixed; docs/proof gaps were resolved. Low indexed import type was fixed.
- Event RED: targeted boundary spec `2 failed / 19 passed`; both failures showed raw
  `hoveredSeries`, `seriesData`, and `sourceEvent` crossing the bus.
- Event/proof GREEN: targeted boundary spec `23/23`; affected event/engine/panel suite
  `101/101`; lint green with local rule tests included.
- Re-review then found a domain import-then-export bypass and shared-bus structural typing
  path. The detector now tracks forbidden imported local names through source-less exports;
  the engine now uses separate capability/host buses and exposes only `ChartEventSource`.
  Updated affected suite: `116/116` green.
- Second re-review found alias/namespace variants of the two-step domain barrel. RED local
  rule tests failed on the aliased case; the tracker now maps local bindings to original
  handle names and records namespace bindings. Local rule tests and the full lint gate are green.
- Import-type negative probe: temporary
  `import('lightweight-charts').IChartApi` in `chart.component.ts` made `npm run lint` fail
  with exactly one `engine-boundary/no-chart-handles` error; inverse restoration was green.

## Superseded Acceptance Record

- This record applies only to head `b06fb62`; the later C-R5/C-R6 review superseded it.
- Independent review session: `ses_00402de38ffet2fHXAeapj5aSZ`.
- Accepted implementation head: `b06fb62`.
- Verdict: `ACCEPTED`, zero Critical/High/Medium findings.
- One Low ruled no-fix: the detector intentionally enforces the four C-R2 raw-handle types,
  not every mutable interface exported by lightweight-charts.

Historical raw gates from `emulador/` at `b06fb62`:

```text
npx tsc -p tsconfig.app.json --noEmit   exit 0, no diagnostics
npx tsc -p tsconfig.spec.json --noEmit  exit 0, no diagnostics
npx ng test --watch=false               exit 0
  Test Files 185 passed (185)
  Tests      2450 passed (2450)
npm run lint                             exit 0
  local RuleTester executed; All files pass linting
npm run build                            exit 0, initial 651.83 kB
  only known warning: 500 kB budget exceeded by 151.83 kB
  no unexpected or Vitest chunk type
```

## C-R5/C-R6 Closeout

### C-R5

- Closed registration contract: `BuiltInCapabilityId` is exactly `drawings | countdown |
  session | trading`; `chart-engine.ts` delegates composition to `capability-registry.ts` and
  imports no concrete capability classes.
- Hosts register IDs in preserved order: chart
  `drawings,countdown,session,trading`; frozen scene `trading,drawings,session` with no
  countdown. `getCapability` remains the mapped drawings/trading facade.
- Runtime RED before implementation: boundary spec `1 failed / 24 passed (25)` because the
  caller constructor executed instead of throwing.
- Desired-contract RED: missing registry, rejected string IDs, and unused constructor-negative
  directive caused the three-file target to fail compilation.
- GREEN: boundary/registry/frozen target `3 files / 49 tests`; final boundary target `26/26`.
- Declaration-widening mutation: spec tsc exited `1`, `TS2578` on the constructor-negative
  directive; restored spec tsc exited `0`.
- Runtime-fallback mutation: boundary target exited `1`, `1 failed / 25 passed`; output showed
  `ProbeCapability.built` retaining the raw series. Restored target passed `26/26`.
- Registry SHA-256 matched before/after mutations:
  `8EDC083A8C51110321ADDFC90921985C4EA0C355E71265DA41F0F365031D1897`.

### C-R6

- RuleTester RED: `Should have 1 error but had 0` at the first exported-alias case.
- RuleTester GREEN covers `H`, `LC.IChartApi`, `LC['ISeriesApi']`, `H['priceScale']`, and the
  whole namespace, plus data-only named/qualified/indexed aliases.
- Production named and namespace alias mutations each made ordinary `npm run lint` exit `1`
  with exactly one `engine-boundary/no-chart-handles` error.
- Both mutations were patch-restored; `capability.ts` SHA-256 matched before/after:
  `6D11CAE1E7A0866B56C69C0380E7F3D297DED3BADA6CDD48F67482EC0292563D`.

### Current Checks

```text
affected chart/frozen suites                   exit 0, 28 files / 311 tests
npx tsc -p tsconfig.app.json --noEmit          exit 0, no diagnostics
npx tsc -p tsconfig.spec.json --noEmit         exit 0, no diagnostics
npm run lint                                   exit 0, RuleTester + All files pass linting
```

No full-suite or build gate was run for C-R5/C-R6 in this implementation closeout. Independent
acceptance remains pending.

## Final Track C Review Correction

- Root cause: exported indexed aliases were inspected only when `objectType` was directly a
  `TSTypeReference` whose `typeName` was an `Identifier`; direct nested namespace-qualified
  and namespace-indexed handle chains therefore escaped.
- RuleTester RED: exact
  `LC.ISeriesApi<'Candlestick'>['createPriceLine']` invalid case exited `1` with
  `Should have 1 error but had 0`; the exact `LC['IChartApi']['priceScale']` invalid case and
  matching data-only valid counterparts were added in the same test-first patch.
- RuleTester GREEN: exit `0` after bounded direct structural-root inspection across
  `TSTypeReference`, `TSQualifiedName`, and nested `TSIndexedAccessType` nodes.
- Ordinary lint: exit `0`, with RuleTester executed before `ng lint`; app and spec TypeScript:
  exit `0`, no diagnostics.
- Production chart-domain nested-alias mutation: ordinary lint exited `1` with exactly one
  `engine-boundary/no-chart-handles` error. Inverse restoration returned `capability.ts` to
  SHA-256 `6D11CAE1E7A0866B56C69C0380E7F3D297DED3BADA6CDD48F67482EC0292563D`, zero file diff, and
  restored ordinary lint exit `0`.
- Scope remains explicit: no recursive local alias/type flow, unions, conditionals, dynamic
  imports, or type checker; data-only direct nested aliases remain valid. No production
  TypeScript, dependency, or lockfile changed.
- This correction does not claim independent acceptance or a final full-gate run. No full
  Angular suite or build was run for the lint-only correction.
