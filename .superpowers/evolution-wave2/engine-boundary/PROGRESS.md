# Wave 2 / Agent C — Engine Boundary Restoration — PROGRESS

Worktree: `C:\Users\78701\Desktop\trading-emulator-engine-boundary`
Branch: `agent/engine-boundary-restoration`
Base SHA: `894d72be95f8ad4b8d63e629114e486e825b13d7`

## STATUS

**ALL 22 PRODUCTION BRIDGE CALL SITES ARE MIGRATED. The bridge getters are DELETED. The
public surface HAS shrunk (see SURFACE DELTA).** Remaining work is spec-stub rewiring,
new tests, the I1 detector and the two report artifacts.

Gate state as of `663efbb`:
- `npx tsc -p tsconfig.app.json --noEmit` → **exit 0** (fresh, run after the rewiring).
- `npx tsc -p tsconfig.spec.json --noEmit` → **exit 0**. NOTE: this proves nothing about the
  specs, because they cast the component to `any`; see the 6 runtime failures below. That is
  the Wave-1 lesson repeating — green types over a broken boundary.
- targeted `npx ng test --watch=false --include="src/app/components/chart/chart.component.*.spec.ts"`
  → **exit 1: 6 failed / 24 passed (30)**, 2 failed files. Full suite NOT yet run.
- `npm run lint` NOT yet run. `npm run build` NOT yet run.

**I1 DETECTOR: NOT ENABLED. The backlog is not zero yet** — not because production code
still reaches for a handle (it does not), but because I have not written the rule or proven
zero violations. Do NOT claim I1 is on. See I1 PLAN below for the exact scoping that makes
it suppression-free.

## COMPLETED

- C1 recon + full call-site classification (RECOUNT below): **22**, not 18.
- Design fixed (DESIGN below), with three rejected alternatives recorded.
- `capability.ts`: stale RFC-004/005 NOTE replaced; new `MainSeriesCapability<T>`.
- `chart-engine.ts`: `chartApi` + `seriesApi` getters and their TODO **DELETED**;
  `registerCapability` now takes the capability CLASS and injects the engine's own series;
  the 6 new narrow methods added.
- `trading-capability.ts`: `addPlacementLine` / `movePlacementLine` /
  `clearPlacementLines`; `destroy()` clears preview lines; `hitTestTradeLine` returns a
  handle-free `TradeLineHit` **copy** (not the stored object, so the `IPriceLine` really
  cannot escape).
- `chart.component.ts`: all 22 sites migrated; `private chart`, `private series` and
  `placingLines` fields deleted; `IChartApi`/`ISeriesApi`/`IPriceLine`/`LineStyle` imports
  gone; new private `tradingCap` getter.
- `frozen-scene-host.component.ts`: 3 `engine.seriesApi` reads → `registerCapability(Class)`.
- `chart.component.pane-guard.spec.ts`: `stubEngine` now serves `priceForY`/`yForPrice`.

Commits: `6db3c0f` recon → `a1c7f70` engine getters deleted → `cc03bd4` progress →
`2443e22` **the main refactor** → `663efbb` pane-guard stub (partial).

## SURFACE DELTA (the C3 hard criterion — already satisfied structurally)

Deleted: `chartApi` (returns `IChartApi`), `seriesApi` (returns `ISeriesApi`). Those two
members made the ENTIRE lightweight-charts object graph reachable from Angular
(`IChartApi` → `ITimeScaleApi`, `IPriceScaleApi`, `IPaneApi`…; `ISeriesApi` → `IPriceLine`,
primitives, markers). Added: 6 members, every one primitive-in / primitive-or-void-out.
**No added member returns a library object.** Exact method counts for the report still need
to be taken from `node_modules/lightweight-charts/dist/typings.d.ts`.

## IN FLIGHT

Deleting the now-dead per-test scaffold lines in `chart.component.pane-guard.spec.ts`
(`component.chart = {}` and `component.series = {...}` at roughly lines 170, 218, 251, 295,
321, 333, 343) — they are inert leftovers now that `stubEngine` serves the conversions.

## NOT STARTED

- `chart.component.trade-guard.spec.ts` rewiring — **this is what the 6 failures need**
  (4 of the 6 are in this file).
- `chart.component.time-shift.spec.ts` — check whether it reaches `upsertCandle`; its file
  currently PASSES, so touch it only if the full suite says otherwise.
- `frozen-scene-host.component.spec.ts`: `FakeChartEngine.registerCapability` must
  instantiate the class it is handed (`new Ctor(this.seriesApi)`) and keep pushing `cap.id`,
  so its "registers exactly these three capabilities" assertions stay identical.
- New boundary tests in `chart-engine.spec.ts` + a `trading-capability` placement spec.
- Negative probes with exact numbers.
- I1 detector.
- `ENGINE_BOUNDARY_RESTORATION_REPORT.md`, `ENGINE_PUBLIC_CONTRACT.md`.
- Full four gates + `npm run build`.

## THE 6 KNOWN FAILURES (all stub-shape, none behavioral)

`chart.component.pane-guard.spec.ts` (2): "scenario 5 (counter-guard…) still selects",
"regression: right-click inside the pane still opens the menu".
`chart.component.trade-guard.spec.ts` (4): "regression: order options are present…",
"handleContextMenu offers no order options (menu still opens)", "offers no order options",
"handleContextMenu offers no order options".

Cause: those tests scaffolded `component.series = { coordinateToPrice: () => 90 }` and left
`component.engine` undefined. The guards they pass through now read `this.engine`, so the
methods bail out early. Fix = give those tests an engine stub carrying `priceForY` (plus
`destroy` for fixture teardown) instead of a series stub. Assertions must NOT change.

IMPORTANT observation worth keeping: pane-guard "scenario 3" and "scenario 4" still PASS
even though the guard now bails early — they assert that nothing happens, so an early
return produces a false pass. The rewiring must restore the real code path or those two
tests silently stop proving anything.

## I1 PLAN (why it can be suppression-free)

Local ESLint rule (same pattern as the existing `emulador/eslint-rules/require-reset-selectors.js`,
plain AST, no new dependency): forbid importing the HANDLE types `IChartApi`, `ISeriesApi`,
`IPriceLine`, `ISeriesMarkersPluginApi` from `lightweight-charts` in files outside
`src/app/domain/chart/**`, scoped to NON-spec files. Branded payload types (`UTCTimestamp`,
`LogicalRange`, `MouseEventParams`, `Time`) stay allowed — they are the RFC-002 bus
contract. Specs are excluded at CONFIG level (the config already relaxes rules for specs
with the same "fakes and stubs are legitimate" rationale), NOT by per-line suppression;
`components/chart/time-coordinates.spec.ts` is the only spec that imports a handle type and
it does so to fake a chart for a domain function.

## EVIDENCE

### The scaffolding (two separate documented sunset conditions, NOT one)

1. `chart-engine.ts:24` (pre-edit): `// TODO: Eliminar esta exposición directa en
   RFC-004/RFC-005 una vez que DrawingsCapability y TradingCapability estén
   implementados.` → both capabilities exist (`domain/chart/capabilities/`), so THIS
   condition HAS fired.
2. `capability.ts:16-20` (pre-edit): `NOTA (RFC-004/005): es probable que `init` se
   extienda para recibir también la serie principal (`ISeriesApi<'Candlestick'>`) cuando
   Trading/Drawings la necesiten; hasta entonces los getters puente `seriesApi` cubren ese
   acceso.` → `init` was NEVER extended. See REFUTATION 1.

### RECOUNT (C1) — real number is 22 raw call sites, not 18

Wave 1 claimed 18 = 10 coord + 4 price-line + 2 `series.update` + 2 timeScale.
Measured in `emulador/src/app/components/chart/chart.component.ts` (the ONLY production
consumer of the raw handles' *methods*):

| Category | Op | Lines | n |
|---|---|---|---|
| coordinate | `series.coordinateToPrice` | 930, 1068, 1102, 1203, 1268, 1457, 1599 | 7 |
| coordinate | `series.priceToCoordinate` | 1393, 1394, 1538, 1539 | 4 |
| coordinate | `chart.timeScale().timeToCoordinate` | 1391, 1392 | 2 |
| price line | `series.createPriceLine` | 1042, 1050, 1111 | 3 |
| price line | `series.removePriceLine` | 1164 | 1 |
| data | `series.update` | 805, 846 | 2 |
| timeScale | `timeScale().scrollToRealTime` | 725, 792 | 2 |
| timeScale | `timeScale().setVisibleLogicalRange` | 877 | 1 |
| **total** | | | **22** |

Plus 2 operations Wave 1 did not count at all because they are on a LEAKED HANDLE, not on
the engine: `IPriceLine.applyOptions` at 1091 and 1110 (the component stores three
`IPriceLine` objects in `placingLines`). Counting those, **24 raw library operations**.

Plus the structural handoffs (not "calls"): `engine.chartApi`/`engine.seriesApi` read at
`chart.component.ts:630-631`; `seriesApi` read 3× at
`frozen-scene-host.component.ts:298-300`; 4 capability constructors fed the raw series at
`chart.component.ts:633,636,639,642`.

Discrepancy vs Wave 1 (finding, not nuisance):
- coordinate 13 vs 10 → Wave 1 missed the 2 `timeToCoordinate` calls inside `applySnap`
  (they go through `chart.timeScale()`, not the series, so a series-only grep misses them)
  and one `coordinateToPrice`.
- timeScale 3 vs 2 → `scrollToRealTime` appears twice (725 `resetView`, 792 `render`), not
  once.
- price lines 4 and `series.update` 2 → both confirmed exactly.
- 2 `IPriceLine.applyOptions` calls entirely absent from Wave 1's taxonomy.

### Non-domain `lightweight-charts` importers (for the I1 detector)

Outside `src/app/domain/chart/**`, only these import the package at all:
- `components/chart/chart.component.ts` — the target (handle types + `LineStyle`).
- `components/workspace/chart-panel.component.ts` — `UTCTimestamp` only (bus payload).
- `components/workspace/chart-registry.service.ts` — `LogicalRange` only (bus payload).
- specs: `components/chart/time-coordinates.spec.ts` (`import type { IChartApi }`, fakes a
  chart to test a domain fn), `chart-panel.component.spec.ts`, `chart-sync-router.spec.ts`.

So an I1 rule scoped to **handle types** (`IChartApi`, `ISeriesApi`, `IPriceLine`,
`ISeriesMarkersPluginApi`) in **non-spec** files outside `domain/chart/**` reaches ZERO
violations once `chart.component.ts` is rewired — no per-line suppressions needed. Branded
value types (`UTCTimestamp`, `LogicalRange`, `MouseEventParams`, `Time`) stay allowed: they
are the RFC-002 event-bus payload contract, not handles.

## DESIGN (decided, with reasons)

### New `ChartEngine` public members (6 added, 2 deleted)

| Member | Replaces | Why it must exist |
|---|---|---|
| `priceForY(y): number \| null` | `series.coordinateToPrice` ×7 | pane y → price |
| `yForPrice(p): number \| null` | `series.priceToCoordinate` ×4 | price → pane y |
| `xForDisplayTime(t): number \| null` | `timeScale().timeToCoordinate` ×2 | display time → x |
| `upsertCandle(c: Candle)` | `series.update` ×2 | O(1) incremental bar paint |
| `scrollToRealTime()` | `timeScale().scrollToRealTime` ×2 | recenter on newest bar |
| `shiftVisibleRange(from, to)` | `timeScale().setVisibleLogicalRange` ×1 | lazy-prepend view hold |

All six are primitive-in / primitive-or-void-out. None returns a library object.

`registerCapability` changes signature: `(cap: Capability)` → `(Ctor:
MainSeriesCapability<T>): T`. The engine constructs the capability with its OWN
`mainSeries`, so no caller ever needs the series.

### `shiftVisibleRange` must NOT reuse the existing `applyVisibleRange`

`applyVisibleRange` sets the one-shot `suppressNextRangeEvent` flag, which swallows the
next `VisibleRangeChanged` bus emission. The raw call at `chart.component.ts:877`
(`maybeLoadMore`) does NOT suppress, and that echo is observable: `ChartSyncBus` consumers
(other panels in the link group) follow the shifted range through it. Routing 877 through
`applyVisibleRange` would silently stop synced panels from following a lazy prepend — a
real behavior change. Hence a separate, deliberately non-suppressing method.

### `TradingCapability` gains the placement-preview API (3 methods)

`addPlacementLine(slot, {price, color, title})` / `movePlacementLine(slot, {price, title})`
/ `clearPlacementLines()`, slot ∈ `entry|sl|tp`. Line style is derived from the slot
(`entry` → `LargeDashed`, `sl`/`tp` → `Dashed`), which is exactly the current per-slot
constant, so `LineStyle` and `IPriceLine` leave `chart.component.ts` entirely.
`movePlacementLine` is a no-op when the slot has no line — mirrors today's `line?.applyOptions`.

Also narrowing `hitTestTradeLine`'s return from `TradeLine` (which carries `line: IPriceLine`)
to a hit type without the handle. Verified no spec and no component code reads `.line`.

## NEGATIVE PROBES

- Not run yet.

## DEAD ENDS & REFUTED HYPOTHESES

**REFUTATION 1 — Wave 1 read the `seriesApi` sunset condition backwards.**
Wave 1's premise: "Both capabilities already receive `series` through their constructor,
therefore the sunset condition has FIRED." The condition written at `capability.ts:19` is
the opposite: the getter exists *until* `init` is extended to carry the series. Capabilities
taking the series in their CONSTRUCTOR is precisely what KEPT the getter alive — a caller
must hold the series to construct them. So for `seriesApi` the documented condition had NOT
fired; it is being retired by a different mechanism (engine-side construction) instead.
`chartApi`'s condition (`chart-engine.ts:24`) HAD genuinely fired.

**Rejected: extend `Capability.init` to `(chart, series, bus)`** — the RFC's own guessed
path. Blocked by the STOP rule (`PHILOSOPHY.md` §5.7, `testing.md`): it forces a MEANING
change on the pre-existing test
`trading-capability.spec.ts:292` ("skips the x-check before init() — no chart handle yet"),
which calls `cap.render(...)` BEFORE `init()` and asserts price lines exist. With the series
arriving at `init`, that render either throws (no guard) or no-ops (with a guard), and the
`expect(cap.hitTestTradeLine(...)).not.toBeNull()` assertion inverts. `PHILOSOPHY.md` §3.1
forbids self-negotiating a level-2/3 conflict. Engine-side construction reaches the same
zero-escape-hatch endpoint and leaves every capability spec untouched.

**Rejected: `registerCapability(build: (series) => Capability)`** (factory callback) — it
hands the raw series to Angular code inside a closure, i.e. `getSeriesApi()` with extra
steps. Fails the C3 hard criterion.

**Rejected: a module-scoped `WeakMap` + `withMainSeries(engine, fn)`** — same reason.

**Rejected: `ChartEngine` installing standard capabilities itself** — the engine would have
to import `TradingCapability` etc., violating kernel invariant 2 (closed core) and creating
an import cycle.

## NEXT STEPS (exact, in order)

1. **THE EXACT NEXT ACTION:** in `chart.component.trade-guard.spec.ts`, replace each
   `component.series = { coordinateToPrice: () => 90 }` (lines ~130, 140, 219, 246) and
   `{ ...=> 95 }` (~169, 273) with `component.engine = { priceForY: () => 90, destroy: () => {} }`
   (95 where it was 95); and in the two `handleMouseDown` tests (~195, 299) simply DELETE the
   `component.chart = {}` and `component.series = {...}` lines — those tests already set a
   full `component.engine`. `destroy` is needed because `ngOnDestroy` calls `this.engine?.destroy()`
   at fixture teardown (the file already documents that at its line ~201). Leave `paneRect`
   OFF the stub: `inPane` does `this.engine?.paneRect?.()` and must keep failing OPEN
   (`undefined`), which is what those tests have always relied on.
2. Delete the now-inert `component.chart` / `component.series` lines in the pane-guard spec.
3. Re-run the targeted include; expect 30/30.
4. `frozen-scene-host.component.spec.ts` `FakeChartEngine.registerCapability(Ctor)` →
   instantiate and push the instance.
5. New tests + negative probes.
6. I1 ESLint rule (see I1 PLAN); prove zero violations with NO suppressions.
7. Gates RAW and UNPIPED: `npx tsc -p tsconfig.app.json --noEmit`,
   `npx tsc -p tsconfig.spec.json --noEmit`, `npx ng test --watch=false`, `npm run lint`,
   then `npm run build` (watch for NEW chunk types; the 648 kB budget warning is accepted).
8. Write the two report artifacts.

## RESUME BRIEF

Cold-start, zero memory assumed. `npm ci` is DONE in `emulador/`. Baseline at base SHA:
183 files / 2417 tests, all four gates green.

**Mission:** delete the expired RFC-004/RFC-005 migration bridge (`ChartEngine.chartApi`,
`ChartEngine.seriesApi`) with ZERO behavior change, replacing every raw
`lightweight-charts` call in `ChartComponent` with a narrow named contract, and prove the
public surface shrank.

**Where you are:** the hard part is DONE and committed. `chartApi`/`seriesApi` no longer
exist; `chart.component.ts` imports no handle type; all 22 call sites go through 6 new
engine methods (`priceForY`, `yForPrice`, `xForDisplayTime`, `upsertCandle`,
`scrollToRealTime`, `shiftVisibleRange`) plus 3 `TradingCapability` placement methods.
`tsc` app + spec both exit 0. **6 targeted tests fail, all of them because old specs
scaffolded the raw series onto the component; none is a behavior regression.** Start at
NEXT STEPS #1.

**Real count vs Wave 1:** Wave 1 claimed 18 (10 coord / 4 price-line / 2 update / 2
timeScale). Real: **22** raw call sites (13 coord / 4 price-line / 2 update / 3 timeScale),
plus 2 `IPriceLine.applyOptions` calls on a handle the component was holding = 24 raw
library operations. Wave 1 missed the two `timeToCoordinate` calls in `applySnap` (they go
via `chart.timeScale()`, so a series-only grep misses them), one `coordinateToPrice`, one
`scrollToRealTime`, and the two `applyOptions` calls entirely. Wave 1 also read the
`seriesApi` sunset condition BACKWARDS — see REFUTATION 1.

**Has the surface shrunk? YES, structurally** (2 members returning the whole library object
graph → 6 primitive-typed members). The exact before/after numbers for the report still
need to be counted out of `lightweight-charts`' typings.

**I1 detector: OFF, and honestly not yet earned** — the rule is not written and zero
violations are not proven. Do not report it as enabled.

Hard rules: no `getChartApi`/`getSeriesApi` or any renamed equivalent; no method returning a
library object; no suppressions to turn on the I1 rule; pathspec commits only, commit after
every unit; never touch `develop`/`main` or a sibling worktree; never push; never pipe a
gate through `| tail`.
