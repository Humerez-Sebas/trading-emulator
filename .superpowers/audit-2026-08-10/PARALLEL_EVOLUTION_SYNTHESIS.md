# Parallel Evolution — Synthesis

**Campaign:** 2026-08-11 → 2026-08-12 · **Baseline:** `develop` @ `a2ca53b`
**Orchestrator:** Principal Engineering Orchestrator (adversarial closeout)
**Status:** Agents B, C, D, E CLOSED and independently verified · Agent A (landing) §4 pending
**Repo mutations to `develop`: none. Nothing pushed. Nothing merged.**

---

## 1. Executive conclusion — what the campaign actually taught us

**The audit was right about the shape of the debt and wrong about several of its specifics — and
the pattern in what it got wrong is the most valuable output of this campaign.**

Every incorrect audit finding failed the same way: **it compared one factor of a product against
another domain's value for a same-named field, and never computed the product.** That single
error mode produced the "gold sizing bug" (refuted), the "index `pointSize` 100× spread inflation"
(refuted), and the "25 direct library calls in `chart.component.ts`" figure (actually zero — the
handles are aliased once). Three separate high-severity findings, one root cause.

The corollary is now proven in both directions:

- **Green gates hid a real destructive defect.** Agent C's truncated-pull scenario destroys
  unpushed local sessions, and 2,373 tests passed over it. I disabled the new guard myself and
  watched six tests state the defect out loud.
- **Red-looking evidence hid correct behaviour.** Index `pointSize = 1` looks wrong beside a
  registry saying `0.01`, and is right. I recomputed the friction from source: 3.00% of risk as
  shipped, versus 0.03% under the proposed "fix" — the fix would have deleted 99% of index
  trading friction, with every gate green.

**A finding is only as good as its negative probe.** Four of the five agents produced one; those
four are trustworthy. This is the discipline worth carrying forward more than any specific fix.

Second lesson, cheaper but real: **every agent's `PROGRESS.md` understated its own branch.** Three
of five claimed work as "not started" that was already committed. Ledgers lag; git does not.
Always reconcile.

---

## 2. Baseline

| | |
|---|---|
| Branch | `develop` |
| **Baseline SHA** | **`a2ca53b`** — *Merge PR #56 (backmerge main→develop)* |
| Re-verified at closeout | `git ls-remote origin refs/heads/develop` → `a2ca53b44f678…` — **zero drift** |
| `main` | `ad69d7d` (unchanged) |
| Agent branches on origin | `git ls-remote origin 'refs/heads/agent/*'` → **empty. Nothing pushed.** |
| `develop` mutated? | **No.** Only untracked files added under `.superpowers/audit-2026-08-10/`. |

**Baseline gates (run raw by the orchestrator at campaign start):** tsc app 0 · tsc spec 0 ·
lint 0 ("All files pass linting.") · `ng test` 0 — **182 files / 2,373 tests passed.**

---

## 3. Agent outcomes

| Agent | Branch | Verdict | Commits | Recommendation |
|---|---|---|---|---|
| **A** Landing | `agent/landing-product-showcase` | Built, build PASS, honesty **exemplary** — but **publishes 100× wrong lot sizes** | 11 (`65e2a8e`…`6e4eb5f`) | **MERGE AFTER the 3 figure fixes** · **DO NOT DEPLOY yet** |
| **B** Units | `agent/unit-authority` | **`CONFIRMED CORRECT`** — audit refuted | 4 (`9c94ef5`…`3642fd8`) | **RESEARCH ONLY** |
| **C** Sync | `agent/session-sync-red-team` | **V1 `REACHABLE ABOVE db-max-rows`** (fixed) · **V2 `REACHABLE TODAY`** (not fixed) | 4 (`ef4b671`, `f991e0a`, `e538d0e`, `335eb55`) | **MERGE AS-IS** |
| **D** Verification | `agent/verification-integrity` | Boundary gap closed; CI gap closed | 6 (`b9ba376`, `bb7e5f8`, `2f1074c`, `446d671`, `1f4e708`, `b19939f`) | **MERGE AS-IS** |
| **E** Routing | `agent/routing-hygiene` | 9 stale statements corrected, 0 refuted | 11 (`986eb5a`…`f7884e2`) | **MERGE AS-IS** |

Full independent-verification evidence: `ORCHESTRATOR-VERIFICATION-LOG.md`.

### 3.1 Agent B — Unit Authority · `RESEARCH ONLY`

**Mission:** resolve tick/pip/point semantics; adjudicate index `pointSize`.
**Changed:** nothing in app code — correctly, since its own bar was not met.
**Deliverable:** `UNIT_AUTHORITY_INVESTIGATION.md` @ `0078539`.

**Independently re-derived by the orchestrator** (see §5 for the truth table). `spreadPoints` and
`pointSize` are consumed **only** as a product — `ask = bid + pointsToPrice(spreadPoints,
pointSize)` (`fill-engine.ts:61`) and the slippage delta (`:73`) are the sole consumers, and
`pointsToPrice` is the single multiplication site (D14.D). A factor has no correctness
independent of its partner.

### 3.2 Agent C — Session Sync Red Team · `MERGE AS-IS`

**Definitive reachability answer (§7 of the mandate):**

| Vector | Verdict | Severity |
|---|---|---|
| **V1 — truncated pull** | **`REACHABLE ABOVE db-max-rows`** — not reachable at today's 6 sessions / 2 folders. **FIXED.** | Medium (high impact, low likelihood today) |
| **V2 — wrong-owner pull** | **`REACHABLE TODAY`** — no cap, no truncation, no growth needed. **NOT fixed.** | **High** |

**V2 is the more serious finding and it is not fixed.** Three facts compose: RLS is
`owner_id = auth.uid()`; an RLS-filtered read returns **HTTP 200 with `[]` and `error == null`*
(empirically probed); and the IndexedDB name is a module constant with no user id, which no code
path clears on logout (`auth.effects.ts` `logout$` only signs out). **An account switch in one
browser profile makes user B's empty pull delete user A's local sessions.**

**Does the fix change protocol semantics?** **No — it makes the existing protocol safe.** It adds
`{ count: 'exact' }` and refuses a short page, failing closed into the pull's pre-existing offline
`catch`. Absence still means deletion; the guard only ensures absence is *trustworthy*.

**Classification: `HOTFIX / MAINTENANCE`** for V1. **`RFC-LEVEL CHANGE`** for V2 (owner-bound
local store needs a migration decision for existing IndexedDB contents).

**Orchestrator's negative probe (re-run independently):** guard neutered → **6 tests fail**,
`PROBE_EXIT=1`, with the failures stating the defect (`expected [ 'sess-returned' ] to include
'sess-omitted'`; `expected undefined to be defined` — the unpushed session; `expected undefined to
be 'A'` — the active session's trading data). Restored → **182 files / 2,381 tests, exit 0.**

**Honest limit:** the guard's efficacy against a *real* PostgREST cap is
**`SUPPORTED BUT NOT FULLY PROVEN`** — it relies on `Content-Range` carrying the true total while
rows are capped. Standard PostgREST semantics, but unexercised: no exposed relation has >1000
rows and creating one would mutate production. When `count` is `null` the guard is inert by design.

### 3.3 Agent D — Verification Integrity · `MERGE AS-IS`

**Production files touched: ZERO.** Every app-code change is a `.spec.ts`.

- **Selector isolation:** all **19** leaking spec files fixed (both batches). Rule at
  `docs/engineering/testing.md:24-27` re-read and still expresses desired behaviour.
- **TradePanel:** `trade-panel.component.spec.ts`, **36 tests**, all crossing the real DOM
  (`el.value = …` + dispatched `input`/`change`, real `HTMLElement.click()`, assertions on
  rendered text, `disabled` state and dispatched store actions). **`grep -c "component\..*\.set("`
  → 0** — it never cheats past the DOM. Sizing compared against the real `lotsForRisk` kernel.
- **Mechanical enforcement — now appropriate, and in the right order.** `require-reset-selectors`
  (local AST rule, no new dependency, spec files only) was added **after** the backlog reached
  zero, so it needs no suppressions. *This is the contrast with I1 — see §8.*
- **CI:** `pull_request.branches: [main]` → `[main, develop]`. That is the entire diff.
  `push.branches` stays `[main]`, and `deploy` is independently guarded on
  `push` + `refs/heads/main` (`ci.yml:85`) — two independent conditions keep the widening away
  from production.
- **Branch protection was NOT configured.** No MCP/CLI path; human dashboard action. Gates now
  *run* on develop PRs but are **not required**, so a red run remains mergeable.

**Orchestrator's negative probe (performed independently):** mutating the SL field's
`(input)` → `(change)` — exactly the historical defect class — produced
**`15 failed | 2394 passed (2409)`, `MUTATION_EXIT=1`**. Reverted → **183 files / 2,409 tests,
exit 0.** A `.set()`-driven spec would have sailed past this mutation.

**Flagged, deliberately not fixed:** the `frontend` CI job runs lint / `format:check` / `ng test` /
`build` with **no tsc**, while `CLAUDE.md` names four gates and never mentions `format:check`.
Neither document matches the other → **owner decision**. Refusing to resolve it unilaterally was
correct; silently picking a side is the drift this branch exists to reduce.

**Residual limit, correctly named:** jsdom has no layout engine — these tests prove wiring and
dispatched actions, **not CSS or visual reachability**.

### 3.4 Agent E — Routing & Agent Hygiene · `MERGE AS-IS`

**Docs-only, verified:** `git diff --name-only develop..HEAD -- emulador/src pipeline` → empty.
No gates run and **none claimed** — correct for a docs-only branch.

| Item | Correction |
|---|---|
| `ROADMAP.md` | Mastery Block retitled as delivered (RFC-014/015/016 merged); RFC-020 registered |
| RFC headers | 017/018/019/020 → `Implementado` with merge SHAs (**019 found independently, not in the brief**) |
| `CLAUDE.md` | 4 authorized corrections only; hooks/`settings.json`/`steering.md` untouched |
| Bundle rationale | "Arrow/parquet-dominated" was **false** → `@supabase/supabase-js` 219.12 kB = 33.6% of a 651.60 kB initial graph; Arrow/parquet contribute **0 bytes** (dynamic imports in a worker) |
| `python` → `py` | The Store stub exits **49** without running anything |
| Ledger routing | `.superpowers/rfc-XXX/dev-log.md` from RFC-018 on; `CLAUDE.md:92`'s "only progress.md is tracked" was false (4 ledgers tracked) |
| `.claudeignore` | `.claude/worktrees/` added — removes **152,368** shadow files from agent search |
| `file:///C:/` links | 35 of 38 → repo-relative (all 16 targets verified to exist); 3 external targets confirmed **gone**, labelled historical, none fabricated |
| Status banners | 5 largest plans; `modo-offline` → **REMOVED** (independently confirmed: `grep guestModeEnabled\|offlineOnly` → 0 hits; `auth.guard.ts:11` "Login is required") |

**Refuted by Agent E: none** — all 8 briefed items were genuinely stale, plus one found
independently.

**Worktrees: classified, NOT pruned.** 7 dirs / 152,368 files: 5 stale-fully-merged, 1 empty
orphan, 1 stale-with-care (`0cbed9b`, unreachable, 3 files byte-identical to develop). Prune
commands are **recommendations in the report; the owner runs them**. `30c2219` (the PR #36
ancestry graft) is an ancestor of both branches and must never be deleted.

---

## 4. Landing & Vercel

**Branch:** `agent/landing-product-showcase` · 11 commits · tree clean · **nothing pushed** ·
`git diff --name-only develop..HEAD -- emulador` → **empty (app untouched)**.
**Path:** `landing/` · **Architecture:** zero-dependency static site (hand-authored HTML/CSS/JS,
Node-built-ins-only build). `package.json` has **no `dependencies` and no `devDependencies`** —
invariant 8 respected, no lockfile to drift.

**Local production build — orchestrator ran it raw: `LANDING_BUILD_EXIT=0`**, 6 files, **139.1 kB**.
`build.mjs` doubles as the gate: content-hashes CSS/JS and exits non-zero on broken refs,
non-allowlisted hosts, missing head tags, absolute FS paths, or any env value/key leaking in.

### 4.1 Narrative (verified by reading the rendered page, not the report)

*Hero* **"Practica decisiones, no dinero."** → *Tesis* "Mil operaciones simuladas no enseñan nada
por sí solas… el entregable no es el P&L: es el Playbook enmendado" → Replay → Workspace →
Ejecución → Lotaje → Journal → Cabina → Playbook → Futuro → Bajo el capó → Cierre.

Section 2 renders the verb ledger explicitly: **EL SISTEMA** *registra · conserva · reconstruye ·
presenta* / **EL TRADER** *interpreta · decide · escribe · enmienda*.

**Reads as a deliberate-practice instrument, not a broker / SaaS dashboard / profitability
promise.** Forbidden copy check: no user counts, no profitability claims, no testimonials, no
performance promises, no AI buzzwords, no broker language. **PASS.**

**Never-scores doctrine held in four places**, including a hero stat reading
**"0 puntuaciones de disciplina"** and *"El emulador no etiqueta, no interpreta y no emite
veredictos: esa frontera está escrita en su arquitectura, no en su marketing."*
The Cabin's three prompts render **empty (`—`)** — filled-in text would read as system-authored
interpretation. That is a genuinely sophisticated restraint.

### 4.2 Capability emphasis (§10 checklist)

| Capability | Treatment | Verdict |
|---|---|---|
| Market replay | Dedicated section + 4 sub-features (transporte, v/s, saltos, resolución desacoplada) | ✅ |
| Chart workspace / multi-panel | Dedicated section; interactive tab preview rebuilt from the real `PANEL_COUNT` | ✅ |
| Chart/link synchronization | Channels named; **`syncPriceScale · reservado`** shown as a dashed chip | ✅ honest |
| Execution | Dedicated section; SL obligatorio, derived lotaje, BE, simulated costs | ✅ |
| Trade overlays | E / SL / TP geometry drawn on the reconstruction | ✅ |
| **Position-sizing calculator** | **Full dedicated section** — page *and* floating companion, 4-instrument catalog, honest-degradation note, both input methods | ✅ **real product emphasis, not a feature card** |
| Journal / Reflection | Two sections; all 10 real metric labels + Behavior facts + the 3-trade guard | ✅ |
| Playbook / rule adherence | Dedicated section; *"nunca puntúa el cumplimiento"* | ✅ |
| Learning / knowledge engine | The 7-step cycle rendered as the tesis spine | ✅ |

### 4.3 Multi-symbol honesty (§11) — **exemplary**

Four independent signals: eyebrow **`PRÓXIMAMENTE`**, an amber **`En desarrollo`** chip in the H2,
a lede ending **"Todavía no existe."**, and a second amber flag under a dimmed, dashed,
`aria-hidden` illustration captioned *"Ilustración de una intención, no de una función
disponible."* The prose names the real blocker — market state indexes series by timeframe with no
symbol dimension, and mono-symbol is a frozen non-goal — and **promises no date, design or shape**.
Scope is additionally restated in the Workspace section ("Sesión mono-símbolo").
**Nothing implies multi-symbol ships today. PASS.**

### 4.4 Visual provenance (§12)

| Category | Present? |
|---|---|
| `REAL PRODUCT CAPTURE` | **None.** Every route but `/login` is behind `authGuard`; no guest mode; `emulador/node_modules` absent in the worktree |
| `FAITHFUL RECONSTRUCTION` | **All product visuals**, each labelled `RECONSTRUCCIÓN` in-page; candle geometry emitted by a seeded generator and inlined as static SVG so it survives without JS and inherits `--up`/`--down` |
| `FUTURE CONCEPT` | The multi-symbol illustration only, labelled `En desarrollo` |

Categories are **not blurred**. Footer discloses reconstructions, illustrative figures, non-broker
scope and account-required access.

### 4.5 Orchestrator's independent verification

```
npm run build                      LANDING_BUILD_EXIT=0   6 files / 139.1 kB
console messages (2 loads)         none at any level
scrollWidth / clientWidth @1440    1425 / 1425 — no body overflow
elements past the viewport edge    0
```

Agent A's console, overflow and build claims **all reproduce**.

### 4.6 ⚠ DEFECT FOUND BY THE ORCHESTRATOR — the landing publishes wrong lot sizes

**Agent A's claim that "sample arithmetic is internally consistent with the real registry" is
FALSE.** The calculator mocks use the **chart/TradePanel divisor (`derivePointSize` = 0.01)** on
a surface that is explicitly the **Lotaje calculator**, which uses `pipSize ?? 1` = **1** for every
non-FX instrument (D.20.6). Computed in-browser against the real kernel:

| Mock | Shown | What the shipped product produces | Error |
|---|---|---|---|
| `/calculadora` NAS100 — 5 000 pts, 1% of 10 000 | **2,00 lotes** | **0,02 lotes** | **100×** |
| Floating calc XAUUSD — 750 pts, 1% | **0,13 lotes** | **0,00** — below min lot, would raise the min-lot warning | **100×** |
| Operativa panel — "Riesgo 100,00 $ · 750 pts" | **Lotaje 0,66** | **0,13** — and the trade card directly below already reads `0,13 Lotes` | ~5×, self-contradictory |

Suggested corrections that keep the visuals attractive **and** true under current semantics:
NAS100 `5 000 pts` → **`50 pts`** (→ 2,00 lotes); XAUUSD `750 pts` → **`7,5 pts`** (→ 0,13 lotes);
Operativa `Lotaje 0,66` → **`0,13`**. *(The Operativa section's "750 pts" is itself correct — that
surface really does display broker points.)*

**This is the single most important product finding of the campaign, because of what it
demonstrates:** an expert agent, explicitly briefed on the unit hazard and with the truth table
available, still transcribed the wrong divisor into a public-facing artifact. **The `pts`
ambiguity is no longer a theoretical transcription hazard — it has now claimed its first
casualty.** Owner decision **O-1** should be re-ranked accordingly.

### 4.7 VERCEL — actual state

```
VERCEL STATE:            CONFIGURED, NOT DEPLOYED  (deployment is POSSIBLE — deliberately withheld)
Project:                 none created. Existing account holds exactly ONE project:
                         prj_KpNe7NDXP95iXljbwcZCh4Wcv0Wo  "emulador"  (production — NOT touched)
Team:                    hum24 / team_dVBTaqwZmidnC7KJf7h6BpLI
Preview URL:             NONE. Nothing was deployed. No URL is fabricated.
Local production build:  PASS  (exit 0, 139.1 kB, 6 files)
Remote verification:     NOT RUN — nothing remote exists to verify
Blocker:                 OWNER DECISION — see below
```

**Correction to Agent A's report:** it stated Vercel was blocked because the CLI is unauthenticated.
That is true of the CLI, but **the Vercel MCP integration IS authenticated** — `list_teams` and
`list_projects` both succeeded. A new-project preview deployment is **genuinely available right
now**.

**Why the orchestrator stopped anyway.** Deploying publishes the page publicly, and §4.6 means it
would publish position sizes that misstate the shipped product by 100× on its money-math surface.
The mandate authorises a *safe* preview and states that **product truth takes precedence over
marketing**. Publishing known-wrong sizing figures is not safe, and unpublishing does not un-index.
**One operation stopped; everything else completed.**

**Exact decision required:** approve the three figure corrections in §4.6 (or supply preferred
numbers), then authorise the preview deploy. On approval the deploy is a single MCP call to a NEW
project (`target: "preview"`), never touching `prj_KpNe7NDXP95iXljbwcZCh4Wcv0Wo`.
CLI alternative, if preferred: `vercel login`; then from `landing/` → `vercel link` (answer **N**
to "link to existing", create a NEW project) → `vercel deploy`, with **Root Directory = `landing`**.

---

## 5. Units — final semantic truth table

**Independently recomputed by the orchestrator from source, not quoted from Agent B.**

### 5.1 The instrument table

| Instrument | Source | `tickSize` | `pointSize` (MT5 registry) | `pipSize` | contract | Lotaje display unit | Lotaje input → `priceDelta` | Chart/TradePanel `pts` divisor | `ExecutionCosts.pointSize` | spread preset | spread `priceDelta` |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **EURUSD** | heuristic | `null` | `null` | `0.0001` | 100 000 | pips | 45 → 0.0045 | 0.00001 | 0.00001 | 10 pts | 0.0001 |
| **XAUUSD** | mt5@2026-08-05 | 0.01 | 0.01 | `null` | 100 | **pts** | 5 → **5.00** | **0.01** | **0.01** | 30 pts | 0.30 |
| **NAS100** | mt5@2026-08-05 | 0.01 | 0.01 | `null` | 1 | **pts** | 100 → **100.00** | **0.01** | **1** | 2 pts | 2.00 |
| **US30** | mt5@2026-08-05 | 0.01 | 0.01 | `null` | 1 | **pts** | 66 → **66.00** | **0.01** | **1** | 2 pts | 2.00 |
| **SP500** | mt5@2026-08-05 | 0.01 | 0.01 | `null` | 1 | **pts** | 50 → **50.00** | **0.01** | **1** | 2 pts | 2.00 |

Authorities: Lotaje `priceUnitsPerDisplayUnit = pipSize ?? 1` (`sizing-view-model.ts:76-79`);
chart family `derivePointSize(candles)` = quote resolution (`models.ts:106-112`);
costs `pointSizeFor(symbol)` (`execution-costs.ts`). **EURUSD is absent from the generated
registry** — always heuristic, so its `tickSize`/`pointSize` are `null`.

### 5.2 The three divisors behind one label

| Surface | NAS100 / US30 / SP500 | XAUUSD | EURUSD |
|---|---|---|---|
| Lotaje distance (`pipSize ?? 1`) | **1.00** | **1.00** | 0.0001 |
| Chart HUD / TradePanel / ruler (`derivePointSize`) | **0.01** | **0.01** | 0.00001 |
| Cost dialog + summary (`ExecutionCosts.pointSize`) | **1.00** | **0.01** | 0.00001 |

**No surface is consistently the outlier.** On indices the chart family diverges; on gold Lotaje
does. **Every module's tests pass because each asserts its own convention.**

### 5.3 The three questions the mandate demands answered

**Gold — was the suspected XAUUSD sizing bug real?**
> **NO.** Intentional D.20.6 behaviour. Non-FX displayed `pts` are whole price units; the code
> follows it and `sizing-view-model.spec.ts:67-115` pins the owner-approved values
> (5→0.20, 10→0.10, 20→0.05 lots at $10,000/1%). Under PHILOSOPHY §5.7 those specs are authority.
> **`REFUTED` — do not re-open.**

**Indices — is `pointSize = 1` in `execution-costs.ts` defective?**
> **NO. `CONFIRMED CORRECT` by independent review.** Friction recomputed from the real formulas:

```
NAS100 AS SHIPPED (pointSize=1)      net=$-103.00  friction=$3.00 =  3.00% of risk
NAS100 COUNTERFACTUAL (=0.01)        net=$-100.03  friction=$0.03 =  0.03% of risk
XAUUSD (pointSize=0.01, undisputed)  net=$-107.00  friction=$7.00 =  7.00% of risk
EURUSD (pointSize=1e-5, undisputed)  net=$-103.18  friction=$3.18 =  3.18% of risk
```

> As shipped, index friction sits inside the band set by the two undisputed presets. The proposed
> "fix" makes it ~100× lighter than its siblings — effectively frictionless backtesting on 3 of
> the 4 instruments that have R2 data. Additionally pinned by `execution-costs.spec.ts:56-60`.
> *(Correction to Agent B: the counterfactual is 0.03%, not 0.04% — a one-cent slip, immaterial.)*

**What is the remaining real problem?**
> **Vocabulary and cross-surface semantics — not arithmetic.** Two concrete defects:
> 1. **The `pts` label denotes three different quantities** (§5.2). A trader transcribing a stop
>    between Lotaje and the chart HUD on an index is off by 100×. **This is a human-transcription
>    hazard, not a computational one** — `trade-panel.component.ts:71-77` and
>    `chart.component.ts:1071` both size from an entry/SL *price pair* and never divide by a point
>    size (`slPoints` is display-only).
> 2. **`ExecutionCosts.pointSize` is documented as "the session's resolved minimum price
>    increment"** — **false for indices**, where the true increment is `0.01` and the field carries
>    a hand-authored `1` meaningful only paired with `spreadPoints`. **That sentence is what
>    manufactured the original false positive.**

**D.20.6 is not redefined by this document.** It remains: Forex displays `pips` via `pipSize`;
every non-FX display uses whole price units; MT5 `pointSize` stays raw registry/provenance data.

---

## 6. Audit corrections — `ORIGINAL FINDING → NEW EVIDENCE → FINAL VERDICT`

**Purpose: stop future agents rediscovering disproven claims.**

| # | Original audit finding | New evidence | Final verdict |
|---|---|---|---|
| 1 | **F21-2 / gold sizing broken** because XAUUSD has no `pipSize` | D.20.6 defines non-FX display as whole price units; `sizing-view-model.spec.ts:67-115` pins the approved lots; code satisfies them | **`REFUTED`** (already corrected pre-campaign; re-confirmed) |
| 2 | **TD-A6 / index `pointSize = 1` is a 100× spread inflation** | `spreadPoints × pointSize` is a matched pair; only the product reaches a fill. Friction as shipped **3.00%** vs siblings 3.18% / 7.00%; "fix" → **0.03%** | **`REFUTED`** — value is correct; the **name and doc comment** are the defect |
| 3 | **TD-A6 / Lotaje and TradePanel disagree 100× on lot size** | Both size from an entry/SL **price pair**; neither divides by a point size. `slPoints` is display-only | **`REFUTED` as computation** — real, High, as a **label/transcription** hazard |
| 4 | **TD-A2 / I1 violated: "25 direct library calls in `chart.component.ts`"** | `grep -c "chartApi\.\|seriesApi\."` → **0**. Handles aliased once at `:630-631`; 18 calls go through locals. Only **5 consumer sites** repo-wide | **`REFUTED` as stated** — see #5 for the correct framing |
| 5 | **TD-A2 framed as silent invariant erosion** | `chart-engine.ts:24` carries a sunset TODO ("remove once Drawings/TradingCapability exist"); `capability.ts:14-19` says the getters cover access *"hasta entonces"*. **Both capabilities now exist and already take the series by constructor** | **Reclassified: `EXPIRED MIGRATION CONSTRAINT`** — not erosion; a scheduled deletion that never ran |
| 6 | **TD-A11 / sync absence⇒deletion is "High latent"** | V1 needs `rows > db-max-rows` (not reachable at 6 rows) — **but V2, an adjacent wrong-owner vector, is `REACHABLE TODAY` with no threshold** | **Severity corrected upward via a different vector** — the latent one was fixed; the reachable one is open |
| 7 | `tickSize` vs `pointSize` divergence | Both `0.01` for all four harvested symbols; sourced from genuinely different MT5 fields | **`REFUTED`** — no live divergence; nothing to fix |
| 8 | Bundle overrun is "Arrow/parquet-dominated" | Arrow/parquet are lazy chunks contributing **0 bytes** initially; `@supabase/supabase-js` is **219.12 kB = 33.6%** of 651.60 kB | **`REFUTED`** — corrected in `CLAUDE.md`; real perf lead identified |

**The single lesson, worth adding to `anti-patterns.md`:** *when a value is only ever consumed as
one factor of a product, it has no correctness independent of its partner — audit the product.*
Two same-named fields in two domains, one broker-authoritative and one a hand-authored
convention, will eventually be "reconciled" by someone who does not know they differ, with every
gate green throughout.

---

## 7. Findings by category

### 7.1 Confirmed defects (proven wrong)

| id | Defect | Evidence | Status |
|---|---|---|---|
| **F-1** | Truncated cloud pull deletes sessions/folders that still exist, destroying **unpushed** local edits (pull deletes at steps 3/4; `flushDirty` runs at step 5) | 6 failing tests with the guard removed | **FIXED** on `agent/session-sync-red-team` |
| **F-2** | **Wrong-owner pull**: account switch in one browser profile wipes the previous user's local sessions. RLS returns `200 []` with no error; IndexedDB is not user-scoped; logout does not clear it | Live REST probe + `auth.effects.ts` read | **OPEN — highest-severity live defect in the campaign** |
| **F-3** | CI never ran on PRs to `develop`, where every RFC lands | `ci.yml:3-7` | **FIXED** on `agent/verification-integrity` |
| **F-4** | Order entry (the money-moving surface) had **zero** specs | 36 DOM tests added; mutation → 15 red | **FIXED** on `agent/verification-integrity` |
| **F-5** | 19 spec files leaked forced selectors under `isolate:false` | `overrideSelector` without `resetSelectors` | **FIXED** + lint rule |
| **F-6** | `ExecutionCosts.pointSize` doc comment is false for indices | `execution-costs.ts` vs registry `0.01` | **OPEN** (owner O-3: rename + migration) |
| **F-7** | `pts` denotes three different quantities across surfaces | §5.2 | **OPEN** (owner O-1 blocks) |
| **F-8** | **The landing page publishes lot sizes 100× wrong** — chart divisor used on the Lotaje surface; plus a self-contradictory `Lotaje 0,66` beside its own `0,13` trade card | §4.6, computed in-browser against the real kernel | **OPEN** — blocks the Vercel deploy |

### 7.2 Intentional behaviour — suspicious-looking, correct by design

- Index `pointSize = 1` paired with `spreadPoints = 2` (D.20.6 + preset design).
- XAUUSD sized in whole price units with `pipSize = null` (D.20.6, owner-pinned).
- Playbook rules and lessons **never** delete on remote absence — deliberate, with the P-3
  rationale written in place. Sessions/folders are the inconsistent pair, not playbook/lessons.
- Cloud data is never destroyed by any pull path.
- Frozen 008-012 non-goals and `syncPriceScale` reserved-unimplemented (invariant 6).
- `handleMouseDown`, `fill-engine.processCandle`, `TradingCapability.render` are long **by
  design** — ordered algorithms where the order *is* the logic. Do not split.

### 7.3 Architectural debt (structurally undesirable, not a current product defect)

- Two durable candle owners (`CANDLES_STORE` + `SERIES_STORE`); `Workspace` embeds `Candle[]`
  (`workspaces.models.ts:20`) — violates I3 locally though cloud DTOs are clean.
- Runtime market state keys series by **timeframe only, no symbol dimension** — the same line is
  simultaneously the I3 local violation and the multi-symbol gate.
- Three uncoordinated writers to `WorkspaceMeta.trading`.
- `SessionSyncService` spans four independently-changing policies in one file.
- `{ count: 'exact' }` adds a real COUNT per pull — trivial at 6 rows, worth a line at scale.
- `@supabase/supabase-js` eagerly in the initial bundle via a root-provided service.

### 7.4 Stale documentation & expired scaffolding *(kept separate from code defects)*

- All 9 routing items in §3.4 — **corrected** on `agent/routing-hygiene`.
- **Expired scaffolding (not staleness, not a defect):** the `chartApi`/`seriesApi` bridge whose
  sunset condition has fired (§8).
- 152,368 shadow files now excluded from agent search; **prune not executed**.

### 7.5 Owner decisions still required

| id | Decision | Blocking? |
|---|---|---|
| **O-1** | Does D.20.6's "la interfaz usa `pts`" bind the **whole UI**, or only the Lotaje *Distancia* field? Its `Alcance` table lists only pipeline/`domain/sizing`/`lotaje`/`calculadora` — not `state/trading/` or `components/chart/`. Level-2 frozen decision; **not an agent's to infer** | **Blocks all unit work** |
| **O-2** | If O-1 = whole UI: approve a 100× rescale of chart/TradePanel/ruler `pts` on non-FX **plus** re-expressing the Metales preset (30×0.01 → 0.30×1) to hold friction constant | After O-1 |
| **O-3** | Rename `ExecutionCosts.pointSize` → `costQuoteUnit` + fix its false doc. Persisted type ⇒ needs a migration. Highest correctness-per-character available | No |
| **O-4** | Renumber one of the **two** decisions sharing the id `D.20.6` | No |
| **O-5** | Fate of the six now-dead generated MT5 fields (their only sanctioned consumer, the Ficha del activo, was deleted by PR #55). **A trap, not a cleanup opportunity** — an unused broker-authoritative `pointSize` beside a hand-authored one invites exactly the wrong wiring | No |
| **O-6** | BTCUSD heuristic sizes as FX (already open, dev-log §8.4.2) | No |
| **O-7** | **V2 owner-bound local store** — needs a migration decision for existing IndexedDB contents | **Live data loss** |
| **O-8** | **Branch protection** on `main` and `develop` — human dashboard action, no MCP/CLI path. Gates now run on develop PRs but are **not required** | High |
| **O-9** | **tsc / `format:check` CI divergence** — which document is authoritative, `ci.yml` or `CLAUDE.md`? | No |
| **O-10** | Read **Supabase → Settings → API → Max Rows** once; converts V1's threshold from an inequality to a number | No |
| **O-11** | Run the worktree prune (commands in `ROUTING_HYGIENE_REPORT.md` §3); never delete `30c2219` | No |
| **O-12** | Next product wave direction — the repo documents **no plan beyond RFC-016** | Sequencing |

---

## 8. Invariant adjudication

**Never encode stale prose merely because it exists.** For every `CURRENT LAW`: written rule ·
actual state · detector today · proposed detector · backlog · precondition.

| Inv | Written rule | Actual state | Classification |
|---|---|---|---|
| **I1a** | ChartEngine never imports Angular/NgRx | `grep` → **0 violations** | **`CURRENT LAW`** |
| **I1b** | Communication crosses only as immutable `RenderModel` + bus events | 5 raw-handle consumer sites | **`EXPIRED MIGRATION CONSTRAINT`** |
| **I2** | Engine core closed; new behavior = new Capability | 5 core edits after the registry closed | **`OWNER DECISION REQUIRED`** |
| **I3** | Market-Data / User-Workspace separation | Cloud DTOs clean; `Workspace` embeds `Candle[]` locally | **`VIOLATED AND MUST BE RESTORED`** (scope: RFC) |
| **I4** | Session payloads candle-free (`assertNoCandles`) | Holds, **encoded and tested** | **`CURRENT LAW`** ✅ detector exists |
| **I5** | D8 factory-selector ban | Holds; 0 factory selectors | **`CURRENT LAW`** |
| **I6** | State-first | Does not hold | **`SUPERSEDED`** (or owner re-affirmation) |
| **I7** | No `*.spec-util.ts` / vitest imports in app code | Holds; zero backlog | **`CURRENT LAW`** — ready for a detector |
| **I8** | `overrideSelector` ⇒ `resetSelectors` | Backlog driven to **0**; **detector shipped** | **`CURRENT LAW`** ✅ detector exists |

### 8.1 `CURRENT LAW` detector readiness

| Invariant | Detector today | Proposed detector | Backlog | Precondition |
|---|---|---|---|---|
| I1a | none | `no-restricted-imports` on `domain/chart/**` | **0** | none — **ready now** |
| I4 | `assertNoCandles` + tests | — | 0 | already enforced |
| I5 | none | review convention / lint | 0 | low value; D8 holds socially |
| I7 | none | `no-restricted-imports` for `*.spec-util`/vitest in app code | **0** | none — **ready now** |
| I8 | **`require-reset-selectors`** (shipped by Agent D) | — | 0 | **done** |

### 8.2 I1b — the adjudication that changes the plan

**Evidence:**
- `chart-engine.ts:24`: *"TODO: Eliminar esta exposición directa en RFC-004/RFC-005 una vez que
  DrawingsCapability y TradingCapability estén implementados."*
- `capability.ts:14-19`: the bridge getters cover series access **"hasta entonces"**.
- `drawings-capability.ts:7` and `trading-capability.ts:38` — **both exist**;
  `:15` and `:55` — **both already take `ISeriesApi<'Candlestick'>` by constructor.**

**Both named preconditions are satisfied. The removal was simply never performed.**

**Therefore the correct action is:**

```
remove the expired bridge → prove no required consumer remains → negative tests → THEN the detector
```

**and explicitly NOT:**

```
add a lint rule → add suppressions for the 5 current violations
```

Adding the rule first would require suppressions that **re-legitimise exactly what RFC-004/005
already authorised deleting.** Agent D's `require-reset-selectors` is the model to copy: backlog
to zero **first**, rule second, no suppressions.

**Scoping the cleanup (orchestrator's own enumeration of the 18 calls):**

| Category | Count | Disposition |
|---|---|---|
| `coordinateToPrice` / `priceToCoordinate` | 10 | **No Capability serves these.** Need a small engine query surface (~2 methods) — legitimate, not scaffolding |
| `createPriceLine` / `removePriceLine` (order placement) | 4 | **Duplicates `TradingCapability`'s remit** — genuinely the expired scaffolding |
| `series.update(...)` (candle feed) | 2 | Engine-core responsibility; belongs behind an engine method |
| `timeScale()` / `scrollToRealTime()` | 2 | Small engine method |

**Verdict: a small-to-medium implementation, NOT an RFC** — but not a two-line deletion either.
It needs a deliberate decision about the engine's public query contract, which is why it is
Opus-worthy (§11 Track 1).

---

## 9. Branch integration plan

**Nothing is merged. Nothing is pushed. All recommendations await owner approval.**

| Branch | Recommendation | Rationale |
|---|---|---|
| `agent/routing-hygiene` | **MERGE AS-IS** — *first* | Docs-only, zero code risk, and it **fixes the routing that misdirects every later agent**. Merging it first makes the others cheaper to review |
| `agent/verification-integrity` | **MERGE AS-IS** — *second* | Zero production files; adds the safety net (CI on develop + DOM coverage) that every subsequent merge benefits from. **Merge before any code branch** |
| `agent/session-sync-red-team` | **MERGE AS-IS** — *third* | The only production-code change in the campaign (+54 lines). Merging it after D means it lands **with** CI running on develop PRs |
| `agent/unit-authority` | **RESEARCH ONLY** | No code changed. Its value is the investigation; do **not** merge it "as a fix". Blocked on owner O-1 |
| `agent/landing-product-showcase` | **MERGE AFTER** the three figure corrections in §4.6 | Independent of the other four (touches only `landing/` + root reports) — mergeable at any point in the order. **Do not deploy before the fix.** Everything else about the page is verified sound |

**Safest order: E → D → C.** They touch disjoint files (docs / specs+CI / one service), so the
order is about *review economics and safety*, not conflicts: routing first so reviewers read
correct docs, verification second so the net exists, production change last so it lands under CI.

**Conflict check:** `agent/routing-hygiene` touches `.claudeignore`, `CLAUDE.md`, docs;
`agent/verification-integrity` touches `.github/`, specs, `eslint.config.js`;
`agent/session-sync-red-team` touches one service + its spec. **No overlapping files.**

**Before any merge:** re-run the four gates on the merge result, not just per-branch — D's branch
and C's branch each pass alone (2,409 and 2,381), and the combined suite must be re-verified.

---

## 10. Work suitable for cheaper / future agents

Mechanical, low-ambiguity, does **not** need Opus:

| Item | Why cheap |
|---|---|
| Run the worktree prune (commands already written) | Copy-paste; owner-gated |
| Delete ~30 dead exports / 61 over-exported symbols | Mechanical, compiler-verified |
| Comment cleanup: SDD process nouns (`FINAL-AUDIT`, `Wave N`) in production comments | Find-and-edit |
| Light-theme CSS defects (6 files) | Bounded, visual diff |
| `calculadora` CSS budget trim | Measure-and-shrink, method already documented |
| Angular **21.2.19** bump inside the existing `^21.2.0` range + `npm ci --dry-run` | Version bump, zero breaking changes |
| `npm audit --omit=dev --audit-level=high` as a real CI gate | Config edit |
| Status banners on the remaining 48 plans | Template application |
| `no-floating-promises` (23 sites) | Autofix-adjacent |
| I1a + I7 `no-restricted-imports` rules | **Zero backlog — safe to ship mechanically** |
| OnPush on the 33 components lacking it | Repetitive, testable |

---

*(§11 Next-wave proposal lives in `NEXT-WAVE-PROPOSAL.md`.)*
