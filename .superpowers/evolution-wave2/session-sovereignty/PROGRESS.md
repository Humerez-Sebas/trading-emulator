# Session Sovereignty V2 — run ledger

Agent A · Wave 2 · branch `agent/session-sovereignty-v2` · base `894d72b` (`WAVE2_BASE_SHA`)
Worktree `C:\Users\78701\Desktop\trading-emulator-session-sovereignty`

## STATUS

Track A at implementation head `d72c51d`: **INDEPENDENTLY ACCEPTED / DONE.** Session clocks are
identity-bound and transactionally reconciled; dirty time is monotonic; every cloud boundary
captures and revalidates auth/DB owner before returning data or mutating local state; O-7 requires
all meaningful ids; adoption performs transaction-local non-overwrite and marks only actual copies;
null exact counts prove nothing. Nothing was pushed or merged; no Supabase, Vercel, dependency,
lockfile, market-data worker, recovery UI, auth listener, sibling worktree, remote, or `develop`
change was made.

Primary A5 verdict: **CONFIRMED DEFECT**.

### 2026-08-13 closeout continuation

Accepted implementation head: `498646b` (the final documentation commit follows it).
Independent OpenCode reviewer verdict: **ACCEPTED**, zero Critical/High/Medium findings after
three bounded finding/fix loops. Claude CLI review was attempted first and failed before review
with expired OAuth (`401`); it made no worktree change.

Fresh closeout-agent gates, raw and unpiped from `emulador/` at `498646b`:
- `npx tsc -p tsconfig.app.json --noEmit` -> exit `0`, no output.
- `npx tsc -p tsconfig.spec.json --noEmit` -> exit `0`, no output.
- `npx ng test --watch=false` -> exit `0`, **186 files / 2483 tests passed**.
- `npm run lint` -> exit `0`, `All files pass linting.`
- `npm run build` -> exit `0`; initial bundle **661.05 kB**, **161.05 kB** over the
  known-accepted 500 kB budget; no Vitest sentinel or unexpected chunk type.

Closeout TDD evidence: initial RED sync `4 failed / 65 passed`, auth `1 failed / 3 passed`;
review-loop REDs `1/16`, `5/69`, and `5/174`; final focused GREEN `186/186`.

Fresh restored mutations: owner partition `7 failed / 73 passed` -> `80/80`; A5 dirty flag
`4 failed / 2 passed` -> `6/6`; stale acknowledgement `2 failed / 67 passed` -> `69/69`;
direct-login boundary inversion `3 failed / 13 passed` -> `16/16`. The v1 source-store
deletion mutation made the migration run non-completing. Every mutation was inverse-patched,
then `git diff --exit-code HEAD` proved exact restoration before final gates.

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
- Final bounded GREEN: broader adjacent command containing all three core files plus workspace
  effects and playbook/lessons passed **196/196**; after adding folder upsert/delete to the
  owner-boundary matrix, the same representative command passed **198/198**.

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
- Atomic persistence mutation: replaced only `persistMeta$`'s transaction-local `updateMeta`
  with the former external `getMeta`/`putMeta` sequence; targeted command exit 1,
  **1 failed / 5 passed**, because the controlled stale read was called once. Exact restoration
  via `git diff --exit-code HEAD`; rerun exit 0, **6/6 passed**.

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

## 2026-08-13 fresh independent-review corrections

This continuation supersedes only the earlier "none" next-step statement; all prior history and
acceptance evidence above remains preserved as historical evidence. A fresh independent review
reported four bounded findings after accepted head `2630294`. They were corrected in
`704302a` (`fix(sovereignty): close delayed consequence races`) without changing dependencies,
lockfiles, Supabase, Vercel, market data, completed tracks, or the settled O-7 policy.

Corrections:

- Sessions-page cloud opens carry the captured owner through the R2 dataset wait and use the
  existing auth + workspace owner assertion immediately before local materialization and again
  before reload/open consequences. A controlled A-to-B download drift writes and opens nothing;
  the same-owner path remains functional.
- Playbook and lesson effects carry the auth trigger owner through pull, owner-bound local load,
  local upsert, hydration, post-merge push, and synced-stamp consequences. Hydrate/persist/push
  paths capture and revalidate the same owner. The existing owner-suffixed DB services accept an
  optional expected owner and fail before opening a different partition.
- Off-screen active rename and folder move now stamp `activeClientUpdatedAt` with the existing
  monotonic clock rule, preserve `activeSyncedAt`, and invoke the existing local-first dirty flush.
  Archived rename/move behavior remains clocked and flush-eligible.
- Sessions-page materialize and off-screen rename/archive/delete/move now use
  `WorkspaceDbService.updateMeta`. Controlled callbacks receive newer transaction-local rows and
  prove dirty/ack clocks, active trading, and unrelated sessions survive; stale destructive cards
  do not queue cloud deletion. The remaining page `getMeta(card.symbol)` calls are a read-only
  export and the current-asset active-delete lookup, not page whole-record writers.

TDD and verification evidence, raw and unpiped from `emulador/`:

- RED command: `npx ng test --watch=false --include=src/app/pages/sesiones/sesiones-page.component.spec.ts --include=src/app/state/playbook/playbook.effects.spec.ts --include=src/app/state/lessons/lessons.effects.sync.spec.ts` -> exit `1`, **14 failed / 112 passed**. Thirteen failures were the intended missing owner/clock/transaction guarantees; one draft persistence case had a test-resolver timing error and was corrected before any production edit. No separate corrected-RED rerun was captured.
- Focused GREEN of the same three files -> exit `0`, **3 files / 126 tests passed**.
- Broader affected GREEN: the focused files plus lessons hydration, both owner DB services,
  SessionSyncService, and Sessions-page journal buttons -> exit `0`, **8 files / 226 tests passed**.
- `npx tsc -p tsconfig.app.json --noEmit` -> exit `0`, no output.
- `npx tsc -p tsconfig.spec.json --noEmit` -> exit `0`, no output.
- `npm run lint` -> exit `0`, `All files pass linting.`

This is implementer evidence only. It does not claim a new independent acceptance. The controller
will rerun the final five gates independently.

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

## 2026-08-20 bounded Track A correction continuation

The historical acceptance and 2026-08-13 evidence above remain unchanged. A fresh independent
review of clean head `6d0a0b0` reported four additional bounded findings. This continuation fixes
only those findings; it does not claim independent acceptance and does not alter O-7, dependencies,
lockfiles, Supabase, Vercel, cross-tab behavior, recovery policy, or another worktree.

Implementation commits:

- `1d35601` `fix(sovereignty): keep local knowledge persistence offline`
- `a61c57c` `fix(sessions): bind active card actions to identity`
- `46e1c3d` `fix(sessions): guard folder writes by exact revision`
- `3df3d7b` `fix(sessions): reject stale delayed materialization`
- `75f846c` `test(sessions): clean folder race harness`

Corrections:

- Local playbook/lesson persistence resolves the document-lifetime `OwnerIdentityService` and
  writes its owner partition without requiring live Supabase auth. Cloud pull/push, hydration,
  synced stamps, and other cloud consequences retain live owner capture/revalidation.
- Active rename/archive/delete/move require exact active `syncId` plus captured clocks inside the
  off-screen meta transaction; current-asset consequences also reject a replaced live id. A stale
  A card cannot mutate/reset/archive/move B or queue B's cloud deletion.
- Folder rename/reorder use the existing exact-revision folder transaction and inspect its commit
  result. Folder delete atomically checks the captured revision, removes the folder, and queues the
  pending cloud deletion in one owner-DB transaction.
- Cloud materialization captures the complete owner meta before fetch/download and commits through
  `updateMetaIfUnchanged`; a same-owner edit during the delay survives and prevents open. A success
  preserves active identity/trading/clocks, including a dirty `activeClientUpdatedAt > syncedAt`,
  while the downloaded saved row starts at equal client/synced cloud clocks.

TDD evidence, raw and unpiped from `emulador/`:

- Local persistence RED: playbook + lesson effects exit `1`, **2 failed / 35 passed (37)**. GREEN:
  exit `0`, **37/37**.
- Active-card identity RED: Sessions page exit `1`, **4 failed / 93 passed (97)**. GREEN: exit `0`,
  **97/97**.
- Folder writer draft initially failed compilation on two nullable test-harness reads; after fixing
  only the harness, accepted RED exit `1`, **6 failed / 145 passed (151)**. GREEN after the exact
  success case: exit `0`, **152/152**.
- Delayed materialization page RED: exit `1`, **1 failed / 101 passed (102)**. The real
  `WorkspaceDbService.updateMetaIfUnchanged` RED then exited `1`, **2 failed / 52 passed (54)**.
  Combined GREEN: exit `0`, **156/156**.
- Fresh final affected command (Sessions page, WorkspaceDbService, SessionSyncService, playbook and
  lesson effects, and both owner DB services): exit `0`, **8 files / 287 tests passed**.
- Fresh required repository test gate `npx ng test --watch=false`: exit `0`,
  **186 files / 2515 tests passed**.
- Fresh `npx tsc -p tsconfig.app.json --noEmit`: exit `0`, no output.
- Fresh `npx tsc -p tsconfig.spec.json --noEmit`: exit `0`, no output.
- First lint run exposed one unused test mock parameter and exited `1`; after removing only that
  parameter, focused Sessions page GREEN was **102/102** and fresh `npm run lint` exited `0` with
  `All files pass linting.`

Per the bounded correction brief, no broad unrelated suite/build, push, merge, reset, rebase,
squash, install, deployment, or remote service operation was run.

## 2026-08-20 fresh three-finding review continuation

The historical acceptance statements remain historical. A new review of rejected head `8e90c33`
reported three additional findings. This continuation fixes only those findings and does not claim
independent acceptance or final gates. No dependency, lockfile, Supabase, Vercel, framework,
worktree, push, merge, reset, rebase, or squash operation was performed.

Implementation commits:

- `102c40e` `fix(sessions): commit card actions by exact revision`
- `57cc455` `fix(sessions): promote cloud aggregate coherently`
- `5f28584` `fix(folders): commit reorder as one transaction`
- `af1c8c1` `chore(sessions): remove obsolete import`

Corrections:

- Current-asset and off-screen session rename/archive/delete/move now commit through exact
  active/archived id + `clientUpdatedAt` + `syncedAt` revision transactions. Active delete reads,
  resets, and queues the captured id in one owner-DB `meta` + `sync` transaction, returning the
  replacement identity used by NgRx. A controlled A-to-B handoff while delete awaited owner/DB
  access left B byte-for-byte unchanged and queued no id.
- Cloud materialization atomically archives A with A trading/id/clocks and promotes B with B
  trading/view/id/clocks. Same-symbol open fetches the complete workspace and dispatches the
  existing `workspaceRestored` hydration action; real trading/layout reducers proved B opens and
  no `switchSession` no-op is relied upon. The fake-indexeddb aggregate proof also checks that the
  persisted meta remains candle-free.
- Folder reorder uses one `replaceFoldersIfUnchanged` readwrite transaction. It reads and validates
  every participating exact revision before issuing any write. One concurrent row change produces
  zero reordered rows and preserves unique order values; the exact case commits all rows. The page
  updates its signal and flushes dirty state only after the whole batch commits.

TDD evidence, raw and unpiped from `emulador/`:

- Exact session transactions RED: WorkspaceDbService exit `1`, **4 failed / 54 passed (58)**.
  GREEN: exit `0`, **58/58**. Sessions page RED: exit `1`, **5 failed / 102 passed (107)**;
  GREEN: exit `0`, **107/107**. Reducer draft first failed compilation because the wished-for
  committed-delete action still had the old zero-argument signature; corrected RED exit `1`,
  **2 failed / 62 passed (64)**, then GREEN exit `0`, **64/64**. Affected command passed
  **5 files / 279 tests**.
- Aggregate materialization drafts first failed compilation on one implicit-any test predicate
  (twice because service/page commands ran in parallel); no production edit preceded the corrected
  RED. Accepted REDs: WorkspaceDbService exit `1`, **1 failed / 58 passed (59)**; Sessions page
  exit `1`, **1 failed / 107 passed (108)**. GREEN: **59/59** and **108/108**. Affected command
  passed **7 files / 343 tests**.
- Batch reorder RED: WorkspaceDbService exit `1`, **2 failed / 59 passed (61)**; GREEN **61/61**.
  Sessions page RED exit `1`, **2 failed / 106 passed (108)**; after implementation one obsolete
  per-row assertion remained (**1 failed / 107 passed**) and was changed to assert the batch call;
  final GREEN **108/108**. Affected command passed **3 files / 245 tests**.

Fresh requested post-implementation evidence, raw and unpiped from `emulador/`:

- Aggregate affected command (13 explicit files) -> exit `0`, **13 files / 451 tests passed**.
- `npx tsc -p tsconfig.app.json --noEmit` -> exit `0`, no output.
- `npx tsc -p tsconfig.spec.json --noEmit` -> exit `0`, no output.
- First `npm run lint` -> exit `1`, one unused `emptyWorkspace` import. After removing only that
  obsolete import, all four commands were rerun fresh: affected **451/451**, app/spec tsc exit `0`,
  and `npm run lint` exit `0` with `All files pass linting.`

No full repository test suite or build was run in this continuation; the evidence above is the
requested affected suite plus app/spec tsc and lint, not final-gate evidence.

## 2026-08-20 fresh four-finding review continuation

The historical acceptance statements remain historical. A new review of rejected head `e1be2a5`
reported four Medium findings. This continuation fixes only those findings and does not claim
independent acceptance or full final gates. No dependency, lockfile, Supabase, Vercel, framework,
other-worktree, remote, push, merge, reset, rebase, or squash operation was performed.

Implementation commits:

- `56e6a09` `fix(sessions): archive captured active revision`
- `034123d` `fix(sessions): require archived row revision`
- `c56ef25` `fix(sessions): reconcile committed active delete`
- `3fa21e5` `fix(sessions): restore cloud replay settings`

Corrections:

- Current-active archive captures A identity, trading payload, cursor, and replay settings before
  IndexedDB access; the transaction callback rechecks the live A identity and the durable exact
  id/clocks before writing. A payload that differs from durable A receives a monotonic
  `clientUpdatedAt > syncedAt`, and that exact dirty clock is dispatched with the archived state.
- Archived revision matching now requires a saved row to exist before exact clocks can match.
  An absent unclocked row cannot authorize rename/move/delete, including when its id is now active,
  and the real `meta + sync` delete transaction enqueues nothing.
- Committed active deletion dispatches an identity-specific consequence carrying deleted A. The
  reducer resets only if A remains active; if B became active, it removes archived A and preserves
  B byte-for-byte. The persistence-effect interleave writes B without A, so A cannot be resurrected.
- Same-symbol cloud materialization carries B `customTfMinutes`, millisecond-per-candle
  `playbackSpeed`, and `replayResolution` through `SavedSession`/`WorkspaceMeta`, then uses the
  existing market/replay actions. Real market, replay, trading, layout, and workspace reducers prove
  the resulting view is one coherent B aggregate rather than B trading over A replay settings.

TDD evidence, raw and unpiped from `emulador/`:

- Archive RED: Sessions page exit `1`, **2 failed / 108 passed (110)**. GREEN after the intended
  dirty-clock assertion was updated: exit `0`, **110/110**.
- Archived absent-row RED: WorkspaceDbService exit `1`, **2 failed / 61 passed (63)**. GREEN:
  exit `0`, **63/63**.
- Committed-delete interleave RED: component/reducer/effect command exit `1`, **4 failed / 211 passed
  (215)**. GREEN: exit `0`, **3 files / 215 tests passed**.
- Replay-settings RED: Sessions page exit `1`, **1 failed / 110 passed (111)**. GREEN: **111/111**;
  focused affected expansion passed **8 files / 397 tests**.

Fresh requested post-implementation evidence, raw and unpiped from `emulador/`:

- Aggregate affected command (10 explicit files) -> exit `0`, **10 files / 464 tests passed**.
- `npx tsc -p tsconfig.app.json --noEmit` -> exit `0`, no output.
- `npx tsc -p tsconfig.spec.json --noEmit` -> exit `0`, no output.
- `npm run lint` -> exit `0`, `All files pass linting.`

No full repository test suite or build was run; this is bounded implementer evidence only.

## 2026-08-20 fresh three-finding review continuation from `a9da9c3`

The historical acceptance statements remain historical. A new review of rejected clean head
`a9da9c3` reported three Medium findings. This continuation fixes only those findings and does not
claim independent acceptance or full final gates. No dependency, lockfile, Supabase, Vercel,
framework, other-worktree, remote, push, merge, reset, rebase, or squash operation was performed.

Implementation commits:

- `481a3d5` `fix(sessions): preserve archived replay view`
- `66d8526` `fix(folders): reject absent exact revisions`
- `985534f` `fix(sessions): revalidate live aggregate before promotion`

Corrections:

- Current-active archive compares the captured custom timeframe, millisecond playback speed, and
  replay resolution together with trading/cursor before assigning a monotonic dirty revision. The
  committed action and trading reducer preserve those exact fields on `SavedSession`; workspace
  clock reconciliation distinguishes captured `null` from absent legacy fields; archived flattening
  now supplies a coherent view instead of the default. The reducer-to-owner-IndexedDB-to-flush proof
  observed exact `45 / 250 / 5`, dirty `201 > 200`, and a candle-free cloud payload.
- Folder replacement, all-or-nothing reorder participant validation, and atomic delete-plus-queue now
  require the current row itself to exist before comparing clocks. Real fake-indexeddb probes prove
  an absent legacy/unclocked row cannot be recreated, cannot cause any batch participant write, and
  cannot enqueue a phantom cloud deletion.
- Same-symbol cloud open captures the complete relevant live aggregate before owner/meta/payload or
  dataset delay and revalidates it immediately before durable promotion. A deterministic same-id A
  trading mutation with unchanged durable A now causes no promotion, hydration, or navigation; the
  existing coherent B success proof remains green.

TDD evidence, raw and unpiped from `emulador/`:

- Archived view draft first failed compilation because two selector imports were missing; after
  correcting only the test imports, the valid RED exited `1`, **3 failed / 182 passed (185)**. Focused
  GREEN passed **3 files / 185 tests**; affected expansion passed **5 files / 293 tests**.
- Folder absence RED exited `1`, **3 failed / 63 passed (66)**. GREEN passed **66/66**; affected
  expansion passed **3 files / 254 tests**.
- Delayed same-id live mutation RED exited `1`, **1 failed / 112 passed (113)**. The first post-fix
  run exposed that the page test harness had no value for the newly-read aggregate selector; after
  adding only that existing-selector override, GREEN passed **113/113** and the page plus real DB
  expansion passed **2 files / 179 tests**.

Fresh requested post-implementation evidence, raw and unpiped from `emulador/`:

- Aggregate affected command (9 explicit files) -> exit `0`, **9 files / 476 tests passed**.
- `npx tsc -p tsconfig.app.json --noEmit` -> exit `0`, no output.
- `npx tsc -p tsconfig.spec.json --noEmit` -> exit `0`, no output.
- `npm run lint` -> exit `0`, `All files pass linting.`

No full repository test suite or build was run; this is bounded implementer evidence only and makes
no acceptance claim.

## 2026-08-20 final Medium TOCTOU continuation from `cc0b71a`

The historical acceptance statements remain historical. This continuation fixes only the reported
post-promotion TOCTOU from rejected clean head `cc0b71a`; it makes no independent acceptance or full
final-gates claim. No dependency, lockfile, Supabase, Vercel, framework, other-worktree, remote,
push, merge, reset, rebase, or squash operation was performed.

Implementation commit:

- `7051b44` `fix(sessions): compensate post-promotion edits`

Correction:

- Same-symbol cloud open now compares the captured live aggregate synchronously again immediately
  after durable promotion returns and before any B dispatch. A same-id A edit in the pending
  promotion interval invokes one narrow owner-bound IndexedDB transaction: only exact active B
  id/client/synced provenance may be replaced, latest A becomes active with a monotonic dirty clock,
  stale archived A is removed, and B is retained coherently archived. A changed owner or active
  revision fails closed. The component returns without B hydration/navigation; no loop or lock was
  introduced, so a still-later live A edit remains eligible for normal monotonic persistence after A
  identity is restored.

TDD evidence, raw and unpiped from `emulador/`:

- Focused RED over the page and real fake-indexeddb service specs exited `1`, **4 failed / 179 passed
  (183)**: the controlled pending-promotion test observed zero compensation calls, and the three DB
  proofs observed the missing guarded operation.
- Focused GREEN over those same two explicit files exited `0`, **2 files / 183 tests passed**. This
  includes the unchanged coherent B promotion proofs plus successful compensation, active drift, and
  owner drift through real fake-indexeddb.

Fresh requested post-implementation evidence, raw and unpiped from `emulador/`:

- `npx tsc -p tsconfig.app.json --noEmit` -> exit `0`, no output.
- `npx tsc -p tsconfig.spec.json --noEmit` -> exit `0`, no output.
- `npm run lint` -> exit `0`, `All files pass linting.`

No full repository test suite or build was run; this is bounded implementer evidence only and makes
no acceptance claim.

## 2026-08-20 three-Medium continuation from `5bc7aec`

The historical acceptance statements remain historical. This continuation fixes only the three
reported Medium findings from rejected clean head `5bc7aec`; it makes no independent acceptance or
full final-gates claim. No dependency, lockfile, Supabase, Vercel, framework, other-worktree,
remote, push, merge, reset, rebase, squash, full-suite, or build operation was performed.

Implementation commits:

- `22cbba7` `fix(sessions): reconcile pending active archive`
- `89cacae` `fix(sessions): close promotion consequence windows`
- `216822f` `test(sessions): type delayed workspace fixture`

Corrections:

- Current-active archive now captures the full live aggregate before its exact revision
  transaction. If same-id A changes while that transaction is pending, a second transaction checks
  both the replacement active id and the exact just-archived row before replacing A with the latest
  payload and a monotonic dirty clock. The reducer receives that exact `SavedSession`, so it cannot
  combine a later live payload with earlier clocks. A real fake-IndexedDB-to-`flushDirty` proof
  observed latest A at `101 > 100` in the emitted cloud payload.
- Same-symbol promotion resolves the live Supabase owner and promoted workspace before its final
  synchronous current-symbol, active-id, full-aggregate, and promoted-provenance checks. No await
  separates a successful final check from `workspaceRestored`. Deterministic tests edit same-id A
  while the post-promotion owner assertion and `getWorkspace` are each pending; both compensate and
  return without B hydration.
- Promotion compensation now requires `SessionSyncService.assertExpectedOwner` immediately after
  promotion and again immediately before its owner-bound local write. A delayed fake Supabase
  `getSession` behind the real capture/assert implementation changes A to B during the post-promotion
  assertion and produces no compensation or hydration. The existing exact expected-owner guard in
  `WorkspaceDbService.compensatePromotionIfUnchanged` remains unchanged.

TDD evidence, raw and unpiped from `emulador/`:

- Archive test draft first failed compilation on the wished-for typed stub key and one wire/domain
  clock-name mismatch; after correcting only the harness, accepted RED exited `1`, **3 failed / 248
  passed (251)**. Focused GREEN passed **3 files / 251 tests**.
- Promotion/auth test draft first failed compilation on two intentionally partial fake casts; after
  applying the repository's `unknown as` test idiom, accepted RED exited `1`, **3 failed / 114 passed
  (117)**. Focused GREEN passed **117/117**; the promotion expansion passed **4 files / 330 tests**.

Fresh requested post-implementation evidence, raw and unpiped from `emulador/`:

- Aggregate affected command (10 explicit files) -> exit `0`, **10 files / 397 tests passed**.
- `npx tsc -p tsconfig.app.json --noEmit` -> exit `0`, no output.
- `npx tsc -p tsconfig.spec.json --noEmit` -> exit `0`, no output.
- First `npm run lint` -> exit `1`, two test-only empty-object type annotations. After replacing only
  those annotations with `Record<string, never>`, all four commands were rerun fresh: affected
  **397/397**, app/spec tsc exit `0`, and lint exit `0` with `All files pass linting.`

This is bounded implementer evidence only and makes no final acceptance claim.

## 2026-08-28 cold-resume A-R5/A-R6 addendum from `fefea65`

All earlier acceptance statements remain historical. This bounded continuation implements only the
final A-R5/A-R6 cold-resume addendum and makes no independent-acceptance or final-full-gates claim.
No dependency, lockfile, Supabase, Vercel, auth, cross-tab, recovery, other-worktree, remote, push,
merge, reset, rebase, squash, full-suite, or build operation was performed.

Implementation commits:

- `9be19b9` `fix(sessions): restore active after archive reconciliation drift`
- `fc7f407` `fix(sessions): reject live durable promotion divergence`
- `4f96f15` `test(sessions): prove restored archive remains dirty`

Corrections:

- After archive reconciliation returns, the component synchronously compares the full current live
  aggregate with the exact aggregate used to create the reconciled A1 row. A second A2 edit invokes
  one narrow transaction guarded by the replacement active id and exact reconciled archived A. The
  transaction removes archived A, restores A2 as active with every replay/view/workspace field, and
  stamps `clientUpdatedAt > syncedAt`. It then returns without dispatching `newSession`. A controlled
  A3 edit while that restore awaited remained live while durable active identity became A, leaving
  ordinary persistence able to save A3. The real fake-indexeddb proof observed restored A2 in the
  next `flushDirty()` cloud candidate at dirty clock `102 > 100`.
- Same-symbol cloud promotion captures NgRx A plus its pre-I/O active id/client/synced revision from
  the page's local snapshot. Immediately before promotion it requires that capture to remain current
  and equal the independently captured durable A across files/active timeframe/selected timeframes,
  trading, saved sessions, cursor, custom timeframe, playback speed, replay resolution, drawings,
  layout, panels, link groups, active identity, and both clocks. Pre-existing live A2 over durable A1
  now returns before the DB promotion and B hydration, without dispatching over A2. Exact unchanged A
  still promotes and hydrates B through the existing coherent path.

TDD and bounded verification evidence, raw and unpiped from `emulador/`:

- Baseline page + real DB command passed **2 files / 187 tests**.
- A-R5 RED: `npx ng test --watch=false --include=src/app/pages/sesiones/sesiones-page.component.spec.ts --include=src/app/services/workspace-db.service.spec.ts`
  -> exit `1`, **3 failed / 187 passed (190)**. Failures were the missing component restoration call
  and two missing real transaction behaviors. GREEN of the same command -> exit `0`, **190/190**.
- A-R6 RED: `npx ng test --watch=false --include=src/app/pages/sesiones/sesiones-page.component.spec.ts`
  -> exit `1`, **1 failed / 119 passed (120)** because promotion was called for pre-existing A2/A1;
  the new exact-match success case already passed. GREEN -> exit `0`, **120/120**. Two intermediate
  implementation runs exposed pre-existing promotion fixtures that did not model a complete matching
  A (`12 failed / 108 passed`, then `5 failed / 115 passed`); only their setup was completed before
  the accepted GREEN, with their behavioral assertions unchanged.
- Final page + fake-indexeddb focus after the cloud-dirty assertion -> exit `0`, **2 files / 192 tests**.
- Fresh affected command covering the page, real DB, sync service/mapping/effects, trading reducer,
  workspace persistence/effects/meta-ownership/new-session-costs -> exit `0`, **10 files / 430 tests**.
- `npx tsc -p tsconfig.app.json --noEmit` -> exit `0`, no output.
- `npx tsc -p tsconfig.spec.json --noEmit` -> exit `0`, no output.
- `npm run lint` -> exit `0`, `All files pass linting.`

No full repository test suite or build was run. The results above are implementer evidence only;
Track A still requires fresh independent review and any independently owned final gates.

## 2026-08-28 replay-only A-R7 addendum from `9960638`

All earlier acceptance statements remain historical. This bounded continuation implements only the
remaining Track A Medium A-R7 and makes no independent-acceptance or final-full-gates claim. No
dependency, lockfile, Supabase, Vercel, auth, cross-tab, recovery, other-worktree, remote, push,
merge, reset, rebase, squash, full-suite, or build operation was performed.

Implementation commit:

- `4651aeb` `fix(sessions): persist replay-only restore edits`

Correction:

- `selectWorkspaceMetaSnapshot` now carries `customTfMinutes`, `playbackSpeed`, and
  `replayResolution` from their existing market/replay owners. The existing debounced workspace
  writer compares those fields plus `files` as part of the coherent active payload, writes the live
  values rather than retaining the durable values, and advances the existing monotonic dirty clock
  when only those fields change.
- `MaterializedSessionAggregate` now includes `files`. Guarded archive restoration writes the exact
  files captured with latest A2; promotion and compensation also pass their coherent file view, so
  no materialization path can silently omit the field. A deterministic A3 edit made while that
  restoration transaction waits changes only replay settings and files: restoration receives exact
  A2, NgRx remains exact A3, and no stale `newSession` consequence dispatches.
- Real fake-IndexedDB coverage proves ordinary persistence writes replay-settings/files-only A3,
  cold construction reads those exact local fields with `activeClientUpdatedAt > activeSyncedAt`,
  and `flushDirty()` flattens the exact replay settings into the cloud payload. File names remain the
  local informational `WorkspaceMeta.files` field; the existing cloud contract continues to use
  `requiredDatasets` rather than file names (`docs/engineering/domain/session-sync.md`, payload rule
  1), so no wire schema or migration was introduced.

TDD and bounded verification evidence, raw and unpiped from `emulador/`:

- Baseline affected command (11 explicit files) -> exit `0`, **11 files / 505 tests passed**.
- The first RED draft failed compilation only because the new service spec omitted its type import;
  after correcting that harness, accepted RED used four explicit files -> exit `1`, **4 failed / 274
  passed (278)**. The failures were exactly the absent selector replay fields, omitted restoration
  files, missing A2 files in the pending-restoration aggregate, and retained/non-dirty A3 durable
  settings.
- Focused GREEN of the same four-file command -> exit `0`, **4 files / 278 tests passed**. During
  implementation, one run exposed six pre-existing promotion fixtures whose durable comparison had
  not yet mirrored the newly expanded selector shape, plus the new effect test froze `Date.now()` and
  therefore prevented RxJS debounce time from advancing. Production comparison was completed and
  the test clock freeze removed; no pre-existing behavioral assertion changed.
- Fresh affected command (11 explicit files) -> exit `0`, **11 files / 509 tests passed**.
- `npx tsc -p tsconfig.app.json --noEmit` -> exit `0`, no output.
- `npx tsc -p tsconfig.spec.json --noEmit` -> exit `0`, no output.
- `npm run lint` -> exit `0`, `All files pass linting.`

No full repository test suite or build was run. The evidence above is implementer evidence only;
Track A still requires fresh independent review and any independently owned final gates.

## 2026-08-28 final independent acceptance at `d72c51d`

The historical rejected reviews and their bounded correction evidence above remain preserved.
Independent review of clean accepted implementation head `d72c51d` returned **ACCEPTED** with zero
Critical, High, or Medium findings. It reported one Low: `sameActivePayload()` D1 equality omits
`files`. This is latent because every current writer of `files` also advances the exact revision
clocks used by the guard.

The controller independently ran all final gates raw and unpiped from `emulador/` at `d72c51d`:

- `npx tsc -p tsconfig.app.json --noEmit` -> exit `0`.
- `npx tsc -p tsconfig.spec.json --noEmit` -> exit `0`.
- `npx ng test --watch=false` -> exit `0`, **186 files / 2562 tests passed**.
- `npm run lint` -> exit `0`.
- `npm run build` -> exit `0`; initial bundle **669.96 kB**, with only the known 500 kB budget
  warning by **169.96 kB** and no unexpected or Vitest production chunk.

No push, merge, dependency, or remote change was made. The worktree was clean at accepted
implementation head `d72c51d`.

## 2026-08-29 post-closeout Low correction from `b621854`

The final independent acceptance at implementation head `d72c51d` and documentation head
`b621854` remains historical evidence. This bounded post-closeout correction addresses only the
accepted Low in `sameActivePayload()`; the new post-closeout head is the commit containing this
section (`git rev-parse HEAD` is authoritative because a commit cannot embed its own SHA).

- Root mechanism: D1 snapshots the complete owner-local active `WorkspaceMeta`, then
  `removeSessionIfUnchanged()` transactionally compares that snapshot before clearing the active
  identity. The equality covered replay, trading, drawings, layout, panels, and link groups but
  omitted local informational `files`, so a files-only edit at unchanged clocks could be cleared.
- Boundary decision: both comparison operands are local `WorkspaceMeta` values. Adding `files`
  strengthens the documented complete-active-payload invariant without adding files to the cloud
  payload, changing `requiredDatasets`, embedding candles, or changing a persisted/wire schema.
- Patch: add `files` to both existing ordered objects compared through `JSON.stringify`; no new
  equality mechanism or compatibility path was introduced.
- Regression: a controlled complete empty pull snapshots active A, pauses at owner revalidation,
  writes otherwise-identical A with only `files` changed and clocks unchanged, then proves D1 keeps
  A active with the newer files.

TDD and fresh gates, raw and unpiped from `emulador/`:

- The first draft asserted only retained files and passed `77/77` because D1 retains unrelated
  workspace fields while clearing active identity; before production edits, the assertion was
  corrected to require active A. Accepted RED:
  `npx ng test --watch=false --include=src/app/services/session-sync.service.spec.ts` -> exit `1`,
  **1 failed / 76 passed (77)**, `expected undefined to be 'active'`.
- Focused GREEN with the same command -> exit `0`, **1 file / 77 tests passed**.
- `npx tsc -p tsconfig.app.json --noEmit` -> exit `0`, no diagnostics.
- `npx tsc -p tsconfig.spec.json --noEmit` -> exit `0`, no diagnostics.
- `npx ng test --watch=false` -> exit `0`, **186 files / 2563 tests passed**.
- `npm run lint` -> exit `0`, `All files pass linting.`
- `npm run build` -> exit `0`, initial bundle **669.99 kB**; only the known 500 kB budget
  warning by **169.99 kB**, with no unexpected or Vitest production chunk.

No dependency, lockfile, Supabase, Vercel, schema, remote, other-worktree, push, merge, rebase,
cherry-pick, deployment, reset, branch, or worktree-management change was made. This is bounded
post-closeout implementer evidence and does not rewrite the original independent acceptance.
