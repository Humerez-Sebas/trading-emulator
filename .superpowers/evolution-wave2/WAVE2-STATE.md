# WAVE 2 — ORCHESTRATOR STATE

Campaign: Trading Emulator Engineering Evolution · Wave 2
Session opened: 2026-08-12. Orchestrator: Opus 5.

Unlike Wave 1, this file is **tracked**. Commit it continuously — an untracked
orchestration ledger is an unrecoverable one, which is the durability defect Wave 2
opened by fixing.

## BASELINE

| Fact | Value |
| :--- | :--- |
| Wave 1 / `origin/develop` base | `a2ca53b44f678dd285cd90f31ee644696664f32a` |
| Current `origin/main` | `ad69d7dd582bfa5c977b3816fb46101335df6c35` |
| Main/develop parity check | VALID — `origin/develop..origin/main` is empty |
| **`WAVE2_BASE_SHA`** | **`894d72be95f8ad4b8d63e629114e486e825b13d7`** |
| Controlled-integration branch | `integration/evolution-wave2` |
| Controlled-integration worktree | `C:\Users\78701\Desktop\trading-emulator-wave2-integration` |
| Pre-reconciliation tip | `80ac7b68871412dab83d3a04a4696a18b2340489` |

Nothing has been merged into `develop` by this integration. Nothing has been pushed to
`origin`.

## CURRENT FINAL AUDIT AUTHORITY — PHASE 8

This documentation-only follow-up is after the final runtime/code audited tip
`3e903aedbd44d43b3d0f31a22ffa3496f9dc1f06`; it records that tip rather than attempting to
self-embed this follow-up commit's SHA. This section supersedes every Phase 7 `PENDING`,
`MERGE AS-IS`, current-head, and residual-Low claim below while preserving them as chronology.

**Final independent whole-branch audit: PASS — 0 Critical / 0 High / 0 Medium / 1 Low.** A NEW
independent auditor inspected `origin/develop`
`a2ca53b44f678dd285cd90f31ee644696664f32a` through exact runtime/code audited tip
`3e903aedbd44d43b3d0f31a22ffa3496f9dc1f06`. Disposition: **candidate READY FOR PR TO DEVELOP**.
No PR, push, merge into `develop`, release, deployment, or remote-system mutation has occurred.
D, B, E, and Landing remain unchanged and outside this A+C bundle.

### Audit and correction chronology

- Reconciliation commit `531da9e24b7cdf43ba6190231f9da0219e13623a` recorded the composed
  pre-audit state.
- The first independent whole-range audit at `531da9e` returned **BLOCKED** with two Medium
  implementation/enforcement findings: ownerless explicit login did not rehydrate workspace
  NgRx, and the chart boundary detector allowed inferred/internal dependency edges. This failed
  audit is part of the authority chain and is not replaced or hidden by the later PASS.
- Auth correction `40191dee2974263dffeb7c65f144fd1e4559ebdd` hard reloads the
  `null -> user` transition. `3a447c6078f14c88fa987595f8bc7a59fbbfd7e4` was an intermediate
  backslash blacklist; `894dab7030063aeeb5730ca92e781cdfe2599277` supersedes it with WHATWG
  same-origin return-target validation. The final focused auth suite passed **23 tests**; the full
  suite contains four net-new auth regressions versus 2603.
- Chart correction `f83b3d14d3dcb32906c5b5c296c98181379c2258` enforced
  `createChart`/internal dependency imports. `3e903aedbd44d43b3d0f31a22ffa3496f9dc1f06`
  extended enforcement to static TypeScript import types, re-exports, `createChart` re-exports,
  and `.js` specifier normalization. Final RuleTester coverage is **64 scenarios**.
- Every per-fix review ended with no findings on the final auth and chart states. A new auditor,
  independent of those correction reviews, then issued the whole-branch PASS above.

### Fresh auditor gates at `3e903ae`

| Gate | Final result |
| :--- | :--- |
| App TypeScript | PASS |
| Spec TypeScript | PASS |
| Angular suite | PASS — **189 files / 2607 tests** |
| Lint + chart RuleTester | PASS — **64 RuleTester scenarios** |
| Format | PASS |
| Build | PASS — initial bundle **670.12 kB** |
| Pipeline pytest | PASS — **121 tests** |
| Ruff check / format | PASS / PASS |
| `pip-audit` | PASS — no known vulnerabilities |
| Diff check | clean |
| Worktree | clean |

The sole Low is measured initial-bundle growth from base **651.60 kB** to final **670.12 kB**:
**+18.52 kB (+2.84%)**. The build passes with the accepted budget warning. No cause is assigned
to Arrow/parquet or any other package in this audit result.

> **PROMINENT NON-BLOCKING INHERITED OBSERVATION:** `npm audit` reported **25 inherited
> advisories (1 critical, 19 high, 2 moderate, 3 low)**. Dependency declarations and the lockfile
> are unchanged in `base..tip`, and CI explicitly treats `npm audit` as informational. The auditor
> therefore recorded this separately, not as a candidate finding.

There is no dependency/lockfile, migration, RLS, Edge Function, Supabase schema, or pipeline
dependency delta. No manual browser smoke was run, and no single browser-level test spans all ten
account-lifecycle steps. Those are explicit limitations; the auditor determined they do not block
candidate PR readiness given the composed automated evidence and fresh full gates. Pipeline gates
are PASS, not pending.

## HISTORICAL CONTROLLED-INTEGRATION AUTHORITY — PHASE 7 (SUPERSEDED)

This section formerly superseded older operational status, `MERGE AS-IS`, current-head, and
residual-Low claims. It is now a pre-audit historical snapshot superseded by Phase 8 above.

### Topology and integration history

- A, C, and Central have the same specialist base:
  `894d72be95f8ad4b8d63e629114e486e825b13d7`. Pairwise A/C/Central merge-base checks all resolve
  to that commit. Central's later branch work was documentation/evidence only.
- Track A's historical accepted docs head was
  `b62185429a76802d53cbe8836d88ac6ee74aa07f`, with implementation
  `d72c51de012cb77a3fbd23e4ea208b03ad3a81c2`. Its current post-Low head is
  `8e4fec1942c49c11424ec95f25a4aeed9226892e`; the `sameActivePayload()` omitted-`files` Low is
  **RESOLVED**. Merge commit `97f9f1ebffeaf2f1c74c0b119a825dd23723e0d6` integrated A.
- The first A stage failed `format:check` on eight A-owned files. `origin/develop` passed, and the
  untouched A head failed identically, establishing inherited specialist formatting rather than
  merge damage. Correction `bbc06482b9a71bc5957cbb3508a629fdc8467139` applied Prettier only.
  Final A-stage evidence: focused **5 files / 171 tests**, full **186 files / 2563 tests**, app and
  spec tsc 0, lint 0, format 0, and build **669.99 kB** with only the known **+169.99 kB** initial
  budget warning.
- Track C's historical accepted docs head was
  `717171749aa9af81211c7999553684d05f798ac2`, with implementation
  `646a441d0fb373dc3d3d555220ebb99006e6a542`. Its current post-Low head is
  `44027a4557c16d4260cbf1c216a01f307d069b46`; the generic/lexical alias-shadowing false-positive
  Low is **RESOLVED**. Merge commit `10c2d1d241b6c1a0ee73992c3e27299ee0b75a3f` integrated C.
- The first C stage failed `format:check` on four C-owned files. The pre-C integration tree passed,
  and the untouched C head failed identically. Correction
  `7215f2659af1dc26fd53bd172b43eef8fea19744` applied Prettier only. Final A+C-stage evidence:
  RuleTester 0, focused Engine suite **7 files / 87 tests**, full **189 files / 2603 tests**, app
  and spec tsc 0, lint 0, format 0, and build **669.99 kB** with only the known **+169.99 kB**
  warning.
- Central historical head `6974f769b0f1d2c5a084cbc0aad1c69a0e79b020` was integrated by
  `80ac7b68871412dab83d3a04a4696a18b2340489`. Relative to the shared base it changed only the six
  Wave 2 evidence files plus the intentional root `PROGRESS.md` deletion.

### Composition evidence and remaining gates

The combined automated semantic matrix passed **9 files / 280 tests** on the actual A+C tree. It
covers auth transitions and hard logout, A-B-A storage isolation, open/restore, replay,
layout/drawings/panels persistence, chart-boundary interaction, and placement preview. This is
strong composed semantic evidence, but no manual browser smoke was run and no single browser-level
end-to-end test spans all ten steps. Do not imply either form of coverage exists.

No dependency or lockfile changes were introduced by A, C, or Central. C changed
`emulador/package.json` only to extend the `lint` script; dependency declarations and
`package-lock.json` are unchanged.

**Historical Phase 7 status: final independent audit PENDING; pipeline gates PENDING.** At that
time the integrated branch could not be represented as finally audited or released. The dedicated
reconciliation commit created from pre-reconciliation tip `80ac7b6` became
`531da9e24b7cdf43ba6190231f9da0219e13623a`; Phase 8 above records the later audit result and exact
runtime/code audited tip.

### How the original specialist baseline was built

| # | Commit | What |
| :-- | :--- | :--- |
| 1 | `2f157fd` | `docs(engineering)`: bank all 25 untracked Wave 1 artifacts under `.superpowers/audit-2026-08-10/` |
| 2 | `e3ae4f3` | merge `agent/routing-hygiene` (docs/routing only) |
| 3 | `ccd2b80` | merge `agent/verification-integrity` (tests + lint rule + CI trigger) |
| 4 | `dfb49da` | merge `agent/session-sync-red-team` (truncated-pull guard) |
| 5 | `894d72b` | route the session-sync run ledger out of the repo root |

**One structural conflict, resolved not suppressed.** All five Wave 1 worktrees wrote
their run log to a root-level `PROGRESS.md`, a path absent from `develop`, so merges 3
and 4 collided add/add. Each ledger was routed to
`.superpowers/audit-2026-08-10/ledgers/<branch>-PROGRESS.md` with content byte-identical
to what its agent wrote — the same rule `agent/routing-hygiene` itself applied to SDD
dev-logs. No ledger content was edited, dropped, or merged into another.

### Combined gate evidence (the point of the exercise)

Wave 1 proved these branches pass *separately*. Run raw from
`trading-emulator-wave2-base/emulador`, unpiped, at `894d72b`:

| Gate | Command | Exit | Result |
| :--- | :--- | :-- | :--- |
| tsc app | `npx tsc -p tsconfig.app.json --noEmit` | `0` | clean |
| tsc spec | `npx tsc -p tsconfig.spec.json --noEmit` | `0` | clean |
| unit suite | `npx ng test --watch=false` | `0` | **183 files / 2417 tests passed** |
| lint | `npm run lint` | `0` | `All files pass linting.` |

The test count reconciles arithmetically, which is itself evidence the two test-touching
branches compose rather than merely coexist: session-sync's branch reported 182 files /
2381 tests, and verification-integrity added `trade-panel.component.spec.ts` with 36
DOM tests. 182 + 1 = 183 files; 2381 + 36 = 2417 tests. No test was lost to a merge, and
the selector-isolation fixes did not start colliding with the new DOM specs.

`npm run build` is deferred to branch finalization per the kernel, not run here.

## LANDING

Branch `agent/landing-product-showcase`, worktree
`C:\Users\78701\Desktop\trading-emulator-landing`, head `161e9f5`
(was `65e2a8e`). Branched from `a2ca53b`, NOT from `WAVE2_BASE_SHA` — it is Wave 1 work
being closed out, and it touches no path under `emulador/`.

Three arithmetic figures corrected, each re-derived from the real kernel:

| Surface | Was | Now | Kernel check |
| :--- | :--- | :--- | :--- |
| `/calculadora` NAS100 distance | `5 000 pts` | `50 pts` | 100 / (50 × 1) = 2,00 lotes |
| Floating XAUUSD distance | `750 pts` | `7,5 pts` | 100 / (7,5 × 100) → 0,13 lotes |
| Operativa `Lotaje` | `0,66` | `0,13` | agrees with its own trade card |

The Operativa panel's `750 pts` is CORRECT for that surface and was kept:
`slPoints = round(|entry − sl| / pointSize) = round(7.50 / 0.01)`. The same 7.50 price
movement legitimately reads `7,5` in Lotaje and `750` in the TradePanel. That is the
transcription hazard Agent D exists to name — not an arithmetic bug.

Verified: build exit `0` (6 files, 139.1 kB); live browser at `localhost:4321` — zero
console errors, `scrollWidth === clientWidth` (1265, no horizontal overflow), three
figures read back from the live DOM. Screenshots unavailable in this session (the Browser
pane was not displayed, so the page does not composite frames); DOM reads were used as the
stronger evidence for text values.

## VERCEL

| Field | Value |
| :--- | :--- |
| State | **DEPLOYED AND REMOTELY VERIFIED** |
| Project name | `trading-emulator-landing` |
| Project ID | `prj_0Jnk79dou9l4zTu3xOESfjKFibzF` |
| Team | `hum24` / `team_dVBTaqwZmidnC7KJf7h6BpLI` |
| Preview URL | `https://trading-emulator-landing-37wpawyee-hum24.vercel.app` |
| Preview deployment | `dpl_HmWMqvQv5vG58ubQFMBTGXbDSHJz`, `readyState: READY`, `target: null` (preview) |
| Built from | commit `161e9f5`, ref `agent/landing-product-showcase` |
| Local build | `node scripts/build.mjs` exit `0` — 6 files, 139.1 kB |
| Forbidden project | `prj_KpNe7NDXP95iXljbwcZCh4Wcv0Wo` (`emulador`) — **never modified, never targeted, never linked** |

Before deploying, `list_projects` confirmed `emulador` was the ONLY existing project, so a
new one was required; after `vercel link`, `.vercel/project.json` was checked to prove the
linked `projectId` is not the forbidden one.

**Remote verification** (not a local build claim — the deployed HTML was fetched back):

| Check | Remote result |
| :--- | :--- |
| Operativa `Lotaje` | `Lotaje</span><strong>0,13</strong>` |
| `/calculadora` NAS100 distance | `Distancia al stop<span class="box">50` |
| Floating XAUUSD distance | `Distancia<span class="box">7,5` |
| Lot figures | `2,00 lotes` and `0,13 lotes` both present |
| TradePanel `750 pts` intentionally kept | `100,00 $ · 750 pts` present |
| Stale `5 000 pts` | **absent** (0 occurrences) |
| Stale `0,66` | **absent** (0 occurrences) |

### Two facts the owner should know

1. **The first CLI deploy landed on `target: production` of the NEW project.** `vercel deploy`
   defaulted there for a freshly linked project with no Git connection. It is the new
   landing project's own production alias — the `emulador` project was never involved — but
   because the mandate specified `preview`, a second deploy with an explicit
   `--target=preview` was made, and that preview deployment is the URL recorded above.
   Deployment `dpl_8DmNELPNkvPpGoViLAt5usDmjfc7` still exists on the new project's
   production target; delete or ignore it as you prefer.
2. **The preview URL is NOT publicly shareable as configured.** The project has
   `ssoProtection.enabled = true` with `deploymentType: all_except_custom_domains`, so an
   unauthenticated visitor is redirected to a Vercel login (confirmed in a real browser).
   Content was verified through the authenticated fetch path instead. Turning that off is a
   project-settings change and was deliberately NOT made — it is the owner's call.

## WAVE 2 SPECIALIST TRACKS

All five branch from `WAVE2_BASE_SHA` = `894d72b`, in sibling worktrees outside the
canonical repo (never `.claude/worktrees/`).

| Agent | Track | Worktree | Branch | Status |
| :--- | :--- | :--- | :--- | :--- |
| A | Session Sovereignty V2 | `trading-emulator-session-sovereignty` | `agent/session-sovereignty-v2` | **HISTORICAL ACCEPTANCE** @ `b62185429a76802d53cbe8836d88ac6ee74aa07f` (implementation `d72c51de012cb77a3fbd23e4ea208b03ad3a81c2`); current integrated state is above |
| B | Multi-symbol feasibility | `trading-emulator-multisymbol` | `agent/multisymbol-feasibility` | **VERIFIED RESEARCH** @ `3ae5935` |
| C | Engine boundary restoration | `trading-emulator-engine-boundary` | `agent/engine-boundary-restoration` | **HISTORICAL ACCEPTANCE** @ `717171749aa9af81211c7999553684d05f798ac2` (implementation `646a441d0fb373dc3d3d555220ebb99006e6a542`); current integrated state is above |
| D | Unit semantics & UI contract | `trading-emulator-unit-semantics` | `agent/unit-semantics` | **VERIFIED** @ `1984e5d` |
| E | Clock authority | `trading-emulator-clock-authority` | `agent/clock-authority` | **VERIFIED / OWNER-GATED** @ `cee6cff` |

### Interruption event — all five agents killed simultaneously

All five specialists terminated at once on a shared **session usage limit** (reset 15:10
America/La_Paz), not on any fault in their own work. This is the exact failure mode the
checkpoint protocol exists for, and it produced a clean natural experiment in whether the
protocol was actually followed.

State reconciled from git — the only authoritative source — at the moment of death:

| Agent | Commits at base+ | Uncommitted at kill time | Verdict |
| :--- | :--- | :--- | :--- |
| A | `c338491` | 4 modified (+303/−85, incl. `workspace-db.service.ts` at 291 lines changed) + 3 untracked new services/effects | **worst exposure** — ~300 lines of implementation, unrecoverable if the worktree were lost |
| B | `1c24bbc`, `105f672` | none — clean | **followed the protocol** |
| C | `6db3c0f` | 2 modified engine files (`capability.ts` +24/−5, `chart-engine.ts` +12/−2) | engine surgery at risk |
| D | `2a6d7c6` | 1 untracked spec | test would have been lost entirely |
| E | `bf82ba2`, `e2c39ad` | 1 untracked spec | test would have been lost entirely |

**Lesson worth keeping:** instructing an agent to checkpoint is not the same as it
checkpointing. Four of five carried uncommitted work when killed, and the one that did not
(B) is also the only research-only track — the agents doing the riskiest edits were the
least protected. Every resume message therefore led with an explicit
commit-this-exact-pathspec-first instruction naming the files at risk, before any
continuation of the mission.

Two placement defects were caught during reconciliation and sent back with the resumes: D
and E both wrote their spec to `emulador/src/app/<name>.spec.ts` at the app root instead of
beside the module under test, which is this repo's convention.

Nothing was lost. No worktree was reset, and no evidence was discarded to tidy up.

Agent A is the only track carrying a reachable-today data-loss defect. Agent B is
research-only (no production multi-symbol runtime). Agents C/D/E may implement only what
their own evidence adjudicates.

## INDEPENDENT VERIFICATION — AGENT B (multi-symbol feasibility)

Agent B reported COMPLETE. Verified against git and source rather than accepted; every
claim below was re-derived by the orchestrator.

Branch `agent/multisymbol-feasibility`, head `3ae5935`, 5 commits from base, worktree clean.

| Claim | Verdict | Evidence the orchestrator re-derived |
| :--- | :--- | :--- |
| Zero production files touched; research only | **CONFIRMED** | `git diff --name-status 894d72b..HEAD` = exactly 4 added `.md` files, all under `.superpowers/evolution-wave2/multisymbol/`. A grep for any path outside that directory returns nothing. |
| `series` projection has no symbol dimension | **CONFIRMED** | `market.reducer.ts:8` — `series: Partial<Record<Timeframe, Candle[]>>`, precisely as cited. |
| **No frozen decision needs revocation** | **CONFIRMED — and it is the most consequential finding of the track** | `008-012…:39-41` reads *"Trading multi-simbolo. La Sesion opera UN unico simbolo (primarySymbol). Los paneles de simbolo secundario son estrictamente view-only (referencia/contexto)."* The non-goal forbids multi-symbol **trading**, and its second sentence positively **endorses** view-only secondary-symbol panels. A future RFC that opened by revoking D1 would revoke something it does not need and risk reading as authorisation for cross-symbol execution. |
| `resolvePanelCandles` takes no symbol (F19-2 live and latent) | **CONFIRMED** | `chart-model-mapper.service.ts:464` — signature is `(series, timeframe)`, and the memo is keyed only on `{series, timeframe}`. Adding a `setPanelSymbol` action would leave a foreign-symbol panel resolving candles from the single global projection. |
| Guards cannot return false in production today | **CONFIRMED** | Panel default is `symbol: ''` (`layout.models.ts:128`), and `layout.trade-predicates.spec.ts:85-86` pins `panelTracksPrimarySeries(descriptor({symbol: ''}), 'US30') === true`. So RFC-018 T-1/T-2/T-3 and RFC-019's candle gate have never been exercised against a real foreign symbol. |
| `PanelRuntime` was never implemented | **CONFIRMED** | Zero hits repo-wide. |
| `syncTimeRange` forwards bar indices where RFC-010 §4 specifies absolute time | **CONFIRMED at mechanism level** | `chart-sync-router.ts:20` maps `VisibleRangeChanged → 'syncTimeRange'`; the transport is `applyVisibleRange(range: LogicalRange \| null)` and `LogicalRange` is lightweight-charts' **bar-index** range. `010-synchronization.md:56-58` requires *"al mismo rango temporal absoluto, cada uno proyectandolo a su propia escala/timeframe"*, and §4's crosshair clause explicitly states shared candle indices must NOT be assumed across timeframes. Reachable cross-timeframe today, without multi-symbol. B correctly declined to claim user-visible confirmation and asked for a browser reproduction first — that reservation is upheld. |
| Candles index `['symbol','timeframe','time']` exists | **CONFIRMED** | `workspace-db.service.ts:112`. |

Two minor inaccuracies, neither material: B reported "four commits" (there are five from base,
including its own first checkpoint), and two file citations did not resolve at the given paths
(`chart-sync-bus.ts:11`, `market-data-db.ts:35`) though the substance was verified elsewhere in
each case. Line numbers inside the files that do exist were exact.

**Orchestrator assessment.** B is the only agent that never carried uncommitted work, and it
is the only track that refuted two of its OWN hypotheses (a symbol-neutral clock; the two
stores as a cache tier over one authority) in addition to Wave 1's premise. Its central cost —
resident memory at N symbols — is explicitly unquantified, and B flagged that itself; no figure
should be quoted for it. Branch disposition: **RESEARCH ONLY, do not merge to `develop` as
architecture** — the docs are mergeable, the RFC number (`023`) is bookkeeping to reconcile
against sibling branches, and promotion requires Spanish translation.

**Extracted for its own track:** the `syncTimeRange` logical-vs-absolute-range divergence is
independent of multi-symbol and should not wait on it.

## INDEPENDENT VERIFICATION — AGENT E (clock authority)

Agent E reported COMPLETE. Branch `agent/clock-authority`, head `cee6cff`, 7 commits from
base, worktree clean.

| Claim | Verdict | Evidence the orchestrator re-derived |
| :--- | :--- | :--- |
| Zero application source, zero `pipeline/`, zero existing tests changed | **CONFIRMED** | `git diff --name-status 894d72b..HEAD` = 3 added `.md` under the deliverable dir + exactly 1 added spec. A grep for any non-spec, non-`.superpowers` path returns nothing. |
| 5 defect probes fail on base, 9 pass (14 total) | **CONFIRMED** | The spec contains exactly 5 `it.fails(` calls (lines 128/138/148/165/175) and 9 plain `it(` — the 7 raw grep hits included 2 header-comment mentions. Counts match the report precisely. |
| Probe file placed beside its subject | **CONFIRMED** | `emulador/src/app/domain/chart/display-time.clock-authority.spec.ts`, matching the repo's existing `<subject>.<aspect>.spec.ts` convention. The app-root placement flagged at resume was corrected. |
| Surface count is 15, not Wave 1's 11 | **SUPPORTED** — accepted on the agent's method, not re-counted site-by-site | The re-measure is documented per-site with file and line in `CLOCK_AUTHORITY_INVESTIGATION.md`. The orchestrator spot-verified the class split and the mechanism, not all 15 citations. |

**The `it.fails` pattern is the single best artifact of this wave.** Defect probes are
committed in a form that keeps the suite green while the defect stands, and trips into a
visible failure the moment someone genuinely fixes the surface. It converts "we know about
this bug" from a comment into an executable tripwire. Copy it.

**Two refutations that prevented real harm.** Wave 1 recommended routing
`session.service.ts:107-108` (`yearsInRange`) and `market-data-db.ts:80-81`
(`partitionTimeBounds`) through a timezone conversion. E showed both are correct precisely
BECAUSE they read the stored epoch as UTC — that is the pipeline's own partition predicate,
so "fixing" them would request `2025.parquet` for candles written to `2026.parquet` for every
stored epoch in the first NY evening of a year. That is **silent data loss dressed as a
timezone fix**, and it would have passed review as an improvement.

**Why nothing was fixed, and why that is right.** Class A (10 sites) is conclusively a
defect, but 4 of those sites are UI copy or a persisted field name, and Class B's semantics
turn on D-E1, which only the owner can settle: today's journal date is the FX/CFD **trading
day** and agrees with the D1 candles the trader sees (D1 rolls at 17:00 NY), so switching to
the NY calendar date would make the journal disagree with the chart's own dailies. A partial
fix would leave the app self-inconsistent in a NEW way. Deferring implementation to an owner
decision is the correct call, not a shortfall.

Gates on the final committed state: `tsc app` 0, `tsc spec` 0, `ng test` 0
(**184 files / 2426 passed + 5 expected fail = 2431**), `lint` 0. Baseline 183/2417 → 184/2431
(+1 file, +14 probes), which reconciles. Gate 2 earned its keep by catching that the agent's
own header comment contained `src/**/*.spec.ts`, whose `*/` closed the block comment early
(fixed in `722b877`).

Branch disposition: **MERGE AFTER owner settles D-E1..D-E4.** The probe spec and the two
documents are mergeable as-is and valuable on their own — they lock the three refutations
against future "fixes" — but the Class A remediation must not land piecemeal.

Also recorded and deliberately NOT fixed: 8 "UTC seconds" doc lies in
`trading.models.ts`/`drawings.models.ts`, a `createdAt` seconds-vs-ms name collision, and 3
misleading docstrings inside the protected `pipeline/` tree (proposed only, per its protected
status). These are cheap-agent backlog.

## INDEPENDENT VERIFICATION — AGENT D (unit semantics)

Agent D reported COMPLETE. Branch `agent/unit-semantics`, head `1984e5d`, 8 commits from
base, worktree clean.

| Claim | Verdict | Evidence the orchestrator re-derived |
| :--- | :--- | :--- |
| Change scope is 4 docs + 1 spec + 2 production files | **CONFIRMED** | `git diff --name-status` exactly that; production diff is `execution-costs.ts` and `trading.models.ts`, +63/−25 total. |
| The persisted key `pointSize` was NOT renamed | **CONFIRMED** | `execution-costs.ts:127` still returns `{ ...COST_PRESETS[cls], pointSize: costQuoteUnitFor(symbol) }` — the property name is untouched; only the resolver behind it was renamed. |
| The rename is module-private | **CONFIRMED** | `function costQuoteUnitFor(...)` at line 94 has no `export`. A diff filtered to `+/- export` lines returns nothing, so no public signature changed anywhere. **Zero migration surface, as claimed.** |
| Probe 4 is a REFUTATION, not a hole | **CONFIRMED — arithmetic independently recomputed** | `20000.01 / 0.01` in node = `2000000.9999999998`, absolute error `2.33e-10`, giving the `1e-4` epsilon **5.6 orders of magnitude** of headroom. No fixture at index/metal/FX price scales can make the epsilon decisive. D quoted the literal with the opposite error sign (`…0002` vs `…9998`); magnitude and conclusion are unaffected. |
| Gates green, +35 tests from one new spec | **CONFIRMED as internally consistent** | 184 files / 2452 tests vs baseline 183 / 2417 → +1 file, +35 tests, matching one new spec exactly. Nothing pre-existing broke, was removed, or was skipped. |
| The deferral blocker (META_STORE has no schema version; `session-sync` consumes raw legacy metas) | **SUPPORTED BUT NOT FULLY PROVEN** — which is precisely how D characterised it | Structural preconditions verified: no `schemaVersion` anywhere in `workspace-db.service.ts`, and `session-sync.service.ts` calls `listMetas()` at lines 327, 465 and 554. The NaN corruption path itself was not executed, and D named the two missing pieces itself (no audit of real stored data; no proof against mid-upgrade multi-device interleaving). |

**The judgement call D got right.** It was authorised to perform the `pointSize` →
`costQuoteUnit` rename if migration safety could be proven. It found that it could not, and
stopped — the failure mode it identified is `pointsToPrice(2, undefined)` → `NaN` silently
corrupting every fill in already-recorded backtest history, against a benefit that is
essentially agent-facing clarity. It then did the subset with genuinely zero migration
surface (the false doc comment, the private resolver, a stale comment) and deferred the rest
to its own PR. That is the correct trade, and the reasoning is recorded rather than implied.

**Probe 2 is the durable win of this track.** Wave 1's proposed "fix" — changing the index
cost divisor from 1 to 0.01 — now **fails a named test** (6 failures) instead of passing
review as an improvement. The same wave that produced the false positive has left behind the
tripwire that prevents its recurrence.

**Three findings worth extracting.** (1) `ExecutionCosts.pointSize` is a *union* of the other
two authorities — equal to quote resolution off-index, equal to a whole index point on-index —
which is exactly why reconciling it against `AssetSpec.pointSize` looks plausible: it IS the
same number for three of the four instrument families with shipped data. (2) The chart-family
divisor is a property of the DATA, not the instrument (`derivePointSize` samples 30 closes),
and `selectPointSize` falls back to a hardcoded symbol-blind `0.01` when no candles are
loaded — 1000× off for EURUSD, display-only, left alone under O-2. (3) **Five of six generated
MT5 fields have zero production consumers** (`tickSize`, `pointSize`, `volumeStep`,
`volumeMin`, `digits`; only `contractSize` is read) — a trap rather than a cleanup, since an
unused broker-authoritative `pointSize` sitting beside a hand-authored `ExecutionCosts.pointSize`
is the precise shape that invites the wrong wiring.

**Also refuted:** "TradePanel and Lotaje disagree on lot size." Both call `lotsForRisk(...)`
with a price pair; neither divides by a point size to size a position. `slPoints` is
display-only. The 100× divergence is a transcription hazard, never a computational one —
consistent with what the orchestrator found independently while fixing the landing.

Branch disposition: **MERGE AS-IS.** The production delta is two comment/doc corrections plus
a module-private rename, guarded by 35 new cross-surface tests, with all four gates green. The
vocabulary strings and the persisted rename are explicitly NOT in it and remain owner-gated.

## HISTORICAL FINAL INDEPENDENT VERIFICATION — AGENT A (session sovereignty)

> Superseded for current status by Phase 7 above. This section records the pre-Low specialist
> acceptance and its then-live residual finding; it is not the integrated branch verdict.

Branch `agent/session-sovereignty-v2`, final documentation head
`b62185429a76802d53cbe8836d88ac6ee74aa07f`, worktree clean. Accepted implementation head:
`d72c51de012cb77a3fbd23e4ea208b03ad3a81c2`; the later commit updates evidence only.

The original account-switch defect and A5 trading-metadata race are fixed with owner-partitioned
workspace/playbook/lesson databases, preserved shared market-data stores, read-only legacy
quarantine, exact-count evidence-based adoption, hard document boundaries on owner changes,
transaction-local revision guards, and monotonic complete active-payload clocks. Later correction
work made replay settings and local `files` part of coherent persistence/materialization and closed
the final archive-reconciliation and cloud-promotion transaction/consequence windows.

Independent reviewer verdict: **ACCEPTED**, zero Critical/High/Medium findings. Final controller
gates, raw and unpiped at `d72c51d`: app tsc 0; spec tsc 0; full suite 0 at **186 files / 2562
tests passed**; lint 0; build 0 at **669.96 kB**, with only the known 500 kB budget warning by
**169.96 kB** and no unexpected or Vitest production chunk. The sole residual Low is that
`sameActivePayload()` omits `files`; it is latent and non-blocking because every current `files`
writer advances the exact revision clocks used by that guard.

Branch disposition remains **MERGE AS-IS** through normal owner-chosen integration, with fresh
combined gates after integration regardless of whether conflicts occur. No Supabase migration,
dependency, lockfile, recovery UI, cross-tab framework, push, PR, deployment, or `develop`
mutation occurred.

## HISTORICAL FINAL INDEPENDENT VERIFICATION — AGENT C (engine boundary)

> Superseded for current status by Phase 7 above. This section records the pre-Low specialist
> acceptance and its then-live residual finding; it is not the integrated branch verdict.

Branch `agent/engine-boundary-restoration`, final documentation head
`717171749aa9af81211c7999553684d05f798ac2`, worktree clean. Accepted implementation head:
`646a441d0fb373dc3d3d555220ebb99006e6a542`; later commits update evidence only.

The RFC-004/RFC-005 chart/series bridge is retired. `registerCapability` accepts only a closed
built-in ID registry, keeps construction inside the chart domain, and returns `void`;
`getCapability` exposes only mapped handle-free facades. Raw library pointer callbacks are copied
into data-only `ChartPointerEvent` values. Hosts receive a subscribe-only event source on a bus
physically distinct from the private capability bus. The local ESLint rule covers named/namespace
imports, dot/indexed TypeScript import types, direct and two-step re-exports, and exported aliases,
including nested qualified/indexed forms and exports declared before imports. Its `RuleTester`
suite is part of `npm run lint`.

Independent whole-range review ended **ACCEPTED** with zero Critical/High/Medium findings. Final
controller gates, raw and unpiped at `646a441`: app tsc 0; spec tsc 0; full suite 0 at **186 files /
2457 tests passed**; lint 0 including `RuleTester`; build 0 at **651.83 kB**, with only the known
500 kB budget warning by **151.83 kB** and no unexpected or Vitest chunk. The sole residual Low
is bounded lexical-shadowing over-reporting in the syntax-only detector, for example an imported
forbidden `H` plus unrelated `export type P<H> = H`; no production occurrence was found.

Repeated raw suite outputs agreed: relative to historical `b06fb62` at 185/2450, +1 file/+7 tests
reconciles as registry spec +5, boundary net +2, and unchanged frozen-scene count. This corrects a
documentation transcription only; no application or test code changed.

Branch disposition remains **MERGE AS-IS** through normal owner-chosen integration, with fresh
combined gates after integration regardless of whether conflicts occur. `emulador/package.json`
changed only its `lint` script so `npm run lint` executes
`node eslint-rules/no-chart-handles.test.js` before `ng lint`; dependency declarations, the
dependency set, and `package-lock.json` remained unchanged. No push, PR, deployment, or `develop`
mutation occurred.

## OWNER DECISIONS BINDING THIS WAVE

- **O-1 / O-2** — no global 100× rescale; `pts` ambiguity is fixed with vocabulary, not
  arithmetic. Existing correct calculations are preserved.
- **O-3** — `ExecutionCosts.pointSize` is misdocumented, not miscomputed. A rename needs
  proven migration safety because the type may be persisted.
- **O-7** — legacy IndexedDB migration is data-preservation-first: never auto-adopt
  ambiguous legacy data, never auto-discard it, never let user B mutate user A's state.
  Quarantine first; ambiguity must fail safe.
- **O-12** — multi-symbol is RFC-grade research this wave, not implementation. The landing
  keeps labelling it as future capability with no date.

## SETTLED — DO NOT REINVESTIGATE

- XAUUSD sizing: **REFUTED as a bug.** D.20.6 intends whole price units. Do not wire
  `tickSize = 0.01` into Lotaje.
- Index `ExecutionCosts.pointSize = 1`: **CONFIRMED CORRECT.** Friction is
  `spreadPoints × pointSize`; NAS100 as shipped costs $3.00 = 3.00% of intended risk,
  versus $0.03 under a `0.01` counterfactual. Never compare `pointSize` to `tickSize` and
  call it a bug.
- SessionSync V1 truncated pull: fixed and merged into the baseline.

## LOG

- **2026-08-12** — drift check clean; Wave 1 evidence banked (`2f157fd`); three Wave 1
  branches integrated; four gates green at `894d72b`; landing arithmetic closed
  (`161e9f5`); five specialist worktrees created at the base SHA and dispatched.
- **2026-08-13 closeout pause** — canonical drift check remained clean:
  `develop == origin/develop == a2ca53b`; integration branch remained at `ac69adf` before
  the pause-artifact commit. The two remaining untracked P0 specs were preserved as
  `34a0a87` (A) and `a736da8` (C). Track A advanced to `4e25e3c` and Track C to
  `1197ed4`; both worktrees were clean at pause. Neither is independently accepted yet:
  final reviews found bounded correctness/enforcement gaps. Exact restart instructions and
  task briefs are committed in `WAVE2-CLOSEOUT-RESUME.md`,
  `TRACK-A-CLOSEOUT-BRIEF.md`, and `TRACK-C-CLOSEOUT-BRIEF.md`. No branch was merged or
  pushed, and completed tracks were not reopened.
- **2026-08-13 final closeout** — Track A accepted at final head `2630294` (implementation
  `498646b`) with 186 files / 2483 tests and all five gates green. Track C accepted at final
  head `66211cc` (implementation `b06fb62`) with 185 files / 2450 tests and all five gates
  green. Every specialist worktree and the integration worktree reconciled clean. `develop`
  and `origin/develop` remained `a2ca53b`; canonical unrelated untracked Wave 1 evidence was
  left untouched. No specialist branch was merged, pushed, deployed, rebased, or squashed.
  Final synthesis and index were written on `agent/evolution-wave2-base` only.
- **2026-08-20 cold-resume pause** — later fresh whole-range reviews revoked both earlier A/C
  acceptances. Track A is clean at `fefea65`; after multiple bounded correction loops, two
  Medium transaction windows remain (archive reconciliation can miss a second live edit, and
  promotion can accept live A already ahead of durable A). Track C remains clean at `66211cc`;
  one High caller-constructor side channel and one Medium exported-type-alias lint bypass remain.
  Exact scope is in the two closeout briefs. The last A implementer was cancelled before any
  mutation. No post-rejection final gates were accepted. Integration remains at `cbe52fc` before
  this documentation commit; `develop == origin/develop == a2ca53b`. No merge, push, reset,
  rebase, deployment, remote-system change, or completed-track mutation occurred.
- **2026-08-29 resumed final closeout** — Track A independently accepted implementation
  `d72c51d` with zero Critical/High/Medium findings and final documentation head `b621854`;
  Track C independently accepted implementation `646a441` with zero Critical/High/Medium
  findings and final documentation head `7171717`. Both specialist worktrees and the integration
  worktree reconciled clean before central edits. Integration remained at pre-final-doc head
  `37a43b2519e6d35f7fab2288b88ee4f377307c72`; no specialist branch was merged into integration
  or `develop`, so no combined runtime compatibility is claimed. Canonical
  `develop == origin/develop == a2ca53b44f678dd285cd90f31ee644696664f32a`; unrelated untracked
  `.superpowers/audit-2026-08-10/` remained untouched. No push, PR, merge, deployment, Supabase,
  Vercel, dependency/lockfile, remote, or completed-track change occurred.
- **2026-08-29 controlled integration and Phase 7 reconciliation** — On
  `integration/evolution-wave2`, post-Low A (`8e4fec1`) and C (`44027a4`) were integrated by
  `97f9f1e` and `10c2d1d`; inherited format failures were corrected with Prettier-only commits
  `bbc0648` and `7215f26`. Central evidence head `6974f76` followed through `80ac7b6`. A-stage and
  A+C-stage frontend gates passed with the counts recorded in the current-authority section, and
  the combined semantic matrix passed 9 files / 280 tests. No manual browser smoke or one-test
  ten-step browser E2E was performed. This reconciliation follows `80ac7b6`; final independent
  audit and pipeline gates were pending at this historical checkpoint.
- **2026-08-30 final audit-result follow-up** — Reconciliation commit `531da9e` first received a
  whole-range **BLOCKED** audit with two Medium findings. The auth correction chain `40191de` ->
  `3a447c6` -> `894dab7` and chart correction chain `f83b3d1` -> `3e903ae` closed them; every final
  per-fix review had no findings. A NEW independent auditor inspected `a2ca53b..3e903ae`, reran the
  full frontend, build, pipeline, security, diff, and cleanliness gates, and returned **PASS — 0
  Critical / 0 High / 0 Medium / 1 Low**. The Low is initial-bundle growth of 18.52 kB (2.84%).
  Inherited `npm audit` advisories remain a prominent non-blocking observation. Candidate is
  **READY FOR PR TO DEVELOP**; no PR, push, or `develop` mutation occurred.
