# Session Sovereignty V2 — run ledger

Agent A · Wave 2 · branch `agent/session-sovereignty-v2` · base `894d72b` (`WAVE2_BASE_SHA`)
Worktree `C:\Users\78701\Desktop\trading-emulator-session-sovereignty`

## STATUS

Phase: A1 inventory complete (read-only). Design converging. No production code written yet.

Baseline verified installed: `npm ci` exit 0 in `emulador/`.

## COMPLETED

- Read `CLAUDE.md`, `docs/engineering/PHILOSOPHY.md`, `docs/engineering/domain/session-sync.md`.
- Read the direct precedent: root `SESSION_SYNC_RED_TEAM.md` (Wave 1/2 agent C). V1 (truncated
  pull) is fixed in the base; V2 (wrong-owner pull) is the mission and is pinned as a
  known-unfixed hazard by an existing spec (`session-sync.service.spec.ts:918`).
- A1 durable-store inventory (see table below).
- Traced the complete V2 mechanism end to end, plus TWO additional reachable paths the
  red-team report did not name (in-memory carry-over; playbook/lessons exposure).

## IN FLIGHT

Nothing committed yet.

## NOT STARTED

A2 decision matrix doc, A3 implementation, A4 negative probes, A5 `WorkspaceMeta.trading`
investigation, A6 deliverable docs.

## EVIDENCE

### A1 — durable local ownership surface (read from code, not assumed)

Physical IndexedDB databases (4) + localStorage keys (5).

| DB | ver | store | key | payload | user-owned? | remote twin | sync policy | logout | migration |
|---|---|---|---|---|---|---|---|---|---|
| `emulador-workspaces` | 6 | `meta` | `symbol` | `WorkspaceMeta` (trading, sessions, drawings, layout, panels, linkGroups, LWW clocks) | **YES** | `sessions` table | LWW, **absence ⇒ delete** | untouched | v1→v3 legacy migration in `onupgradeneeded` |
| `emulador-workspaces` | 6 | `folders` | `id` | `SessionFolder` | **YES** | `folders` table | LWW, **absence ⇒ delete** | untouched | created at v3 |
| `emulador-workspaces` | 6 | `sync` | `key` | `pendingDelete:<id>`, `lastPullAt` | **YES** (bookkeeping) | — | local only | untouched | created at v6 |
| `emulador-workspaces` | 6 | `candles` | auto-inc | `CandleRecord` | **NO — market data** | R2 parquet | etag cache | untouched | created at v5 |
| `emulador-workspaces` | 6 | `datasets` | `id` | `DatasetRecord` (etag/size) | **NO — market data** | R2 manifest | etag cache | untouched | created at v5 |
| `emulador-workspaces` | 6 | `series` | `symbol\|tf` | `Candle[]` (legacy CSV) | **NO — market data** | — | local only | untouched | created at v2 |
| `emulador-playbook` | 1 | `rules` | `id` | `PlaybookRule` | **YES** | `playbook_rules` | LWW, never deletes | untouched | — |
| `emulador-lessons` | 1 | `lessons` | `id` | `Lesson` (journal/reflection) | **YES** | `lessons` | LWW, never deletes | untouched | — |
| `emulador-telemetry` | 1 | `events` | `[sessionId,seq]` | `TelemetryEvent` | **YES** (loss-tolerant by design) | — | local only, append-only | untouched | — |

localStorage: `emulador.settings` (user-level chart appearance), `emulador.currentAsset`,
`emulador.calculadora` (lotaje inputs), per-widget drag positions, plus the Supabase auth
session (`sb-*`). None are user-scoped.

Consumers of `emulador-workspaces` beyond `WorkspaceDbService`:
`app/domain/indexed-db.repository.ts:33` and `app/workers/candles-writer.ts:67` — both open it
**without a version** and only touch `candles`. This is the hard constraint that forbids
renaming the whole database per owner.

### Mechanism (reconstructed, three distinct reachable paths)

P1 — destructive pull (the assigned defect, red-team V2):
`login$` (`state/sync/session-sync.effects.ts:47`) fires on `sessionResolved`/`authSuccess`
→ `pullAndMerge()` → `listSummaries()` returns `[]` with `error == null` and `count == 0` for
user B (RLS is correct) → `assertCompletePull` passes (the answer IS complete) →
`mergeByLww(local, [], syncedIds)` puts every previously-synced local id in
`toDeleteLocalIds` → `pullAndMergeSessions` splices `meta.sessions` and resets
`meta.trading = defaultTradingData()` → `putMeta`. A's data destroyed. Same shape for folders
→ `db.deleteFolder(id)`.

P2 — cross-account adoption on push (NOT in the red-team report):
`pullAndMerge` step 5 `flushDirty()` runs AFTER the destructive pull. A's **never-synced**
local sessions/folders survive the delete branch (`syncedIds` misses them) and are then
upserted with `owner_id = B` (`upsertSession`/`upsertFolder` stamp `currentUserId()`).
A's private local-only sessions are uploaded into B's cloud account.

P3 — in-memory carry-over (NOT in the red-team report):
`loggedOut` is handled only by `auth.reducer.ts:55` (auth slice) and
`redirectAfterLogout$` (SPA navigation). No feature state is reset and the document is never
reloaded, so after logout the NgRx store still holds A's `market`/`replay`/`drawings`/
`trading`/`layout`/`linkGroups`/`workspaces` state. B's first `switchAsset` runs
`doSwitch` step 1, which `putMeta`s the OUTGOING (A's) snapshot; `persistMeta$` (300 ms
debounce) does the same. Storage partitioning ALONE does not stop this — the write is
performed while authenticated as B, so it lands in B's partition. Requires a separate fix.

P4 — private-knowledge exposure (NOT in the red-team report):
`emulador-playbook` and `emulador-lessons` are origin-scoped too, and
`PlaybookEffects.bootstrapHydrate$` / `LessonsEffects` hydrate from them on
`ROOT_EFFECTS_INIT`. On a page load as B, B's UI renders A's playbook rules and A's
lessons (the trader's journal: `whatHappened` / `repeat` / `avoid` free text). Their merges
never delete, so nothing is destroyed — this is an exposure/adoption defect, not a loss one.

## NEGATIVE PROBES

None yet. Planned probe design: revert the owner scoping (single line: make the owner DB name
resolve to the legacy constant) and require the new specs to fail.

## DEAD ENDS & REFUTED HYPOTHESES

- **"Rename `emulador-workspaces` per owner"** — REJECTED. `candles`/`datasets`/`series` are
  Market-Data domain (invariant 3) and re-ingesting M1 costs ~700 s per symbol-year
  (measured, PHILOSOPHY §1.2). The ingestion worker and `IndexedDbMarketDataRepository`
  also open the name directly with no version, and the worker must not learn about user
  identity. Renaming the whole DB duplicates the candle cache per user and breaks the
  domain separation.
- **"A sync-layer identity gate alone is enough"** — REFUTED against the acceptance
  criteria. It stops P1 and P2 but not P3 or P4: B still *sees* and can *mutate* A's
  workspace/playbook/lessons state because those reads never go through the sync layer.

## NEXT STEPS

1. Write PROGRESS.md + commit (this).
2. Implement owner-partitioned user-owned stores + evidence-based adoption + hard reload on
   logout.
3. Negative probes.
4. Gates.
5. A5 investigation.
6. Docs.

## RESUME BRIEF

Mission: fix red-team hazard V2 (cross-account destruction of local IndexedDB state) with
migration discipline. Owner policy **O-7 is binding**: never auto-adopt ambiguous legacy
data, never auto-discard it, never let B touch A's legacy state; quarantine first.

Chosen design (see `SESSION_SOVEREIGNTY_RFC.md` once written):
- **Split the physical database along the existing domain boundary.** The user-owned stores
  (`meta`, `folders`, `sync`) move to a NEW per-owner database `emulador-workspace-<ownerId>`
  (version 1). The market-data stores (`candles`, `datasets`, `series`) stay in
  `emulador-workspaces`, whose `DB_VERSION` stays 6 and whose schema is unchanged (so the
  STOP-protected 6-store assertion still holds, and the worker is untouched).
- The legacy `meta`/`folders`/`sync` contents of `emulador-workspaces` are thereby
  **quarantined in place, byte-for-byte untouched** — nothing is ever written to or deleted
  from them.
- **Evidence-based, per-record adoption:** inside `pullAndMergeSessions`/`pullAndMergeFolders`,
  where the authoritative RLS-scoped cloud id set is already in hand, a quarantined record is
  adopted into the current owner's partition ONLY if one of its own ids is present in that
  cloud set (remote-ID correlation = proof of ownership). Adopted keys are recorded in the
  OWNER partition's `sync` store, never in the quarantine. Uncorrelated records stay
  quarantined and are retried on every later login.
- **Hard document reload on `loggedOut`** kills P3 (in-memory carry-over) by construction.
- Playbook/lessons DBs get the same owner-suffixed name (kills P4).

Gates must be run raw and unpiped from `emulador/`; baseline is 183 files / 2417 tests green.
