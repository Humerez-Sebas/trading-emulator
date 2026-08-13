# Session Sovereignty V2 RFC

## Status and scope

Track A plus the bounded independent-review corrections are implemented on
`agent/session-sovereignty-v2`. This RFC records the architecture that exists on
the branch. It does not authorize Supabase changes,
dependency changes, a generic repository layer, or migration of market data into
user partitions.

The invariant is simple: durable user-authored state and sync bookkeeping must
have exactly one local owner. A complete, correctly RLS-filtered pull for user B
must never read absence against user A's local state.

## Original destructive mechanism

The old local model used origin-scoped IndexedDB names while the cloud model used
owner-scoped rows:

1. User A populated `emulador-workspaces`, `emulador-playbook`, and
   `emulador-lessons`.
2. Logout cleared the auth slice and navigated within the SPA, but did not clear
   IndexedDB or the rest of NgRx state.
3. User B logged in on the same browser profile. Supabase RLS correctly returned
   B's complete set, often `[]`.
4. `mergeByLww` gave a missing cloud id its documented D1 meaning: a
   previously-synced local row was remotely deleted. A's sessions and folders
   were therefore removed or reset locally.
5. `pullAndMerge()` then ran `flushDirty()`. A's surviving never-synced records
   could be uploaded with B's `owner_id`.
6. Independently, boot hydration exposed A's playbook and lessons to B. Retained
   NgRx state could also be persisted into B's store on B's first asset switch.

RLS was not broken. The destructive inference was applied to a local set whose
owner did not match the RLS-scoped remote set.

## Decisions

### O-1: Partition user-authored stores by Supabase owner id

`OwnerIdentityService` resolves the persisted Supabase session before NgRx auth
bootstrap and memoizes a non-null id for one document lifetime. User-owned local
database names are deterministic:

| State | Physical database | Stores |
|---|---|---|
| Workspace/session state | `emulador-workspace-<ownerId>` v1 | `meta`, `folders`, `sync` |
| Playbook | `emulador-playbook-<ownerId>` v1 | `rules` |
| Lessons/journal | `emulador-lessons-<ownerId>` v1 | `lessons` |

Each storage service keys its cached connection by owner id and closes a stale
connection if identity changes unexpectedly. If no owner resolves, every
user-owned operation fails closed with `NO_OWNER_MESSAGE`; there is no shared or
anonymous fallback.

### O-2: Keep legitimate shared data shared

`emulador-workspaces` remains at schema version 6. Its `candles`, `datasets`, and
`series` stores are Market Data, not user workspace state. They are immutable or
re-downloadable cache/reference data, are intentionally shared across accounts,
and are opened directly by the Angular-free candle writer and market-data
repository. Per-owner duplication would violate the domain boundary and repeat
the measured approximately 700-second M1 ingest cost per symbol-year.

The old `meta`, `folders`, and `sync` stores remain physically present because
the shared schema is unchanged. They are no longer live stores.

### O-3: Quarantine legacy state, then adopt only with evidence

Pre-split rows have no owner field. Logging in is not proof that every legacy row
belongs to that account. The old `meta` and `folders` stores are therefore a
read-only quarantine:

- live reads and writes use only the current owner's partition;
- quarantine rows are never updated, moved, or deleted;
- adoption copies one record into an owner partition only when every meaningful
  session/folder id carried by that whole record appears in the complete
  RLS-scoped cloud set; records with no ids are not adopted;
- `assertCompletePull` must accept the exact-count response before that set can
  prove ownership;
- existing live keys are never overwritten;
- the copied record and its adopted-key marker commit atomically in one
  owner-database transaction;
- unproven rows remain in quarantine and are reconsidered after later pulls.

This is policy O-7: never auto-adopt ambiguity, never auto-discard evidence, and
never let one owner's adoption marker affect another owner.

The legacy un-suffixed playbook and lessons databases are also left untouched.
They have no safe per-record ownership proof path in this track. Remote-synced
items repopulate owner partitions through their normal non-destructive pulls;
local-only ambiguous items remain recoverable on disk rather than being guessed
into an account.

### O-4: Account changes cross a document boundary

`SessionSovereigntyEffects.hardReloadOnLogout$` performs
`DOCUMENT.location.assign('/login')` on `loggedOut`. This discards all NgRx and
service memory, preventing A's in-memory workspace from being persisted while B
is authenticated. It also makes `OwnerIdentityService` memoization sound: one
document lifetime has at most one non-null owner.

The existing router redirect remains as a fallback. Login bootstrap in the new
document resolves the persisted owner, opens only that owner's stores, then runs
the normal cloud pull. An A to B switch is logout/reload/login, never an in-page
identity mutation. B to A follows the same lifecycle and reopens A's unchanged
partition.

Cross-tab auth drift is fail-closed. Before any SessionSync cloud mutation or
destructive pull, the authenticated Supabase user id must agree with the owner
resolved by `WorkspaceDbService`. A stale A-bound tab observing B auth can
neither upload/delete under B nor apply B's absence to A-local rows. The stale
tab must be reloaded; this track adds no cross-tab coordination or recovery UI.

### O-5: Persistence clocks follow session identity, not symbol storage keys

`persistMeta$` and `WorkspacesEffects.doSwitch` write whole `WorkspaceMeta`
records while the NgRx snapshot intentionally omits sync clocks. Both writers
therefore reconcile clocks by session id against the stored record:

- when the former active id is archived, its active clock pair moves onto that
  `SavedSession`, and its real outgoing snapshot is stamped dirty;
- when an archived id becomes active, that saved session's own clocks become the
  active clocks;
- a genuinely new id starts with fresh provenance and never inherits the former
  active id's clocks;
- later debounced writes preserve already-reconciled archived clocks by id.

`doSwitch` stamps a real active snapshot with
`max(Date.now(), priorClient + 1, priorSynced + 1)` in the same `putMeta`.
`markActiveDirty` uses the same monotonic formula, so equal or backward wall time
cannot make an edit clean. Scratch sessions are not newly marked dirty.

## Durable owner boundaries

| Data | Sovereign owner | Boundary/enforcement |
|---|---|---|
| Workspace meta, active/archived sessions, drawings, layout, folders | Supabase user | Owner-suffixed workspace DB; fail closed without owner |
| Session LWW clocks, pending deletes, pull/adoption marker | Same Supabase user | `sync` store in the same owner DB |
| Playbook rules | Supabase user | Owner-suffixed playbook DB |
| Lessons/journal text and scene evidence | Supabase user | Owner-suffixed lessons DB |
| Candles, R2 dataset manifests, legacy CSV series | Market Data domain | Shared `emulador-workspaces` cache |
| Pre-split unowned records | No proven owner | Read-only quarantine; evidence-based copy only |
| Auth session | Supabase auth | Existing Supabase browser session |

No session payload contains candles. Remote LWW, RLS, payload guards, and D1
membership semantics are unchanged within one owner.

## Failure modes

| Failure | Behavior |
|---|---|
| No auth session or owner lookup fails | User-owned store rejects; no fallback to quarantine/shared state |
| Auth user differs from the DB-bound owner | SessionSync rejects before cloud mutation or destructive pull; stale tab requires reload |
| Offline cold startup with a persisted session | Owner id comes from local Supabase session; that owner's local partition remains usable |
| Owner cannot be resolved offline | Fail closed; data remains on disk for retry |
| Pull fails before complete cloud ids exist | No adoption; normal pull catch leaves local state intact |
| Server response is truncated or exact count is null | `assertCompletePull` rejects it; no destructive absence inference and no ownership proof |
| Adoption is interrupted during copy/marker write | The owner-DB transaction aborts both; retry copies data and marker together; quarantine remains intact |
| Adoption marker is written but quarantine remains | Expected; quarantine is preservation evidence, not a move queue |
| Upsert fails after dirty stamp | `activeSyncedAt` is unchanged, so the row remains dirty and retryable |
| Logout sign-out call fails | Existing auth flow still dispatches `loggedOut`; hard reload clears in-memory user state |
| Unexpected in-document owner change | DB services key connections by owner and close stale connections; the required lifecycle still reloads |

## Rollback and recovery

The migration is additive and copy-based. Rolling back application code must not
delete per-owner databases or the quarantine. A rollback build that reads only
the old shared stores would not see new owner-partition edits and is therefore a
read-compatibility rollback, not a safe write rollback. Recovery options are:

1. Re-deploy the owner-aware build and resume from each owner partition.
2. Recover remote-synced records through the normal RLS-scoped pull.
3. Inspect quarantined legacy records and owner adoption markers when resolving
   ambiguous local-only data; do not bulk-assign them based on the latest login.
4. For an interrupted dirty session, retain its owner DB. The strict local clock
   keeps it eligible for a later flush.

No automatic cleanup policy is introduced. Deleting quarantine or per-owner
databases requires a separate, explicit retention/recovery decision.

## Negative probes

The fresh owner-isolation probe temporarily made `ownerWorkspaceDbName()` return
one owner-independent name. The targeted command failed 7 tests in 2 files, with
59 passing (exit 1):
A to B destruction, A to B to A loss, local-only upload as B, B to A exposure,
cross-owner legacy claim, the historical wrong-owner hazard, and the naming
invariant. Exact restoration was verified by `git diff --exit-code`; the same
targeted command returned 66/66 tests (exit 0).

The fresh A5 mutation changed only `doSwitch`'s reconciliation call from
`markActiveDirty=true` to `false`. The targeted meta-ownership command failed 4
of 5 tests (exit 1): stable-id dirtiness, new-session provenance,
switch-session provenance, and subsequent persist preservation. Exact
restoration was verified by `git diff --exit-code`; the command then returned
5/5 tests (exit 0). The primary A5 verdict remains **CONFIRMED DEFECT**.

These probes are mutation evidence, not committed alternate behavior.

## Final gates

Closure requires fresh, raw, unpiped runs from `emulador/`:

```text
npx tsc -p tsconfig.app.json --noEmit
npx tsc -p tsconfig.spec.json --noEmit
npx ng test --watch=false
npm run lint
npm run build
```

Exact closure output is recorded in `PROGRESS.md`: app/spec tsc exit 0, lint exit
0, build exit 0, and the isolated full rerun passed 186 files / 2455 tests. The
first concurrent full-suite attempt had one honest 5.012-second timeout in the
25k-row candle-writer test; its targeted rerun passed 9/9 and the isolated full
rerun passed. The known initial-bundle
budget warning is accepted only if the build exits zero and introduces no new
chunk type or Vitest sentinel.

## Residual risks and non-goals

- Ambiguous local-only legacy workspace/playbook/lesson data is preserved but
  not automatically surfaced. A future user-driven recovery workflow may be
  needed; silently assigning it is forbidden.
- Quarantine has no retention cleanup, so it consumes local storage.
- `localStorage` preferences and widget positions remain origin-scoped. They are
  not included because Track A protects private durable trading knowledge and
  destructive sync state, not general device preferences.
- Telemetry remains outside this implementation. It is loss-tolerant, local-only
  data and has no destructive cloud merge in this track.
- No broad cross-tab account-switch protocol is added. A stale tab fails closed
  at the owner-agreement boundary and requires reload; automatic auth-event
  reload in another tab remains unimplemented.
- Ownership is proven only for whole legacy records whose every meaningful id
  appears in a complete exact-count owner-scoped response. Mixed-owner and
  no-id rows remain quarantined; per-session extraction is intentionally absent.
- No Supabase schema, RLS, Vercel, dependency, lockfile, or market-data worker
  change is part of this RFC.
