# ChartEngine Public Contract After Bridge Retirement

## Status

The RFC-004/RFC-005 `chartApi` and `seriesApi` bridge is an **EXPIRED MIGRATION
CONSTRAINT**. It existed while chart behavior was being extracted from `ChartComponent`.
`DrawingsCapability` and `TradingCapability` now exist, all live consumers have narrow
operations, and the engine constructs main-series capabilities itself. The bridge no longer
has a legitimate consumer.

The original `chartApi` sunset condition was met directly. The old `capability.ts` note
predicted that the main series might later enter through `Capability.init`; that prediction
did not happen. The replacement is stricter: `ChartEngine.registerCapability(Ctor)` invokes
the capability constructor with the engine-owned series, so host code never receives the
series, even transiently.

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
| `seriesApi` passed by host to capability constructors | `ChartEngine.registerCapability(Ctor)` | `ChartComponent` and `FrozenSceneHostComponent` | `ChartEngine` | Constructor injection happens where the main series is owned; capability selection remains host-controlled, preserving the closed-core registry. | Returns the capability instance, never chart/series/line/markers handles |
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
- Capability constructors receive the main series only inside
  `ChartEngine.registerCapability`; Angular and frozen-scene hosts receive no handle.
- Each capability may own the lightweight-charts objects needed for its visualization and
  must release them in `destroy()`.
- `TradingCapability` owns trade price lines, placement preview lines, series markers and
  trading primitives. `TradeLineHit` and placement methods prevent those handles escaping.
- `ChartEngine` remains framework-free. Host communication remains immutable render data,
  event-bus events and the narrow commands/geometry queries listed above.

## Executable Contract

`chart-engine.boundary.spec.ts` enforces two distinct facts:

1. Runtime reflection checks the exact absence of `chartApi` and `seriesApi`.
2. A compile-time mapped type over `keyof ChartEngine` fails if any public property or
   method output directly exposes `IChartApi`, `ISeriesApi`, `IPriceLine` or
   `ISeriesMarkersPluginApi`.

It deliberately does not reflect over runtime own fields: TypeScript `private` fields such
as `chart` and `mainSeries` exist at runtime but are excluded from `keyof ChartEngine` and
are not public API.
