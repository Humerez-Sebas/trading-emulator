# Engineering Evolution Wave 2 - Final Synthesis

> **STALE ACCEPTANCE SNAPSHOT:** Fresh reviews on 2026-08-20 rejected Track A at `fefea65`
> and Track C at `66211cc`. Preserve this document as historical synthesis only. Current scope
> and restart order are authoritative in `WAVE2-RESUME-PROMPT.md` and the two closeout briefs.

Campaign: 2026-08-12 to 2026-08-13. Specialist base:
`894d72be95f8ad4b8d63e629114e486e825b13d7`. Integration branch:
`agent/evolution-wave2-base`. Nothing in this closeout was merged into or pushed from
`develop`.

## A. Executive Verdict

Wave 2 is closed as an evidence campaign, not as a combined release branch. It produced three
bounded implementation branches ready for normal integration (A, C, D), two research or
owner-gated branches (B, E), and one separately deployed static landing branch. Track A removed
a reachable cross-account data-loss/exposure path. Track C restored the chart-engine ownership
boundary beyond the original bridge getters. Track D made unit semantics executable without
changing arithmetic.

The main conclusion is methodological: names, green gates, and implementer reports are not
enough. The highest-value results came from reconstructing ownership at real boundaries and
then proving the mechanism with mutations. Several plausible Wave 1 fixes were refuted because
they compared same-named factors rather than the user-visible product.

## B. Baseline And Scope

- `develop == origin/develop == a2ca53b44f678dd285cd90f31ee644696664f32a` at open, pause,
  and final reconciliation.
- `agent/evolution-wave2-base` started at `894d72b`, containing the three independently
  verified Wave 1 branches. Combined baseline gates were 183 files / 2417 tests, all green.
- All five specialists branched from exactly `894d72b` into sibling worktrees.
- Landing branched separately from `a2ca53b` and touched no `emulador/` path.
- No A/C/D/E/B branch was merged into integration during closeout. Therefore this report does
  not claim combined runtime compatibility beyond each independently verified branch.
- No push, PR, Supabase change, dependency addition, lockfile mutation, worktree pruning, or
  `develop`/`main` mutation occurred.

## C. Delivered Implementation

**Session sovereignty (A).** User-authored workspace, playbook, and lesson data now lives in
owner-suffixed IndexedDB databases. Market data remains shared. Ambiguous legacy state remains
read-only quarantine and is copied only when an exact-count RLS response proves every meaningful
id belongs to the current owner. Owner changes cross a hard document boundary; stale tabs fail
closed around cloud I/O. Session/folder acknowledgements are exact-revision and transactional;
active payload clocks are complete and monotonic. The original wrong-owner deletion/upload/
exposure mechanisms and A5 lost-dirty-stamp race are closed.

**Engine boundary (C).** `chartApi`/`seriesApi` bridges and host-owned price-line handles are
gone. Engine-owned capability construction returns no concrete instance; host interaction uses
explicit drawings/trading facades. Library pointer events are sanitized to data-only values and
cross through a subscribe-only host bus separate from the capability bus. A local lint detector
mechanically blocks the four retired raw-handle types through imports, TypeScript import types,
and direct/two-step re-exports; its own tests run inside the lint gate.

**Unit semantics (D).** A 35-test cross-surface contract proves that five instrument fixtures
reconstruct the same `priceDelta` even when displayed numbers use different units. No arithmetic,
UI copy, public API, or persisted key changed. Only false comments and one module-private helper
name changed.

**Landing.** The static product showcase was corrected, built, deployed to its own Vercel
project, and remotely read back. The emulator Vercel project was never targeted.

## D. Research, Refutations, And Deferred Design

**Multi-symbol (B).** The missing runtime identity is the in-memory market projection, not
durable storage. Existing storage, drawings, panel descriptors, and dataset references already
carry symbol identity. The frozen decision bans multi-symbol trading but explicitly permits
view-only secondary-symbol panels; no decision needs revocation. F19-2 remains latent because
`resolvePanelCandles` ignores panel symbol. The proposed runtime RFC is research only and its
memory cost is unmeasured.

**Clock authority (E).** Stored candle epochs encode broker-server wall clock by design. The
pipeline and partition readers that numerically treat those epochs as UTC are correct and must
not be converted. Fifteen display/bucketing surfaces format that stored clock as UTC; five
committed `it.fails` probes expose the disagreement while nine passing probes protect correct
partition, DST, and fixed-offset behavior. Remediation is blocked by owner decisions about
trading-day semantics, CSV meaning, names, and Spanish copy.

**Unit refutations.** XAUUSD Lotaje sizing is correct in whole price units. Index
`ExecutionCosts.pointSize = 1` is correct because it is paired with `spreadPoints`; changing it
to `0.01` removes 99% of intended index friction. TradePanel and Lotaje do not disagree on lot
sizing; their distance labels use different display vocabularies.

## E. Verification Matrix

| Track | Final head | Independent evidence | Final gates |
|---|---|---|---|
| Landing | `161e9f5` | Local DOM/browser and authenticated remote HTML readback | Static build 0, 6 files / 139.1 kB |
| A sovereignty | `2630294` (`498646b` implementation) | Independent review `ACCEPTED`, 0 Critical/High/Medium; five restored mutations | tsc app/spec 0; 186 files / 2483 tests; lint 0; build 661.05 kB |
| B multi-symbol | `3ae5935` | Orchestrator re-derived central claims and refutations | Docs only; no app gates claimed |
| C engine | `66211cc` (`b06fb62` implementation) | Independent review `ACCEPTED`, 0 Critical/High/Medium; required mutations restored | tsc app/spec 0; 185 files / 2450 tests; lint 0; build 651.83 kB |
| D units | `1984e5d` | Orchestrator re-derived arithmetic and scope; four negative probes fail, one refuted | tsc app/spec 0; 184 files / 2452 tests; lint 0 |
| E clock | `cee6cff` | Orchestrator verified scope, mechanism, 5 expected failures / 9 locks | tsc app/spec 0; 184 files / 2431 total cases; lint 0 |

Build sizes include only the known 500 kB initial-budget warning. No accepted closeout build
showed a Vitest sentinel or unexpected chunk type.

## F. Branch Dispositions

| Branch | Disposition | Reason / condition |
|---|---|---|
| `agent/session-sovereignty-v2` | **MERGE AS-IS** | Highest-severity reachable fix; independently accepted. Run fresh combined gates after conflict resolution. |
| `agent/engine-boundary-restoration` | **MERGE AS-IS** | Independently accepted; mechanical boundary detector included. Run fresh combined gates. |
| `agent/unit-semantics` | **MERGE AS-IS** | No arithmetic/persistence/UI behavior change; 35-test executable contract. |
| `agent/multisymbol-feasibility` | **RESEARCH ONLY** | No runtime implementation. Promote only after owner chooses view-only scope and RFC identity; translate normative RFC to Spanish. |
| `agent/clock-authority` | **MERGE AFTER D-E1 through D-E4** | Evidence is valuable, but behavioral remediation and final terminology are owner authority. The probe/docs may be cherry-picked separately if desired. |
| `agent/landing-product-showcase` | **MERGE AS-IS, SEPARATELY** | Static site is corrected and deployed in its own project; keep separate from emulator runtime integration. |
| `agent/evolution-wave2-base` | **DO NOT TREAT AS THE FINAL WAVE BUNDLE** | It contains the Wave 1 baseline and orchestration docs, but intentionally does not contain A/C/D/E/B specialist merges. |

## G. Owner Decisions

1. D-E1: journal/session date means trading day or New York calendar day.
2. D-E2: exported CSV clock and compatibility policy for archived exports.
3. D-E3: whether to rename `hourUtc` / `TimeOfDayRow`.
4. D-E4: Spanish replacement for the literal `UTC` session copy.
5. Multi-symbol product scope: view-only reference panels or a future, separately authorized
   multi-symbol execution model. The latter revokes a frozen non-goal and is not implied here.
6. Multi-symbol RFC number and promotion/translation path.
7. Unit UI vocabulary strings across the 11 inventoried surfaces.
8. Persisted `ExecutionCosts.pointSize` rename only after a versioned migration and real-data
   audit prove safety.
9. Vercel landing settings: public access while SSO protection is enabled, and disposition of
   the first deployment on the new project's production alias.

## H. Remaining Defects And Follow-Ups

- Reproduce `syncTimeRange` in a browser, then replace bar-index transport with absolute-time
  projection if user-visible divergence is confirmed. This is reachable cross-timeframe today.
- Resolve F19-2 before any panel symbol picker: candle lookup and memoization must include
  symbol, and the picker must ship last.
- Decide and implement clock display remediation as one coherent change; do not alter stored
  candle epochs, pipeline partitioning, or intentional fixed-offset behavior.
- Resolve the duplicate durable candle owners (`CANDLES_STORE` and legacy `SERIES_STORE`) in a
  dedicated data-authority change; do not fold it casually into multi-symbol UI work.
- Consider a user-driven recovery flow for ambiguous quarantined workspace/playbook/lesson
  data. Automatic assignment or cleanup remains forbidden.
- Human dashboard task: make required checks enforceable on `develop` PRs if desired. CI now
  runs there, but branch protection was not changed.

## I. Recommended Integration Sequence

1. Start from current `origin/develop`, reconcile any drift, and preserve this campaign's
   original-base evidence.
2. Integrate the verified Wave 1 baseline changes if they have not landed by another route.
3. Integrate D first because it adds cross-surface regression coverage with minimal production
   change.
4. Integrate A as its own high-risk change and run all five gates plus owner-switch mutations.
5. Integrate C as its own high-risk change and run all five gates plus lint-rule and generic
   capability mutations.
6. Run a fresh combined full suite/build after A+C+D compose. Individual green branches are not
   evidence of combined green behavior.
7. Keep B and E out of runtime release until their listed decisions are made. Integrate landing
   through its separate static-site path.

No merge, PR, or push is performed by this synthesis.

## J. Engineering Lessons

- Git is the state authority. Four of five specialists held uncommitted work when one shared
  usage limit killed all agents; checkpoint instructions without enforced commits are not
  durability.
- Boundary tests must cross the real boundary. A typed facade can still leak at runtime; an
  import detector can still miss re-export paths; RLS can be correct while local ownership is
  wrong.
- Every high-impact finding needs a negative probe. Mutations exposed destructive sync,
  lifecycle, chart-handle, lint-bypass, and unit-contract failures that ordinary green suites
  did not establish.
- Refutations are deliverables. Correct partition arithmetic, index friction, XAUUSD units,
  and fixed UTC offsets are now protected against plausible but harmful fixes.
- Preserve evidence rather than cleaning history. Quarantine, interruption commits, failed
  review loops, and historical red gates explain why the final contracts exist.
- Scope detectors narrowly and state their limits. The C detector enforces the four known
  retired handle types; it is not advertised as general library type-flow analysis.

## K. Artifact Index

- Central ledger: `WAVE2-STATE.md`
- Final index: `WAVE2-RESUME-PROMPT.md`
- Pause handoff: `WAVE2-CLOSEOUT-RESUME.md`
- Track A: `session-sovereignty/PROGRESS.md`, `SESSION_SOVEREIGNTY_RFC.md`,
  `SESSION_SOVEREIGNTY_MIGRATION.md`, `TRADING_METADATA_OWNERSHIP_INVESTIGATION.md`
- Track B: `multisymbol/MULTISYMBOL_FEASIBILITY_REPORT.md`, `CANDLE_AUTHORITY_DECISION.md`,
  `MULTISYMBOL_RUNTIME_RFC_DRAFT.md`
- Track C: `engine-boundary/PROGRESS.md`, `ENGINE_PUBLIC_CONTRACT.md`,
  `ENGINE_BOUNDARY_RESTORATION_REPORT.md`
- Track D: `unit-semantics/UNIT_SEMANTICS_CONTRACT.md`, `UNIT_UI_VOCABULARY.md`,
  `EXECUTION_COSTS_NAMING_DECISION.md`
- Track E: `clock-authority/CLOCK_AUTHORITY_INVESTIGATION.md`,
  `CLOCK_SEMANTICS_CONTRACT.md`, `PROGRESS.md`

Specialist artifacts remain on their respective branches until explicitly integrated. The
central synthesis records their verified heads and dispositions without pretending their files
already exist together on one branch.
