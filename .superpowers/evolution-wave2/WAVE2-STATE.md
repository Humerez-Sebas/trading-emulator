# WAVE 2 — ORCHESTRATOR STATE

Campaign: Trading Emulator Engineering Evolution · Wave 2
Session opened: 2026-08-12. Orchestrator: Opus 5.

Unlike Wave 1, this file is **tracked**. Commit it continuously — an untracked
orchestration ledger is an unrecoverable one, which is the durability defect Wave 2
opened by fixing.

## BASELINE

| Fact | Value |
| :--- | :--- |
| Wave 1 baseline (`develop`) | `a2ca53b44f678dd285cd90f31ee644696664f32a` |
| Drift check at session open | NONE — `develop` == `origin/develop` == `a2ca53b` |
| Wave 2 integration branch | `agent/evolution-wave2-base` |
| Integration worktree | `C:\Users\78701\Desktop\trading-emulator-wave2-base` |
| **`WAVE2_BASE_SHA`** | **`894d72be95f8ad4b8d63e629114e486e825b13d7`** |

Nothing has been merged into `develop`. Nothing has been pushed to `origin`.

### How the baseline was built

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
| A | Session Sovereignty V2 | `trading-emulator-session-sovereignty` | `agent/session-sovereignty-v2` | INTERRUPTED → RESUMED |
| B | Multi-symbol feasibility | `trading-emulator-multisymbol` | `agent/multisymbol-feasibility` | INTERRUPTED → RESUMED |
| C | Engine boundary restoration | `trading-emulator-engine-boundary` | `agent/engine-boundary-restoration` | INTERRUPTED → RESUMED |
| D | Unit semantics & UI contract | `trading-emulator-unit-semantics` | `agent/unit-semantics` | INTERRUPTED → RESUMED |
| E | Clock authority | `trading-emulator-clock-authority` | `agent/clock-authority` | INTERRUPTED → RESUMED |

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
