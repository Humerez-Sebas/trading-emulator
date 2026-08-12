# Agent C — Session Sync Red Team · PROGRESS

Worktree: `C:\Users\78701\Desktop\trading-emulator-sync`
Branch: `agent/session-sync-red-team` · Baseline: `a2ca53b` (develop)

## STATUS

**100% COMPLETE.** All gates green, falsification proven, deliverable committed.

| Phase | State |
|---|---|
| C1 — trace the protocol | COMPLETE (mechanism traced, live Supabase probed read-only) |
| C2 — reproduction | COMPLETE (8 specs; 6 of them fail without the fix) |
| C3 — verdict | COMPLETE |
| C4 — remediation | COMPLETE (V1 fixed; V2 deliberately routed to an RFC) |
| C5 — implementation bar | COMPLETE (guard only; no repository framework, no service split) |
| Deliverable `SESSION_SYNC_RED_TEAM.md` | COMMITTED (`f991e0a`) |

## COMMITS ON THIS BRANCH

```
f991e0a  docs(sync): report TD-E5 truncated-pull reachability and the wrong-owner vector
e538d0e  fix(sync): refuse a truncated cloud pull instead of deleting local sessions
335eb55  chore(audit): checkpoint session-sync red-team evidence (C1 complete)
a2ca53b  (baseline — develop, Merge pull request #56)
```

Diff vs baseline: `SESSION_SYNC_RED_TEAM.md` (+357) · `PROGRESS.md` ·
`session-sync.service.ts` (+54) · `session-sync.service.spec.ts` (+228).
**Nothing pushed. `develop` never touched.**

## FINAL VERDICT

| Vector | Verdict |
|---|---|
| **V1 — truncated pull** | **REACHABLE ABOVE `db-max-rows`.** Not reachable at today's 6 sessions / 2 folders. **FIXED** in `e538d0e`. Severity MEDIUM (high impact, low likelihood today). |
| **V2 — wrong-owner pull** | **REACHABLE TODAY.** No cap, no truncation, no growth needed. **NOT fixed** — needs an RFC. Severity HIGH. |

Threshold for V1: `session_count > db-max-rows` (independently `folder_count > db-max-rows`).
The effective `db-max-rows` remains **UNVERIFIED** — Dashboard/config setting, not a DB GUC,
unreadable from SQL or any available tool, and unmeasurable without mutating production.
It is stated as an inequality in the report and never guessed.

## GATE EVIDENCE (run raw and unpiped from `emulador/`)

```
npx tsc -p tsconfig.app.json --noEmit     APP_TSC_EXIT=0
npx tsc -p tsconfig.spec.json --noEmit    SPEC_TSC_EXIT=0
npm run lint                              LINT_EXIT=0   (All files pass linting)
npx ng test --watch=false                 NG_TEST_EXIT=0
                                          Test Files 182 passed (182)
                                          Tests      2381 passed (2381)
```

Baseline was 182 files / 2373 tests green. Now 182 / 2381 (+8 = the new specs).
No red inherited, nothing masked, no gate piped through `| tail` or `| head`.

## FALSIFICATION EVIDENCE (the load-bearing proof)

Guard reverted in the working tree only (`git show a2ca53b:…/session-sync.service.ts >` the
same path; `assertCompletePull` 4 → 0 occurrences; never committed), targeted spec re-run:

```
npx ng test --watch=false --include=src/app/services/session-sync.service.spec.ts
× listSummaries throws when the server reports more rows than it returned
× listFolders throws when the server reports more rows than it returned
× a synced local session OMITTED from a truncated page survives the pull
× a DIRTY (unpushed) local session omitted from a truncated page is preserved AND pushed
× a synced-absent ACTIVE session keeps its trading data when the page was truncated
× a synced local folder omitted from a truncated page is not deleted
Tests  6 failed | 32 passed (38)     FALSIFY_EXIT=1
```

Assertion messages state the defect directly: `expected [] to include 'f-omitted'`,
`expected undefined to be 'A'` (active session + trading data wiped), `expected undefined to
be defined` (unpushed session gone).

Guard restored (`git checkout HEAD -- …`, back to 4 occurrences), same command:

```
Tests  38 passed (38)                RESTORED_EXIT=0
```

The 2 documentation specs (`D1 is PRESERVED`, `RESIDUAL HAZARD`) pass in both states by
design — they pin behaviour that must not change, so they are not part of the six.

## EVIDENCE ARCHIVE (probes already run — do NOT re-run)

### Live Supabase (project `nfcgfrsxvdvuasbgrxdy`, read-only)

Role/database GUCs — `authenticated → statement_timeout=8s`, `anon → statement_timeout=3s`,
`authenticator → session_preload_libraries=supautils,safeupdate; statement_timeout=8s;
lock_timeout=8s`. **`pgrst.db_max_rows` is NOT set at role or database level**, consistent
with the prior audit's `current_setting(...) → null`: it is a PostgREST config-file /
Dashboard setting, not a DB GUC.

Cardinality: `sessions=6 folders=2 playbook_rules=2 lessons=0 auth.users=2`.
Ownership: all 6 sessions and both folders belong to ONE user (`30fa9df2-…`); the second
auth user owns zero rows. `pg_policies` on all four tables: `roles={public}`,
`qual = owner_id = auth.uid()` — applies to `anon` too.

Empirical REST probe (read-only GET, public anon key):
```
GET /rest/v1/sessions?select=… &  Prefer: count=exact
→ HTTP/1.1 200 OK   Content-Range: */0   body: []
```
**Decisive fact: an RLS-filtered read is HTTP 200 with `[]` and NO error.** `listSummaries()`
returns `[]` with `error == null`. `count=exact` is supported, which is what makes the fix work.

### Source (verified, with line refs)

- `services/session-sync.service.ts:58-85` `listSummaries()` / `:145-157` `listFolders()` —
  originally no `.range()`, `.limit()`, ordering or count.
- `services/session-sync.mapping.ts:316-354` `mergeByLww` — cloud miss + `syncedIds.has(id)`
  ⇒ `toDeleteLocalIds`. Never checks whether the local item is dirty.
- `services/session-sync.service.ts:462-537` `pullAndMergeSessions` — archived ⇒ spliced out;
  active ⇒ `trading = defaultTradingData()`. `:401-460` folders ⇒ `db.deleteFolder(id)`.
- **Ordering**: `pullAndMerge` (`:388-399`) documents its own steps — deleting pull at 3/4,
  `flushDirty()` at 5. `flushDirtySessions` re-reads `listMetas()`, by which time the row is
  gone ⇒ unpushed deltas are unrecoverable.
- Deletions are **local-only** — no `addPendingDelete`, no cloud delete (spec `:693-725`).
- Playbook/lessons are **safe by design**: `mergePlaybookPull` (`:675-707`) and
  `mergeLessonsPull` (`:801-833`) have no delete branch, rationale in-place (P-3).
- `pullAndMerge` callers: only `state/sync/session-sync.effects.ts:47-55` (`login$`).
- **IndexedDB not user-scoped**: `DB_NAME = 'emulador-workspaces'` is a module constant
  (`services/market-data-db.ts:16`, opened at `services/workspace-db.service.ts:53`).
  `state/auth/auth.effects.ts` `logout$:64-75` only signs out, `redirectAfterLogout$:76-85`
  only navigates; the only other `loggedOut` consumer is `auth.reducer.ts:55`.
  **No code path clears the workspace DB on logout.**
- Recovery path `openCloudOnlySession()` → `fetchPayload()`
  (`pages/sesiones/sesiones-page.component.ts:811`), but the cloud card list uses the SAME
  `listSummaries()` (`:490`), so truncated rows are invisible there too.

### Dead ends / refuted

- **Dashboard "Max rows" not readable**: MCP has no settings accessor, `get_advisors` shows
  no row cap, and no exposed relation has enough rows to measure the cap empirically
  (creating one would mutate production). `search_docs` did not surface the default.
- **`statement_timeout` is NOT a truncation vector** — a timeout is PostgREST error 57014,
  which sets `error`, which throws, which the caller's catch turns into "leave local state
  intact". Fails closed. Non-finding.
- **The pull never destroys cloud data.**
- **`Date.parse` on a null `client_updated_at`** → `NaN` → all comparisons false → keep-local
  branch. Not destructive.

## ROUTING (as filed in the report §6)

| Item | Where |
|---|---|
| V1 completeness guard (committed) | Merge with the current audit block — not an emergency hotfix |
| V2 owner-bound local store | **RFC-021** — highest-value item in the report |
| Tombstones / protocol versioning | RFC-024 / deferred |
| Align sessions/folders with playbook/lessons semantics | discuss inside the V2 RFC |
| Read `db-max-rows` from the Dashboard | **owner task, no tool path** (Settings → API → Max Rows) |

## RESUME BRIEF

You are **Agent C — Session Sync Red Team**. Work ONLY in
`C:\Users\78701\Desktop\trading-emulator-sync`, branch `agent/session-sync-red-team`, based
on `develop` @ `a2ca53b`. Never modify `C:\Users\78701\Desktop\trading-emulator` (canonical)
or any sibling `trading-emulator-*` worktree — you may READ them. Never checkout/merge/rebase
`develop`, never force-push, **never push to origin**. Commit to your own branch only,
pathspec `git add <paths>`, conventional messages. Live Supabase is READ-ONLY: no migrations,
no destructive SQL, no production data in tests (fixtures only).

**THE MISSION IS COMPLETE.** Deliverable `SESSION_SYNC_RED_TEAM.md` is committed at `f991e0a`;
the V1 fix plus its 8 specs are committed at `e538d0e`. All four gates were run raw and are
green (182 files / 2381 tests, all exits 0), and the fail-without-fix A/B was re-run from
scratch (6 failed with the guard reverted, 38 passed with it restored). Every probe already
run is archived in `## EVIDENCE ARCHIVE` above — do not re-run any of it.

If more work is ever asked of this branch, the open items are, in order:
1. **V2 (wrong-owner local wipe) is unfixed by design** — it needs an RFC covering an
   owner-bound local store (key IndexedDB per user, or stamp `owner_id` on each meta and
   scope the merge), plus a migration decision for existing local databases. Do not attempt
   it as a guard.
2. `db-max-rows` needs one human look at the Supabase Dashboard to become a number.
3. Do NOT introduce a generic repository framework and do NOT split `SessionSyncService`
   (it spans four independently-changing policies: sessions/folders `:1-581`, playbook
   `:588-707`, lessons `:709-833`, active-session `:835-914`). Explicitly out of scope.
