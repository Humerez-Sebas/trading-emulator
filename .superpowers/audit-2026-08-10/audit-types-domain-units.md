# TD Audit — Type System, Domain Model, Units & Numeric Safety

Repo: `trading-emulator`, branch `develop`, HEAD `a2ca53b`. Scope: `emulador/src/app`
(204 non-spec `.ts`, 182 spec files, 33 360 non-spec LOC). READ-ONLY: no file in the
repository was modified.

All counts produced mechanically via ripgrep/grep over `emulador/src/app`, excluding
`*.spec.ts` and `*.spec-util.ts` unless stated. Paths below are relative to
`C:\Users\78701\Desktop\trading-emulator\emulador\src\app`.

---

## 0. Headline

**MEASURED FACT.** The type system is in unusually good shape for a codebase this size:
zero explicit `any` in a type position, zero `@ts-ignore`/`@ts-expect-error`, zero
`any[]`, 219 exported types with clear `*.models.ts` homes. The debt in this codebase is
**not** type-annotation debt.

**INTERPRETATION.** The debt is concentrated in one place: **there is no type that carries
a unit.** Price, points, pips, lots, money, and timestamps are all bare `number`, and the
codebase contains **four mutually incompatible definitions of "one point"** and **two
mutually incompatible definitions of "the clock a stored timestamp is in."** F21-2 is not
an isolated bug; it is one of at least three live instances of the same defect shape, and
the gates cannot see any of them because every one of them type-checks.

---

## TD-01 — `pipSize`/`pointSize` has four incompatible definitions; "pts" means different things in different windows

- **Category:** Units & trading-domain safety / missing abstraction
- **Severity:** CRITICAL (money-wrong, silent, ships today)
- **Scope:** `domain/sizing/`, `lotaje/`, `state/trading/`, `components/chart/`, `models.ts`

### Evidence

Four independent sources of "the minimum price increment", never reconciled:

| # | Definition | Location | XAUUSD | EURUSD | NAS100 |
|---|---|---|---|---|---|
| 1 | derived from candle closes | `models.ts:106-112` | 0.01 | 0.00001 | 0.01 |
| 2 | derived from the symbol string | `state/trading/execution-costs.ts:66-77` | 0.01 | 0.00001 | **1** |
| 3 | MT5 `symbol_info()`, generated | `domain/sizing/asset-registry.generated.ts:24,33,42,51` | 0.01 | (absent) | **0.01** |
| 4 | hardcoded `1` when `pipSize` is null | `lotaje/sizing-view-model.ts:76-79` | **1** | 0.0001 | **1** |

Definition 3 — the only one that comes from the broker — is **read by nothing**.
`AssetSpec.pointSize` (`domain/sizing/asset-registry.ts:51`) is populated and then never
consumed by any conversion; grep for `\.pointSize` outside the registry returns only
consumers of definitions 1 and 2.

Six independent price→point conversion sites, none sharing a divisor:
- `components/chart/chart.component.ts:1071`
- `components/chart/chart.component.ts:1244`
- `components/trade-panel/trade-panel.component.ts:92`
- `domain/chart/capabilities/drawings-primitive.ts:188`
- `lotaje/sizing-view-model.ts:82-90` (`convertDistance`)
- `state/trading/execution-costs.ts:107` (`pointsToPrice`) — the only named one

### Observed pattern

`lotaje/sizing-view-model.ts:76-79`:

```ts
function priceUnitsPerDisplayUnit(asset: AssetSpec): number {
  if (asset.pipSize !== null) return asset.pipSize;
  return 1;
}
```

`AssetSpec.pipSize` is `null` by design for metals and indices
(`domain/sizing/asset-registry.ts:86-88`: XAU/XAG return `null`, non-6-letter returns
`null`) — "measured in points, not pips". The function then substitutes `1` for the
point size. Meanwhile `lotaje/sizing-view-model.ts:111` labels that same axis `'pts'`.
So the calculator tells the user "pts" and then treats 1 pt as 1.00 of gold price.

The emulator's own trade panel does the opposite: `trade-panel.component.ts:90-92`
divides by `selectPointSize` (`state/selectors.ts:270-272` → `derivePointSize` →
**0.01** for gold). Same word, same user, same session, factor of 100 apart.

### Why it matters HERE

This is a manual-backtesting tool whose entire output is a lot size and an R-multiple.
The two surfaces that produce a lot size — the in-chart trade panel and the Lotaje
companion window — disagree by 100× on the only instrument the owner's broker registry
actually contains beyond indices (XAUUSD). The disagreement is invisible: both numbers are
plausible, both type-check, both have green unit tests, because both tests assert against
their own module's convention.

### Concrete risk

- **CONFIRMED (F21-2):** XAUUSD in `/calculadora`. A 300-pt stop (=$3.00 of gold) is read
  as 300.0 price units. `lotsForRiskDistance(100, 300, 100)` → `Math.max(0.01, 0.003)` =
  **0.01 lots**, the floor. True answer: `lotsForRiskDistance(100, 3, 100)` = **0.33 lots**.
  33× under-sized, and the min-lot warning (`sizing-view-model.ts:176-184`) fires with a
  *reassuring* message rather than an error.
- **SIBLING, opposite sign, NOT previously reported:** `execution-costs.ts:76` returns
  `pointSize = 1` for indices, but `asset-registry.generated.ts:24,33,42` records the
  broker's real value as `0.01` for NAS100/SP500/US30. `COST_PRESETS.Índices` sets
  `spreadPoints: 2` (`execution-costs.ts:49`). The fill engine therefore charges
  `2 × 1 = 2.00` index points of spread where the broker charges `2 × 0.01 = 0.02`.
  **Every index backtest in this app runs with a 100× inflated spread and slippage**, and
  the numbers are small enough to look like normal friction.
- **SIBLING:** `heuristicContractSize` (`asset-registry.ts:77`) returns `1` for anything
  unrecognized. A symbol that is really FX but does not match `/^[A-Z]{6}$/` (`EURUSD.m`,
  `XAUUSD_i`, `US30.cash` — all common broker suffixes) sizes at 1 unit/lot instead of
  100 000. Off by 100 000×.

### Recommended direction

**Minimum intervention, in order of leverage — do NOT introduce nominal typing yet.**

1. **Make the registry the single source of the divisor.** Add
   `export function pointSizeFor(symbol: string): number | null` to
   `domain/sizing/asset-registry.ts` returning `resolveAsset(symbol).pointSize`, and
   delete the private `pointSizeFor` in `execution-costs.ts:66` and the `return 1` in
   `sizing-view-model.ts:78` in favour of it. This alone closes F21-2 and the index-spread
   sibling.
2. **Make absence loud, not silent.** `pointSizeFor` returns `null` for an unknown symbol;
   every caller must handle it. In the Lotaje view that means the distance field is
   *disabled* with "Sin datos del instrumento" (the `isHeuristic` chip at
   `sizing-view-model.ts:112` already exists and already knows) rather than silently
   computing with 1.
3. **Keep `derivePointSize` for display only** and rename it `derivePointSizeFromCandles`,
   with a doc line saying it must never feed sizing or cost math. It is a legitimate
   fallback for a CSV series with no registry entry.

Only if steps 1–3 leave residual confusion is a branded `type PriceUnits = number & {__brand}`
worth its cost. Evidence does not currently justify it: there are six conversion sites, not
sixty, and they all funnel through one divisor once step 1 lands.

- **Migration difficulty:** SMALL (one new exported function, three call-site edits, one
  UI disabled-state). The riskiest part is deciding the index `pointSize` question with the
  owner — changing it retroactively changes historical backtest P&L.
- **Best mechanism:** one focused PR + a test that asserts XAUUSD produces the *same* lot
  figure from `/calculadora` and from the trade panel given the same stop in pts. That
  cross-surface test is the missing gate.
- **Acceptance condition:** `grep -rn "return 1;" domain/sizing lotaje state/trading` shows
  no unit-substituting fallback; a parametrized spec pins {XAUUSD, EURUSD, NAS100} × {lots,
  spread-in-price} against literal expected values sourced from `asset-registry.generated.ts`.

---

## TD-02 — Complete enumeration of silent fallbacks that change domain meaning

- **Category:** Units & numeric safety
- **Severity:** HIGH (items 1–8), MEDIUM (9–16), LOW/documented (17–24)
- **Scope:** whole app

**MEASURED FACT.** 24 sites. Grouped by whether the substituted value changes a money or
time answer.

### Tier A — changes a money/units answer (8)

| # | Location | Fallback | Domain effect |
|---|---|---|---|
| 1 | `lotaje/sizing-view-model.ts:78` | `return 1` for null `pipSize` | **F21-2.** pts→price 100× wrong (gold), indices too |
| 2 | `state/trading/execution-costs.ts:76` | `return 1` for non-FX/metal | Index spread+slippage 100× vs `generated.ts:24,33,42` |
| 3 | `state/selectors.ts:266` | `contractSizeFor(symbol ?? '')` | No symbol → contractSize 1 (gold: 100, FX: 100 000) |
| 4 | `domain/sizing/asset-registry.ts:77` | `return 1` (heuristic) | Suffixed broker symbols (`EURUSD.m`) size 100 000× off |
| 5 | `state/selectors.ts:271` | `: 0.01` when series empty | EURUSD pts display 1000× off before data loads |
| 6 | `components/chart/chart.component.ts:507` | `private pointSize = 0.01` | Same, on the chart, until `:773` overwrites it |
| 7 | `domain/chart/capabilities/drawings-primitive.ts:258` | `src?.pointSize ?? 0.01` | Ruler "pts" readout wrong for FX |
| 8 | `models.ts:111` | `return 0.00001` (no power of ten matched) | Silently assumes 5-digit FX for any exotic series |

### Tier B — changes a cost/P&L answer (8)

| # | Location | Fallback | Domain effect |
|---|---|---|---|
| 9 | `pages/crear-sesion/crear-sesion-page.component.ts:75` | `costPresetFor(r2Symbol() ?? '')` | Blank symbol → `ZERO_COSTS`: frictionless session |
| 10 | `state/trading/execution-costs.ts:98` | `if (!cls) return ZERO_COSTS` | Unclassifiable symbol → no spread/commission at all |
| 11 | `state/trading/execution-costs.ts:132` | `pick()` → preset on invalid override | User's bad input silently becomes the preset |
| 12 | `state/trading/fill-engine.ts:60` | `if (!costs) return bid` | Absent costs = zero spread |
| 13 | `state/trading/fill-engine.ts:72` | `if (!costs) return price` | Absent costs = zero slippage |
| 14 | `state/trading/fill-engine.ts:96` | `costs ? … : 0` | Absent costs = zero commission |
| 15 | `state/selectors.ts:846`, `state/trading/trading.reducer.ts:273,294,320` | `executionCosts ?? undefined` | Routes a null-cost session into 12–14 |
| 16 | `state/journal/journal-read.models.ts:230` | `t.commission ?? 0` | Legacy trades' *unknown* commission counted as zero in "costes totales" |

### Tier C — changes a time/ordering answer, or documented-intentional (8)

| # | Location | Fallback | Note |
|---|---|---|---|
| 17 | `domain/reflection/build-scene-spec.ts:106` | `(b.marketTime ?? 0) - (a.marketTime ?? 0)` inside a **sort comparator** | Null market time sorts as epoch 0 → "latest" picks wrong |
| 18 | `state/selectors.ts:779` | `time: candle?.time ?? 0` | Epoch 0 leaks into a render model |
| 19 | `components/chart/chart.component.ts:998` | `\|\| this.dataRange()?.from \|\| 0` | `\|\|` not `??`: a legitimate `time === 0` falls through |
| 20 | `components/chart/chart.component.ts:1004` | same | same |
| 21 | `domain/chart/display-time.ts:148-155` | unknown zone id → New York | Documented (`:126-129`); deliberate |
| 22 | `state/trading/fill-engine.ts:127-130` | `mae ?? 0`, `tMae ?? p.openTime` | Documented (`trading.models.ts:113-121`); deliberate |
| 23 | `services/session-sync.service.ts:585,612,735` | `(clientUpdatedAt ?? 0) > (syncedAt ?? 0)` | Documented; absent = never-dirty |
| 24 | `services/session-sync.service.ts:883,900` | `meta.activeClientUpdatedAt ?? Date.now()` | Mints an LWW key from the wall clock on a pull path |

### Recommended direction

Items 1–8 are TD-01's fix. Items 9–16 want a single decision recorded once: **is a session
with unresolvable costs allowed to run?** Today the answer is "yes, silently, at zero cost"
in six places. Make `costPresetFor` return `ExecutionCosts | null` and force the
new-session dialog to surface "sin datos de costes para <symbol>". Item 17 is a two-line
fix worth doing opportunistically. Items 21–24 are fine and should be left alone.

- **Migration difficulty:** SMALL for 1–8 and 17; MEDIUM for 9–16 (touches a dialog and the
  reducer's optional-costs plumbing).
- **Acceptance condition:** every remaining `?? <number>` on a units/money path carries a
  comment naming why the substituted value is *correct*, not merely *safe*.

---

## TD-03 — `Candle.time`'s documented unit contradicts the codebase's own time model

- **Category:** Date/time semantics
- **Severity:** HIGH
- **Scope:** `domain/chart/render-model.ts`, everything that formats a trade time

### Evidence

- `domain/chart/render-model.ts:3` — `/** OHLC candle. \`time\` in unix seconds (UTC), as
  expected by lightweight-charts. */`
- `domain/chart/display-time.ts:4-8` — "Candle timestamps are stored in the server clock of
  the broker (FivePercentOnline-Real) … **so a stored timestamp is NOT a UTC instant**"
- `state/drawings/drawings.models.ts:4` — `/** Data-anchored point: time in UTC seconds
  (without the display offset). */`
- `state/trading/trading.models.ts:23,40,60,62,148,192` — six fields documented as
  "UTC seconds" that are in fact server-clock seconds.

The authoritative statement is `display-time.ts`. Every "UTC seconds" doc comment on a
candle-derived timestamp in this codebase is wrong by 2–3 hours (server = UTC+2/+3).

### Observed pattern — the zone is applied on the chart and nowhere else

`toDisplayTime`/`fromDisplayTime` are called at 11 sites, **all inside `components/chart/`,
`components/controls/`, `components/toolbar-tools/` and `domain/chart/capabilities/**`.
Every other surface formats the stored epoch as if it were UTC:

| Location | What it renders | Error |
|---|---|---|
| `state/journal/journal-read.models.ts:368` | **Time-of-Day analysis bucket** (`getUTCHours()`) | Every hour bucket is off; the 09:30 NY open lands in the 16:00 bucket |
| `state/trading/session-csv.ts:5-9` | Exported CSV trade timestamps | Exported data disagrees with the chart the trade was taken on |
| `state/trading/trading.reducer.ts:37-41` | Auto session name "dd/MM" | Wrong day near either end of the session |
| `pages/sesiones/sesiones-page.component.ts:750-752` | Session card date | same |
| `pages/reflection/waypoint-facts.component.ts:36-37` | Waypoint HH:mm | Reflection cabin disagrees with the chart |
| `pages/reflection/waypoint-timeline.component.ts:270-272` | Timeline HH:mm | same |
| `pages/reflection/cabin-trade-list.component.ts:54` | `\| date: 'HH:mm' : 'UTC'` | same, via the Angular pipe |
| `components/journal-viz/scatter-mae-mfe.component.ts:259,280` | Date grouping key | Trades near the boundary group into the wrong day |
| `services/session.service.ts:107-108` | `requiredDatasets` **year** buckets | Boundary candles request the wrong year's parquet |
| `services/market-data-db.ts:80-81` | Year range `Date.UTC(y,0,1)/1000` | Compares a UTC year boundary against server-clock epochs |
| `components/ui/dialogs/delete-session-dialog.component.ts:77` | `\| date` with **no** zone arg | Renders in the *browser's local* zone — a third clock |

### Why it matters HERE

RFC-020's own memory records a shipped fix for exactly this confusion (dock clock shifted
over UTC instead of broker server time, PR #51). That fix corrected the dock. The same
defect is still live in eleven other places, including the Journal's Time-of-Day table —
which is the single feature whose entire purpose is *when* a trade was taken.

### Recommended direction

**Minimum intervention.** Do not brand the type. Do two things:

1. **Fix the lie in the doc comments** (`render-model.ts:3`, `drawings.models.ts:4`, the six
   fields in `trading.models.ts`). Say "broker server clock seconds; see
   `domain/chart/display-time.ts`". A one-line doc fix on the most-read type in the app is
   the highest ratio of correctness-per-character available in this audit.
2. **Rename the concept at the boundary.** Introduce
   `export type StoredEpochSeconds = number` and `export type DisplayEpochSeconds = number`
   in `display-time.ts` as *documentation aliases* (not branded), and use them on
   `toDisplayTime`/`fromDisplayTime` signatures and on `Candle.time`. This costs nothing at
   runtime and makes the two clocks visible at every hover in the editor.
3. **Route the eleven formatting sites through `toDisplayTime`.** The Time-of-Day bucket
   (`journal-read.models.ts:365-381`) is the one with real analytical consequence; it
   currently names its own output `hourUtc`, which propagates the wrong name into
   `TimeOfDayRow` and the table component.

- **Migration difficulty:** SMALL for (1) and (2). MEDIUM for (3): `journal-read.models.ts`
  is deliberately clock-free and pure, so the zone must be threaded in as an argument
  rather than resolved inside — which is the right shape anyway.
- **Best mechanism:** one PR for (1)+(2); a separate, owner-visible PR for (3) because it
  changes numbers the owner has already looked at.
- **Acceptance condition:** `grep -rn "getUTC" src/app` returns only `display-time.ts`,
  `date-picker.component.ts` (a calendar widget, legitimately UTC-normalized), and sites
  whose input is provably already a display epoch.

---

## TD-04 — Seconds vs milliseconds: 5 crossing points, one name collision

- **Category:** Date/time semantics
- **Severity:** MEDIUM
- **Scope:** persistence + sync boundaries

### Measured census

| Pattern | Count (non-spec) |
|---|---|
| `new Date(` | 43 |
| `Date.now()` | 35 |
| `getTime()` | 6 |
| `* 1000` | 22 |
| `/ 1000` | 13 |

**INTERPRETATION.** 30 of the 35 `* 1000` / `/ 1000` sites are the unavoidable
"seconds domain → JS `Date` → back" adapter and are individually fine. The risk is
concentrated in five *format* boundaries where a persisted number changes unit:

1. `services/session.service.ts:200-202` — `.session.json` stores **ms**
   (`startRange`, `endRange`, `replayTime`), state holds **seconds**. Documented at `:190`
   and `:245`. Round-trip at `:255-257` uses `Math.round(x/1000)` — lossy but correct.
2. `services/market-data-db.ts:80-81` — year → `{from, to}` in seconds via
   `Date.UTC(...)/1000`. Fields named bare `from`/`to`.
3. `services/csv-loader.service.ts:73` — CSV ISO string → seconds.
4. `workers/candles-writer.ts:23,49` — Parquet int64 **seconds**, documented at `:23`.
5. `services/session-sync.models.ts:34,65,119,156,160,177,178,225` — the *only* type file
   in the repo that annotates units inline (`// epoch ms`, `// replay cursor, unix seconds`).

### The name collision (this is the actual finding)

`createdAt` carries **two different units in the same feature**:

- `state/trading/trading.models.ts:24` — `PendingOrder.createdAt`, assigned from
  `a.time` at `state/trading/trading.reducer.ts:133` → **candle seconds**
- `state/trading/trading.models.ts:191` — `SavedSession.createdAt`, assigned from
  `Date.now()` at `state/trading/trading.reducer.ts:76` → **epoch ms**

Both are `createdAt: number` in the same file, 167 lines apart. `PendingOrder.createdAt`
carries a doc comment; `SavedSession.createdAt` does not. Downstream,
`pages/sesiones/sesiones-page.component.ts:113` declares `SessionCard.createdAt: number`
and fills it from three sources — `meta.lastModified` (ms, `:296`), `s.createdAt` (ms,
`:313`), and `Date.parse(s.updatedAt)` (ms, `:349`) — so the card is consistently ms, but
nothing in the type system says so.

**MEASURED FACT.** 76 fields across the app are named with a temporal word
(`time|timestamp|createdAt|updatedAt|closeTime|openTime|currentTime|from|to|start|end|marketTime|sessionEnd|clientUpdatedAt|syncedAt`)
and typed bare `number`. Of those, 26 carry a unit in a doc comment; **50 do not.**

### Recommended direction

Rename, don't brand. `SavedSession.createdAt` → `createdAtMs`. Ambiguous
`from`/`to`/`time` on persisted or cross-module types get a unit suffix or a doc line.
`session-sync.models.ts` already demonstrates the house style (`// epoch ms`) — extend
that convention rather than inventing a new one.

- **Migration difficulty:** SMALL (mechanical rename, tsc catches everything).
- **Acceptance condition:** no exported type has two fields sharing a name-stem with
  different units; every persisted temporal field states its unit.

---

## TD-05 — Type-smell census

- **Category:** Type system
- **Severity:** LOW overall — reported for completeness and to *rule out* a common suspicion
- **Scope:** whole app, non-spec files

| Smell | Count | Assessment |
|---|---|---|
| Explicit `any` in a type position | **0** | grep for `: any`, `<any>`, `as any`, `any[]` returns only three *prose comments* ("if it has any activity") |
| `@ts-ignore` / `@ts-expect-error` | **0** | — |
| `any[]` / `Array<any>` | **0** | — |
| `as unknown as` | **7** | All at genuine external boundaries: `chart-engine.ts:212` (LWC `CandlestickData`), `parquet.worker.ts:34` (`DedicatedWorkerGlobalScope`), `companion-window.ts:61` (Document PiP feature-detect), `data-onboarding.service.ts:55` (Worker), `chart.component.ts:880`, `session.service.ts:292`, `workspaces.effects.ts:112` (legacy migration). Defensible. |
| `as <Type>` assertions (total) | **183** | Of which **26** are `as UTCTimestamp`/`as Time`/`as Logical` — a lightweight-charts branded-type ceremony, not a smell. **14** are `as const`. The residual ~140 is ordinary DOM/`unknown` narrowing. |
| Non-null `!` | **38** | Clustered: 5 in `chart-model-mapper.service.ts` (memo-cache reads, guarded by the `===` check on the line above), 12 in `chart.component.ts` (`this.engine!`/`this.series!` after an init guard). Both clusters are load-bearing lifecycle assumptions that a `#engine` non-null field or an early-return guard would express better, but neither is currently wrong. |
| `Record<string, unknown>` | **17** | 9 in `session.service.ts`/`session-migration.ts`/`session-sync.*` = deserializing untrusted JSON, correct. 4 in `domain/reflection/` = telemetry payloads that are deliberately opaque (`telemetry.models.ts:21` documents this). Legitimate. |
| `: object` | **4** | `scene-spec.ts:42`, `waypoints.ts:26`, `telemetry.effects.ts:515`, `telemetry.models.ts:30`. All the same deliberate opaque-payload decision, documented at `telemetry.models.ts:19-22`. Weaker than `Record<string, unknown>` (`object` admits arrays and functions) but the intent is real. |
| `Function` / `{}` | **0** | — |
| Stringly-typed `timeframe` | **11 sites** typed `string` vs **25** typed `Timeframe` | The 11 are the persistence/worker edge (`market-data-db.ts:48,93`, `workspace-db.service.ts:351,379`, `candles-writer.ts:29`, `parquet.worker.ts:25`, `parquet-download.service.ts:38`) plus 4 UI/mapper sites. Persistence widening is defensible; `chart-model-mapper.service.ts:348` and `chart.component.ts:752` (`tf: string \| null`) are not — they are internal. |
| Stringly-typed `side` | **1** (`toolbar-tools.component.ts:103`) | `OrderSide` exists at `trading.models.ts:3`. One-line fix. |
| Stringly-typed `origin`/`type` | **2** (`render-model.ts:55,62`) | The engine-side `Position.origin: string` and `PendingOrder.type: string` **widen** the domain's `OrderType`/`PendingType` unions on the way into the render model. See TD-06. |
| `panelId: string` | **30 sites** | No `PanelId` type exists anywhere. See TD-07. |
| `symbol: string` | **85 sites** | No `Symbol`/`InstrumentId` type. Interpretation: a nominal type here would be low-value ceremony *except* that `resolveAsset` silently uppercases and the heuristic silently accepts anything — the cost is in TD-01, not in the string-ness. Do not brand. |
| Boolean positional params | **1 meaningful** (`fill-engine.ts:83` `ambiguous = false`, called positionally at `:431` as `..., contractSize, false, costs`) | Genuinely hard to read at the call site, but a single occurrence. Not worth a refactor pass. |

**INTERPRETATION.** Anyone auditing this repo expecting an `any`-and-assertions problem
will find none. Effort spent on assertion cleanup here is effort not spent on TD-01/TD-03,
which is where the actual defects live.

---

## TD-06 — Ten duplicate type names across the engine/state boundary, with no compatibility check

- **Category:** Domain model / duplicate types
- **Severity:** MEDIUM
- **Scope:** `domain/chart/render-model.ts` vs `state/**`

### Evidence

`grep -rh -oE "^export (interface|type) [A-Za-z0-9_]+" | sort | uniq -d` yields exactly ten:

| Name | Engine side | State side | Relationship |
|---|---|---|---|
| `ChartColors` | `render-model.ts:12` | `settings.models.ts:11` | **Structurally identical** (12 fields, same order) |
| `TradeBoxOpacity` | `render-model.ts:27` | `settings.models.ts:28` | **Structurally identical** |
| `DrawingTool` | `render-model.ts:37` | `drawings.models.ts:1` | **Identical literal union** |
| `DrawingType` | `render-model.ts:38` | `drawings.models.ts:2` | **Identical** |
| `DrawingPoint` | `render-model.ts:32` | `drawings.models.ts:5` | **Identical** |
| `TradeMarker` | `render-model.ts:82` | `selectors.ts:277` | **Identical** |
| `TradeBoxItem` | `render-model.ts:70` | `selectors.ts:350` | Identical modulo `'buy'\|'sell'` vs `OrderSide` (same type) |
| `Drawing` | `render-model.ts:40` | `drawings.models.ts:16` | **Legitimately different** — state adds `symbol`, `owner`, `zIndex`, `locked`, `visible` |
| `Position` | `render-model.ts:47` | `trading.models.ts:30` | Narrowed, **but widens** `origin: OrderType` → `origin: string` |
| `PendingOrder` | `render-model.ts:59` | `trading.models.ts:11` | Narrowed, **but widens** `type: PendingType` → `type: string` |

### Why it matters HERE

CLAUDE.md invariant 1 forbids `ChartEngine` from importing NgRx, and the render model is
the sanctioned crossing. That justifies *a* boundary type. It does not justify **six
byte-identical copies** with no compile-time link: adding a colour to
`settings.models.ts:ChartColors` and forgetting `render-model.ts:ChartColors` produces a
silent visual regression, not a type error, because the mapper builds the engine object
field by field.

The two `string` widenings (`Position.origin`, `PendingOrder.type`) are worse: the domain
knows the value is `'market' | 'limit' | 'stop'`, and the DTO throws that away. Any engine
code branching on `origin` has no exhaustiveness check.

### Recommended direction

**Do not merge the files** — the separation is an invariant. Instead:

1. For the six identical pairs, have the **state side import the engine's type**
   (`state/settings/settings.models.ts` → `import type { ChartColors } from
   '../../domain/chart/render-model'`). The dependency direction is already legal: state
   may import domain; domain may not import state. `state/trading/trading.models.ts:259`
   already does exactly this for `contractSizeFor`/`lotsForRisk`.
2. For `Position.origin` / `PendingOrder.type`, move `OrderSide`/`OrderType`/`PendingType`
   into `domain/` (they are framework-free three-member unions) and use them on both sides.
3. Leave `Drawing` as a genuine two-shape pair; add a `satisfies`-style compile check or a
   mapper unit test instead.

- **Migration difficulty:** SMALL. Mechanical, tsc-verified.
- **Best mechanism:** one PR; no behaviour change, so the four gates are sufficient evidence.
- **Acceptance condition:** `uniq -d` on exported type names returns only `Drawing`.

---

## TD-07 — Type homes are predictable; three concepts have no home

- **Category:** Type homes / discoverability
- **Severity:** LOW–MEDIUM
- **Scope:** whole app

### Measured discoverability test

I attempted to locate seven core concepts by name, the way a fresh agent would:

| Concept | `export interface|type <Name>` found? | Verdict |
|---|---|---|
| `Candle` | `domain/chart/render-model.ts:4` (re-exported from `models.ts:2`) | **Findable**, though its home is a *render* model, which is a surprising place for the app's most fundamental domain entity |
| `Timeframe` | `models.ts:5` | Findable |
| `Position` | two homes (TD-06) | Ambiguous |
| `Trade` | **none** | Concept is called `ClosedTrade` (`trading.models.ts:69`); 14 unrelated `*Trade*` types exist (`TradeBoxItem`, `TradeMarker`, `TradeRowView`, `CabinTradeRow`, `TradeLine`, `TradeButton`, …). An agent grepping `Trade` gets 14 hits and the right one is not obviously it |
| `Session` | **none** | 22 `*Session*` types across 12 files: `SessionSnapshot`, `SessionFileV1`, `SessionPayloadV1/V2/V3`, `SavedSession`, `SessionSummary`, `SessionView`, `FlattenSession`, `CloudSessionRow`, `SessionCard`, `JournalSessionModel`, `SessionStats`, `SessionModel`, `SessionMeta`, `SessionFolder`… An agent cannot guess which is canonical |
| `PanelId` | **none** | 30 sites use bare `panelId: string` |
| `Symbol` | **none** | 85 sites use bare `symbol: string` |

### Type-home distribution (MEASURED)

219 exported types. Top declaring files:
`services/session-sync.models.ts` (18), `domain/chart/render-model.ts` (17),
`state/telemetry/telemetry.models.ts` (14), `state/trading/trading.models.ts` (11),
`state/journal/journal-read.models.ts` (10), `state/drawings/drawings.models.ts` (9),
`state/settings/settings.models.ts` (8), `components/ui/index.ts` (8).

**INTERPRETATION.** The `*.models.ts`-per-feature convention is real, consistently applied,
and works. **There is no junk-drawer problem in the NgRx layer.** The two exceptions:

- **`models.ts` (app root, 123 lines)** mixes the `Timeframe` union + two constant tables +
  `detectTimeframe` (candle analysis) + `derivePointSize` (unit inference) +
  `symbolFromFileName` (CSV filename parsing). Four unrelated responsibilities in the
  file every module imports. `derivePointSize` living here is load-bearing for TD-01:
  it is the reason a *display* heuristic became a *sizing* input.
- **`state/selectors.ts` (853 lines)** declares 4 types including `TradeMarker` and
  `TradeBoxItem` (TD-06 duplicates) alongside the entire selector graph and
  `floatingPnl`/`snapToCandle` domain math.

Type declarations inside component files: `pages/sesiones/sesiones-page.component.ts:96,113`
(`SessionCard`), `pages/reflection/cabin-trade-list.component.ts:21` (`CabinTradeRow`),
`components/ui/dialogs/delete-session-dialog.component.ts:7`. These are view-models used by
one component and are correctly placed — **not** a finding.

### Recommended direction

**Do not centralize.** Three targeted moves only:

1. Move `derivePointSize` out of `models.ts` into `domain/sizing/` next to the registry,
   renamed `derivePointSizeFromCandles`, so the units family lives in one directory
   (this falls out of TD-01 anyway).
2. Introduce `export type PanelId = string;` in `state/layout/layout.models.ts` and use it
   at the 30 sites. It is documentation, costs nothing, and makes the workspace/panel
   domain greppable. (Not branded — a branded `PanelId` would force casts at every
   `descriptor().id` read for no proven benefit.)
3. Add a short `docs/engineering/domain/` pointer table naming the canonical type for
   `Trade` (= `ClosedTrade`) and `Session` (= `SavedSession` in-app, `SessionPayloadV3`
   at rest, `SessionFileV1` in export files). The confusion is real and is a documentation
   problem, not a code problem — renaming 22 types would be worse than the disease.

- **Migration difficulty:** SMALL.
- **Acceptance condition:** an agent asked "where does a trade live?" can answer from the
  pointer table without grepping.

---

## TD-08 — Floating-point risk in money accumulation

- **Category:** Numeric safety
- **Severity:** LOW (assessed, not asserted)
- **Scope:** `state/trading/fill-engine.ts`, `state/selectors.ts`

### Evidence

Money accumulates by repeated `+=` on IEEE-754 doubles:
- `state/trading/fill-engine.ts:381,432` — `balance += trade.profit`
- `state/trading/fill-engine.ts:539` — `equity += t.profit` (drawdown curve)
- `state/trading/fill-engine.ts:533-534` — `grossWin += t.profit` / `grossLoss += -t.profit`
- `state/trading/trading.reducer.ts:279` — `balance: state.balance + trade.profit`
- `state/selectors.ts:766,793,849,851` — floating equity via `reduce`
- `services/session-sync.mapping.ts:126` — `equity += c.profit` (sparkline)

`profit` itself is `(exitPrice - entryPrice) * dir * lots * contractSize - commission`
(`fill-engine.ts:49-51,95-97`) — an unrounded product of a price difference and a
0.01-stepped lot size. No rounding is applied to money at any point; only `toFixed(2)` at
render (`selectors.ts:337`, `toolbar-tools.component.ts:122`, `lotaje/format.ts:7`).

### Assessment

**INTERPRETATION.** This is acceptable and should be left alone. Rationale specific to this
codebase: (a) it is a single-user emulator, not a ledger — no reconciliation against an
external system exists or is planned; (b) the accumulation depth is bounded by trades per
session (tens to hundreds), so drift stays ~1e-13 relative, far below the `toFixed(2)`
display grain; (c) `rMultiple` (`fill-engine.ts:114`) is a ratio, immune to absolute drift;
(d) introducing integer-cents or a decimal library would violate the "no new runtime
dependencies by default" invariant for a problem that cannot be observed at two decimal
places.

The one place drift *could* surface is `session-sync.mapping.ts:126`'s equity sparkline
compared against `pages/sesiones/sesiones-page.component.ts:713`'s independent
`history.reduce((sum, t) => sum + t.profit, 0)` — two accumulations of the same series in
different orders. They will agree to ~1e-10, which no UI renders. **No action.**

- **RECOMMENDATION:** none. Documented here so a future audit does not re-open it.

---

## TD-09 — Magic domain values: classification

- **Category:** Magic values
- **Severity:** LOW
- **Scope:** whole app

**MEASURED FACT.** 40 module-level `const NAME = <number>` declarations. Classified:

| Class | Examples | Verdict |
|---|---|---|
| **Domain constant** (correctly named, correctly homed) | `SERVER_MINUS_NEW_YORK_HOURS = 7` (`display-time.ts:29`), `MIN/MAX_UTC_OFFSET_HOURS` (`:41-42`), `TIMEFRAME_SECONDS`/`TIMEFRAME_ORDER` (`models.ts:28,52`), `MAX_INTERVAL_MINUTES = 43_200` (`custom-timeframe.ts:21`), `DEFAULT_BALANCE = 10000` (`trading.models.ts:234`), `MAX_PANELS_PER_TAB = 8` (`layout.models.ts:4`) | Leave alone |
| **Configuration** | `DB_VERSION` ×4, `SESSION_VERSION`/`SESSION_PAYLOAD_VERSION`, `PAYLOAD_WARN_BYTES`/`PAYLOAD_MAX_BYTES` (`session-sync.mapping.ts:69-70`), `TELEMETRY_MAX_EVENTS_PER_SESSION = 50_000` | Leave alone |
| **Implementation detail** | `RENDER_WINDOW = 12_000`, `LOAD_MORE_CHUNK = 6_000`, `LOAD_MORE_THRESHOLD = 50` (`chart.component.ts:87-91`), `FLUSH_BATCH_SIZE = 200`, `FLUSH_IDLE_MS = 2_000`, `HISTORY_LIMIT = 50` | Leave alone — named and co-located with their only consumer |
| **Design token** | `EDGE_GRAB_PX = 4`, `BELOW_OFFSET = 18`, `RIGHT_OFFSET = 18`, `RADIUS = 9`, `COMPANION_WIDTH/HEIGHT`, `DEFAULT_FILL_ALPHA = 0.12` | `DEFAULT_FILL_ALPHA`/`DEFAULT_BORDER_ALPHA` (`trade-boxes-primitive.ts:55-56`) duplicate `DARK_TRADE_BOX_OPACITY` (`settings.models.ts:39`) exactly — one small dedupe |
| **Genuinely accidental** | `msPerCandle: 500` (`replay.reducer.ts:23`) — the default playback speed, unnamed; `INSUFFICIENT_DATA_THRESHOLD = 3` declared **twice** (`behavior-section.component.ts:10`, `execution-section.component.ts:7`); the `0.01` lot step + floor repeated across `position-sizing.ts:74` and the warning text `sizing-view-model.ts:180` | Three tiny fixes, no new home needed |
| **Domain constants hiding as literals** | the `0.01`/`0.001`/`0.00001` table inside `pointSizeFor` (`execution-costs.ts:66-77`) and `heuristicPipSize` (`asset-registry.ts:85-89`) and `derivePointSize`'s `[1, 0.1, …]` ladder (`models.ts:108`) | **This is TD-01, not a naming problem.** Do not extract them into a constants file — consolidate the *function*, and the literals disappear |

**INTERPRETATION.** Magic-value hygiene here is genuinely good; this section exists mainly
to record that a "extract all constants" refactor would be net-negative. The only
constants worth touching are the ones TD-01 already deletes.

---

## TD-10 — Missing abstractions: counted, not assumed

- **Category:** Missing abstraction
- **Severity:** see per-row
- **Scope:** whole app

Reimplementation counts before any recommendation:

| Concept | Independent implementations | Recommend? |
|---|---|---|
| **price ↔ point/pip conversion** | **6** conversion sites fed by **4** incompatible divisor sources (TD-01) | **YES — highest leverage in this audit** |
| **stored-epoch → display clock** | 1 correct abstraction (`display-time.ts`) applied at 11 sites, **bypassed at 11** (TD-03) | **YES — the abstraction exists; it is not being used** |
| **money formatting** | 3 shapes: `$` + `toFixed(2)` (`selectors.ts:337`, `toolbar-tools.component.ts:122`, `lotaje/format.ts:7`, `sizing-view-model.ts:182`), Angular `\| number: '1.2-2'` (`account-card.component.ts:47`), bare `toFixed(2)` (`waypoint-facts.component.ts:165`) | **NO** — 6 sites, three of which are inside Spanish sentence templates that a formatter cannot own. `lotaje/format.ts` already is the abstraction for the module that needed one. Reuse ≠ abstraction. |
| **R-multiple formatting** | 7 sites all doing `${sign}${x.toFixed(2)}R` (`bubble-duration-r:237,256`, `heatmap:194,219`, `scatter:262,282`, `performance-grid:36`, `waypoint-facts:31`) | **MARGINAL** — one 3-line helper in `state/journal/`. Low value, low cost; do it opportunistically, not as its own PR |
| **timeframe → seconds** | 1 (`TIMEFRAME_SECONDS`, `models.ts:28`), correctly used everywhere including the C6 comment at `chart-model-mapper.service.ts:380` explicitly refusing a `?? 0` | **NO — already right.** Cite as the model for how TD-01 should look |
| **chart coordinate mapping** | 1 (`domain/chart/time-coordinates.ts`) | **NO — already right** |
| **panel identity** | 0 types, 30 bare `string` sites | **WEAK YES** — a documentation alias only (TD-07 item 2) |
| **trade identity** | `newId()` used consistently; but 2 ad-hoc id mints inline at `chart.component.ts:1318,1346` (`Date.now().toString(36) + Math.random()`) | **MARGINAL** — 2 sites, drawings only. Route them through `newId()` when next touching that file |
| **session-time semantics** (session boundaries, trading day) | 0 — `sessionEnd` is a raw epoch; there is no "trading day" concept; `D1` bucketing is done in the pipeline | **NO** — the app deliberately delegates this to the pipeline (`display-time.ts:9-13`). Do not build one |

---

## Priority order

1. **TD-01** — consolidate the point-size divisor onto the registry; delete the three
   `return 1` unit substitutions. Closes F21-2 **and** the previously-unreported 100×
   index-spread defect. Small PR, largest correctness gain.
2. **TD-03 (1)+(2)** — fix the `Candle.time` doc comment and add the
   `StoredEpochSeconds`/`DisplayEpochSeconds` aliases. Near-zero cost; removes the single
   most misleading sentence in the codebase.
3. **TD-03 (3)** — route the eleven UTC-assuming formatters through `toDisplayTime`,
   starting with the Journal Time-of-Day bucket.
4. TD-06 (dedupe the six identical boundary types by importing rather than copying).
5. TD-02 Tier B (decide once whether a costless session may run silently).
6. TD-04 (`SavedSession.createdAt` → `createdAtMs`; unit-annotate the 50 bare temporal fields).
7. TD-07 (move `derivePointSize`; add `PanelId`; write the canonical-type pointer table).

Explicitly **not** recommended: nominal/branded typing for `symbol`, `price`, or `lots`;
integer-cents money; a global constants module; one-type-per-file; an assertion-cleanup
pass.
