# Engine Boundary Restoration Report

## Verdict

**Track C implementation is ready for final verification and re-review.** The RFC-004/RFC-005 raw-handle
bridge is retired with no intentional behavior change. The historical bridge is classified
as an **EXPIRED MIGRATION CONSTRAINT**: its migration purpose has ended, every live host
operation has a narrow owner, and the backlog is zero before detector enablement.

## Scope Delivered

- Deleted `ChartEngine.chartApi` and `ChartEngine.seriesApi`.
- Migrated 22 production bridge call sites (24 raw operations when the two retained
  `IPriceLine.applyOptions` calls are included) to six narrow `ChartEngine` methods and
  three `TradingCapability` placement-preview methods.
- Changed capability registration to class-based engine construction, including the frozen
  scene host, without making `ChartEngine` import concrete capabilities.
- Narrowed `hitTestTradeLine` to a handle-free copy and moved placement-line ownership into
  `TradingCapability`.
- Corrected five malformed indentation blocks in
  `chart.component.trade-guard.spec.ts`; no assertions or behavior changed.
- Corrected the checkpoint boundary spec: exact bridge-name absence remains runtime-tested;
  renamed public handle outputs are now checked at compile time over `keyof ChartEngine`.
- Added and enabled a local ESLint detector with deterministic `RuleTester` coverage.
- Closed the final-review constructor/generic-lookup leak: registration returns `void`, while
  hosts receive only mapped drawings/trading facades.
- Reduced raw library mouse callbacks to `ChartPointerEvent` before event-bus emission.

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
TypeScript import types fail, named/star re-exports fail, and data-only forms pass.

## Detector Semantics And State

Rule: `engine-boundary/no-chart-handles`.

- Applies to non-spec TypeScript under `src/app/**`.
- Chart-domain files may import owned handles but may not directly re-export them.
- Rejects named imports `IChartApi`, `ISeriesApi`, `IPriceLine` and
  `ISeriesMarkersPluginApi` from `lightweight-charts`.
- Rejects namespace imports from `lightweight-charts`, which could bypass named checks.
- Allows `LogicalRange`, `MouseEventParams`, `Time`, `UTCTimestamp` and data-only imports.
- Inspects static imports, TypeScript import types, and direct re-exports.
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
- Engine-side capability construction preserves registration order, duplicate-id error text,
  facade lookup, render fan-out and destroy order.
- Placement preview specs preserve exact line styles/options, no-op movement, replacement,
  teardown and handle-free hit results.
- Existing guard specs were rewired to narrow engine fakes without assertion changes.
- Frozen scene registers the same three capability classes and remains non-interactive.

## Final Gates

Final raw, unpiped results from `emulador/`:

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
  the direct domain re-export bypass.
- Recursive compile-time checks cover `ChartEventMap` and `CapabilityApiMap`.
- This report, the public contract, and the ledger now describe `void` registration,
  facade lookup, and the earlier successful `npm ci` accurately.
- The Low indexed-import-type bypass was also closed with `RuleTester` coverage.

## Residual Risk

- The import detector does not perform general type-flow analysis or inspect runtime dynamic
  `import()` / CommonJS `require()` expressions. This TypeScript ESM app has zero measured
  production use of those forms; static imports, TypeScript import types, and direct
  re-exports are enforced.
- `Capability.init` legitimately receives `IChartApi` inside `domain/chart`; capability
  implementations remain trusted boundary owners and require normal review/lifecycle tests.
- TypeScript `private` is compile-time privacy, not ECMAScript `#private`; runtime reflection
  can observe internal own properties. This is not public API, and the corrected test avoids
  claiming otherwise.
- The historical full-suite timeout evidence above remains preserved. Fresh closeout gates
  are recorded in the ledger and this report after they run.
