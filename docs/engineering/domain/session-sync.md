# Domain: Session Persistence & Supabase Sync

The judgment behind the sync design (Supabase migration phases 1–3, RFC-011). Schema
lives in Supabase project `trading-emulator`; RLS verification in
`supabase/verify_session_rls.sql`.

## The two models — deliberately different

- **Cloud (Postgres): session-centric.** Each backtest is a first-class row; "active" is
  derived, not a mode. Folders are a first-class table (`ON DELETE SET NULL`).
- **Local (IndexedDB): workspace-centric.** Meta keyed by symbol with active `trading` +
  `sessions: SavedSession[]`.
- The sync layer **flattens/reconstructs** between them via a pure, hard-TDD'd mapping
  (`session-sync.mapping.ts`). We chose the mapping over a destructive local rewrite:
  the local model serves the UI well, and the boundary mapping is testable in isolation.

## Conflict resolution: LWW by client time, enforced in the DB

- Last-write-wins keyed on **`client_updated_at`** (never server `updated_at` — offline
  edits must not lose to later-synced older changes).
- supabase-js `.upsert()` cannot express the conditional WHERE, so the guard is a DB
  `BEFORE UPDATE` trigger (`lww_guard()`): skip unless incoming `client_updated_at` is
  strictly newer. The client stays a plain upsert. Fix at the layer that can guarantee
  it (PHILOSOPHY §4.3).
- Dirty tracking: `clientUpdatedAt > syncedAt` + a pending-delete list gives reliable
  offline catch-up.

## Payload rules (the invariants)

1. **Candle-free, always.** Candles are referenced via the `requiredDatasets` summary
   COLUMN (dataset recovery without touching the payload) and loaded from R2.
   `assertNoCandles` runs before every upsert.
2. **Single atomic payload (D9):** `SessionPayloadV2` carries trading + layout +
   linkGroups + per-symbol drawings in ONE LWW cycle. Never split into parallel synced
   objects — partial sync = corrupted workspace.
3. **Metadata/payload split:** lists render from cheap summary columns (+ ≤32-point
   equity sparkline in summary jsonb); the heavy payload is fetched on open only.
4. Size guard: 512 KB warn / 2 MB reject (256 KB proved too small).
5. **Versioned schema:** `schemaVersion` + pure `migrateV1ToV2`/`parseSessionPayload`
   with shape guards (`typeof null === 'object'` bit us once) and a defensive
   single-panel fallback. Migrations get round-trip tests, no exceptions.
6. On the wire, drawings are `Record<symbol, DrawingCollection>` (versioned collection);
   runtime/IndexedDB keep flat arrays — the V2 shape exists for wire evolution, don't
   "simplify" either side into the other.

## Restore paths (trap!)

The PRIMARY hydration path is reducer-level (`workspaceRestored`). The only LIVE
cloud-pull path is `materializeAndOpen` in the sessions page (direct-open and
download-then-open converge there). `reconstructWorkspaces` is spec-only dead code —
planning around it already caused one shipped gap (anti-patterns #7).

## Sync policy details

- Only "real" sessions sync (≥1 trade OR custom name OR archived) — scratch replay
  doesn't pollute the cloud.
- Membership is cloud-authoritative; active session = last-worked
  (`WorkspaceMeta.activeSessionId`; fresh device picks newest `client_updated_at`).
- `activeSessionId` is first-class in `TradingState` so archiving REUSES the cloud row
  id (minting a new id duplicated sessions after archive→pull).
- Exports: `.emul` is the lossless versioned format; legacy `.session.json` (V1) is
  LOSSY (drops open positions, riskPct, sessionEnd) — human export only, never a sync
  or restore source of truth.
- Chart appearance is user-level (`SettingsState` → localStorage), NOT in sessions.
  `notes` is a dormant reserved field.

## Auth context

Invite-only (public signup OFF); users are created in the Supabase dashboard — the MCP
has no auth-admin tools, so plans must mark user management as a human task. Login is
required; there is no guest mode (removed in Phase 3 deliberately).

## Verifying RLS without a second user

`supabase/verify_session_rls.sql` simulates two JWT `sub` claims under role
`authenticated` — owner-isolation proof with a single real account.
