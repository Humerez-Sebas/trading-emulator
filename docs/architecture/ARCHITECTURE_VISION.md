# Architecture Vision

| Field | Value |
| :--- | :--- |
| Status | Normative (living document) |
| Date | 2026-07-09 |
| Stage | 5 of the Engineering Knowledge Roadmap |
| Authority | Below frozen RFC decisions and `CLAUDE.md` invariants; above local judgment. The master plane every RFC from 014 onward must respect |
| Upstream sources | Stages 1-4 of this corpus, `ROADMAP.md`, RFC-001..013, `strategic_audit.md` Parts 1 and 9, `docs/engineering/domain/*.md`, `PHILOSOPHY.md` |

---

## 1. Purpose

This document fixes the strategic design of the emulator: the physical topology, the
bounded contexts and how they are allowed to talk, the offline-first persistence
mechanism, and the local CQRS flow. It exists so that every future RFC starts from
the same map instead of rediscovering (or silently eroding) the boundaries.

The system's defining constraint is deliberate: **there is no application server.**
A static Angular SPA performs all computation; Supabase provides identity and
session persistence; Cloudflare R2 provides immutable market data; IndexedDB makes
the SPA self-sufficient after download. Every architectural choice below either
follows from or defends this constraint.

---

## 2. Physical Topology

```
  +--------------------- Windows PC (operator-side) ---------------------+
  |  MT5 Terminal --- pipeline/fill_r2.py --> Parquet (M1/year, H1, D1)  |
  +------------------------------------|----------------------------------+
                                       | upload + manifest.json
                                       v
                     +----------------------------------+
                     |  Cloudflare R2 (object storage)  |
                     |  market-data/v1/<SYM>/<tf>/...   |
                     |  manifest.json  (published lang.)|
                     +----------------+-----------------+
                                      | HTTPS fetch (CORS), parquet-wasm decode
                                      v
  +--------------------------- Browser (SPA) ----------------------------+
  |                                                                       |
  |   Angular 21 + NgRx  (static deploy, Vercel; login required)          |
  |                                                                       |
  |   +------------------+   RenderModel -->  +------------------------+  |
  |   |  NgRx store       |                    |  ChartEngine (vanilla) |  |
  |   |  (write model +   |  <-- ChartEventBus |  + Capabilities        |  |
  |   |   read models)    |                    +------------------------+  |
  |   +---------+---------+                                               |
  |             |                                                         |
  |             v                                                         |
  |   IndexedDB `emulador-workspaces`                                     |
  |   (shared candle cache + workspace meta; offline-after-download)      |
  +-----------------------------------|-----------------------------------+
                                      | supabase-js (auth JWT, RLS)
                                      v
                     +----------------------------------+
                     |  Supabase (Postgres + Auth)      |
                     |  sessions / folders rows, LWW    |
                     |  trigger lww_guard(), RLS        |
                     +----------------------------------+
```

Properties worth defending:

- The market-data plane is **read-only and immutable** from the SPA's perspective;
  the write path exists only on the operator's Windows PC (pipeline).
- The cloud persistence plane stores **user work only** (sessions, folders), never
  market data — and session payloads are candle-free by invariant.
- Replay never touches the network: after dataset download, the entire training loop
  (clock, fills, rendering, drawings) is local. Offline-first is a UX principle
  (PRODUCT_PRINCIPLES anti-reference 3), realized here.

---

## 3. Bounded Contexts and Context Map

### 3.1 The contexts

| Context | Aggregate root | Physical home |
| :--- | :--- | :--- |
| Market Data | per-symbol Series | `services/market-data/*`, `services/market-data-db.ts`, `state/market/*`, `pipeline/` (external leg) |
| Simulation / Trading | `TradingBook` (engine scope) / `TradingData` (persisted scope) | `state/trading/*` |
| Workspace / Presentation | `Session` | `state/layout/*`, `state/link-groups/*`, `state/drawings/*`, `state/workspaces/*`, `components/*` |
| Chart Rendering (subcontext of Presentation, isolated) | `ChartEngine` | `emulador/src/app/domain/chart/*` |
| Identity & Sync (supporting) | Supabase session row | `state/auth/*`, `state/sync/*`, `services/session-sync.*`, `supabase/` |

### 3.2 The context map (relationships and DDD patterns)

```
                       [ Market Data ]
                       /             \
        Customer/Supplier         Customer/Supplier
        (fill context reads        (panels read series
         candles + coverage)        via selectors)
                     /                 \
       [ Simulation/Trading ] ---- [ Workspace/Presentation ]
                     \   embedded in Session payload   /
                      \                               /
                  Published Language          Anti-Corruption Layer
                  (SessionPayloadV2,          (ChartModelMapper ->
                   versioned, migrated)        RenderModel)
                              \                       |
                               v                      v
                     [ Identity & Sync ]      [ Chart Rendering ]
```

- **Market Data -> consumers: Customer/Supplier.** Consumers depend on the supplier's
  published shapes (`Candle`, coverage bounds, `selectSessionTfs`). The supplier
  never knows its consumers. DTO leaks between Market Data and Workspace are banned
  (RFC-007); enforcement is grep-level and audit-level.
- **Pipeline -> frontend: Published Language.** `manifest.json` plus the
  `market-data/v1/<SYMBOL>/<tf>/<file>` bucket layout is the entire contract; the
  schema is documented in `pipeline/manifest.py`. Neither side imports the other.
- **Presentation -> Chart Rendering: Anti-Corruption Layer.** The engine defines its
  own local types in `domain/chart/render-model.ts` (its `Position`, `PendingOrder`,
  `Drawing`, `Candle` are distinct from the NgRx-side types). The per-panel
  `ChartModelMapper` is the translator. Data crosses in as immutable `RenderModel`;
  events cross out via `ChartEventBus`. Nothing else crosses — no Angular, no NgRx
  imports inside the engine, ever.
- **Everything -> Identity & Sync: Published Language.** `SessionPayloadV2` is a
  versioned wire format with pure migrations (`migrateV1ToV2`, shape guards,
  round-trip tests). Sync is orchestration (`dispatch: false` effects) reacting to
  facts; it adds no domain behavior.
- **Simulation inside Session: composition, not integration.** `TradingData` is
  embedded in the session payload (atomic D9 unit). The strategic audit flags the
  long-term risk of one JSONB coupling trading history to drawing schema churn;
  physically separating them is an acknowledged *future* decision requiring its own
  RFC and migration ceremony (PHILOSOPHY Section 3.4) — not a refactor.

### 3.3 Isolation rules (the executable form)

| Rule | Detector |
| :--- | :--- |
| Engine imports no Angular/NgRx | framework-independence greps in audits; highest-ceremony code area |
| No candles in session payloads | `assertNoCandles` at every upsert + `CANDLE_KEYS` deep walk |
| No Market Data <-> Workspace DTO leaks | RFC-007 discipline, audit greps |
| No shared factory selectors for panel views (D8) | anti-patterns #1, audit greps |
| `syncPriceScale` stays unread (R3) | zero-read-site verification in audits |
| No spec-util/vitest imports in app code | build-probe sentinel (chunk watch) |
| One candle cache (R4) | review rule: any second cache is an automatic finding |

---

## 4. The Local CQRS Flow

The application applies CQRS locally: a single write model (NgRx reducers applying
pure domain functions) and many cheap read models (selectors and per-panel mappers).
The asymmetry is deliberate — writes are rare and serialized; reads are per-frame
and per-panel.

```
   user gesture / HUD / ChartEventBus     autoplay, folds, sync policies
                 |                                   |
                 v                                   v
             COMMANDS  (NgRx actions)  <---------- POLICIES (effects)
                 |
                 v
   WRITE MODEL: reducers delegating to pure domain services
     - trading.reducer -> processCandle / closeSession / lotsForRisk
     - replay.reducer  -> currentTime, resolution, playback state
     - layout / link-groups / drawings reducers -> Session aggregate facets
                 |
                 |  (immutable state transitions; atomic per action)
                 v
   READ MODELS: selectors (memoized projections)
     - temporal: selectReplayIndex / selectReplaySeries / selectFormingCandle
     - financial: selectFillContext, session stats
     - structural: selectSessionTfs, layout/link-group views
     - persistence: selectWorkspaceMetaSnapshot (candle-free slice)
                 |
                 v
   PER-PANEL PROJECTION (D8): one local ChartModelMapper instance per panel
     composes raw slices -> immutable RenderModel -> ChartEngine.render()
```

Rules that keep the flow sound:

1. **Commands are the only write path.** No service mutates state; sync and
   persistence *observe* projections (`selectWorkspaceMetaSnapshot`) instead of
   owning writes.
2. **The write model is pure.** Money-path transitions are pure functions with
   hard-TDD coverage; effects stay thin (dispatch decisions, no business math).
3. **Read models scale horizontally.** N panels means N independent single-slot
   memoizers (D8), never one parameterized shared selector — the factory-selector
   ban exists because single-slot memoization produces zero percent hit rate at N
   panels.
4. **Reads are update-gated.** Hidden panels stay mounted but their mapper feeds
   gate to zero work (D6); engines are created lazily on first visibility.
5. **The engine is a projection consumer.** It renders `RenderModel` snapshots and
   raises UI events; it holds no domain state and issues no commands itself — the
   Angular host translates bus events into commands.

This is "local CQRS" in the precise sense the knowledge roadmap intends: separation
of command handling from reactive projections inside one process, with no event
store — NgRx state is the system of record in memory, IndexedDB its durable shadow.

---

## 5. Offline-First Persistence: IndexedDB and Supabase

### 5.1 The two deliberately different models

| | Local (IndexedDB) | Cloud (Supabase Postgres) |
| :--- | :--- | :--- |
| Shape | workspace-centric: meta keyed by symbol, active `trading` + `sessions: SavedSession[]` | session-centric: each backtest a first-class row; "active" derived, not a mode |
| Optimized for | the running UI and replay loop | listing, recovery, multi-device |
| Heavy data | shared candle store per symbol/tf (`${symbol}\|${tf}`), datasets `${symbol}\|${tf}\|${year}` | none — payloads are candle-free |
| Folders | referenced by id | first-class table, `ON DELETE SET NULL` |

The sync layer flattens and reconstructs between them through a pure, hard-TDD'd
mapping (`session-sync.mapping.ts`). The mapping was chosen over a destructive local
rewrite: the local model serves the UI well, and a pure boundary mapping is testable
in isolation.

### 5.2 Write path (edit -> cloud)

```
  any persisted-slice edit
      -> selectWorkspaceMetaSnapshot emits (candle-free by construction)
      -> flushOnEdit$ (2 s debounce)
      -> markActiveDirty: clientUpdatedAt = now        (dirty <=> clientUpdatedAt > syncedAt)
      -> flushDirty:
           isRealSession?  (orders/positions/history, custom name, or ended)
           assertNoCandles (deep key walk)
           assertPayloadSize (512 KB warn / 2 MB reject)
           flatten -> upsert row (plain upsert; LWW guard lives in the DB)
      -> Postgres BEFORE UPDATE trigger lww_guard():
           accept iff incoming client_updated_at is strictly newer
```

The LWW key is **client** time, never server time — offline edits must not lose to
later-synced older changes. The guard lives in the database because supabase-js
cannot express the conditional upsert: fix at the layer that can guarantee it
(PHILOSOPHY Section 4.3).

### 5.3 Read path (login / device recovery)

```
  Auth: Check Session -> Session Resolved / Auth Success
      -> login$ pulls rows (membership is cloud-authoritative)
      -> LWW merge against local (client_updated_at)
      -> reducer-level hydration: workspaceRestored  (the PRIMARY restore path)
  Live cloud open: sessions page -> materializeAndOpen
      (direct-open and download-then-open converge here; the ONLY live pull path)
  Datasets: payload's requiredDatasets -> missing-dataset prompt -> R2 fetch
```

Trap, documented so it is never re-learned: `reconstructWorkspaces` is spec-only
dead code; planning around it already shipped one gap.

### 5.4 Deletes and identity

- Deletes are recorded in a pending-delete list for offline catch-up
  (`propagateDelete$`).
- `activeSessionId` equals the cloud row id once synced and survives
  archive/switch/import — archiving must reuse the row, never mint a new identity
  (the historical duplicate-session defect).

### 5.5 Sync invariants (summary)

1. Candle-free payloads, always (detector: `assertNoCandles`).
2. One atomic payload per LWW cycle (D9) — partial sync equals corrupted workspace.
3. LWW strictly-newer acceptance, enforced in Postgres.
4. Only Real Sessions sync (scratch replay stays local).
5. Metadata/payload split: lists render from summary columns (+ <= 32-point equity
   sparkline); heavy payload fetched on open only.
6. Versioned schema with pure, round-trip-tested migrations and defensive fallbacks.

---

## 6. Market Data Plane

- **Shape:** MT5 -> `pipeline/fill_r2.py` -> Parquet (M1 by year; H1/D1
  conveniences) -> R2 (+ manifest) -> browser fetch -> parquet-wasm decode ->
  IndexedDB shared store. No server; CORS on the bucket.
- **Ground truth:** M1. Other TFs derive client-side (`aggregateCandles`, custom TFs
  from best base). UI offers only TFs with data (`selectSessionTfs`).
- **The measured truth of this plane:** ingest is the bottleneck, not the network
  (fetch ~3.8 s vs IndexedDB insert ~700 s per M1 symbol-year). Download pipelining
  is *rejected with numbers*; the deferred lever is per-row index cost rework.
  Availability questions answer from coverage cursors (~24 ms) and must never
  trigger candle loads.
- **Anchor discipline:** sessions reference only `AnchorTf` datasets
  (`'M1' | 'H1' | 'D1'`), keeping `requiredDatasets` small, stable, and
  recovery-sufficient.

---

## 7. Cross-Cutting Budgets and Gates

- **Performance is a budget, not a virtue:** 16 ms/frame; `MAX_PANELS_PER_TAB = 8`
  as a named hard cap; update-gating and lazy creation already in place; optimize
  only a measured gap.
- **Security:** RLS owner-isolation on session rows (verifiable single-account via
  `supabase/verify_session_rls.sql`); invite-only signup; login required — there is
  no guest mode by decision.
- **Enforcement is mechanical wherever possible:** the verification gates (tsc x2,
  `ng test`, lint, build probes) plus audit greps are the executable form of this
  document. An architectural rule that cannot be checked will erode (PHILOSOPHY
  Section 2.7).

---

## 8. Evolution Vision

### 8.1 Near term (the RFC-014+ seams this corpus prepares)

1. **A real domain layer for order validation.** I-14/I-15 (order geometry, SL
   non-widening) need domain-layer enforcement so validation stops living in the
   presentation layer.
2. **Base-resolution engine loop.** Strengthen the realism invariant so execution
   always evaluates at the finest data (dual-timeframe loop), removing
   placement-candle latency without sacrificing I-8's idempotence.
3. **Execution cost model.** Spread/commission/slippage as explicit, disclosed
   simulation parameters.
4. **Reified domain events.** `OrderFilled` / `PositionClosed` as first-class facts
   carrying execution context, enabling journaling and rule evaluators without
   state diffing (EVENT_STORMING Section 8).
5. **Knowledge conservation tiers.** The black-box telemetry register (passive,
   local, neutral) and the permanent Playbook/Lesson tier with its own LWW cycle —
   the system observes and conserves; the trader interprets
   (`TRADER_KNOWLEDGE_MODEL.md`).

Details and sequencing: `RFC-014_AND_BEYOND.md` (the Mastery Block, Phases 0-3).

### 8.2 Long term (contingent, non-goals until demanded)

The strategic audit sketches scaling stages (dedicated analytics service at ~1k
users, server-validated execution for challenge integrity at ~10k, distributed reads
beyond). This vision records them as *contingent seams*, not plans: the current
product is personal-use, and every stage requires its own RFC with measured demand.
What the architecture already guarantees for that future: the fill engine is pure
and portable (could run server-side unchanged), payloads are versioned wire formats,
and contexts are separated enough to be extracted along the mapped boundaries.

### 8.3 Frozen non-goals (unchanged, revocable only by explicit RFC)

Mono-symbol session (D1); single-level grid; no floating panels; no web workers;
`syncPriceScale` reserved-unimplemented; session-scoped drawings; no live trading,
no broker adapters (ROADMAP charter); no application server.

---

## 9. References

- Stages 1-4: `UBIQUITOUS_LANGUAGE.md`, `DOMAIN_MODEL.md`, `EVENT_STORMING.md`,
  `PRODUCT_PRINCIPLES.md`.
- `docs/architecture/ROADMAP.md`, RFC-001..013 and the 008-012 vision document.
- `docs/architecture/strategic_audit.md` Parts 1, 7, 8, 9.
- `docs/engineering/PHILOSOPHY.md`; `docs/engineering/domain/chart-engine.md`,
  `workspace-panels.md`, `replay-trading.md`, `session-sync.md`,
  `data-pipeline.md`; `docs/engineering/performance.md`.
