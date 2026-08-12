# Agent C — Session Sync Red Team · PROGRESS

Worktree: `C:\Users\78701\Desktop\trading-emulator-sync`
Branch: `agent/session-sync-red-team` · Baseline: `a2ca53b` (develop)

## STATUS

**~70% complete.**

- **C1 (trace the protocol)** — COMPLETE. Mechanism fully traced, live Supabase probed.
- **C2 (reproduction)** — IN FLIGHT. `npm ci` done (exit 0). Regression tests designed, not yet written.
- **C3 (verdict)** — COMPLETE (provisional wording, see below).
- **C4 (remediation)** — DESIGNED, not yet applied.
- **C5 (implementation bar)** — decision made: implement the exact-count fail-closed guard (small, reuses an already-tested path); do NOT attempt the owner-binding fix (protocol decision → RFC).
- **DELIVERABLE `SESSION_SYNC_RED_TEAM.md`** — NOT STARTED.

## PROVISIONAL VERDICT

**`REACHABLE ABOVE <the PostgREST row cap>` for the truncation vector**, and
**`REACHABLE TODAY` for a second, adjacent absence vector (wrong-owner / RLS-empty pull)** that
the same `absence ⇒ deletion` rule makes destructive at the current 6 rows.

## EVIDENCE SO FAR

### Live Supabase (project `nfcgfrsxvdvuasbgrxdy`, read-only)

`execute_sql`: role/database-level GUCs —
```
authenticated  -> statement_timeout=8s
anon           -> statement_timeout=3s
authenticator  -> session_preload_libraries=supautils,safeupdate; statement_timeout=8s; lock_timeout=8s
```
**Conclusion: `pgrst.db_max_rows` is NOT set at role or database level.** (Prior audit's
`current_setting('pgrst.db_max_rows', true) -> null` is consistent — it is a PostgREST
config-file / Dashboard setting, not a DB GUC. Still unreadable with available tools.)

`execute_sql` cardinality:
```
sessions=6  folders=2  playbook_rules=2  lessons=0  auth.users=2
```

`execute_sql` ownership: **all 6 sessions and both folders belong to ONE user**
(`30fa9df2-2e94-4cde-ab1d-2818a076c38d`). The second auth user owns zero rows.

`pg_policies` for sessions/folders/playbook_rules/lessons: every policy is `roles={public}`
with `qual = owner_id = auth.uid()` (or `auth.uid() = user_id`). Applies to `anon` too.

**Empirical REST probe (read-only GET, public anon key):**
```
GET /rest/v1/sessions?select=id,name,symbol,folder_id,client_updated_at
    apikey+Authorization: <anon>   Prefer: count=exact
-> HTTP/1.1 200 OK
   Content-Range: */0
   body: []
GET /rest/v1/folders?...  -> status=200
```
**This is the decisive fact: an RLS-filtered read returns HTTP 200 with `[]` and NO error.**
So `listSummaries()` returns `[]` with `error == null`. `Prefer: count=exact` is supported
(the `Content-Range` denominator is populated), which is what makes the proposed fix viable.

### Source read + conclusions

- `services/session-sync.service.ts:58-85` `listSummaries()` — no `.range()`, `.limit()`,
  ordering, or count. `:145-157` `listFolders()` — same.
- `services/session-sync.mapping.ts:316-354` `mergeByLww` — `cloud` miss + `syncedIds.has(id)`
  ⇒ `toDeleteLocalIds`. **It never checks whether the local item is dirty.**
- `services/session-sync.service.ts:462-537` `pullAndMergeSessions` — applies
  `toDeleteLocalIds`: archived ⇒ spliced out of `meta.sessions`; **active ⇒
  `meta.trading = defaultTradingData()`** (trades/positions/orders/balance destroyed).
  `:401-460` `pullAndMergeFolders` ⇒ `db.deleteFolder(id)`.
- **Ordering bug**: `pullAndMerge` (`:388-399`) runs the deleting pull at step 3 and
  `flushDirty()` at step 5. A local session with `clientUpdatedAt > syncedAt` (unpushed
  edits) that is absent from the pull is deleted BEFORE the flush that would have saved it.
  `flushDirtySessions` re-reads `listMetas()` from IndexedDB, so the row is simply gone.
  ⇒ **the unpushed delta is unrecoverable; the cloud only holds the older `syncedAt` version.**
- Deletions are **local-only** — no `addPendingDelete`, no cloud delete. Verified by existing
  tests `session-sync.service.spec.ts:693-725`. Cloud rows survive.
- **Playbook and lessons are SAFE by design**: `mergePlaybookPull` (`:675-707`) and
  `mergeLessonsPull` (`:801-833`) explicitly never delete on remote absence
  ("losing a trader's rule/knowledge on a stale pull would violate P-3").
  ⇒ the codebase already chose the safe semantics for 2 of 4 entities. Sessions/folders
  are the inconsistent pair.
- `pullAndMerge` callers: only `state/sync/session-sync.effects.ts:47-55` (`login$`, on
  `sessionResolved`/`authSuccess` with `user != null`).
- `auth/supabase.service.ts` — single client, `persistSession: true`.
- **IndexedDB is NOT user-scoped**: `workspace-db.service.ts` opens a constant `DB_NAME`
  (`emulador-workspaces`). Logout (`auth.effects.ts:64-75`) does NOT clear it.
  ⇒ account switch on one browser profile = user B's pull wipes user A's local sessions.
- Recoverability path exists: `pages/sesiones/sesiones-page.component.ts:811`
  `openCloudOnlySession()` → `fetchPayload()`. BUT the cloud card list comes from the SAME
  unpaginated `listSummaries()` (`:490`), so truncated rows are invisible there too.

## DEAD ENDS

- **Supabase Dashboard "Max rows" is still NOT readable** with the available tools
  (MCP has no settings/config accessor; `get_advisors` exposes no row cap). Confirmed it is
  not a role/db GUC, which is new, but the effective PostgREST `db-max-rows` value remains
  UNVERIFIED. Do not guess it in the report — state it plainly.
- Cannot empirically measure the cap either: no relation in an exposed schema has >1000 rows,
  and creating one would mutate production (forbidden). `Prefer: count=exact` on a 6-row table
  cannot distinguish "capped at 1000" from "uncapped".
- `search_docs` did not surface the documented default for the API "Max rows" setting.
- `statement_timeout=8s` on `authenticated` is NOT a silent-truncation vector — a timeout is
  PostgREST error 57014, which sets `error`, which makes `listSummaries()` throw, which the
  caller's catch turns into "leave local state intact". Fails closed. Non-finding.

## NEXT STEPS (ordered)

1. Apply the production fix: `assertCompletePull()` helper + `{ count: 'exact' }` in
   `listSummaries()` and `listFolders()`; throw when `received < total`. Throwing routes into
   the existing offline catch (already proven safe by spec `:665-691`).
2. Extend the spec fake (`FakeResult.count`, `makeFakeClient({summaryCount, folderCount})`).
3. Write the regression tests in `session-sync.service.spec.ts`:
   (a) truncated sessions response deletes an omitted-but-existing row → must NOT after fix;
   (b) a DIRTY (unpushed) local session is destroyed by a truncated pull → the unrecoverable case;
   (c) truncated folders response deletes a local folder;
   (d) guard is inert when the response is complete (count == rows).
4. Run gates raw from `emulador/`: `npx tsc -p tsconfig.app.json --noEmit`,
   `npx tsc -p tsconfig.spec.json --noEmit`, `npx ng test --watch=false`, `npm run lint`.
   NEVER pipe through `| tail`/`| head`.
5. Write `SESSION_SYNC_RED_TEAM.md` and commit.

## RESUME BRIEF

You are **Agent C — Session Sync Red Team**. Work ONLY in
`C:\Users\78701\Desktop\trading-emulator-sync`, branch `agent/session-sync-red-team`,
based on `develop` @ `a2ca53b`. Never modify `C:\Users\78701\Desktop\trading-emulator`
(canonical) or any sibling `trading-emulator-*` worktree — you may READ them. Never
checkout/merge/rebase `develop`, never force-push, never push. Commit to your own branch
only, pathspec `git add <paths>`, conventional messages.

Mission: determine whether `remote absence ⇒ local deletion`, combined with an unpaginated
remote query, can actually destroy user data. Evidence before mutation: prove or refute
reachability; distinguish confirmed defect / intentional design / stale docs / architectural
debt / owner decision. The live Supabase project may be inspected READ-ONLY only — no
migrations, no destructive SQL, no production data in tests (fixtures only).

Constraint: do NOT introduce a generic repository framework and do NOT over-abstract
`SessionSyncService` (it already spans four independently-changing policies:
sessions/folders `:1-581`, playbook `:588-707`, lessons `:709-833`, active-session `:835-914`).
Do not undertake that split.

Deliverable: `SESSION_SYNC_RED_TEAM.md` at the worktree root — mechanism · reproduction (with
the actual test) · severity · reachability threshold (the exact row count/config that flips it)
· affected entities · proposed minimal fix · the test · and whether this is an immediate
hotfix, RFC-021, RFC-024, or deferred. Then commit. Return a digest ≤110 lines: verdict, exact
threshold, arithmetic/evidence, blast radius, what was implemented, commit SHA.

Everything already established is in `## EVIDENCE SO FAR` above — do not re-run those probes.
Remaining scope is `## NEXT STEPS` above. Current verdict is in `## PROVISIONAL VERDICT`.
