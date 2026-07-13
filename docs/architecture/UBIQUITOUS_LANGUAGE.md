# Ubiquitous Language

| Field | Value |
| :--- | :--- |
| Status | Normative (living document) |
| Date | 2026-07-09 |
| Stage | 1 of the Engineering Knowledge Roadmap |
| Upstream sources | `TRAINING_WORKFLOW.md`, `strategic_audit.md`, `docs/engineering/domain/*.md`, `emulador/src/app/state/trading/*.ts` |
| Downstream consumers | `DOMAIN_MODEL.md`, `EVENT_STORMING.md`, `ARCHITECTURE_VISION.md`, all future RFCs |

---

## 1. Purpose and Normative Status

This document is the single authoritative glossary of the Trading Emulator domain. Every
term defined here carries three obligations:

1. **Code obligation.** Identifiers in production code, NgRx actions, and persisted
   schemas must use these terms (or their documented code anchors), never ad-hoc
   synonyms.
2. **Documentation obligation.** RFCs, specs, plans, and audits must use these terms
   with exactly the meaning defined here. A document that needs a new meaning must first
   amend this glossary.
3. **Strategy-neutrality obligation.** The language stays free of trading-methodology
   vocabulary (see Section 11). The emulator is a bounded context of *deliberate
   practice simulation*, not a strategy engine; what constitutes a valid setup lives in
   the trader's head, never in the domain model.

Authority: this glossary sits below the frozen decisions of the RFC corpus and
`CLAUDE.md` invariants and above local naming judgment. Conflicts resolve upward per
`docs/engineering/PHILOSOPHY.md` Section 3.1.

Convention used below: each entry gives a definition and a **technical implication** — the
code or schema anchor that makes the term executable rather than aspirational.

---

## 2. Training Domain (Cognitive Cycle)

The training domain describes trader behavior technology-agnostically. Its source of
truth is `docs/architecture/TRAINING_WORKFLOW.md`, which is written in Spanish; the
canonical bilingual mapping is:

| English canonical term | Spanish original |
| :--- | :--- |
| Deliberate Practice Session / Deliberate Learning Simulation | Simulación de Aprendizaje Deliberado |
| Active Waiting | Espera Activa |
| Operative Window / Temporal Operative Filter | Ventana Operativa / Filtro Temporal Operativo |
| Zone of Interest / historical value boundary | Zona de Interés / Límites de valor histórico |
| Directional Hypothesis | Hipótesis Direccional |
| Setup Confirmation | Espera Activa de la Confirmación del Setup |
| Position Management | Gestión de la Posición |
| Asymmetric Trade Management | Gestión Asimétrica del Comercio |
| Risk Invariance (Initial) | Invarianza del Riesgo Inicial |
| Geometric Tolerance Profile | Perfil de Tolerancia Geométrica |
| Cognitive Context Shift | Cambio de Contexto Cognitivo (Timeframe Shift) |
| Minor Structural Break | Ruptura estructural menor |
| Macro / Operating / Simulation Sub-timeframe | Timeframe Macro / Timeframe Operativo / Sub-timeframe de Simulación |

**Deliberate Practice Session.**
One bounded exercise of the training loop: parameter definition, context construction,
active waiting, setup confirmation, execution, management, registration. The emulator as
a whole is the bounded context of *deliberate learning simulation*.
*Technical implication:* materialized as the `Session` lifecycle (creation with symbol +
historical range, replay, archive). The financial substate is `TradingData`
(`state/trading/trading.models.ts`).

**Practice Parameters.**
The asset and historical time range selected to isolate the variable under study.
*Technical implication:* session creation inputs; they determine `requiredDatasets` and
the replay clamp boundaries.

**Macro Context Construction.**
The analysis phase answering *where is price relative to its past, and what structure
dominates*. Complete when Zones of Interest are delimited and a Directional Hypothesis
exists, before time advances.
*Technical implication:* supported by drawings on the Macro Timeframe panel; the system
must not require any trade action to exist before time can advance.

**Zone of Interest** (also: historical value boundary).
A price region where the trader expects relevant interaction. This is the deliberate
abstraction over all methodology-specific concepts (support/resistance, supply/demand,
order blocks).
*Technical implication:* represented only as geometric drawings owned by the Session
aggregate; the domain never interprets a zone semantically.

**Directional Hypothesis.**
The trader's working assumption about probable direction, formed during macro analysis.
Abstraction over "bullish/bearish bias".
*Technical implication:* not represented in state by design; it exists in the trader's
head and, in future journaling work, as annotation data — never as an input to the fill
engine.

**Active Waiting.**
The dominant cognitive state of the simulation: commercial decision-making is suspended
while time advances rapidly, filtering out non-operative periods. The discovered domain
invariant is *asymmetric speed*: very fast during waiting, slow or intrabar-controlled
during evaluation.
*Technical implication:* the Playback HUD must support asymmetric navigation (auto-repeat
stepping, jump sizes 5/10/50) and, in future work, condition- or window-based fast
advance. Any feature that forces uniform-speed replay violates this concept.

**Operative Window** (also: Temporal Operative Filter).
The recurring time-of-day/volatility window in which the strategy under practice is
valid. Generalization of trader-specific preferences (e.g. New York morning): *useful
simulation time is defined by the window that maximizes the conditions required by the
strategy under test*.
*Technical implication:* currently manual (the trader fast-forwards); a first-class
window filter is future roadmap material. Any implementation must remain
strategy-neutral (a time filter, not a signal).

**Setup Confirmation.**
The evaluation state entered when price interacts with a Zone of Interest inside the
Operative Window: the trader slows down to the Operating Timeframe (or intrabar
resolution) and either confirms and executes, or observes invalidation and returns to
Active Waiting without acting.
*Technical implication:* requires low-grain stepping (Replay Resolution) so a forming
candle can be observed progressively.

**Position Management.**
The post-entry state: TP may be adapted to revealed structure; SL is never widened. See
Asymmetric Trade Management (Section 5).

**Registration and Re-evaluation.**
Session results are stored structurally to feed a-posteriori statistical analysis.
*Technical implication:* `ClosedTrade[]` history plus `computeSessionStats`
(`fill-engine.ts`); the classification axes are asset identity, entry nature
(passive limit vs. active stop), and Geometric Tolerance Profile.

**Geometric Tolerance Profile.**
The permitted SL distance (in points), which determines a trade's resilience to noise.
One of the three conceptual archive axes.
*Technical implication:* derivable from `entryPrice` and `sl` on every
`PendingOrder`/`ClosedTrade`; no dedicated field exists yet.

**Cognitive Context Shift** (Timeframe Shift).
Changing chart resolution is a mechanism for loading/unloading attention, not a visual
convenience. Macro information is deliberately blocked when focusing on the trigger.
*Technical implication:* panels are analytically decoupled by default; spatial
synchronization (crosshair) is an intermittent, on-demand bridge (Link Groups,
RFC-010) — never forced globally.

**Minor Structural Break.**
Strategy-neutral abstraction over methodology terms for small structure violations (BOS,
CHoCH). Used only descriptively in training documents; never modeled.

---

## 3. Timeframe Hierarchy

**Macro Timeframe** (Context).
Answers *where are we situated and interacting*. Active cognition: overall structure,
historical trends, major zones, directional bias formation. Discarded cognition:
individual-candle detail.

**Operating Timeframe** (Trigger).
Answers *is the pattern confirming here and now*. Active cognition: individual candle
closes at execution resolution, exact risk/reward geometry of the order. The timeframe
on which entries are decided.

**Simulation Sub-timeframe** (Resolution).
Answers *how is the operating candle internally forming*. Intrabar dynamics observed
while the displayed candle builds progressively.
*Technical implication:* the **Replay Resolution** mechanism, implemented in state:
`ReplayState.resolutionMinutes` (null = full-candle stepping), the
`setReplayResolution` action, and the `selectResolutionSeries`/`selectFormingCandle`
selectors that build the progressively forming display candle from revealed
resolution candles. The displayed TF stays fixed while the advance grain is any
standard divisor with data (H1 stepped at M1, M15 at M5); progress reads as a time
range (`09:37 / 10:00`). An incompatible TF change resets resolution; resolution
persists in the session payload as an optional backward-compatible field.

**Base Resolution.**
The finest-grained series available for a symbol, used for execution truth. M1 is the
pipeline ground truth; H1/D1 are pipeline conveniences; all other TFs derive client-side.
*Technical implication:* **the realism invariant** — fills, SL, and TP always evaluate at
base resolution, never at the displayed timeframe, because an intra-candle spike must
not be averaged away. Implemented by RFC-014 as the **Execution Series** below;
`processCandle(book, candle, subCandles, …)`'s `subCandles` walk survives only as the
legacy fallback (no execution series loaded) and for STOP-protected pre-existing specs.

**Execution Series** (RFC-014 D14.A).
The finest LOADED series for the session's `primarySymbol` — the runtime instance of
Base Resolution. Always fed to the fill engine, independent of the displayed
timeframe and the chosen Replay Resolution; session creation already guarantees the
anchor datasets (`requiredDatasets`) are present locally, so resolving it is a plain
IndexedDB read, never a network one.
*Technical implication:* `selectExecutionSeries` (`state/selectors.ts`).
`foldForwardFills`/`processFills$` dispatch exactly one `Process Candle` per base
candle strictly crossed, in chronological order, with `subCandles: null`, when it's
loaded; Last Processed Time (Section 4) advances base-granular as a result. Falls
back to the legacy per-resolution-candle path only when unloaded (mock-only sessions
in practice).

**Sub-candle.**
A candle of a lower timeframe contained within the interval of a displayed (parent)
candle. The unit the fill engine walks to establish intrabar event order.
*Technical implication:* `subCandles: Candle[] | null` in `processCandle`; sliced via
`sliceRange` over `[candle.time, nextCandle.time)`.

**Custom Timeframe.**
A client-derived series aggregated from the best available base series.
*Technical implication:* `state/market/custom-timeframe.ts`
(`generateCustomSeries`/`pickBaseSeriesTf`) and `services/timeframe-generator.ts`
(`aggregateCandles`). Never rebuild this machinery.

**Session Timeframes.**
The set of timeframes that actually have data for the session. UI timeframe lists must
derive from it, never from a static ordered list.
*Technical implication:* the `selectSessionTfs` selector is the only legitimate source.

---

## 4. Replay Context

**Replay Cursor** (also: replay clock).
The single global simulation timestamp. There is exactly one; everything else projects
from it.
*Technical implication:* `replay.currentTime` (UTC seconds). Each panel/timeframe finds
its candle by at-or-before-T binary search (`selectReplayIndex`,
`lastIndexAtOrBefore`). One clock fanned out to N panels is what made multi-panel replay
(RFC-010) a fan-out problem rather than a rewrite.

**Step.**
Advancing the cursor by one candle of the advance grain, auto-repeat capable. Forward
motion processes fills: `advanceCandle` reveals one resolution candle;
`advanceDisplay` snaps to the next display-TF candle, folding fills over every
resolution candle crossed (`foldForwardFills`, `replay.effects.ts`). `stepBack` snaps
back on the display grid and is review-only: backward motion never simulates nor
unwinds fills (see Last Processed Time).

**Jump.**
Advancing or retreating by the configured jump size (`ReplayState.jumpSize`, default
10). `jumpForward` processes fills for every crossed resolution candle and clamps to
data/session end; `jumpBack` is review-only (no fills).

**Seek** (teleportation).
Scrubber navigation to an arbitrary time. Frozen semantics: seek does **not** simulate
fills for the skipped range. It is a viewing teleport, not a fast-forwarded market.
*Technical implication:* `seekTo` bypasses the fill pipeline by design; any change to
this is a frozen-decision revocation, not a bug fix.

**Freeze-on-Last.**
Gap-handling semantics for symbols whose data lacks candles at the cursor time: the
panel keeps showing its last at-or-before candle rather than desynchronizing.
*Technical implication:* covered by `fill-engine.freeze-on-last.spec.ts` and the
projection semantics of `selectReplayIndex`.

**Fill Context.**
The derived slice of state handed to the fill engine on each advancement: revealed
candle, sub-candle series, and book.
*Technical implication:* `selectFillContext`, deliberately layered over
`selectReplaySeries`/`selectReplayIndex` so it can be redefined without rewriting
`processFills$` (extending selectors beats rewriting effects).

**Last Processed Time.**
High-water mark of candle time already evaluated by the fill engine; the idempotence
anchor that makes stepping back and forth safe. BASE-GRANULAR since RFC-014 (see
Execution Series, Section 3): it advances one base candle at a time, independent of
the displayed TF or Replay Resolution.
*Technical implication:* `TradingData.lastProcessedTime`; together with
placement-candle exclusion (`c.time <= o.createdAt`) and open-time guards
(`candle.time < p.openTime` skips), re-processing a candle never time-travels fills or
exits.

---

## 5. Simulation / Trading Context

**TradingBook.**
The mutable financial book the engine operates on: balance, pending orders, open
positions, closed history. The Aggregate Root of the Simulation context.
*Technical implication:* `TradingBook` interface in `fill-engine.ts` (a subset of
`TradingData`); mutated only through pure engine functions (`processCandle`,
`closeSession`) invoked from thin effects.

**Pending Order.**
A limit or stop order waiting to fill. Carries its full risk definition at placement
time.
*Technical implication:* `PendingOrder` (`trading.models.ts`): `side`, `type`
(`limit`/`stop`), `entryPrice`, `sl`, `tp` (nullable), `lots`, `riskPct`, `riskUsd`,
`createdAt` (candle time at placement).

**Position.**
An open exposure produced by a fill (or market order). Preserves `origin` (the order
type that created it) and `openTime`.
*Technical implication:* `Position` (`trading.models.ts`).

**Fill.**
The event of a pending order converting into a position because the revealed candle's
range touches its entry under the order-type rule, SIDED per RFC-014 §2: buy
limit/stop compare against the derived Ask, sell limit/stop stay Bid (see Ask
Derivation, below). Limit fills are clean (execution exactly at the recorded entry
level); stop fills additionally slip against the trader (deterministic, RFC-014 §2).
With `ExecutionCosts` absent or `{0,0,0,1}` every fill degenerates bit-for-bit to the
pre-RFC-014 clean-fill behavior (V-1).
*Technical implication:* `orderFills(o, c, costs)` in `fill-engine.ts`; stop-entry
slippage applied via `slip()`.

**Placement-Candle Exclusion.**
Rule: an order can only fill on candles strictly after its placement candle
(`c.time <= o.createdAt` returns false). Rationale: idempotent reprocessing and
prevention of hindsight fills on the candle the trader was looking at.
*Technical implication:* `o.createdAt` is no longer the raw replay cursor time — see
**Reveal Horizon** below (RFC-014 D14.B). At base-grain stepping the two coincide, so
the pre-RFC-014 semantics hold unchanged in that mode; RFC-014 resolves the
same-candle-latency fidelity gap this entry used to disclose.

**Reveal Horizon** (placement horizon).
The time of the LAST base candle actually revealed to the trader within the cursor's
current replay-resolution bucket `[cursorTime, cursorTime + tfSeconds)` — the point
at which `PendingOrder.createdAt` is stamped (RFC-014 D14.B), instead of the raw
replay cursor. FORCED by the no-hindsight half of the Placement-Candle Exclusion once
execution runs at Base Resolution: stamping the raw cursor would let an order fill on
base candles inside the SAME still-forming display candle the trader has not yet
seen. Coincides with the cursor time exactly at base-grain stepping (resolution ===
base), reducing to pre-RFC-014 semantics unchanged in that mode.
*Technical implication:* `selectPlacementTime` (`state/selectors.ts`), composed from
`selectExecutionSeries`/`selectCurrentTime`/`selectReplayTfSeconds`; falls back to
the raw cursor time when no execution series is loaded or it has not reached the
current bucket yet.

**Execution Costs.**
The per-trade cost model applied by the engine: Bid/Ask spread (in points), a flat
per-lot round-turn commission, and deterministic adverse slippage on stop-type
executions (RFC-014 §2). A value object, threaded explicitly into
`processCandle`/`closeTrade` — the engine never reads config (I-10).
*Technical implication:* `ExecutionCosts` (`state/trading/execution-costs.ts`):
`{spreadPoints, commissionPerLot, slippagePoints, pointSize}`. `ZERO_COSTS`
(`{0,0,0,1}`) degenerates every sided predicate/price to the pre-RFC-014 behavior
bit-for-bit (V-1 anchor). `COST_PRESETS` gives starting defaults per asset class
(Forex/Índices/Metales/Cripto — STARTING DEFAULTS, not a live broker feed);
`costPresetFor(symbol)` resolves one (unclassifiable symbols get `ZERO_COSTS`, never
a guess), `effectiveCosts(preset, override)` merges the new-session dialog's
per-field override (`pointSize` is never user-editable — always symbol-resolved).
`TradingData.executionCosts: ExecutionCosts | null` persists the session's effective
costs (`null` = legacy zero-cost session; NgRx `createFeature` rejects optional
feature-state props, so this is required-but-nullable, the same idiom as
`sessionEnd`/`sessionName`/`folderId`).

**Ask Derivation.**
Series are stored Bid (MT5 bar convention). The Ask side is derived, never stored:
`Ask(t) = Bid(t) + spreadPoints·pointSize`. Buys execute at the derived Ask; sells
execute at Bid (spread-invariant).
*Technical implication:* `toAsk(bid, costs)` (`state/trading/fill-engine.ts`) is the
SINGLE conversion point every sided predicate/price in the engine goes through
(fills, SL/TP exits, MAE/MFE excursions, Floating Equity's mark-to-market). Costs
absent or zero spread returns `bid` unchanged.

**SimulationDomain.**
The order-lifecycle law as a pure named module (RFC-014 Task 4a): I-14 Order
Geometry Coherence and I-15 SL Non-Widening, extracted so the reducers invoke a
named, independently testable function instead of embedding the check inline — no
new framework concepts, a named home for logic that used to live inline.
*Technical implication:* `state/trading/simulation-domain.ts`
(`validateOrderGeometry`, `validateSlModification`); wired into
`openMarket`/`placeOrder`/`modifyOrder` (I-14, the RESULTING geometry) and
`modifyPosition` (I-15) in `trading.reducer.ts`. An invalid action returns
reference-identity state (no mutation, no throw, no modal) — S2 minimal feedback.

**Exit Decision.**
The resolution of whether and how an open position leaves the market within a candle:
`sl` or `tp`, at which price, and whether the resolution was ambiguous.
*Technical implication:* `resolveExit(p, candle, subCandles, fromSubIdx)`. With
sub-candles available the engine always walks them sequentially from the fill index; the
parent-candle envelope is only a fast path (no touch at all) or a fallback (no lower
series).

**Ambiguous Exit** (pessimistic resolution).
An exit where SL and TP both lie inside the finest available candle, or where a freshly
filled position has no sub-candles to order events. Resolved pessimistically as SL-first
and flagged.
*Technical implication:* `ExitDecision.ambiguous`, surfaced as `ClosedTrade.ambiguous`
and counted in `SessionStats.ambiguousCount`. Statistical reports must disclose the
ambiguous count; a simulation whose ambiguity is invisible is a simulation that lies.

**Phantom Stop** (defect term, historical).
The former defect class in which pre-fill price action inside the parent candle
triggered the SL of a position that did not yet exist. Fixed by making the sub-candle
walk mandatory from the fill index onward; regression-locked.
*Technical implication:* regression spec `"a freshly filled order ignores SL hit before
the fill index"` in `fill-engine.spec.ts`. The term is reserved for this defect class in
audits and must not be diluted.

**Risk Invariant** (Initial Risk Invariance).
The per-trade risk (percentage or currency) is a constant decided before entry; position
size is the *dependent* variable derived from the geometric distance between entry and
SL. Lot size is never a free user input.
*Technical implication:* `lotsForRisk(balance, riskPct, entryPrice, sl, contractSize)`
(`trading.models.ts`): `lots = (balance * riskPct/100) / (|entry - sl| * contractSize)`,
rounded to the 0.01 broker step, minimum 0.01. `riskUsd` is captured at placement and
defines 1R for the trade's lifetime.

**Asymmetric Trade Management.**
SL is immutable once the order is placed (survival rule, anti-emotional manipulation);
TP is dynamic and adaptable to revealed structure.
*Technical implication:* UI affordances must allow TP modification on open positions and
must not offer SL widening. (SL tightening toward break-even is a management action the
domain permits; widening is not.)

**R-Multiple.**
Trade result normalized by initial risk: `profit / riskUsd`.
*Technical implication:* `ClosedTrade.rMultiple`; `SessionStats.totalR` aggregates it.
The R-multiple, not raw currency, is the primary unit of practice analytics.

**Contract Size.**
Units per 1.0 lot, by symbol class: metals (XAU 100, XAG 5000), 6-letter FX pairs
100,000, index CFDs 1 point-dollar per lot.
*Technical implication:* `contractSizeFor(symbol)`; the old flat 100 fallback inflated
index P/L a hundredfold and is a named historical defect.

**Trade Outcome.**
How a closed trade ended: `'tp' | 'sl' | 'manual' | 'session-end'`.
*Technical implication:* `TradeOutcome` (`trading.models.ts`); `'session-end'` trades
count as *expired*, not won/lost, in statistics.

**Session End.**
Termination of the trading session: open positions close at the last visible price as
`'session-end'`; pending orders are discarded. May be manual or scheduled
(`sessionEnd` timestamp reached during replay).
*Technical implication:* `closeSession(book, price, time, contractSize)`;
`TradingData.sessionEnded`, `TradingData.sessionEnd`.

**Session Statistics.**
The derived performance summary of a session: totals, win rate over *decided* trades,
net profit, total R, profit factor, max drawdown (absolute and fractional), realized
equity curve, ambiguous count.
*Technical implication:* `computeSessionStats(history, initialBalance)`
(`fill-engine.ts`). Note: `balance` and the equity curve remain **realized-only** —
`computeSessionStats` never reads floating P/L. RFC-014 §3 adds a SEPARATE,
explicitly-named **Floating Equity** read model (below) alongside these; unqualified
"equity" in documents still means the realized figures here, never floating P/L
(Section 11).

**Floating Equity.**
`balance + Σ floatingPnL` of currently open positions, valued SIDED at the current
Base Resolution candle (long: Bid close; short: derived Ask close, Ask Derivation
above) — mark-to-market, unlike the realized-only `balance`/equity curve above. A
read model only: never persisted, never fed back into `balance`.
*Technical implication:* `selectFloatingEquity` (`state/selectors.ts`); no factory
selector (D8). Prices off the Execution Series' current base candle when loaded,
falling back to `selectCurrentReplayCandle` otherwise.

---

## 6. Market Data Context

**Candle.**
The atomic OHLC bar with `time` in UTC seconds. The only market-data primitive the
domain knows; there is no tick data in the system.

**Series.**
The sorted candle array for one (symbol, timeframe) pair. Sortedness is a precondition
of all binary-search projections.

**Dataset.**
An addressable unit of market data (symbol + timeframe + range) stored in R2 as Parquet
and cached in IndexedDB.
*Technical implication:* sessions reference datasets via the `requiredDatasets` summary
column — never by embedding candles (see Candle-Free Payload, Section 8). A
`RequiredDataset` is `{symbol, timeframe: AnchorTf, year?}` where
`AnchorTf = 'M1' | 'H1' | 'D1'` is the closed set of referenceable anchor timeframes
(`session.service.ts`); dataset record ids follow `${symbol}|${timeframe}|${year}`
(`market-data-db.ts`), while per-(symbol, TF) candle series keys follow
`${symbol}|${tf}` (`workspace-db.service.ts`).

**Coverage.**
The first/last availability bounds of local data for a symbol/timeframe, answerable
instantly without loading candles.
*Technical implication:* `MarketDataRepository.getCoverage` + `intersectBounds` (~24 ms
cursor reads). Availability questions must never trigger candle loads.

**Manifest.**
The R2 bucket's `manifest.json` describing published datasets; the contract between the
MT5 pipeline and the frontend.
*Technical implication:* schema documented in `pipeline/manifest.py` (pure, no network).

**Ground Truth (M1).**
M1 Parquet partitioned by year is the authoritative source series; everything else is
derived or convenience.

**Shared Candle Cache.**
The single per-symbol/timeframe candle store in IndexedDB (`emulador-workspaces`),
doubling as the cache all panels reference.
*Technical implication:* decision R4 — never introduce a second cache; candles are
shared by reference below the Session aggregate, never copied per panel.

---

## 7. Workspace / Presentation Context

**Session** (Workspace aggregate root).
The unit of user work: owns layout (tabs + single-level grid), link groups, and
per-symbol drawings. Two sessions on the same symbol are fully independent.
Candles sit *below* the aggregate, shared by reference.
*Technical implication:* RFC-011 `SessionPayloadV2`; sovereignty rules in
`docs/engineering/domain/workspace-panels.md`.

**Primary Symbol.**
The single tradeable symbol of a session (decision D1, mono-symbol). Trading state
exists only for it.
*Technical implication:* all other-symbol panels are **View-Only Panels**: strictly
analytical context, never touching trading state. Multi-symbol trading requires a new
RFC, not a tweak.

**Panel.**
One chart cell inside the grid, parameterized by `{symbol, tf, linkGroupId}`, deriving
its view through its own local `ChartModelMapper` instance (decision D8).

**Grid Template.**
The bounded layout topology: `'1' | '2h' | '2v' | '3' | '2x2' | '1+2' | '1+3'`, with
`MAX_PANELS_PER_TAB = 8` as a named hard cap. Free docking, BSP trees, and floating
windows are frozen non-goals.

**Parked Panel.**
A panel whose cell no longer fits the active template: kept mounted but hidden and
update-gated (zero render work), revealed again in its original slot when the template
grows. Template = lens, not blender: templates decide how many cells render, never
destroy them.

**Focused Panel.**
The panel bound two-way to the global market timeframe: focusing syncs the global TF to
the panel; global TF controls write the focused panel's TF. A panel's own selector is
panel-local by design.

**Link Group.**
An explicit, user-created synchronization group carrying `syncCrosshair` and
`syncTimeRange` channels; `syncPriceScale` is a reserved field with zero read sites
(audited to stay that way).
*Technical implication:* `ChartSyncRouter` fans out group-scoped with origin exclusion
and value-keyed idempotent application — the structural defense against echo loops.

**Drawing.**
A session-scoped geometric annotation, stored per symbol under the Session aggregate.
Drawings are the material form of Zones of Interest and other analysis; the domain never
interprets them.

**RenderModel / ChartEventBus / Capability.**
The only three things that cross the engine boundary: immutable view data in, events
out, behavior added as registered extensions. The engine imports no Angular and no NgRx,
ever.

---

## 8. Persistence and Synchronization Context

**SessionPayloadV2.**
The single atomic session payload: trading + layout + linkGroups + per-symbol drawings
in ONE last-write-wins cycle (decision D9). Never split into parallel synced objects —
partial sync equals corrupted workspace.

**Candle-Free Payload.**
Invariant: session payloads never embed candles; datasets are referenced via the
`requiredDatasets` summary column and reloaded from R2.
*Technical implication:* `assertNoCandles` runs before every upsert.

**LWW (Last-Write-Wins by client time).**
Conflict resolution keyed on `client_updated_at` (never server time), enforced by the
database `BEFORE UPDATE` trigger `lww_guard()` because the client library cannot express
the conditional upsert. Fix at the layer that can guarantee it.

**Dirty Tracking.**
`clientUpdatedAt > syncedAt` plus a pending-delete list; the offline catch-up mechanism.

**SavedSession.**
An archived session: full `TradingData` plus the replay cursor at archive time.
Lightweight by construction (candle-free).
*Technical implication:* `SavedSession` (`trading.models.ts`).

**Active Session Identity.**
`activeSessionId` is a first-class `TradingState` field equal to the cloud row id once
synced; it survives archive/switch/import so archiving reuses the cloud row instead of
minting duplicates. Session identity is stable across archive cycles — a hard-won rule.

**Session Folder.**
A flat (non-nested), cross-asset, user-defined grouping for sessions by strategy;
sessions reference folders by id; deletion sets references to null.

**Real Session (sync-eligible).**
Only sessions with financial substance sync to the cloud; scratch replay never
pollutes cloud storage.
*Technical implication:* the `isRealSession` predicate (`session-sync.mapping.ts`): a
session is real iff it has pending orders, open positions, or closed history, or a
custom name, or has ended.

**`.emul` Export.**
The lossless versioned session export format. The legacy `.session.json` (V1) is lossy
(drops open positions, `riskPct`, `sessionEnd`) and is human-exchange only — never a
sync or restore source of truth.

---

## 9. Knowledge Conservation Context

Source of truth: `TRADER_KNOWLEDGE_MODEL.md` (Phase 0 of the Mastery Block). These
terms are normative for RFC-014/015/016.

**Trader Knowledge Model.**
The foundational doctrine of learning conservation, resting on two stances:
**S1** — the system observes and conserves; the trader interprets (flight-recorder
neutrality: no schema may contain interpretive fields); **S2** — zero friction
during training (telemetry is passive and invisible; annotation exists only in cold
review, always optional).

**Trade Record.**
A `ClosedTrade` viewed through the knowledge lens: immutable physical evidence — a
fact, not knowledge by itself.

**Reflective Scene.**
A deterministic geometric-temporal reconstruction of one key trade moment (Entry,
Exit, Maximum Tension), existing only as a `SceneSpec` parameter tuple (datasets,
window, cursor, order geometry, drawings, telemetry markers) — never stored as an
image (invariant N-3: reconstruction over storage).

**Maximum Tension.**
The moment `tMAE` of a position's peak floating adverse excursion; the third
canonical scene.

**Permanent Lesson.**
Trader-authored heuristic or annotation, optionally amending Playbook rules; embeds
frozen scene evidence; survives deletion of all sessions and telemetry (invariant
N-4). The true product of training.

**Playbook.**
The trader's explicit set of rules under training. Trader-authored and opaque to
the system (never parsed, validated, or scored); permanent knowledge tier
(RFC-015 domain).

**Rule Declaration.**
Optional single-keystroke tagging of an opaque `declaredRuleId` onto the ACTIVE
order or position — post-placement, while the trade lives (Grill decision G2,
2026-07-10). The tag (e.g. `[R1]`) renders attached to the trade's chart label and
disappears when the trade closes; the fact persists on the record through the
identity chain. Keystrokes with no active trade do nothing. Recorded as fact;
adherence is never scored by the system.

**Black Box** (Raw Telemetry Register).
The append-only, session-scoped, local-only log of neutral physical events captured
passively during practice; outside `SessionPayloadV2` (D9 untouched), candle-free.
Per-session capped (drop-newest on overflow); writes are batched off the hot path
(N-2 passivity).
*Technical implication:* a DEDICATED IndexedDB database, `emulador-telemetry`
(`services/telemetry-db.service.ts`). **Deviation from the RFC-014 §4 text**, which
names the conceptual store `emulador-workspaces`: joining the shared database was
tried first and reverted, because `workspace-db.service.spec.ts` (pre-existing,
STOP-protected) hard-asserts the exact object-store count of that database. Keyed
`[sessionId, seq]`, append-only. Captured by `dispatch: false` NgRx effects
(`state/telemetry/telemetry.effects.ts`) — the audited sync-effect pattern, adding
zero domain behavior or write paths to trading state. Candle-Free Payload's
`assertNoCandles` (Section 8) is reused over the new store (V-9). V-8 (16 ms/frame
budget, N-2) measured 8.1–13.0 ms for a 69-event jump-50 burst in the test harness —
comfortably under budget (the jsdom test environment is itself a slower ~50 ms
bound).

**Telemetry Envelope.**
The uniform wrapper every captured fact is stored as:
`TelemetryEvent := { seq, wallClockMs, marketTime, kind, payload }`. `kind`/
`payload` are loosely typed at the storage boundary (`kind: string`, `payload:
object`) so the store's schema stays closed to modification — a new event kind is a
wider discriminated union at the call site, never a storage-layer change.
*Technical implication:* `TelemetryEvent`/`TelemetryEventV1`
(`state/telemetry/telemetry.models.ts`). The v1 kinds are `ReplaySeek`, `ReplayJump`,
`PlaybackToggled`, `SpeedChanged`, `TimeElapsedBeforeOrder`, `DrawingSnapshot`
(RFC-014 §4 table) plus `OrderFilled`/`PositionClosed` (the Reified Domain Facts,
below — the v1 set's natural completion, same envelope, no schema change).

**Reified Domain Fact.**
A fill or close event turned into a first-class, serializable record instead of
staying implicit in the resulting book/history diff — `OrderFilled` and
`PositionClosed` (RFC-014 Task 4b), closing EVENT_STORMING §8's points 1-2.
*Technical implication:* `DomainFact` union (`state/trading/domain-facts.ts`), built
by the engine during the walk as `ProcessResult.facts` (`state/trading/
fill-engine.ts`) — pure, additive (I-10), no new engine state. **D14.F
(binding):** `ProcessResult.facts` has NO state surfacing (`TradingState` carries no
facts field — NgRx `createFeature` rejects optional feature-state properties, and a
required field would break protected action-payload literals); it is a RESERVED
extension point (zero production read sites) for Fases 2-3. The telemetry observer
independently derives the same fact shapes by pairwise-diffing consecutive
`positions[]`/`history[]` snapshots (`diffDomainFacts`,
`state/telemetry/telemetry-facts.ts`), not by reading `ProcessResult.facts`.

**ReplaySeek** (telemetry fact).
`{fromTime, toTime, direction}` — the objective record of a scrubber teleport. The
register stores geometry, never labels (no `isBacktrack`, no honesty fields).
*Technical implication:* captured by `TelemetryEffects.replaySeek$` on
`ReplayActions.seekTo` only. **Known capture gap (RFC-014 closure deviation):** the
"go to date" teleport, and programmatic session-restore/CSV-start jumps, dispatch
`ReplayActions.goToTime` directly, bypassing `seekTo` — captured as neither
`ReplaySeek` nor a jump-arm-based `ReplayJump` (Jump, Section 4), and it does not
reset the `TimeElapsedBeforeOrder` order-clock anchor. Not fixed in the RFC-014
closure task; a future telemetry pass should widen the capture surface.

**TimeElapsedBeforeOrder.**
`{anchorKind, pausedMs, playingMs, candlesRevealed}` — the physical timing context
of an order placement, anchored at the most recent of session start, last seek, or
last order event.

**MAE / MFE.**
Maximum Adverse / Favorable Excursion of a position, accumulated over every Base
Resolution candle it is open for — long: adverse = `entry - low`, favorable =
`high - entry` (Bid extremes); short: sided via Ask Derivation — with first-reach
timestamps `tMae`/`tMfe` (strict `>`: a later candle merely equaling the running
max does not move the timestamp) and R-normalized forms `MAE_R = MAE / d`,
`MFE_R = MFE / d`. **Divisor property:** `d` is the trade's FINAL `sl` distance AT
CLOSE (`|entry - sl|`, the RFC-014 §3 formula) — since Asymmetric Trade Management
(I-15) lets SL tighten after placement, `d` can diverge from the entry-time 1R (the
Risk Invariant's `riskUsd` distance, Section 5) once the SL has moved. MAE_R/MFE_R
are therefore a DISTINCT normalization from `rMultiple`, not interchangeable with
it. Physical efficiency diagnostics for stop and target slack; interpretation
belongs to the trader (S1).
*Technical implication:* `Position.{mae,mfe,tMae,tMfe}` (optional, accumulated via
`updateExcursion` in `fill-engine.ts`); sealed into `ClosedTrade` on every close
path — a position never walked by a candle (e.g. a market order closed manually
before any replay advance) seals `mae=0, mfe=0, tMae=tMfe=openTime` rather than
staying undefined. Rendered as `MAE_R`/`MFE_R` columns in the trade history
(display-time derivation; "—" for legacy trades missing the fields) plus
mean/max aggregates in the session summary (G4).

**Reflection Cabin** (The Mirror).
The end-of-session / on-demand reconstruction surface: Reflective Scenes plus
uninterpreted fact panels. It presents and asks nothing; lesson authoring is always
trader-initiated.

Note: "Session" keeps its Section 7 definition; the knowledge model adds its tier
classification — a transitory container whose deletion must never destroy Lessons.

---

## 10. Cross-Cutting Engineering Terms

**Frozen Decision / Non-Goal.**
A written decision (D-number, R-number) or exclusion revocable only by an explicit new
RFC, never in passing. Current frozen non-goals include: mono-symbol session,
single-level grid, no floating panels, no web workers, `syncPriceScale`
reserved-unimplemented, session-scoped drawings.

**Realism Invariant.**
The umbrella term for execution fidelity rules: evaluation at Base Resolution,
sub-candle event ordering, pessimistic-and-disclosed ambiguity. The strategic audit
identifies execution fidelity as the product's central trust asset.

**Reserved Field.**
A designed-but-unread extension point (zero read sites), verified by audits to remain
unread until an RFC activates it (`syncPriceScale`, `notes`).

---

## 11. Forbidden Terms

The Architectural Review of `TRAINING_WORKFLOW.md` purged methodology-specific
vocabulary from the domain. The following terms are forbidden in domain code,
schemas, RFCs, and specs (permitted only when quoting external material or naming the
anti-pattern itself):

| Forbidden term | Canonical replacement | Rationale |
| :--- | :--- | :--- |
| BOS, Break of Structure, CHoCH | Minor Structural Break | Smart Money Concepts contamination; biases the domain to one methodology |
| Order Block, Supply/Demand zone | Zone of Interest | Methodology-specific; the domain models geometry, not interpretation |
| Support/Resistance (as a modeled concept) | Zone of Interest / historical value boundary | Classical price-action contamination; acceptable colloquially, never as a model term |
| Bullish/Bearish bias | Directional Hypothesis | Strategy-neutral; admits trend, mean-reversion, volume, oscillator framings |
| Lot size as user input | Derived lot size (Risk Invariant) | Lot size is a computed dependent variable of SL geometry; a free input violates the risk invariant |
| Tick data / tick simulation | Sub-candle at Base Resolution | No tick data exists in the system; claiming tick fidelity misstates the simulation's resolution |
| Equity, unqualified | Realized balance / realized equity curve (session totals, Section 5's Session Statistics); Floating Equity (RFC-014 §3 mark-to-market read model, Section 5) when floating P/L is meant | Two distinct concepts now exist since RFC-014; unqualified "equity" is ambiguous — documents must say which one, never let bare "equity" imply floating P/L is folded into the realized figures |
| Backend / server (for the app runtime) | Cloud persistence (Supabase) + object storage (R2) | There is deliberately no application server; the term smuggles in architecture that does not exist |
| Guest mode / offline mode (as login state) | (none — removed) | Login is required; guest/offline mode was deliberately removed in Supabase Phase 3 |
| Factory selector (per-panel views) | Local per-instance `ChartModelMapper` | Banned implementation pattern (D8): single-slot memoization thrashes at N panels |
| Behavioral judgment vocabulary as schema/domain terms (hesitation, indecision, cheating, honesty score, discipline score, revenge trading, FOMO) | Neutral telemetry facts (`ReplaySeek`, `TimeElapsedBeforeOrder`, MAE/MFE) | Violates stance S1 (the system observes and conserves; the trader interprets); banned from every schema by invariant N-1 |
| Coach / grade / verdict (system-authored) | Reflection Cabin facts + trader-authored Permanent Lesson | The system never authors interpretations (invariant N-6); meaning lives only in trader-authored text |

---

## 12. Language and Naming Conventions

- Code identifiers, NgRx action types, and schema fields: English, using the code
  anchors given in this glossary.
- UI copy: Spanish. User-facing documents (README, RFCs, PHILOSOPHY): Spanish by repo
  convention; agent artifacts and this glossary corpus: English. The present
  architecture-stabilization corpus (Stages 1-6) is authored in English by explicit
  owner directive of 2026-07-09, recorded here as a documented deviation, not a silent
  one.
- Decisions worth keeping receive an identity (D-numbers, R-numbers) and a written
  rationale; this glossary cites them (D1 mono-symbol, D8 local mapper, D9 atomic
  payload, R4 single cache) rather than restating their arguments.

---

## 13. References

- `docs/architecture/TRAINING_WORKFLOW.md` — training domain source of truth.
- `docs/architecture/strategic_audit.md` — bounded contexts, fidelity diagnosis, RFC-014+ direction.
- `docs/engineering/domain/replay-trading.md` — replay clock, fills, trading state.
- `docs/engineering/domain/workspace-panels.md` — workspace aggregate and panel system.
- `docs/engineering/domain/session-sync.md` — persistence and LWW sync.
- `docs/engineering/domain/data-pipeline.md` — market data path and timeframe policy.
- `emulador/src/app/state/trading/trading.models.ts`, `fill-engine.ts` — executable anchors.
