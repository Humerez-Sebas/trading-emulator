# Domain Model

| Field | Value |
| :--- | :--- |
| Status | Normative (living document) |
| Date | 2026-07-09 |
| Stage | 2 of the Engineering Knowledge Roadmap |
| Language authority | `docs/architecture/UBIQUITOUS_LANGUAGE.md` |
| Upstream sources | `emulador/src/app/state/**/*.models.ts`, `state/trading/fill-engine.ts`, `strategic_audit.md`, `docs/engineering/domain/*.md` |

---

## 1. Modeling Stance

The emulator is a bounded context of **deliberate practice simulation**. Its model
therefore rests on stable mathematical invariants (time, price, lot size, direction,
SL, TP) and deliberately excludes semantic market interpretation (what a "setup" is
lives in the trader's head). Three consequences shape everything below:

1. **Purity at the core.** Financial state transitions are pure functions
   (`fill-engine.ts`); NgRx effects around them stay thin. Testability of the money
   path is non-negotiable.
2. **One sovereign per datum.** Every piece of state has exactly one owner; most
   synchronization bugs are unresolved sovereignty disputes (PHILOSOPHY Section 2.3).
3. **The candle is the quantum of time.** No tick data exists. Within the finest
   available candle, event order is unobservable; the model must acknowledge this
   (ambiguity flagging) rather than pretend otherwise.

---

## 2. Bounded Contexts (summary)

Formal context mapping lives in `ARCHITECTURE_VISION.md` (Stage 5). The three domain
contexts, per `strategic_audit.md` Part 1:

| Context | Aggregate Root | Owns | Explicitly does not own |
| :--- | :--- | :--- | :--- |
| Market Data | Series (per symbol) | Candle series, timeframes, datasets, coverage, manifest | Anything user-created |
| Simulation / Trading | `TradingBook` | Orders, positions, history, balance, session statistics | Candles (reads them), presentation |
| Workspace / Presentation | `Session` | Layout, panels, link groups, drawings, replay cursor, archive | Candles (references them), trading math |

---

## 3. Aggregates

### 3.1 TradingBook (Simulation context)

The transactional consistency boundary of all financial state.

```
TradingBook (Aggregate Root)                          fill-engine.ts
├── balance: number                (realized only)
├── orders: PendingOrder[]         (entities)
├── positions: Position[]          (entities)
└── history: ClosedTrade[]         (immutable records, append-only)
```

- **Atomicity.** One application of `processCandle(book, candle, subCandles,
  contractSize)` is the unit of change: fills, exits, and the balance update commit
  together in a single new book, or not at all (`changed: false` returns the same
  reference). There is no observable intermediate state.
- **Entity lifecycle.** `PendingOrder --fill--> Position --exit--> ClosedTrade`. The
  identity (`id`) is continuous across the whole lifecycle: the position keeps the
  order's id and the closed trade keeps the position's id. A trade is one identity
  observed in three phases. An optional opaque stamp, `declaredRuleId?: string | null`,
  travels the same chain (RFC-015 P-4): set post-placement on the order or position,
  sealed onto `ClosedTrade` at close. The system never reads its value (P-2); it is
  a trader-authored fact, not a system judgment.
- **Persistence shape.** The book is embedded in `TradingData`
  (`trading.models.ts`), which adds session-scoped fields (`initialBalance`,
  `lastProcessedTime`, `sessionEnded`, `riskPct`, `sessionEnd`, `sessionName`,
  `folderId`). `TradingState` extends it with runtime-only fields (`summaryOpen`,
  `savedSessions`, `activeSessionId`).
- **Scope rule (D1).** Exactly one `TradingBook` exists per session, bound to the
  `primarySymbol`. View-only panels never touch it.
- **Naming precision.** The code-level `TradingBook` interface is deliberately narrow
  (the four fields the engine needs); the strategic audit uses "TradingBook" for the
  broader conceptual aggregate. The persisted aggregate is `TradingData` and the
  runtime aggregate is `TradingState`. Documents must state which scope they mean.

### 3.2 Session (Workspace context)

The unit of user work and of persistence (RFC-011).

```
Session (Aggregate Root)                              workspaces.models.ts
├── identity: activeSessionId      (stable across archive cycles, = cloud row id)
├── replay cursor: currentTime     (UTC seconds, ONE per session)
├── trading: TradingData           (the Simulation aggregate, embedded)
├── layout: WorkspaceLayout        (tabs -> cells -> panelIds)
├── panels: Record<id, PanelDescriptor>
├── linkGroups: LinkGroup[]
├── drawings: per-symbol           (session-scoped by frozen decision)
└── archive: SavedSession[]        (each: TradingData + cursor at archive time)
```

- **Candles sit below the aggregate.** Series are shared by reference per symbol
  (single IndexedDB store, R4) and are never copied into, nor serialized with, the
  aggregate (candle-free payload, `assertNoCandles`).
- **Sovereignty is per-session.** Two sessions on the same symbol have fully
  independent layouts and drawings.
- **Wire shape.** `SessionPayloadV2` serializes trading + layout + linkGroups +
  per-symbol drawings as ONE atomic LWW unit (D9). The `strategic_audit.md` flags the
  single-JSONB coupling as a future scaling risk; any split is RFC-level work, not a
  refactor.

### 3.3 Market Data (supporting context)

Effectively an immutable, append-only library: sorted `Candle[]` per (symbol,
timeframe), M1 as ground truth, higher/custom TFs derived (`aggregateCandles`,
`generateCustomSeries`). It has no user-mutable aggregate; its consistency rules are
sortedness (precondition of every binary-search projection) and single-cache ownership
(R4). Coverage queries answer availability without loading candles.

---

## 4. Entities and Value Objects

| Kind | Type | Identity | Notes |
| :--- | :--- | :--- | :--- |
| Entity | `PendingOrder` | `id` | Carries full risk definition at placement |
| Entity | `Position` | `id` (inherited from order) | `origin` records the creating order type |
| Immutable record | `ClosedTrade` | `id` (inherited) | Append-only history; only presentation flags (`boxHidden`, `boxDeleted`) mutate afterward |
| Entity | `SavedSession` | `id` | Archived session + cursor |
| Entity | `SessionFolder` | `id` | Flat, cross-asset, LWW-synced |
| Entity | `PanelDescriptor` | `id` | `{symbol, timeframe, linkGroupId}` |
| Entity | `TabLayout` | `id` | Template + ordered cells |
| Entity | `LinkGroup` | `id` | `syncCrosshair`, `syncTimeRange`, reserved `syncPriceScale` |
| Entity | `Drawing` | `id` | Geometric only; never interpreted |
| Value object | `Candle` | none | `{time, o, h, l, c}`; time in UTC seconds |
| Value object | `Timeframe`, `GridTemplate` | none | Closed enumerations |
| Value object | `GridCell` | positional | `{panelIds[], activePanelId}` |
| Value object | `OrderSide`, `OrderType`, `TradeOutcome` | none | Closed unions |
| Value object | `ExitDecision` | none | `{outcome, price, ambiguous}` |
| Value object (derived) | `SessionStats` | none | Recomputable from `history` + `initialBalance` |
| Value object | Coverage bounds | none | first/last per symbol/tf |

---

## 5. Hard Mathematical Invariants

Notation: `dir(side) = +1` for `buy`, `-1` for `sell`. All prices are numbers; all
times are UTC seconds. Enforcing code is cited for each invariant; per PHILOSOPHY
Section 2.7, an invariant without a detector erodes silently.

### I-1 Risk Invariance (lot sizing is derived, never free)

For balance `B > 0`, risk percentage `r > 0`, entry `E`, stop `S` with
`d = |E - S| > 0`, contract size `K`:

```
riskUsd = B * r / 100
lots    = max(0.01, round_0.01(riskUsd / (d * K)))
```

Degenerate inputs (`d <= 0`, `B <= 0`, `r <= 0`) yield `lots = 0` (order not
placeable). Enforced by `lotsForRisk` (`trading.models.ts`). The trader chooses risk;
SL geometry decides size.

Two precision notes:

- **Risk-bounded, not risk-exact.** Because of the 0.01-lot rounding and floor, the
  realized loss-at-SL `d * lots * K` may deviate from (and, at the floor, exceed) the
  nominal target `B * r / 100`. Lot sizing is bounded from below by the broker step.
- **Re-derivation window.** A *pending* order re-derives `lots` (keeping `riskPct`
  constant) when its entry or SL is modified (`modifyOrder`,
  `trading.reducer.ts:140-165`). Once filled into a `Position`, `lots` and `riskUsd`
  are locked for the trade's lifetime.

### I-2 The 1R Definition

`riskUsd` is captured at placement time as the realized post-rounding geometric risk
`|entry - sl| * lots * contractSize` (`trading.reducer.ts:96,123`) — not the nominal
percentage target — and is immutable from fill onward; it defines 1R.
`rMultiple = profit / riskUsd` when `riskUsd > 0`, else `0` (`closeTrade`,
`fill-engine.ts`).

### I-3 Profit Computation

```
profit(p, exit) = (exit - p.entryPrice) * dir(p.side) * p.lots * contractSize
```

`profitOf` (`fill-engine.ts`) computes the GROSS figure at the executed exit price
(spread/slippage already baked into `exit` via I-5/I-6's sided predicates, RFC-014
§2). `ClosedTrade.profit` is NET of commission: `profit = grossProfit -
commission`, `commission = costs.commissionPerLot * lots` charged once per
round-turn at close (`closeTrade`). With `costs` absent or `{0,0,0,1}` (the
`ExecutionCosts` zero-cost degeneration, V-1 anchor), `grossProfit === profit`
and every number reduces bit-for-bit to the pre-RFC-014 clean-price model. This
resolves the fidelity gap formerly disclosed here (Section 8, item 1).

### I-4 Balance Conservation

After every engine application and session close:

```
balance = initialBalance + SUM(t.profit for t in history)
```

`processCandle` adds each closed trade's profit exactly once; `closeSession` does the
same for force-closed positions. No other code path mutates balance.

### I-5 Fill Predicates (per order type and side)

An order `o` fills inside candle `c` iff `c.time > o.createdAt` (I-8, reveal-horizon
stamped — see I-8 below) and, with an optional `costs: ExecutionCosts | undefined`
argument (RFC-014 §2; absent or `{0,0,0,1}` degenerates every predicate below to the
pre-RFC-014 versions bit-for-bit, V-1):

| Type | Side | Execution side | Predicate |
| :--- | :--- | :--- | :--- |
| limit | buy | Ask | `toAsk(c.low, costs) <= o.entryPrice` |
| limit | sell | Bid | `c.high >= o.entryPrice` |
| stop | buy | Ask | `toAsk(c.high, costs) >= o.entryPrice` |
| stop | sell | Bid | `c.low <= o.entryPrice` |

Buys execute at the derived Ask (`toAsk(bid, costs) = bid + spreadPoints·pointSize`
— the ONE conversion point every sided predicate/price in the engine goes
through); sells stay Bid (spread-invariant). Fill price is exactly `o.entryPrice`
for limit orders (clean fill); stop orders additionally apply deterministic
adverse slippage (`slip(entryPrice, side, costs)`) to the recorded entry — the
order's level itself never shifts by spread, only by slippage. Enforced by
`orderFills`/`toAsk`/`slip` (`fill-engine.ts`); V-3 (sided predicates) and V-1
(zero-cost anchor) are its detectors.

### I-6 Exit Predicates

For position `p`, candle `c`, and the same optional `costs` argument as I-5:

```
slHit(p, c, costs) = (p.side = buy)  ? c.low <= p.sl : toAsk(c.high, costs) >= p.sl
tpHit(p, c, costs) = p.tp != null AND
  ((p.side = buy) ? c.high >= p.tp : toAsk(c.low, costs) <= p.tp)
```

A long's SL/TP close at Bid (closing action = sell, spread-invariant); a short's
close at the derived Ask (closing action = buy-to-cover). Exit price is `p.sl`
for an SL exit — further shifted by deterministic adverse slippage on that
stop-type execution — and exactly `p.tp` for a TP exit (clean, no slippage,
RFC-014 §2). `costs` is threaded from `TradingData.executionCosts` through the
reducer into the engine (I-10: the engine itself never reads config); absent or
zero costs reduce every predicate and price bit-for-bit to the pre-RFC-014
behavior (V-1). Enforced by `slHit`/`tpHit`/`toAsk`/`slip` (`fill-engine.ts`).

### I-7 Causal Ordering Within the Parent Candle (phantom-stop invariant)

When sub-candles `s_0 .. s_n` cover the parent candle's interval and a position fills
at sub-index `k` (`fillSubIndex`), exit evaluation walks `s_k .. s_n` in order; the
first sub-candle satisfying an exit predicate decides the outcome. Therefore **no exit
event may causally precede its fill event**, even though the parent candle's envelope
consolidates pre-fill price action. Enforced by `resolveExit`; regression-locked by
`"a freshly filled order ignores SL hit before the fill index"` (`fill-engine.spec.ts`).

**Caveat dissolved by RFC-014.** The execution loop now always feeds `processCandle`
one BASE candle per step when an execution series is loaded (`selectExecutionSeries`,
the finest loaded series for the session's symbol; `foldForwardFills`/`processFills$`
dispatch exactly one `Process Candle` per base candle strictly crossed, in
chronological order, with `subCandles: null`). Fill index and exit evaluation then
run over the SAME sequence of base candles the whole replay walks — there is no
parent/sub-candle split left to reason about, so the guarantee no longer depends on
a map scoped to one `processCandle` invocation. `lastProcessedTime` (I-8) is now
base-granular, so the high-water mark this invariant leans on for whole-replay
correctness advances one base candle at a time, never skipping or repeating one.

The sub-candle walk machinery (`resolveExit`'s `subCandles`/`fromSubIdx` parameters,
`fillSubIndex`) survives for two narrower scopes only: (a) the legacy path —
`processCandle` invoked directly with a parent candle and its sub-candles when no
execution series is loaded, which in practice only happens for mock-only sessions
(session creation guarantees the anchor datasets locally); and (b) the pre-existing,
STOP-protected specs that exercise it directly and must not be edited.

### I-8 No Lookahead, No Time Travel (idempotence)

Three guards make replay navigation safe:

1. **Placement-candle exclusion:** fill requires `c.time > o.createdAt` — no
   hindsight fills on the candle visible at placement, and reprocessing any candle at
   or before placement is a no-op for that order. `o.createdAt` is stamped by
   `selectPlacementTime` at the **placement reveal horizon** (RFC-014 D14.B): the
   time of the LAST REVEALED base candle within the cursor's replay-resolution
   bucket `[cursorTime, cursorTime + tfSeconds)` — not the raw cursor time. This is
   FORCED by this same no-hindsight property once execution runs at base grain
   (I-7): with the display resolution coarser than base (e.g. displaying H1 while
   stepping/replaying M1), the raw cursor sits at the START of a still-forming
   display candle, and stamping `createdAt` there would let the order fill on base
   candles inside that SAME candle the trader has not yet seen. Stamping the
   reveal horizon instead means only base candles strictly after the last one
   actually shown can fill the order. At base-grain stepping (resolution === base)
   the reveal horizon equals the cursor time exactly, so this reduces to the
   pre-RFC-014 semantics unchanged in that mode. Practical consequence: same-candle
   retrace-and-fill within the display interval now works once the trader steps
   finer than the display TF (RFC-014 §1.3's goal); full-candle-at-a-time stepping
   still defers a same-bar fill to the next interval — correct, since the whole
   candle really was revealed atomically.
2. **Open-time guard:** exits skip candles with `c.time < p.openTime` — revisiting
   past candles after a step-back cannot close a position "in the past".
3. **High-water mark:** `TradingData.lastProcessedTime` records the last evaluated
   candle time, now BASE-GRANULAR (RFC-014 §1.2): `foldForwardFills`/
   `processFills$` advance the book exactly one base candle at a time, independent
   of the displayed TF or Replay Resolution.

Additionally, scrubber **seek is teleportation**: it deliberately does not simulate
fills across the skipped range (frozen navigation semantics,
`docs/engineering/domain/replay-trading.md`). RFC-014 registers this semantics into
the telemetry black box (`ReplaySeek`, Section 4's Caja Negra) without touching it.

### I-9 Ambiguity Pessimism (disclosed, never silent)

Within the finest observable candle, event order is unknowable. Whenever SL and TP
both fall inside that unit — or a freshly filled position has no sub-candle data — the
engine resolves pessimistically as SL at `p.sl` and sets `ambiguous: true`. Ambiguity
propagates to `ClosedTrade.ambiguous` and aggregates into
`SessionStats.ambiguousCount`. A pessimistic resolution that is not flagged is a
model violation.

### I-10 Determinism and Purity

`processCandle`, `closeSession`, and `computeSessionStats` are pure: identical inputs
yield identical outputs, with no IO, clock reads, or randomness. This is what makes
the money path hard-TDD territory and the replay reproducible.

### I-11 Statistics Semantics

Over `history` sorted chronologically by `closeTime` on a copy
(`computeSessionStats`), making results independent of insertion order:

- Classification is a three-way partition: `expired` (`'session-end'`), then by sign —
  `won` iff `profit > 0`, `lost` otherwise. **A zero-profit decided trade counts as a
  loss.**
- `winRate = won / (won + lost)` over **decided** trades only; `0` when none.
- `grossWin`/`grossLoss` partition **all** trades (including `'session-end'`) by
  profit sign (`profit >= 0` accrues to `grossWin`) — deliberately a different
  partition than won/lost/expired. `profitFactor = grossWin / grossLoss`; `Infinity`
  when `grossLoss = 0 < grossWin`; `0` when both are zero.
- `netProfit` and `totalR` sum over all trades, session-end included.
- `equityCurve` is the realized equity after each closed trade, starting at
  `initialBalance`; `maxDrawdown` is the maximum peak-to-valley drop over that curve;
  `maxDrawdownPct` is the relative drop captured at the step that sets the absolute
  `maxDrawdown` (not an independently maximized ratio).

### I-12 Workspace Structural Invariants

- **Panel-cell bijection:** every `panelId` referenced by cells resolves to exactly
  one `PanelDescriptor`, and no panel is referenced by two cells. `cells.length` MAY
  exceed `GRID_TEMPLATE_CELLS[template]` (parked cells) — the template is a lens, not
  a blender.
- **Hard cap:** `MAX_PANELS_PER_TAB = 8` (R1) — a named constant with a performance
  rationale, not a configurable parameter.
- **Bounded topology:** `GridTemplate` is a closed union; no recursive splits.
- **Focused-panel totality:** whenever the template parks the focused panel,
  focus is reassigned to a rendered panel, so global TF controls never target an
  off-screen panel.

### I-13 Persistence Invariants

- **Candle-free:** `assertNoCandles` before every upsert; datasets referenced via
  `requiredDatasets`.
- **Atomic payload (D9):** one `SessionPayloadV2` per LWW cycle; never parallel
  synced fragments.
- **LWW monotonicity:** an update is accepted iff its `client_updated_at` is strictly
  newer than the stored one, enforced by the `lww_guard()` DB trigger — the only layer
  that can guarantee it.
- **Stable session identity:** archive/restore reuses `activeSessionId`; identity
  never changes across archive cycles.
- **Size guard:** 512 KB warn / 2 MB reject per payload.

### I-14 / I-15 Order Lifecycle Law (`SimulationDomain`)

Per PHILOSOPHY Section 2.7 an invariant needs a detector. These two are domain law
(TRAINING_WORKFLOW Section 3, `engineering_knowledge_roadmap.md` Stage 2). RFC-014
Task 4a gave both mechanical detectors by extracting the order-lifecycle law into a
pure named module, `SimulationDomain` (`state/trading/simulation-domain.ts`), invoked
from the reducers — no new framework concepts, just a named home for logic that used
to live inline:

- **I-14 Order Geometry Coherence.** A buy trade requires `sl < entryPrice` and
  (`tp = null` or `tp > entryPrice`); a sell trade is symmetric. Boundary equality
  (`sl === entryPrice`, `tp === entryPrice`) is INVALID on both sides — strict
  comparisons, coherent with the sided execution predicates of I-5/I-6. Enforced by
  `validateOrderGeometry`, wired into `openMarket`, `placeOrder`, and
  `modifyOrder`'s RESULTING geometry (`trading.reducer.ts`). An invalid placement or
  modification does not mutate state (reference-identity return, no throw, no
  modal) — S2 minimal feedback, the same idiom as the pre-existing `lots <= 0`
  guard.
- **I-15 SL Non-Widening (Asymmetric Trade Management).** Doctrine: once placed, SL
  may tighten (long: `SL' >= SL`; short: `SL' <= SL`; equality/no-op accepted) but
  never widen; TP stays freely adaptable. Enforced by `validateSlModification`,
  wired into `modifyPosition`: a widening move is rejected (the position keeps its
  current SL) while a valid TP change in the same action still applies
  (apply-the-valid-part, independent of the SL decision). By design,
  `modifyPosition` does NOT re-run I-14 geometry checks on the resulting SL/TP —
  pending-order geometry coherence is `modifyOrder`'s concern; once filled, only the
  non-widening direction is policed here.
- **Detectors.** `state/trading/simulation-domain.spec.ts` (the module's pure
  functions in isolation, V-10) and `state/trading/trading.reducer.domain.spec.ts`
  (wired through the reducer). **D14.E:** landing this required editing 2
  pre-existing reducer specs whose fixtures used geometry that the new I-14 check
  makes invalid (e.g. a boundary-equal SL) — a punctual, user-authorized exception
  to the STOP rule; the specs' intent was preserved and only their fixture geometry
  adjusted to valid values (Task 4a ledger).

### I-16 Playbook Invariants (RFC-015)

The Playbook domain (`state/playbook/`) introduces seven invariants protecting the
opacity and survival of trader-authored rules:

| Id | Invariant | Detector |
| :--- | :--- | :--- |
| P-1 | Declaration is optional on EVERY placement path | Pre-existing placement suite green without `declaredRuleId` |
| P-2 | Rule content is opaque: no code reads `statement` except display/edit | Grep audit (zero parsers/matchers) |
| P-3 | Playbook survives all session/telemetry deletion | Cross-DB survival test (`playbook-db.service.spec.ts`) |
| P-4 | Identity chain: `declaredRuleId` travels order → position → closed trade | Round-trip through engine + payload mapping (`playbook-invariants.spec.ts`) |
| P-5 | N-1 on new schemas: zero interpretive vocabulary | Grep of forbidden terms over `state/playbook/**` and SQL |
| P-6 | N-5: new store is candle-free | `assertNoCandles` on every DB write (`playbook-db.service.spec.ts`) |
| P-7 | `amendments` reserved: zero read sites in production | Grep audit |

Additionally, `declaredRuleId?: string | null` is noted on the §3.1 identity chain
(`PendingOrder → Position → ClosedTrade`) as an additive, opaque stamp.

### I-17 Lesson & Journal Invariants (RFC-016)

The Lesson and Journal systems (`state/lessons/` and pages `/journal`, `/reflection`) introduce six invariants protecting the conservation, isolation, and user-authorship of trader knowledge:

| Id | Invariant | Detector |
| :--- | :--- | :--- |
| J-1 | Las escenas son recomputables: ningún render se persiste jamás (N-3) | Test de forma de almacenamiento: cero blobs/Base64 en stores de lessons/telemetría (`lessons-db.service.spec.ts`, `lessons-invariants.spec.ts`) |
| J-2 | Solo los campos autorados por el trader (`whatHappened`/`repeat`/`avoid`) portan significado; ningún camino los parsea, puntúa o transforma | Grep de sitios de lectura (solo display/edit/export/sync) + grep N-1 |
| J-3 | La evidencia se congela al autorar: cambios posteriores de sesión/telemetría jamás mutan una lección | Test de inmutabilidad sobre las copias de `evidence` (`reflection-cabin-page.component.spec.ts`, `lessons-invariants.spec.ts`) |
| J-4 | Conservación (N-4): purgar sesiones+telemetría deja lessons y playbook intactos y legibles | Round-trip de borrado (`lessons-db.service.spec.ts`, `lessons-invariants.spec.ts`) |
| J-5 | Session-scope: ningún read-model del Journal o lección consume más de una sesión | Revisión de selectores + test de aislamiento (`lessons-invariants.spec.ts`) |
| J-6 | El Journal/Cabina es read-side puro sobre facts: cero dispatches a trading/replay/telemetry | Grep de dispatches en `journal/**` y `reflection/**` (solo acciones de lessons/navegación/playbook.amendRule) |

---

## 6. Domain Services (pure function inventory)

| Service | Location | Responsibility |
| :--- | :--- | :--- |
| `processCandle` | `state/trading/fill-engine.ts` | One-candle advancement of the TradingBook (fills + exits + balance) |
| `closeSession` | same | Force-close at session end |
| `resolveExit`, `orderFills`, `fillSubIndex` | same | Exit/fill predicates and intrabar ordering |
| `computeSessionStats` | same | Derived session statistics |
| `sliceRange`, `lastIndexAtOrBefore`, `firstIndexAtOrAfter` | same | Binary-search time projections over sorted series |
| `lotsForRisk`, `contractSizeFor` | `state/trading/trading.models.ts` | Risk invariant and symbol contract sizing |
| `validateOrderGeometry`, `validateSlModification` | `state/trading/simulation-domain.ts` | I-14/I-15 order-lifecycle law |
| `updateExcursion` (internal to `processCandle`) | `state/trading/fill-engine.ts` | MAE/MFE accumulation per base candle (RFC-014 §3) |
| Reified domain facts (`OrderFilled`, `PositionClosed`) | `state/trading/domain-facts.ts` | Fill/close events built during the engine walk, consumed via post-reducer state diffing (D14.F) |
| `costPresetFor`, `effectiveCosts`, `toAsk`, `pointsToPrice` | `state/trading/execution-costs.ts`, `fill-engine.ts` | Cost preset resolution and the Bid→Ask/slippage derivation (RFC-014 §2) |
| `aggregateCandles` | `services/timeframe-generator.ts` | Timeframe aggregation |
| `generateCustomSeries`, `pickBaseSeriesTf` | `state/market/custom-timeframe.ts` | Custom TF derivation from best base |
| Session sync mapping | `session-sync.mapping.ts` | Pure flatten/reconstruct between local workspace-centric and cloud session-centric models |
| `migrateV1ToV2`, `parseSessionPayload` | session payload module | Versioned, shape-guarded payload migration with round-trip tests |

These services are the closest thing the model has to a domain layer today; the
strategic audit correctly observes there is no *deep* simulation aggregate object —
the book is data plus pure functions orchestrated by effects. Formalizing that is
RFC-014+ territory, not a rewrite to perform in passing.

---

## 7. Trade Lifecycle (state transitions)

```
                     placeOrder (risk-derived lots, I-1)
                               |
                               v
                      [ PendingOrder ]
                       |            |
        cancel/modify  |            |  orderFills(c), c.time > createdAt (I-5, I-8)
                       v            v
                  (discarded)  [ Position ]  <-- market order opens directly here
                                    |
              +---------------------+----------------------+
              |                     |                       |
   resolveExit -> 'sl'    resolveExit -> 'tp'       manual close /
   (I-6, I-7, I-9)        (I-6, I-7)                closeSession ('session-end')
              |                     |                       |
              v                     v                       v
        [ ClosedTrade ]      [ ClosedTrade ]         [ ClosedTrade ]
                               (append-only history; balance += profit, I-4)
```

---

## 8. Acknowledged Model Limitations (disclosed, not hidden)

Per `strategic_audit.md` Part 7 and the walkthrough, these are known fidelity gaps.
They are recorded here so no future document "discovers" them; their resolution is
scheduled work (see `RFC-014_AND_BEYOND.md`), not drive-by fixes:

1. **Clean fills — RESOLVED by RFC-014 §2.** Sided Bid/Ask predicates,
   commission-at-close, and deterministic adverse slippage on stop-type executions
   are now modeled (I-5, I-6); `ExecutionCosts` absent or `{0,0,0,1}` degrades
   bit-for-bit to the prior clean-fill behavior (V-1 anchor).
2. **Placement-candle latency — RESOLVED by RFC-014 §1.** Execution now runs at
   base resolution (I-7, I-8); `PendingOrder.createdAt` is stamped at the
   placement reveal horizon (D14.B) instead of the raw cursor, so same-candle
   retrace-and-fill within the display interval works once the trader steps finer
   than the display TF.
3. **Realized-only equity — RESOLVED by RFC-014 §3.** `selectFloatingEquity`
   (sided mark-to-market) and per-position MAE/MFE with first-reach timestamps are
   now computed over every base candle a position is open for. `floatingEquity` is
   a read model only (never persisted); `balance`/`equityCurve` (I-11) remain
   realized-only by design — see Floating Equity, `UBIQUITOUS_LANGUAGE.md` Section 5.
4. **Non-configurable pessimism.** Ambiguous resolutions are still always SL-first;
   there is no worst/best/probabilistic mode selection — that remains future work.
   What RFC-014 changes is the UNIT this applies to: ambiguity is now confined to
   the BASE candle (the resolution atom, I-9) instead of whatever timeframe
   happened to be loaded/displayed, so `ambiguousCount` falls. Measured on a
   deterministic reference scenario (`state/trading/ambiguous-kpi.spec.ts`, RFC-014
   closure KPI): 3 ambiguous trades under the pre-RFC-014 worst case (H1 envelope
   only, no lower series) fold to 1 under the base-grain (M1) fold over the exact
   same underlying price action — the survivor is a genuine same-minute SL/TP
   collision, confirming ambiguity narrows to an irreducible floor rather than
   vanishing.

### Deviations recorded by RFC-014 (implementation, not further model limitations)

Two additional deviations from RFC-014's literal spec were recorded at closure
(RFC-014, "Desviaciones registradas", 2026-07-11) and are logged here so no future
document "discovers" them either. Unlike items 1-4 above, these are implementation
choices, not gaps in the trading model itself:

5. **Telemetry store lives in a DEDICATED IndexedDB database
   (`emulador-telemetry`), not the `emulador-workspaces` store RFC-014 §4 names
   literally.** Joining the telemetry object store to the shared
   `emulador-workspaces` database would have required bumping its `DB_VERSION`,
   breaking a STOP-protected exact-object-store-count assertion in
   `workspace-db.service.spec.ts`. A dedicated database
   (`services/telemetry-db.service.ts`) leaves that spec untouched; `assertNoCandles`
   (I-13) is still enforced independently on every telemetry batch.
6. **Programmatic time-jumps fall outside telemetry capture.** The "go to date"
   teleport (and other programmatic restores — session/CSV-start loads) dispatch
   `goToTime` directly, bypassing both `seekTo` and the
   `jumpForward`/`jumpBack`/`advanceDisplay` arming path. These jumps are therefore
   captured neither as `ReplaySeek` nor as `ReplayJump` by the black box (RFC-014
   §4, Caja Negra), and do not reset its anchors. A known, disclosed gap — not fixed
   in this closure — tracked as future telemetry work, not hidden behavior.

---

## 9. References

- `docs/architecture/UBIQUITOUS_LANGUAGE.md` — term authority.
- `docs/architecture/strategic_audit.md` — Parts 1 and 7 (contexts, engine critique).
- `docs/architecture/TRAINING_WORKFLOW.md` — training-domain invariants (risk
  invariance, asymmetric management).
- `docs/engineering/domain/replay-trading.md`, `workspace-panels.md`,
  `session-sync.md`, `data-pipeline.md`.
- `emulador/src/app/state/trading/fill-engine.ts`, `trading.models.ts`,
  `simulation-domain.ts`, `execution-costs.ts`, `domain-facts.ts`,
  `state/layout/layout.models.ts`, `state/link-groups/link-groups.models.ts`,
  `state/workspaces/workspaces.models.ts`.
