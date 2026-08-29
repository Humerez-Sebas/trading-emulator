## STATUS

**100% complete.**

**AREAS COMPLETE:** I1-I6 verification including split I3 verdict; reducer/effect reads; settings, telemetry, and market-cache ownership; component/output/service sweeps; full Lotaje stack; ChartSyncBus/Router and large-service verdicts.

**AREAS PARTIAL:** none.

**AREAS NOT STARTED:** none.

## FINDINGS SO FAR

The original established I1 clause-2/I2/I6 drift, D8 compliance, three writers to trading metadata, and declaration-order trading coupling.
It also cleared RxJS operator/leak concerns and rejected a wholesale Signals migration.
This addendum closes I3 and all previously unverified ownership/abstraction rows.

### TD-15 [NSYM] [SEQ] - Candle data has two durable owners and leaks into the local Workspace aggregate

- **Finding name:** Duplicate durable candle ownership
- **Category:** State ownership / domain boundary
- **Severity:** HIGH
- **Scope:** Market data, workspace persistence, IndexedDB
- **Evidence:** `state/workspaces/workspaces.models.ts:1,13-20` embeds `Candle[]` series in `Workspace`, alongside user state at `:21-50`; `WorkspaceMeta` only omits series at `:53-58`. `services/workspace-db.service.ts:38-44,154-181` persists/reconstructs full series through `SERIES_STORE`; `domain/indexed-db.repository.ts:10-16,73-94` reads canonical rows from `CANDLES_STORE`; `state/workspaces/workspaces.effects.ts:238-249` copies every `csvLoaded` array into `SERIES_STORE`. Exact write-path command: `$series=@(git grep -n -E "putSeries\(|appendSeriesChunk\(" -- "emulador/src/app" ":(exclude)**/*.spec.ts"); "SERIES_WRITE_MATCHES=$($series.Count)"` -> 3 matches (definitions `workspace-db.service.ts:154,190`; writer `workspaces.effects.ts:246`).
- **Observed pattern:** one dataset can exist as canonical candle rows, a duplicated workspace series array, and active NgRx state. No authority/conformance rule links them.
- **Why it matters HERE:** multi-symbol panels require identity by symbol/timeframe; the local aggregate currently mixes Market Data and User Workspace despite invariant 3.
- **Concrete risk:** re-ingestion/deletion can update `CANDLES_STORE` while workspace restore revives stale `SERIES_STORE` data under a panel label.
- **Recommended direction:** make the MarketDataRepository/candle store the sole durable authority; persist dataset identities in workspaces and resolve arrays through the repository/cache.
- **Migration difficulty:** HIGH
- **Best mechanism:** `[NSYM]` architecture RFC
- **Acceptance condition:** Workspace/WorkspaceMeta contain no candle arrays; restoration resolves required datasets through one canonical repository; a round-trip test proves it.

### TD-16 [SEQ] - State imports a component-owned analytics module

- **Finding name:** State-to-component dependency inversion
- **Category:** Layer boundary
- **Severity:** MEDIUM
- **Scope:** Journal analytics
- **Evidence:** `state/journal/journal-read.models.ts:5-8` imports `components/session-summary/excursion-stats.ts`; that module imports trading state at `excursion-stats.ts:1`. Exact scan: `$m=@(git grep -n -E "(/components/|/pages/)" -- "emulador/src/app/state" ":(exclude)**/*.spec.ts"); "COUNT=$($m.Count)"` -> one production match, `journal-read.models.ts:8`.
- **Observed pattern:** pure excursion/R arithmetic is physically owned by a component, forcing state -> component -> state coupling.
- **Why it matters HERE:** journal and session summary are independent surfaces; `[SEQ]` analytics should survive UI restructuring.
- **Concrete risk:** moving/replacing SessionSummary breaks the state read-model builder and encourages more analytics under UI folders.
- **Recommended direction:** move only pure excursion arithmetic/types to a domain/read-model module; retain presentation strings in the component.
- **Migration difficulty:** LOW
- **Best mechanism:** Focused refactor plus scoped `no-restricted-imports`
- **Acceptance condition:** the state-to-component/page scan returns zero production matches.

### TD-17 [CAP] - Large reducers and sync abstractions are mostly cohesive; one service has a real split seam

- **Finding name:** Reducer and accidental-framework closeout
- **Category:** Abstraction cost / responsibility
- **Severity:** MEDIUM
- **Scope:** trading, drawings, telemetry, ChartSync, Lotaje, SessionSync
- **Evidence:** `trading.reducer.ts:1-470` delegates fill math to `fill-engine.ts`; `drawings.reducer.ts:1-541` consistently owns normalized entities plus per-panel history; `telemetry.effects.ts:1-521` is passive and delegates fact/anchor construction. Chart sync transport/routing are separated at `domain/chart/chart-sync-bus.ts:1-49` and `components/workspace/chart-sync-router.ts:1-133`. Lotaje imports no chart/framework layer: `$m=@(git grep -n -E "^import .*(@angular|@ngrx|domain/chart|state/|components/)" -- "emulador/src/app/lotaje/*.ts" ":(exclude)**/*.spec.ts"); "COUNT=$($m.Count)"` -> 0. `SessionSyncService` spans sessions/folders (`session-sync.service.ts:1-581`), playbook (`:588-707`), lessons (`:709-833`), and active-session flattening (`:835-914`); AST count = 21 methods + 1 getter + 1 constructor.
- **Observed pattern:** trading reducer, telemetry effects, ChartSyncBus/Router, and Lotaje each have coherent boundaries. Drawings history is a valid future pure seam. SessionSync accumulated four independently changing policies.
- **Why it matters HERE:** splitting sound mechanisms would reset audited confidence; failing to split SessionSync couples destructive session semantics to durable knowledge entities.
- **Concrete risk:** generic sync cleanup transfers delete/LWW behavior between sessions, playbook, and lessons; premature reducer splits obscure ordered domain behavior.
- **Recommended direction:** KEEP trading/telemetry/ChartSync/Lotaje. SPLIT-LATER drawings history when modifier work begins. SPLIT SessionSync by entity policy and move pure mappings beside each domain.
- **Migration difficulty:** MEDIUM
- **Best mechanism:** Focused refactor, no generic repository framework
- **Acceptance condition:** knowledge mappings are framework-free sibling modules; SessionSync no longer spans all four entity families; reducers retain current behavior and identity-return properties.

### TD-18 [CAP] - Component/service layering is pragmatic but not a consistently enforced architecture

- **Finding name:** Component responsibility and output API closeout
- **Category:** Angular boundaries
- **Severity:** LOW-MEDIUM
- **Scope:** component tree and services
- **Evidence:** exact output scan: `git grep -n "output<" -- "emulador/src/app" ":(exclude)**/*.spec.ts"` -> 32; `git grep -n -E "EventEmitter|@Output" ...` -> 0. Direct component-to-service imports total 7: `data-wizard.guard.ts:3`; `interval-dialog.component.ts:23-29` (five lines across timeframe/session/manifest/onboarding imports); `missing-dataset-dialog.component.ts:2`; `session-summary.component.ts:25`. The unread component sweep found coherent local concerns in color/date/dropdown/interactive-candles/journal-viz; `frozen-scene-host.component.ts:298-300` is an intentional second engine host.
- **Observed pattern:** modern signal outputs are consistent. Leaf UI components are mostly coherent, while workflow dialogs legitimately call infrastructure directly; the folder tree communicates intent but does not enforce it.
- **Why it matters HERE:** a third chart host would repeat capability registration and raw `seriesApi` access; `[CAP]` parallelism needs a host profile rather than another bespoke setup.
- **Concrete risk:** direct service access spreads orchestration into components and a third engine host increases I1/I2 bypass sites.
- **Recommended direction:** do not ban all component-to-service imports. Enforce only domain and state dependency directions; introduce a named capability profile if a third chart host appears.
- **Migration difficulty:** LOW
- **Best mechanism:** Targeted lint zones plus threshold-triggered extraction
- **Acceptance condition:** domain imports remain framework-free, state imports no UI, outputs remain signal-based, and any third chart host reuses an explicit capability profile.

**Closed invariant table:** I1 clause 1 TRUE / clause 2 VIOLATED; I2 NO; I3 cloud DTO TRUE but local aggregate/durable ownership VIOLATED; I4 TRUE; I5 TRUE; I6 NO. `session-sync.mapping.ts:19-37,72-90,196-198` and `session-sync.service.ts:111-113` prove cloud payloads are candle-free even though the local Workspace boundary fails.

**Re-ranked recommendations:** (1) `[NSYM][SEQ]` establish one durable candle authority and symbol-key runtime state; (2) give `WorkspaceMeta.trading` one writer; (3) `[CAP]` close raw `chartApi`/`seriesApi` escape hatches and encode I1/I2.

## RESUME BRIEF

- **Role/scope:** Principal Engineer, read-only Angular/NgRx/RxJS/state audit at `develop` / `a2ca53b`.
- **Commands/output:** domain Angular/NgRx imports = 0; state -> component/page = 1; Lotaje chart/framework imports = 0; `output<` = 32, EventEmitter/@Output = 0; root `models.ts` importers = 64 all TS / 38 excluding specs (37 excluding testing fixture).
- **Files closed:** full Lotaje stack, reducers, telemetry effects, settings persistence, candle stores, ChartSyncBus/Router/specs, unread component set, SessionSync domains.
- **Dead ends:** no factory-selector, immutability, RxJS operator/leak, action-naming, constructor-DI, or Signals-migration work.
- **Remaining steps:** synthesis only; preserve split I3 verdict rather than reducing it to pass/fail.
- **Digest spec:** <=140 lines with I1-I6 table, ownership closeout, TD-15/16, justified abstractions, and re-ranked top three.
