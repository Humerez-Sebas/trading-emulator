# Engine Boundary Restoration Report

## Verdict

**ACCEPTED at implementation head `646a441d0fb373dc3d3d555220ebb99006e6a542`.** Independent
whole-range review found zero Critical, High, or Medium issues, and the controller's raw,
unpiped final five-gate run passed. The earlier acceptance at `b06fb62`, subsequent rejection,
and correction evidence remain below as historical records rather than the current verdict.

## Final Acceptance Record

- Independent whole-range verdict: `ACCEPTED` at clean implementation head `646a441`, with
  zero Critical/High/Medium findings.
- One residual Low is bounded and non-blocking: lexical shadowing can produce a false positive
  in the syntax-only detector. For example, an imported forbidden alias `H` followed by an
  unrelated exported generic `export type P<H> = H` can be reported. No production occurrence
  was found; this does not represent general type-flow coverage.
- The worktree was clean at the accepted implementation head before this evidence-only edit.
- No dependency/lockfile, push, merge, deploy, or remote change occurred.

Controller-owned raw, unpiped final gates from `emulador/` at `646a441`:

| Gate | Exit | Evidence |
|---|---:|---|
| `npx tsc -p tsconfig.app.json --noEmit` | 0 | No diagnostics. |
| `npx tsc -p tsconfig.spec.json --noEmit` | 0 | No diagnostics. |
| `npx ng test --watch=false` | 0 | 185 files; 2467 tests passed. |
| `npm run lint` | 0 | Local RuleTester ran; Angular lint reported `All files pass linting.` |
| `npm run build` | 0 | Initial total `651.83 kB`; only the known 500 kB budget warning (`151.83 kB` over). No unexpected or Vitest chunk type. |

Branch disposition remains **MERGE AS-IS** only when the owner chooses normal integration,
with fresh combined gates after integration (and after any conflict resolution).

## Scope Delivered

- Deleted `ChartEngine.chartApi` and `ChartEngine.seriesApi`.
- Migrated 22 production bridge call sites (24 raw operations when the two retained
  `IPriceLine.applyOptions` calls are included) to six narrow `ChartEngine` methods and
  three `TradingCapability` placement-preview methods.
- Routed built-in capability construction through a chart-domain registry, including the
  frozen scene host, without making `chart-engine.ts` import concrete capabilities.
- Narrowed `hitTestTradeLine` to a handle-free copy and moved placement-line ownership into
  `TradingCapability`.
- Corrected five malformed indentation blocks in
  `chart.component.trade-guard.spec.ts`; no assertions or behavior changed.
- Corrected the checkpoint boundary spec: exact bridge-name absence remains runtime-tested;
  renamed public handle outputs are now checked at compile time over `keyof ChartEngine`.
- Added and enabled a local ESLint detector with deterministic `RuleTester` coverage.
- Preserved the earlier C-R1 corrections: registration returns `void`, while hosts receive
  only mapped drawings/trading facades.
- Reduced raw library mouse callbacks to `ChartPointerEvent` before event-bus emission.
- C-R5 replaced caller-supplied constructors with a closed four-ID built-in registration
  contract. Concrete composition lives in `capability-registry.ts`; `chart-engine.ts` imports
  no concrete capability class.
- C-R6 rejects exported type aliases rooted in tracked forbidden named or namespace bindings,
  including qualified/indexed forms, while preserving data-only aliases.

The detailed OLD-to-NEW map and ownership rationale are in `ENGINE_PUBLIC_CONTRACT.md`.

## TDD Evidence

### Boundary Contract

Targeted checkpoint reproduction before correction:

```text
npx ng test --watch=false --include=src/app/domain/chart/chart-engine.boundary.spec.ts
exit 1
Test Files 1 failed (1)
Tests 1 failed | 17 passed (18)
Assertion: expected [ 'chart', 'mainSeries' ] to deeply equal []
```

Root cause: the runtime reflection enumerated transpiled private own properties and therefore
could not represent the TypeScript public surface. It also overclaimed that reflection would
detect any renamed getter.

After replacing only the overbroad assertion:

```text
same targeted command: exit 0
Test Files 1 passed (1)
Tests 19 passed (19)
npx tsc -p tsconfig.spec.json --noEmit: exit 0
```

Delegation, pass-through/null behavior, range echo semantics, capability construction,
duplicate registration, render fan-out and destroy lifecycle tests remain.

### ESLint Detector

RED was established with the deterministic rule test before implementation:

```text
node eslint-rules/no-chart-handles.test.js
exit 1: Cannot find module './no-chart-handles'
```

GREEN after the smallest local AST rule:

```text
node eslint-rules/no-chart-handles.test.js
exit 0
```

Cases prove all four named handles fail, aliases fail, namespace imports fail, dot/indexed
TypeScript import types fail, named/star re-exports fail, exported named/qualified/indexed
aliases fail, and data-only forms pass.

## Detector Semantics And State

Rule: `engine-boundary/no-chart-handles`.

- Applies to non-spec TypeScript under `src/app/**`.
- Chart-domain files may import owned handles but may not directly re-export them.
- Rejects named imports `IChartApi`, `ISeriesApi`, `IPriceLine` and
  `ISeriesMarkersPluginApi` from `lightweight-charts`.
- Rejects namespace imports from `lightweight-charts`, which could bypass named checks.
- Allows `LogicalRange`, `MouseEventParams`, `Time`, `UTCTimestamp` and data-only imports.
- Inspects static imports, TypeScript import types, and direct re-exports.
- Inspects exported aliases whose immediate root is a tracked forbidden named or namespace
  binding; it does not recursively follow aliases or dependencies.
- Uses plain ESLint AST and existing packages; no dependency or lockfile changed.
- Backlog at enablement: **0 production violations** outside `domain/chart`.
- Suppressions for this rule: **0**.

The existing non-domain handle import in `components/chart/time-coordinates.spec.ts` is a
test fake and is excluded at config level, as intended.

## Negative Probes

Neither mutation was committed.

### Detector Mutation (mandatory)

Temporary mutation in `chart.component.ts`:

```ts
import { IChartApi, LogicalRange, MouseEventParams, Time, UTCTimestamp } from 'lightweight-charts';
```

Command and result:

```text
npx eslint src/app/components/chart/chart.component.ts
exit 1
2 errors, 0 warnings
1 engine-boundary/no-chart-handles error at 22:10
1 @typescript-eslint/no-unused-vars error at 22:10
```

The boundary error was:

```text
Do not import IChartApi outside src/app/domain/chart. Use a narrow ChartEngine or Capability contract instead
```

After exact restoration, the same lint command exited `0`, `git diff --exit-code` for the
file exited `0`, and status was clean.

### Public-Surface Mutation

Temporary mutation in `chart-engine.ts`:

```ts
public get renamedChartHandle(): IChartApi {
  return this.chart;
}
```

`npx tsc -p tsconfig.spec.json --noEmit` exited `1` at
`chart-engine.boundary.spec.ts` (`TS2554` on the `expectTypeOf` equality), proving a renamed
public getter changes `PublicHandleEscapeHatches` away from `never`. After exact restoration,
spec TypeScript exited `0`, `git diff --exit-code` for the file exited `0`, and status was
clean.

## Behavior-Preservation Evidence

- Six narrow methods delegate to the same underlying lightweight-charts calls and preserve
  input/output values; covered by `chart-engine.boundary.spec.ts`.
- `shiftVisibleRange` remains echoing while `applyVisibleRange` remains one-shot suppressed;
  both next-frame semantics are explicitly tested.
- Engine-side built-in capability construction preserves chart order
  `drawings,countdown,session,trading`, frozen order `trading,drawings,session`, duplicate-id
  error text, facade lookup, render fan-out and destroy-before-chart order.
- Placement preview specs preserve exact line styles/options, no-op movement, replacement,
  teardown and handle-free hit results.
- Existing guard specs were rewired to narrow engine fakes without assertion changes.
- Frozen scene registers the same three capability classes and remains non-interactive.

## Historical Gates

The first closeout attempt preserved these raw, unpiped results from `emulador/`:

| Gate | Exit | Evidence |
|---|---:|---|
| `npx tsc -p tsconfig.app.json --noEmit` | 0 | No diagnostics. |
| `npx tsc -p tsconfig.spec.json --noEmit` | 0 | No diagnostics. |
| `npx ng test --watch=false` | 1 | 184 files passed / 1 failed; 2444 tests passed / 1 failed (2445). Only `candles-writer.spec.ts` timed out at 5000 ms. A raw full retry reproduced the same single failure. |
| `npm run lint` | 0 | `All files pass linting.` Zero problems and zero detector suppressions. |
| `npm run build` | 0 | Initial total `651.83 kB`; exactly one warning: 500 kB initial budget exceeded by `151.83 kB`. No new chunk type observed. |

The `candles-writer` failure is the known load-sensitive timeout, not hidden or counted as
green. The failing existing spec was run alone with the normal Angular runner and passed all
`9/9` tests in `2.08 s` of test time (command exit `0`), while both full runs exceeded the
same fixed 5000 ms limit (`5029 ms` and `5014 ms`). No Track C file imports or modifies the
worker/spec, and all 19 boundary-contract tests pass. The timeout was not raised or otherwise
masked because that would broaden this track.

An earlier setup step ran `npm ci` successfully. It did not change `package.json` or
`package-lock.json`; no dependency or lockfile mutation occurred. No deploy, push, merge or
work outside this Track C worktree occurred.

## Closeout Review Resolution

Independent review of `894d72b..24e1dad` rejected the first closeout attempt with two High
and three Medium findings. Resolutions:

- Raw `MouseEventParams` no longer crosses the engine bus; RED was `2 failed / 19 passed`,
  GREEN is `23/23` after adding the event, recursive type, and facade retrieval contracts.
- The detector now runs inside `domain/chart` in import-allowed/export-denied mode, closing
  direct and import-then-export domain barrel bypasses.
- Recursive compile-time checks cover `ChartEventMap` and `CapabilityApiMap`.
- Capabilities receive a private bus distinct from the subscribe-only host event source, so
  structurally compatible raw library payloads cannot be emitted to host listeners.
- This report, the public contract, and the ledger now describe `void` registration,
  facade lookup, and the earlier successful `npm ci` accurately.
- The Low indexed-import-type bypass was also closed with `RuleTester` coverage.

Review loops subsequently found and resolved the two-step domain barrel variants and the
shared-bus structural payload path. Independent review of head `b06fb62` returned `ACCEPTED`:
zero Critical, High, or Medium findings. That verdict is historical evidence only and was
superseded by the later C-R5/C-R6 whole-range review. Its sole Low noted that the detector's
four-handle set does not attempt to classify every mutable lightweight-charts interface;
that remains outside the bounded rule.

## Historical Final Gates At `b06fb62`

These raw, unpiped results were recorded at the now-superseded accepted head `b06fb62`; they
are not current final-gate evidence for C-R5/C-R6:

| Gate | Exit | Evidence |
|---|---:|---|
| `npx tsc -p tsconfig.app.json --noEmit` | 0 | No diagnostics. |
| `npx tsc -p tsconfig.spec.json --noEmit` | 0 | No diagnostics. |
| `npx ng test --watch=false` | 0 | 185 files passed; 2450 tests passed. |
| `npm run lint` | 0 | Local `RuleTester` suite ran first; Angular lint reported `All files pass linting.` |
| `npm run build` | 0 | Initial total `651.83 kB`; only the known 500 kB budget warning (`151.83 kB` over). No unexpected or Vitest chunk type. |

## C-R5/C-R6 TDD And Mutation Evidence

### C-R5

- Initial runtime RED: targeted `chart-engine.boundary.spec.ts` exited `1`, with `1 failed /
  24 passed (25)`. The constructor was accepted and did not throw.
- Desired-contract RED: the three-file boundary/registry/frozen run failed to compile because
  `capability-registry.ts` did not exist, string IDs were not assignable to the old constructor
  parameter, and the constructor-negative `@ts-expect-error` was unused.
- GREEN: the same three-file command passed `3 files / 49 tests`; the final focused boundary
  run passed `26/26`.
- Declaration-widening mutation: temporarily adding an executable constructor to
  `BuiltInCapabilityId` made `npx tsc -p tsconfig.spec.json --noEmit` exit `1` with `TS2578`
  on the now-unused constructor-negative directive. Restored spec TypeScript exited `0`.
- Runtime-fallback mutation: temporarily invoking an unknown registration value as a
  constructor made the focused boundary run fail `1 / 25 passed`; the failure printed
  `ProbeCapability.built` containing the probe, its raw series, chart, and capability bus.
  Restoration passed `26/26`.
- `capability-registry.ts` SHA-256 before and after both mutations was
  `8EDC083A8C51110321ADDFC90921985C4EA0C355E71265DA41F0F365031D1897`.

### C-R6

- RED: `node eslint-rules/no-chart-handles.test.js` exited `1` at the first exported-alias
  case: `Should have 1 error but had 0`.
- GREEN: the same RuleTester command exited `0` with named `H`, `LC.IChartApi`,
  `LC['ISeriesApi']`, `H['priceScale']`, whole-namespace negatives, and named/qualified/indexed
  data-only positives.
- Production named-alias mutation in `capability.ts` (`IPriceLine as H`; exported alias `H`):
  ordinary `npm run lint` exited `1` with exactly one
  `engine-boundary/no-chart-handles` error.
- Production namespace-alias mutation in `capability.ts` (`LC.IChartApi`): ordinary
  `npm run lint` exited `1` with exactly one boundary error.
- Both mutations were reversed with patches. `capability.ts` SHA-256 before and after was
  `6D11CAE1E7A0866B56C69C0380E7F3D297DED3BADA6CDD48F67482EC0292563D`; restored ordinary lint
  exited `0`.

### Current Requested Checks

These are implementation checks, not independent acceptance or final full gates:

| Check | Exit | Evidence |
|---|---:|---|
| affected chart/frozen suites | 0 | 28 files; 311 tests passed. |
| `npx tsc -p tsconfig.app.json --noEmit` | 0 | No diagnostics. |
| `npx tsc -p tsconfig.spec.json --noEmit` | 0 | No diagnostics. |
| `npm run lint` | 0 | RuleTester ran first; Angular lint reported `All files pass linting.` |

## Final Track C Review Correction

The final review found that C-R6's immediate indexed-object check did not carry a tracked
namespace handle through a direct nested indexed alias. This correction remains bounded to
exported aliases whose syntax is a direct `TSTypeReference` / `TSQualifiedName` /
`TSIndexedAccessType` chain; it does not add recursive local-alias flow, unions, conditionals,
dynamic imports, or type-checker analysis.

- RuleTester RED: `node eslint-rules/no-chart-handles.test.js` exited `1` at the exact
  `LC.ISeriesApi<'Candlestick'>['createPriceLine']` case with
  `Should have 1 error but had 0`. The exact `LC['IChartApi']['priceScale']` case was added in
  the same RED patch.
- RuleTester GREEN: the same command exited `0`. Matching direct nested data-only forms,
  `LC.CandlestickData['close']` and `LC['CandlestickData']['close']`, remain valid.
- Ordinary `npm run lint` exited `0`, proving the RuleTester suite still runs before Angular
  lint. App and spec TypeScript both exited `0` with no diagnostics.
- Production chart-domain mutation: temporarily exporting
  `LC.ISeriesApi<'Candlestick'>['createPriceLine']` from `capability.ts` made ordinary
  `npm run lint` exit `1` with exactly one `engine-boundary/no-chart-handles` error. The file
  was inverse-patched; its SHA-256 returned to
  `6D11CAE1E7A0866B56C69C0380E7F3D297DED3BADA6CDD48F67482EC0292563D`, its diff was empty,
  and restored ordinary lint exited `0`.
- No production TypeScript, dependency, or lockfile changed. No full suite or build was run
  for this lint-only review correction, and this evidence makes no independent acceptance or
  final full-gate claim.

## Final Track C Medium Correction

The final Medium finding was declaration-order dependence in C-R6 binding tracking. The rule
recorded relevant named and namespace locals only during `ImportDeclaration` traversal, so a
legal export before its import saw no tracked binding. The correction precollects only relevant
top-level `lightweight-charts` imports from `Program.body` when `allowImports` is enabled. The
normal import visitor retains all non-domain reporting, including exact one-report behavior.

- RuleTester RED: `node eslint-rules/no-chart-handles.test.js` exited `1` at the first late
  named alias with `Should have 1 error but had 0`.
- RuleTester GREEN: the same command exited `0`. Invalid cases cover late named alias,
  namespace-qualified nested, namespace-indexed nested, source-less named export specifier,
  and namespace export specifier forms. Late named and namespace data-only aliases/exports pass.
- `npm run lint`, `npx tsc -p tsconfig.app.json --noEmit`, and
  `npx tsc -p tsconfig.spec.json --noEmit` each exited `0` after implementation.
- Production chart-domain mutation: a temporary exported
  `LC.ISeriesApi<'Candlestick'>['createPriceLine']` alias before its namespace import in
  `capability.ts` made ordinary lint exit `1` with exactly one boundary diagnostic. Its inverse
  patch restored Git blob hash `8aab57eb1a2e8b833e9e1f9007e6d1d460eff7bc`, zero file diff,
  and green ordinary lint.
- No recursive local type flow, dependency traversal, production TypeScript, dependency, or
  lockfile change was introduced. No full Angular suite or build was run for this correction.
  This implementer evidence does not claim independent acceptance or a final full-gate run.

## Residual Risk

- The accepted residual Low is lexical-shadowing over-reporting in the syntax-only detector:
  an imported forbidden alias can be shadowed by an unrelated exported generic parameter of
  the same name. No production occurrence was found; the false positive is bounded and
  non-blocking, and is not evidence of general type-flow coverage.
- The import detector does not perform general type-flow analysis or inspect runtime dynamic
  `import()` / CommonJS `require()` expressions. This TypeScript ESM app has zero measured
  production use of those forms; static imports, TypeScript import types, and direct
  re-exports plus direct exported aliases of tracked bindings are enforced.
- `Capability.init` legitimately receives `IChartApi` inside `domain/chart`; capability
  implementations remain trusted boundary owners and require normal review/lifecycle tests.
- TypeScript `private` is compile-time privacy, not ECMAScript `#private`; runtime reflection
  can observe internal own properties. This is not public API, and the corrected test avoids
  claiming otherwise.
- The historical full-suite timeout evidence above remains preserved separately from the
  later historical green suite at `b06fb62`.
