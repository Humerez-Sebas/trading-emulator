# Anti-Pattern Catalog

Every entry was observed in this repo (or explicitly defended against after a near-miss).
Format: why it happens → why it's dangerous → how to detect → how to prevent/recover.

## 1. Shared factory selectors for per-panel derivation
**Happens because** NgRx factory selectors (`selectChartView(panelId)`) look like the
idiomatic way to parameterize derivation. **Dangerous because** their single-slot
memoization yields 0 % cache hits when N panels call with different ids each tick —
recreating the `memoizeMap` defect the P1 audit fixed, promoted to the whole reactive
layer. **Detect:** grep for factory selectors over panel/chart state; audits run this
grep. **Prevent:** per-instance local `ChartModelMapper` memoization (D8) — N panels ⇒ N
independent one-slot memoizers, each seeing only its own panel.

## 2. Spec utilities imported by app code
**Happens because** an invariant helper in a `*.spec-util.ts` is exactly what production
code also wants, and tsc + tests stay green when you import it. **Dangerous because** it
ships vitest into the prod bundle silently. **Detect:** build probe — temp-import from
`app.config.ts`, `npm run build`, look for expect-type/magic-string chunks. **Prevent:**
pure production twins (`layout-invariants.ts` vs its spec-util); grep app code for
`spec-util` imports at audit.

## 3. Synchronous re-entrancy flags against async library echoes
**Happens because** a re-entrancy boolean is the reflexive fix for feedback loops.
**Dangerous because** lightweight-charts v5 fires range callbacks on the NEXT animation
frame — a sync flag is already cleared when the echo arrives; the loop survives and only
shows under real frame timing. **Detect:** sync feedback that passes unit tests but
oscillates in the browser. **Recover:** one-shot suppression armed across the RAF
(`suppressNextRangeEvent`, value-independent); rely on the library coalescing same-frame
invalidations into a single echo; origin-tagged events + value-keyed idempotent
application as the structural defense.

## 4. Module-scope SUT import when mocking optimized deps
**Happens because** importing the SUT at the top of the spec is the normal pattern.
**Dangerous because** under `isolate:false` + a cold `.vite` cache, the import races
optimizeDeps and the REAL dependency intermittently beats `vi.mock` — order/cache
dependent flakes. **Detect/reproduce:** single-fork custom sequencer + delete
`node_modules/.vite`. **Prevent:** `vi.hoisted` mock + `vi.resetModules()` + dynamic
`import()` of the SUT in `beforeEach`.

## 5. `overrideSelector` without `resetSelectors`
**Happens because** the override looks spec-local. **Dangerous because** it mutates the
module-level NgRx singleton shared by every spec file in the worker — later files read
the forced value. **Prevent:** `store.resetSelectors()` in `afterEach`, always.

## 6. Committing a lockfile after `npm install` without validating it
**Happens because** local build/test use installed `node_modules` and stay green.
**Dangerous because** npm 11.x silently prunes optional-dep entries; CI `npm ci` fails
EUSAGE. **Detect:** `npm ci --dry-run` in `emulador/`. **Recover:** restore pruned
entries verbatim from `origin/main` — never regenerate (reinstalling re-prunes).

## 7. Planning around dead code
**Happens because** a well-named function (`reconstructWorkspaces`) looks like the
obvious integration point. **Dangerous because** the plan's core wiring lands in a path
production never executes; the feature silently doesn't work. **Detect:** before
planning, grep the function's call sites and classify each as production or spec-only.
**Prevent:** plans must name the LIVE path (here: `materializeAndOpen` in the sessions
page) and cite its call chain.

## 8. Candles (or any bulk shared data) inside an aggregate payload
**Happens because** serializing "everything the session needs" feels safe. **Dangerous
because** payloads explode past size guards, sync cost scales with market data, and the
same candles get duplicated across sessions. **Prevent:** reference by identity
(`requiredDatasets`) + `assertNoCandles` before every upsert + size guard (512 KB warn /
2 MB reject).

## 9. Reusing a lossy export format as a sync payload
**Happens because** the format already exists (`.session.json` V1). **Dangerous because**
it silently drops state (open positions, riskPct, sessionEnd) — sync then *loses data by
design*. **Prevent:** classify formats as lossy (human export) vs lossless (`.emul`,
versioned) and let only lossless formats near persistence/sync.

## 10. LWW by server timestamp
**Happens because** `updated_at` is already there. **Dangerous because** offline edits
lose to later-synced but older changes. **Prevent:** LWW by `client_updated_at`; when
the client library can't express the conditional write (supabase-js upsert has no
WHERE), enforce it in a DB `BEFORE UPDATE` trigger and keep the client dumb.

## 11. Editing pre-existing specs to fit your change
**Happens because** it's the fastest way to green. **Dangerous because** existing specs
encode someone's decision; rewriting them silently converts a regression into a "pass"
and invalidates the audit chain. **Prevent:** STOP rule — leave it, document the
deviation, escalate if you believe the spec is wrong (RFC-013 left `headerLabel`
redundant for exactly this reason).

## 12. Parallel actors committing through a shared index
**Happens because** orchestrator and implementer share one working tree. **Dangerous
because** `git add`-then-`commit` races corrupt staging across actors. **Prevent:**
pathspec commits only (`git commit <files> -m …`).

## 13. Branching from a stale local base
**Happens because** local `main` exists and checkout is muscle memory. **Dangerous
because** it was once 46 commits behind — the branch diverges from reality. **Prevent:**
always branch from `origin/<base>`.

## 14. Optimizing around an unmeasured bottleneck
**Happens because** parallelism/pipelining are the reflexive perf ideas. **Dangerous
because** effort lands on the <1 % component (fetch: 3.8 s) instead of the 99 %
(IndexedDB ingest: ~700 s). **Prevent:** measure first; record rejections with numbers in
`performance.md` so they stay rejected.

## 15. Trusting your own (or your implementer's) report
**Happens because** re-running gates feels redundant when the ledger says green.
**Dangerous because** reports are claims; environments drift; arithmetic lies caught in
practice include mis-recorded profiling math (RFC-012 audit finding). **Prevent:** the
auditor re-runs every gate and verifies ledger arithmetic personally — no exceptions.

## 16. Silent scope drift ("while I'm here…")
**Happens because** adjacent improvements are visible mid-task. **Dangerous because** it
invalidates the brief the audit was scoped to and bloats diffs where risk hides.
**Prevent:** briefs bound files-in-scope; deviations get documented and classified
(inert / requires-attention); out-of-scope work becomes its own task or a flagged
follow-up.
