# Trading Metadata Ownership Investigation

## Verdict

CONFIRMED DEFECT

## Question

Do whole-record persistence writers bind sync clocks to session identity across
`newSession`/`switchSession`, preserve stable-id A5 behavior, and leave each real
changed snapshot eligible for the next flush?

## Writer inventory

`WorkspaceMeta` is an IndexedDB value written with `put`, so every writer
replaces the complete record:

| Writer | Ordering and clock behavior |
|---|---|
| `WorkspacesEffects.persistMeta$` | Debounced 300 ms; atomically reads the latest stored meta, reconciles clocks, and replaces the row through `updateMeta` |
| `WorkspacesEffects.doSwitch` | Synchronously persists outgoing meta before restoring incoming workspace; uses the same transaction-local reconciliation and marks the outgoing real session dirty |
| `SessionSyncService.markActiveDirty` | For an `isRealSession`, atomically increments `activeClientUpdatedAt` from the latest stored clocks through `updateMeta` |
| `SessionSyncService.flushDirtySessions` | Pushes only when `activeClientUpdatedAt > (activeSyncedAt ?? 0)` and advances `activeSyncedAt` after success |
| `SessionSyncService.pullAndMergeSessions` and reconstruction | Applies cloud membership/LWW outcomes and writes changed records |
| Sessions page mutations | Read-modify-write paths for active/archived session operations |

The original defect was in the checkpoint `doSwitch` writer. Independent review
found the first repair still treated the active pair as symbol-level: an
identity transition could preserve A's clocks as B's active clocks while the
archived A snapshot had none. The bounded correction remains at persistence
writers; no reducer or persisted-schema expansion was required.

## Causal reconstruction

### 1. Writer

`selectWorkspaceMetaSnapshot` carries trading data and `activeSessionId`, but not
the sync-only clocks. At checkpoint `34a0a87`, `doSwitch` wrote:

```text
{ symbol: current, ...meta, linkGroups, lastModified }
```

IndexedDB `put` replaced the outgoing stored row, so both
`activeClientUpdatedAt` and `activeSyncedAt` disappeared.

### 2. Ordering

`doSwitch` writes the outgoing asset first, then dispatches
`workspaceRestored` for the incoming asset. The independent session-sync effect
observes the same selector stream with a 2-second debounce. By the time it runs,
the selector represents the restored incoming workspace, not the outgoing one.

Therefore the later `markActiveDirty(current)` cannot be relied on to repair the
outgoing row. It marks whichever asset is current after the switch.

### 3. Persisted metadata

The outgoing real session still has its stable id and trading snapshot, but the
checkpoint write leaves both clocks undefined. The repository's dirty rule is:

```text
dirty iff (activeClientUpdatedAt ?? 0) > (activeSyncedAt ?? 0)
```

With both clocks undefined, this evaluates to `0 > 0`, false. Clock loss is not
conservative in this ordering; it classifies the newly persisted outgoing
snapshot as clean.

### 4. SessionSync

`flushDirtySessions` rebuilds the real active session row, identifies it as the
active id, then skips the upsert when the dirty predicate is false. It does not
infer dirtiness from changed trading data.

### 5. Trading consequence

The outgoing real-session snapshot can remain local only and unflushed. A later
cloud interaction can therefore operate without the outgoing edit ever having
been uploaded. The consequence-level test demonstrates the immediate lost
eligibility: after a switch, a direct real `flushDirty()` invokes zero session
upserts on the checkpoint code.

## Deterministic TDD evidence

The checkpoint characterization was transformed before production edits into:

`switchAsset keeps the outgoing real session dirty and eligible for flush`

The fixture uses an open position, which satisfies the repository's actual
`isRealSession` predicate. It seeds:

```text
activeSessionId = sess-A
activeClientUpdatedAt = 111
activeSyncedAt = 110
Date.now() = 112
```

It executes the real `switch$`, reads the outgoing IndexedDB row, and calls the
real `SessionSyncService.flushDirty`; only the network `upsertSession` boundary
is stubbed.

RED on checkpoint behavior:

```text
npx ng test --watch=false --include=src/app/state/workspaces/workspaces.effects.meta-ownership.spec.ts
Test Files  1 failed (1)
Tests       1 failed | 1 passed (2)
AssertionError: expected "upsertSession" to be called once, but got 0 times
exit 1
```

GREEN after the fix:

```text
Test Files  1 passed (1)
Tests       2 passed (2)
exit 0
```

The contrast test still proves `persistMeta$` preserves the same seeded clocks.

## Final repair

In the outgoing branch of `doSwitch`:

1. Re-read the outgoing stored meta.
2. Apply the existing `isRealSession(meta.trading)` predicate.
3. Preserve the stored `activeSyncedAt` unchanged.
4. For a real session, set `activeClientUpdatedAt` to the maximum of current
   wall time, prior client time plus one, and prior synced time plus one.
5. Put those clocks in the same whole-record write as the outgoing trading
   snapshot.

The `+1` terms enforce the repository's strict `>` convention even if two writes
share a millisecond or the stored client clock is ahead of local wall time.
Scratch sessions are not newly marked dirty.

The review correction adds identity reconciliation shared by `persistMeta$` and
`doSwitch`: outgoing clocks move to the matching archived id; an incoming saved
id contributes its own clocks; a genuinely new id starts without inherited
provenance; archived clocks already written are preserved by id on later
debounced persists. The final bounded correction moves both persistence
reconciliation and `markActiveDirty` into `WorkspaceDbService.updateMeta`, whose
single readwrite transaction reads the latest row and applies a synchronous pure
callback before writing. `doSwitch` stamps the real active snapshot dirty; the
same monotonic formula guards dirty marking against equal/backward wall time.

A controlled stale-read test commits a newer dirty stamp, supplies a stale value
through the legacy `getMeta` surface, then runs debounced persistence. The new
path never calls that stale surface; it reconciles against the real latest row
inside the transaction. The durable client clock remains unchanged, remains
strictly above `activeSyncedAt`, and the real trading position remains present.
As a separate falsification after implementation, replacing only that atomic
`persistMeta$` call with the former external `getMeta`/`putMeta` sequence made
this test fail while 5 siblings passed (exit 1): the stale read surface was
called once. Exact restoration via `git diff --exit-code HEAD` returned 6/6
passing (exit 0).

Deterministic real-reducer sequences prove immediate `newSession -> switchAsset`
and `switchSession -> switchAsset`. They verify archived and active ids retain
their own provenance and both real snapshots are observed by `flushDirty`.

## Mutation proof

The fresh final mutation changed only the outgoing `doSwitch` reconciliation
flag from dirty to non-dirty.

```text
Test Files  1 failed (1)
Tests       4 failed | 2 passed (6)
exit 1
```

Failures covered stable-id A5 dirtiness and the identity/provenance paths. The
mutation was never committed. Restoring the intended boolean produced 6/6
passing (exit 0), and `git diff --exit-code HEAD` confirmed exact restoration.

## Ownership conclusion

Trading state owns active identity and snapshots in NgRx. Sync owns LWW clocks,
but those clocks are attributes of session ids, not the symbol-keyed meta record.
Any whole-record persistence writer whose source omits clocks must reconcile
them by id against the latest row inside the write transaction. The
outgoing-switch writer additionally requests the atomic dirty stamp because it
is the last writer guaranteed to see the outgoing snapshot before incoming
restoration changes the selector stream. Primary A5 verdict remains **CONFIRMED
DEFECT**; this does not prove unconditional ownership for ambiguous mixed-id
legacy records.
