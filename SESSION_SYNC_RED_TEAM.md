# Session Sync Red Team — TD-E5 reachability

Agent C · branch `agent/session-sync-red-team` · baseline `develop` @ `a2ca53b`
Live Supabase project `nfcgfrsxvdvuasbgrxdy` inspected **read-only**.

---

## Verdict

| Vector | Verdict |
|---|---|
| **V1 — truncated pull** (the assigned question) | **REACHABLE ABOVE the PostgREST `db-max-rows` cap.** Not reachable today at 6 sessions / 2 folders. |
| **V2 — wrong-owner pull** (found while tracing V1) | **REACHABLE TODAY.** Needs no cap, no truncation, and no growth. |

The prior audit's calibration of V1 was correct and I am not escalating it: the mechanism is
unsafe, but nothing proves this project has ever truncated or lost data. What is new is
**V2**, which reaches the same destructive code path through a different door and is live now.

**One number in this report is deliberately absent.** The effective PostgREST `db-max-rows`
for this project is **UNVERIFIED** — it is a Dashboard/config setting, not a database GUC, so
no SQL or MCP tool available here can read it, and it cannot be measured empirically without
mutating production. V1's threshold is therefore stated as an inequality, never as a number.
See §2. Anyone quoting "1000" is quoting PostgREST's documented default, not this project.

### Classification of each finding

| # | Finding | Classification |
|---|---|---|
| V1 | Unpaginated pull + `absence ⇒ delete` | **Confirmed defect** — proven by a test that fails without the fix (§4). Fixed in this branch. |
| V2 | Origin-scoped IndexedDB + owner-scoped RLS | **Confirmed defect, unfixed** — architectural, needs an RFC. Pinned by a passing spec. |
| — | `mergeByLww` deletes on remote absence (D1) | **Intentional decision** — multi-device delete propagation. Not a bug in itself; it is the *premise* that makes an incomplete pull destructive. Preserved by the fix. |
| — | Sessions/folders delete but playbook/lessons do not | **Architectural debt / owner decision** — the inconsistency is real and documented, but which semantics wins is the owner's call (§6). |
| — | `statement_timeout` as a truncation vector | **Refuted** — fails closed. See Appendix. |
| — | Pull destroying cloud data | **Refuted** — deletions are local-only, pinned by existing spec `:693-725`. |

---

## 1 — Mechanism (C1)

The full protocol, end to end:

```
listSummaries()                    session-sync.service.ts:58-85
  .from('sessions').select(13 cols)     ← no .range(), .limit(), .order(), no count
  error ⇒ throw          ·  data ?? [] ⇒ rows
        ↓
mergeByLww(local, cloud, syncedIds)     session-sync.mapping.ts:316-354
  cloud miss  AND  syncedIds.has(id)  ⇒  toDeleteLocalIds      ← absence means "deleted"
        ↓
pullAndMergeSessions()             session-sync.service.ts:462-537
  archived ⇒ meta.sessions = filter(s.id !== id)
  active   ⇒ activeSessionId = undefined; trading = defaultTradingData()
        ↓
db.putMeta(meta)                   ← IndexedDB overwritten. Local copy gone.
```

`listFolders()` (`:145-157`) and `pullAndMergeFolders()` (`:401-460`) are the same shape,
ending in `db.deleteFolder(id)`.

Three properties decide the severity:

**(a) Absence cannot be distinguished from omission.** There are no tombstones and no
protocol version. A row the server chose not to send is indistinguishable from a row the
server no longer has.

**(b) `mergeByLww` never checks whether the local item is dirty.** The delete branch tests
only `syncedIds.has(localItem.id)`. A session synced at T1 and edited to T2 without a
successful push is deleted exactly as readily as an untouched one — and the cloud only ever
held T1, so the T1→T2 delta exists nowhere else.

**(c) The pull deletes before the flush that would have saved the delta.** `pullAndMerge`
(`:388-399`) runs the deleting pull at step 3 and `flushDirty()` at step 5.
`flushDirtySessions` re-reads `listMetas()` from IndexedDB, by which time the row is gone.
**This is what converts "local cache loss" into permanent destruction of unpushed edits.**

### The codebase already knows the safe answer

`mergePlaybookPull` (`:675-707`) and `mergeLessonsPull` (`:801-833`) deliberately have **no
delete branch**, with the rationale written in-place: *losing a trader's rule/knowledge on a
stale pull would violate P-3*. Playbook rules and lessons are safe by design. Sessions and
folders are the inconsistent pair — the same repository, the same author, the opposite
decision. This is the strongest single argument that V1 is a defect rather than intent.

---

## 2 — Reachability threshold (C3)

### V1 — truncation

The exact threshold: **`session_count > db-max-rows`** (independently, `folder_count >
db-max-rows`). Loss on a truncated pull is
`min(returned_omitted, previously_synced_local)` rows, i.e. up to `N − cap` sessions.

What I established about the cap, and what I could not:

- **`pgrst.db_max_rows` is NOT set at role or database level.** `pg_db_role_setting` for the
  whole cluster returns only timeouts and search paths:
  `authenticated → statement_timeout=8s`, `anon → statement_timeout=3s`,
  `authenticator → session_preload_libraries, statement_timeout=8s, lock_timeout=8s`.
  This explains, and is consistent with, the prior audit's
  `current_setting('pgrst.db_max_rows', true) → null`: it is a PostgREST config-file /
  Dashboard setting, not a database GUC, so SQL cannot read it either way.
- **I could not read the effective value.** The Supabase MCP exposes no settings/config
  accessor and the advisors surface no row cap. I also could not measure it empirically:
  no relation in an exposed schema holds more than a handful of rows, and creating one
  would mutate production. **The effective `db-max-rows` for this project remains
  UNVERIFIED — I am not going to name a number.**

Current cardinality (live): `sessions=6 · folders=2 · playbook_rules=2 · lessons=0 ·
auth.users=2`. Six rows exercise no cap under any plausible configuration, so **V1 is not
reachable today**, and there is no evidence of historical loss.

### V2 — wrong-owner pull

**No threshold. Reachable at the current 6 rows.**

Three facts compose:

1. RLS on all four tables is `roles={public}` with `qual = owner_id = auth.uid()`. It
   applies to `anon` as well as `authenticated`.
2. An RLS-filtered read is **not an error**. Empirically, against the live project with the
   public anon key:
   ```
   GET /rest/v1/sessions?select=id,name,symbol,folder_id,client_updated_at
       Prefer: count=exact
   → HTTP/1.1 200 OK   Content-Range: */0   body: []
   ```
   So `listSummaries()` returns `[]` with `error == null`, and every previously-synced local
   session is queued for deletion.
3. **IndexedDB is origin-scoped, not user-scoped.** `WorkspaceDbService` opens a
   module-level constant `DB_NAME = 'emulador-workspaces'` (declared in
   `services/market-data-db.ts:16`, opened at `services/workspace-db.service.ts:53`) —
   there is no user id anywhere in the key. And logout does not compensate: in
   `state/auth/auth.effects.ts`, `logout$` (`:64-75`) only calls `auth.signOut()` and
   `redirectAfterLogout$` (`:76-85`) only navigates to `/login`. The sole other consumer of
   `loggedOut` is `state/auth/auth.reducer.ts:55`, which resets auth state only.
   **No code path clears the workspace database on logout.**

All 6 sessions and both folders belong to one user (`30fa9df2-…`); the second `auth.users`
row owns nothing. So: user A works and syncs, user B signs in on the same browser profile,
`login$` fires `pullAndMerge`, B's pull is complete and correct and empty — and **every
session and folder A had synced is deleted from local IndexedDB**, including any unpushed
edits.

This is not a truncation bug. The response is complete. No completeness guard can help,
because absence is being interpreted across an owner boundary that the local store does not
model.

---

## 3 — Severity and blast radius

### Severity

| Vector | Severity | Impact | Likelihood | Rationale |
|---|---|---|---|---|
| **V1 — truncated pull** | **High impact · Low likelihood today ⇒ MEDIUM** | Silent, unbounded local data loss; unpushed edits are unrecoverable | Requires `session_count > db-max-rows`; live cardinality is 6 | Impact is maximal (silent destruction, no error, no undo prompt) but the trigger needs roughly two orders of magnitude of growth, or a Dashboard change. Not an emergency; must not be left open. |
| **V2 — wrong-owner pull** | **High impact · Reachable today ⇒ HIGH** | Same destruction, plus it crosses a user boundary | Needs only a second account signing in on one browser profile | No cap, no truncation, no growth required. The only thing standing between the current deployment and data loss is that the second `auth.users` row owns nothing yet. |

Both vectors are **silent**: no error surfaces, no confirmation is requested, and the UI
renders the post-deletion state as if it were the truth. Severity is driven by that silence
as much as by the deletion — a user cannot tell the difference between "my sessions were
destroyed" and "my sessions were never there".

### Blast radius

| Entity | Deleted on remote absence? | Where |
|---|---|---|
| **sessions** — archived | **Yes**, spliced from `meta.sessions` | `:517` |
| **sessions** — active | **Yes**, `trading = defaultTradingData()` — positions, orders, history, balance, session name | `:519-522` |
| **folders** | **Yes**, `db.deleteFolder(id)` | `:436-438` |
| trades / drawings / notes / layout | **Yes, transitively** — they live inside the session payload | — |
| playbook_rules | No — `mergePlaybookPull` has no delete branch | `:675-707` |
| lessons | No — `mergeLessonsPull` has no delete branch | `:801-833` |

**Cloud data is never destroyed.** The D1 removals are local-only: no `addPendingDelete`, no
cloud `delete()`, and the wiped active session fails `isRealSession` so `flushDirty` will not
push the emptied state over the good cloud row. Existing spec `:693-725` already pins this.

So recoverability splits cleanly:

- **Clean (fully-pushed) sessions — recoverable.** The cloud row survives and
  `openCloudOnlySession()` → `fetchPayload()` (`sesiones-page.component.ts:811`) can restore
  it. Caveat: the cloud card list is fed by *the same* unpaginated `listSummaries()`
  (`:490`), so under V1 the omitted rows are invisible in the UI at the same moment they are
  deleted locally — reachable again only on a later pull that happens to include them, and
  the ordering is unspecified so which rows return is arbitrary and unstable between pulls.
- **Dirty (unpushed) sessions — PERMANENTLY DESTROYED.** The delta between `syncedAt` and
  `clientUpdatedAt` exists only in IndexedDB, and property (c) above deletes it before the
  flush. Nothing anywhere holds it afterwards.

Realistic trigger for the dirty case: the 2 s `flushOnEdit$` debounce had not fired, or the
last flush failed (offline/transient) and the per-entity `catch` left the row dirty, and the
next thing that happens is a login pull.

---

## 4 — Reproduction (C2)

Eight specs added to `emulador/src/app/services/session-sync.service.spec.ts`, using the
file's existing no-network fake client plus `fake-indexeddb`. **No production data.**
(Suite total 2373 → 2381 = +8, on the same 182 spec files.)

The harness gained a `count` field on `FakeResult` and `summaryCount`/`folderCount` options
on `makeFakeClient`, modelling PostgREST's `Prefer: count=exact` — set a count *higher* than
the rows returned and you have a page the server truncated. `countFor()` populates `count`
only when the caller actually asked, so a client that stops asking makes the tests fail.

| Spec | Encodes |
|---|---|
| `listSummaries throws when the server reports more rows than it returned` | the read-level guard |
| `listFolders throws …` | same, folders |
| `a synced local session OMITTED from a truncated page survives the pull` | V1 core |
| `a DIRTY (unpushed) local session … is preserved AND pushed` | the unrecoverable case, and that the fix converts loss into a push |
| `a synced-absent ACTIVE session keeps its trading data when the page was truncated` | the `defaultTradingData()` wipe |
| `a synced local folder omitted from a truncated page is not deleted` | folder parity |
| `D1 is PRESERVED: a genuinely complete pull still removes a synced-absent local session` | the guard is narrow — intended behaviour untouched |
| `RESIDUAL HAZARD (unfixed, documented): a complete pull for a DIFFERENT owner still wipes local data` | **V2 pinned as known-unfixed** |

### Falsification — the part that makes these tests worth anything

A test that passes with the guard removed proves nothing. This whole audit programme exists
because a green suite hid a real defect, so the A/B below was **re-run from scratch**, raw
and unpiped, rather than carried over from notes.

**A — guard reverted in the working tree** (`git show a2ca53b:…/session-sync.service.ts >`
the same path; `assertCompletePull` occurrences: 4 → 0; nothing committed):

```
$ npx ng test --watch=false --include=src/app/services/session-sync.service.spec.ts
× listSummaries throws when the server reports more rows than it returned
× listFolders throws when the server reports more rows than it returned
× a synced local session OMITTED from a truncated page survives the pull
× a DIRTY (unpushed) local session omitted from a truncated page is preserved AND pushed
× a synced-absent ACTIVE session keeps its trading data when the page was truncated
× a synced local folder omitted from a truncated page is not deleted
Test Files  1 failed (1)
Tests       6 failed | 32 passed (38)
FALSIFY_EXIT=1
```

The assertion messages are the finding, stated by the code itself:

```
a synced local folder omitted …   AssertionError: expected [] to include 'f-omitted'
a synced-absent ACTIVE session …  AssertionError: expected undefined to be 'A'
                                    (activeSessionId cleared, trading data wiped)
a DIRTY (unpushed) local session … AssertionError: expected undefined to be defined
                                    (the unpushed row is simply gone)
```

**B — guard restored** (`git checkout HEAD -- …/session-sync.service.ts`, back to 4
occurrences):

```
$ npx ng test --watch=false --include=src/app/services/session-sync.service.spec.ts
Test Files  1 passed (1)
Tests       38 passed (38)
RESTORED_EXIT=0
```

All six fail on the defect and pass on the fix. The two documentation specs (`D1 is
PRESERVED`, `RESIDUAL HAZARD`) pass in **both** states by design — they pin behaviour that
must not change, so they are deliberately not part of the six.

---

## 5 — Fix applied (C4/C5)

The smallest mechanism that is semantically correct for V1: **ask the server for its own
exact count and refuse a short page.**

```ts
function assertCompletePull(entity: string, received: number, count: number | null): void {
  if (count != null && received < count) {
    throw new Error(`Respuesta incompleta del servidor (${entity}): ${received} de ${count} filas.`);
  }
}
```

`listSummaries()` and `listFolders()` now pass `{ count: 'exact' }` and call it. That is the
entire production change — no new file, no new dependency, no abstraction, and no change to
`SessionSyncService`'s already-overloaded shape. It deliberately does **not** touch the
four-policy split that a parallel audit flagged.

Why refuse rather than paginate:

- **It fails closed onto an already-proven path.** Throwing lands in each pull's existing
  offline `catch`, whose "leave local state untouched, retry next pull" behaviour is already
  covered by spec `:665-691`. A `.range()` loop would add a new control flow *and* still need
  a completeness check to be safe.
- **A short page is a degraded answer for every caller,** not just the merge. The Sessions
  page would otherwise render a silently partial cloud list and let the user conclude that
  sessions had vanished; it now shows `syncState = 'offline'`, which is honest.
- `count != null` keeps the guard inert when no count was requested, so behaviour is
  unchanged anywhere the option is absent.

Known cost: `count=exact` is a full count per pull. Irrelevant at this cardinality; if the
table ever grows enough for that to matter, it has also grown enough to need real pagination,
and that is the moment to revisit — `count=planned` is the cheaper swap.

**V2 is deliberately NOT fixed here.** The correct fix is to bind local workspace data to an
owner id (either key the IndexedDB database per user, or stamp `owner_id` on each meta and
scope the merge to it) and/or clear local state on logout. That is a protocol and migration
decision affecting existing users' local databases — squarely an RFC, not a guard. Per the
implementation bar I stopped at pinning it with a passing spec that documents the hazard.

### Gates

Run raw and unpiped from `emulador/`, exit status read directly (never through `| tail` or
`| head`, which would swallow a non-zero exit and make a failure read as a pass):

```
$ npx tsc -p tsconfig.app.json --noEmit
APP_TSC_EXIT=0

$ npx tsc -p tsconfig.spec.json --noEmit
SPEC_TSC_EXIT=0

$ npm run lint
All files pass linting.
LINT_EXIT=0

$ npx ng test --watch=false
Test Files  182 passed (182)
Tests       2381 passed (2381)
Duration    27.77s
NG_TEST_EXIT=0
```

Baseline `develop` @ `a2ca53b` was 182 files / 2373 tests green; this branch is 182 / 2381.
Nothing was inherited red and nothing was masked.

---

## 6 — Routing

| Item | Where it belongs | Why |
|---|---|---|
| **V1 completeness guard** (this commit) | **Merge with the current audit block** — not an emergency hotfix | Fix is in hand and gated; V1 is not reachable at 6 rows, so nothing is on fire. Shipping it now closes the hazard before growth or a Dashboard change can open it. |
| **V2 owner-bound local store** | **RFC-021** (or the next session-sync RFC) | Reachable today, destroys local data across an account switch, and needs a migration decision for existing IndexedDB contents. Highest-value item in this report. |
| **Tombstones / protocol versioning** for sessions+folders | **RFC-024 / deferred** | The principled fix for "absence is destructive". Larger than the current need, and the completeness guard plus owner binding remove the reachable paths first. |
| **Align sessions/folders with playbook/lessons semantics** | discuss inside the V2 RFC | The never-delete-on-pull rule is already the house style for two of four entities; whether sessions should adopt it is an owner decision about multi-device delete propagation, not a bug fix. |
| **Read `db-max-rows` from the Dashboard** | **owner task, no tool path** | Not exposed by MCP or SQL. One human look at Settings → API → Max Rows converts V1's threshold from "unknown" to a number. Worth doing once. |

---

## Appendix — what was refuted

- **`statement_timeout` is not a truncation vector.** `authenticated` carries
  `statement_timeout=8s`, but a timeout is PostgREST error 57014 → `error` is set →
  `listSummaries()` throws → the caller's catch leaves local state intact. Fails closed
  already. Non-finding.
- **The pull never destroys cloud data.** Verified by reading every mutation in the delete
  path and by existing spec `:693-725`. Cloud rows survive every scenario in this report.
- **`Date.parse` on a null `client_updated_at`** yields `NaN`; all comparisons in
  `mergeByLww` are then false, which falls into the keep-local branch. Not destructive.
