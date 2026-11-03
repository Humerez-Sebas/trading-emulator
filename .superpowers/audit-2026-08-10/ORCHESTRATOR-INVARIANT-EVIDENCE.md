# Orchestrator evidence — invariant adjudication (session 2026-08-12)

Read-only verification performed by the orchestrator in the canonical repo at `develop` @ `a2ca53b`.
No agent owns these files. Every line below was measured in this session, not inherited.

## Baseline re-verified

```
git ls-remote origin refs/heads/develop -> a2ca53b44f678dd285cd90f31ee644696664f32a
git ls-remote origin refs/heads/main    -> ad69d7dd582bfa5c977b3816fb46101335df6c35
local develop == origin/develop, local main == origin/main
git ls-remote origin 'refs/heads/agent/*' -> (empty)   # nothing pushed, isolation holds
```

## I1 — "ChartEngine never imports Angular/NgRx; communication crosses only as immutable
## RenderModel data + ChartEventBus events"

### Clause 1 — HOLDS, measured

```
grep -rn "from '@angular\|from '@ngrx" emulador/src/app/domain/chart/ | wc -l  -> 0
```

### Clause 2 — the audit's characterisation is WRONG in two ways. Corrected here.

**Audit claimed:** "`chart-engine.ts:25,28` expose `chartApi`/`seriesApi`; `chart.component.ts`
makes 25 direct library calls" and classified I1 as *violated*.

**Measured reality:**

```
grep -c "chartApi\.\|seriesApi\." components/chart/chart.component.ts   -> 0   # NOT 25
grep -c "this\.chart\.\|this\.series\."  components/chart/chart.component.ts -> 18
```

`chart.component.ts:630-631` aliases the handles once (`this.chart = this.engine.chartApi`,
`this.series = this.engine.seriesApi`) and all 18 later calls go through those two locals.
The exposure is **two assignment sites**, not 25 scattered ones — a materially smaller and more
tractable surface than the audit reported.

**Complete consumer list outside the engine (measured, non-spec):**

| Site | Use |
|---|---|
| `components/chart/chart.component.ts:630` | `this.chart = this.engine.chartApi` |
| `components/chart/chart.component.ts:631` | `this.series = this.engine.seriesApi` |
| `pages/reflection/frozen-scene-host.component.ts:298` | `new TradingCapability(engine.seriesApi)` |
| `pages/reflection/frozen-scene-host.component.ts:299` | `new DrawingsCapability(engine.seriesApi)` |
| `pages/reflection/frozen-scene-host.component.ts:300` | `new SessionCapability(engine.seriesApi)` |

### The decisive fact the audit missed: the sunset condition has already fired

`domain/chart/chart-engine.ts:24` carries an explicit, dated-by-RFC sunset TODO:

> `// TODO: Eliminar esta exposición directa en RFC-004/RFC-005 una vez que DrawingsCapability y
> TradingCapability estén implementados.`

and `domain/chart/capability.ts:14-19` records the same intent from the other side:

> "NOTA (RFC-004/005): es probable que `init` se extienda para recibir también la serie principal
> (`ISeriesApi<'Candlestick'>`) cuando Trading/Drawings la necesiten; **hasta entonces** los
> getters puente `seriesApi` cubren ese acceso."

**Both named preconditions are now satisfied:**

```
domain/chart/capabilities/drawings-capability.ts:7   export class DrawingsCapability implements Capability
domain/chart/capabilities/trading-capability.ts:38   export class TradingCapability implements Capability
domain/chart/capabilities/drawings-capability.ts:15  constructor(private series: ISeriesApi<'Candlestick'>) {}
domain/chart/capabilities/trading-capability.ts:55   constructor(private series: ISeriesApi<'Candlestick'>) {}
```

Both capabilities exist **and already receive the series through their constructor** — i.e. the
codebase adopted the workaround the note describes, and the removal the TODO mandates was simply
never performed.

**Adjudication:** this is **NOT** "an invariant eroding silently" (the M1 narrative). It is a
**TEMPORARY RFC CONSTRAINT whose expiry condition fired without the cleanup being executed.**
That is a different defect with a different fix: the bridge is not load-bearing debt to be
policed by a new lint rule, it is a deletion that RFC-004/005 already authorised.

**Consequence for any lint rule:** a `no-restricted-imports`-style rule cannot be the first move.
The correct order is (1) extend `Capability.init` to receive the series, or keep constructor
injection and have the engine pass it; (2) delete the two getters; (3) *then* the rule has a
genuinely zero-backlog surface to defend. Shipping the rule first would either fail on 5 existing
sites or require suppressions that re-legitimise the exposure the TODO wants gone.

## I3 — Market Data vs User Workspace separation

Cloud DTOs clean (per audit). Locally violated, confirmed:

```
state/workspaces/workspaces.models.ts:20   series: Partial<Record<Timeframe, Candle[]>>;
```

This is the same line that carries the multi-symbol blocker: the runtime series map is keyed by
`Timeframe` only, with **no symbol dimension**. One line is simultaneously the I3 local violation
and the `[NSYM]` gate — which is why RFC-023 in the audit's sequence is correctly placed.

## Not re-verified here (no change since the audit, and owned by agents this session)

- I2 (engine core closed — 5 post-registry edits): audit evidence stands, not re-measured.
- I4 (candle-free payloads) and I5 (D8 factory-selector ban): audit measured both as genuinely
  holding; Agent B's independent read of the sizing stack found nothing contradicting it.
- I6 (state-first): audit verdict "does not hold" stands, not re-measured.
