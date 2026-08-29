# Engineering Evolution Wave 2 - Controlled Integration Synthesis

Campaign: 2026-08-12 to 2026-08-29. Specialist base:
`894d72be95f8ad4b8d63e629114e486e825b13d7`. Integration branch:
`integration/evolution-wave2`; worktree
`C:\Users\78701\Desktop\trading-emulator-wave2-integration`; pre-reconciliation tip
`80ac7b68871412dab83d3a04a4696a18b2340489`. Nothing in this integration was merged into or
pushed from `develop`.

## A. Executive Verdict

Phase 7 reconciles the controlled A+C integration rather than declaring a release. Post-Low Track
A and Track C, followed by Central's documentation/evidence-only head, are now composed on
`integration/evolution-wave2`. Both formerly residual Low findings are resolved. Stage gates and
a combined semantic matrix passed on the composed tree, but the final independent audit and
pipeline gates are **PENDING**; this implementer document must not represent either as passed.

Track D remains a separately verified implementation branch, B remains research-only, E remains
owner-gated, and Landing remains a separately deployed static branch. Their dispositions are
unchanged and this reconciliation does not reopen them. Track A removed a reachable cross-account
data-loss/exposure path. Track C restored the chart-engine ownership boundary beyond the original
bridge getters. Track D made unit semantics executable without changing arithmetic.

The main conclusion is methodological: names, green gates, and implementer reports are not
enough. The highest-value results came from reconstructing ownership at real boundaries and
then proving the mechanism with mutations. Several plausible Wave 1 fixes were refuted because
they compared same-named factors rather than the user-visible product.

## B. Baseline And Scope

- `origin/main` is `ad69d7dd582bfa5c977b3816fb46101335df6c35`; `origin/develop` and the
  Wave 1 base are `a2ca53b44f678dd285cd90f31ee644696664f32a`. The range
  `origin/develop..origin/main` is empty, so parity is valid.
- All five specialists branched from exactly `894d72b` into sibling worktrees. Pairwise A/C/Central
  merge bases all resolve to `894d72b`; Central changed only documentation/evidence after it.
- Landing branched separately from `a2ca53b` and touched no `emulador/` path.
- A current head `8e4fec1942c49c11424ec95f25a4aeed9226892e` was integrated by
  `97f9f1ebffeaf2f1c74c0b119a825dd23723e0d6`; C current head
  `44027a4557c16d4260cbf1c216a01f307d069b46` was integrated by
  `10c2d1d241b6c1a0ee73992c3e27299ee0b75a3f`.
- Central historical head `6974f769b0f1d2c5a084cbc0aad1c69a0e79b020` was integrated by
  `80ac7b68871412dab83d3a04a4696a18b2340489`. Its base-relative delta is the six Wave 2 evidence
  files plus intentional root `PROGRESS.md` deletion.
- No push, PR, deployment, Supabase, Vercel, dependency/lockfile, remote, worktree-pruning, or
  `develop`/`main` mutation occurred in controlled integration.

## C. Delivered Implementation

**Session sovereignty (A).** User-authored workspace, playbook, and lesson data now lives in
owner-suffixed IndexedDB databases. Market data remains shared. Ambiguous legacy state remains
read-only quarantine and is copied only when an exact-count RLS response proves every meaningful
id belongs to the current owner. Owner changes cross a hard document boundary; stale tabs fail
closed around cloud I/O. Session/folder acknowledgements are exact-revision and transactional;
active payload clocks are complete and monotonic. The original wrong-owner deletion/upload/
exposure mechanisms and A5 lost-dirty-stamp race are closed. Later corrections make replay
settings and local `files` part of coherent persistence/materialization, preserve them through
archive restoration and promotion, and fail safe across the final archive-reconciliation and
cloud-promotion transaction/consequence windows.

**Engine boundary (C).** `chartApi`/`seriesApi` bridges and host-owned price-line handles are
gone. Engine-owned capability construction returns no concrete instance; host interaction uses
explicit drawings/trading facades. Library pointer events are sanitized to data-only values and
cross through a subscribe-only host bus separate from the capability bus. Capability construction
uses a closed built-in ID registry, so callers cannot supply executable constructors. A local lint
detector mechanically blocks the four retired raw-handle types through imports, TypeScript import
types, direct/two-step re-exports, and exported aliases, including nested qualified/indexed forms
and exports declared before imports; its own tests run inside the lint gate.

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

### Current controlled-integration evidence

| Stage | Integrated heads and correction | Fresh evidence on integration |
|---|---|---|
| A | A post-Low `8e4fec1` via `97f9f1e`; Prettier-only correction `bbc06482b9a71bc5957cbb3508a629fdc8467139` | Focused 5 files / 171 tests; full 186 / 2563; tsc app/spec 0; lint 0; format 0; build 669.99 kB, known warning +169.99 kB |
| A+C | C post-Low `44027a4` via `10c2d1d`; Prettier-only correction `7215f2659af1dc26fd53bd172b43eef8fea19744` | RuleTester 0; focused Engine 7 files / 87 tests; full 189 / 2603; tsc app/spec 0; lint 0; format 0; build 669.99 kB, known warning +169.99 kB |

The A stage initially failed `format:check` on eight A-owned files while `origin/develop` passed
and the untouched A head failed identically. The C stage likewise initially failed on four C-owned
files while pre-C integration passed and untouched C failed identically. The two corrections were
format-only and applied Prettier to those inherited specialist files.

The combined automated semantic matrix passed **9 files / 280 tests** on the actual A+C tree,
covering auth transitions/hard logout, A-B-A storage isolation, open/restore, replay,
layout/drawings/panels persistence, chart-boundary interaction, and placement preview. No manual
browser smoke was run, and no single browser-level end-to-end test spans all ten steps.

**Final independent audit: PENDING. Pipeline gates: PENDING.** The current tip after this document
is committed becomes the dedicated reconciliation commit. Its SHA cannot be recorded inside the
commit before it exists; the later audit-result follow-up must record the exact final audited tip.

### Historical specialist evidence

| Track | Final head | Independent evidence | Final gates |
|---|---|---|---|
| Landing | `161e9f5` | Local DOM/browser and authenticated remote HTML readback | Static build 0, 6 files / 139.1 kB |
| A sovereignty | `b62185429a76802d53cbe8836d88ac6ee74aa07f` docs (`d72c51de012cb77a3fbd23e4ea208b03ad3a81c2` implementation) | Historical independent review `ACCEPTED`, 0 Critical/High/Medium; one then-live Low | tsc app/spec 0; 186 files / 2562 passed; lint 0; build 669.96 kB, known warning +169.96 kB |
| B multi-symbol | `3ae5935` | Orchestrator re-derived central claims and refutations | Docs only; no app gates claimed |
| C engine | `717171749aa9af81211c7999553684d05f798ac2` docs (`646a441d0fb373dc3d3d555220ebb99006e6a542` implementation) | Historical independent review `ACCEPTED`, 0 Critical/High/Medium; one then-live Low | tsc app/spec 0; 186 files / 2457 passed; lint 0 including RuleTester; build 651.83 kB, known warning +151.83 kB |
| D units | `1984e5d` | Orchestrator re-derived arithmetic and scope; four negative probes fail, one refuted | tsc app/spec 0; 184 files / 2452 tests; lint 0 |
| E clock | `cee6cff` | Orchestrator verified scope, mechanism, 5 expected failures / 9 locks | tsc app/spec 0; 184 files / 2431 total cases; lint 0 |

The table immediately above is preserved specialist chronology, not current integrated authority.
Build sizes include only the known 500 kB initial-budget warning. No accepted closeout build
showed a Vitest sentinel or unexpected chunk type. Repeated historical Track C raw suites agreed on
186/2457: versus historical `b06fb62` at 185/2450, registry +5 and boundary net +2 account for
the +1 file/+7 tests while frozen-scene stayed unchanged; this corrected documentation only, not
application or test code. At that historical A head, the residual Low was that
`sameActivePayload()` omits `files`; it is latent because current file writers advance the exact
revision clocks. At that historical C head, the residual Low was a syntax-only lexical-shadowing
false positive, such as an imported forbidden `H` followed by unrelated `export type P<H> = H`;
no production occurrence was found. Both findings are **RESOLVED** at the post-Low heads integrated
above.

## F. Branch Dispositions

| Branch | Disposition | Reason / condition |
|---|---|---|
| `agent/session-sovereignty-v2` | **INTEGRATED, FINAL AUDIT PENDING** | Post-Low head `8e4fec1` is present through merge `97f9f1e`; inherited formatting was corrected by `bbc0648`. |
| `agent/engine-boundary-restoration` | **INTEGRATED, FINAL AUDIT PENDING** | Post-Low head `44027a4` is present through merge `10c2d1d`; inherited formatting was corrected by `7215f26`. |
| `agent/unit-semantics` | **MERGE AS-IS** | No arithmetic/persistence/UI behavior change; 35-test executable contract. Run fresh combined gates after integration. |
| `agent/multisymbol-feasibility` | **RESEARCH ONLY** | No runtime implementation. Promote only after owner chooses view-only scope and RFC identity; translate normative RFC to Spanish. |
| `agent/clock-authority` | **MERGE AFTER D-E1 through D-E4** | Evidence is valuable, but behavioral remediation and final terminology are owner authority. The probe/docs may be cherry-picked separately if desired. |
| `agent/landing-product-showcase` | **MERGE AS-IS, SEPARATELY** | Static site is corrected and deployed in its own project; keep separate from emulator runtime integration. |
| `integration/evolution-wave2` | **CONTROLLED A+C BUNDLE; FINAL AUDIT PENDING** | Contains post-Low A+C and Central evidence. It is not a release and does not include D/B/E/Landing. |

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

## I. Controlled-Integration Handoff

1. Treat post-Low A+C plus Central as already integrated on `integration/evolution-wave2`; do not
   re-merge specialist branches or reapply the two Prettier-only corrections.
2. Have a separate final auditor inspect the exact reconciliation tip and independently run the
   required branch-final gates. This implementer has not performed or passed that audit.
3. Run the pending pipeline gates in the controller/auditor phase and record exact evidence.
4. Record the exact audited commit SHA in the later audit-result follow-up; do not rewrite this
   reconciliation commit to self-reference its own SHA.
5. Keep D, B, E, and Landing at their existing dispositions. They are outside this A+C controlled
   integration and Phase 7 does not reopen them.

No push, PR, release merge, or remote-system mutation is performed by this reconciliation.

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

A/C and Central artifacts now exist together on `integration/evolution-wave2`. B/D/E artifacts
remain on their respective specialist branches, and Landing remains separate. No dependency or
lockfile changes were introduced by A/C/Central; C changed `emulador/package.json` only so its
RuleTester runs inside `npm run lint`.
