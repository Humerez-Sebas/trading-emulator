# Supabase Auth + Session Sync — Design

**Date:** 2026-06-20
**Status:** Approved (brainstorming) — ready for implementation plan
**Branch baseline:** `claude/supabase-auth-session-sync`, branched from `origin/main` after PR #5
(emulator UX + perf fixes) merged (`2adb1ec`).

> ⚠️ Local `main` is stale/diverged (1 orphan commit, 46 behind `origin/main`). Any
> implementation session must branch from `origin/main`, not local `main`.

## 1. Goal

Give the deployed (static SPA + R2) emulator **durable, portable sessions** for a small,
known group of users, by adopting **Supabase** (managed Auth + Postgres + RLS), and
**retire the now-redundant FastAPI/Postgres backend** and the frontend's legacy
`dataSource='csv'`/backend path. The MT5→R2 data pipeline is untouched. No new product
features beyond accounts + session sync.

Why now: with `dataSource='r2'`, the browser reads `manifest.json` + parquet straight from
R2 into IndexedDB. The FastAPI backend's candle store / `/candles` serving / `/ingest` are
dead weight; the only genuinely missing capability is that **sessions live only in browser
IndexedDB** (per-browser, lost on storage-clear or device switch).

## 2. Global constraints

- **Stack/style:** Angular 21 standalone + signals + NgRx; Spanish user-facing text; match
  surrounding files. App state + candle `time` are unix **seconds**.
- **Local-first:** IndexedDB (`emulador-workspaces`) stays the working copy and the offline
  layer. Supabase is the durable sync/backup. Logged-out = **guest** (local-only, no sync) —
  login is **additive**, never a wall in front of the tool.
- **Bounded contexts:** market data (immutable, R2 → IndexedDB candles) and session data
  (mutable, user-owned, Supabase) stay separate. **Session payloads NEVER contain candles.**
- **Local model unchanged:** the local IndexedDB stays **workspace-centric** (today's model).
  Session-centric is the **cloud** model; the sync layer maps between the two (§7). This
  avoids a destabilizing rewrite of the working app.
- **Scale:** small known group (invite-only). No public signup, no multi-tenant scale, no
  billing.

## 3. Architecture

```
Static SPA (Vercel) ──reads──> Cloudflare R2   (manifest.json + parquet → IndexedDB candles)
        │
        ├──auth──────────────> Supabase Auth   (email/password, invite-only)
        └──session sync──────> Supabase Postgres + RLS  (sessions, folders)

MT5 → parquet_builder → r2_uploader → R2        (host scripts, UNCHANGED)
```

Three runtime pieces, **no server the team operates**: the static SPA, Cloudflare R2 (data),
Supabase (auth + session DB). The FastAPI/Postgres/Docker stack is removed (§8).

## 4. Authentication

- **Supabase Auth, email/password, invite-only.** Public signup disabled; users are
  provisioned by an admin (Supabase dashboard / MCP). Keeps `registrationEnabled: false`.
  Supabase issues + refreshes tokens (replaces the FastAPI cookie+JWT flow and
  `RefreshToken` rotation).
- **Client:** `@supabase/supabase-js`. `SUPABASE_URL` + `SUPABASE_ANON_KEY` live in
  `environment*.ts` (like `marketDataBaseUrl`). The anon key is public-by-design — **RLS is
  the protection** (§6).
- **Auth state mapping** (`authFeature`, `AuthStatus = unknown|authenticated|anonymous|offline|guest`):
  - `authenticated` → a valid Supabase session (`supabase.auth.getSession()`); cloud sync ON.
  - logged-out / `guest` → local-only (IndexedDB), no sync.
  - `offline` → had a session but Supabase unreachable → keep working locally, sync resumes
    when reachable.
  The cookie-session check against `backendUrl` is replaced by `supabase.auth`.
- **Login UI:** a simple email + password screen (no register link). Password reset via
  Supabase email is optional (defer unless trivial). Guest entry preserved.

## 5. Session domain model (cloud) — session-centric

A **Session = one backtest run** (first-class): `{ id, owner_id, folder_id, symbol, name,
full trading state, replay cursor, drawings, view state, schema_version }`. "Active" is a
**derived flag** (which session is currently open for a symbol), not a structural type.

A **Folder** is first-class (`id, owner_id, name, sort`); sessions reference `folder_id`
(folder delete → "Sin carpeta", i.e. `ON DELETE SET NULL`). Cross-asset, flat (no nesting),
mirroring today's `SessionFolder {id,name,order}`.

This replaces the lossy `.session.json` (`SessionFileV1`) as the sync contract:
`SessionFileV1` is a *finished-backtest snapshot* (drops open `positions`, `riskPct`,
`sessionEnd`, `lastProcessedTime`, live `balance`). Cloud sync must be **lossless** to resume
a backtest mid-flight. `.session.json` import/export stays as-is for file portability.

## 6. Supabase schema (proposed)

```sql
-- folders: normalized; mirrors SessionFolder
create table folders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
alter table folders enable row level security;
create policy folders_owner on folders
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- sessions: session-centric, metadata/payload split
create table sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  folder_id uuid references folders(id) on delete set null,
  symbol text not null,
  name text not null,
  schema_version int not null,              -- = SESSION_VERSION (format/migration)
  -- summary (cheap; the Sesiones list never fetches `payload`):
  trades_count int not null default 0,
  initial_balance numeric not null,
  balance numeric not null,
  cursor bigint not null default 0,         -- replay cursor, unix seconds
  summary jsonb not null default '{}',      -- downsampled equity sparkline (≤32 pts), flags
  -- heavy (fetched on open):
  payload jsonb not null,                   -- LOSSLESS session state, NO candles
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table sessions enable row level security;
create policy sessions_owner on sessions
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index sessions_owner_updated on sessions (owner_id, updated_at desc);

-- updated_at maintained server-side (LWW)
create trigger sessions_touch before update on sessions
  for each row execute function moddatetime(updated_at);   -- or an inline trigger fn
```

- **RLS** (`owner_id = auth.uid()`) is the only isolation; the anon key is safe with it.
- **Versioning:** `schema_version` (format, drives migration — already exists as
  `SESSION_VERSION` + `classifySession`/`migrateToCurrent`); `updated_at` (server-managed)
  drives **Last-Write-Wins**. A `rev`/optimistic-CAS column is **deferred** (only pays off
  under simultaneous multi-device edits; `id` + `updated_at` leave room to add it later).
- **No-candles guard** (defense in depth): the payload TYPE has no candle field; the sync
  layer **validates/strips** any `series`/`candles`/byte content before upsert and **rejects
  payloads > ~256 KB**.

## 7. Session payload contract (the `payload` JSONB)

**Allowed (lossless session):**
- `schemaVersion`
- Full trading state: `balance, initialBalance, orders` (pending), **`positions`** (open),
  `history` (closed), `lastProcessedTime, sessionEnded, riskPct, sessionEnd, sessionName`
- Replay/view: `currentTime` (cursor, unix s), `activeTf | customTfMinutes`, `playbackSpeed`
- Annotations: `drawings[]`, `notes[]` (reserved/optional — schema field exists, no UI yet)
- Data refs: `requiredDatasets[]` (`symbol/tf/year`), `startRange/endRange`

**Forbidden:**
- Candles / `series` arrays (any TF), dataset bytes, parquet
- Chart appearance (theme, `chartColors`, grid, trade-box opacity, `utcOffset`) — **user-level**
  (today in `SettingsState`, persisted to localStorage). Stays out of sessions; optional
  future per-user `preferences` sync is a separate concern.
- Transient UI flags (`summaryOpen`, modal/drag state)
- Derivable bulk (e.g. full equity curve — derive from `history`)

## 8. Local model ↔ cloud mapping (sync layer)

The local store stays **workspace-centric** (`meta` keyed by symbol; each `WorkspaceMeta` has
`trading` = the active session + `sessions: SavedSession[]` = archived). The sync layer maps:

- **Flatten (local → cloud):** for each symbol's workspace, emit one session row for the
  active `trading` (stable id needed — see below) and one per `SavedSession` (its `id`). The
  `payload` is built from `TradingData` + cursor + drawings + view state + `requiredDatasets`
  (derived from the symbol's downloaded datasets, as `exportSession` already does).
- **Reconstruct (cloud → local):** group session rows by `symbol`; the row with the newest
  cursor/open flag becomes the workspace's active `trading`, the rest become `SavedSession[]`.
  Candles are loaded from R2/IndexedDB via `requiredDatasets` (reuse the existing
  missing-dataset download flow).
- **Stable ids:** archived `SavedSession` already has an `id`. The *active* session needs a
  stable id to map to a cloud row (today it's implicit per workspace). Introduce a stable
  `activeSessionId` on the workspace meta (local-only field) so the active session maps to one
  cloud row across edits. (This is the one small local-model addition required.)
- **Folders:** `SessionFolder` (local `folders` store) ↔ `folders` table by `id`.

## 9. Sync behavior (hybrid-at-edges, local-first, LWW)

- **On login:** `select` the user's `folders` + session summaries; merge into IndexedDB
  (cloud wins when its `updated_at` is newer; otherwise keep local). Pull a full `payload`
  lazily **on open**.
- **On open a session:** ensure the row's `payload` is pulled, reconstruct into the
  workspace, candles re-ingest from R2 (missing-dataset flow if needed).
- **On edges (save / close / switch session, archive, rename, move-to-folder, folder CRUD):**
  debounced `upsert` of the affected session/folder. Edges that fail (offline) retry on the
  next edge; a small pending-queue is acceptable but not required for v1.
- **Conflict:** **Last-Write-Wins** by `updated_at` (sufficient for one user across devices /
  a small trusting group).
- **Delete:** deleting a session/folder locally issues a `delete` (RLS-scoped).

## 10. Retirement of the old backend (this effort)

- **Delete** the FastAPI app + its DB: `backend/app/**` (routers `auth`, `candles`, `ingest`,
  `symbols`, `user_symbols`; `models`, `db`, `deps`, `security`, `schemas`, `config`, `flags`,
  `main`), `backend/alembic/**`, `backend/scripts/create_user.py`, `backend/fill_r2.py`, and
  the corresponding `backend/tests/**` for the deleted surfaces (`test_auth`, `test_candles`,
  `test_ingest`, `test_health`, `test_user_symbols`).
- **Keep** the MT5→R2 pipeline (standalone host scripts, no FastAPI):
  `backend/harvester.py`, `backend/parquet_builder.py`, `backend/r2_uploader.py`,
  `backend/manifest.py`, `mt5_common.py`, and their tests (`test_harvester`,
  `test_parquet_builder`, `test_r2_uploader`, `test_manifest`). Update `backend/README.md`.
- **Docker:** remove the API + Postgres/Timescale services and the backend `Dockerfile`
  from `docker-compose.yml` (and any nginx reverse-proxy of API routes). The deploy is the
  static SPA + R2 + Supabase only.
- **Frontend: remove the `dataSource='csv'`/backend path.** Delete `BackendApiService`, the
  cookie-auth flow, the `series`-store legacy path (`CsvMarketDataRepository` /
  `csv-legacy.repository`), and the `dataSource` flag + `pickMarketDataRepository` branch
  (R2 becomes the only path). In `crear-sesion`, remove the `source: 'backend' | 'csv'`
  toggle and the backend-catalog branch.
  - **OPEN DECISION (confirm on review):** the client-side **CSV-upload** feature lives in
    this same `dataSource='csv'` path. Recommendation: **remove it** (the group uses R2;
    YAGNI). If you want to keep "upload your own CSV" under R2, it must be explicitly
    re-scoped as a kept feature — say so and the plan will preserve it instead.
- The legacy `series` IndexedDB store can be dropped in a later schema bump (not required for
  v1; leaving it dormant is harmless).

## 11. Frontend integration points (where the work lands)

- New: a `SupabaseService` (client + auth), a `SessionSyncService` (flatten/reconstruct +
  edge upserts + login pull), and the login screen.
- Changed: `authFeature`/effects (Supabase session check instead of cookie), the Sesiones
  page (sync on edges + login pull; otherwise unchanged UI), workspace meta (add
  `activeSessionId`), `environment*.ts` (Supabase URL/key; drop `backendUrl`/`dataSource`),
  app bootstrap (init Supabase, restore session).
- Removed: see §10 (backend path, CSV/backend dataSource).

## 12. Testing

- **Unit (`ng test`):** the flatten/reconstruct mapping (workspace ↔ session rows) is pure and
  unit-tested (the riskiest logic). Payload validators (no-candles, size guard) are pure.
  Auth-state reducer transitions. Mock the Supabase client (no network in unit tests).
- **Supabase:** RLS policies verified (a user cannot read/write another's rows) — via a
  scripted check against a test project, not in the Angular suite.
- **Browser-validated (preview):** login → sessions appear; create/edit a session → reload →
  it persists; second browser/device with same account → same sessions; logged-out guest →
  local-only, no sync; candles still load from R2 on open.

## 13. Risks / watch-items

- **Auth migration:** replacing the cookie/FastAPI auth touches the app's auth bootstrap;
  guest/offline coexistence must be preserved exactly.
- **Flatten/reconstruct fidelity:** the workspace↔session mapping must round-trip losslessly
  (active + archived + folders + open positions). Unit-test it hard; it's the core risk.
- **LWW data loss:** acceptable per scope, but document it; the `updated_at` + stable `id`
  leave room for `rev`/conflict-detection later.
- **No-candles enforcement:** a regression that lets candles into a payload would blow row
  size/cost — keep the validator + size guard.
- **Removing CSV-upload** (if confirmed) is a user-facing feature removal — confirm on review.
- **Secrets:** only the anon key ships in the SPA (safe with RLS). The service-role key never
  ships to the client.

## 14. Out of scope (deferred, no rewrite needed later)

- Session sharing / collaboration, templates, public strategy exports, Supabase Storage
  (screenshots / backups), cross-user analytics. The session-centric `owner_id` model +
  metadata split anticipate these cheaply.
- A `rev`/optimistic-concurrency column and conflict-resolution UI.
- Syncing user **preferences** (theme/appearance) to the cloud (stays localStorage for now).
- Dropping the legacy `series` IndexedDB store (later schema bump).
