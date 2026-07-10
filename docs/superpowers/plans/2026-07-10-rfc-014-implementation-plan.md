# RFC-014 Implementation Plan — Simulación de Alta Fidelidad y Telemetría Conductual

- **Spec (normative):** `docs/architecture/rfcs/014-simulacion-alta-fidelidad-telemetria.md`
- **Governing docs:** `docs/architecture/DOMAIN_MODEL.md` (I-1..I-15), `docs/architecture/TRADER_KNOWLEDGE_MODEL.md` (S1/S2, N-1..N-6), `docs/engineering/domain/replay-trading.md`
- **Branch:** `feature/rfc-014-alta-fidelidad-telemetria` (base `cee5fa9`, from `develop`) → PR to `develop`
- **Run protocol:** `docs/engineering/sdd-orchestration.md`, full mode (per-task review + final whole-branch audit)

## Global Constraints (bind every task)

1. **STOP rule (absolute, user-mandated):** pre-existing spec files are NEVER modified, not even
   cosmetically. They must pass green exactly as they are on `develop` today. If a pre-existing spec
   pins behavior your task must change, do NOT touch it — design around it (see D14.A) or report
   BLOCKED with the file/line. New tests go in NEW spec files only.
2. **Gates per task** (run from `emulador/`, all must be green before commit):
   `npx tsc -p tsconfig.app.json --noEmit` · `npx tsc -p tsconfig.spec.json --noEmit` ·
   `npx ng test --watch=false` (NEVER bare `npx vitest run`) · `npm run lint` (0 problems).
   Record the fresh test count in the task report.
3. **Engine purity (I-10):** `fill-engine.ts` and any new domain module stay pure — no IO, no clock
   reads, no randomness, no Angular/NgRx imports, no config reads inside the engine. Everything
   arrives as explicit arguments.
4. **V-1 anchor:** with zero costs (`{spreadPoints:0, commissionPerLot:0, slippagePoints:0}` or the
   argument absent) the engine must reproduce the current suite's outputs **bit for bit**. The
   pre-existing specs running unmodified ARE the anchor; never weaken them.
5. **Additive data model only:** new fields on `ClosedTrade`/`Position`/`PendingOrder`/payload are
   optional and backward-compatible; absent = legacy behavior (zero cost). No destructive migrations.
6. **Factory-selector ban (D8):** no shared `selectX(param)` factory selectors.
7. **No new runtime dependencies.** None. (`isolate:false` discipline: any spec using
   `overrideSelector` calls `store.resetSelectors()` in `afterEach`.)
8. **Candle-free stores (N-5/I-13):** session payloads and the new telemetry store never contain
   candles; reuse `assertNoCandles`.
9. **Frozen navigation semantics:** `seekTo` stays teleportation (no fill simulation); backward
   navigation stays pure review. This RFC records navigation, never changes it.
10. **Commits:** conventional (`feat(scope):` / `test(scope):`), task-scoped, pathspec commits
    (`git commit <files> -m ...`). Never commit unrelated files. Code identifiers/comments in
    English; UI copy in Spanish.
11. **Telemetry neutrality (N-1):** no interpretive vocabulary anywhere in code/identifiers:
    forbidden words `hesitation`, `honesty`, `discipline`, `cheat`, `score` (detector: grep).

## Design decisions fixed for this run (cite by id in reports)

- **D14.A — STOP-compatible base-series plumbing.** `selectFillContext` gains a NEW input appended
  LAST: `base: Candle[]` = the execution series (finest loaded series of the session's symbol —
  first timeframe in fineness order with data; M1 ground truth). Effects take the base-grain path
  ONLY when `ctx.base` is a non-empty array; otherwise they behave byte-identically to today
  (legacy path). Pre-existing effect specs mock the context without `base` → legacy path → they
  stay green unmodified. In production `base` is always present (any loaded series ⇒ a finest one
  exists), so the base-grain path is the only live production path. The `lower`/`subCandles`
  machinery stays in place for the legacy path and pre-existing engine specs (V-6 anti-phantom-stop
  suite intact); production base-grain calls pass `subCandles: null`.
- **D14.B — Placement reveal horizon.** At placement, `PendingOrder.createdAt` is stamped with the
  time of the LAST REVEALED BASE candle (new selector `selectPlacementTime`), not the raw cursor
  time. Rationale: at cursor T with replay-resolution duration `tf`, the whole interval `[T, T+tf)`
  is already revealed (the resolution candle is displayed fully formed); base candles inside it
  with `time > T` would otherwise hindsight-fill on a step-back/forward reprocess. With base-grain
  stepping (resolution = base) this equals the cursor time exactly, which is the RFC §1.3 model
  case ("createdAt = tiempo del cursor"). The engine's exclusion `c.time > o.createdAt` (I-8)
  then holds unchanged at base grain: idempotence (V-4) and no-hindsight both follow. Deviation
  from RFC literal text documented for the walkthrough (RFC's own no-hindsight property forces it).
- **D14.C — Engine signature stability.** `processCandle(book, candle, subCandles, contractSize)`
  keeps its positional signature; new capabilities arrive as OPTIONAL trailing arguments (e.g.
  `costs?: ExecutionCosts`). Absent optional args reproduce today's behavior exactly.
- **D14.D — Ask derivation single point.** Stored series are Bid (MT5 bars; R3: confirm against
  `pipeline/fill_r2.py` and record the finding). `Ask(t) = Bid(t) + spreadPoints * pointValue`
  derived in ONE named helper; every sided predicate goes through it.

## Task 1: Base-resolution execution loop + same-candle fills

**Where it fits:** Step 1 of the RFC landing plan — the engine walks base (M1) candles regardless
of displayed TF or replay resolution; orders can fill in the same display interval they were
placed in, without hindsight. Establishes the loop that Tasks 2–3 refine.

### Files in scope
- `emulador/src/app/state/selectors.ts` — add `selectExecutionSeries` (finest loaded series from
  `selectSeries`, first TF in fineness order with data; reuse `TIMEFRAME_ORDER` machinery — see
  `lowerSeriesForSeconds` for the idiom); add `selectPlacementTime` (D14.B: time of last revealed
  base candle = `lastIndexAtOrBefore(base, cursorTime + tfSeconds - 1)`, falling back to cursor
  time when no base series); extend `selectFillContext` by APPENDING `selectExecutionSeries` as the
  LAST input, exposing it as `base` (pre-existing `selectors.spec.ts` calls the projector with 6
  positional args and must stay green — verify arg order compatibility).
- `emulador/src/app/state/trading/trading.effects.ts` — `processFills$`: when `ctx.base` is a
  non-empty array, on an advance landing on resolution candle T emit ONE
  `TradingActions.processCandle` per base candle in `sliceRange(base, T, T + tfSeconds)`, in
  chronological order, each with `subCandles: null`; otherwise legacy behavior byte-identical.
  Guards (`idx`, `candle.time === action.time`, `sessionEnded`, activity) unchanged, evaluated on
  the resolution series exactly as today. `endOnSchedule$`/`endOnDataExhausted$` untouched.
- `emulador/src/app/state/replay/replay.effects.ts` — `foldForwardFills`: when `base` present,
  for each resolution candle strictly crossed emit one `processCandle` per base candle of its
  interval (`sliceRange(base, c.time, c.time + tfSeconds)`), chronological, none skipped, none
  duplicated; landing candle still handled via `goToTime` → `processFills$`. Legacy path when
  `base` absent. (`ForwardFoldContext` type gains the optional `base` field.)
- Placement dispatch sites (find with grep: `placeOrder(` dispatches in components/services) —
  stamp order placement time from `selectPlacementTime` instead of the raw cursor (D14.B).
  Market orders (`openMarket`) keep cursor-time semantics (out of scope — parity with today).
- `emulador/src/app/state/trading/fill-engine.ts` — expected UNCHANGED (already candle-agnostic;
  the change is what feeds it). If a modification proves necessary, justify it in the report.

### Requirements (RFC §1)
1. Execution series = finest loaded series; the fill context ALWAYS delivers it, independent of
   displayed TF and Replay Resolution.
2. Exactly one `processCandle` per base candle strictly crossed, chronological, no omissions, no
   duplicates (fold + landing combined). `lastProcessedTime` naturally becomes base-granular.
3. Same-candle execution without hindsight: an order placed while stepping at base grain within a
   display candle CAN fill in later base candles of that same display interval; base candles
   already revealed at placement NEVER fill it (D14.B); reprocessing any base candle with
   `time <= createdAt` is a no-op for that order (V-4); double application of the same fold is
   identical (V-5, determinism).
4. When base series === resolution series (e.g. M1 displayed, full-candle stepping), behavior is
   identical to today's (one candle per advance) — write a test proving it.

### Tests to write FIRST (new files only)
- `state/trading/fill-engine.base-loop.spec.ts` — pure-engine scenarios at base grain: same-candle
  fill (order placed mid-interval, fills on a later M1 of the same H1); no-hindsight (base candles
  at/before createdAt never fill — including the coarse-resolution reveal-horizon case per D14.B);
  idempotence (re-folding the same base candles over the resulting book is a no-op); determinism
  (same fold applied twice from the same initial book yields deep-equal results); SL/TP on the
  same base candle still resolves pessimistic-ambiguous (I-9 at base atom).
- `state/trading/trading.effects.base.spec.ts` — with `base` present in the mocked context: N
  actions for the landing interval, chronological, `subCandles: null`; with `base` === resolution
  series: exactly one action (parity); without `base`: (do not re-test — pre-existing spec covers
  legacy; just don't break it).
- `state/replay/replay.effects.base.spec.ts` — jump/advance folds at base grain: exact action
  sequence per crossed resolution candle; no base candle skipped or duplicated across
  fold+landing; clamping to sessionEnd/data-end unchanged.
- Selector specs (new file or new `describe` in a NEW file): `selectExecutionSeries` picks finest
  loaded; `selectPlacementTime` = last revealed base time (and cursor fallback);
  `selectFillContext` exposes `base`.

### Out of scope
Costs/spread (Task 2), MAE/MFE (Task 3), SimulationDomain (Task 4), telemetry (Task 5), UI (Task 6).
Do not remove `lower`/`selectReplayLowerSeries` or any legacy machinery.

## Task 2: ExecutionCosts value object + Bid/Ask predicates + cost decomposition

**Where it fits:** Step 2 — fills and exits become sided (Bid/Ask), costs decompose PnL. The V-1
anchor (zero costs = bit-identical) is the permanent safety net; Task 1's suite plus all
pre-existing specs must stay green with no cost argument supplied.

### Files in scope
- `emulador/src/app/state/trading/execution-costs.ts` (NEW) — value object
  `ExecutionCosts { spreadPoints: number; commissionPerLot: number; slippagePoints: number }`,
  `ZERO_COSTS` constant, `COST_PRESETS` by asset class (Forex / Índices / Metales / Cripto) as
  named constants WITH rationale comments (follow the `contractSizeFor` pattern in
  `trading.models.ts`), and a `costPresetFor(symbol)` resolver mirroring `contractSizeFor`'s
  symbol classification. Include a `pointsToPrice(points, pointSize)` helper — spread/slippage are
  in POINTS; predicates need price units (derive pointSize per symbol the way the app already does
  — see `derivePointSize` usage in selectors; if a per-symbol static point size is needed, add it
  to the value object as `pointSize` resolved at session/context level, NOT read inside the engine).
- `emulador/src/app/state/trading/fill-engine.ts` — sided predicates (RFC §2, exact):
  - Fills (Bid candle `c`, spread `s` in price units): Buy Limit `c.low + s <= E`; Buy Stop
    `c.high + s >= E`; Sell Limit `c.high >= E`; Sell Stop `c.low <= E`. Execution price = exact
    level on its side (buys at Ask ⇒ recorded entry stays `E`, the level; the trader pays the
    spread implicitly via the sided trigger).
  - Exits: Long SL `c.low <= SL` (Bid); Long TP `c.high >= TP` (Bid); Short SL `c.high + s >= SL`
    (Ask); Short TP `c.low + s <= TP` (Ask).
  - Slippage: deterministic `slippagePoints`, applied ONLY to stop-type executions (stop entries
    and SL exits), always against the trader; default off (0).
  - Commission: `commissionPerLot` per round-turn charged at close:
    `grossProfit` (executed prices) − `commission` = `profit` (net). `rMultiple` stays net over
    the geometric 1R (I-2 intact: `riskUsd` unchanged).
  - All of it behind OPTIONAL trailing `costs?: ExecutionCosts` args (D14.C); absent/zero ⇒
    predicates degenerate EXACTLY to the current ones (V-1).
- `emulador/src/app/state/trading/trading.models.ts` — `ClosedTrade += { grossProfit?, commission? }`
  (optional, additive); `TradingData += { executionCosts? }` (optional; absent = legacy zero-cost
  session) including `pickTradingData`.
- Wiring: session's effective `executionCosts` flows from `TradingData` into the `processCandle` /
  `endSession` / manual-close paths as an explicit argument (action payload or reducer state read —
  reducer already owns the trading slice so reading `state.executionCosts` inside the reducer's
  `on(processCandle)` is acceptable and avoids action-shape churn; engine still receives it as an
  argument). Pre-existing reducer specs must stay green (absent field = zero cost).
- Payload round-trip: wherever `TradingData` is serialized (session payload mapping
  `services/session-sync.mapping.ts`, `.session.json` import/export, `SavedSession`) the optional
  field must survive a round trip; absent field parses to legacy zero-cost. Round-trip tests in
  NEW spec files.
- R3 check: read `pipeline/fill_r2.py` and CONFIRM bars are Bid (MT5 convention); record the
  finding verbatim in the task report (if not Bid, stop and report BLOCKED — the Ask derivation
  point D14.D would need remapping).

### Tests to write FIRST (new files only)
- `state/trading/execution-costs.spec.ts` — presets resolve per symbol class; zero preset for
  unknown; value object shape.
- `state/trading/fill-engine.sided.spec.ts` — the 8 predicates (V-3): one test per row of the RFC
  tables, plus boundary equality cases; V-1 anchor: a representative battery of Task-1 scenarios
  run twice (no costs vs `ZERO_COSTS`) asserting deep-equal results; V-2 property: for a grid of
  non-negative costs, `profit <= grossProfit` always; slippage applied only to stop-type
  executions and always adverse; commission charged exactly once per closed trade (including
  `closeSession` force-closes and manual closes).
- Round-trip specs for the payload field (new file, following the existing round-trip idiom).

### Out of scope
UI for presets (Task 6). MAE/MFE (Task 3). Do not modify pre-existing predicate specs (they ARE
V-1's anchor).

## Task 3: Mark-to-market, MAE/MFE excursions, floating equity

**Where it fits:** Step 3 — continuous valuation over the same base walk (no extra pass), sealing
physical excursions into `ClosedTrade` (V-11).

### Files in scope
- `emulador/src/app/state/trading/trading.models.ts` — `Position += { mae?, mfe?, tMae?, tMfe? }`
  (running accumulators, optional additive); `ClosedTrade += { mae?, mfe?, tMae?, tMfe? }` (sealed
  at close).
- `emulador/src/app/state/trading/fill-engine.ts` — inside the SAME per-candle walk (no second
  pass): for each open position update excursions from the adverse/favorable side prices (RFC §3,
  exact): long `adverso = max(0, E - low)`, `favorable = max(0, high - E)`; short
  `adverso = max(0, high + s - E)`, `favorable = max(0, E - low - s)`. `mae = max_k adverso_k`
  with `tMae` = time of the FIRST base candle reaching the max; `mfe`/`tMfe` analogous.
  Freshly filled positions start accumulating from their fill candle (inclusive). Sealed into the
  `ClosedTrade` on any close path (SL/TP/manual/session-end). All behind the same optional-costs /
  additive-fields discipline (V-1 intact: fields simply appear alongside identical outcomes).
- `emulador/src/app/state/selectors.ts` — `selectFloatingEquity` read model:
  `balance + Σ floatingPnL(p, currentBase)` valuing long at Bid close, short at Ask close
  (`close + s`); NOT persisted. Reuse the current-candle machinery (`selectCurrentReplayCandle`)
  but at base grain (last revealed base candle). Keep `selectFloatingPnl` (pre-existing) untouched.

### Tests to write FIRST (new files only)
- `state/trading/fill-engine.excursions.spec.ts` — hand-computed walks (long and short, with and
  without spread): MAE/MFE values and their timestamps (FIRST candle reaching the max); V-11
  properties: every `outcome==='sl'` trade has `MAE >= |entry - sl|` (⇔ `MAE_R >= 1`); every
  `outcome==='tp'` trade has `MFE >= |tp - entry|`; excursions of a same-candle-ambiguous close
  still coherent; session-end closes seal whatever accumulated.
- Selector spec (new file): floating equity long/short with spread; empty positions ⇒ balance.

### Out of scope
UI columns (Task 6). `MAE_R`/`MFE_R` are DERIVED (mae/|E−S|) at display/stats time — do not store
ratios in the model.

## Task 4: SimulationDomain (I-14 geometry, I-15 SL non-widening) + reified facts

**Where it fits:** Step 4 — the order-lifecycle law moves into a pure named domain module invoked
by the reducers; the engine's fill/close events become first-class facts for the black box (Task 5).

### Files in scope
- `emulador/src/app/state/trading/simulation-domain.ts` (NEW, pure) —
  `validateOrderGeometry(side, entry, sl, tp)` (I-14: buy ⇒ `sl < E` and (`tp === null` or
  `tp > E`); sell symmetric; coherent with the sided execution semantics of Task 2) and
  `validateSlModification(side, currentSl, nextSl)` (I-15: long accepts `sl' >= sl`, short accepts
  `sl' <= sl`; TP free). Pure functions, no framework imports.
- `emulador/src/app/state/trading/trading.reducer.ts` — `placeOrder`/`openMarket`: invalid
  geometry ⇒ state returned UNCHANGED (no mutation, no throw — non-blocking per S2);
  `modifyPosition`: widening SL rejected (state unchanged for the SL part; decide and document
  whether a mixed valid-TP+invalid-SL modification applies the TP — prefer applying the valid
  part). FIRST verify no pre-existing spec pins acceptance of invalid geometry/widening; if one
  does, STOP and report it (do not modify the spec).
- Reified facts: `OrderFilled { tradeId, fillBaseIndex, executedPrice, marketTime }` and
  `PositionClosed { tradeId, outcome, ambiguous, executedPrice, marketTime }`. Preferred design:
  `ProcessResult += facts?: DomainFact[]` built by the engine during the walk (it knows fill/exit
  candle times and prices; `fillBaseIndex` may be resolved at the effects layer from the base
  series by time — keep the engine series-index-agnostic if simpler, then the field is filled
  in by whoever holds the series). Facts surface to observers via a TRANSIENT `TradingState`
  field (e.g. `lastFacts`, overwritten per processed candle, NOT in `TradingData`, NOT persisted,
  excluded from `pickTradingData`) — effects run after reducers, so a `dispatch:false` observer
  can read them (Task 5). FIRST verify no pre-existing spec does exhaustive state-shape equality
  that a new transient field would break; if one does, report the conflict before proceeding.

### Tests to write FIRST (new files only)
- `state/trading/simulation-domain.spec.ts` — V-10 tables: valid/invalid geometries both sides
  (incl. `tp = null`), SL tighten/widen/equal both sides.
- `state/trading/trading.reducer.domain.spec.ts` — invalid placement leaves state IDENTICAL
  (reference equality where the reducer returns `state`); widening SL rejected, tightening
  accepted; TP-only modifications free; facts appear on fill/close and are overwritten (not
  accumulated) on the next candle; facts never enter `pickTradingData` output.

### Out of scope
UI feedback for rejections (S2 minimal; a silent no-op is acceptable this phase — document it).
Telemetry consumption of facts (Task 5).

## Task 5: The black box — telemetry store + passive observer

**Where it fits:** Step 5 — flight-recorder telemetry: append-only, local-only, neutral, passive.

### Files in scope
- `emulador/src/app/services/telemetry-db.service.ts` (NEW) — new object store in the EXISTING
  IndexedDB database used by `workspace-db.service.ts` (verify its name/version-upgrade path; RFC
  names the DB `emulador-workspaces`); store keyed `[sessionId, seq]`, append-only writes,
  batched (buffer + async flush outside the hot path), local-only (NO sync wiring, outside
  `SessionPayloadV2`, D9 intact). Reuse `assertNoCandles` on every batch (V-9/N-5).
- `emulador/src/app/state/telemetry/telemetry.effects.ts` (NEW) — ONE `dispatch: false` effect
  (the audited sync-effects pattern) passively observing: `ReplaySeek` (scrubber `seekTo`:
  fromTime/toTime/direction), `ReplayJump` (jumps/folds: fromTime/toTime/grain), `PlaybackToggled`
  (playing), `SpeedChanged` (msPerCandle), `TimeElapsedBeforeOrder` (on order placement: anchor =
  most recent of {session start, last seek, last order event}; pausedMs/playingMs/candlesRevealed
  accumulated in effect-local pure helpers), `DrawingSnapshot` (G3: copy-on-write frozen vector
  copy of current drawings `{type, anchorPoints[(time, price)], styleToken}` at order placement
  and at position close — read from the drawings state), plus the Task-4 facts (`OrderFilled`,
  `PositionClosed`) written as envelope events. Envelope:
  `TelemetryEvent { seq, wallClockMs, marketTime, kind, payload }`.
- Neutrality (N-1): kinds/payloads/identifiers use ONLY objective vocabulary; the V-7 detector is
  `grep -riE "hesitation|honesty|discipline|cheat|score" emulador/src/app` returning ONLY
  pre-existing unrelated hits (record the before/after output).
- V-8: measure the 16 ms/frame budget with capture active (jump-50 over M1) — document method and
  numbers in the task report (a proof-spec timing test or a documented manual measurement; do NOT
  optimize without a measured gap — R1/PHILOSOPHY §2.9).

### Tests to write FIRST (new files only)
- `services/telemetry-db.service.spec.ts` — append-only sequencing per session, batch flush,
  candle-free assertion firing on a poisoned payload (follow `workspace-db.service.spec.ts`
  idioms for IndexedDB testing).
- `state/telemetry/telemetry.effects.spec.ts` — each event kind captured with correct payload;
  effect never dispatches actions; TimeElapsedBeforeOrder anchor selection (three anchor cases);
  DrawingSnapshot is a frozen copy (mutating source drawings after capture does not alter the
  captured snapshot).

### Out of scope
Any UI for telemetry (Fase 3). Any interpretation/aggregation. Sync/LWW of telemetry (tolerable
loss by design, R4).

## Task 6: UI — history MAE_R/MFE_R columns, summary aggregates, costs (G1+G4)

**Where it fits:** Step 6 — the ONLY UI of this phase (G4): physical numbers without judgment (S1).

### Files in scope
- `emulador/src/app/components/session-summary/session-summary.component.{ts,html}` — history
  table: `MAE_R` / `MFE_R` columns next to the R-multiple column, `tabular-nums`, "—" for legacy
  trades without data; summary aggregates: mean and max of `MAE_R`/`MFE_R` alongside
  `ambiguousCount`; costs disclosure block ("costes simulados" with the session's effective
  spread/commission/slippage assumptions visible — P7 wording, Spanish copy, honest: simulated,
  never fake precision). Aggregates computed in `computeSessionStats` or a new pure helper —
  additive only (pre-existing `computeSessionStats` assertions must stay green; if extending its
  return type, additive optional fields only).
- New Session dialog (find it: the R2 New Session flow) — show the resolved cost preset for the
  chosen symbol's asset class (G1) and allow overriding the three numbers; the effective
  `executionCosts` persists into the new session's `TradingData` (Task 2 field). Spanish copy.
  Keep it minimal: a compact disclosure, not a settings page.
- `PRODUCT.md` + `DESIGN.md` tokens govern styling.

### Tests to write FIRST (new files only)
- Component/unit specs (new files): MAE_R/MFE_R rendering incl. legacy "—" fallback; aggregates
  math (mean/max ignoring undefined); costs disclosure shows the session's effective values;
  new-session dialog preset resolution + override round-trip into the dispatched session config.

### Out of scope
Cabina de Reflexión, scene surfaces, Playbook UI (Fases 2–3). Any interpretive labels (S1: numbers
only).

## Task 7: Documentation closure + KPI measurement

**Where it fits:** DoD #3 and #5 — the corpus stays truthful; the fidelity KPI gets its number.

### Scope
- `docs/architecture/DOMAIN_MODEL.md`: I-7 caveat dissolved (base-grain walk), I-14/I-15 now with
  detectors (the Task-4 suites), §8 limitations 1–3 marked resolved by RFC-014 (leave 4 with its
  new base-atom framing), I-5/I-6 tables updated with the sided predicates and optional costs.
- `docs/architecture/UBIQUITOUS_LANGUAGE.md`: entries affected (ExecutionCosts, MAE/MFE, execution
  series, telemetry envelope, reified facts) — Spanish, following the doc's existing format.
- `ambiguousCount` before/after on a reference scenario (DoD #3): build a deterministic reference
  fold (a scripted scenario spec or a documented manual session) measuring ambiguousCount under
  the legacy path vs the base-grain path; record both numbers in the walkthrough (expected: it
  falls).
- RFC-014 status field: Propuesto → Implementado (fecha).
- No code changes in this task beyond an optional measurement spec in a NEW file.

## Final phase (orchestrator)

Final whole-branch audit (branch-auditor agent re-runs all gates + invariant greps + `npm run
build` watching for new chunk types), fix wave if findings, then walkthrough.md and PR to
`develop` per `docs/engineering/git-workflow.md`.
