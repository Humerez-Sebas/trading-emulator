# Supabase Session Sync — Design (Phase 2 of 3)

**Date:** 2026-06-21
**Status:** Approved (brainstorming) — ready for implementation plan
**Branch baseline:** `claude/supabase-session-sync`, branched from `origin/main` after PR #7
(Supabase Auth foundation, Phase 1) merged (`7121f01`).
**Supersedes:** §5–§14 of `2026-06-20-supabase-auth-session-sync-design.md` for the
session-sync work. That document remains the reference for the validated domain decisions and
for Phase 1 (auth, shipped). Phase 3 (retire FastAPI) is unchanged and out of scope here.

> This is the **architecture document** for Phase 2. It folds in four product decisions taken
> in brainstorming (D1–D4 below) and ten refinements (§ "Adjustments"). The companion
> **implementation plan** is `docs/superpowers/plans/2026-06-21-supabase-session-sync.md`; the
> paste-ready **implementation handoff** is
> `docs/superpowers/2026-06-21-session-sync-implementation-handoff.md`.

---

## 1. Goal

Give the deployed (static SPA + R2) emulator **durable, portable backtest sessions** for a
small, invite-only group, by syncing user-generated session data to **Supabase Postgres + RLS**.
Local IndexedDB stays the working copy; cloud sync is **additive** (logged-out = guest =
local-only). The MT5→R2 market-data pipeline and the candle path are untouched.

### Hard boundary (bounded contexts)

```
Market Data  : MT5 → Harvester → Parquet (M1/H1/D1) → Cloudflare R2 → IndexedDB → TF generator → Replay/Chart
Session Data : Angular PWA → Supabase (Auth · Sessions · Folders · Sync)   ·   files: JSON (.emul)
```

**Supabase must NEVER store** candles, parquet, datasets, OHLC history, chart `series`, or any
derived bulk market data. Only user-generated session data. Datasets live **exclusively** in R2
+ IndexedDB. This boundary is enforced in code (§7 validators), not just by convention.

---

## 2. Product decisions (from brainstorming — do NOT re-litigate)

- **D1 — Cloud-authoritative membership.** After a successful login pull, the set of *synced*
  sessions mirrors the cloud: a session deleted on device B is removed from device A on its next
  pull. Sessions created offline that were never pushed are kept and pushed up (never lost). Each
  local session tracks whether it has been synced (`syncedAt` set) vs local-only.
- **D2 — Reliable offline catch-up.** Every edit marks its entity dirty and is pushed on
  reconnect / next login. Offline **deletes** go into a small persistent pending-delete list so
  they propagate instead of resurrecting. No full operation-log; dirty + pending-deletes only.
- **D3 — Only real sessions sync.** A session is pushed once it is *meaningful*: it has ≥1 trade
  (pending order, open position, or closed trade), OR a custom name, OR is archived. Brand-new
  untouched default sessions stay local until they become real.
- **D4 — Active = last-worked.** Each workspace is tagged locally with its active session's id
  (`activeSessionId`). On a fresh device (no local tag), the **most-recently-edited** session for
  a symbol opens; the rest become archived. "Active" stays a derived/local concept — no
  `is_active` column.

These were chosen for a **small trusting single-user-across-devices group**; Last-Write-Wins is
sufficient and a `rev`/optimistic-CAS column stays deferred.

---

## 3. Architecture (where the work lands)

- **`SessionSyncService`** (`providedIn:'root'`, new) — the orchestrator. Owns Supabase CRUD
  (list folders + session **summaries**, fetch one `payload`, conditional upsert, delete), the
  login pull+merge, and the dirty / pending-delete flushers. Uses the existing
  `SupabaseService.client`.
- **`session-sync.mapping.ts`** (new, pure — no Angular/IO; the riskiest logic, hard-TDD):
  `flattenWorkspace`, `reconstructWorkspaces`, `toPayload` / `fromPayload`, `buildSummary`
  (cheap columns + sparkline), `isRealSession` (D3), `computeSparkline`, and the guards
  `assertNoCandles` + `assertPayloadSize`.
- **`SessionSyncEffects`** (new NgRx effects) — (a) on existing edge actions, set
  `clientUpdatedAt` + schedule a debounced push; (b) on auth becoming `authenticated`, run the
  login pull. **Local-first:** every mutation still writes IndexedDB first via the current flow;
  sync is additive on top and never blocks the UI.
- **Sessions page** — renders from **`SessionSummary`** (no payload), with sparklines, folder
  ordering (drag-drop), and a dataset-recovery affordance; opening a session lazily pulls its
  `payload` and re-ingests candles from R2.

---

## 4. Supabase schema (final target)

The base tables already exist (migration `create_sessions_and_folders`, applied 2026-06-21 in
project `nfcgfrsxvdvuasbgrxdy`) with the §6 baseline of the prior spec. Phase 2 implementation
**ALTERs** them to the final target below (see plan Task 1 — *not applied during planning*).

```sql
-- folders (existing: id, owner_id, name, sort, created_at) + LWW columns
alter table public.folders
  add column updated_at        timestamptz not null default now(),
  add column client_updated_at timestamptz not null default now();
-- `sort` = folder sort_order (drag-drop). Plan Task 1 also attaches set_updated_at() to folders; LWW uses client_updated_at.

-- sessions (existing baseline) + summary/LWW columns
alter table public.sessions
  add column client_updated_at timestamptz not null default now(),  -- LWW key (client edit time)
  add column last_opened_at    timestamptz,                          -- "recently opened" sort
  add column required_datasets jsonb not null default '[]'::jsonb;   -- dataset refs at SUMMARY level (§ Adj-4)
-- existing summary columns stay: trades_count, initial_balance, balance, cursor, schema_version,
-- summary jsonb (sparkline + winRate + flags), payload jsonb (lossless, NO candles), updated_at.

create index sessions_owner_client_updated on public.sessions (owner_id, client_updated_at desc);
```

- **RLS** (`owner_id = auth.uid()`) already enabled on both tables; the anon key is safe with it.
- **`updated_at`** stays server-managed (existing trigger) for audit/ordering. **Conflict
  resolution uses `client_updated_at`** (§ Adj-3), enforced by a **conditional upsert**:

```sql
insert into public.sessions (...) values (...)
on conflict (id) do update set ... 
where public.sessions.client_updated_at < excluded.client_updated_at;   -- LWW at write time
```

- **The list query never selects `payload`** — it selects the SessionSummary projection only
  (§5). `payload` is fetched by id on open.

---

## 5. SessionSummary model (Adjustment 1)

A first-class **lightweight** projection so the Sessions page lists, sorts, filters, and renders
sparklines without ever downloading a `payload`.

```ts
interface DatasetRef { symbol: string; timeframe: 'M1' | 'H1' | 'D1'; year?: number }

interface SessionSummary {
  id: string;
  name: string;
  symbol: string;
  folderId: string | null;
  schemaVersion: number;
  updatedAt: string;          // client_updated_at (ISO) — LWW + display "last edited"
  lastOpenedAt: string | null;
  requiredDatasets: DatasetRef[];
  tradeCount: number;         // sessions.trades_count
  initialBalance: number;
  balance: number;
  cursor: number;             // replay cursor, unix seconds
  winRate?: number;           // 0..1, in summary jsonb
  sparkline?: number[];       // ≤32 downsampled equity points, in summary jsonb
}
```

- **Column vs jsonb:** fields used for **sort/filter/navigation** are real columns
  (`name, symbol, folder_id, client_updated_at, last_opened_at, trades_count, balance, cursor,
  required_datasets`). **Display-only** derived fields (`winRate`, `sparkline`) live in the
  `summary` jsonb. The list query selects every column **except `payload`** plus `summary`.
- The same shape is used by both the cloud list pull and the local IndexedDB list, so the
  Sessions page is source-agnostic.

---

## 6. Sparkline (Adjustment 2)

- **Decision:** the sparkline lives in the `summary` jsonb (display-only; not sorted/filtered),
  is **computed during save** (each sync upsert / `buildSummary`), and is **derived from
  `history`** (closed trades) as a **downsampled cumulative-equity curve, ≤32 points**.
- **Why compute-on-save, not on-read:** the Sessions list must render instantly from summaries
  with no per-row computation and no payload fetch. Equity is a pure function of `initialBalance`
  + ordered `history`, so it is cheap to compute when the session is pushed.
- **Storage impact:** ≤32 numbers (rounded) ≈ <300 bytes in the `summary` jsonb — negligible.
- **Derivation:** running balance after each closed trade (sorted by `closeTime`), then
  linearly downsample to ≤32 points. A session with no closed trades has no sparkline
  (`undefined`), and the UI renders a flat/empty placeholder.

---

## 7. Session payload contract + validators (Adjustments 6, 7, 8)

### Allowed (lossless session `payload`)
- `schemaVersion` (Adjustment 6 — mandatory in every payload)
- Full trading state: `balance, initialBalance, orders` (pending), **`positions`** (open),
  `history` (closed), `lastProcessedTime, sessionEnded, riskPct, sessionEnd, sessionName`
- Replay/view state: `currentTime` (cursor, unix s), `activeTf | customTfMinutes`, `playbackSpeed`
- Annotations: `drawings[]`, `notes[]`
- Workspace metadata: `selectedTfs`, `startRange`/`endRange`
- `requiredDatasets[]` (also surfaced as a summary column — kept in the payload too for a
  self-contained `.emul` export; the summary column is the source of truth for recovery)

### Forbidden (enforced, not just documented)
- Candles / chart `series` (any TF), parquet, dataset bytes, OHLC history, derived bulk market data
- Chart appearance (theme, `chartColors`, grid, trade-box opacity, `utcOffset`) — stays
  **user-level** (`SettingsState` → localStorage), never in a session
- Transient UI flags (`summaryOpen`, modal/drag state)
- Derivable bulk (full equity curve — derive from `history`)

### Validation strategy
```ts
assertNoCandles(payload)   // throws if any series/candles/OHLC/parquet-shaped field is present
assertPayloadSize(payload) // size guard (below)
```
Both run **before every upsert** and before every `.emul` export. `assertNoCandles` is the
defense-in-depth backstop for the bounded-context boundary (the payload TYPE already excludes
candles; the validator catches regressions and hand-built imports).

### Payload size guard (Adjustment 7 — re-evaluated)
The 256 KB figure is **too small**. The dominant term is `history`: a `ClosedTrade` serializes
to ~250–400 bytes, so 256 KB ≈ ~700 trades — a long manual M1 backtest can exceed that. Because
the **list never loads `payload`** (only on open), large payloads cost only on open and store
fine in Postgres `jsonb` (TOAST). 

**Decision:** **soft warning at 512 KB, hard reject at 2 MB.** 2 MB ≈ ~5,000+ trades plus
drawings/annotations — generous for a hand-driven backtest. An over-2 MB payload is **not
pushed** and surfaces a non-blocking warning ("esta sesión es demasiado grande para
sincronizarse"); it keeps working locally. `trades_count` in the summary lets the UI flag heavy
sessions without loading the payload.

---

## 8. requiredDatasets placement (Adjustment 4)

**Decision: `required_datasets` is a summary-level `jsonb` column** on `sessions` (and mirrored
in the `.emul` export), **not** payload-only. Rationale: dataset **recovery** — knowing which R2
partitions a session needs — must work from the **list/summary without fetching the payload**
(to show "necesita descarga" badges, pre-check availability, or recover before opening). It is
derived the same way as today (`buildRequiredDatasets(symbol, anchorTfs, years)`) and written on
every push. The payload retains a copy only so a `.emul` file is self-contained.

---

## 9. Folder ordering (Adjustment 5)

- The existing `folders.sort` column **is** the sort_order; no rename needed.
- **Drag-and-drop** reorder reassigns `sort` values (sparse integers, e.g. step 1000 to allow
  cheap insert-between), persists locally, marks the affected folders dirty, and pushes via the
  conditional upsert. LWW on folders uses `client_updated_at` (added in §4).
- Folder delete → sessions' `folder_id` becomes NULL (existing `ON DELETE SET NULL`), i.e. "Sin
  carpeta"; the delete propagates as a normal pending-delete/edge.

---

## 10. Local model additions + sync state (D1, D2, D4)

- `WorkspaceMeta.activeSessionId?: string` — local-only stable id of the active session (= its
  cloud row id once synced). The one structural addition to the local model (D4).
- **LWW clock per synced entity:** active session (on `WorkspaceMeta`), each `SavedSession`, each
  `SessionFolder` carry `clientUpdatedAt` (edit time) + `syncedAt` (last successful push).
  **dirty ⇔ `clientUpdatedAt > (syncedAt ?? 0)`** — no separate flag.
- **New `sync` IndexedDB store** (DB_VERSION bump): holds the **pending-delete list**
  (`{ entity: 'session'|'folder', id }[]`, D2) and `lastPullAt`. All sync bookkeeping stays out
  of the domain models.

---

## 11. Sync behavior (local-first, debounced, LWW)

### Edges (each mutation already persisted to IndexedDB first)
On trade open/close, archive, rename, move-to-folder, folder create/rename/reorder/delete,
session delete: set `clientUpdatedAt = now`; a **debounced** flusher conditional-upserts all
dirty entities and sets `syncedAt` on success. **Cursor/playback is special** — the replay
cursor changes every tick, so it marks dirty but flushes only on **pause / switch / close /
navigate-away** (plus a slow heartbeat while playing), **never per-tick** (matches the Phase-1
write-amplification lesson).

### Login pull + merge (order matters)
On auth `authenticated` (login or app-start with a session):
1. **Flush pending-deletes** to cloud first (so the cloud reflects our deletes before
   reconciliation).
2. **Pull folders**, merge LWW by `client_updated_at` (cloud wins iff newer). Folders before
   sessions (sessions reference `folder_id`).
3. **Pull session summaries** (no payload), merge LWW by `client_updated_at`.
4. **Cloud-authoritative membership (D1):** a local session that *was* synced (`syncedAt` set)
   but is **absent** from the pull → deleted remotely → remove locally. A local session never
   synced (`syncedAt` null) → local-only → keep + push.
5. **Flush dirty** (push local-only + locally-newer).
6. **Reconstruct active per symbol (D4):** active = session whose id == `activeSessionId`, else
   newest `client_updated_at`; the rest → archived `SavedSession[]`.

`payload` is pulled **lazily on open**; then candles re-ingest from R2 via `requiredDatasets`
(existing missing-dataset download flow). `last_opened_at` is set on open.

### Conflict = Last-Write-Wins by `client_updated_at` (Adjustment 3)
Using **client edit time**, not server write time, is essential for offline correctness: an edit
made offline at T1 and pushed at T2 must not beat a device edit made at T1.5 — server
`updated_at` would wrongly favor the later **push**, `client_updated_at` correctly favors the
later **edit**. LWW is enforced by the conditional upsert (§4) and by the pull-merge comparison.
**Multi-device caveat (documented):** client clock skew can mis-order near-simultaneous edits on
different devices; acceptable for a small trusting group, and a Lamport/logical counter can be
added later without a schema rewrite (the `id` + `client_updated_at` leave room).

---

## 12. Import / export — `.emul` (Adjustment 9)

- **Bounded contexts restated:** Market Data is Parquet/R2/IndexedDB and is **never** exported in
  a session file. Session Data is JSON.
- **Lossless `.emul` (target):** `{ schemaVersion, summary, payload }` — the cloud row minus
  server/owner fields — extension `.emul.json`. This is the **canonical, lossless, versioned**
  session file and supersedes the lossy `.session.json` (`SessionFileV1`, which drops open
  positions/riskPct/balance) for **new exports**.
- **Backward compatibility:** the lossy `.session.json` remains **importable**, migrated to the
  current schema on import via the existing `classifySession` / `migrateToCurrent` seam
  (`session.service.ts`). `schemaVersion` drives forward-only migrations.
- **Missing-dataset recovery:** on import/open, `requiredDatasets` (summary-level) is checked
  against the local datasets cache → existing missing-dataset download flow (R2). Cross-device: a
  `.emul` exported on one machine imports on another, datasets fetched from R2 as needed.
- **Scope:** the lossless representation is built for cloud sync regardless (it IS the payload).
  Wiring it to file **export/import** (`.emul`) reuses the same mapping and is a **small, clearly
  scoped** task; see the plan. It may be implemented last or deferred without affecting sync.

---

## 13. Roadmap (Adjustment 10)

**Session Sync Foundation** (Phase 2 core)
- Supabase Auth *(done — Phase 1)* · SessionSummary · Folder sync · `SessionSyncService`

**Synchronization** (Phase 2 core)
- Login pull · Merge logic (LWW by `client_updated_at`) · Dirty tracking · Pending deletes

**UX** (Phase 2)
- Session Browser (summary-driven) · Sparkline rendering · Dataset Recovery flow · Offline sync status

**Future — NOT part of this implementation**
- Sharing · Templates · Team features · Public session links

These four "Future" items are explicitly **out of scope** and must not be designed or built in
Phase 2. The session-centric `owner_id` model + metadata split anticipate them cheaply later.

---

## 14. Testing strategy

- **Unit (`ng test`) — the core risk is the mapping:** `flattenWorkspace` ↔ `reconstructWorkspaces`
  must **round-trip losslessly** for a workspace with active + archived + folders + open
  positions + drawings. Pure tests for `toPayload`/`fromPayload`, `buildSummary`/`computeSparkline`
  (downsampled equity), `isRealSession` (D3), and the validators (`assertNoCandles`,
  `assertPayloadSize` at the 512 KB/2 MB boundaries). Merge/LWW tests: cloud-newer wins,
  local-only kept, synced-absent removed (D1), pending-delete flush (D2), active reconstruction
  (D4). Supabase client **mocked** (no network in unit tests).
- **RLS:** verified by a scripted check against the project (a user cannot read/write another's
  rows) — outside the Angular suite.
- **Browser-validated (preview):** login → sessions appear; create/edit → reload persists;
  second browser/device same account → same sessions; delete propagates; logged-out guest →
  local-only, no sync; candles still load from R2 on open; sparklines render; folder drag-drop
  persists + syncs; offline edit → reconnect → pushes.

---

## 15. Risks / watch-items

- **Flatten/reconstruct fidelity** — the core risk; round-trip must be lossless. Hard TDD.
- **Cursor write-amplification** — never push per replay tick; debounce + lifecycle flush.
- **Client-clock skew** under LWW — documented; acceptable for the group; Lamport counter is the
  defined future mitigation.
- **No-candles enforcement** — a regression that lets candles into a payload would blow row size
  and breach the bounded-context boundary; the validator + size guard are mandatory.
- **Payload size for huge backtests** — 2 MB hard cap; over-cap sessions warn and stay local.
- **Secrets** — only the public anon key ships (safe with RLS); the service-role key never ships.

---

## 16. Out of scope (Phase 2)

- Sharing / collaboration / templates / public links / team features (§13 Future).
- A `rev`/optimistic-concurrency column and conflict-resolution UI (LWW by `client_updated_at`
  is sufficient for the group).
- Syncing user **preferences** (theme/appearance) to the cloud (stays localStorage).
- Retiring the FastAPI backend + the `dataSource='csv'` path — that is **Phase 3**.
- Dropping the legacy `series` IndexedDB store (later schema bump).
