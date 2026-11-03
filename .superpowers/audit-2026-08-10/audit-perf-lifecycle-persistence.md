# TD Audit — Performance, Resource Lifecycle, Error Handling, Persistence & Data Pipeline

Repo `C:\Users\78701\Desktop\trading-emulator` · branch `develop` · HEAD `a2ca53b`
Scope `emulador/src/app/**` + `pipeline/**`. READ-ONLY: no repository source file was modified.
Tags: **MEASURED FACT** / **INTERPRETATION** / **RECOMMENDATION**.
Perf class: **PROVEN ISSUE** / **HIGH-RISK HOT PATH** / **PREMATURE OPTIMIZATION**.

---

## STATUS

**~95% complete.** All five investigation areas were reached; every headline deliverable
(resource-ownership table, add/remove + set/clear deltas, silent-incorrect list,
`clearDatasetCandles` verdict, persistence/migration verdict, pipeline stage table) is recorded below.

**AREAS COMPLETE**
- **(1) Hot-path performance** — replay loop traced end to end (interval → advanceCandle → goToTime →
  processFills$ → chartView$ → ChartComponent.render → ChartEngine.render → 4 capabilities).
  `setData`/`update` counted, per-tick allocation budget quantified, selectors + ChartModelMapper
  memoization audited, premature-optimization candidates explicitly excluded.
- **(2) Resource lifecycle & leaks** — full ownership table; add/remove = **38/22**;
  setTimeout/clearTimeout = **6/3**; setInterval/clearInterval = **0/0**; rAF = **0/0**;
  Observers = **0**; createObjectURL/revoke = **3/3**; Worker new/terminate = **1/1**.
- **(3) Error handling & resilience** — full census (48 `} catch`, 35 identifier-less, 13 `catch (e)`,
  13 `catchError→default`, **0 `console.*`**); 17 user-facing failure paths classified.
- **(4) Persistence / IndexedDB** — 4 DBs, 6 openers, migration verdict, atomicity, leakage;
  `clearDatasetCandles` **VERIFIED FIXED**.
- **(5) Data pipeline boundaries** — 14-stage contract table incl. `pipeline/parquet_builder.py`.

**AREAS PARTIAL**
- (2) `lotaje/lotaje-view.ts` (67 kB) and `companion-window.ts` — listener imbalance counted and
  sites enumerated, but their internal teardown-generation mechanism was not read line by line;
  the "GC'd with the nodes" conclusion is marked INTERPRETATION.
- (3) `state/telemetry/telemetry.effects.ts` (23 kB) — only the floating `void append` at `:519` and
  the `setTimeout(0)` at `:231` were inspected; its own error paths are UNVERIFIED.
- (4) Storage quota behaviour — confirmed **absent** (`grep QuotaExceeded|navigator.storage` → 0),
  but no runtime probe was done.
- (5) `pipeline/update_r2.py`, `fill_r2.py`, `mt5_common.py`, `manifest.py`, `r2_uploader.py` were
  **not** read; only `parquet_builder.py` was. Manifest/upload contract inferred from the app side
  (`manifest.service.ts`) — marked UNVERIFIED where relied on.

**AREAS NOT STARTED**
- None. (Deliberately out of scope per brief: bundle size — the 648 kB vs 500 kB budget is the
  known-accepted Arrow/parquet finding, re-confirmed at `emulador/angular.json` budgets block, not
  re-litigated.)

---

## FINDINGS SO FAR

### 0. Mechanical census (MEASURED FACT)
Run from `emulador/src/app`, `*.spec.ts` excluded.

| Metric | Count |
|---|---|
| `setData(...)` sites | **1** — `domain/chart/chart-engine.ts:212` |
| `series.update(...)` sites | **2** — `components/chart/chart.component.ts:805`, `:846` |
| `engine.render(...)` sites | **6** — chart.component.ts `745, 837, 860, 1177, 1654, 1669` |
| Capabilities per chart | **4** (drawings, countdown, session, trading) |
| `addEventListener` / `removeEventListener` | **38 / 22** → delta **+16** |
| `setTimeout` / `clearTimeout` | **6 / 3** → delta **+3** |
| `setInterval` / `clearInterval` | **0 / 0** |
| `requestAnimationFrame` / `cancelAnimationFrame` | **0 / 0** (library-internal only) |
| `ResizeObserver`/`MutationObserver`/`IntersectionObserver` | **0** |
| `createObjectURL` / `revokeObjectURL` | **3 / 3** (balanced) |
| `new Worker(` / `.terminate()` | **1 / 1** |
| `indexedDB.open` implementations / distinct DBs | **6 / 4** |
| `onblocked` handlers | **0** |
| `} catch` total / `} catch {` / `} catch (e)` | **48 / 35 / 13** |
| `catchError(() => EMPTY\|of(default))` | **13** |
| `console.log\|warn\|error\|debug\|info` in app code | **0** |
| `@Component` / with `OnPush` | **61 / 28** (33 without) |
| virtual scroll (`cdk-virtual*`) | **0** |
| `structuredClone` / `JSON.parse(JSON.stringify)` on candles | **0** |

---

### 1. HOT-PATH PERFORMANCE

**Replay loop (MEASURED FACT).** `state/replay/replay.effects.ts:153-167`
(`selectPlaying → switchMap(msPerCandle) → switchMap(interval) → advanceCandle`) → `:42-52` →
`ReplayActions.goToTime` → (a) replay reducer, (b) `TradingEffects.processFills$`
(`state/trading/trading.effects.ts:21-59`) fanning out 1..N `processCandle`, (c) store notification →
`ChartModelMapper.chartView$` (`components/chart/chart-model-mapper.service.ts:347-407`) →
`ChartComponent.render` (`components/chart/chart.component.ts:751-818`).

**Per-tick budget, incremental branch (`chart.component.ts:802-818`), per VISIBLE panel:**
1. `series.update({...c, time: toDisplayTime(...)})` `:805` — 1 obj
2. `renderedTimes.push` `:809-811` — O(1), already optimized (comment cites the old O(n) `.includes()`)
3. `pushTrading()` `:814` → `buildTradingModel` obj + `TradeBoxesSource` obj +
   `[...positions.map(), ...orders.map()]` (2 arrays, N+M objs) + `requestUpdate()`
4. `applyForming()` `:815` → `{...forming}` + **`[...renderedTimes.filter(...), forming.time]`**
5. `updateCountdown()` `:816` → obj + `engine.render({countdown})`
6. `pushSession()` `:817` → obj + `engine.render({session})`

`ChartEngine.render` ends with `this.capabilities.forEach(cap => cap.render(model))`
(`chart-engine.ts:217`) — **all 4, unconditionally**. 3 render calls/tick ⇒ **12 capability.render
invocations/tick/panel, ~9 guard-only no-ops**.

`setData` vs `update` split is **correct and not a finding**: `setData` is reached only via
`renderWindow()` (`:853-862`) on the jump/TF-switch/zone-change branch (`:781-799`, threshold
`forwardJump > 240`, `RENDER_WINDOW = 12_000` at `:87`).

---

#### TD-P1 — `applyForming` rebuilds the whole `renderedTimes` array twice per replay tick
- **Category** Performance / per-tick allocation · **Severity** High · **Class PROVEN ISSUE**
- **Scope** every visible panel whose TF is coarser than the replay grain
- **Evidence**
  - `components/chart/chart.component.ts:848`
    `this.renderedTimes = [...this.renderedTimes.filter((t) => t !== forming.time), forming.time];`
  - `components/chart/chart.component.ts:815` — called unguarded on the per-tick branch
  - `components/chart/chart.component.ts:87` — `RENDER_WINDOW = 12_000`
  - `components/chart/chart.component.ts:857` — `renderedTimes = slice.map(c => c.time)` bounds it at 12 000
  - `components/chart/chart.component.ts:808-811` — the sibling path already replaced O(n) with an O(1)
    tail compare **and says so in a comment**
  - `components/chart/chart-model-mapper.service.ts:386-403` — `forming` is non-null exactly when
    `subGrain` (`activeSeconds > replayTfSeconds`), i.e. RFC-019's normal state for a coarse panel
- **Observed pattern** one `.filter()` (O(W)) + one spread copy (O(W)) → 2 fresh arrays of up to
  12 000 numbers per tick, to move one element already at/next to the tail.
- **Why it matters HERE** `renderedTimes` is passed by reference into `buildTradingModel` /
  `buildDrawingsModel` / `buildSessionModel`, so the reference also churns every tick, defeating any
  downstream reference short-circuit keyed on `times`.
- **Concrete risk** 4 visible coarse panels @100 ms ⇒ ~96 000 element-copies/tick ≈ **1 M/s** + 8
  array allocs/tick → autoplay stutter and GC sawtooth on the product's core workspace.
- **Recommended direction** mirror `:809`: `if (last !== forming.time) push(forming.time)`.
  `forming.time === bucketStart` is monotonic forward; the jump branch `:788` rebuilds anyway.
- **Migration difficulty** Trivial (one statement).
- **Best mechanism** direct fix + spec asserting `renderedTimes` reference identity (`toBe`) across
  two consecutive same-bucket ticks.
- **Acceptance condition** zero O(n) work in `applyForming` when the forming bucket is unchanged.

#### TD-P2 — Three `engine.render()` per tick fan out to 12 capability dispatches
- **Category** Performance / render architecture · **Severity** Medium · **Class PROVEN ISSUE** (low absolute cost)
- **Evidence** `domain/chart/chart-engine.ts:217`; `components/chart/chart.component.ts:814, 816, 817`;
  guards `trading-capability.ts:68`, `countdown-capability.ts:27`, `session-capability.ts:27`,
  `drawings-capability.ts:26`
- **Why it matters HERE** each call also triggers `setSource()` → `requestUpdate()`
  (`trade-boxes-primitive.ts:170-173`) — 3 independent repaint requests/tick/panel for the library
  to coalesce. Grows with every future Capability (kernel invariant 2 mandates more of them).
- **Recommended direction** batch into one `engine.render({trading, countdown, session})`; optionally
  index capabilities by consumed model keys.
- **Migration difficulty** Low–Medium (specs assert per-capability calls).
- **Acceptance condition** ≤1 `engine.render()` per tick per panel.

#### TD-P3 — `TradingCapability` reallocates the trade-button array on every `pushTrading`
- **Severity** Low–Medium · **Class PROVEN ISSUE** (small constant)
- **Evidence** `domain/chart/capabilities/trading-capability.ts:83-97` — `setSource({items: [
  ...t.positions.map(...), ...t.pendingOrders.map(...)]})` sits **before** the `dataChanged` memo at
  `:100-106`; `:72-80` `tradeBoxesPrimitive.setSource` likewise unconditional. The memo correctly
  guards the *expensive* body (price-line teardown/rebuild + `setMarkers`, `:112-201`).
- **Why it matters HERE** positions/orders references ARE stable across ticks
  (`state/trading/trading.reducer.ts:296-311` only yields new arrays when `changed || excursionsMoved`),
  so the memo hits — yet the prologue still allocates 2 arrays + N+M objects/tick.
- **Recommended direction** move both `setSource` calls inside the `dataChanged` branch (extend the
  key set with `boxes`/`times`/`barSpacing`). **Difficulty** Low.
- **Acceptance condition** zero allocation when all input references are unchanged.

#### TD-P4 — `getCandles` does a full-store scan, a full re-map and a **provably redundant sort**
- **Severity** High · **Class PROVEN ISSUE**
- **Evidence**
  - `domain/indexed-db.repository.ts:73-95` — `index.getAll(range)` then
    `.map(({time,open,high,low,close}) => ({...}))` then `.sort((a,b) => a.time - b.time)`
  - `services/market-data-db.ts:35` — index is `['symbol','timeframe','time']` ⇒ `getAll` **already
    returns rows ordered by time**; the sort is redundant O(n log n) over up to millions of elements
  - `state/workspaces/load-anchor-candles.ts:17-23` — `Promise.all` fires M1 **and** H1 **and** D1 concurrently
  - call sites `pages/crear-sesion/crear-sesion-page.component.ts:201`,
    `pages/sesiones/sesiones-page.component.ts:703, 784`
- **Why it matters HERE** read-side mirror of the known insert-bound finding. ~1.1 M rows (3 y M1) ⇒
  1.1 M records structured-clone-deserialized + 1.1 M objects allocated + a 1.1 M sort, **on the main
  thread, ×3 timeframes in parallel**, behind only a boolean `r2Loading` flag.
- **Concrete risk** multi-second to tens-of-seconds unresponsive tab on session open; peak memory ~2×.
- **Recommended direction** (a) delete the `.sort()`; (b) cursor/paged read writing into a preallocated
  array, or move the read into the existing worker; (c) columnar typed-array series = separate RFC.
- **Migration difficulty** (a) Trivial, (b) Medium, (c) High.
- **Acceptance condition** one array allocation per series load, no sort, no single main-thread block
  exceeding one frame budget.

#### TD-P5 — `toDisplayTime` allocates a `Date` **per candle** under a fixed-UTC display zone
- **Severity** Medium · **Class HIGH-RISK HOT PATH**
- **Trigger** display zone is `utc±N` (`kind: 'utc-fixed'`), not the default `ny`/`server`
- **Evidence** `domain/chart/display-time.ts:159-163` (branch) → `:96-98` → `:88-93` → `:81-85`
  `new Date(newYorkWallEpoch * 1000).getUTCFullYear()`. `dstBoundsCache` (`:58`) caches the *bounds*,
  not the year extraction. Iterating callers: `chart.component.ts:858` (`slice.map` over ≤12 000 bars),
  `trading-capability.ts:194-200` (all markers), `chart.component.ts:805, 846` (per tick).
- **Why it matters HERE** a TF switch or >240-bar jump = **12 000 `Date` allocations** in one
  synchronous pass, per panel — despite `display-time.ts:56` documenting "the hot path calls this
  once per candle".
- **Recommended direction** replace the year extraction with integer arithmetic / bracketing against
  the already-cached DST bounds. **Difficulty** Low (pure module, covered by `display-time.spec.ts`).
- **Acceptance condition** `toDisplayTime` allocates nothing for any zone kind.

#### TD-P6 — Base-grain fills dispatch **one NgRx action per base candle**
- **Severity** Medium–High · **Class HIGH-RISK HOT PATH**
- **Trigger** (a) `jumpForward` with large `jumpSize`; (b) `advanceDisplay` on a display TF much
  coarser than the M1 execution base — both only when the book is non-empty
- **Evidence** `state/replay/replay.effects.ts:175-195` (`foldForwardFills` pushes one
  `processCandle` per base candle); `state/trading/trading.effects.ts:38-47` (same for the landing
  interval); `sliceRange` copy per interval (`state/trading/fill-engine.ts:444-456`);
  `state/trading/trading.reducer.ts:283-312` — **every** `processCandle`, including no-ops, returns a
  new `TradingState` (`lastProcessedTime` always advances);
  `state/trading/fill-engine.ts:305-352` — **≥6 allocations per base candle** (`facts[]`,
  `remaining[]`, `positions=[...]`, `fillIdx` Map, `stillOpen[]`, `closed[]`) even on an idle candle;
  `app.config.ts:39-51` — **11 feature reducers** run per action.
- **Quantification (INTERPRETATION)** a 100-candle jump at M15 over M1 base = **1 500 actions**,
  ≈ **16 500 reducer invocations**, ≈ **9 000 allocations**, synchronously.
- **Mitigating MEASURED FACT** the chart does **not** re-render per `processCandle`: `chartView$`'s
  inputs (`chart-model-mapper.service.ts:354-362`) are memoized selectors whose outputs stay
  reference-stable across a `processCandle`, so `store.select`'s `distinctUntilChanged` suppresses.
  The cost is state machinery, not render.
- **Recommended direction** a batched `processCandles({candles})` action folding the interval in one
  reducer pass (the engine is already a pure fold). **Difficulty** Medium — the per-candle action is
  load-bearing for existing specs and telemetry facts; RFC-sized.
- **Acceptance condition** a jump of N replay candles dispatches O(1) actions with identical
  resulting `TradingState` and identical emitted facts.

#### TD-P7 — 33 of 61 components are not `OnPush`, including the chart, under Zone.js
- **Severity** Medium · **Class HIGH-RISK HOT PATH**
- **Evidence** `app.config.ts` has **no** `provideZonelessChangeDetection()` and no
  `provideZoneChangeDetection(...)` ⇒ default Zone.js CD. Render-path components without OnPush:
  `components/chart/chart.component.ts`, `components/trade-panel/trade-panel.component.ts`,
  `components/floating-pnl/floating-pnl.component.ts`,
  `components/playback-controller/playback-controller.component.ts`,
  `components/controls/controls.component.ts`, `pages/emulador/emulador-page.component.ts`.
  Partial mitigation already correct: `chart.component.ts:696-698` keeps `CrosshairMoved` /
  `VisibleRangeChanged` **outside** the zone, re-entering only for clicks.
- **Why it matters HERE** every un-zoned mousemove still runs `handleHoverFeedback`
  (`chart.component.ts:1560-1580`: `getBoundingClientRect()` + 2 hit-tests); every zoned event runs
  full CD over the non-OnPush tree × N panels.
- **Recommended direction** OnPush the six render-path components first (already signal/observable
  driven); do **not** blanket-convert all 33. **Difficulty** Low each / Medium aggregate.

#### TD-P8 — `payloadSizeBytes` runs `JSON.stringify` + `new Blob` for every session on every flush
- **Severity** Low–Medium · **Class HIGH-RISK HOT PATH** (bounded by session count, unbounded by size)
- **Evidence** `services/session-sync.mapping.ts:95-97`; `:197-198` (`flattenWorkspace` calls
  `assertNoCandles` **and** `assertPayloadSize` per row); `services/session-sync.service.ts:326-338` —
  `flushDirtySessions` runs `flattenWorkspace` for **every** meta, with the cheap `isDirty` test only
  **after**, at `:349`/`:361`. `assertNoCandles` (`session-sync.mapping.ts:75-92`) is itself a full
  recursive walk.
- **Recommended direction** hoist `isDirty`; reuse one serialization for both size check and upload.
  **Difficulty** Low. **Acceptance condition** a flush with no dirty sessions performs zero `JSON.stringify`.

#### Explicitly classified PREMATURE OPTIMIZATION — do NOT trade readability for these (INTERPRETATION)
- Binary searches `snapToCandle` (`state/selectors.ts:293-305`), `lastIndexAtOrBefore` /
  `firstIndexAtOrAfter` (`state/trading/fill-engine.ts:459-480`) — already optimal.
- `aggregateFormingCandle`'s index loop (`state/market/forming-candle.ts:22-33`) — deliberately
  slice-free with a comment; bounded by one display bucket.
- `{...c, time}` per updated candle (`chart.component.ts:805`) — one small object per tick.
- `selectTradeMarkers`'s `markers.sort()` (`state/selectors.ts:340`) — recomputes only on
  positions/history change, not per tick.
- **The whole `ChartModelMapper` memo lattice** (`chart-model-mapper.service.ts:304-328, 458-558,
  570-656, 666-726, 731-803`) — per-instance slots, reference keys, frozen shared empties
  (`:159-176`), doc comments naming the pathology each guard prevents. **This is already correct
  under D8. No change recommended.**
- NgRx dev-mode `runtimeChecks` deep-freezing candle arrays — one-time (the freezer short-circuits on
  frozen values) and dev-only.

---

### 2. RESOURCE LIFECYCLE & LEAKS

#### Resource-ownership table (MEASURED FACT)

| Resource | Creator | Destroyer | Leak? |
|---|---|---|---|
| `IChartApi` | `ChartEngine` ctor `domain/chart/chart-engine.ts:89` ← `chart.component.ts:629` | `ChartEngine.destroy()` `:258` ← `chart.component.ts:1692` | **No** |
| Candlestick `ISeriesApi` | `chart-engine.ts:100` | implicit in `chart.remove()` | No |
| 4 `Capability` instances | `chart.component.ts:633-643` | `chart-engine.ts:255` → each `cap.destroy()` | **No** |
| Series primitives (boxes/buttons/drawings/session/countdown) | `*-capability.init()` `attachPrimitive` | `*-capability.destroy()` `detachPrimitive` | No |
| `IPriceLine` (trade lines) | `trading-capability.ts:127` | `:112-114` on rebuild + `:256-258` on destroy | No |
| `IPriceLine` (placing preview) | `chart.component.ts:1042, 1050` | `clearPlacing()` `:1161-1167` | **Partial** — not cleared in `ngOnDestroy`; harmless (series dies with chart) |
| `ISeriesMarkersPluginApi` | `trading-capability.ts:64` | `:252-255` `detach()` | No |
| Engine bus listeners (component) | `chart.component.ts:695-699` → `busUnsubs` | `:1690-1691` | No |
| Engine bus listeners (panel) | `components/workspace/chart-panel.component.ts:561-568` | `:578-579` | No |
| `ChartSyncBus` subscription | `components/workspace/chart-sync-router.ts:69` | `destroy()` `:131` ← `workspace-viewport.component.ts:540` | No |
| `ChartRegistry` entries | `chart-panel.component.ts:547` `ngOnInit` | `:577` `ngOnDestroy` | No |
| RxJS subs in `ChartComponent` | 6 × `takeUntilDestroyed(destroyRef)` `chart.component.ts:646-687` | `DestroyRef` | No |
| `ResizeObserver` | lightweight-charts internal (`autoSize: true`, `chart-engine.ts:90`) | `chart.remove()` | No |
| Web Worker (parquet) | `services/market-data/data-onboarding.service.ts:53` (one per **batch**) | `:256` `terminate()` in `finally` | No |
| Worker IDB connection | `workers/candles-writer.ts:67` | `:146` `db.close()` in `finally` | No |
| `WorkspaceDbService` IDB conn | `services/workspace-db.service.ts:53` | never closed; `onversionchange` `:125-128` | see TD-L4 |
| **`IndexedDbMarketDataRepository` IDB conn** | `domain/indexed-db.repository.ts:33` | **never closed, NO `onversionchange`** | **YES — TD-L4** |
| Telemetry/Playbook/Lessons conns | `telemetry-db.service.ts:90`, `playbook-db.service.ts:22`, `lessons-db.service.ts:23` | `onversionchange` only | see TD-L4 |
| `URL.createObjectURL` | `playbook-panel:94`, `session-summary:110`, `session.service:360` | revoked `:99`, `:117`, `:365` | No |
| **`ChartSyncRouter.lastApplied` Map** | `chart-sync-router.ts:66` | **never pruned** | **YES — TD-L3** |
| **Telemetry `nextSeq`/`admitted`/`initPromises`** | `telemetry-db.service.ts:78-82` | **never pruned** | **YES — TD-L5** |
| `JournalDataService.cache` | `services/journal-data.service.ts:139` | `clear()` exists `:156` | Caller-dependent |
| `dstBoundsCache`, `zoneCache` | `domain/chart/display-time.ts:58, 114` | never | **No** (bounded by year / zone id) |

#### TD-L1 — listener delta **+16** (38 add / 22 remove)
- **Severity** Medium
- **Unbalanced sites (MEASURED FACT):** `lotaje/lotaje-view.ts` **16** adds at
  `:925, 945, 962, 993, 1037, 1042, 1094, 1109, 1220, 1230, 1240, 1262, 1277, 1339, 1353, 1456`
  (only `:385/:402`, `:525`, `:1675-1676/:1710-1711` are matched); `lotaje/companion-window.ts:274`
  (`returnButton` click, in a separate `window.open` document — `:171/:200` `pagehide` IS balanced).
- **Balanced (verified):** `chart.component.ts` 7 adds `:707-714` vs 7 removes `:1680-1689`; the drag
  `mousemove` added at `:1511, 1524, 1550` (same fn reference ⇒ idempotent per DOM spec) removed at
  `:1631` **and** `:1686`. `custom-color-picker.component.ts:359-360/:355-356`, `:387-388/:383-384`
  self-removing. `components/ui/draggable.directive.ts:64-65` removed `:88-89` **and** `:133-134`.
- **INTERPRETATION** in `lotaje-view.ts` listeners attach to nodes the view discards ⇒ GC'd with the
  nodes; a style leak, not a live one — **except** `companion-window.ts:274` (foreign document
  lifetime). *(UNVERIFIED: the view's teardown-generation mechanism was not read in full.)*
- **Recommendation** track disposers via the existing `capturedMountGeneration` mechanism
  (`lotaje-view.ts:853`). **Difficulty** Low–Medium.

#### TD-L2 — 3 uncleared `setTimeout` survive component destruction
- **Severity** Low
- **Evidence** `pages/reflection/reflection-cabin-page.component.ts:285` —
  `setTimeout(() => void this.router.navigate([...]), 600)` **never cleared → can hijack the router
  600 ms after the user navigates away**; `pages/sesiones/sesiones-page.component.ts:1292` (4 s);
  `pages/reflection/cabin-trade-list.component.ts:159`.
  Balanced: `components/ui/tooltip.directive.ts:41/:46`, `services/telemetry-db.service.ts:194/:203`,
  `lotaje/lotaje-view.ts:816/:735`.
- **Recommendation** store handles, clear via `DestroyRef.onDestroy`. **Difficulty** Trivial.

#### TD-L3 — `ChartSyncRouter.lastApplied` grows for the session's lifetime
- **Severity** Low · **Evidence** `chart-sync-router.ts:66` (Map), written `:113`, `:126`;
  `ChartRegistry.deregister` (`chart-panel.component.ts:577`) never notifies the router; `route()`
  `:78-90` never prunes.
- **Ownership ambiguity (explicit):** the registry owns panel liveness, the router owns the keyed
  cache, **nobody owns the join**. Bounded by (panels ever created × 2) per session.
- **Recommendation** have `deregister` emit so the router drops that panel's keys. **Difficulty** Low.

#### TD-L4 — **No `onblocked` anywhere; the market-data read connection is never closed and has no `onversionchange`**
- **Severity HIGH (latent — fires on the NEXT schema change)**
- **Evidence** `grep onblocked` over `emulador/src/app` → **0 hits**.
  `domain/indexed-db.repository.ts:22-68` caches `dbPromise`, resolves a live `IDBDatabase`, sets
  **no** `db.onversionchange`; its only `db.close()` (`:44`) is in the store-missing rejection branch.
  Contrast — all four versioned wrappers DO install it: `workspace-db.service.ts:125-128`,
  `telemetry-db.service.ts:101-104`, `playbook-db.service.ts:32-35`, `lessons-db.service.ts:33-36`.
  `services/market-data-db.ts:19` `DB_VERSION = 6`; the repository opens the **same** DB versionless
  at `indexed-db.repository.ts:33` (as does `workers/candles-writer.ts:67`, but that one closes).
- **INTERPRETATION** the day `DB_VERSION` → 7, a user with the app open holds a versionless connection
  that will not close on `versionchange`. `WorkspaceDbService.open()`'s request fires `blocked` — no
  handler — and its promise **never settles**. Every `await this.open()` hangs forever: no error, no
  log (0 `console.*`), no UI signal. Classic IndexedDB deadlock, **pre-armed**.
- **Recommendation** (1) add `onversionchange` to `IndexedDbMarketDataRepository`; (2) add
  `req.onblocked` to all four versioned openers rejecting with an actionable message; (3) spec that a
  blocked upgrade rejects rather than hangs. **Difficulty** Low. **Best mechanism** the shared
  `openDb()` helper of TD-D1 so it is written once.

#### TD-L5 — `TelemetryDbService`: no destroy hook, unbounded Maps, floating flush that loses the buffer
- **Severity** Medium
- **Evidence** `services/telemetry-db.service.ts:78-82` (3 Maps keyed by `sessionId`, never pruned);
  `:190`, `:196` `void this.flush()` (unhandled rejection); **`:207-208` drains `this.buffer` BEFORE
  awaiting the transaction**, so a rejected tx (quota, aborted upgrade) loses the batch silently; no
  `ngOnDestroy` / `pagehide` flush ⇒ up to `FLUSH_BATCH_SIZE = 200` (`:52`) or `FLUSH_IDLE_MS = 2000`
  (`:55`) of events lost on tab close.
- **INTERPRETATION** RFC-014 declares telemetry loss tolerable — but "lost by design" ≠ "lost on
  quota"; only the former is documented. **Recommendation** re-queue on failure; prune Maps on
  session end; `pagehide` flush. **Difficulty** Low.

---

### 3. ERROR HANDLING & RESILIENCE

#### Census (MEASURED FACT)
| Style | Count | Representative sites |
|---|---|---|
| `} catch {` (no binding) | **35** | `services/session-sync.service.ts:294, 320, 333, 356, 366, 453, 457, 534`; `pages/sesiones/sesiones-page.component.ts:476, 483, 492, 507, 982, 1001, 1141, 1154`; `state/workspaces/workspaces.effects.ts:258, 269, 315, 323, 328` |
| `} catch (e)` | **13** | `pages/crear-sesion/crear-sesion-page.component.ts:153, 180, 214`; `pages/mercados/r2-markets.component.ts:121, 162, 186`; `pages/sesiones/sesiones-page.component.ts:638, 664, 794, 824`; `components/interval-dialog/interval-dialog.component.ts:165` |
| `catchError(() => EMPTY / of(default))` | **13** | `state/sync/session-sync.effects.ts:52, 80, 103`; `state/lessons/lessons.effects.ts:57, 78, 108, 151`; `state/playbook/playbook.effects.ts:56, 81, 118, 161`; `state/auth/auth.effects.ts:37, 70` |
| `.catch(() => undefined)` on a persistence write | **3** | `state/workspaces/workspaces.effects.ts:215, 230, 246` |
| `console.*` | **0** | only `emulador/src/main.ts:5` |

**Three coexisting result semantics for the same operation class:**
1. **throw** — `session-sync.service.ts:52, 66, 100`; `parquet-download.service.ts:53`; `candles-writer.ts:70`
2. **Result-ish default** — `services/session.service.ts:325-327` (`{status:'invalid', reason}`);
   `pages/reflection/frozen-scene-host.component.ts:340-342` (`{candles: [], missing: true}`)
3. **null/undefined/swallow** — `workspaces.effects.ts:215`; `sesiones-page.component.ts:476`
Style (2) — the only one letting a caller distinguish "no data" from "failed" — is used in **2 of ~48** places.

#### TD-E1 — Zero diagnostics: no failure in this application is ever recorded
- **Severity HIGH** · **Evidence** grep → **0** `console.*` in `emulador/src/app`; the only console
  write is `emulador/src/main.ts:5`; `app.config.ts:36` `provideBrowserGlobalErrorListeners()` logs
  uncaught errors to console only. 35 catches never even bind the `Error`.
- **INTERPRETATION** when a user reports "my session didn't save" there is **no evidence trail
  anywhere** — not console, not IndexedDB, not Supabase.
- **Recommendation** one additive `Diagnostics` sink (console in dev, ring buffer + optional Supabase
  table in prod) routed from every catch, incl. ones that legitimately continue; lint rule banning
  bare `} catch {`. **Difficulty** Low–Medium (48 mechanical sites). **Zero control-flow change.**

#### TD-E2 — **SILENT-INCORRECT-BEHAVIOUR: the complete list** (highest-value output)

| # | Failure | Code path | What the user sees | Verdict |
|---|---|---|---|---|
| **S1** | IDB write fails (quota/corrupt/blocked) while persisting the live session | `state/workspaces/workspaces.effects.ts:216-230` — `putMeta({...}).catch(() => undefined)` | **Nothing.** Trading continues, chart correct, session silently not saved. On reload the work is gone. | **SILENT INCORRECT — worst finding** |
| **S2** | IDB read fails at app start | `state/workspaces/workspaces.effects.ts:269-271` — `catch → assetsLoaded({assets: [], current: null})` | Empty asset list, indistinguishable from "you have no data" | **SILENT INCORRECT** |
| **S3** | IDB read fails on Sessions page | `pages/sesiones/sesiones-page.component.ts:476-479` (`metas.set([]); folders.set([])`), `:483-485` (`localDatasets.set([])`) | "No sessions" empty state — **looks exactly like total data loss**; user may re-create/re-download everything | **SILENT INCORRECT** |
| **S4** | Session payload > `PAYLOAD_MAX_BYTES` (2 MB) | `services/session-sync.service.ts:331-338` — `flattenWorkspace` throws in `assertPayloadSize` (`session-sync.mapping.ts:101-103`), caught, `continue` | Session **never** syncs, forever. No badge, no toast, no log. User believes it is backed up. | **SILENT INCORRECT** |
| **S5** | Any individual session/folder push fails | `services/session-sync.service.ts:320, 356, 366, 453` — `catch {}` "retried next flush" | Retry is real, but there is **no permanent-failure state**; a deterministic failure (RLS, oversize) retries forever, silently | **SILENT INCORRECT** |
| **S6** | `listSummaries()` returns a **partial** cloud list — `services/session-sync.service.ts:60-64` has **no `.range()`, no ordering, no count assertion** | `pullAndMergeSessions:509` → `mergeByLww` (`services/session-sync.mapping.ts:339-341`): a previously-synced local absent from `cloud` ⇒ `toDeleteLocalIds` ⇒ `:513-525` wipes local trading state + `putMeta` | **Local sessions deleted.** A truncated response is indistinguishable from a genuine cloud deletion. | **SILENT INCORRECT — data destruction** |
| **S7** | Dataset deletion half-applies | `pages/storage-manager/storage-manager.service.ts:50-53` — `deleteDataset(id)` (tx A) then `clearDatasetCandles(...)` (tx B) | Manifest row gone, candles remain: Storage Manager says deleted, chart still renders it, nothing can ever clean it up | **SILENT INCORRECT** |
| **S8** | Re-ingestion fails part-way | `services/market-data/data-onboarding.service.ts:133-141` (clear → ingest → `putDataset`); `workers/candles-writer.ts:136-146` commits **per 50 000-row chunk** | Partial candle set persisted, no `datasets` row: **truncated series with no gap indication** | **SILENT INCORRECT** |
| **S9** | 2nd onboarding batch while one is in flight | `services/market-data/data-onboarding.service.ts:214` — `if (this._busySymbol()) return;` | `runJobs` resolves normally having done nothing; caller cannot distinguish "downloaded" from "refused" | **SILENT NO-OP** |
| **S10** | Telemetry flush tx fails | `services/telemetry-db.service.ts:190, 196, 207-208` — `void this.flush()`, buffer already drained | Batch lost + unhandled rejection | **SILENT NO-OP** (tolerated by RFC-014, not for quota) |
| **S11** | Frozen-scene candle read fails | `pages/reflection/frozen-scene-host.component.ts:340-342` → `{candles: [], missing: true}` | `missing` flag propagated | **Correct — the model to copy** |
| **S12** | Malformed / gapped historical data | **No validation anywhere**: `workers/candles-writer.ts:36-56` coerces every column with `Number(...)`; `domain/indexed-db.repository.ts:88-91` re-maps without checks | A NaN/misaligned candle flows into NgRx, the chart and the fill engine unchallenged (`derivePointSize`, `aggregateCandles`, `lastIndexAtOrBefore` all assume ascending finite data) | **SILENT INCORRECT — no detector exists** |
| **S13** | Parquet decode failure | `workers/parquet.worker.ts:86-88` → `{type:'error'}` → `ingestOn` rejects → surfaced at `r2-markets.component.ts:162`, `interval-dialog.component.ts:165` | Real error shown | **Correct** |
| **S14** | R2 network / HTTP failure | `services/market-data/parquet-download.service.ts:50-56` throws with HTTP status; surfaced by the 3 wizard `catch (e)` sites | Real error shown (no retry/backoff — documented at `:18`) | **Correct** |
| **S15** | Chart init failure (`createChart` throws) | `domain/chart/chart-engine.ts:89` inside `chart.component.ts:629` — **no try/catch** | Uncaught in a lifecycle hook → console only → **blank panel, no message** | **Silent-ish** |
| **S16** | Auth expiry / offline | `state/auth/auth.effects.ts:37, 70` — `catchError(() => of(sessionResolved({user: null})))` / `of(loggedOut())` | A network blip is reported as "logged out" — a false statement that also stops all sync | **SILENT INCORRECT (mild)** |
| **S17** | Session-state corruption on import | `services/session.service.ts:322-328` → `{status:'invalid', reason}` + version classification | Real error shown | **Correct** |

**Priority within §3 (RECOMMENDATION):** S1, S6, S3, S4, S12. S1 and S6 are the two that destroy user work.

#### TD-E3 — Persistence failure has no user-visible channel at all
- **Severity** High (mechanism behind S1/S2/S3) · **Evidence** `state/workspaces/workspaces.effects.ts:246`
  (`putSeries(...).catch(() => undefined)`), `:230` (`putMeta`), `:315-317`
  (`catch { /* persistence is best-effort */ }`), `:328-330` (`localStorage` → `catch { /* ignore */ }`).
- **INTERPRETATION** "best-effort persistence" is a defensible policy for a personal tool, but it is
  currently **unobservable**. One durable `PersistenceHealth` signal (`ok|degraded|failed`) rendered
  in the dock converts S1–S5 from silent-incorrect to merely-degraded.
- **Difficulty** Medium. **Acceptance condition** any failed `putMeta`/`putSeries`/`upsertSession`
  flips a visible indicator.

#### TD-E4 — `mergeByLww` deletes local data on a cloud absence it cannot verify
- **Severity HIGH** (S6) · **Evidence** `services/session-sync.mapping.ts:339-341`; cloud side from
  `services/session-sync.service.ts:60-64` via `:462-464`.
- **Recommendation** request `{ count: 'exact' }` and refuse the deletion branch unless
  `rows.length === count`; paginate with `.range()`; make deletion a soft tombstone the UI can surface
  and undo. **Difficulty** Medium. **Acceptance condition** a truncated cloud response produces zero
  local deletions.

---

### 4. PERSISTENCE / INDEXEDDB

#### Schema ownership map (MEASURED FACT)
| Database | Version | Stores | Schema owner | Openers |
|---|---|---|---|---|
| `emulador-workspaces` | **6** (`services/market-data-db.ts:19`) | `meta`, `series`, `folders`, `datasets`, `candles`, `sync` (+ orphan `symbols` on old profiles) | `WorkspaceDbService` `:54-120` | `workspace-db.service.ts:53` (versioned) · `domain/indexed-db.repository.ts:33` (versionless) · `workers/candles-writer.ts:67` (versionless) |
| `emulador-telemetry` | 1 | `events` | `services/telemetry-db.service.ts:91-96` | `:90` |
| `emulador-playbook` | 1 | `rules` | `services/playbook-db.service.ts:23-27` | `:22` |
| `emulador-lessons` | 1 | `lessons` | `services/lessons-db.service.ts:24-28` | `:23` |

**4 databases · 6 `indexedDB.open` implementations · 5 hand-rolled `request<T>()` wrappers.**

#### TD-D1 — Six duplicated IndexedDB adapters, caused by a pinned test assertion
- **Severity** Medium · **Evidence** near-identical `open()` + `request<T>()` at
  `services/workspace-db.service.ts:50-142`, `services/telemetry-db.service.ts:87-118`,
  `services/playbook-db.service.ts:21-49`, `services/lessons-db.service.ts:22-49`,
  `domain/indexed-db.repository.ts:22-68`, `workers/candles-writer.ts:61-99`.
  `telemetry-db.service.ts:5-26` **documents the cause**: `workspace-db.service.spec.ts` hard-asserts
  the object-store count (`expect(names).toHaveLength(6)`) and is STOP-protected, so a 7th store was
  forbidden ⇒ a new DB. `playbook-db.service.ts:5-11` and `lessons-db.service.ts:6-12` cite that precedent.
- **INTERPRETATION** a test assertion has become the de-facto architecture: 3 extra databases and 4
  copies of the same 20 lines. Each copy independently omits `onblocked` ⇒ TD-L4 replicated 6×.
- **Recommendation** extract one Angular-free `openDatabase(name, version, upgrade)` +
  `promisifyRequest`/`promisifyTransaction` (worker-importable, like `market-data-db.ts`) and fix
  `onblocked`/`onversionchange` once. Whether the 4 DBs should merge is a separate question.
  **Difficulty** Low (behaviour-preserving extraction).

#### TD-D2 — **Migration verdict:** additive-only DDL + read-time data lifts; no rollback, no block handling
- **Severity** Medium–High
- **What exists (MEASURED FACT)**
  - DDL is additive/idempotent: `services/workspace-db.service.ts:57-119` creates each store only
    `if (!db.objectStoreNames.contains(...))` ⇒ v1→v6, v3→v6 and fresh→v6 all converge.
  - The **only** real data migration is v1→v3 (`:69-91`), inside
    `try { } catch { /* best effort: empty registry is acceptable */ }`, run from an async
    `getAll().onsuccess` inside the upgrade tx ⇒ a failure there **silently discards the user's entire
    v1 workspace registry**.
  - **Record-shape evolution is handled at READ time, not upgrade time — the strongest part of the
    design:** `withLiftedDrawings`/`liftLegacyDrawings` (`state/workspaces/workspaces.effects.ts:88-130`),
    `services/drawings-migration.ts`, `services/session-migration.ts` (`singlePanelLayoutFor`),
    payload versioning `SessionPayloadV1|V2|V3` (`services/session-sync.service.ts:96`).
  - **Documented schema drift:** `services/workspace-db.service.ts:96-98` — the v4 `symbols` store was
    retired **without** bumping `DB_VERSION` ⇒ two different physical schemas both claim version 6.
- **What is missing** no `onblocked` (TD-L4 deadlock); no downgrade guard (an older deploy opening a
  v7 DB gets `VersionError` → `reject` → S2/S3 empty lists, not a message); no integrity/repair pass;
  **no quota handling at all** (`grep "QuotaExceeded\|navigator.storage"` → **0**).
- **Recommendation** add `onblocked` + an explicit `VersionError` branch; bump-and-drop the orphan
  `symbols` store (or document the drift in `docs/engineering/domain/data-pipeline.md`); make the v1
  migration failure loud. **Difficulty** Low–Medium.

#### TD-D3 — **VERIFICATION: the reported `clearDatasetCandles` all-years bug is FIXED at HEAD**
- **Status: CLOSED.** The memory note (`r2-data-refresh-and-pipeline-defects`) is **stale**.
- **Evidence (MEASURED FACT)**
  - `services/workspace-db.service.ts:377-399` — signature is now
    `clearDatasetCandles(symbol, timeframe, year: string = ALL_PARTITION)` and it narrows the cursor:
    `const { from, to } = partitionTimeBounds(year);`
    `const range = IDBKeyRange.bound([symbol, timeframe, from], [symbol, timeframe, to]);`
  - `services/market-data-db.ts:62-83` — `partitionTimeBounds(year)` returns
    `[Date.UTC(y,0,1)/1000, Date.UTC(y+1,0,1)/1000 - 1]` for a 4-digit year, else
    `[-Infinity, +Infinity]`; its doc comment describes exactly the bug that was fixed.
  - **Both** call sites pass the year: `services/market-data/data-onboarding.service.ts:136-140`
    (`payload.record.year`) and `pages/storage-manager/storage-manager.service.ts:52` (`dataset.year`).
  - Coverage: `services/workspace-db.service.spec.ts:566-624`
    (`"clearDatasetCandles (partition scope)"`, cases `('US30','M1','2026')` and `('US30','H1','all')`).
- **Residual risk (INTERPRETATION, minor)** the unrecognised-key fallback deliberately over-deletes
  (`market-data-db.ts:71-75` explains: over-deleting cannot leave duplicates). Correct for H1/D1, but
  **any future partition key that is not a 4-digit year silently wipes the whole (symbol, tf)** — if
  M1 ever partitions by month/quarter this reverts to the old bug **with no test failure**.
  Recommend restricting the fallback to the literal `'all'` and throwing otherwise.

#### TD-D4 — Multi-step persistence operations are not atomic (mechanism behind S7 and S8)
- **Severity** Medium–High
- **Evidence** `pages/storage-manager/storage-manager.service.ts:50-53` — two transactions over two
  stores **of the same database**, which could share one `readwrite` tx;
  `services/market-data/data-onboarding.service.ts:133-141` — three-phase (clear → worker ingest in
  50 000-row chunks `workers/candles-writer.ts:136-146` → `putDataset`) across a thread boundary with
  no compensating action. The correct pattern already exists in-repo:
  `services/workspace-db.service.ts:170-182` (`getWorkspace`) and `:258-267` (`remove`) use a single
  multi-store transaction.
- **INTERPRETATION** the dedup contract is "auto-increment PK + NON-unique index ⇒ re-ingest
  duplicates rows" (`workspace-db.service.ts:363-369`), so atomicity is load-bearing for
  **correctness**: a torn clear/ingest yields duplicated or truncated candles, undetectable at read time.
- **Recommendation** (1) one `readwrite` tx over `[DATASETS_STORE, CANDLES_STORE]` for delete;
  (2) write the `datasets` row in a *pending* state before clearing, finalise after the last chunk;
  (3) longer term give `candles` a **unique** compound keyPath `[symbol, timeframe, time]` so
  re-ingestion is idempotent by construction and the clear step disappears.
  **Difficulty** (1) Low, (2) Low–Medium, (3) High (keyPath change ⇒ real migration ⇒ RFC).

#### TD-D5 — Persistence shapes leak into the domain/UI vocabulary
- **Severity** Low–Medium
- **Evidence** `state/workspaces/load-anchor-candles.ts:18-22` — R2/Parquet data is packed as
  `PendingCsv` with a synthesised `fileName: '${symbol}_${tf}.csv'`, dispatched as
  `MarketActions.csvLoaded` (`state/workspaces/workspaces.effects.ts:338`) and stored in
  `MarketState.files` (`state/market/market.reducer.ts:11`) — **there is no CSV**;
  `services/workspace-db.service.ts:29-35` private `SeriesRecord` feeds `getWorkspace` `:170-182`
  straight into NgRx; `services/session-sync.service.ts:65-88` reads snake_case columns via
  `Record<string, unknown>` index access + hand-written casts; the
  `Record<string,LinkGroup>` → `LinkGroup[]` conversion is duplicated at
  `state/workspaces/workspaces.effects.ts:220-225` and `:306-312`.
- **Recommendation** rename the ingestion action/shape source-neutrally (`seriesLoaded`/`SeriesSource`);
  give the sync layer a real row type. **Difficulty** Low–Medium (rename touches specs).

---

### 5. DATA PIPELINE BOUNDARIES

#### Stage contract table (MEASURED FACT)
| # | Stage | Owner | Shape | Contract |
|---|---|---|---|---|
| 1 | MT5 → DataFrame | `pipeline/parquet_builder.py:172-224` (`harvest_to_parquet`) | `time:int64, o/h/l/c:float64` | `time` = **broker server-clock** epoch seconds (`descartar_vela_en_formacion` docstring: *"hora del servidor"*) |
| 2 | Resample M1→H1/D1 | `pipeline/parquet_builder.py:52-93` | same | `pd.to_datetime(..., utc=True)`, `resample('1h'/'1D', label='left', closed='left')`, `dropna()` |
| 3 | Partition + write | `pipeline/parquet_builder.py:119-164` | Parquet/Snappy, `_SCHEMA` (`:32-40`) | `m1/<year>.parquet` (year from `.dt.year` on UTC-read stamps), `h1/all.parquet`, `d1/all.parquet` |
| 4 | Upload + manifest | `pipeline/r2_uploader.py`, `pipeline/manifest.py` *(UNVERIFIED — not read)* | `market-data/v1/<SYMBOL>/<tf>/<file>` | `{version, symbols:{SYM:{m1:{"2024":{size,etag,updatedAt}}}}}` per `services/market-data/manifest.service.ts:35-41` |
| 5 | Download | `services/market-data/parquet-download.service.ts:36-57` | `ArrayBuffer` | throws on non-2xx; **no retry/backoff** (documented `:18`) |
| 6 | Decode | `workers/parquet.worker.ts:62-79` | Arrow `Table` | `readParquet → intoIPCStream → tableFromIPC` |
| 7 | Arrow → rows | `workers/candles-writer.ts:23-56` | `CandleRecord{symbol,timeframe,time,o,h,l,c}` | column names by string; `Number(...)` coercion (int64 bigint → number) |
| 8 | Bulk insert | `workers/candles-writer.ts:118-148` | IDB `candles` | 50 000 rows/tx (`parquet.worker.ts:74`), auto-inc PK, **non-unique** index |
| 9 | Query | `domain/indexed-db.repository.ts:73-95` | `Candle{time,o,h,l,c}` | index range scan + re-map + **redundant sort** (TD-P4) |
| 10 | Into NgRx | `state/workspaces/load-anchor-candles.ts` → `csvLoaded` → `state/market/market.reducer.ts:48-57` | `Partial<Record<Timeframe, Candle[]>>` | by reference, **no clone** ✓ |
| 11 | TF generation | `state/market/custom-timeframe.ts:generateCustomSeries` → `services/timeframe-generator.ts:aggregateCandles` | `Candle[]` | epoch-aligned `floor(t/bucketSec)*bucketSec` |
| 12 | Per-panel derivation | `components/chart/chart-model-mapper.service.ts:464-482`, `:347-407` | `{tf,candles,idx,displayZone,forming,countdown}` | per-instance memo, D8-compliant ✓ |
| 13 | RenderModel | `chart.component.ts` push* → `domain/chart/render-model.ts` | `Partial<RenderModel>` | immutable DTOs across the Angular↔engine boundary ✓ |
| 14 | Chart | `domain/chart/chart-engine.ts:180-218` → capabilities | lightweight-charts | `toDisplayTime` applied at the last moment ✓ |

#### TD-X1 — The pipeline treats server-clock epochs as UTC; the app agrees **by construction, not by contract**
- **Severity** Medium (currently correct; undefended) · **Class** contract hazard, not a live bug
- **Evidence**
  - `pipeline/parquet_builder.py:56-59` — `resample_anchors` docstring: *"``time`` (int64, epoch
    segundos **UTC**)"*; `pipeline/parquet_builder.py:100-104` — ten lines later,
    `descartar_vela_en_formacion`: *"epoch segundos, **hora del servidor**"*.
    **The two docstrings contradict each other about the same column.**
  - `pipeline/parquet_builder.py:70` `pd.to_datetime(df_m1["time"], unit="s", utc=True)`;
    `:139` M1 partition year from `.dt.year` on those same UTC-read stamps.
  - App: `domain/chart/display-time.ts:4-13` states unambiguously that stored timestamps are the
    broker server clock (NY+7 h), **not** UTC, and that converting at rest *"would cut every daily at
    20:00 ET and break the R2 parquet contract"*.
  - App: `services/market-data-db.ts:76-83` `Date.UTC(y,0,1)/1000`;
    `services/timeframe-generator.ts:41-42` `Math.floor(c.time / bucketSec) * bucketSec` — both read
    the epoch as UTC too.
- **INTERPRETATION** both sides apply "read the epoch as if it were UTC", so D1 buckets, H4 boundaries
  and M1 year partitions all align on the server clock — exactly the MT5/TradingView convention.
  **The system is correct.** But it is correct because two codebases independently made the same
  reinterpretation, documented in **opposite terms**, with **no shared artefact asserting it**. Blast
  radius is total: mis-bucketed dailies / mis-partitioned years are invisible at every layer (no
  validation exists — S12) and would silently corrupt every backtest.
- **Recommendation** (1) fix the contradictory docstring; (2) state the invariant once in
  `docs/engineering/domain/data-pipeline.md`; (3) add a cross-side conformance test (a fixture whose
  known server-clock D1 boundary is asserted by both `pipeline/tests` and `timeframe-generator.spec.ts`);
  (4) emit the clock convention into the manifest as a version field so the app can refuse an
  incompatible dataset. **Difficulty** Low (docs + tests).

#### TD-X2 — Parquet↔worker column contract is by-name at runtime only; time units differ at the session boundary
- **Severity** Low–Medium
- **Evidence** `pipeline/parquet_builder.py:32-40` fixes `time:int64, o/h/l/c:float64`;
  `workers/candles-writer.ts:32-46` does `table.getChild('time')` with a single runtime `throw` on a
  **missing** column — a **retyped** column (float64 `time`, or milliseconds) is silently
  `Number(...)`-coerced. `services/session.service.ts:41-56` documents
  `startRange`/`endRange`/`replayTime` as **epoch MILLISECONDS** while `yearsInRange(fromSec, toSec)`
  (`:99-107`) and everything internal use **seconds** — two units in one 60-line file.
- **Recommendation** assert Arrow field *types* + a sanity range check on `time`; brand
  `EpochSeconds`/`EpochMillis` at the session-file boundary. **Difficulty** Low.

#### TD-X3 — `TimeframeGenerator` is a dead second implementation of timeframe generation
- **Severity** Low · **Evidence** `services/timeframe-generator.ts:59-79` (`@Injectable`,
  `getCandles(symbol, tfMinutes)` reading from the repository);
  `grep -rn "TimeframeGenerator" --include=*.ts` excluding specs → **only its own declaration, zero
  consumers**. The live path is `state/market/custom-timeframe.ts:generateCustomSeries` (aggregating
  the in-memory NgRx series), which imports `aggregateCandles` from this same file.
- **Recommendation** delete the class; keep `anchorFor`/`ANCHOR_MINUTES`/`aggregateCandles` and move
  them next to `custom-timeframe.ts`. **Difficulty** Trivial.

#### TD-X4 — Ambiguous ownership: three actors write the `candles` store, one owns its schema
- **Severity** Medium (structural cause of TD-L4 and TD-D4)
- **Evidence** schema owner `services/workspace-db.service.ts:107-115`; writers
  `workers/candles-writer.ts:103-116` (insert) and `services/workspace-db.service.ts:377-399` (delete);
  reader `domain/indexed-db.repository.ts:73-95`. Three modules, two threads, one store — and the
  invariant that ties them (no duplicate `[symbol,timeframe,time]`) is enforced **nowhere**, only
  maintained by a clear-before-ingest convention in a **fourth** module
  (`services/market-data/data-onboarding.service.ts:133-141`).
- **Recommendation** enforce in the schema (unique compound keyPath, TD-D4 item 3) **or** name a
  single `MarketDataStore` owning all reads/writes to `candles`, exposed to the worker.
  **Difficulty** Medium–High.

---

### 6. Recommendation priority (RECOMMENDATION)
| # | Item | Why |
|---|---|---|
| 1 | **TD-L4** — `onblocked` + `onversionchange` on all IDB openers | Pre-armed silent deadlock; ~10 lines; blocks all future schema work |
| 2 | **TD-E1 + TD-E3** — diagnostics sink + persistence-health signal | Converts S1–S5 from silent-incorrect to observable; additive, zero behaviour change |
| 3 | **TD-E4 (S6)** — refuse LWW deletion on an unverified cloud list | The only path that destroys user data on a non-error |
| 4 | **TD-P1** — O(1) `applyForming` | One statement; removes ~1 M element-copies/s from autoplay |
| 5 | **TD-P4** — drop the redundant sort, page the candle read | Largest single UI stall in the app |
| 6 | **TD-D1** — one shared IDB adapter | Makes #1 a one-place fix forever |
| 7 | **TD-D4** — atomic dataset delete / idempotent ingest | Removes S7 and S8 entirely |
| 8 | **TD-X1** — write down + test the server-clock-as-UTC contract | Cheapest insurance against the highest-blast-radius corruption |

### What is genuinely well built (INTERPRETATION — for calibration)
- The `ChartModelMapper` memo architecture (`components/chart/chart-model-mapper.service.ts`) is the
  strongest code in this audit: per-instance slots, reference keys, frozen shared empties, and doc
  comments explaining the *pathology* each guard prevents. **Do not touch it.**
- The `setData`/`update` split with a 240-bar jump threshold + 12 000-bar window
  (`chart.component.ts:776-799`) is exactly right and documents the failure it prevents.
- `ChartEngine`'s echo suppression (`domain/chart/chart-engine.ts:46-166`) is verified against the
  library source and correctly separates the synchronous crosshair case from the RAF-deferred range case.
- Read-time schema lifting is a better migration strategy than upgrade-time rewriting here, and it is
  applied consistently.
- Capability `destroy()` coverage is complete and idempotent across all four capabilities.
- `assertNoCandles` as defense-in-depth on four independent write paths enforces kernel invariant 4
  where it actually matters.

---

## RESUME BRIEF

*(Self-contained. A fresh agent with zero conversation history can paste this and continue.)*

### (a) Role and remaining scope
You are a Principal Engineer performing a **READ-ONLY** technical-debt audit of the
`trading-emulator` repository at `C:\Users\78701\Desktop\trading-emulator`, branch `develop`,
HEAD `a2ca53b`. You own the **Performance, Resource Lifecycle, Error Handling, Persistence &
Data-Pipeline** slice: (1) hot-path performance, (2) resource lifecycle & leaks, (3) error handling &
resilience, (4) persistence/IndexedDB, (5) data-pipeline boundaries.

**Rules.** READ-ONLY on all repository source. The **only** writes permitted are files under
`C:\Users\78701\Desktop\trading-emulator\.superpowers\audit-2026-08-10\` (untracked, survives session
resets). Every claim needs `path/to/file.ts:line` evidence. Counts must be generated mechanically —
never invented. Separate **MEASURED FACT / INTERPRETATION / RECOMMENDATION**. Classify every
performance finding as **PROVEN ISSUE** / **HIGH-RISK HOT PATH** (state the trigger) /
**PREMATURE OPTIMIZATION** (say so plainly). Do not trade readability for micro-optimization.

App code lives in `emulador/src/app` (NOT repo-root `src/`). Angular 21 + NgRx 21 + Zone.js,
lightweight-charts 5.2, parquet-wasm 0.7 → IndexedDB, Cloudflare R2, Supabase sync, Python pipeline
in `pipeline/`. Bundle 648 kB vs a 500 kB budget is **known-accepted** (Arrow/parquet dominated) — do
not re-litigate. Dataset download being IndexedDB-insert-bound (~700 s/M candles) is a **known past
finding**; pipelining was REJECTED.

**The audit above is ~95% done.** The report body is complete and should be preserved verbatim; only
the items in "AREAS PARTIAL" remain.

### (b) Commands already run (do NOT re-run) with their key numeric outputs
All from `C:/Users/78701/Desktop/trading-emulator/emulador/src/app`, `*.spec.ts` excluded via
`| grep -v "\.spec\.ts"`:
- `git log --oneline -1` → `a2ca53b Merge pull request #56 …`; `git status --short` → only
  `?? .superpowers/rfc-020/`
- `find emulador/src/app -name "*.ts" ! -name "*.spec.ts" -printf "%s\t%p\n" | sort -rn` → largest:
  `lotaje/lotaje-view.ts` 67 313 B, `components/chart/chart.component.ts` 65 440,
  `pages/sesiones/sesiones-page.component.ts` 49 353, `services/session-sync.service.ts` 35 017,
  `components/chart/chart-model-mapper.service.ts` 34 783, `state/selectors.ts` 31 293
- `grep -rn "\.setData(\|\.update("` → **1** real `setData` (chart-engine.ts:212); **2** `series.update`
  (chart.component.ts:805, 846); the rest are Angular signal `.update()` / `dataTransfer.setData`
- `grep -rn "addEventListener("` → **38**; `removeEventListener(` → **22**
- `setTimeout(` → **6** real sites; `clearTimeout(` → **3**; `setInterval|clearInterval` → **0**;
  `requestAnimationFrame|cancelAnimationFrame` → **0**;
  `new ResizeObserver|MutationObserver|IntersectionObserver` → **0**;
  `createObjectURL|revokeObjectURL` → **3 / 3**; `new Worker(|\.terminate()` → **1 / 1**
- `grep -rn "} catch"` → **48**; `"} catch {"` → **35**; `"} catch ("` → **13**;
  `catchError(() => EMPTY|of(|from([)` → **13**
- `grep -rn "console\.(log|warn|error|debug|info)"` → **0**
- `grep -rln "@Component"` → **61**; `grep -rln "ChangeDetectionStrategy.OnPush"` → **28**
  (33 without — the full list is in TD-P7)
- `grep -rn "indexedDB.open"` → **6** sites; DB names → 4 (`emulador-workspaces`, `-telemetry`,
  `-playbook`, `-lessons`); `grep onblocked` → **0**
- `grep -rn "structuredClone|JSON.parse(JSON.stringify"` on candle paths → **0**
- `grep -rn "cdk-virtual|VirtualScroll"` → **0**; `@for (` → **23**
- `grep -rn "clearDatasetCandles"` → definition `services/workspace-db.service.ts:377`; callers
  `data-onboarding.service.ts:136`, `storage-manager.service.ts:52`; specs at
  `workspace-db.service.spec.ts:530, 566-624`
- `grep -rn "TimeframeGenerator"` (non-spec) → only its own declaration ⇒ dead
- `grep -rn "getCandles|MarketDataRepository|getCoverage"` → consumers listed in TD-P4
- `node -e` on `emulador/package.json` → Angular ^21.2.0, @ngrx ^21.1.1, lightweight-charts ^5.2.0,
  parquet-wasm ^0.7.1, apache-arrow ^21.1.0, rxjs ~7.8, vitest ^4.0.8, fake-indexeddb ^6.2.5

### (c) Files read in full or in part, and the conclusion for each
| File | Conclusion |
|---|---|
| `components/chart/chart.component.ts` (1–450, 450–1070, 1150–1694) | Render loop, push* methods, listener balance, ngOnDestroy. **TD-P1, TD-P2, TD-P7**; listeners balanced |
| `components/chart/chart-model-mapper.service.ts` (full) | Memo lattice is **correct** — explicitly a non-finding / PREMATURE class |
| `state/selectors.ts` (full) | All memoized, no factory selectors; D8 respected. No finding |
| `state/replay/replay.effects.ts` (full) | Autoplay via rxjs `interval` inside `switchMap` (self-tearing-down); `foldForwardFills` ⇒ **TD-P6** |
| `state/trading/trading.effects.ts`, `trading.reducer.ts:283-312`, `fill-engine.ts:298-370, 444-480` | Per-base-candle actions + ≥6 allocs/candle ⇒ **TD-P6**; binary searches are optimal (PREMATURE) |
| `domain/chart/chart-engine.ts` (full) | `forEach` fan-out ⇒ **TD-P2**; echo suppression is excellent; `destroy()` complete |
| `domain/chart/capabilities/*.ts` | `TradingCapability` prologue outside its memo ⇒ **TD-P3**; all `destroy()` correct |
| `domain/chart/display-time.ts` (full) | `Date` alloc per candle for `utc-fixed` zones ⇒ **TD-P5** |
| `domain/chart/time-coordinates.ts`, `capabilities/trade-boxes-primitive.ts` | `setSource → requestUpdate` per push; `computeScreenBoxes` O(boxes × log W). Acceptable |
| `state/market/forming-candle.ts`, `custom-timeframe.ts`, `services/timeframe-generator.ts` | Aggregation is fine; `TimeframeGenerator` class is dead ⇒ **TD-X3** |
| `services/workspace-db.service.ts` (full) | **TD-D2**, **TD-D4**; `clearDatasetCandles` **FIXED** ⇒ **TD-D3** |
| `services/market-data-db.ts` (full) | `partitionTimeBounds` correct; fallback caveat noted in TD-D3 |
| `domain/indexed-db.repository.ts` (full) | **TD-P4**, **TD-L4** |
| `workers/parquet.worker.ts`, `workers/candles-writer.ts` (full) | Chunked insert 50 000/tx; no type validation ⇒ **TD-X2**, S8, S12 |
| `services/market-data/data-onboarding.service.ts` (full) | Non-atomic 3-phase ⇒ **TD-D4**; reentrancy silent no-op ⇒ S9 |
| `services/market-data/parquet-download.service.ts`, `manifest.service.ts:1-60` | Throws properly ⇒ S14 correct; no retry/backoff (documented) |
| `services/session-sync.service.ts` (1–120, 255–555) + `session-sync.mapping.ts` (mergeByLww, assertions) | **TD-E4/S6**, S4, S5, **TD-P8** |
| `services/telemetry-db.service.ts` (full) | **TD-L5**, S10 |
| `services/playbook-db.service.ts`, `lessons-db.service.ts` (open paths) | Duplicated adapters ⇒ **TD-D1** |
| `state/workspaces/workspaces.effects.ts` (1–360) | **TD-E3**, S1, S2, TD-D5 |
| `components/workspace/chart-panel.component.ts` (440–581), `chart-sync-router.ts` (full), `workspace-viewport.component.ts` (grep) | Registry/bus/router lifecycle balanced except **TD-L3** |
| `services/session.service.ts` (1–140) | S17 correct; ms-vs-s unit split ⇒ **TD-X2** |
| `services/journal-data.service.ts` (cache region) | Cache evicts on failure; `clear()` exists. Not a finding |
| `pipeline/parquet_builder.py` (full) | **TD-X1** — contradictory docstrings, server-clock-as-UTC |
| `app.config.ts`, `main.ts`, `angular.json` (budgets) | Zone.js default (no zoneless) ⇒ TD-P7; 11 feature reducers ⇒ TD-P6; budget confirmed known-accepted |

### (d) Dead ends and confirmed NON-issues (do not re-investigate)
- **`clearDatasetCandles` all-years bug: FIXED.** The memory note is stale. See TD-D3 for the proof.
- `chart.component.ts` listeners: **balanced** — 7 add / 7 remove, and the drag `mousemove` is removed
  in both `endDrag` and `ngOnDestroy`. Not a leak.
- `setInterval` leaks: none exist (0 sites); autoplay uses rxjs `interval` inside `switchMap`.
- `requestAnimationFrame` leaks: none in app code (all library-internal).
- `URL.createObjectURL`: 3/3 balanced.
- Web Worker lifecycle: one per batch, terminated in `finally`. Correct.
- `structuredClone` / JSON round-trips on candles: **none**. Candles live in NgRx by reference.
- Capability `destroy()` coverage: complete and idempotent across all four.
- The `ChartModelMapper` memo strategy: **already correct**; classified PREMATURE. Do not "optimize" it.
- `setData` vs `update`: correctly split with a documented 240-bar threshold. Not a finding.
- NgRx dev-mode `runtimeChecks` deep-freeze: one-time cost (freezer short-circuits on frozen values),
  dev-only. Investigated and dismissed.
- Binary searches (`snapToCandle`, `lastIndexAtOrBefore`, `firstIndexAtOrAfter`),
  `aggregateFormingCandle`'s loop, `selectTradeMarkers.sort()`: all PREMATURE. Dismissed on purpose.

### (e) ORDERED remaining steps
1. Read `state/telemetry/telemetry.effects.ts` in full (23 kB). Check its own error handling, the
   `setTimeout(…, 0)` at `:231` (comment claims it is a macrotask ordering guard — verify it is
   cleared or intentionally fire-and-forget), and whether `void this.telemetryDb.append(...)` at
   `:519` can reject via `assertNoCandles` (`services/telemetry-db.service.ts:171`) ⇒ unhandled
   rejection. Add to TD-L5 / the S-table if confirmed.
2. Read `lotaje/lotaje-view.ts` teardown (search `capturedMountGeneration`, `currentRoot`,
   `currentDoc`, `unmount`) and `lotaje/companion-window.ts` around `:171-300`. Confirm or refute the
   "GC'd with the nodes" INTERPRETATION in TD-L1 and settle `companion-window.ts:274`.
3. Read `pipeline/manifest.py` and `pipeline/r2_uploader.py`; verify the manifest shape the app
   assumes at `services/market-data/manifest.service.ts:35-41` (`{version, symbols:{sym:{tf:{part:
   {size,etag,updatedAt}}}}}`) and that the `etag` written is the same one R2 returns. An etag
   mismatch would make every partition look permanently stale (endless re-download) or permanently
   current (never refreshed) — either is a silent-incorrect candidate. Also check
   `pipeline/update_r2.py` for the incremental-updater bugs named in memory
   (`r2-data-refresh-and-pipeline-defects`: MT5 cold-symbol, server hour).
4. Confirm whether Supabase/PostgREST applies a default row cap to
   `services/session-sync.service.ts:60-64` (`listSummaries`). If yes, **S6 escalates from HIGH-RISK
   to PROVEN data destruction.** Check the project via the Supabase MCP (`get_project`,
   `list_tables`, `execute_sql`) or the dashboard's API settings (`db-max-rows`).
5. Probe storage-quota behaviour: confirm nothing calls `navigator.storage.estimate()` or handles
   `QuotaExceededError` (already grepped → 0 hits) and decide whether TD-D2 should carry a dedicated
   quota finding rather than a sub-bullet.
6. Optional: verify TD-P1 empirically in the browser (the repo has a Supabase test identity
   `ai-account@gmail.com`; the owner must sign in once, then the persisted session carries later
   agent-driven page loads). Profile an autoplay run with 4 coarse panels and confirm the
   `renderedTimes` allocation shows up in the allocation timeline. Purely confirmatory — the finding
   already stands on code evidence.
7. Re-emit the final report to this same file, folding steps 1–5 in and moving any UNVERIFIED tag
   to MEASURED FACT.
