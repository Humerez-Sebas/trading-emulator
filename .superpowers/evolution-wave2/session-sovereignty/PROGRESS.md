# Session Sovereignty V2 — run ledger

Agent A · Wave 2 · branch `agent/session-sovereignty-v2` · base `894d72b` (`WAVE2_BASE_SHA`)
Worktree `C:\Users\78701\Desktop\trading-emulator-session-sovereignty`

## STATUS

Phase: **A3 implementation LANDED and committed** (all production code written). A4 probes
partially written. Suite NOT green yet. A5 and A6 docs NOT started.

Commits: `c338491` (A1 ledger) → `ad0285b` (core partition) → `537c7ab` (lessons DB) →
`dc599c9` (existing specs adapted to the per-owner stores).

`npm ci` already done in `emulador/` (exit 0) — do NOT redo it.

Gate status:
- `npx tsc -p tsconfig.app.json --noEmit` → exit 0 (measured at `ad0285b`)
- `npx tsc -p tsconfig.spec.json --noEmit` → exit 0 (measured at `ad0285b`)
- `npx ng test --watch=false` → exit 1, **10 failed files / 173 passed (183)** measured
  BEFORE `dc599c9`; every failure was "service constructed without an owner identity",
  which `dc599c9` addresses. NOT re-run since. **Re-run this first.**
- `npm run lint` → NOT YET RUN.

## COMPLETED

- Read `CLAUDE.md`, `docs/engineering/PHILOSOPHY.md`, `docs/engineering/domain/session-sync.md`.
- Read the direct precedent: root `SESSION_SYNC_RED_TEAM.md` (Wave 1/2 agent C). V1 (truncated
  pull) is fixed in the base; V2 (wrong-owner pull) is the mission and is pinned as a
  known-unfixed hazard by an existing spec (`session-sync.service.spec.ts:918`).
- A1 durable-store inventory (see table below).
- Traced the complete V2 mechanism end to end, plus TWO additional reachable paths the
  red-team report did not name (in-memory carry-over; playbook/lessons exposure).

## IMPLEMENTED (all committed)

New files:
- `emulador/src/app/services/owner-scope.ts` — per-owner DB names, `USER_DB_VERSION = 1`,
  `NO_OWNER_MESSAGE`, `AdoptionMarker`, and the PURE `decideAdoption()` that encodes O-7.
- `emulador/src/app/services/owner-identity.service.ts` — `OwnerIdentityService.ownerId()`
  from `supabase.auth.getSession()` (memoized once non-null; the memo's soundness DEPENDS on
  the hard reload below), plus `fixedOwnerIdentity(id)` for specs. NOTE: Angular DI rejects
  an interface as a token (NG2003), so every consumer types the param as the CLASS.
- `emulador/src/app/state/auth/session-sovereignty.effects.ts` — `hardReloadOnLogout$`:
  `inject(DOCUMENT).location.assign('/login')` on `loggedOut`. Registered in `app.config.ts`.

Changed:
- `workspace-db.service.ts` — now spans TWO databases. `meta`/`folders`/`sync` →
  `emulador-workspace-<ownerId>` (v1, created by `openUser()`); `candles`/`datasets`/`series`
  stay in `emulador-workspaces` (v6, schema UNCHANGED, worker untouched). The shared DB's
  `meta`/`folders` become the read-only QUARANTINE, exposed only via
  `listQuarantinedMetas()`/`listQuarantinedFolders()`. New `getAdoptionMarker()` /
  `recordAdopted()` write the marker into the OWNER partition, never the quarantine.
  `getWorkspace`/`remove` now span both DBs (no longer one transaction — documented).
  Fails closed with `NO_OWNER_MESSAGE` when no owner resolves; there is no un-owned fallback.
- `session-sync.service.ts` — `adoptQuarantinedMetas()` / `adoptQuarantinedFolders()` called
  from INSIDE `pullAndMergeSessions`/`pullAndMergeFolders`, right after the cloud id set is in
  hand and BEFORE the local set is read for the merge. Zero extra round trips and it inherits
  `assertCompletePull` (a truncated page can never prove ownership).
- `playbook-db.service.ts`, `lessons-db.service.ts` — owner-suffixed DB names, same
  fail-closed rule. Legacy un-suffixed DBs left untouched on disk = quarantine.

## IN FLIGHT — exact next action

Appending the negative-probe suite to
`emulador/src/app/services/session-sync.service.spec.ts` (currently ~1147 lines; the harness
additions `OWNER`, `OTHER_OWNER`, `dbFor()`, `seedQuarantine()` and the inverted
`FIXED (was RESIDUAL HAZARD)` test are ALREADY committed at `dc599c9`).

The last attempt to append the block via a bash heredoc FAILED with
`unexpected EOF while looking for matching '` — the spec text contains typographic
apostrophes (’) inside `it(...)` titles which broke the shell quoting. **Write that block with
the Write/Edit tool instead of a heredoc, or use only ASCII apostrophes.** Nothing was written
to the file by the failed attempt, so the spec is exactly as committed.

Probe block to append (12 tests, all designed to fail if owner scoping is removed):
A→B no delete/mutate/expose/upload · A→B→A still there · B→A invisible · dirty local-only
never uploaded as B · D1 still works WITHIN one owner · fail-closed with no owner ·
quarantine not adopted without proof · adopted only on remote-ID correlation (per record) ·
adoption never overwrites a live record · a second account cannot claim the first's adopted
record · offline pull adopts nothing and retries later · a truncated page cannot prove
ownership.

## NOT STARTED

- A4 falsification A/B run (point `ownerWorkspaceDbName` at the legacy constant, record exact
  pass/fail counts with and without the guard).
- Full gate run (`ng test`, `lint`) after the probes land.
- A5 `WorkspaceMeta.trading` ownership investigation — see the strong lead already found,
  below.
- A6 docs: `SESSION_SOVEREIGNTY_RFC.md`, `SESSION_SOVEREIGNTY_MIGRATION.md`,
  `TRADING_METADATA_OWNERSHIP_INVESTIGATION.md`.

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

## A5 LEAD (found while tracing, NOT yet proven or refuted — do not refactor on suspicion)

Writers of `WorkspaceMeta.trading` / the LWW clocks, all non-transactional read-modify-write
over the whole record:
1. `workspaces.effects.ts` `persistMeta$` (300 ms debounce) — re-reads `existing` and
   re-applies `activeClientUpdatedAt`/`activeSyncedAt` so it does not clobber them.
2. `workspaces.effects.ts` `doSwitch` step 1 (`:309`) — `putMeta({symbol, ...meta, linkGroups,
   lastModified})` and **does NOT re-read/re-apply the clocks**. `MetaSnapshot` is
   `Omit<WorkspaceMeta,'symbol'|'lastModified'|'linkGroups'>` so the clocks are IN the type,
   but `selectWorkspaceMetaSnapshot` (`state/selectors.ts:126`) never produces those keys, so
   the spread omits them and `put` replaces the record WITHOUT them. **Hypothesis: an asset
   switch silently drops `activeClientUpdatedAt`/`activeSyncedAt`.**
3. `session-sync.service.ts` — `flushDirtySessions`, `pullAndMergeSessions` (D1),
   `markActiveDirty`, `reconstructActiveIds`, all `putMeta`.
4. `sesiones-page.component.ts` — several `getMeta`→mutate→`putMeta` pairs (lines ~852-1179).

First-pass reasoning (NOT a conclusion): dropping the clocks makes the next pull treat the
session as never-synced, which is the CONSERVATIVE branch (kept, not deleted), and
`markActiveDirty` restamps `activeClientUpdatedAt` so a later push still happens. So the
clock loss may be benign rather than destructive. The reachable harm to look for is a LOST
UPDATE: `persistMeta$` reads `existing` (clocks C), then `markActiveDirty` stamps C' and
writes, then `persistMeta$`'s own `putMeta` lands with the stale C and erases the dirty stamp
→ that edit is never pushed. Both effects are `concatMap`ped independently (300 ms vs 2000 ms
debounce off the SAME snapshot stream), so the interleaving window is narrow but real.
**Required verdict: PROVEN (with a deterministic reproduction) or REFUTED (with the argument).
A test, not an opinion.**

## NEXT STEPS

1. Append the 12-test probe block to `session-sync.service.spec.ts` (Write tool, not heredoc).
2. Add a spec for `SessionSovereigntyEffects` (TestBed, `{ provide: DOCUMENT, useValue: { location: { assign: vi.fn() } } }`)
   — it is the executable invariant underwriting `OwnerIdentityService`'s memo.
3. Run `npx ng test --watch=false` raw; fix; then `npm run lint`, both tsc gates, `npm run build`.
4. Falsification A/B with exact numbers.
5. A5 investigation → PROVEN or REFUTED.
6. Write the three A6 docs.

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

### Pre-existing spec assertions this work DELIBERATELY changed (must be declared in the report)

1. `workspace-db.service.spec.ts` — "v1 → v3 migration" and "v4→v5 upgrade" now assert the
   migrated `meta` lands in the QUARANTINE and is NOT the current owner's workspace. A v1/v4
   record predates user identity, so adopting it because someone logged in is precisely what
   O-7 forbids. The series half (Market-Data) is still directly readable.
2. `session-sync.service.spec.ts` — "RESIDUAL HAZARD (unfixed, documented)" is inverted to
   "FIXED (was RESIDUAL HAZARD)". That spec existed to pin the hazard as known-unfixed; this
   RFC fixes it, so the spec MUST change — that is the intended consequence, not a workaround.

Everything else in the spec suite changed only mechanically (identity injection, DB names in
teardown helpers, `listMetas()`→`listDatasets()` for shared-schema warmup).

### Traps already hit (do not rediscover)

- Angular DI: `constructor(private x: SomeInterface = inject(SomeClass))` compiles under tsc
  but fails the Angular compiler with NG2003. Type the parameter as the CLASS.
- `tsc` passing proves nothing here: the 10 spec failures were runtime `inject()`-outside-an-
  injection-context errors, invisible to both tsc gates.
- Bash heredocs choke on the typographic apostrophes used in spec titles.
- `rawDb()`/`seedCandles()` in `workspace-db.service.spec.ts` used `listMetas()` to force the
  SHARED schema open; that now opens the per-owner DB, so they must use `listDatasets()`.
- `candles-writer.spec.ts` had the same problem in `resetAndInitSchema()`.
