# Wave 2 / Agent C - Engine Boundary Restoration - PROGRESS

Worktree: `C:\Users\78701\Desktop\trading-emulator-engine-boundary`
Branch: `agent/engine-boundary-restoration`
Base SHA: `894d72be95f8ad4b8d63e629114e486e825b13d7`
Checkpoint: `a736da843a4d35490fd93007d14e9da6ff4ad932`

## Status

**TRACK C CLOSEOUT IN PROGRESS.** The historical five-gate evidence remains below. Final
review findings C-R1 through C-R4 are implemented; fresh final gates and re-review remain.

- [x] 22 production bridge call sites migrated to narrow contracts.
- [x] `chartApi` and `seriesApi` deleted; no generic getter/handle replacement added.
- [x] Capability construction routed through the engine.
- [x] Trading placement previews and hit-test results are handle-free at the host boundary.
- [x] Frozen scene migrated.
- [x] Checkpoint boundary spec corrected with runtime exact-name checks plus a compile-time
  `keyof ChartEngine` public-output contract.
- [x] Local import detector enabled at zero backlog and zero suppressions.
- [x] Five requested trade-guard indentation blocks corrected only.
- [x] Mandatory lint mutation and additional renamed-getter mutation both failed as expected,
  were restored exactly, and clean restoration was verified.
- [x] `ENGINE_PUBLIC_CONTRACT.md` and `ENGINE_BOUNDARY_RESTORATION_REPORT.md` created.
- [x] Five final raw gates recorded, including the test-gate failure without masking it.

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

- Scope: non-spec `src/app/**/*.ts`, excluding `src/app/domain/chart/**`.
- Forbidden: four named raw-handle imports and all `lightweight-charts` namespace imports.
- Allowed: payload/data imports, including `LogicalRange`, `MouseEventParams`, `Time` and
  `UTCTimestamp`.
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
```

## Final Gates

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
- Import-type negative probe: temporary
  `import('lightweight-charts').IChartApi` in `chart.component.ts` made `npm run lint` fail
  with exactly one `engine-boundary/no-chart-handles` error; inverse restoration was green.
