## STATUS

**100% complete.**

**AREAS COMPLETE:** telemetry rejection/timer paths; Lotaje teardown; manifest/R2 ETag contract; live Supabase S6 probe; storage quota; multi-symbol persistence prerequisites.

**AREAS PARTIAL:** project Dashboard API Max Rows is not exposed by available tools, so actual S6 truncation remains explicitly unverified.

**AREAS NOT STARTED:** optional browser allocation profile; omitted because it is only confirmatory.

## FINDINGS SO FAR

The original established hot-path findings, IndexedDB lifecycle/atomicity risks, and the complete silent-incorrect path table.
It also proved `clearDatasetCandles` fixed and identified S6 as a destructive mechanism if cloud results are incomplete.
This addendum resolves every previously unverified source path and calibrates S6 without guessing.

### TD-E5 [SEQ] - S6 is proven unsafe, but project truncation and data destruction are UNVERIFIED

- **Finding name:** Unverified cloud completeness drives destructive absence semantics
- **Category:** Persistence / cloud synchronization
- **Severity:** HIGH latent
- **Scope:** session summary pull and local reconciliation
- **Evidence:** `services/session-sync.service.ts:57-64` selects summaries without `.range()`, `.limit()`, ordering, or exact count; `services/session-sync.mapping.ts:307-343` interprets a previously synced local ID missing from the input as cloud deletion. Supabase `list_tables({schemas:["public"],verbose:true})` reports `public.sessions`, RLS enabled, 6 rows. Exact SQL `select current_setting('pgrst.db_max_rows', true) as db_max_rows, count(*) as session_count from public.sessions;` -> `[{"db_max_rows":null,"session_count":6}]`. API logs show status-200 unpaginated summary requests. Security/performance advisors expose no API row-cap setting.
- **Observed pattern:** response completeness is assumed rather than proven; absence has destructive meaning.
- **Why it matters HERE:** the current six rows do not exercise any cap. `db_max_rows = null` does not expose Supabase Dashboard Max Rows and cannot prove unlimited responses.
- **Concrete risk:** a future/configured truncated response would wipe omitted local sessions; there is no evidence that this project has truncated or destroyed data.
- **Recommended direction:** paginate, request exact count, reject incomplete pulls, and prefer recoverable tombstones.
- **Migration difficulty:** MEDIUM
- **Best mechanism:** Sync-protocol change plus truncation tests
- **Acceptance condition:** an intentionally truncated response produces zero local deletions.

**S6 escalation verdict:** **NOT escalated to proven data destruction.** The mechanism is proven unsafe; configured cap, truncation, and historical destruction remain UNVERIFIED.

### TD-E6 - Telemetry append can reject after being explicitly discarded

- **Finding name:** Floating telemetry persistence rejection
- **Category:** Error handling
- **Severity:** MEDIUM
- **Scope:** telemetry effects/local persistence
- **Evidence:** `state/telemetry/telemetry.effects.ts:519` executes `void this.telemetryDb.append(...)`; `services/telemetry-db.service.ts:169-172` is async, calls `assertNoCandles(events)`, and awaits initialization. The typed-lint probe with `ignoreVoid:false` reports this exact line among 23 violations.
- **Observed pattern:** `void` suppresses awaiting but does not handle rejection.
- **Why it matters HERE:** telemetry may be lossy by policy; unhandled rejection is not an explicit loss policy.
- **Concrete risk:** global unhandled-rejection noise and silent event loss.
- **Recommended direction:** terminate the promise with an explicit rejection handler routed to diagnostics.
- **Migration difficulty:** TRIVIAL
- **Best mechanism:** Direct fix plus typed lint
- **Acceptance condition:** append rejection is observed and never becomes unhandled.

### TD-X5 - Manifest shape matches, but an absent R2 ETag becomes a valid empty cache identity

- **Finding name:** Empty ETag accepted at the pipeline/browser boundary
- **Category:** Data-pipeline integrity
- **Severity:** MEDIUM
- **Scope:** every uploaded partition
- **Evidence:** `pipeline/manifest.py:7-20,39-73` builds the same version/symbol/timeframe/partition shape consumed by `services/market-data/manifest.service.ts:35-41`; shape mismatch is refuted. `pipeline/r2_uploader.py:196-213` records `response.get("ETag", "").strip('"')`; `pages/storage-manager/storage-manager.logic.ts:20-26` and `services/market-data/data-onboarding.service.ts:164-168` use equality as cache freshness. Credentials are a non-finding: `r2_uploader.py:35-56` requires env vars; `fill_r2.py:37-47` loads optional `.env` with `setdefault` and has no hardcoded fallback.
- **Observed pattern:** missing ETag silently becomes `""` and is published as if valid.
- **Why it matters HERE:** ETag is the only shared refresh identity between pipeline and browser cache.
- **Concrete risk:** repeated missing ETags compare equal and suppress a required refresh; a changing malformed identity can cause endless redownloads.
- **Recommended direction:** reject upload responses without a non-empty ETag before manifest publication.
- **Migration difficulty:** TRIVIAL
- **Best mechanism:** Pipeline invariant and unit test
- **Acceptance condition:** uploader fails loudly when ETag is absent/empty; app manifest parser never receives an empty ETag.

### TD-D6 [SEQ] - Storage quota exhaustion has no preflight or dedicated recovery contract

- **Finding name:** Browser storage quota is an unmodelled persistence failure
- **Category:** Persistence resilience
- **Severity:** MEDIUM
- **Scope:** market-data ingestion and telemetry
- **Evidence:** exact source search `& "C:\Program Files\Git\bin\bash.exe" -lc "grep -RInE 'QuotaExceeded|navigator\.storage|storage\.estimate' emulador/src pipeline --exclude='*.spec.ts'"` -> no output (0 hits). `workers/candles-writer.ts:135-146` performs chunked writes without quota classification; `telemetry-db.service.ts:207-216` drains the buffer before a rejecting transaction.
- **Observed pattern:** quota failures enter generic catches after persistence has begun.
- **Why it matters HERE:** M1 datasets and telemetry can consume substantial browser storage; `[NSYM]` multiplies datasets.
- **Concrete risk:** partial ingestion, lost telemetry, or empty-data UI indistinguishable from absence.
- **Recommended direction:** expose storage health, estimate capacity before large ingestion, and classify `QuotaExceededError` explicitly.
- **Migration difficulty:** MEDIUM
- **Best mechanism:** Persistence-health model and integration tests
- **Acceptance condition:** quota exhaustion yields a visible recoverable state, never success/empty-data semantics.

### TD-L6 - Telemetry timer and Lotaje listener deltas are not lifecycle defects

- **Finding name:** Lifecycle false positives closed by ownership
- **Category:** Resource lifecycle
- **Severity:** INFO
- **Scope:** telemetry and Lotaje
- **Evidence:** `telemetry.effects.ts:231-234` uses a 0-ms macrotask to expire one-action origin state and has dedicated timing coverage. Lotaje document listeners are removed at `lotaje-view.ts:400-403,523-526,1703-1713`; companion `pagehide` is balanced at `companion-window.ts:170-172,194-212`; the return-button listener at `:270-277` is owned by its removable node.
- **Observed pattern:** mechanical add/remove counts included node-owned listeners that die with their nodes.
- **Why it matters HERE:** adding disposer machinery without a retained owner would increase lifecycle complexity without preventing a leak.
- **Concrete risk:** audit-driven overengineering.
- **Recommended direction:** close these TD-L1 sites; retain ownership/retaining-path review rather than numeric parity.
- **Migration difficulty:** NONE
- **Best mechanism:** Documented non-finding
- **Acceptance condition:** no leak is reported without a retaining path beyond node lifetime.

### TD-X6 [NSYM] [SEQ] - Storage is symbol-keyed; active runtime and trading ownership are not

- **Finding name:** Multi-symbol state-model prerequisite
- **Category:** Architecture readiness
- **Severity:** HIGH future blocker
- **Scope:** runtime market state, replay, trading book, persistence
- **Evidence:** mono-symbol remains frozen at `docs/engineering/domain/workspace-panels.md:15-17`; `state/market/market.reducer.ts:6-18` and `state/workspaces/workspaces.models.ts:18-30` key in-memory series by timeframe, while `domain/indexed-db.repository.ts:73-94` queries symbol plus timeframe.
- **Observed pattern:** repository plumbing supports multiple symbols, but active state and TradingBook sovereignty do not.
- **Why it matters HERE:** enabling a panel symbol selector first can pair foreign candles with singleton trading state.
- **Concrete risk:** overlays/fills execute against the wrong symbol and violate single ownership.
- **Recommended direction:** sequence an explicit RFC covering symbol-key runtime series, trading-book cardinality, replay ownership, and candle-free persistence references.
- **Migration difficulty:** HIGH
- **Best mechanism:** Architecture RFC
- **Acceptance condition:** no panel can execute unless its symbol resolves to the correct explicitly owned TradingBook and candle series.

## RESUME BRIEF

- **Role/scope:** read-only performance/lifecycle/persistence/pipeline audit at `develop` / `a2ca53b`.
- **Commands/tools:** Supabase table list -> sessions=6; SQL `current_setting('pgrst.db_max_rows',true)` -> null; security/performance advisors expose no row cap; quota grep -> 0.
- **Resolved:** manifest shape matches; empty ETag risk confirmed; telemetry rejection confirmed; Lotaje/timer suspicions closed; credentials clean.
- **Dead ends:** Dashboard Max Rows is not exposed by these tools; generic PostgREST defaults cannot prove this project's cap. Do not claim S6 destruction.
- **Remaining steps:** synthesis only; preserve unsafe-mechanism versus unverified-occurrence distinction.
- **Digest spec:** retain original hot-path/IDB priorities, add TD-E5/E6/X5/D6/X6, and close lifecycle false positives.
