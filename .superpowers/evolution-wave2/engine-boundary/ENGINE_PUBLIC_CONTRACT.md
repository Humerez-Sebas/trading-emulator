# ChartEngine Public Contract After Bridge Retirement

## Status

The RFC-004/RFC-005 `chartApi` and `seriesApi` bridge is an **EXPIRED MIGRATION
CONSTRAINT**. It existed while chart behavior was being extracted from `ChartComponent`.
`DrawingsCapability` and `TradingCapability` now exist, all live consumers have narrow
operations, and the engine constructs main-series capabilities itself. The bridge no longer
has a legitimate consumer. Library mouse payloads are also reduced to the handle-free
`ChartPointerEvent` before they enter `ChartEventBus`; raw `seriesData` and `hoveredSeries`
never cross to a host. Hosts receive a subscribe-only `ChartEventSource`; capabilities use a
separate private bus and cannot publish arbitrary payloads to host listeners.

The original `chartApi` sunset condition was met directly. The old `capability.ts` note
predicted that the main series might later enter through `Capability.init`; that prediction
did not happen. The final replacement is stricter: `ChartEngine.registerCapability(id)`
accepts only the closed built-in IDs `drawings`, `countdown`, `session`, and `trading`. A
chart-domain registry maps those IDs to concrete classes and receives the engine-owned series.
Hosts cannot supply executable constructors that retain the series in a static field or closure.

Final verification status: independent whole-range review accepted clean implementation head
`646a441d0fb373dc3d3d555220ebb99006e6a542` with zero Critical/High/Medium findings. The
controller's raw, unpiped app TypeScript, spec TypeScript, Angular test (`185` files / `2467`
tests), lint (RuleTester plus `All files pass linting`), and build gates all exited `0`; build
reported only the known 500 kB budget warning (`651.83 kB` initial, `151.83 kB` over) and no
unexpected or Vitest chunk type. The sole residual Low is a bounded syntax-only false positive:
an imported forbidden alias `H` can be lexically shadowed by an unrelated exported generic such
as `export type P<H> = H`. No production occurrence was found, and this is not general type-flow
coverage.

## Escape-Hatch Map

| OLD escape hatch / operation | NEW contract | Legitimate consumer | Owner | Why it belongs there | Handle-free result |
|---|---|---|---|---|---|
| `chartApi` -> `timeScale().timeToCoordinate(time)` | `ChartEngine.xForDisplayTime(time)` | `ChartComponent.applySnap` | `ChartEngine` | The engine owns the chart time scale; the host asks one geometry question using display time. | `number \| null` |
| `seriesApi` -> `coordinateToPrice(y)` | `ChartEngine.priceForY(y)` | Chart pointer/context-menu, drag, placement, drawing and snap interactions | `ChartEngine` | Pane coordinate conversion is read-only geometry over the engine-owned main series. | `number \| null` |
| `seriesApi` -> `priceToCoordinate(price)` | `ChartEngine.yForPrice(price)` | Drawing snap and drawing geometry in `ChartComponent` | `ChartEngine` | It is the inverse read-only geometry query over the engine-owned main series. | `number \| null` |
| `seriesApi` -> `update(candle)` | `ChartEngine.upsertCandle(candle)` | Normal replay advance and forming-candle paint | `ChartEngine` | Incremental main-candle painting is engine-core data application, distinct from full `render({candles})`. | `void`; accepts domain `Candle` |
| `chartApi` -> `timeScale().scrollToRealTime()` | `ChartEngine.scrollToRealTime()` | Chart reset and first incremental replay paint | `ChartEngine` | View navigation acts on the engine-owned time scale. | `void` |
| `chartApi` -> `timeScale().setVisibleLogicalRange(...)` in lazy prepend | `ChartEngine.shiftVisibleRange(from, to)` | `ChartComponent.maybeLoadMore` | `ChartEngine` | The engine owns range mutation, and this named command preserves the old unsuppressed echo semantics. | `void`; primitive numbers in |
| `seriesApi` -> `createPriceLine(...)` for entry/SL/TP preview | `TradingCapability.addPlacementLine(slot, spec)` | Interactive order placement in `ChartComponent` | `TradingCapability` | Placement preview is trading visualization behavior, not generic chart geometry. Slot determines the existing line style internally. | `void`; domain slot/spec in |
| retained `IPriceLine.applyOptions(...)` during preview | `TradingCapability.movePlacementLine(slot, price, title)` | Interactive order placement in `ChartComponent` | `TradingCapability` | The capability owns the preview line lifecycle and translates a domain update into library options. | `void`; primitives in |
| `seriesApi` -> `removePriceLine(...)` for preview teardown | `TradingCapability.clearPlacementLines()` | Placement completion/cancellation and capability destruction | `TradingCapability` | The owner that creates preview handles must remove them, including destroy-time cleanup. | `void` |
| `seriesApi` passed by host to capability constructors | `ChartEngine.registerCapability(id)` | `ChartComponent` and `FrozenSceneHostComponent` | `ChartEngine` + chart-domain registry | Hosts select only a built-in ID; the domain registry performs constructor injection where the main series is owned. Cast/JavaScript constructor values are rejected before invocation. | Returns `void`; no executable constructor crosses from a host |
| Generic `getCapability<T>(id)` instance cast | `getCapability(id)` over `CapabilityApiMap` | `ChartComponent` | `ChartEngine` | Hosts need only drawings/trading interaction methods, not lifecycle state or constructor-held handles. | Returns the registered handle-free `publicApi` facade |
| Raw `MouseEventParams` forwarded through `ChartEventBus` | `ChartPointerEvent` | `ChartComponent` and panel sync | `ChartEngine` | Hosts consume only `time`, `logical`, and `point`; library payloads also contain live series handles. | Fresh data-only object; no `seriesData`, `hoveredSeries`, or source event |
| `hitTestTradeLine(...)` returning stored `TradeLine` with `.line` | handle-free `TradeLineHit` copy | Drag/cursor interaction in `ChartComponent` | `TradingCapability` | Hit testing belongs with the trading primitives and series geometry it owns. | Copy contains only identity, field, price and draggable state |

## Echo Contract

`shiftVisibleRange` and `applyVisibleRange` are intentionally separate:

- `shiftVisibleRange` preserves the lazy-prepend behavior and emits the next-frame
  `VisibleRangeChanged` echo so linked panels follow the shifted range.
- `applyVisibleRange` is synchronization input and consumes exactly its next library echo.

Combining them would be a behavior change even though both call
`setVisibleLogicalRange` internally.

## Capability Ownership

- `ChartEngine` owns `IChartApi` and the main `ISeriesApi<'Candlestick'>`.
- Capability constructors receive the main series only inside the chart-domain built-in
  registry; `ChartEngine` imports that registry, not concrete capability classes. Angular and
  frozen-scene hosts receive no handle and cannot provide constructors.
- `registerCapability` returns `void`; `getCapability` returns only a mapped handle-free facade
  for the drawings and trading interaction contracts.
- The chart host registers `drawings`, `countdown`, `session`, `trading` in that order. Frozen
  scenes register `trading`, `drawings`, `session`, with no countdown.
- Each capability may own the lightweight-charts objects needed for its visualization and
  must release them in `destroy()`.
- `TradingCapability` owns trade price lines, placement preview lines, series markers and
  trading primitives. `TradeLineHit` and placement methods prevent those handles escaping.
- `ChartEngine` remains framework-free. Host communication remains immutable render data,
  event-bus events and the narrow commands/geometry queries listed above.

## Executable Contract

`chart-engine.boundary.spec.ts` and `capability-registry.spec.ts` enforce six distinct facts:

1. Runtime reflection checks the exact absence of `chartApi` and `seriesApi`.
2. A compile-time mapped type over `keyof ChartEngine` fails if any public property or
   method output directly exposes `IChartApi`, `ISeriesApi`, `IPriceLine` or
   `ISeriesMarkersPluginApi`.
3. A recursive compile-time check rejects those handles anywhere inside `ChartEventMap` or
   `CapabilityApiMap`, including nested method outputs.
4. Runtime tests prove pointer events are copied to data-only payloads and capability lookup
   returns a facade rather than the concrete capability instance.
5. A compile-time negative contract proves the host event source has no `emit`, and a runtime
   assertion proves capabilities receive a different private bus.
6. The registration parameter is exactly `BuiltInCapabilityId`; a constructor call is a
   compile-time error, and a cast/JavaScript constructor is rejected before the existing
   `ProbeCapability.built` static can retain the engine series.

`no-chart-handles.test.js` additionally proves exported aliases cannot expose tracked handles
through a named binding, namespace qualification, namespace indexing, a member indexed from a
named handle, or a whole namespace alias. Named, qualified, and indexed data-only aliases remain
valid. The rule deliberately does not perform recursive type-flow analysis.

The final Track C correction also carries that tracked root through direct nested
`TSTypeReference` / `TSQualifiedName` / `TSIndexedAccessType` chains. It rejects both a member
indexed from a namespace-qualified handle and a member indexed from a namespace-indexed handle,
while preserving structurally equivalent data-only aliases. This remains syntax-bounded: local
alias flow, unions, conditionals, dynamic imports, and type-checker analysis are not included.

The final Track C Medium correction makes imported binding resolution declaration-order
independent. In trusted chart-domain files, the rule precollects relevant named and namespace
bindings from top-level `ImportDeclaration` nodes before visiting exports. Consequently, direct
tracked aliases and source-less export specifiers are rejected even when their legal import is
declared later in the module. Import diagnostics remain in the normal import visitor and are not
duplicated; late data-only aliases/exports remain allowed. This does not introduce recursive local
type flow or dependency analysis.

It deliberately does not reflect over runtime own fields: TypeScript `private` fields such
as `chart` and `mainSeries` exist at runtime but are excluded from `keyof ChartEngine` and
are not public API.
