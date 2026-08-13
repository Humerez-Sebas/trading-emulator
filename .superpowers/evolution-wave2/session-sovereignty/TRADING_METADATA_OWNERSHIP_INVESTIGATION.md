# Trading Metadata Ownership Investigation

## Verdict

CONFIRMED DEFECT

## Question

Does the whole-record `WorkspaceMeta` write performed by
`WorkspacesEffects.doSwitch` preserve the active session's sync clocks and make
the outgoing real-session snapshot eligible for the next flush?

## Writer inventory

`WorkspaceMeta` is an IndexedDB value written with `put`, so every writer
replaces the complete record:

| Writer | Ordering and clock behavior |
|---|---|
| `WorkspacesEffects.persistMeta$` | Debounced 300 ms; re-reads stored meta and reapplies `activeClientUpdatedAt`/`activeSyncedAt` because the selector snapshot omits them |
| `WorkspacesEffects.doSwitch` | Synchronously persists outgoing meta before restoring incoming workspace; checkpoint code spread the clock-free selector snapshot into a whole-record put |
| `SessionSyncService.markActiveDirty` | For an `isRealSession`, stamps `activeClientUpdatedAt` then writes the whole meta |
| `SessionSyncService.flushDirtySessions` | Pushes only when `activeClientUpdatedAt > (activeSyncedAt ?? 0)` and advances `activeSyncedAt` after success |
| `SessionSyncService.pullAndMergeSessions` and reconstruction | Applies cloud membership/LWW outcomes and writes changed records |
| Sessions page mutations | Read-modify-write paths for active/archived session operations |

The defect is specifically in the checkpoint `doSwitch` writer. No broad
ownership refactor is needed to repair it.

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

## Mutation proof

After implementation, only `activeClientUpdatedAt` was temporarily removed from
the outgoing `putMeta`; `activeSyncedAt` preservation remained enabled.

```text
Test Files  1 failed (1)
Tests       1 failed | 1 passed (2)
AssertionError: expected "upsertSession" to be called once, but got 0 times
exit 1
```

Failure mechanism: the outgoing row retained `activeSyncedAt=110`, lost its
client edit clock, evaluated clean, and was skipped by `flushDirty`. The mutation
was never committed. Restoring the intended line produced 2/2 passing (exit 0),
and `git diff --exit-code HEAD` confirmed exact restoration.

## Ownership conclusion

Trading state owns the active session identity and snapshot in NgRx. Sync owns
the persisted LWW clocks. Any whole-record persistence writer whose source omits
those clocks must re-read them. The outgoing-switch writer additionally owns the
atomic dirty stamp because it is the last writer guaranteed to see the outgoing
snapshot before incoming restoration changes the selector stream.
