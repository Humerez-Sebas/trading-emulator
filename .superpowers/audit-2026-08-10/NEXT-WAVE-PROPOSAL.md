# Next-Wave Proposal — where the remaining Opus budget should go

**Written:** 2026-08-12 · **Baseline for any next wave:** `develop` @ `a2ca53b`
**Basis:** the NEW evidence from this campaign, not the audit's provisional RFC-021..024 numbering.
**Status: PROPOSAL ONLY. No worktrees created. No agents dispatched. Owner authorises tracks.**

---

## 0. Why the audit's RFC sequence is not simply inherited

The audit proposed `RFC-021 (verification) → 022 (units) → 023 (candle authority) → 024 (sync)`.
Three pieces of new evidence break that ordering:

1. **RFC-021's core is already built.** CI on `develop`, the TradePanel DOM suite, the 19 selector
   fixes and a zero-backlog lint rule exist on `agent/verification-integrity`. What remains is a
   **merge plus a human dashboard action**, not an RFC.
2. **RFC-022's premise partly dissolved.** The arithmetic suspicions are refuted. What is left is
   a *vocabulary* decision (O-1) that is **owner-blocked**, not engineering-blocked. An Opus agent
   cannot start it and would only re-centralise the ambiguity.
3. **A reachable-today data-loss defect was found that the audit ranked as "High latent".** Sync
   was scheduled last (RFC-024, "mergeable into 023"). It should be first.

**Revised principle: rank by `severity × reachability × how much expensive reasoning it needs`,
not by the original numbering.**

---

## 1. Work classification

### `OPUS-WORTHY`
- **Session-sync V2** — owner-bound local store + migration of existing IndexedDB contents.
- **Engine boundary restoration (I1b)** — design the engine's minimal public query contract.
- **Symbol-keyed runtime feasibility** — the multi-symbol gate; hardest cross-boundary question.
- **`WorkspaceMeta.trading` writer ownership** — adversarial: prove mechanism before architecture.
- **Clock authority** — 11 surfaces format broker-clock epochs as UTC; needs semantic judgment.

### `CHEAPER-AGENT SUITABLE`
Worktree prune · ~30 dead exports · comment cleanup (SDD process nouns) · light-theme CSS (6
files) · `calculadora` CSS budget · Angular **21.2.19** bump + `npm ci --dry-run` ·
`npm audit --omit=dev --audit-level=high` gate · status banners on the remaining 48 plans ·
`no-floating-promises` (23 sites) · **I1a + I7 `no-restricted-imports` (both zero-backlog)** ·
OnPush on 33 components.

### `OWNER / DESIGN DECISION`
O-1 `pts` scope (**blocks all unit work**) · O-2 rescale approval · O-3 `costQuoteUnit` rename +
migration · O-4 duplicate `D.20.6` id · O-5 six dead MT5 fields · O-7 V2 migration policy ·
O-8 **branch protection** · O-9 tsc/`format:check` authority · O-10 read Max Rows once ·
O-11 run the prune · O-12 next product direction.

### `DEFER`
Angular 22 / TS 6 / NgRx 22 (NgRx 22 still RC) · branded types · broad token migration · typed-lint
preset (2,392 errors) · `noUncheckedIndexedAccess` sweep (883) · generic repository framework ·
merging the IndexedDB databases · splitting long ordered-algorithm files.

---

## 2. Candidate tracks

### Track 1 — **Session Sovereignty: owner-bound local store (V2)**

| | |
|---|---|
| **Why now** | The only **reachable-today** data-loss defect in the campaign. No cap, no growth, no truncation needed. |
| **Question it resolves** | How is local durable state bound to an identity, and how do existing unowned IndexedDB contents migrate without losing a single session? |
| **Evidence available** | `SESSION_SYNC_RED_TEAM.md`; orchestrator-verified: `DB_NAME = 'emulador-workspaces'` is a module constant with no user id (`market-data-db.ts:16`); `logout$` only signs out and `redirectAfterLogout$` only navigates (`state/auth/auth.effects.ts`); `deleteDatabase` appears nowhere in non-spec code; an RLS-filtered read returns **HTTP 200 `[]` with `error == null`**. |
| **Files / architecture** | `services/workspace-db.service.ts`, `services/market-data-db.ts`, `services/session-sync.service.ts` + `.mapping.ts`, `state/auth/auth.effects.ts`, `state/sync/session-sync.effects.ts` |
| **Mutates production?** | **Yes** — storage identity and a data migration |
| **Dependencies** | **Owner decision O-7** (migration policy: adopt-on-first-login vs quarantine vs discard). An agent can design all three and implement the chosen one. |
| **Risk** | **High** — a migration bug destroys the data the track exists to protect. Mandate: every migration path gets a negative probe. |
| **Deliverable** | RFC-grade design + implementation + tests proving an account switch cannot delete the other user's sessions |
| **Why Opus** | The failure mode is silent, permanent user-data loss; the design space (scope the DB name, scope the stores, or gate the merge on identity) has real trade-offs; and the migration must be correct on the first run against data that already exists on the owner's machine. |

**Concretely reachable for this owner:** a second identity (`ai-account@gmail.com`) already exists
for browser testing on this machine. Signing into it on the same browser profile is exactly the
trigger.

---

### Track 2 — **Engine Boundary Restoration (I1b expired scaffolding)**

| | |
|---|---|
| **Why now** | The sunset condition **has already fired**, and any detector shipped before the cleanup would need suppressions that re-legitimise what RFC-004/005 authorised deleting. |
| **Question it resolves** | What is `ChartEngine`'s minimal public contract? Which of the 18 call sites are legitimate engine queries, and which are capability work that leaked into the component? |
| **Evidence available** | `ORCHESTRATOR-INVARIANT-EVIDENCE.md`: sunset TODO at `chart-engine.ts:24`; `capability.ts:14-19` ("hasta entonces"); `DrawingsCapability`/`TradingCapability` both exist and **already take the series by constructor** (`:15`, `:55`); complete consumer list is **5 sites**, not 25. Orchestrator's own call breakdown: 10 coordinate conversions · 4 order-placement price lines · 2 `series.update` · 2 timeScale. |
| **Files** | `domain/chart/chart-engine.ts`, `domain/chart/capability.ts`, `domain/chart/capabilities/*`, `components/chart/chart.component.ts`, `pages/reflection/frozen-scene-host.component.ts` |
| **Mutates production?** | **Yes** — but zero behaviour change is the acceptance criterion |
| **Dependencies** | Merge `agent/verification-integrity` first, so the work lands under CI |
| **Risk** | **Medium** — the chart is the hot path; 18 call sites; behaviour must be provably identical |
| **Deliverable** | Bridge getters deleted · a ~4-method engine query surface · price-line placement moved into `TradingCapability` · **then** the I1 detector shipped against a genuine zero backlog |
| **Why Opus** | Deciding what belongs in the engine versus a capability *is* the architectural question the invariant encodes. Done mechanically it either fails or produces a wider API than before. **Verdict: a small-to-medium implementation, NOT an RFC** — but it needs judgment, not a rename. |

---

### Track 3 — **Symbol-Keyed Runtime feasibility (the multi-symbol gate)**

| | |
|---|---|
| **Why now** | The presumed next product direction, and the landing previews it as future. Nothing can be promised until the cost is known. |
| **Question it resolves** | What does making `symbol × timeframe` a first-class runtime identity actually cost across market state, replay, trading book cardinality, session sovereignty and persistence? |
| **Evidence available** | `market.reducer.ts` keys `series: Partial<Record<Timeframe, Candle[]>>` — **no symbol dimension**; `workspaces.models.ts:20` embeds `Candle[]` (I3 local violation on the same line); two durable candle owners (`CANDLES_STORE` + `SERIES_STORE`); F19-2 (foreign-symbol candles) still open; "mono-symbol session" is a **frozen non-goal** (invariant 6) revocable only by a new RFC. |
| **Files** | `state/market/*`, `state/workspaces/*`, `services/workspace-db.service.ts`, `indexed-db.repository.ts`, replay + trading state, `TradingBook` |
| **Mutates production?** | **No** — investigation and design only (optionally a throwaway spike in its own worktree) |
| **Dependencies** | **Owner O-12** (is multi-symbol actually next?) and formally revoking the frozen non-goal |
| **Risk** | Low as research; **high** if implemented without this design |
| **Deliverable** | RFC-grade design with a candle-authority decision, migration path, and an honest cost estimate |
| **Why Opus** | The highest-blast-radius architecture question in the repo, spanning storage, state, replay, trading and persistence simultaneously. Exactly the reasoning that does not survive being split into cheap mechanical steps. |

---

### Track 4 — **`WorkspaceMeta.trading` writer ownership — adversarial**

| | |
|---|---|
| **Why now** | Flagged High by the audit and **never probed**. Given this campaign's record, it is as likely to be intentional orchestration as a defect. |
| **Question it resolves** | Are the three writers genuinely racing, or sequenced by construction? Produce a failing test or **refute the finding**. |
| **Evidence available** | `workspaces.effects.ts:198-235`; `session-sync.service.ts:540-546` and `:511-521`. Related: the sync pull sets `meta.trading = defaultTradingData()` on a delete — the exact mechanism Track 1 touches. |
| **Files** | `state/workspaces/workspaces.effects.ts`, `services/session-sync.service.ts`, `services/workspace-db.service.ts` |
| **Mutates production?** | Only if a defect is **proven** |
| **Dependencies** | Overlaps Track 1's files — **do not run both in parallel on the same files**; sequence Track 1 → Track 4, or scope Track 4 to investigation only |
| **Risk** | Low |
| **Deliverable** | A reproduction test **or** a written refutation with the sequencing argument |
| **Why Opus** | "Prove mechanism before proposing architecture" is precisely where cheaper agents have generated false positives in this repo — three times already. |

---

### Track 5 — **Landing / product art direction** *(scope depends on Agent A's result)*

| | |
|---|---|
| **Why now** | Only if the first landing is technically complete but conceptually below bar. **Do not spend Opus on CSS polish if the concept is already resolved.** |
| **Question it resolves** | Does the page communicate a deliberate-practice instrument rather than a trading product — and does the calculator get genuine product emphasis? |
| **Evidence available** | `LANDING_PRODUCT_BRIEF.md`; `DESIGN_SYSTEM.md` (603 lines, the visual authority now correctly routed by Agent E) |
| **Mutates production?** | No — `landing/` only |
| **Risk** | Low |
| **Why Opus** | Only for narrative/information architecture. Visual refinement is `CHEAPER-AGENT SUITABLE`. |

---

## 3. Ranking

| Priority | Track | Reason |
|---|---|---|
| **P0** | **Track 1 — Session sovereignty (V2)** | Reachable **today**; destroys real user data; concretely triggerable on this machine |
| **P0** | **Track 3 — Symbol-keyed runtime feasibility** | Gates the entire next product wave; pure reasoning; zero production risk |
| **P1** | **Track 2 — Engine boundary restoration** | High architectural value, bounded scope; another strong model could execute it from a written design |
| **P1** | **Track 4 — Trading-metadata ownership** | Might refute a High finding cheaply; strong-model capable |
| **P2** | **Track 5 — Landing refinement** | Conditional on Agent A |
| **P2** | Everything in `CHEAPER-AGENT SUITABLE` | Mechanical |
| **DEFER** | Angular 22 / TS 6 / NgRx 22 · unit vocabulary until **O-1** | Blocked externally or by owner |

### Recommended combinations

| Budget | Run | Why |
|---|---|---|
| **ONE agent** | **Track 1** | The only track where *not* acting risks permanent, silent user-data loss. Everything else survives a delay. |
| **THREE agents** | **Track 1 + Track 3 + Track 2** | Disjoint files (sync/storage · state design-only · chart engine). Covers the live defect, the product gate, and the expired scaffolding. |
| **FIVE agents** | + **Track 4** (investigation-scoped only, to avoid Track 1's files) + **Track 5** *(only if A's landing needs it; otherwise a cheap-agent CSS pass instead)* | Track 4 must not mutate files Track 1 owns. |

**Note on parallelism:** Tracks 1 and 4 overlap on `session-sync.service.ts` and
`workspaces.effects.ts`. At five agents, Track 4 is **investigation-only** — it may read and write
tests, but must not modify production files Track 1 owns.

---

## 4. Owner decisions that unblock the most work

| Decision | Unblocks |
|---|---|
| **O-8 branch protection** (dashboard) | Makes CI *required*, not merely running — the difference between a gate and a suggestion |
| **O-7 V2 migration policy** | Track 1 |
| **O-12 next product direction** | Track 3 and all RFC sequencing |
| **O-1 `pts` UI scope** | All unit/vocabulary work (currently fully blocked) |
| **O-10 read Max Rows once** | Converts V1's threshold from an inequality to a number |

---

## 5. What this proposal deliberately does not do

- Does **not** preserve `RFC-021..024` numbering out of inertia. RFC-021's substance is built and
  awaiting merge; sync moved from last to first; units moved from second to owner-blocked.
- Does **not** propose a large refactor. The audit's GO/NO-GO stands: **narrow, verification-first.**
- Does **not** schedule any lint rule ahead of the cleanup it would police (I1b).
- Does **not** treat "index `pointSize`" as open. It is **closed: CONFIRMED CORRECT.**
