# Event Storming: The Dynamic Model

| Field | Value |
| :--- | :--- |
| Status | Normative (living document) |
| Date | 2026-07-09 |
| Stage | 3 of the Engineering Knowledge Roadmap |
| Language authority | `docs/architecture/UBIQUITOUS_LANGUAGE.md` |
| Structural authority | `docs/architecture/DOMAIN_MODEL.md` |
| Upstream sources | `emulador/src/app/state/**/*.actions.ts`, `replay.effects.ts`, `state/sync/session-sync.effects.ts`, `domain/chart/chart-event-bus.ts`, `chart-sync-bus.ts` |

---

## 1. Method and Mapping Conventions

This document maps the system's behavior over time: commands (intentions), domain
events (accomplished facts), policies (automated reactions), and read models
(reactive projections). The system is a local, single-user, event-driven NgRx
application; classic Event Storming vocabulary maps onto it as follows:

| Event Storming element | Implementation locus |
| :--- | :--- |
| Command | NgRx action dispatched by a user gesture or a policy |
| Aggregate | Reducer + the pure domain functions it delegates to |
| Domain Event | A state transition fact. Mostly *implicit* today: folded inside reducer transitions rather than reified as distinct actions. This document assigns each fact a canonical conceptual name so future RFCs share stable vocabulary |
| Policy / Process manager | NgRx effect |
| Read Model | NgRx selector (and, per panel, the local `ChartModelMapper` projection into `RenderModel`) |
| UI-local event | `ChartEventBus` emission (`ChartClicked`, `CrosshairMoved`, `VisibleRangeChanged`) — deliberately **not** domain events; they never reach the store as facts |

Conceptual event names below (e.g. `OrderFilled`) are normative vocabulary. Where an
event is implicit, its **implementation locus** column states exactly where the fact
occurs today. Reifying them as literal actions or bus messages is a design decision
for future RFCs, not a requirement of this document.

---

## 2. The Pivotal Timeline: Replay Advancement (the heartbeat)

Everything in the emulator ultimately reacts to one fact: **the replay clock
advanced**. The complete causal chain for one advancement:

```
  USER GESTURE / AUTOPLAY POLICY
  (Playback HUD: step, jump, display-advance; or autoplay$ interval tick)
        |
        |  Command: Replay/[Advance Candle | Advance Display | Jump Forward]
        v
  +--------------------- POLICY: foldForwardFills ----------------------+
  |  (replay.effects.ts — advanceDisplay$ / jumpForward$; advance$ for  |
  |   single steps)                                                     |
  |                                                                     |
  |  For EVERY base/resolution candle strictly crossed, in order:       |
  |     Command: Trading/[Process Candle] (ctx = selectFillContext)     |
  |  Then finally:                                                      |
  |     Command: Replay/[Go To Time] (the new cursor)                   |
  +----------------------------------------------------------------------+
        |                                          |
        |  per crossed candle                      |  cursor commit
        v                                          v
  [ TradingBook aggregate ]                 [ Replay aggregate ]
  processCandle(book, candle,               reducer sets currentTime
  subCandles, contractSize)                        |
        |                                          |
        |  Domain Events (implicit,                |  Domain Event:
        |  atomic per candle):                     |  ReplayClockAdvanced
        |   - CandleRevealed                       |
        |   - OrderFilled            (0..n)        |
        |   - PositionClosed(sl|tp)  (0..n)        |
        |   - TradeMarkedAmbiguous   (0..n)        |
        |   - BalanceUpdated         (0..1)        |
        v                                          v
  +---------------------------- READ MODELS ----------------------------+
  |  selectReplayIndex (at-or-before-T binary search, per panel/TF)      |
  |  selectReplaySeries / selectResolutionSeries / selectFormingCandle   |
  |  selectFillContext (feeds the NEXT advancement)                      |
  |  per-panel ChartModelMapper -> immutable RenderModel -> ChartEngine  |
  |  session metrics (computeSessionStats), equity sparkline             |
  |  freeze-on-last projection for gapped symbols                        |
  +----------------------------------------------------------------------+
```

Three structural properties of this loop are load-bearing:

1. **Fan-out, not fan-in.** There is ONE clock (`replay.currentTime`); N panels
   project from it independently. No panel owns time.
2. **Fold, not skip.** Forward motion that crosses multiple candles dispatches one
   `Process Candle` per crossed base-resolution candle, in chronological order — this
   is what guarantees the Base Resolution realism invariant (DOMAIN_MODEL I-7/I-8)
   even when the UI jumps several display candles at once.
3. **Atomic book transitions.** Each `Process Candle` application commits fills,
   exits, and balance together (DOMAIN_MODEL Section 3.1); the implicit events listed
   above are facets of one atomic fact, never separately observable.

---

## 3. Canonical Domain Event Catalog

### 3.1 Replay context

| Conceptual event | Triggering command(s) | Implementation locus | Notes |
| :--- | :--- | :--- | :--- |
| `ReplayClockAdvanced` | `Advance Candle`, `Advance Display`, `Jump Forward`, `Go To Time` | `replay.reducer` sets `currentTime` | The heartbeat; strictly monotonic during fill-processing motion |
| `CandleRevealed` | `Process Candle` dispatch per crossed candle | `foldForwardFills` (`replay.effects.ts`) | One per base-resolution candle, ordered |
| `ReplayCursorRewound` | `Step Back`, `Jump Back` | `replay.reducer` | Review-only: no fills simulated, none unwound |
| `ReplaySeekPerformed` | `Seek To` | `replay.reducer` | Teleportation: frozen semantics, skipped range is NOT simulated |
| `ReplayResolutionChanged` | `Set Replay Resolution` | `replay.reducer.resolutionMinutes` | Changes the advance grain, not the displayed TF |
| `PlaybackStarted` / `PlaybackPaused` | `Play` / `Pause` | `replay.reducer.playing` | `autoplay$` policy ticks `Advance Candle` while playing |
| `PlaybackSpeedChanged` | `Change Speed` | `msPerCandle` (default 500) | |
| `JumpSizeChanged` | `Set Jump Size` | `jumpSize` (default 10) | |
| `EndOfDataReached` | emitted by `advance$` | `End Of Data` action | The only replay action that IS a reified domain event today |

### 3.2 Simulation / Trading context

| Conceptual event | Triggering command(s) | Implementation locus | Notes |
| :--- | :--- | :--- | :--- |
| `OrderPlaced` | `Place Order` | `trading.reducer` (lots derived via `lotsForRisk`, I-1) | Pending limit/stop enters the book |
| `MarketPositionOpened` | `Open Market` | `trading.reducer` | Opens directly as a Position |
| `OrderModified` | `Modify Order` | `trading.reducer:140-165` | Pending only; re-derives lots at constant `riskPct` |
| `OrderCancelled` | `Cancel Order` | `trading.reducer` | |
| `OrderFilled` | (none — market fact) | inside `processCandle` step 1 (`orderFills`) | PendingOrder becomes Position; identity continuous; fill sub-index recorded for I-7 |
| `PositionModified` | `Modify Position` | `trading.reducer:131-137` | SL/TP change on an open position; see I-15 enforcement gap |
| `PositionClosed` | (none — market fact) or `Close Position` (manual) | `resolveExit` inside `processCandle`; manual path in reducer | Carries `outcome: 'sl' \| 'tp' \| 'manual'` |
| `TradeMarkedAmbiguous` | (facet of `PositionClosed`) | `ExitDecision.ambiguous` -> `ClosedTrade.ambiguous` | Pessimism must remain disclosed (I-9) |
| `BalanceUpdated` | (facet of close events) | same atomic transition (I-4) | Never independently observable |
| `SessionEnded` | `End Session`, or scheduled `sessionEnd` reached, or `EndOfDataReached` | `closeSession` (outcome `'session-end'`) | Open positions force-closed, pending orders discarded |
| `RiskParametersChanged` | `Set Risk Pct`, `Set Initial Balance` | `trading.reducer` | Affects future placements only; never open trades |
| `TradeBoxVisibilityChanged` | `Set Trade Box Hidden`, `Delete Trade Box` | presentation flags on `ClosedTrade` | Presentation-only mutation of an otherwise immutable record |

### 3.3 Session lifecycle and persistence context

| Conceptual event | Triggering command(s) | Implementation locus | Notes |
| :--- | :--- | :--- | :--- |
| `SessionCreated` | `New Session` | `trading.reducer` + workspace wiring | Practice Parameters bound (symbol, range, datasets) |
| `SessionArchived` / `SessionSwitched` | `Switch Session` | `TradingState.savedSessions` | Cursor captured; `activeSessionId` identity preserved |
| `SessionRestored` | `Restore Session`, `Workspace Restored` | reducer-level hydration (the PRIMARY restore path) | Live cloud-pull converges in `materializeAndOpen` only |
| `SessionImported` | `Session Imported` | import flow (`.emul` lossless) | |
| `SessionRenamed` / `SessionFolderChanged` | `Rename Session`, `Set Session Folder` | reducer | |
| `SessionDeleted` | `Delete Session`, `Delete Active Session` | reducer + `propagateDelete$` records pending cloud delete | |
| `WorkspaceSnapshotDirtied` | (any persisted-slice edit) | `selectWorkspaceMetaSnapshot` emission | Not an action: a projection change observed by the sync policy |
| `SessionSyncedToCloud` | (none — background fact) | `flushOnEdit$` -> `markActiveDirty` + `flushDirty` (`session-sync.effects.ts`, dispatch: false) | Deliberately actionless: sync is orchestration, not domain behavior |
| `AuthSessionResolved` | `Check Session` -> `Session Resolved` / `Auth Success` | `auth.actions.ts` | Triggers `login$` cloud pull-and-merge (LWW) |

### 3.4 Workspace / Presentation context

| Conceptual event | Triggering command(s) | Implementation locus | Notes |
| :--- | :--- | :--- | :--- |
| `PanelAdded` / `PanelRemoved` / `PanelMoved` | `Add Panel`, `Remove Panel`, `Move Panel` | `layout.reducer` | Bounded by `MAX_PANELS_PER_TAB = 8` (I-12) |
| `GridTemplateApplied` | `Apply Grid Template` | `layout.reducer` (non-destructive: parks, never deletes) | Re-focuses a rendered panel if the focused one parks |
| `PanelFocused` | `Set Focused Panel` | `layout.reducer` + `syncTimeframeOnFocus$` policy | Two-way binding with global TF (see Section 5) |
| `PanelTimeframeChanged` | `Set Panel Timeframe` | `layout.reducer` | Panel-local by design; does NOT move the global TF |
| `GlobalTimeframeChanged` | `Change Timeframe` (Market) | writes the focused panel's TF | |
| `TabCreated` / `TabClosed` / `TabRenamed` / `TabActivated` | `Create Tab`, `Close Tab`, `Rename Tab`, `Set Active Tab` | `layout.reducer` | |
| `LinkGroupCreated` / `LinkGroupRemoved` | `Create Group`, `Remove Group` | `link-groups.reducer`; delete cascades `Set Panel Link Group (null)` | |
| `LinkGroupChannelToggled` | `Set Sync Crosshair`, `Set Sync Time Range` | `link-groups.reducer` | `syncPriceScale` reserved: no command exists, by audit |
| `DrawingAdded` / `DrawingMoved` / `DrawingDeleted` | `Add Drawing`, `Move Drawing`, `Delete Selected`, `Clear Drawings` | `drawings.reducer` | Session-scoped, per-symbol; geometry only |
| `AssetSwitched` | `Switch Asset` (with `then*` continuation options) | `workspaces.actions.ts` | A process-manager command carrying its follow-up intent |
| `MarketDataLoaded` | `Csv Loaded`, dataset download completion | `market` feature | Series enter the shared cache below the aggregate |

---

## 4. Policies (Process Managers)

| Policy | Listens to | Emits / does | File |
| :--- | :--- | :--- | :--- |
| `autoplay$` | `playing` + `msPerCandle` read models | interval-ticks `Advance Candle` | `replay.effects.ts` |
| `advance$` | `Advance Candle` | `Go To Time` at next replay-series candle, or `End Of Data` | `replay.effects.ts` |
| `advanceDisplay$` | `Advance Display` | `foldForwardFills` -> N x `Process Candle` + final `Go To Time` | `replay.effects.ts` |
| `jumpForward$` | `Jump Forward` | same fold, jumpSize candles, clamped | `replay.effects.ts` |
| `stepBack$` | `Step Back` | display-grid snap-back (no fills) | `replay.effects.ts` |
| `syncTimeframeOnFocus$` | `Set Focused Panel` | `Change Timeframe` (global) | `layout.effects` |
| `login$` | `Session Resolved` / `Auth Success` | cloud pull-and-merge (LWW), then hydration | `session-sync.effects.ts` |
| `flushOnEdit$` | `selectWorkspaceMetaSnapshot` (2 s debounce) | `markActiveDirty` + `flushDirty` (dispatch: false) | `session-sync.effects.ts` |
| `propagateDelete$` | `Delete Session` | records pending cloud delete | `session-sync.effects.ts` |
| Chart sync fan-out | panel `CrosshairMoved` / `VisibleRangeChanged` | group-scoped re-application with origin exclusion and value-keyed idempotence | `ChartSyncBus` / sync router (RFC-010) |

Design note: the sync policies are deliberately `dispatch: false`. Persistence and
cloud sync are *orchestration reacting to facts*, never new domain behavior — a local
application of the CQRS discipline formalized in `ARCHITECTURE_VISION.md`.

---

## 5. Synchronization Boundaries: what crosses, what stays isolated

Per the Cognitive Context Shift concept (analysis channels are decoupled by default;
synchronization is an on-demand bridge):

| Signal | Scope | Mechanism |
| :--- | :--- | :--- |
| Replay clock | GLOBAL — all panels, always | One cursor; per-panel at-or-before-T projection; freeze-on-last for gaps |
| Crosshair position | Link Group members only, opt-in | `ChartSyncBus` fan-out, origin exclusion |
| Visible time range | Link Group members only, opt-in | same, value-keyed idempotent application |
| Price scale | NOBODY — reserved | `syncPriceScale` has zero read sites (audited) |
| Chart clicks | Panel-local, always | `ChartEventBus` only; never multiplexed |
| Panel timeframe | Panel-local; focused panel bridges to global TF | `Set Panel Timeframe` local; focus two-way binds global TF |
| Trading state | Primary symbol only (D1) | View-only panels have no trading channel at all |

---

## 6. Temporal Consistency Rules (the timeline's laws)

These rules prevent the "orders in limbo after time-rewind" failure class named in
`engineering_knowledge_roadmap.md` Stage 3:

1. **Forward motion simulates; backward motion reviews.** Only forward advancement
   (`advance`, `advanceDisplay`, `jumpForward`) processes fills. `stepBack` and
   `jumpBack` move the view; they never unwind the book. Combined with DOMAIN_MODEL
   I-8 (placement exclusion, open-time guard, high-water mark), stepping back and
   forward across the same candles is a no-op for the book.
2. **Seek is teleportation.** `Seek To` moves the cursor without simulating the
   skipped range. A session's book is therefore a function of the *processed* path,
   not of the cursor position. This is a frozen decision; documents must not
   "discover" it as a bug.
3. **Fills are folded in order.** Multi-candle advancement dispatches `Process
   Candle` per crossed candle chronologically; no candle is skipped, none is
   processed twice (`lastProcessedTime`).
4. **The book never observes the future.** All fill context derives from
   at-or-before-cursor projections; nothing right of the cursor exists for the
   Simulation context.
5. **Statistics are order-independent.** `computeSessionStats` sorts by `closeTime`;
   any read model derived from history is insensitive to insertion order.

---

## 7. Read Model Inventory (projections)

| Read model | Projects | Consumers |
| :--- | :--- | :--- |
| `selectReplayIndex` | cursor -> index in replay series (binary search) | fill pipeline, HUD |
| `selectVisibleIndex` | cursor -> display-TF index | display navigation (distinct from replay-resolution index) |
| `selectReplaySeries` / `selectResolutionSeries` | active advance-grain series | replay engine loop |
| `selectFormingCandle` | partially formed display candle from revealed resolution candles | chart rendering during intrabar stepping |
| `selectFillContext` | `{candles, idx, tfSeconds, lower, contractSize, trading}` | `Process Candle` dispatches |
| `selectSessionTfs` | timeframes that actually have data | every TF picker (global and per-panel) |
| Per-panel `ChartModelMapper` | store slices -> immutable `RenderModel` | `ChartEngine` (one local instance per panel, D8) |
| `computeSessionStats` | history -> SessionStats | summary modal, metrics HUD |
| `selectWorkspaceMetaSnapshot` | candle-free persistable slice | IndexedDB persistence + cloud sync policy |
| Coverage projections (`getCoverage`, `intersectBounds`) | dataset availability bounds | symbol/session pickers (never load candles) |

---

## 8. Known Gaps in the Event Fabric (future RFC material)

1. **Domain events are implicit.** `OrderFilled` and `PositionClosed` exist only as
   facets of a reducer transition. Any consumer that needs the *moment* of a fill
   (journaling, challenge-mode rule evaluation, AI session review) currently has to
   diff state. Reifying a domain event stream is the natural enabler for the
   journal aggregate and challenge evaluator (see `RFC-014_AND_BEYOND.md`).
2. **No event carries execution context.** A future `OrderFilled` event should carry
   the fill sub-index and ambiguity provenance so downstream consumers do not
   re-derive them.
3. **Sync facts are invisible.** `SessionSyncedToCloud` has no observable fact in the
   store (by design today); surfacing sync status as a read model is UX work, not a
   domain change.
4. **The scheduled `sessionEnd` boundary** is enforced during advancement, but no
   distinct `SessionEndScheduleReached` fact exists; the `SessionEnded` event
   conflates its three causes (manual, scheduled, end-of-data) into one outcome
   value.

---

## 9. References

- `docs/architecture/UBIQUITOUS_LANGUAGE.md`, `DOMAIN_MODEL.md` (Stages 1-2).
- `docs/architecture/engineering_knowledge_roadmap.md` — Stage 3 charter.
- `emulador/src/app/state/replay/replay.actions.ts`, `replay.effects.ts`,
  `replay.reducer.ts`.
- `emulador/src/app/state/trading/trading.actions.ts`, `trading.reducer.ts`,
  `fill-engine.ts`.
- `emulador/src/app/state/layout/layout.actions.ts`,
  `state/link-groups/link-groups.actions.ts`, `state/drawings/drawings.actions.ts`,
  `state/workspaces/workspaces.actions.ts`, `state/market/market.actions.ts`,
  `state/auth/auth.actions.ts`, `state/settings/settings.actions.ts`.
- `emulador/src/app/state/sync/session-sync.effects.ts`.
- `emulador/src/app/domain/chart/chart-event-bus.ts`, `chart-sync-bus.ts`.
