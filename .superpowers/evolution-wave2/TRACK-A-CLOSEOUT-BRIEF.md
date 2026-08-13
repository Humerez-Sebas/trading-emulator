# Track A Closeout Brief

Use this brief only to resume Track A after the 2026-08-13 pause.

## Workspace

- Worktree: `C:\Users\78701\Desktop\trading-emulator-session-sovereignty`
- Branch: `agent/session-sovereignty-v2`
- Paused HEAD: `4e25e3c033a4bc8a83e024da56d5798a7c11bd07`
- Specialist base: `894d72be95f8ad4b8d63e629114e486e825b13d7`
- State at pause: clean

Do not reset, rebase, squash, push, merge, install dependencies, or touch another
worktree. Use path-scoped commits only. Preserve the already-committed reports and
negative-probe evidence.

## Accepted Evidence

- The original cross-account IndexedDB defect is real.
- Workspace, playbook, and lessons stores are owner-partitioned.
- Market-data stores remain legitimately shared.
- Ambiguous legacy data is quarantined; mixed/no-ID metas are not adopted.
- Adoption copy and marker are one transaction.
- Session clocks are reconciled by session identity for stable/new/switched sessions.
- Cloud operations currently perform pre/post owner checks.
- A5 verdict remains `CONFIRMED DEFECT`.
- Reported final gates at `4e25e3c`: app tsc 0, spec tsc 0, 186 files / 2465 tests,
  lint 0, build 0 (658.79 kB known budget warning).
- These gate results are implementer evidence. The closeout agent has not yet rerun
  them independently.

## Final Review Findings To Resolve

### A-R1: stale sync completion can replace newer local state (High)

`flushDirtySessions()` and `flushDirtyFolders()` read a row before network I/O, then
write the stale object after the upsert succeeds. A concurrent local edit can be replaced
and marked clean.

Required behavior:

- A successful upsert may acknowledge only the exact client revision it uploaded.
- The acknowledgement must update `syncedAt` atomically only when the current stored
  `clientUpdatedAt` still equals the uploaded value.
- It must never replace newer trading, folder, or metadata fields with a stale snapshot.
- Add delayed-upsert tests for both sessions and folders.

Prefer narrow transaction methods on `WorkspaceDbService`, not a broad repository rewrite.

### A-R2: authenticated A can log in as B without logout/reload (High)

`/login` is directly reachable. A successful second login dispatches `authSuccess` and
uses SPA navigation, while the hard reload currently listens only for `loggedOut`.
`OwnerIdentityService` therefore remains memoized to A while B can inherit A's heap.

Required behavior:

- An owner change on successful authentication must cross a hard document boundary
  before B can use A's in-memory state.
- Same-owner login must not create a reload loop.
- Add a deterministic A-authenticated -> `/login` -> B-login lifecycle test.
- Before changing Angular effects, consult the official Angular 21 documentation through
  the configured documentation MCP, as required by `CLAUDE.md`.

Do not build a general cross-tab protocol. Existing cloud owner gates remain defense in
depth.

### A-R3: exact count means equality (Medium)

`assertCompletePull()` rejects `null` and `received < count`, but accepts
`received > count`. Change the fail-closed condition to require exact equality and add the
missing test.

### A-R4: v1 migration preservation claim (Medium)

The existing v1 upgrade projects legacy workspaces into newer stores and deletes the
original object store. This conflicts with the binding rule that ambiguous legacy data is
never auto-discarded and with the migration document's blanket preservation language.

Investigate before editing. Return one of:

- preserve the v1 source evidence without breaking the shared market-data schema; or
- narrow the migration claim only if Git evidence proves v1 data is already fully and
  losslessly represented and owner policy permits it.

The owner policy outranks convenience. Do not silently delete evidence or weaken O-7.

## Review Findings Not To Implement

- Do not rewrite/squash historical WIP commits. The owner explicitly requires preserving
  interruption evidence and forbids rebasing specialist history.
- Do not promote these closeout artifacts into `docs/architecture/rfcs/`, ROADMAP, or the
  permanent domain guide during closeout. The owner explicitly required the reports under
  `.superpowers/evolution-wave2/session-sovereignty/`. Permanent promotion is future work.

## Verification

Use TDD for every production correction. Record RED and GREEN commands and exact exits.
After implementation, rerun representative A5 and owner-boundary mutations, restore them
exactly, then run raw and unpiped from `emulador/`:

```powershell
npx tsc -p tsconfig.app.json --noEmit
npx tsc -p tsconfig.spec.json --noEmit
npx ng test --watch=false
npm run lint
npm run build
```

Update all four Track A documents and `PROGRESS.md`, commit with explicit pathspecs, and
request a new independent acceptance review. Track A is not complete until that review has
zero Critical/High/Medium findings and the closeout agent independently reruns the gates.
