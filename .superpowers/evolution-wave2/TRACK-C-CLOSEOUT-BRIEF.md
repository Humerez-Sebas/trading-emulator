# Track C Closeout Brief

Use this brief only after Track A reaches independent acceptance.

## Workspace

- Worktree: `C:\Users\78701\Desktop\trading-emulator-engine-boundary`
- Branch: `agent/engine-boundary-restoration`
- Paused HEAD: `1197ed40d094531d50b08f809f8499bfce37f2ac`
- Specialist base: `894d72be95f8ad4b8d63e629114e486e825b13d7`
- State at pause: clean

Do not reset, rebase, squash, push, merge, install dependencies, or touch another
worktree. Preserve zero intentional behavior change.

## Accepted Evidence

- `chartApi` and `seriesApi` bridge getters are gone.
- The 22 known raw operations were migrated to narrow methods/capability ownership.
- The six narrow engine methods preserve their underlying calls and range-echo semantics.
- `TradingCapability` owns placement handles; hit results do not expose the price-line handle.
- Frozen-scene behavior and ordering are preserved by the diff.
- Static direct-import backlog and rule suppressions are zero.
- The boundary spec detects a renamed direct handle-returning getter.
- Reported tsc/lint/build gates are green. The reported full suite was red only on the
  known load-sensitive 25k-candle timeout; closeout still requires a fresh green full run.

## Final Review Findings To Resolve

### C-R1: generic capability construction can return a raw series (High)

`registerCapability` accepts a caller-provided constructor, passes it the engine's
`mainSeries`, and returns the concrete instance. A caller can define a capability with a
public `series` field and recover the raw handle without a forbidden static import.

Required behavior:

- Preserve engine-owned capability construction and existing capability behavior.
- Prevent non-domain consumers from receiving a capability instance that exposes the raw
  series.
- Audit `registerCapability` and `getCapability` production consumers before choosing the
  smallest API correction.
- Add a compile-time negative contract that catches the actual generic-constructor leak,
  not only direct engine getters.
- Do not add generic chart/series accessors or move capability ownership back to Angular.

### C-R2: detector claim is broader than detector semantics (Medium)

The rule currently inspects static `ImportDeclaration` nodes. It misses TypeScript import
types, dynamic imports, CommonJS require, and re-exported handles.

Required behavior:

- Either extend the narrow rule to the prohibited forms that can exist in this TS app, or
  narrow the chart comment and reports to exactly what is enforced.
- At minimum detect `import('lightweight-charts').IChartApi`-style type imports and direct
  re-exports, because they bypass the current named/namespace checks without runtime code.
- Avoid false positives for data-only lightweight-charts types.

### C-R3: rule tests are outside repository gates (Medium)

`eslint-rules/no-chart-handles.test.js` is not discovered by Angular tests or `ng lint`.
Wire it into an existing required command without adding a dependency. The normal
`npm run lint` gate should fail if the local-rule tests fail.

### C-R4: install-history wording (Low)

Correct reports that claim no install occurred. Git history records an earlier successful
`npm ci`; package and lockfiles remained unchanged. Preserve both facts.

## Verification

Use TDD, record exact RED/GREEN evidence, and repeat both a prohibited import mutation and
the generic capability leak mutation. Restore exactly. Run all five raw gates from
`emulador/`, including a fresh green full suite, then update both reports and `PROGRESS.md`.
Commit only explicit pathspecs and request a new independent acceptance review.

## 2026-08-20 Cold-Resume Addendum

Current branch head: `66211cc4828f42ceea4b9289024bfab743ec7fcd`, clean. A fresh
whole-range review rejected the earlier acceptance with one High and one Medium finding. Resolve
only C-R5 and C-R6 after Track A is independently accepted.

### C-R5: caller-supplied capability constructor side channel (High)

`registerCapability()` returns `void`, but it still accepts an arbitrary caller-provided
constructor and passes raw `mainSeries` into it. A caller can retain the instance or series in a
static field or closure. `ProbeCapability.built` in the boundary spec demonstrates the escape;
the current negative contract checks only the method return type.

Required behavior:

- Non-domain callers must not supply arbitrary constructors that receive raw chart/series
  handles.
- Keep construction/lifecycle ownership in the vanilla TypeScript engine without importing
  Angular, NgRx, or concrete capabilities into the engine core.
- Audit all production registration and lookup consumers; use the smallest closed domain
  registration contract that preserves built-in and frozen-scene behavior.
- Add a negative contract for the retained-instance/static-field escape itself.
- Do not add a generic raw-handle accessor or return capability ownership to hosts.

### C-R6: exported type-alias declarations bypass lint (Medium)

The detector tracks forbidden imported bindings through export specifiers but misses exported
`TSTypeAliasDeclaration` forms such as:

```ts
import type { IChartApi as H } from 'lightweight-charts';
export type Public = H;
```

and namespace-qualified aliases such as `export type Public = LC.IChartApi`.

Required behavior:

- Reject exported aliases resolving to tracked forbidden named or namespace imports, including
  qualified/indexed forms.
- Add failing `RuleTester` cases for both escapes and passing data-only aliases.
- Keep the rule bounded to the four documented raw-handle interfaces; no dependency or general
  type-flow engine.
- Prove the ordinary `npm run lint` gate executes the new cases.

After correction, repeat and restore both actual negative mutations, request a fresh independent
review of `894d72b..new HEAD`, and only after acceptance independently run all five raw gates.
