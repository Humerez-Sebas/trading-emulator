# Engineering Evolution Audit — Master Resume Index

**Run started:** 2026-08-10
**Status:** SPECIALIST CHECKPOINTS COMPLETE — final synthesis intentionally not written
**Deliverable:** `TRADING_EMULATOR_ENGINEERING_EVOLUTION_AUDIT.md` (NOT yet written; nothing committed)

> Read this file first. It is the single entry point for resuming this audit from a cold
> session with zero conversation history.

---

## 0. Baseline (verified at run start)

| | |
|---|---|
| Branch | `develop` |
| HEAD | `a2ca53b` — *Merge PR #56 (backmerge main→develop)* |
| Sync | local `develop` == `origin/develop` (fast-forwarded 101 commits at run start) |
| Working tree | source tree clean; only `?? .superpowers/audit-2026-08-10/` untracked; `.superpowers/rfc-020/` is tracked at HEAD |
| Repo mutations by this run | **NONE.** The audit is strictly read-only. The only writes are files in this directory. |

`.superpowers/audit-2026-08-10/` is **untracked** (verified: `git check-ignore` reports not-ignored,
so files appear as untracked). This matches the repo convention in `CLAUDE.md`: *"SDD run artifacts
live in `.superpowers/` (only `progress.md` is tracked)"*. Do not commit this directory without
the owner's explicit instruction.

---

## 1. Mission (restated in full, for a cold reader)

Act as Principal Engineer / Architect. Conduct a deep technical-debt and architecture-drift
investigation of the trading-emulator repo to decide whether a deliberate **engineering-evolution
phase** should precede the next wave of product RFCs (RFC-021+).

**Constraints that bind the whole run:**
- INVESTIGATE ONLY. No mass refactor, no dependency upgrades, no repo-wide formatting, no file moves,
  no architecture changes, no deleting tests. Temporary analysis scripts must live outside the repo.
- Every recommendation needs repository evidence (`path/to/file.ts:line`). Counts generated
  mechanically. Separate MEASURED FACT / INTERPRETATION / RECOMMENDATION.
- Do not mistake preference for debt. Do not abstract without ≥3 real repetitions. Do not tokenize
  literals that are clearer literal. A long coherent file is not automatically a bad file.
- Challenge the owner's own proposed changes where repo evidence contradicts them.

**Required final structure** (from the owner's brief): Executive Assessment · Current-State
Architecture Map · Debt Heatmap · TD-findings · Anti-patterns table · Practices NOT to adopt ·
Proposed conventions · Engineering Vault proposal · Target codebase before/after · Evolution
program (phased) · RFC recommendations · Ordering vs future product RFCs · Priority model ·
Expected final state · Self-review/red-team · then four closing sections: **A. GO/NO-GO**,
**B. TOP 10 HIGHEST-LEVERAGE CHANGES**, **C. RECOMMENDED RFC SEQUENCE**, **D. DEFINITION OF
"EVOLVED EMULATOR"**.

---

## 2. Specialist audits — status board

Nine parallel Opus subagents. Each writes its full report into THIS directory.
Agent conversational context does **not** survive a session reset; the report files do.

| # | Report file | Scope | Status |
|---|---|---|---|
| 1 | `audit-comments-docs-agents.md` | Comment classification, docs source-of-truth, contradictions, agent-context cost, logging/debug | **COMPLETE — see `audit-comments-docs-agents-v2.md`** |
| 2 | `audit-styling-ui-a11y.md` | Token census, hardcoded-value classification, primitive drift, motion-owns-correctness, a11y | **COMPLETE — see `audit-styling-ui-a11y-v2.md`** |
| 3 | `audit-tests.md` | Source-text tests, vacuous tests, DOM-crossing ratio, hooks, pyramid vs high-risk domains | **COMPLETE — see `audit-tests-v2.md`** |
| 4 | `audit-types-domain-units.md` | Type smells, silent domain fallbacks, s/ms + timezone, magic values | **COMPLETE (39 KB)** |
| 5 | `audit-angular-ngrx-rxjs.md` | Invariants I1–I6, state ownership, operator semantics, accidental frameworks | **COMPLETE — see `audit-angular-ngrx-rxjs-v2.md`** |
| 6 | `audit-complexity-boundaries.md` | Largest functions, circular deps, unused exports, misleading names, duplication | **COMPLETE — see `audit-complexity-boundaries-v2.md`** |
| 7 | `audit-perf-lifecycle-persistence.md` | Replay hot path, leak ledger, silent-incorrect failure paths, IndexedDB migrations | **COMPLETE — see `audit-perf-lifecycle-persistence-v2.md`** |
| 8 | `audit-tooling-ci-deps-security.md` | Strictness-flag error counts, raw gates, CI + branch protection, enforceable invariants | **COMPLETE — see `audit-tooling-ci-deps-security-v2.md`** |
| 9 | `audit-churn-shotgun-history.md` | Churn×complexity, co-change coupling, cost-to-add-an-asset, defect clusters | **COMPLETE — see `audit-churn-shotgun-history-v2.md`** |

Each report ends with a `## RESUME BRIEF` — a self-contained prompt that can be pasted into a fresh
agent to continue that specialist's remaining scope with no conversation history.

**To resume the whole run:** all nine specialist threads are complete. Read each original report plus
its `-v2` addendum (Agent 4 has no addendum), then synthesize the final report. Do not re-run the
banked measurements or baseline gates.

---

## 3. Findings already banked

### 3.1 Self-verified by the lead (not from a subagent)

**F-LEAD-1 — `ROADMAP.md` is materially stale, and it is the FIRST doc agents are told to read.
Severity: High.**
`CLAUDE.md:19` routes *any architectural change* to `docs/architecture/ROADMAP.md`. That file's
`:70` heading reads **"Mastery Block: Phases 0-3 (the next development sequence)"** and lists
RFC-014/015/016 as upcoming. All three are shipped — `emulador/src/app/state/playbook/`,
`state/lessons/`, `state/journal/`, `pages/reflection/`, `pages/journal/` all exist
(merges `e700ecb`, `ab3a8e5` PR #40, `1db11b6` PR #41). Additionally
`docs/architecture/rfcs/020-lotaje-position-sizer.md` exists and is merged (`b8d220f`, PR #54)
but appears in **no** ROADMAP table. A fresh agent following the prescribed context-loading path
concludes three completed subsystems are future work and never learns RFC-020 exists.
*Consequence for this audit:* there is **no documented forward plan beyond RFC-016**, so the
"upcoming RFC wave" this debt must be ordered against is currently undefined in the repo. This is
itself a finding — sequencing recommendations must be derived from the North Star
(`TRADER_KNOWLEDGE_MODEL.md`) rather than read off a roadmap.

**F-LEAD-2 — Framing thesis.** `docs/engineering/PHILOSOPHY.md` is unusually strong and already
contains the principles most audits must argue for from scratch:
- §2.7 *"Los invariantes deben ser ejecutables"* — an architectural rule that cannot be verified
  mechanically will erode silently; each invariant must ship with its detector.
- §2.8 *"La complejidad paga alquiler"* — every abstraction must name the defect it prevents.
- §6.3 — a competent agent cloning the repo tomorrow, with no historical conversation, must be able
  to work at the level of the engineer who left.
The likely thesis of the final report is therefore that this repo's debt is **under-application of
its own stated principles**, not an absence of principles. Argue the evolution from PHILOSOPHY,
not from imported best practice. (Raw metrics: 390 TS files, 33,529 non-spec LOC, 43,337 spec LOC,
182 spec files, 30 HTML, 31 CSS/SCSS at 5,732 lines, 6,602 comment lines in non-spec TS, exactly
1 TODO marker repo-wide at `emulador/src/app/domain/chart/chart-engine.ts:24`.)

### 3.2 Specialist #4 — Types / Domain / Units (COMPLETE + v2 correction)

Full evidence: `audit-types-domain-units.md`. Headline:

> **No type-annotation debt. Serious UNIT debt.** Zero explicit `any`, zero `@ts-ignore`, zero
> `any[]`, zero `Function`/`{}`. But there are **four incompatible definitions of "one point"** and
> **two incompatible definitions of "the clock a stored timestamp is in."**

- **V2 CORRECTION — the original F21-2 characterization missed the later owner decision.** D.20.6
  (`.superpowers/rfc-020/dev-log.md:2564-2569`) explicitly defines Lotaje non-FX `pts` as whole
  price units and pins XAUUSD `5/10/20 pts` to `0.20/0.10/0.05` lots. Current code and specs satisfy
  those pins. A Lotaje `300 pts -> 0.33 lots` expectation is incompatible with D.20.6 because 300
  displayed pts means 300.00 price units there. **The remaining HIGH concern is semantic:**
  TradePanel uses the same `pts` label for broker points (`pointSize=0.01`), so the two surfaces'
  units differ by 100× for gold. Do not change arithmetic without explicitly revoking D.20.6;
  disambiguate the labels/conversion first. Full reconciliation: `audit-churn-shotgun-history-v2.md`.
- **NEW sibling defect, not previously known:** `state/trading/execution-costs.ts:76` returns
  `pointSize = 1` for indices, but the broker-generated registry says `0.01`
  (`asset-registry.generated.ts:24,33,42` — NAS100/SP500/US30). With `spreadPoints: 2`, **every
  index backtest runs with a 100× inflated spread and slippage.** `AssetSpec.pointSize` — the only
  broker-sourced value — is read by nothing.
- **24 domain-meaning-changing silent fallbacks** enumerated in three tiers in the report.
- **`Candle.time`'s doc comment is false.** `render-model.ts:3` claims "unix seconds (UTC)";
  `domain/chart/display-time.ts:4-8` establishes stored timestamps are broker server clock and
  explicitly "NOT a UTC instant". Same false claim on `drawings.models.ts:4` and six fields of
  `trading.models.ts`.
- **The display zone is applied on the chart and nowhere else.** `toDisplayTime` has 11 call sites,
  all under `components/chart|controls|toolbar-tools` + `domain/chart/capabilities`. **Eleven other
  surfaces format the stored epoch as UTC**, including `state/journal/journal-read.models.ts:368`
  where the **09:30 NY open lands in the 16:00 Time-of-Day bucket**, and `services/session.service.ts:107`
  (year bucketing → wrong parquet year at boundaries). `delete-session-dialog.component.ts:77`
  renders in browser-local — a third clock.
- **s/ms name collision:** `PendingOrder.createdAt` (`trading.models.ts:24`) is candle **seconds**;
  `SavedSession.createdAt` (`trading.models.ts:191`) is epoch **ms** — same name, same file,
  167 lines apart, only one documented.
- Its divisor recommendation remains valid for execution costs and unknown symbols, but **not for
  Lotaje's D.20.6 display conversion unless that owner decision is explicitly revoked**. It advises
  AGAINST branded/nominal types, integer-cents money, a global constants module, and one-type-per-file.

### 3.3 Specialist #3 — Test architecture (COMPLETE + v2 addenda)

Full evidence + ordered resume brief: `audit-tests.md`. **Two of the audit's own hypotheses were
REFUTED — record this so they are not re-investigated:**

- **Source-text tests: ZERO.** No `fs`/`readFileSync`/`__dirname`/`?raw`/snapshots anywhere in 182
  spec files. The brief's top-priority category is empty. *Do not look for it again.*
- **CSS-vacuity hypothesis: REFUTED.** `getComputedStyle` appears 0 times in specs. The suite does
  not assert layout it cannot compute. Only **40 of 2,369 tests (1.7%)** are weak-assertion blocks.

Measured: 2,369 `it()` blocks, **0 skipped**; 60.2% pure unit / 22.8% store+effects / 17.0% jsdom
component / **0% e2e (no Playwright or Cypress anywhere in the repo)**. Hooks are a non-issue —
**93 of 182 files (51%) use no hooks at all**; the explicit-factory convention is largely already
the house style.

**The real test debt is a boundary gap, not a structure problem:**
- Only **281 of 2,369 tests (11.9%)** dispatch a real DOM event; 19 of 44 component-shaped specs
  (43%) cross the boundary at all.
- 🔴 `components/trade-panel/trade-panel.component.ts` (283 lines) — **zero specs. Order entry, the
  money-moving surface, is entirely untested.** Single largest exposure in the repo.
- 🔴 `pages/crear-sesion/crear-sesion-page.component.spec.ts:198-340` — 14 direct
  `component.X.set()` calls: **the calculadora-bug pattern verbatim**, still live.
- 🔴 `pages/sesiones/sesiones-page.component.spec.ts` — 1,778 lines, 83 tests, **0 DOM, 148
  `vi.fn()`**; drag-drop and `.session.json` import tested via `as unknown as DragEvent` casts.
- 🔴 **19 spec files violate the repo's OWN written rule** at `docs/engineering/testing.md:24`
  (`overrideSelector` without `resetSelectors`) — including `selectors.spec.ts`, itself the victim
  of the documented "120.5 instead of 50" incident. A rule written down since RFC-013 that still
  does not hold — direct evidence for the PHILOSOPHY §2.7 thesis in F-LEAD-2.
- `chart.component.ts` (1,694 ln, largest file in repo) has 3 narrow guard specs; `date-picker`
  (347), `custom-color-picker` (417), `modal`, `segmented-control`, `interactive-candles` — all zero.
- `src/app/lotaje/**` is **outside `coverageInclude`** — D.20.6's sizing path is not measured by the
  configured threshold even though its direct specs are strong.
- Original chart-sync inventory omitted router and viewport integration specs; V2 upgrades the
  domain to HIGH-confidence protected while reserving `[NSYM]` policy tests for its RFC.

**Must NOT be touched (house exemplars):** `assertNoCandles`; the `layout-invariants` /
`lookahead-invariants` production-twin + spec-util pattern; `lotaje-view.spec.ts` (61 real events,
fresh document realms) — cite this file as the reference in `testing.md`.

Its top 3: (1) spec `trade-panel` through the DOM and convert `crear-sesion` off `.set()`;
(2) ESLint `require-reset-selectors` + fix the 19 files; (3) ESLint ban on
`component.<signal>.set(` inside `*.component.spec.ts`.

**V2:** all four `lightweight-charts` mocks comply with the cold-cache mitigation, so original F-05
is closed. Chart sync, telemetry and IndexedDB are upgraded to HIGH-confidence protected after
assertion-level reads. The 19 selector leaks are confirmed to mutate module-level selector objects.
D.20.6 gold tests are authoritative, not characterization of a known implementation bug.

### 3.4 Specialist #6 — Complexity / Boundaries (COMPLETE + v2 addenda)

Full evidence + pasted analysis scripts: `audit-complexity-boundaries.md`.

Measured: 386 `.ts` / 33,562 non-spec LOC · **exactly 1 circular dependency** · **92 unused exports**
(31 truly dead / 61 over-exported internals) · **92 spec-only exports** · deep paths `../`=367,
`../../`=564, `../../../`=3 · **no `paths` aliases in tsconfig** · 806 low-info identifiers ·
50 negated booleans.

- **TD-01 (HIGH)** `doSwitch` at `state/workspaces/workspaces.effects.ts:274` — 182 LOC / 30
  branches; three silent-catch IO calls (`:305-329`) fused with a pure 125-line intent→`Action[]`
  translation (`:330-455`); 9-field anonymous param type; **the ordering contract exists only in
  comments**. Clean extraction seam.
- **TD-02 (MED)** the app's only cycle: `lotaje/lotaje-view.ts:61` ⇄ `lotaje/companion-window.ts:26`,
  existing so the companion window can read a 13-variable module singleton (`lotaje-view.ts:91-109`).
- **TD-04 (MED)** `state/selectors.ts:427` `selectTradeChartView` — a selector **production
  abandoned but tests still assert on it**.
- **TD-05 (MED)** verbatim duplication of *shared contracts*: `shortDate` ×2 identical feeding the
  same string (`trading.reducer.ts:37` + `sesiones-page.component.ts:748`); `FIB_LEVELS` ×2;
  epoch→ISO-date ×4; **two divergent price formatters for the same instrument**
  (`chart.component.ts:909` vs `waypoint-timeline.component.ts:276`).
- **TD-06 (MED)** 5 hand-rolled IndexedDB adapters; `lessons-db`/`playbook-db` `open()`+`tx()` are
  byte-identical; `onversionchange` release logic copied ×4.
- **TD-03 (LOW)** `components/ui/index.ts` — 24 of 25 re-exports dead, 1 real consumer; everyone
  deep-imports past the barrel.
- **TD-07 (INFO) — explicit KEEP verdicts, recorded so a later reader does not "fix" them:**
  `chart.component.ts:1440` `handleMouseDown` (115 LOC, 32 branches) is a hit-test priority chain
  where *the order is the logic*; `chart.component.ts:558` `onKeyDown` (depth 6) is commented, gated
  focus routing. Long ≠ bad.

**Non-issues explicitly ruled out — do not re-chase:** deep relative paths, adjective-form booleans,
high-arity NgRx projectors, separate IDB *databases*, `environment.prod.ts`, `syncPriceScale`.

**V2:** domain framework imports = 0; state→UI imports = 1 (`journal-read.models.ts:8`); seven
component→service import lines are legitimate workflow orchestration and do not justify a blanket
ban. `SessionSyncService` is the real split candidate (four entity policies); mapper/fill/selectors/
telemetry stay intact. `trade-panel.invalidReason` is the short function hiding the testable matrix.

### 3.5 Specialist #8 — Tooling / CI / Deps / Security (COMPLETE + v2 addenda)

Full evidence incl. raw gate output: `audit-tooling-ci-deps-security.md`.

**Baseline is GREEN and should be stated as such in the report.** All run raw from `emulador/`:
tsc app EXIT=0 · tsc spec EXIT=0 · `ng test` EXIT=0 (**182 files / 2,373 tests**) · `npm run lint`
EXIT=0 ("All files pass linting") · `format:check` EXIT=0 · `npm run build` EXIT=0 ·
`npm ci --dry-run` EXIT=0. The "develop is lint-clean" claim **holds**; the npm-11.x lockfile trap
is **not** present.

- **F-01 (HIGH) — `CLAUDE.md` states a FALSE cause for the accepted budget warning.** Measured
  initial bundle **651.60 kB** (not 648): `@supabase/supabase-js` **219.12 kB = 33.6%**, Angular core
  181.17, router 106.67, lightweight-charts 51.64. **Arrow (216 kB) and parquet_wasm (34 kB) are
  lazy chunks contributing 0 bytes to initial** — correctly deferred at `workers/parquet.worker.ts:45,67`.
  So `CLAUDE.md:66-67`'s "Arrow/parquet-dominated" rationale is wrong; the real cause is an eager
  root `createClient` at `auth/supabase.service.ts:11`. **A stale rationale is making a fixable
  219 kB invisible** — a textbook instance of "warnings everyone ignores become invisible debt".
- **F-02 (HIGH) — zero branch protection.** GitHub MCP: **58 branches, all `protected:false`**,
  including `main` (which auto-deploys to Vercel production) and `develop`.
- **F-03 (HIGH) — CI never runs on PRs to `develop`.** `ci.yml:3-7` is `branches: [main]` only and
  is the sole workflow. Every RFC (PRs #37/#45/#46/#47/#51/#56) merged **unverified**.
- **F-04 (MED) — three diverging definitions of "the gates".** CI runs `format:check` + `build` but
  **no tsc at all**; `CLAUDE.md` lists four gates without `format:check`; `validate-ci.ps1` matches
  neither. This divergence is what produced commit `e8ccce8`.
- **F-07 (MED) — strictness costs MEASURED** (scratchpad configs extending repo config; repo
  untouched): `noUncheckedIndexedAccess` **139** · `exactOptionalPropertyTypes` **28** ·
  `noUnusedLocals` **16** · `noUnusedParameters` **3** · `noUncheckedSideEffectImports` **0 — free
  win** · `verbatimModuleSyntax` 318 (do not pursue). Baseline already strong: `strict` + 4 extras +
  all three Angular strict flags ON, no per-project weakening.
- **F-05/08/09 (MED) — enforcement gaps.** Lint is **untyped** (no `projectService`), so
  `no-floating-promises` etc. are unavailable — but `typescript-eslint` is **already a devDep**, so
  enabling costs zero new packages. Invariants 1, 5, 7 **currently hold (0 violations)** but only
  invariant 2 has any mechanism (a fail-open, agent-only Claude hook). Recommended now:
  `no-restricted-imports` for Angular/NgRx under `domain/chart/**`, and for vitest/`*.spec-util`
  outside tests — zero-dep, very low false positives. **Explicitly DECLINED** automating invariant 3
  (Market-Data/Workspace separation): it would fire on legitimate shared primitives.
- **F-10 (LOW) — security clean.** No service-role key (only expected-public anon, `role:"anon"`);
  `.env` untracked + ignored; zero `eval`/`bypassSecurityTrust*`/`DomSanitizer`; the 4 `innerHTML`
  uses are all `= ''`; **zero `console.*` in prod code**; no hand-written tokens in storage. Two
  notes: Supabase `persistSession:true` puts tokens in localStorage (standard; raises XSS stakes),
  and `npm audit` is **double-suppressed** (`|| true` AND `continue-on-error`).
- **F-11 (MED) — Windows friction, verified on this box:** `python` **is** the Store stub; `py` →
  3.13.2. Hooks correctly use `py`, but `CLAUDE.md:67`, `verify-gates.md:21`, `README.md:107` and 8
  plan files still say `python`. **No `verify`/`typecheck` script exists**, so agents hand-assemble
  `npx tsc -p …` every session. A 5-script surface is proposed in the report.

**V2 probes:** spec `noUncheckedIndexedAccess` = **883 diagnostics**, combined with exact optional =
**934**; full typed preset = **2,392 errors**, but targeted `no-floating-promises` is 4 default /
**23 with `ignoreVoid:false`**. Both architectural import-rule prototypes exit 0 with zero current
violations. PRs #51/#56 targeted develop and carried only Vercel checks, empirically confirming F-03.

### 3.6 Specialist #2 — Styling / UI / A11y (COMPLETE + v2 addenda)

Full evidence: `audit-styling-ui-a11y.md`.

**VERDICT: a broad token migration is NOT justified. A narrow theme-correctness fix IS.** The token
system is healthy — 82 tokens, one file, no Sass, `var(--…)` **1,933× vs 175 hex (11:1)**, and
`DESIGN.md` matches `styles.css` value-for-value. The problem is *containment* at ~6 components.

**px classification (760 in component CSS, bucketed by property): ~40% legitimately literal**
(geometry 166, hairline borders 138) where tokenizing would be *harmful* · ~23% mechanical 1:1 token
swaps (172) · ~23% genuine scale divergence (173) needing a **design ruling, not a codemod**.

- **TD-1 (HIGH) — hardcoded colors break the shipping, one-click light theme.**
  `trade-panel.component.css:233,238,243` hardcode P&L up/down/warning (`--up` is `#26a69a` dark but
  `#089981` light; computed contrast ≈**2.7:1**, below the 4.5:1 the design doc claims).
  `playback-controller.component.css:78,150,153,178,189,226,248,260` use `color-mix(…#fff N%…)` —
  **invisible in light mode, so the replay transport loses all state feedback.** Live path:
  `settings-panel.component.html:9-14` → `app.ts:30` sets `data-theme`.
- **TD-8 (MED) — 8 independent dropdown/menu/popover implementations**; two competing primitives
  (`ui-dropdown` 3 consumers, `ui-menu` 1), 6 bespoke, plus 2 native `<select>` that the primitive
  was written to replace (`playbook-panel.component.html:67`, `chart-panel.component.ts:49`).
  Root-cause multiplier for several other findings.
- **TD-7 (MED-HIGH) — ARIA promising keyboard behavior the app does not honor.** 13 composite ARIA
  roles but arrow-key handling in only 4 files; `ui-menu` is a *shared primitive* declaring
  `role="menu"` with escape-only keyboard (`menu.component.ts:18,47`) — the defect propagates to
  every adopter.
- **TD-4 (MED)** `calculadora-page.component.css` = **19,903 bytes minified vs a 20,000 warn limit —
  97 bytes of headroom** (next largest file is 46%). Fix the file, not the budget.
- **TD-2 (MED)** 36 `var(--x, #lit)` fallbacks gone stale — `--surface-2` has two different
  fallbacks; `--warning, #eab308` matches **neither** theme; `--duration-fast, 0.15s` vs the real 120ms.
- **TD-3 (MED)** Tailwind `zinc` palette in 6 **live** components (comments literally say
  `/* zinc-500 */`), no token counterparts, no light variants.
- **TD-6 (MED)** 31 z-index literals, no scale; the 39/40/40/41 cluster in `chart.component.ts` is
  someone resolving collisions blind.
- **TD-10 (LOW-MED)** a second spacing scale (`6px`×58, `10px`×40) rivals the documented 8px grid —
  **explicitly do NOT codemod**; extend the scale after a design ruling.

**Positives to protect (state these in the report):** motion **never** owns correctness — 0
`animationend`/`transitionend`, 0 `@angular/animations`, 2 `setTimeout`s neither CSS-coupled.
**19/19 icon-only buttons have accessible names, 0 defects** (a naive line-based grep falsely
suggests 123 — multi-line-tag artifact; do not repeat that error). `app-modal` and
`ui-primitives.css` are exemplary.

**Only two primitives genuinely deserve extraction:** an overlay/popover engine (8 divergent impls)
and a roving-focus keyboard helper. Everything else already has a correct primitive — those are
**adoption gaps, not extraction gaps.**

**V2:** panel sizing is explicit through `ChartEngine({autoSize:true})` and lightweight-charts'
internal observer; no app-level resize defect exists. Companion stylesheet cloning includes `:root`
tokens and mirrors `data-theme`, so stale `var()` fallback removal is safe. Headline scope unchanged.

### 3.7 Specialist #5 — Angular / NgRx / RxJS (COMPLETE + v2 addenda)

Full evidence: `audit-angular-ngrx-rxjs.md`. **The invariant table is the single most important
output of the whole audit** — it is the empirical test of PHILOSOPHY §2.7.

| # | Invariant | True? | Documented? | **Encoded?** | **Tested?** |
|---|---|---|---|---|---|
| I1 | engine ⟂ Angular/NgRx | **HALF** — clause 1 true (0 imports); clause 2 **VIOLATED** | yes | **no** | **no** |
| I2 | core closed / new = Capability | **NO** — 5 core edits after the registry landed | yes | no | no |
| I3 | Market ⟂ Workspace | **SPLIT:** cloud DTO holds; local aggregate/durable ownership violated | yes | partial | partial |
| I4 | candle-free payloads | **YES** | yes | yes (4 runtime asserts) | yes (6 specs) |
| I5 | no factory selectors (D8) | **YES** — 0 found app-wide | yes | partial | yes |
| I6 | state-first | **NO** | yes | no | no |

**I1's violation:** `domain/chart/chart-engine.ts:25,:28` hand out `chartApi`/`seriesApi`, and
`chart.component.ts` makes **25 direct lightweight-charts calls**. The data-only boundary is
breached in practice while the docs assert it holds. (Note this is the very thing
`chart-engine.ts:24`'s stale TODO promised to remove once RFC-004/005 capabilities existed — they
now exist.)

- **TD-3 (HIGH) — effect DECLARATION ORDER is load-bearing for money.** `state/trading/trading.effects.ts:21`
  and `:66` both `ofType(goToTime)`; the comment at `:64-67` states `endOnSchedule$` must be declared
  *after* `processFills$` or the final candle's SL/TP never fills. **A field reorder silently changes
  trading outcomes with all four gates green.** Temporal coupling encoded in nothing but source order.
- **TD-1 (HIGH) — three uncoordinated writers to one IndexedDB record:**
  `workspaces.effects.ts:198-235` (non-transactional read-modify-write),
  `session-sync.service.ts:540-546`, and `:511-521` (blanks `meta.trading` for a cloud-deleted
  session, including the open symbol, with no dispatch); `workspace-db.service.ts:144-152` `putMeta`
  is a bare `put`. Produces **both lost updates and resurrection of deleted sessions**.
- **TD-2 (HIGH)** `pages/sesiones/sesiones-page.component.ts` is an application controller: 10
  injected deps (`:219-228`), 50 methods, 3 data sources reconciled in a template-facing `computed`
  (`:278-319`); **every mutation is written twice** — dispatch for the current asset, hand-rolled
  IndexedDB for all others (`:917-948`, `:951-1006`).
- **TD-4 (MED)** `market.activeTf` ↔ `layout.panels[focused].timeframe` mirrored bidirectionally
  (`layout.effects.ts:19-45` ↔ `layout.reducer.ts:255-280`); focus changes the replay advance grain.
- **TD-9 (MED)** 33 of 61 components lack OnPush in a zone-based app (no `provideZonelessChangeDetection`).

**Counts:** 12 `.subscribe()` total with **0 leaks** (67% `takeUntilDestroyed`); **0 `shareReplay`,
0 nested subscribes, 0 wrong higher-order operators**, 3 Subjects; 19 `catchError` of which **12
silently → EMPTY**; 99 actions (86 command / 13 event) with **fully consistent naming**; 0 `| async`,
98 `selectSignal`.

**Confirmed non-issues — DO NOT re-investigate:** factory selectors, immutability / in-place
mutation (~60 hits, all cleared), subscription leaks, RxJS operator misuse, `selectors.ts` as a junk
drawer, action naming, constructor-DI.

**V2 closure:** cloud session payloads are candle-free, but local `Workspace` embeds candle series
and duplicates durable ownership across `SERIES_STORE` and `CANDLES_STORE` — the central `[NSYM]`
prerequisite. Lotaje imports neither chart nor framework code; it is a justified parallel UI/window
stack. ChartSyncBus/Router are justified. Signal outputs = 32; EventEmitter/@Output = 0.

### 3.8 Specialist #1 — Comments / Docs / Agent context (COMPLETE + v2 addenda)

Full evidence: `audit-comments-docs-agents.md`.

| Metric | Value |
|---|---|
| Non-spec TS | 206 files / 33,411 LOC / **6,535 comment lines (19.6%)** |
| Spec TS | 182 files / 43,337 LOC / 2,473 comment lines (5.7%) |
| **Commented-out code** | **0** (strict grep empty) |
| `console.*` / `debugger` / empty catch | **2 / 0 / 0** (56 catches, none empty) |
| TODO/FIXME/@deprecated | **4** |
| Comment lines citing RFC / D-number / Task / dev-log | 282 / 186 / 128 / **188** |
| Tracked markdown | **151 files, ~48,760 lines** |
| `docs/engineering/` (the "vault") | 1,273 lines = **2.6% of the doc corpus** |
| plans + specs + ledgers | 37,180 lines = **76%** |
| Barrels / generated / fixtures | **1 / 1 / 1** — structurally lean, genuinely fine |

**Bucket split across the 11 worst files (2,272 comment lines): KEEP 373 (16%) · REWRITE 866 (38%) ·
MOVE 627 (28%) · DELETE 406 (18%).** Worst: `lotaje-view.ts` 365/1723 (57-line module header),
`companion-window.ts` 149/320 (**47%**), `telemetry.effects.ts` 238/521. **`chart.component.ts` and
`sesiones-page.component.ts` are the HEALTHY pattern — leave their comments alone.**

- **F-1 (HIGH) — production code stores the SDD process.** `telemetry.effects.ts:130` opens
  `FINAL-AUDIT ATTENTION — REVIEW FIX (RFC-014 T5 review, wave 1)` and runs 65 comment lines;
  `companion-window.ts` has five "Wave 5 audit L-3/M-1" blocks in 320 LOC; `chart-engine.ts:41-43`
  ships "verified against the real class, not the plan's draft"; `companion-window.ts:17` cites
  `.superpowers/rfc-020/spike-s1-report.md` — **gitignored, absent from any clean clone.**
- **F-3 (HIGH) — `CLAUDE.md`'s UI context row is wrong.** `CLAUDE.md:28` sends UI work to
  `PRODUCT.md` + `DESIGN.md` (178 lines). `DESIGN_SYSTEM.md:1-6` declares itself "the single source
  of truth for every visual, interaction, and accessibility decision" — **603 lines, never mentioned
  in CLAUDE.md.** An agent following the table exactly is confidently under-briefed.
- **F-5 (HIGH) — nothing canonical states that `main` and `develop` diverged ~400 commits.**
  `git branch -a --contains 98c49c6` → `main` absent; `git log --merges origin/main` jumps #48→#14;
  no RFC PR is on main. Only `.superpowers/sdd/progress.md:1154` says so.
- **F-8 (HIGH) — `.claude/worktrees/` holds 152,368 files: 7 stale copies of the repo, inside the
  repo.** 286 md + 990 ts outside node_modules. Gitignored but **not in `.claudeignore`**, so grep
  returns months-old shadow copies of `CLAUDE.md`/`ROADMAP.md` — including one containing the
  deleted FastAPI `backend/`. This is the only place an agent can be *actively misled* rather than
  merely slowed.
- **F-9 (MED) — the documented pipeline gate does not run.** `python --version` → Store stub;
  `py --version` → 3.13.2. Yet `CLAUDE.md:67` and `verify-gates.md` prescribe `python -m pytest`.
- **F-4 (MED) — 4 docs route to a superseded ledger** (`CLAUDE.md:92`, `sdd-orchestration.md`,
  `git-workflow.md` step 1, 2 commands) while `progress.md:4` itself says runs from RFC-018 keep
  `.superpowers/rfc-XXX/dev-log.md`.

**Its #1 recommendation, which the final report should adopt: FIX THE INDEX, DO NOT ADD ONE.**
F-3 + F-4 + F-5 are ~10 lines of edits to CLAUDE.md / ROADMAP / git-workflow and they repair the
repo's entire routing layer. **Do NOT create `AGENTS.md`** — `decision-frameworks.md §9` forbids
speculative tooling and a 4th index would rot first. Also: `git worktree prune` the seven and add
`.claude/worktrees/` to `.claudeignore`. Convention: *process nouns live in the ledger, never in
source* (~46% of the offender comment mass; lint-enforceable).

**V2:** 38 `file:///C:/` links across four architecture docs are non-portable; RFC-017/018/020
headers are stale despite shipped implementations; 0/5 largest sampled plans carry a historical
status banner. Spec comment debt is concentrated in process narration, not suite-wide.

### 3.9 Specialist #7 — Performance / Lifecycle / Persistence (COMPLETE)

Full evidence: `audit-perf-lifecycle-persistence.md` + `audit-perf-lifecycle-persistence-v2.md`.

- **S6 does NOT escalate to proven data destruction.** Live Supabase evidence: `public.sessions`
  has 6 rows; `current_setting('pgrst.db_max_rows', true)` returns null; available logs/advisors do
  not expose Dashboard Max Rows. The code mechanism is **proven unsafe** (`listSummaries` has no
  pagination/count and absence deletes locally), but cap, truncation and historical destruction are
  **UNVERIFIED**. Final report must preserve that distinction.
- `void telemetryDb.append(...)` can reject through `assertNoCandles`/IDB initialization and become
  unhandled; targeted typed lint catches it.
- Pipeline manifest shape matches the app. The actual integrity gap is `response.get("ETag", "")`:
  an absent R2 ETag becomes an empty cache identity and can suppress refresh.
- Storage quota has zero preflight/classification (`QuotaExceeded|navigator.storage|estimate` = 0),
  increasingly relevant before `[NSYM]` multiplies datasets.
- Lotaje listener and telemetry 0-ms timer suspicions are closed as non-findings after ownership reads.
- `[NSYM][SEQ]`: storage is symbol-keyed, but runtime series and the TradingBook remain mono-symbol;
  an explicit state-model RFC must precede a panel symbol selector.

### 3.10 Specialist #9 — Churn / Shotgun / History (COMPLETE)

Full evidence: `audit-churn-shotgun-history.md` + `audit-churn-shotgun-history-v2.md`.

- `chart-engine.ts` is 261 LOC; original F-02 methodology gives score **4.2** (261×16/1000), below
  telemetry but with the repo's worst fix/churn ratio and joint-highest rework.
- **F-13 organisational learning:** only selector memoization and build/lockfile hygiene map directly
  to durable anti-pattern mechanisms; lifecycle/hydration/units/clocks/boundary testing/lookahead keep
  recurring. C7 is the control: recurrence stopped after codification.
- RFC-020 M-1 and RFC-019 Task-5 directly prove the same lesson: tests can be locally thorough while
  missing the lifecycle/bundler/DOM/invariant-truth boundary.
- **F21-2 verdict:** code satisfies D.20.6 exact pins. The actionable HIGH concern is identical `pts`
  labels with incompatible divisors across Lotaje and TradePanel, not failure of the owner-approved
  Lotaje arithmetic.
- `[NSYM]`: RFC-017 visual Tasks 7-8 are superseded/shipped; F19-2 symbol-keyed candle sourcing is
  the real structural blocker to promote into the multi-symbol RFC sequence.

---

## 4. Open questions for the owner (do not guess)

1. There is no documented RFC-021+ plan. What is the intended next product wave? Sequencing in
   §"Ordering with future product RFCs" is provisional until this is answered.
2. Whether this audit directory should eventually be committed (it is currently untracked).

---

## 5. Ground rules for whoever resumes

- Re-verify `git status` / HEAD before doing anything; do not assume this baseline still holds.
- Do not re-run expensive measurements that a report already records — each `RESUME BRIEF` lists
  the commands already executed with their outputs.
- Gates, if ever run, go raw from `emulador/`: `npx tsc -p tsconfig.app.json --noEmit`,
  `npx tsc -p tsconfig.spec.json --noEmit`, `npx ng test --watch=false`, `npm run lint`.
  Never pipe through `| tail`/`| head` — it hides the non-zero exit code. Never `npx vitest run` bare.
- The final report is a *document*, not a code change. Do not begin implementing findings.
