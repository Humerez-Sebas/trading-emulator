# Wave 2 / Agent C — Engine Boundary Restoration — PROGRESS

Worktree: `C:\Users\78701\Desktop\trading-emulator-engine-boundary`
Branch: `agent/engine-boundary-restoration`
Base SHA: `894d72be95f8ad4b8d63e629114e486e825b13d7`

## STATUS

IMPLEMENTING. Engine + capability contract edited and committed (`a1c7f70`). Consumers
(`chart.component.ts`, `frozen-scene-host.component.ts`) NOT yet rewired — tsc is
currently RED by construction. Gates not yet run. `npm ci` completed OK in `emulador/`.

## COMPLETED

- C1 recon + full call-site classification (see RECOUNT below).
- Design decision fixed (see DESIGN below).
- `capability.ts`: stale RFC-004/005 NOTE replaced; new `MainSeriesCapability<T>` type.
- `chart-engine.ts`: `chartApi` / `seriesApi` getters + their TODO DELETED; imports updated.
- Commit `6db3c0f` (recon), `a1c7f70` (engine surgery WIP).

## IN FLIGHT

`chart-engine.ts` still needs:
- `registerCapability(Ctor: MainSeriesCapability<T>): T` (constructs with its own
  `mainSeries`, then the existing duplicate-id throw, then `cap.init(chart, bus)`).
- the six new narrow query/command methods (see DESIGN).
Then the consumers + specs (see NEXT STEPS).

## NOT STARTED

- `TradingCapability` placement-preview API + `hitTestTradeLine` return narrowing.
- `chart.component.ts` rewiring (22 call sites).
- `frozen-scene-host.component.ts` (3 sites) + its spec's `FakeChartEngine`.
- Spec stub rewiring: `chart.component.pane-guard.spec.ts`,
  `chart.component.trade-guard.spec.ts`, `chart.component.time-shift.spec.ts`.
- New boundary tests + negative probes.
- I1 detector (local ESLint rule).
- `ENGINE_BOUNDARY_RESTORATION_REPORT.md`, `ENGINE_PUBLIC_CONTRACT.md`.
- All four gates + `npm run build`.

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

## NEXT STEPS

1. Finish `chart-engine.ts`: `registerCapability(Ctor)` + the 6 methods.
2. `TradingCapability`: placement-preview API, `destroy()` also clears preview lines,
   narrow `hitTestTradeLine`.
3. `chart.component.ts`: delete `private chart` / `private series` / `placingLines`;
   swap all 22 sites; guards `!this.chart || !this.series` → `!this.engine`; drop
   `IChartApi`/`ISeriesApi`/`IPriceLine`/`LineStyle` imports.
4. `frozen-scene-host.component.ts:298-300` → `registerCapability(TradingCapability)` etc.;
   its spec's `FakeChartEngine.registerCapability` must instantiate the passed class
   (assertions on registered ids stay identical).
5. Spec stub rewiring (mechanical, assertions untouched — document as a deviation):
   pane-guard (`stubEngine` gains `priceForY`/`yForPrice`; drop `component.chart`/`.series`),
   trade-guard (same), time-shift (`component.series = {update,setData}` →
   engine stub with `upsertCandle`).
6. New tests + negative probes.
7. I1 ESLint rule, scoped as described; verify zero violations with NO suppressions.
8. Gates RAW: `npx tsc -p tsconfig.app.json --noEmit`,
   `npx tsc -p tsconfig.spec.json --noEmit`, `npx ng test --watch=false`, `npm run lint`,
   then `npm run build`.
9. Write the two report artifacts.

## RESUME BRIEF

Cold-start: everything you need is in EVIDENCE + DESIGN above. `npm ci` is already done in
`emulador/`. Baseline at base SHA: 183 files / 2417 tests green.

The mission: delete the RFC-004/005 migration bridge (`ChartEngine.chartApi`,
`ChartEngine.seriesApi`) without changing behavior, replacing 22 raw `lightweight-charts`
call sites in `chart.component.ts` with a narrow named contract, and prove the public
surface shrank. Commits so far: `6db3c0f` (recon), `a1c7f70` (engine getters deleted +
`MainSeriesCapability`). tsc is RED right now on purpose — consumers still reference the
deleted getters. Resume at NEXT STEPS #1.

Hard rules: no `getChartApi`/`getSeriesApi` or any renamed equivalent; no method returning
a library object; no suppressions to turn on the I1 rule; pathspec commits only; never
touch `develop`/`main` or sibling worktrees; never push.
