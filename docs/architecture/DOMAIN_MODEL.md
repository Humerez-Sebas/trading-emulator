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
  observed in three phases.
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

Clean-price semantics: no spread, commission, or slippage terms exist in the current
model (`profitOf`, `fill-engine.ts`). This is a disclosed fidelity gap (Section 8).

### I-4 Balance Conservation

After every engine application and session close:

```
balance = initialBalance + SUM(t.profit for t in history)
```

`processCandle` adds each closed trade's profit exactly once; `closeSession` does the
same for force-closed positions. No other code path mutates balance.

### I-5 Fill Predicates (per order type and side)

An order `o` fills inside candle `c` iff `c.time > o.createdAt` (I-8) and:

| Type | Side | Predicate |
| :--- | :--- | :--- |
| limit | buy | `c.low <= o.entryPrice` |
| limit | sell | `c.high >= o.entryPrice` |
| stop | buy | `c.high >= o.entryPrice` |
| stop | sell | `c.low <= o.entryPrice` |

Fill price is exactly `o.entryPrice` (clean fill). Enforced by `orderFills`
(`fill-engine.ts`).

### I-6 Exit Predicates

For position `p` and candle `c`:

```
slHit(p, c) = (p.side = buy)  ? c.low  <= p.sl : c.high >= p.sl
tpHit(p, c) = p.tp != null AND ((p.side = buy) ? c.high >= p.tp : c.low <= p.tp)
```

Exit prices are exactly `p.sl` / `p.tp` (`slHit`/`tpHit`, `fill-engine.ts`).

### I-7 Causal Ordering Within the Parent Candle (phantom-stop invariant)

When sub-candles `s_0 .. s_n` cover the parent candle's interval and a position fills
at sub-index `k` (`fillSubIndex`), exit evaluation walks `s_k .. s_n` in order; the
first sub-candle satisfying an exit predicate decides the outcome. Therefore **no exit
event may causally precede its fill event**, even though the parent candle's envelope
consolidates pre-fill price action. The parent envelope is used only as a fast path
(no touch anywhere) or a fallback (no lower series). Enforced by `resolveExit`;
regression-locked by `"a freshly filled order ignores SL hit before the fill index"`
(`fill-engine.spec.ts`).

Scope caveat: the fill index lives in a call-local map inside `processCandle`,
populated only for orders filled during that invocation; positions already open when
the call starts evaluate from sub-index 0. The guarantee therefore holds per candle
step; whole-replay correctness additionally relies on the orchestration processing
each candle exactly once (I-8's high-water mark) — a property RFC-014 must preserve.

### I-8 No Lookahead, No Time Travel (idempotence)

Three guards make replay navigation safe:

1. **Placement-candle exclusion:** fill requires `c.time > o.createdAt` — no
   hindsight fills on the candle visible at placement, and reprocessing any candle at
   or before placement is a no-op for that order.
2. **Open-time guard:** exits skip candles with `c.time < p.openTime` — revisiting
   past candles after a step-back cannot close a position "in the past".
3. **High-water mark:** `TradingData.lastProcessedTime` records the last evaluated
   candle time; the effects layer advances the book only for newly revealed candles.

Additionally, scrubber **seek is teleportation**: it deliberately does not simulate
fills across the skipped range (frozen navigation semantics,
`docs/engineering/domain/replay-trading.md`).

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

### I-14 / I-15 Stated Invariants Awaiting Mechanical Enforcement

Per PHILOSOPHY Section 2.7 an invariant needs a detector. These two are domain law
(TRAINING_WORKFLOW Section 3, `engineering_knowledge_roadmap.md` Stage 2) whose
detectors do not exist yet; they are recorded here as enforcement gaps, in scope for
the RFC-014 domain-layer work, and must not be "fixed" in passing:

- **I-14 Order Geometry Coherence.** A buy trade requires `sl < entryPrice` and
  (`tp = null` or `tp > entryPrice`); a sell trade is symmetric. The domain layer does
  not validate this today: `openMarket`/`placeOrder` accept any geometry
  (`trading.reducer.ts:86-123`), and a mis-sided SL would simply exit on the next
  evaluated candle via I-6. Enforcement currently lives, at best, in placement UI
  geometry — exactly the presentation-layer leakage the knowledge roadmap warns
  about.
- **I-15 SL Non-Widening (Asymmetric Trade Management).** Doctrine: once placed, SL
  may tighten (break-even management) but never widen; TP is freely adaptable.
  `modifyPosition` (`trading.reducer.ts:131-137`) currently accepts arbitrary SL
  changes with no direction check. The rule exists as doctrine without a detector.

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

1. **Clean fills.** No spread, commission, or slippage. Expectancy is biased
   optimistic; short-side SL checks against Bid where reality checks Ask.
2. **Placement-candle latency.** Same-candle retrace-and-fill dynamics are deferred
   to the next interval by the placement-candle exclusion. The exclusion buys
   idempotence and no-hindsight (I-8); RFC-014 must preserve those properties while
   removing the latency.
3. **Realized-only equity.** No per-candle mark-to-market; floating drawdown is
   invisible, which understates risk metrics and blocks challenge-mode style rules.
4. **Non-configurable pessimism.** Ambiguous resolutions are always SL-first; there
   is no worst/best/probabilistic mode selection. Acceptable while disclosure
   (`ambiguousCount`) exists; revisit with RFC-014.

---

## 9. References

- `docs/architecture/UBIQUITOUS_LANGUAGE.md` — term authority.
- `docs/architecture/strategic_audit.md` — Parts 1 and 7 (contexts, engine critique).
- `docs/architecture/TRAINING_WORKFLOW.md` — training-domain invariants (risk
  invariance, asymmetric management).
- `docs/engineering/domain/replay-trading.md`, `workspace-panels.md`,
  `session-sync.md`, `data-pipeline.md`.
- `emulador/src/app/state/trading/fill-engine.ts`, `trading.models.ts`,
  `state/layout/layout.models.ts`, `state/link-groups/link-groups.models.ts`,
  `state/workspaces/workspaces.models.ts`.
