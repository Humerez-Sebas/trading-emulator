# Trading Emulator — Engineering Evolution Audit

**Date:** 2026-08-11 · **Baseline:** `develop` @ `a2ca53b` · **Nature:** read-only investigation
**Evidence base:** 9 specialist audits + 8 addenda in this directory (~7,700 lines, all with `file:line`)
**Repo mutations by this audit:** none. This document and the reports beside it are untracked.

---

## 1. Executive Assessment

**This is not a codebase in decay. It is a codebase whose verification and routing layers have
fallen behind its own standards.**

The measurements refuse the usual tech-debt narrative. Zero explicit `any`. Zero `@ts-ignore`.
Zero commented-out code. Zero source-text tests. Zero subscription leaks. Zero wrong RxJS
higher-order operators. Zero `console.*` in production. One circular dependency in 386 files.
Zero factory selectors (D8 holds). All four gates green, plus `format:check`, `build`, and
`npm ci --dry-run`. 2,373 tests, none skipped. A token system at 1,933 `var(--…)` against 175
hex — 11:1 — with `DESIGN.md` matching `styles.css` value-for-value.

Several hypotheses this audit was commissioned to confirm were **refuted by measurement**, and
that matters as much as the findings:

| Hypothesis | Verdict |
|---|---|
| Tests assert source text | **REFUTED** — 0 occurrences in 182 spec files |
| CSS/layout assertions pass vacuously | **REFUTED** — `getComputedStyle` appears 0 times |
| Hidden `beforeEach` state is a problem | **REFUTED** — 51% of spec files use no hooks at all |
| Comments hide commented-out code | **REFUTED** — 0 |
| A broad design-token migration is needed | **REFUTED** — ~40% of px is legitimately literal |
| Dependency/security crisis | **REFUTED** — no service-role key, no secrets, clean pipeline |
| The gold sizing bug (F21-2) is an implementation defect | **REFUTED** — it satisfies owner decision D.20.6 |

What the debt actually is, reduced to three mechanisms:

**M1 — The repo violates its own §2.7.** `PHILOSOPHY.md:110` states that an architectural rule
which cannot be verified mechanically will erode silently. Of six kernel invariants, **only I4
(candle-free payloads) is genuinely encoded and tested**. I1's data-only clause is *violated*
(`chart-engine.ts:25,28` expose `chartApi`/`seriesApi`; `chart.component.ts` makes 25 direct
library calls). I2 is *violated* (5 core edits after the registry closed). I6 (state-first) does
not hold. The rule about selector resets, written at `docs/engineering/testing.md:24` since
RFC-013, is broken by **19 spec files** — the documented rule simply did not propagate.

**M2 — Verification is strong on logic, blind at boundaries.** This is proven twice in primary
evidence, not anecdote: RFC-019 Task 5 re-ran all gates green while the invariant it asserted was
*false* (`.superpowers/rfc-019/dev-log.md:567-613`), and RFC-020's M-1 records both sides well
tested with "Nothing crossed them". Today only **281 of 2,373 tests (11.9%)** dispatch a real DOM
event, **`trade-panel.component.ts` — the order-entry surface — has zero specs**, and
**CI never runs on PRs to `develop`** (`ci.yml:3-7`), which is where every RFC lands. 58
fix-follows-feature chains = 8.7% of commits.

**M3 — Routing metadata misdirects agents.** `ROADMAP.md:70` presents shipped RFC-014/015/016 as
"the next development sequence" and omits RFC-020 entirely; RFC-017/018/020 headers still read
*pending* while their code ships; `CLAUDE.md:28` routes UI work past the 603-line
`DESIGN_SYSTEM.md` that declares itself the visual source of truth; `CLAUDE.md:66-67` states a
*false* cause for the bundle warning; four docs cite a superseded ledger; and
`.claude/worktrees/` holds **152,368 files — 7 stale copies of the repo, inside the repo**, not
in `.claudeignore`, so grep returns months-old shadow docs including a deleted FastAPI backend.

**Is a deliberate engineering-evolution phase justified now? Yes — but a narrow one.** The
correct intervention is roughly 3–5% the size of a "large-scale refactor". A mass refactor here
would destroy audited confidence (§2.5) and is explicitly the wrong move.

---

## 2. Current-State Architecture Map

```
pipeline/ (Python, MT5→Parquet→R2)  ──manifest+ETag──┐
                                                     ▼
R2 ──parquet-wasm (lazy chunk)──► IndexedDB ──► NgRx state ──► RenderModel ──► ChartEngine
                                   │  CANDLES_STORE (canonical)      (vanilla TS + Capabilities)
                                   └─ SERIES_STORE  (DUPLICATE ⚠)
Supabase ──sessions/playbook/lessons (candle-free DTOs ✓)──► SessionSyncService (915 ln, 4 policies ⚠)
```

**Sound and load-bearing — do not disturb:** the Capability system, `ChartSyncBus` +
`ChartSyncRouter` (transport/routing correctly separated), the per-panel local `ChartModelMapper`
memoization (D8), `assertNoCandles`, the `layout-invariants`/`lookahead-invariants`
production-twin pattern, `fill-engine.ts`, and the Lotaje stack (0 framework/chart imports).

**Risky boundaries:** (a) `components/chart` ↔ `domain/chart` — 9 of the top 15 cross-module
co-change pairs straddle it at confidence up to 0.86; the import rule holds but the *change*
boundary does not. (b) Candle ownership — `CANDLES_STORE` and `SERIES_STORE` both durably own
candles, and `Workspace` embeds `Candle[]`, violating I3 locally even though the cloud DTO is
clean. (c) `WorkspaceMeta.trading` has **three uncoordinated writers**.

---

## 3. Technical Debt Heatmap

| Category | Severity | Prevalence | Change risk | Payoff |
|---|---|---|---|---|
| **Verification integrity** (CI on develop, branch protection, boundary tests) | **Critical** | Systemic | Low | **Very high** |
| **Executable invariants** (I1/I2/I6 unencoded) | **High** | Systemic | Low | **Very high** |
| **Units & clock authority** (`pts` ambiguity, 11 UTC-assuming formatters) | **High** | Repeated | Medium | High |
| **Docs routing/status** (ROADMAP, RFC headers, worktrees) | **High** | Systemic | Trivial | **Very high** |
| **State ownership** (candle authority, 3 trading writers) | **High** | Local→systemic | High | High (unblocks NSYM) |
| **Test boundary coverage** (TradePanel zero, 19 selector leaks) | **High** | Repeated | Low | High |
| **Dependency currency** (6 prod CVEs, Angular 22 horizon) | **High** | Local | Low | High |
| Comment/process narration | Medium | Repeated | Trivial | Medium |
| Styling light-theme defects | Medium | Local (6 files) | Low | Medium |
| Complexity (`doSwitch`, SessionSync) | Medium | Local | Medium | Medium |
| TS strictness (`noUncheckedIndexedAccess` 883) | Medium | Systemic | Medium | Medium |
| Accessibility (`ui-menu` role/keyboard) | Medium | Local→propagating | Low | Medium |
| Angular change detection (33/61 no OnPush) | Low-Med | Repeated | Low | Low |
| Dead code (30 dead exports, 61 over-exported) | Low | Repeated | Trivial | Low |
| RxJS / immutability / naming / architecture purity | **Low — healthy** | — | — | — |

---

## 4. Findings

Full TD-blocks with evidence live in the nine reports + eight `-v2` addenda in this directory.
The consolidated top tier:

| ID | Finding | Sev | Evidence |
|---|---|---|---|
| **TD-A1** | CI never runs on PRs to `develop`; 58 branches unprotected incl. `main`→prod | Critical | `ci.yml:3-7`; PRs #51/#56 rollups show only Vercel |
| **TD-A2** | I1 data-only clause violated via raw handles | High | `chart-engine.ts:25,28`; 25 direct calls in `chart.component.ts` |
| **TD-A3** | Effect **declaration order** is load-bearing for money | High | `trading.effects.ts:21,64-67` — reorder silently changes fills, gates stay green |
| **TD-A4** | Two durable candle owners; `Workspace` embeds `Candle[]` | High | `workspaces.models.ts:13-20`; `workspace-db.service.ts:154-181` vs `indexed-db.repository.ts:73-94` |
| **TD-A5** | Three uncoordinated writers to `WorkspaceMeta.trading` | High | `workspaces.effects.ts:198-235`; `session-sync.service.ts:540-546`, `:511-521` |
| **TD-A6** | `pts` label denotes quantities differing 100× across surfaces | High | `sizing-view-model.ts:76-79,110-119` vs `trade-panel.component.ts:87-92` |
| **TD-A7** | TradePanel (order entry) has **zero specs**; 11.9% DOM crossing | High | `components/trade-panel/trade-panel.component.ts` |
| **TD-A8** | 19 spec files leak forced selectors under `isolate:false` | High | 48 override files, 19 missing `resetSelectors`; rule at `testing.md:24` |
| **TD-A9** | RFC/ROADMAP status metadata misstates what is shipped | High | `ROADMAP.md:70`; `rfcs/017,018,020:5` |
| **TD-A10** | 152,368-file shadow worktrees are greppable and stale | High | `.claude/worktrees/`, absent from `.claudeignore` |
| **TD-A11** | Session pull assumes completeness; absence = deletion | High latent | `session-sync.service.ts:57-64` (no `.range()`/count); `session-sync.mapping.ts:307-343` |
| **TD-A12** | Light theme broken in P&L + replay transport | High | `trade-panel.component.css:233,238,243`; `playback-controller.component.css:78,150…` |
| **TD-A13** | 6 production CVEs (Angular ≤21.2.18) | High | `npm audit --omit=dev` |
| **TD-A14** | 11 surfaces format broker-clock epochs as UTC | Medium-High | `journal-read.models.ts:368` (09:30 NY → 16:00 bucket); `session.service.ts:107` |
| **TD-A15** | `ui-menu` declares `role="menu"` with escape-only keyboard | Medium-High | `menu.component.ts:18,47` — propagates to adopters |

### ⚠ Two corrections to earlier reporting in this run

**F21-2 is NOT an implementation bug.** My interim report to the owner said the gold sizing was
"confirmed with numbers" as a defect. That was wrong, and the correction is important.
Owner decision **D.20.6** (`.superpowers/rfc-020/dev-log.md:2564-2569`) defines every non-FX
displayed `pt` as one whole price unit and pins XAUUSD `$10,000`/1%: `5→0.20`, `10→0.10`,
`20→0.05` lots. `sizing-view-model.spec.ts:67-115` pins exactly those values, and the code
satisfies them. Under §5.7 (pre-existing specs are authority) and §3.1 (user direction wins),
**these tests must not be "fixed"**. The real defect is narrower and still High: the *same label*
`pts` means 300 price units in Lotaje and 300 broker points (= 3 price units) in TradePanel. A
trader copying a stop between screens gets 0.01 vs 0.33 lots and both screens look correct.
The fix is **vocabulary + a cross-surface test, not arithmetic**.

**The index `pointSize` finding is REFUTED — resolved 2026-08-11 by Agent B (`CONFIRMED CORRECT`).**
The audit observed `execution-costs.ts:76` returning `pointSize = 1` for indices while the
generated registry says `0.01`, and inferred a 100× spread inflation. **That inference was wrong.**
`spreadPoints` and `pointSize` are a **matched pair**; only their *product* reaches a fill. The
audit compared one factor and never computed the product. Measured on a NAS100 round trip
($10,000 / 1% / 1.00 lot): as shipped, friction is **3.00% of risk** — in line with the two
undisputed presets (EURUSD 3.18%, XAUUSD 7.00%). Under the proposed "fix" it collapses to
**0.04%**, i.e. 75–175× lighter than its own siblings — effectively frictionless backtesting on
3 of the 4 instruments that have R2 data. The behavior is additionally pinned by pre-existing
`execution-costs.spec.ts:56-60` (§5.7 authority).
**The real defect is the NAME and its doc comment**, not the value: `ExecutionCosts.pointSize` is
documented as "the session's resolved minimum price increment", which is false for indices. That
sentence is precisely what generated the false positive. Fix = rename to `costQuoteUnit` + correct
the doc (owner decision O-3; it is a persisted type, so it needs a migration).

**Lesson worth adding to `anti-patterns.md`:** *when a value is only ever consumed as one factor
of a product, it has no correctness independent of its partner — audit the product.* Two
same-named fields in two domains, one broker-authoritative and one a hand-authored convention,
will eventually be "reconciled" by someone who does not know they differ, with every gate green
throughout.

**Also corrected: Lotaje and TradePanel do NOT disagree on lot size.** The audit (and this
report's earlier draft) claimed a 100× computational divergence. In fact
`trade-panel.component.ts:71-77` sizes from an entry/SL **price pair** and never divides by a
point size (`slPoints` is display-only); same at `chart.component.ts:1071`. **The 100× hazard is
human transcription between screens, not computation.** The `pts` label ambiguity remains real
and High.

---

## 5. Anti-Patterns Worth Eliminating

| Pattern | Replace with |
|---|---|
| SDD process nouns in production comments (`FINAL-AUDIT`, `Wave N`, `brief §`) | Mechanism-only comments; history in the RFC ledger |
| Comments citing gitignored artifacts (`companion-window.ts:17`) | Tracked references or nothing |
| Documented-but-unenforced invariants | Invariant + its detector, shipped together (§2.7) |
| One test per changed *module* | One test per changed *boundary* |
| Invariant helpers validated only positively | Positive **and** the historical defect as a negative probe |
| Identical UI labels with different divisors | Explicit unit vocabulary + cross-surface test |
| Stored epochs formatted as UTC ad hoc | Route through `toDisplayTime` with declared clock authority |
| Absence-means-delete over an unpaginated query | Pagination + exact count + tombstones |
| Plans/RFCs without a status banner | `CURRENT / HISTORICAL / SUPERSEDED / REMOVED` in the first 3 lines |
| `void promise` as rejection handling | Explicit rejection handler routed to diagnostics |

---

## 6. Practices We Should NOT Adopt

Each rejected on repository evidence, not taste:

1. **Branded/nominal types for symbol, price, lots.** Once the divisor is consolidated, six
   conversion sites funnel through one function. Nominal typing would add ceremony to a
   *solved* problem.
2. **A broad design-token migration.** ~40% of px is geometry and hairline borders where the
   literal is clearer. Tokenizing it would be actively harmful. Fix ~6 files instead.
3. **`AGENTS.md` at the root.** There are already three indexes and the problem is that they
   disagree. A fourth would rot first. `decision-frameworks.md §9` forbids speculative tooling.
4. **The full `recommendedTypeChecked` ESLint preset.** Measured: **2,392 errors**. The single
   rule that matters (`no-floating-promises`, `ignoreVoid:false`) yields **23**.
5. **Splitting large files by line count.** `handleMouseDown` (115 ln, 32 branches) is a hit-test
   priority chain where *the order is the logic*; `fill-engine.processCandle` and
   `TradingCapability.render` are ordered algorithms. Splitting them destroys auditability.
6. **Replacing RxJS with Signals.** 12 subscriptions, 0 leaks, 0 wrong operators. Nothing to fix.
7. **A generic repository/sync framework.** SessionSync should be split *by entity policy*, not
   abstracted behind a generic port — that would transfer destructive session semantics onto
   durable knowledge entities.
8. **Merging the IndexedDB databases.** Separate DBs are correct; only the *adapter boilerplate*
   is duplicated.
9. **A repo-wide non-null-assertion or `noUncheckedIndexedAccess` sweep now.** 883 spec
   diagnostics. It would drown the boundary fixes that actually matter.
10. **Angular 22 today.** See §9.

---

## 7. Proposed Engineering Conventions (small enough to remember)

1. **Every invariant ships with its detector.** No new architectural rule without a lint rule,
   type constraint, or executable probe.
2. **Every changed boundary gets one test that crosses it** — DOM for UI, cross-surface for units,
   round-trip for persistence.
3. **Specs never call `component.<signal>.set()`;** drive through the DOM. Reference exemplar:
   `lotaje-view.spec.ts`.
4. **`overrideSelector` ⇒ `resetSelectors` in the same file.**
5. **Process history lives in the ledger; source comments explain mechanism only.**
6. **Every doc/RFC/plan declares status in its first three lines.**
7. **Units and clocks are named at UI boundaries** — never a bare `pts`, never a bare `time`.
8. **One durable owner per datum**, named in the RFC that introduces it.

---

## 8. Engineering Vault — fix the index, don't build a new one

`docs/engineering/` (1,273 lines, 2.6% of the corpus) is **already the vault and it is good**.
Plans + specs + ledgers are 76% of the corpus and dominate search results — that is the real
problem. Recommendation: **no new directory system.** Instead:

- Add status banners to `docs/superpowers/**` (5 largest plans have 0/5).
- Add 4 missing entries to `anti-patterns.md` (16 today): units at UI boundaries, clock
  authority, boundary-crossing verification, hydration/single-ownership. Evidence that this
  works: cluster C7 **stopped recurring** once codified; the four uncodified families keep
  being rediscovered.
- Fix `CLAUDE.md` rows (DESIGN_SYSTEM, ledger path, `python`→`py`, bundle rationale) and
  `ROADMAP.md` status. ~10 lines of edits repair the whole routing layer.
- `git worktree prune` + add `.claude/worktrees/` to `.claudeignore`.

---

## 9. Angular 21 → 22: **NO-GO now.** Three hard blockers.

Verified against the npm registry and Angular's live docs via context7:

| Constraint | Required by Angular 22.1.1 | Repo today | Status |
|---|---|---|---|
| **NgRx** | 22.x to match | `@ngrx/store` **latest = 21.1.1**; 22 is **`22.0.0-rc.0`** | 🔴 **not GA** |
| **TypeScript** | **`>=6.0 <6.1`** | `~5.9.2` (5.9.3 installed) | 🔴 major upgrade |
| **Node** | `^22.22.3 \|\| ^24.15.0 \|\| >=26` | local **v22.13.0** | 🔴 below floor |
| RxJS | `^7.4.0` | `~7.8.0` | ✅ |
| angular-eslint | 22.1.0 published | 21.4.0 | ✅ available |
| `@angular/animations` | deprecated since 20.2 | **0 usages** | ✅ non-issue |

`@ngrx/store` and `@ngrx/effects` are core to this application; shipping an RC into a system that
executes simulated trades is not justified. And Angular 22 drags **TypeScript 6** with it, which
independently forces `typescript-eslint` and the whole strictness backlog to move at the same
time. Three concurrent major upgrades on a repo where **CI does not run on `develop`** and the
money-moving surface has **zero DOM tests** is the wrong order of operations.

**Recommended path**
1. **Now:** `21.2.19` (the `v21-lts` tag). Already permitted by the existing `^21.2.0` range —
   only the lockfile is stale. Zero breaking changes. Closes all 6 production CVEs.
2. **Prerequisite:** CI on `develop` + branch protection + TradePanel DOM specs. The upgrade
   needs a net beneath it.
3. **Trigger to revisit:** `@ngrx/store@22` reaches `latest`. Then do Node → TypeScript 6 →
   Angular 22 as one deliberate RFC, via `ng update` (one major at a time, per Angular's policy).

---

## 10. `npm audit` / `npm install`: getting to clean

**Measured now:** 25 vulnerabilities (1 critical, 17 high, 4 moderate, 3 low).
**Measured production surface (`npm audit --omit=dev`): 6 high — all Angular, all fixed by 21.2.19.**

The other 19 are **build-toolchain devDependencies that never reach the browser**: `esbuild`,
`vite`, `postcss`, `tar`, `undici`, `piscina`, `brace-expansion`, `nanoid`, `ip-address`,
`fast-uri`, `immutable`, `body-parser`, `@babel/core`, and `hono`/`@hono/node-server`/
`@modelcontextprotocol/sdk` (pulled in by `@angular/cli`'s MCP server feature).

**Plan**
1. `npm update @angular/…` → **21.2.19** within the existing caret. Kills the 6 production highs.
2. **Never run `npm audit fix --force` here.** It reports it would install `@angular/cli@21.0.4`
   — a **downgrade** from 21.2.14. That is a trap, not a fix.
3. Refresh the toolchain (`@angular/build`, `@angular/cli`) to the newest 21.x, which carries
   patched `esbuild`/`vite`/`piscina` transitively.
4. For dev advisories Angular hasn't yet bumped, use npm **`overrides`** to pin patched
   transitives (`tar`, `undici`, `brace-expansion`, `nanoid`) — the correct tool for
   transitive-only debt, no upstream wait.
5. **Change the gate, not the suppression.** CI currently double-suppresses (`|| true` **and**
   `continue-on-error`) with a rationale that is now false. Replace with a real blocking gate on
   what ships: `npm audit --omit=dev --audit-level=high`, plus an informational full audit.
6. **Re-run `npm ci --dry-run` before committing any lockfile** (npm 11.x optional-dep prune trap;
   currently clean).

**Expected end state:** production audit clean at zero; dev advisories explicitly governed and
visible rather than silently swallowed.

---

## 11. Evolution Program

| Phase | Objective | Includes | Excludes | Risk |
|---|---|---|---|---|
| **E0 — Safety net** | Make regressions detectable | CI on develop PRs; branch protection; `npm audit --omit=dev` gate; Angular 21.2.19; canonical `npm run verify` script | Any refactor | Trivial |
| **E1 — Routing repair** | Stop misdirecting agents | CLAUDE.md rows; ROADMAP; RFC/plan status banners; worktree prune + `.claudeignore`; `file:///C:/` links; 4 anti-pattern entries | New doc systems; AGENTS.md | Trivial |
| **E2 — Executable invariants** | Apply §2.7 | `no-restricted-imports` for I1 & spec-utils (**both verified zero-backlog**); `require-reset-selectors` + fix 19 files; `no-floating-promises` (23 sites) | Typed-lint preset; strictness sweep | Low |
| **E3 — Boundary verification** | Close the M2 gap | TradePanel DOM specs; `crear-sesion` off `.set()`; cross-surface units test; boundary-test convention | E2E framework adoption | Low |
| **E4 — Units & clocks** | One divisor, one clock | `pts` vocabulary; `pointSizeFor()` consolidation (absence ⇒ `null`, disable input); route 11 UTC formatters; fix `Candle.time` doc lie; **adjudicate index `pointSize`** | Branded types; money-as-integers | Medium |
| **E5 — Ownership** | One owner per datum | Single candle authority; one writer for `WorkspaceMeta.trading`; sync pagination + tombstones; `doSwitch` IO/pure split; SessionSync split by policy | Generic repository framework | High |
| **E6 — Surface polish** | Opportunistic | Light-theme fixes; `ui-menu` keyboard; overlay consolidation; calculadora CSS budget; dead exports; comment cleanup | Broad token migration | Low |
| **E7 — Platform** | Only after E0–E3 | Node → TS 6 → Angular 22 → NgRx 22, gated on NgRx GA | — | Medium |

---

## 12. RFC Recommendations

**RFC-021 — Executable Invariants & Verification Integrity** *(E0+E1+E2+E3)*
Problem: six invariants documented, one enforced; CI absent on the branch every RFC targets;
verification proven blind at boundaries twice. Why an RFC: it changes how *every* future RFC is
validated. Risk: low — both import rules measured **zero-backlog**. Afterward: parallel Capability
work becomes safe because violations fail mechanically instead of at review.

**RFC-022 — Unit & Clock Authority** *(E4)*
Problem: one label with two divisors; 11 surfaces assuming UTC over broker-clock epochs; a false
doc comment on `Candle.time`. Why an RFC: touches money and requires a product wording decision
plus explicit D.20.6 handling. Depends on RFC-021 (needs the cross-surface test convention).

**RFC-023 — Candle Authority & Symbol-Keyed Runtime** *(E5, the `[NSYM]` prerequisite)*
Problem: two durable candle owners; `Workspace` embeds `Candle[]`; runtime state keys by
timeframe only (`market.reducer.ts:6-18`), so F19-2 lets a foreign-symbol panel render the primary
symbol's candles. Why an RFC: high blast radius across storage, state, replay and TradingBook
cardinality. **This is the gate for multi-symbol.** Depends on 021 + 022.

**RFC-024 — Trading Metadata & Sync Protocol Ownership**
Problem: three uncoordinated writers; unpaginated pull where absence means deletion. Can merge
into 023 if scheduling favors it.

**Not RFCs — plain cleanup:** doc status banners, worktree prune, `file:///` links, light-theme
CSS, calculadora budget, `selectTradeChartView` removal, dead exports, telemetry `void` rejection,
ETag guard, `getMountedWindow`.

---

## 13. Ordering Against Future Product RFCs

**MUST happen before the next product RFC wave**
- CI on `develop` + branch protection (otherwise every new RFC merges unverified)
- I1/spec-util lint + the 19 selector resets (parallel branches will compose invalidly otherwise)
- ROADMAP/RFC status repair (there is currently **no documented plan beyond RFC-016** — the next
  wave cannot be sequenced from the repo as it stands)
- TradePanel DOM coverage — before any RFC touches order entry
- **Candle authority + symbol-keyed runtime — before any multi-symbol feature**

**SHOULD happen soon:** units/clock work; `doSwitch` and SessionSync seams; typed
`no-floating-promises`; Angular 21.2.19 + audit gate.

**Opportunistic:** comments, dead exports, styling, OnPush, `models.ts` split, strictness.

---

## 14. Self-Review / Red Team

- *Preference mistaken for debt?* Actively guarded — seven hypotheses were refuted and recorded,
  including two of my own.
- *Abstractions without repetition?* Only two primitives recommended (overlay engine at 8 impls;
  roving focus). IDB adapters flagged as boilerplate, not merged.
- *Moving complexity instead of removing it?* E5 removes a duplicate owner; it does not relocate one.
- *Tokenizing where literals are clearer?* Explicitly rejected for ~40% of px.
- *Long file ≠ bad file?* Nine files carry explicit **KEEP** verdicts.
- *Optimizing for agents over humans?* The routing fixes help both; no human-hostile structure added.
- *Could a smaller intervention get 80%?* **Yes — and it is recommended.** E0+E1+E2 is a few days
  and captures most of the value. E5 is the only genuinely large item, and it is deferred until
  multi-symbol actually demands it.
- *Am I over-trusting subagents?* One reversed my own reported finding (F21-2) and I adopted the
  correction; one open item (index `pointSize`) is explicitly marked unadjudicated rather than
  asserted.

---

## A. GO / NO-GO

**GO — for a narrow, verification-first evolution. NO-GO for a large-scale refactor.**

The architecture is sound; the *guarantees* are not. Roughly 80% of the value sits in E0–E3,
which touch almost no production logic. Pausing product RFCs for a long refactor would burn the
audited confidence §2.5 warns about while fixing problems the measurements say do not exist.
But shipping the next RFC wave onto a branch with no CI, unencoded invariants, and an untested
order-entry surface would manufacture debt faster than any refactor could clear it.

## B. Top 10 Highest-Leverage Changes

1. Run CI on PRs to `develop`; protect `main` and `develop`.
2. Angular → **21.2.19** (zero breaking changes; closes all 6 production CVEs) and make
   `npm audit --omit=dev --audit-level=high` a real gate.
3. Ship the two zero-backlog `no-restricted-imports` rules (I1 + spec-util/vitest).
4. Spec `trade-panel` through the DOM; convert `crear-sesion` off `.set()`.
5. `require-reset-selectors` lint + fix the 19 leaking spec files.
6. Repair routing metadata: CLAUDE.md rows, ROADMAP, RFC/plan status banners.
7. `git worktree prune` + `.claude/worktrees/` in `.claudeignore` (152,368 misleading files).
8. Disambiguate `pts` vocabulary + cross-surface conversion test; **adjudicate the index
   `pointSize` question**.
9. Give `WorkspaceMeta.trading` one writer; paginate the session pull with tombstones.
10. Decide single candle authority — the gate for multi-symbol.

## C. Recommended RFC Sequence

```
RFC-021 Executable Invariants & Verification Integrity   (no dependencies)
   └─► RFC-022 Unit & Clock Authority
          └─► RFC-023 Candle Authority & Symbol-Keyed Runtime   [gate for multi-symbol]
                 └─► RFC-024 Trading Metadata & Sync Ownership  (mergeable into 023)
                        └─► product wave: multi-symbol panels, drawing modifiers,
                                          new Capabilities, per-symbol drawings
                        └─► platform: Node → TS 6 → Angular 22 (gated on NgRx 22 GA)
```

## D. Definition of "Evolved Emulator"

- Every kernel invariant has a detector; violating one fails a gate, not a review.
- No PR reaches `develop` without type, test, lint and build evidence.
- Every changed boundary has a test that crosses it; order entry is DOM-tested.
- One divisor per instrument, one declared clock authority, no label meaning two things.
- One durable owner per datum; multi-symbol is a configuration change, not an archaeology project.
- Every doc states whether it is current, and `ROADMAP.md` describes the actual future.
- `npm audit --omit=dev` is zero, and dev advisories are governed rather than suppressed.
- A fresh agent reads ~600 lines and can safely change code — §6.3 satisfied in practice, not aspiration.
