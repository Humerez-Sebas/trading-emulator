# Session Sovereignty V2 — run ledger

Agent A · Wave 2 · branch `agent/session-sovereignty-v2` · base `894d72b` (`WAVE2_BASE_SHA`)
Worktree `C:\Users\78701\Desktop\trading-emulator-session-sovereignty`

## STATUS

Track A plus the final bounded independent-review corrections: **COMPLETE / DONE.** Session
clocks are identity-bound and transactionally reconciled; dirty time is monotonic; every
cloud boundary captures and revalidates auth/DB owner before returning data or mutating local
state; O-7 requires all meaningful ids; adoption performs transaction-local non-overwrite and
marks only actual copies; null exact counts prove nothing. Nothing was pushed or merged; no
Supabase, Vercel, dependency, lockfile, market-data worker, recovery UI, auth listener, sibling
worktree, or `develop` change was made.

Primary A5 verdict: **CONFIRMED DEFECT**.

Review-correction commits before docs:
- `9c3a52f` `fix(workspaces): bind sync clocks to session identity`
- `128b163` `fix(sync): fail closed on ambiguous ownership`
- `02495e3` `refactor(sync): keep adoption transaction-only`
- `f1e1312` `test(sync): pin atomic and exact-count boundaries`
- `eb96ce7` `fix(sync): close final sovereignty races`
- `6d174ed` `test(sync): cover every cloud owner boundary`

The final closeout commit SHA cannot be embedded in its own contents without changing that
SHA. The authoritative final SHA is `git rev-parse HEAD` after this artifact is committed and
is reported in the final response.

`npm ci` already done in `emulador/` (exit 0) — do NOT redo it.

Final gate status (run raw and unpiped, sequentially, from `emulador/`): **DONE**.
- `npx tsc -p tsconfig.app.json --noEmit` → `APP_TSC_EXIT=0`
- `npx tsc -p tsconfig.spec.json --noEmit` → `SPEC_TSC_EXIT=0`
- `npx ng test --watch=false` → `NG_TEST_EXIT=0`, **186 files / 2465 tests passed**;
  the known load-sensitive 25k candle-writer timeout did not occur
- `npm run lint` → `LINT_EXIT=0`, "All files pass linting."
- `npm run build` → `BUILD_EXIT=0`; initial bundle **658.79 kB**, budget exceeded by
  **158.79 kB** against 500.00 kB (known-accepted warning; no Vitest sentinel or unexpected
  chunk type observed)

Targeted TDD evidence:
- RED before production edit: targeted meta-ownership spec exit 1; 1 file failed;
  **1 failed / 1 passed**. Failure: expected `upsertSession` once, got zero.
- GREEN after the minimal fix: exit 0; **1 file / 2 tests passed**.
- Adjacent `workspaces.effects.spec.ts`: exit 0; **1 file / 38 tests passed**.
- Review RED before production edits: clock provenance **2 failed / 2 passed**; O-7
  **1 failed / 10 passed**; atomic adoption **1 failed / 46 passed**; sync boundaries
  **5 failed / 50 passed**.
- Review GREEN: workspace effects **43/43** and sync/storage/owner/playbook/lessons
  **154/154**; final focused exact-count/atomic set **104/104**.
- Final bounded RED after adding the new regressions: focused command exit 1,
  **8 failed / 109 passed (117)**. Intended failures: 6 owner/in-flight boundaries and 1
  transaction-time adoption overwrite; the initial clock harness timed out and was corrected
  before being accepted as evidence.
- Final bounded GREEN: core focused set **117/117**; representative adjacent set including
  workspace effects plus playbook/lessons **198/198**.

Mandated post-implementation negative probe:
- Mutation: removed only `activeClientUpdatedAt` from `doSwitch`'s outgoing `putMeta` while
  retaining `activeSyncedAt` preservation.
- Result: exit 1; **1 failed / 1 passed**. `flushDirty` made zero upserts because absent
  client time versus preserved `activeSyncedAt=110` is clean under strict `>`.
- Restoration: mutation never committed; `git diff --exit-code HEAD` was clean for the code
  and spec; rerun exit 0 with **2/2 passed**.

Fresh closeout falsification:
- Owner partition mutation: one shared workspace DB name; targeted command exit 1,
  **7 failed / 59 passed**. Exact restoration via `git diff --exit-code`; rerun exit 0,
  **66/66 passed**.
- A5 mutation: outgoing reconciliation dirty flag `true -> false`; targeted command exit 1,
  **4 failed / 2 passed**. Exact restoration via `git diff --exit-code HEAD`; rerun exit 0,
  **6/6 passed**.
- In-flight owner mutation: removed only the post-I/O Supabase-user comparison while retaining
  the DB assertion; targeted command exit 1, **6 failed / 63 passed**. Exact restoration via
  `git diff --exit-code HEAD`; rerun exit 0, **69/69 passed**.

Residual decisions:
- Stale tabs fail closed before and after every cloud I/O boundary and before local
  consequences; direct Sessions-page list/fetch calls also reject. Reload is required. No
  auth-change listener, broad cross-tab protocol, or recovery UI was added.
- Mixed-owner, partially proven, and no-id legacy metas remain quarantined. No per-session
  extraction was implemented, so ownership is not claimed unconditionally.

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

## HISTORICAL CHECKPOINT — superseded

The following was the checkpoint state before the now-completed A4/A5/A6 work. It is retained
as preservation evidence and is not the current next action. The run had been appending the
negative-probe suite to
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

## HISTORICAL NOT-STARTED LIST — now complete

- A4 falsification A/B run (point `ownerWorkspaceDbName` at the legacy constant, record exact
  pass/fail counts with and without the guard).
- Full gate run (`ng test`, `lint`) after the probes land.
- A5 `WorkspaceMeta.trading` ownership investigation — completed with verdict
  **CONFIRMED DEFECT** and fixed in `0b725d1`.
- A6 docs — completed:
  `SESSION_SOVEREIGNTY_RFC.md`, `SESSION_SOVEREIGNTY_MIGRATION.md`, and
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

## NEGATIVE PROBES — DONE, falsification recorded

Method: revert owner isolation at ONE point — `ownerWorkspaceDbName()` returns a single
owner-independent name (`'emulador-workspace-shared'`) instead of `emulador-workspace-<id>`.
That models the historical origin-scoped-but-not-user-scoped store exactly, while keeping the
market-data/user split intact so nothing fails for an unrelated schema reason. Nothing
committed; restored with `git checkout --`.

```
A — isolation reverted
  npx ng test --watch=false
  Test Files  2 failed | 183 passed (185)
  Tests       7 failed | 2434 passed (2441)
  FALSIFY_EXIT=1

B — isolation restored
  Test Files  185 passed (185)
  Tests       2441 passed (2441)
  RESTORED_EXIT=0
```

The 7 failures, and what each proves:

| Failing test | Assertion | Proves |
|---|---|---|
| A then B: no delete/mutate/expose/upload | `expected undefined to be 'A-active'` | B's empty pull destroys A's active session |
| A then B then A | `expected [] to deeply equal ['A-archived']` | A's archived session is gone for good |
| a DIRTY local-only session is never uploaded as B | `expected [{table:'sessions',…}] to deeply equal []` | **A's never-synced session IS uploaded under B's owner_id** (path P2, previously unreported) |
| B then A: B workspace invisible to A | `expected {symbol:'GBPUSD',…} to be undefined` | cross-account exposure |
| a second account cannot claim the adopted record | `expected {symbol:'EURUSD',…} to be undefined` | B claims what A already adopted |
| FIXED (was RESIDUAL HAZARD) | `expected false to be true` | the historical V2 defect verbatim |
| decideAdoption: different owners, different DBs | `expected 'emulador-workspace-shared' not to be …` | the naming invariant itself |

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

## A5 CHECKPOINT LEAD (historical; resolved below)

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

## A5 RESOLUTION

**CONFIRMED DEFECT.** The checkpoint consequence test failed because the outgoing whole-record
write removed both clocks, making `flushDirty` skip the real session. `doSwitch` now re-reads
the outgoing stored meta, preserves `activeSyncedAt`, and stamps
`activeClientUpdatedAt = max(Date.now(), priorClient + 1, priorSynced + 1)` in the same write
as the outgoing real-session snapshot. The existing `isRealSession` predicate gates the
stamp. Full causal evidence is in `TRADING_METADATA_OWNERSHIP_INVESTIGATION.md`.

## NEXT STEPS — none for Track A

Track A is closed. Residual risks are documented in the RFC and migration artifact; they are
not authorization for follow-on implementation in this track.

## RESUME BRIEF — CLOSED

Mission completed: red-team hazard V2 and the confirmed outgoing-trading metadata defect are
fixed with migration discipline. Owner policy **O-7 remains binding**: never auto-adopt
ambiguous legacy data, never auto-discard it, never let B touch A's legacy state; quarantine
first.

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
  adopted into the current owner's partition ONLY if every meaningful id it carries is
  present in that exact-count cloud set. The record and owner-local marker commit atomically;
  mixed/no-id records remain quarantined and are retried on later login.
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
