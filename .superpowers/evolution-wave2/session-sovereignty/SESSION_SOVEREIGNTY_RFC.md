# Session Sovereignty V2 RFC

## Status and scope

Track A is implemented on `agent/session-sovereignty-v2`. This RFC records the
architecture that exists on the branch. It does not authorize Supabase changes,
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
- adoption copies one record into an owner partition only when one of that
  record's own session/folder ids appears in the complete RLS-scoped cloud set;
- `assertCompletePull` must accept the exact-count response before that set can
  prove ownership;
- existing live keys are never overwritten;
- adopted keys are recorded in that owner's `sync` store;
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

### O-5: Outgoing real-session persistence owns its atomic dirty stamp

`WorkspacesEffects.doSwitch` writes a whole `WorkspaceMeta` record before it
restores the incoming workspace. Because the NgRx snapshot intentionally omits
sync clocks, this writer re-reads the outgoing stored meta in the same operation.
For a session satisfying the existing `isRealSession` predicate it:

- preserves `activeSyncedAt` as provenance of the last successful push; and
- writes `activeClientUpdatedAt` strictly later than both stored clocks.

The timestamp and outgoing trading snapshot land in one `putMeta`. This keeps the
outgoing row eligible for `flushDirty` even though the later 2-second debounce
observes the restored incoming workspace. Scratch sessions preserve any existing
clock but are not newly marked dirty.

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
| Offline cold startup with a persisted session | Owner id comes from local Supabase session; that owner's local partition remains usable |
| Owner cannot be resolved offline | Fail closed; data remains on disk for retry |
| Pull fails before complete cloud ids exist | No adoption; normal pull catch leaves local state intact |
| Server response is truncated | `assertCompletePull` rejects it; no destructive absence inference and no ownership proof |
| Adoption is interrupted after copy but before marker | Existing owner key prevents overwrite on retry; quarantine remains intact |
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

The owner-isolation probe temporarily made `ownerWorkspaceDbName()` return one
owner-independent name. The full suite then failed 7 tests in 2 files (exit 1):
A to B destruction, A to B to A loss, local-only upload as B, B to A exposure,
cross-owner legacy claim, the historical wrong-owner hazard, and the naming
invariant. Restoring owner scoping returned 185 files / 2441 tests (exit 0).

The A5 mutation probe removed only `activeClientUpdatedAt` from the outgoing
`putMeta`. The targeted consequence spec failed 1 of 2 tests (exit 1):
`flushDirty` made zero session upserts because the row had preserved
`activeSyncedAt=110` but no client edit clock. Restoring the field returned 2 of
2 tests (exit 0).

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

Exact closure output is recorded in `PROGRESS.md`. The known initial-bundle
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
- Multi-tab behavior still relies on existing IndexedDB `versionchange`
  handling; no cross-tab account-switch protocol is added.
- No Supabase schema, RLS, Vercel, dependency, lockfile, or market-data worker
  change is part of this RFC.
