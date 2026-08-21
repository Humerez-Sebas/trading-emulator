# Session Sovereignty V2 Migration

## Migration rule

The migration never rewrites or deletes an unowned legacy record. New writes go
to an owner partition. Legacy workspace records are copied per record only when
a complete exact-count RLS-scoped cloud response proves every meaningful id
carried by the whole record. The owner copy and marker commit atomically, and
the original remains as recovery evidence.

## Physical layout

| Before | After |
|---|---|
| `emulador-workspaces` v6: user stores plus market-data stores | Same v6 DB and schema; market-data stores remain live, old user stores become read-only quarantine |
| No per-user workspace DB | `emulador-workspace-<ownerId>` v1 with `meta`, `folders`, `sync` |
| `emulador-playbook` | Preserved un-suffixed legacy DB plus live `emulador-playbook-<ownerId>` |
| `emulador-lessons` | Preserved un-suffixed legacy DB plus live `emulador-lessons-<ownerId>` |

There is no schema upgrade of `emulador-workspaces`, no market-data copy, and no
database deletion.

## Scenario matrix

### New user

1. Bootstrap resolves the Supabase user id.
2. Empty owner workspace/playbook/lessons databases are created lazily.
3. The cloud pull populates only rows visible to that user under RLS.
4. Shared candles/datasets/series remain available as cache data.

No legacy adoption occurs unless every meaningful id in a quarantined record
correlates with this user's complete cloud id set.

### Existing unowned legacy database

On first owner-aware launch, the shared v6 database is opened without changing
its version or stores. Legacy `meta` and `folders` rows are not listed as live
state. They remain byte-preserved in quarantine while the current owner's empty
partition is opened. The cloud pull then evaluates each quarantined record
against complete owner-visible ids.

### Known-owner evidence

A quarantined workspace meta is eligible only when every non-null active and
archived session id it carries appears in the complete RLS-scoped session set. A
mixed A+B record, a record with an unproven id, and a record with no ids remain
ambiguous; this track does not extract individual sessions from such a meta. A
folder is eligible when its own id appears in the complete RLS-scoped folder
set. The record is copied into that owner's partition only if that partition
does not already own the key. The copy and owner-local adoption marker are
written in one transaction. The quarantine original remains untouched.

### Ambiguous legacy

A record with no correlated remote id is not adopted, not deleted, not uploaded,
and not shown as another user's live state. It remains in quarantine and is
re-evaluated on future successful pulls. Logging in most recently, matching a
symbol, or sharing a browser profile is not ownership evidence.

Legacy un-suffixed playbook and lessons records have no evidence-based copy path
in Track A. Remote-synced records return from cloud; ambiguous local-only records
remain preserved in their old databases for a future explicit recovery flow.

### A to B

1. A logs out; `loggedOut` triggers a hard navigation to `/login`.
2. The old document and all A-owned NgRx/service memory are discarded.
3. B logs in in a new document.
4. Storage services open only B-suffixed databases.
5. B's complete cloud pull compares only B-local rows to B-remote rows.

A's partition is neither read nor mutated. A local-only record cannot be
uploaded as B because it is absent from B's local set.

If another tab changes Supabase auth without this tab crossing the logout reload
boundary, every SessionSync cloud operation captures its expected owner before
I/O and revalidates both current auth and `WorkspaceDbService` immediately after
the response and before local consequences. Direct Sessions-page list/fetch
calls reject instead of returning mixed-owner data; cloud writes/deletes reject
instead of authorizing local synced stamps or pending-delete removal; pulls do
not delete, materialize, adopt, reconstruct, or stamp A-local state from B data.
That stale tab requires reload; no auth listener, recovery UI, or cross-tab
protocol is introduced here.

### B to A

The same hard-boundary lifecycle runs. The new document resolves A and reopens
A's existing partition. A's local-only, dirty, and synced records are still
present. B's partition remains inaccessible to A's store instances.

### Dirty and local-only records

Dirty state remains in the owner partition with `clientUpdatedAt > syncedAt`.
A failed push does not advance `syncedAt`, so later flushes retry it. A
never-synced row has no `syncedAt` and remains local to its owner until that
owner's authenticated sync succeeds. It is never discovered by another owner's
`listMetas`, `listFolders`, playbook load, or lessons load.

At persistence boundaries, clocks move with session ids: the former active pair
moves to its archived `SavedSession`, a reopened archived pair becomes active,
and a new active id never inherits the former pair. Real changed snapshots use a
strictly monotonic client clock and remain flush-eligible. `markActiveDirty` uses
the same maximum of wall time and both prior clocks plus one. Persistence and
dirty marking both derive from the latest stored row inside one IndexedDB
readwrite transaction, so a stale debounced persistence attempt cannot lower a
newer durable dirty clock or erase trading eligibility.

### Remote-synced records

Within one owner, existing semantics remain:

- LWW uses client time;
- D1 removes a previously-synced local row absent from a complete cloud answer;
- remote-only playbook/lesson/session state follows its existing pull path;
- session payloads remain candle-free.

The change is that the local comparison set is now owner-scoped before D1 is
allowed to interpret absence.

### Offline startup

If Supabase's locally persisted session resolves, the application opens that
owner's partition without a network round trip and local work remains available.
The failed cloud pull performs no adoption and does not destructively merge a
partial answer. Dirty state remains queued.

If no owner can be resolved, user-owned storage fails closed. It does not use
the legacy quarantine or another owner's database as a fallback. Data remains
on disk and can be retried after identity is restored.

### Interrupted migration or adoption

There is no global move transaction to leave half-complete:

- interruption before copy leaves only quarantine, so the next pull retries;
- interruption during copy or marker write aborts the whole owner transaction;
- a retry writes both copy and marker atomically;
- the transaction rechecks each live key with `get` and copies with `add`; a key
  created after planning is never overwritten, and the marker names only copies
  that actually succeeded;
- interruption after commit is harmless because quarantine is intentionally retained;
- interruption during cloud sync leaves dirty clocks/pending deletes in the
  same owner partition;
- an owner DB creation failure leaves legacy and cloud data unchanged.

Recovery never starts by deleting either side.

## Closeout acceptance (2026-08-13)

The v1 upgrade now retains the original `workspaces` object store as source evidence. Git
history proved the projection omitted newer workspace fields, so lossless representation could
not be established and O-7 prohibited deleting the source. Exact-count proof now requires
`received === count`. Cloud pull, D1, acknowledgement, and active-id consequences compare and
apply inside owner-database transactions; a newer local revision is never replaced or deleted.

Independent review accepted implementation head `498646b` with zero Critical/High/Medium
findings. Fresh raw gates: app tsc `0`; spec tsc `0`; tests `186/2483` exit `0`; lint `0`;
build `0` with the known initial-budget warning at `661.05 kB` and no unexpected chunks.

## Verification and rollback

Executable probes cover A to B, A to B to A, B to A, stale A-bound DB under B
auth, auth changing A to B during cloud I/O, direct list/fetch rejection, dirty
local-only isolation,
same-owner D1, no-owner fail-closed behavior, proof-only adoption, live-record
non-overwrite at transaction time, mixed-owner refusal, atomic adoption
interruption/retry, atomic clock reconciliation,
second-owner non-claim, offline retry, and truncated/null-count refusal.

Rollback must preserve all databases. Reverting to code that writes the shared
legacy stores reintroduces the defect and cannot see newer owner-partition
edits, so it is not a safe long-running rollback. Re-deploy the owner-aware build
to recover owner partitions; use cloud pull for remotely synced data and retain
quarantine for manual resolution of ambiguous local-only evidence.

## Fresh review correction addendum (2026-08-13)

The accepted closeout above is retained as history. A later independent review found four
additional bounded consequence windows, corrected in implementation commit `704302a`:

1. A cloud payload pending behind an R2 dataset download now retains its captured owner and must
   re-pass the existing auth + workspace owner assertion before materialization, reload, and open.
2. Playbook and lesson pull/hydrate/persist/push flows carry one expected owner across service and
   local awaits. Owner-aware local DB calls reject before opening a different owner's partition,
   and every store/cloud consequence is preceded by owner revalidation.
3. Off-screen active rename and folder move use the same monotonic dirty-clock rule as other active
   mutations and call the existing local-first flush, while archived clocks retain their behavior.
4. The live Sessions-page materialize/rename/archive/delete/move writers derive from the latest
   meta inside `updateMeta`. Newer dirty/ack revisions, active trading data, and unrelated sessions
   survive stale page operations; stale destructive cards do not enqueue cloud deletes.

Focused evidence: initial RED exit `1`, **14 failed / 112 passed** (including one draft test-harness
resolver error corrected before production edits); focused GREEN exit `0`, **126/126**; broader
affected GREEN exit `0`, **226/226**; app/spec TypeScript and lint exit `0`. This addendum records
implementer correction evidence and does not assert independent acceptance.

## Bounded correction addendum (2026-08-20)

The earlier closeout and review evidence remain historical. Four later findings were corrected
without changing the migration layout or O-7:

1. Local playbook/lesson edits use the memoized owner identity for owner-partition persistence, so
   token expiry or offline live-auth failure does not discard new private knowledge. Cloud
   operations still require live owner capture and revalidation.
2. Every Sessions-page active-card writer binds the consequence to the card's active cloud id and
   exact clocks. Replacement active session B is untouched by a stale A card, and B's id is never
   added to pending cloud deletion.
3. Folder rename/reorder are exact-revision writes. Folder delete checks the same revision and
   atomically commits both local removal and its pending cloud deletion; a concurrent newer folder
   causes neither consequence. Existing cloud LWW and exact acknowledgement remain unchanged.
4. Cloud materialization captures the complete owner meta before delayed fetch/download and uses an
   exact transaction-local compare before write/open. Same-owner layout, panels, link groups,
   drawings, trading, active identity, or clock changes survive; successful materialization
   preserves internally consistent active clocks and dirty eligibility.

Implementation heads are `1d35601`, `a61c57c`, `46e1c3d`, `3df3d7b`, and the test-harness lint
cleanup `75f846c`. Fresh bounded evidence: affected tests **8 files / 287 passed**, app/spec tsc
exit `0`, lint exit `0`; the required repository test gate passed **186 files / 2515 tests**.
This is implementer evidence only, not independent acceptance.

## Fresh three-finding correction addendum (2026-08-20)

The migration layout and O-7 policy are unchanged. Three later findings were corrected from rejected
head `8e90c33`:

1. Session-page mutation consequences now require the exact captured active/archived id and both
   revision clocks inside the owner-DB transaction that writes the consequence. Active delete also
   resets and records the pending cloud deletion in that same transaction, returning the exact
   deleted/replacement identities to the current-asset reducer path. An A-to-B replacement during
   an await cannot reset or enqueue B.
2. Cloud B is no longer stored as B view fields over active A identity/trading. One exact transaction
   archives A with A trading/id/clocks and promotes B with B trading/view/id/clocks. Same-symbol open
   hydrates the promoted full workspace through `workspaceRestored`, so B actually becomes active;
   the persistence proof remains candle-free.
3. A folder reorder is one all-or-nothing `folders` transaction. Every changed participant is read
   and exact-revision validated before any row is written. A mismatch leaves every order untouched;
   an exact set commits every row, and dirty sync runs only after full commit.

Implementation heads: `102c40e`, `57cc455`, `5f28584`, plus lint-only import cleanup `af1c8c1`.
Focused accepted RED/GREEN counts were session service **4/58 -> 58/58**, session page
**5/107 -> 107/107**, reducer **2/64 -> 64/64**; materialization service **1/59 -> 59/59**
and page **1/108 -> 108/108**; reorder service **2/61 -> 61/61** and page
**2/108 -> 108/108**. Fresh affected evidence passed **13 files / 451 tests**; app/spec tsc and
lint exited `0`. No full suite/build or independent acceptance is claimed.

## Fresh four-finding correction addendum (2026-08-20)

The migration layout and O-7 policy are unchanged. Four Medium findings were corrected from
rejected head `e1be2a5`:

1. Current-active archive captures A's intended payload before any await and writes only while both
   durable exact id/clocks and live identity still name A. A captured payload newer than durable A
   receives a monotonic dirty clock and remains flush-eligible; later edits or an A-to-B transition
   cannot be read under stale clean-A provenance.
2. Archived exact matching requires row existence. Equal `undefined` clocks on an absent card no
   longer authorize rename, move, or delete, and the real delete transaction cannot enqueue the id
   when that same id became active.
3. A committed active delete carries deleted A into an identity-specific reducer consequence. It
   removes archived A without resetting current B, and the subsequent workspace persistence write
   cannot restore A to IndexedDB.
4. Same-symbol cloud opening preserves B custom timeframe, replay speed as milliseconds per candle,
   and replay resolution through local materialization and existing hydration actions. The folded
   market/replay/trading/layout/workspace reducer view is coherently B.

Implementation heads: `56e6a09`, `034123d`, `c56ef25`, and `3fa21e5`. Accepted focused RED/GREEN
counts were archive **2/110 -> 110/110**, archived existence **2/63 -> 63/63**, committed delete
**4/215 -> 215/215**, and replay settings **1/111 -> 111/111**. Fresh affected evidence passed
**10 files / 464 tests**; app/spec tsc and lint exited `0`. No full suite/build or independent
acceptance is claimed.

## Fresh three-finding correction addendum from `a9da9c3` (2026-08-20)

The migration layout and O-7 policy are unchanged. Three later Medium findings were corrected from
rejected clean head `a9da9c3`:

1. Archive treats custom timeframe, millisecond playback speed, and replay resolution as part of the
   captured active payload. Settings-only differences receive a monotonic dirty clock, survive the
   trading action/reducer and workspace writer, and flatten with an archived view rather than legacy
   defaults. The cloud proof carries exact values and remains candle-free.
2. Every folder exact-revision writer requires row existence before clock equality. Missing unclocked
   rows authorize neither rename replacement, any participant of a batch reorder, nor atomic local
   delete/pending-cloud-delete enqueue.
3. Delayed same-symbol materialization captures the live NgRx aggregate before I/O and compares it
   immediately before promotion. Same-id trading/cursor/replay/layout change fails closed while
   durable A stays unchanged; unchanged A can still promote and open coherent B.

Implementation heads: `481a3d5`, `66d8526`, and `985534f`. Observed RED/GREEN counts were archived
view **3/185 -> 185/185**, folder absence **3/66 -> 66/66**, and delayed same-id live mutation
**1/113 -> 113/113**. Fresh affected evidence passed **9 files / 476 tests**; app/spec tsc and lint
exited `0`. No full suite/build or independent acceptance is claimed.

## Final Medium TOCTOU addendum from `cc0b71a` (2026-08-20)

The migration layout and O-7 policy are unchanged. Same-symbol cloud opening now revalidates the
captured live aggregate synchronously after promotion returns and before any B hydration. If same-id
A changed in that interval, one owner-bound exact-revision transaction restores latest A as active,
marks it dirty monotonically, removes stale archived A, and retains promoted B as an archived
session. Exact B id/client/synced or expected-owner drift rejects the compensation without an
overwrite; there is no retry loop or lock.

Implementation head: `7051b44`. Observed RED/GREEN was **4 failed / 179 passed (183) -> 183/183**
across the component and real fake-indexeddb service specs. Fresh app/spec tsc and lint exited `0`.
No full suite/build or independent acceptance is claimed.

## Three-Medium correction addendum from `5bc7aec` (2026-08-20)

The migration layout, O-7 policy, and DB-owner guard are unchanged. Three later Medium findings were
corrected from rejected clean head `5bc7aec`:

1. Same-symbol cloud promotion now completes live Supabase owner and workspace awaits before a final
   synchronous current-symbol, active-id, full-live-aggregate, and promoted-workspace comparison.
   Same-id A edits during either the owner assertion or workspace read invoke compensation and return
   without hydrating B.
2. Current-active archive detects a same-id live edit made while the first exact transaction is
   pending. A second exact transaction reconciles the archived row to latest A under the replacement
   active id with a monotonic dirty clock, and the reducer consequence carries that exact payload and
   clocks. Real fake-IndexedDB plus `flushDirty` evidence emits latest A and remains flush-eligible.
3. Every post-promotion compensation is preceded by live
   `SessionSyncService.assertExpectedOwner`, including immediately before the local write. A delayed
   fake Supabase auth read through the actual capture/assert semantics changing A to B causes no
   compensation or hydration; the DB transaction still independently requires the exact expected
   owner and promoted B revision.

Implementation heads: `22cbba7`, `89cacae`, and test-only lint correction `216822f`. Accepted
RED/GREEN counts were archive **3/251 -> 251/251** and promotion/auth **3/117 -> 117/117**. Fresh
affected evidence passed **10 files / 397 tests**; app/spec tsc and lint exited `0`. No full suite,
build, or independent acceptance is claimed.
