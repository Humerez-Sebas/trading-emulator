# Orchestrator independent-verification log

Every entry below was **measured by the orchestrator**, not accepted from an agent report.
Classification vocabulary: `CONFIRMED BY INDEPENDENT REVIEW` / `SUPPORTED BUT NOT FULLY PROVEN` /
`REFUTED` / `OWNER DECISION REQUIRED` / `DEFERRED`.

---

## Agent B — Unit Authority · index `pointSize = 1`

**Agent claim:** `CONFIRMED CORRECT`; correctness must be judged from the product
`spreadPoints × pointSize`, never from `pointSize` vs `tickSize` in isolation.

### Mechanism independently re-derived from source (not from the report)

| Fact | Source read this session |
|---|---|
| `Índices` preset = `{spreadPoints: 2, commissionPerLot: 0, slippagePoints: 1, pointSize: 1}` | `state/trading/execution-costs.ts` `COST_PRESETS` |
| `pointSizeFor`: XAU→`0.01`, XAG→`0.001`, Forex→`0.00001`, **Cripto/Índices/unrecognised→`1`** | `execution-costs.ts` `pointSizeFor` |
| `costPresetFor` = `{...COST_PRESETS[cls], pointSize: pointSizeFor(symbol)}` | `execution-costs.ts` |
| Ask = `bid + pointsToPrice(spreadPoints, pointSize)` | `fill-engine.ts:61` |
| Slippage delta = `pointsToPrice(slippagePoints, pointSize)`, adverse by action | `fill-engine.ts:73-74` |
| `pointsToPrice(points, size) = points * size` — the ONE multiplication site (D14.D) | `execution-costs.ts` |
| Registry: NAS100/SP500/US30 `contractSize 1, tickSize 0.01, pointSize 0.01`; XAUUSD `contractSize 100, 0.01/0.01` | `domain/sizing/asset-registry.generated.ts` |

**Only the product reaches a fill.** `spreadPoints` and `pointSize` are never consumed
separately — both uses (`ask`, `slippage`) multiply them. Comparing one factor against the
registry's `pointSize` therefore has no correctness meaning.

### Friction recomputed independently (orchestrator's own script, real formulas)

$10,000 account, 1% = $100 intended risk, long stopped out, 0.01 lot step:

```
NAS100 AS SHIPPED (pointSize=1)      ask=20002.00000 exit=19899.00000 lots=1.00 net=$-103.00 friction=$3.00 =  3.00% of risk
NAS100 COUNTERFACTUAL (=0.01)        ask=20000.02000 exit=19899.99000 lots=1.00 net=$-100.03 friction=$0.03 =  0.03% of risk
XAUUSD (pointSize=0.01, undisputed)  ask= 2400.30000 exit= 2394.95000 lots=0.20 net=$-107.00 friction=$7.00 =  7.00% of risk
EURUSD (pointSize=1e-5, undisputed)  ask=    1.08010 exit=    1.07548 lots=0.22 net=$-103.18 friction=$3.18 =  3.18% of risk
```

**Verdict: `CONFIRMED BY INDEPENDENT REVIEW`.** As shipped, index friction (3.00%) sits inside
the band set by the two presets nobody disputes (EURUSD 3.18%, XAUUSD 7.00%). The proposed
"fix" collapses it to 0.03% — ~100× lighter than its own siblings, i.e. effectively frictionless
backtesting on 3 of the 4 instruments that have R2 data. Additionally pinned by pre-existing
`execution-costs.spec.ts:56-60` (PHILOSOPHY §5.7: pre-existing specs are authority).

**One precision correction to Agent B:** its counterfactual cell reads `net=$-100.04 / 0.04%`.
Recomputed exactly, it is **`-100.03` / `0.03%`** (a one-cent slip in a hypothetical). Immaterial
to the verdict; corrected here so the figure is not propagated.

**The real defect is the NAME and the DOC, not the value.** `execution-costs.ts` documents
`pointSize` as *"the session's resolved minimum price increment"*. For indices that sentence is
**false** — the true minimum increment is `0.01` per the broker-generated registry, while the
field carries a hand-authored `1` that is only meaningful paired with `spreadPoints`. That
sentence is precisely what manufactured the original false positive. → owner decision O-3
(rename to `costQuoteUnit` + correct the doc; persisted type, needs a migration).

---

## Agent C — Session Sync Red Team

**Agent claim:** V1 truncated pull `REACHABLE ABOVE db-max-rows` (fixed); V2 wrong-owner pull
`REACHABLE TODAY` (not fixed, routed to RFC).

### Branch reconciled against git

```
git log --oneline develop..HEAD   -> ef4b671, f991e0a, e538d0e, 335eb55   (4 commits)
git status --short                -> (clean)
git rev-parse --abbrev-ref '@{u}' -> fatal: no upstream configured        (nothing pushed)
git diff --stat develop..HEAD     -> PROGRESS.md 180+, SESSION_SYNC_RED_TEAM.md 357+,
                                     session-sync.service.spec.ts 228+, session-sync.service.ts 54+
```

Production change inspected in full: `{ count: 'exact' }` added to `listSummaries()` and
`listFolders()`, plus a 6-line `assertCompletePull(entity, received, count)` that throws when
`count != null && received < count`. No new file, no dependency, no abstraction; it fails closed
into each pull's pre-existing offline `catch`. `SessionSyncService` was **not** split and no
repository framework was introduced (both explicitly out of scope).

### Negative probe — re-run independently by the orchestrator, not carried over

Guard neutered in the working tree only (`&& (false as boolean)`, never committed), full suite raw:

```
FAIL  session-sync.service.spec.ts > listSummaries throws when the server reports more rows than it returned
      AssertionError: promise resolved "[ { id: 'a', … }, …(1) ]" instead of rejecting
FAIL  … > listFolders throws when the server reports more rows than it returned
FAIL  … > a synced local session OMITTED from a truncated page survives the pull
      AssertionError: expected [ 'sess-returned' ] to include 'sess-omitted'
FAIL  … > a DIRTY (unpushed) local session omitted from a truncated page is preserved AND pushed
      AssertionError: expected undefined to be defined
FAIL  … > a synced-absent ACTIVE session keeps its trading data when the page was truncated
      AssertionError: expected undefined to be 'A'
FAIL  … > a synced local folder omitted from a truncated page is not deleted
      AssertionError: expected [] to include 'f-omitted'
PROBE_EXIT=1
```

Guard restored (`git checkout --`), tree verified identical to HEAD, suite re-run raw:

```
Test Files  182 passed (182)
Tests      2381 passed (2381)
RESTORED_EXIT=0        (redirected to a file, NOT piped — exit status preserved)
```

Baseline was 182 / 2373 → **+8 specs**, matching the agent's count.

**Verdict on V1 destructiveness: `CONFIRMED BY INDEPENDENT REVIEW`.** The six failures are the
defect stating itself: an omitted session is deleted, an omitted folder is deleted, an active
session's trading data is replaced by `defaultTradingData()`, and an unpushed dirty session is
destroyed outright (the pull deletes at steps 3/4, `flushDirty` runs at step 5).

**Verdict on the guard's efficacy against the real cap: `SUPPORTED BUT NOT FULLY PROVEN`.** It
rests on PostgREST returning the *true* total in the `Content-Range` denominator while capping
rows. The agent empirically confirmed the denominator is populated (`Content-Range: */0`) but
could **not** exercise the capped case — no exposed relation has >1000 rows and creating one
would mutate production. The inference is standard PostgREST semantics and very likely right;
it is not measured. Honest status: unproven at the boundary that matters.

**Residual hazard, correctly documented by the agent:** when `count` is `null` the guard is inert
by design (no completeness evidence either way → keep prior behaviour). A server that declines to
compute the count silently restores the old destructive path.

**Minor trade-off the orchestrator notes and the report does not:** `count: 'exact'` makes every
pull run a real COUNT. Trivial at 6 rows; at scale it is a second query per pull. Worth a line in
whichever RFC picks this up, not a blocker.

**Effective `db-max-rows` remains UNVERIFIED** — a Supabase Dashboard/config setting, not a DB
GUC, unreadable from SQL or any available MCP tool. Correctly stated as an inequality, never a
number. One human look at Settings → API → Max Rows converts it to a fact.

---

## Agent E — Routing & Agent Hygiene

### Branch reconciled against git

```
11 commits, working tree clean, no upstream configured (nothing pushed)
25 files / 829 insertions / 80 deletions
git diff --name-only develop..HEAD -- emulador/src pipeline  -> (empty)   DOCS-ONLY CONFIRMED
```

Gates: **none run, none claimed** — correct for a docs-only branch, and the report says so
explicitly rather than implying verification.

### Spot-checks the orchestrator performed independently

- **`CLAUDE.md` scope (protected file).** Diff inspected in full: exactly the four authorized
  corrections (UI routing row → `DESIGN_SYSTEM.md`; bundle rationale; `python`→`py`; SDD ledger
  routing). `.claude/` hooks, `settings.json`, `steering.md` untouched. **CONFIRMED.**
- **The bundle correction is substantive, not cosmetic.** Old text blamed the 648 kB budget
  overrun on "Arrow/parquet"; the new text names `@supabase/supabase-js` (219.12 kB, 33.6% of a
  651.60 kB initial graph) eagerly pulled by the root-provided `auth/supabase.service.ts`, with
  Arrow/parquet contributing **0 bytes** to the initial graph (dynamic imports in
  `workers/parquet.worker.ts`). **CONFIRMED** — and this is a real, actionable perf lead.
- **The `python`→`py` correction is load-bearing.** The orchestrator hit this trap live this
  session: `python - <<'PY'` exited **49** with the Microsoft Store ad instead of running.
  **CONFIRMED by direct experience.**
- **`modo-offline` plan marked `REMOVED`.** Independently checked in the canonical repo:
  `grep -rn "guestModeEnabled\|offlineOnly" emulador/src/` → **0 hits**;
  `auth/auth.guard.ts:11` reads "Login is required: there is no guest/offline fallback."
  **CONFIRMED.**

**Verdict: `CONFIRMED BY INDEPENDENT REVIEW`.** Docs-only, correctly scoped, self-audited, and
the two owner-only items (worktree prune, branch protection) are stated as recommendations —
**not performed**. `30c2219` (the PR #36 ancestry graft) untouched.

---

## Agent D — Verification Integrity

### Branch reconciled against git

```
6 commits: b9ba376, bb7e5f8, 2f1074c, 446d671, 1f4e708, b19939f
working tree clean · no upstream configured (nothing pushed, no PR)
25 files / 1185 insertions / 10 deletions
git diff --name-only develop..HEAD -- 'emulador/src/**' | grep -v '\.spec\.ts$'  -> (empty)
```

**D5 held: ZERO production files touched.** Every app-code change is a `.spec.ts`.

### CI change — inspected in full, scope is exactly one block

```diff
 pull_request:
-    branches: [main]
+    branches: [main, develop]
   push:
     branches: [main]
```

`push.branches` deliberately left `[main]`; `deploy` is independently guarded on
`github.event_name == 'push' && github.ref == 'refs/heads/main'` (`ci.yml:85`). **Two independent
conditions** keep the widening away from production. **CONFIRMED.**

**Branch protection was NOT configured** — it has no MCP/CLI path and remains a human dashboard
action. Gates now *run* on `develop` PRs but are not *required*, so a red run is still mergeable.
The report states this rather than implying otherwise. **Correct.**

### Negative probe — performed independently by the orchestrator

Mutation applied to the working tree only (never committed): the SL field's
`(input)="onInput('sl', $event)"` → `(change)=…` in `trade-panel.component.html`. This is exactly
the historical defect class — a spec driven by `component.<signal>.set()` cannot see it.

```
MUTATION_EXIT=1
 trade-panel.component.spec.ts (36 tests | 15 failed)
 Test Files  1 failed | 182 passed (183)
 Tests      15 failed | 2394 passed (2409)
```

Reverted (`git checkout --`), tree clean, re-run raw:

```
RESTORED_EXIT=0
 Test Files  183 passed (183)
 Tests      2409 passed (2409)
```

**15 failures — matches the agent's claim exactly.** Baseline 182/2373 → 183/2409 (+1 file,
+36 tests). **CONFIRMED BY INDEPENDENT REVIEW.**

### Spec quality assessed (not line count)

- Drives the real boundary: `el.value = …; el.dispatchEvent(new Event('input', {bubbles:true}))`,
  real `HTMLElement.click()`, `fixture.nativeElement` queries.
- **`grep -c "component\..*\.set(" → 0`** — it never cheats past the DOM.
- Asserts rendered text (`.card-badge` → `'COMPRA'`, `.card-pnl` → `'+250.00'`), `disabled`
  state, element absence (`market: no entry field`), and dispatched store actions.
- Sizing compared against the real `lotsForRisk` kernel rather than hand-derived constants.

**Not implementation-detail testing.** Accepted.

### Bonus lint rule — and why it is legitimate here

`emulador/eslint-rules/require-reset-selectors.js` (plain AST, no new dependency), wired in
`eslint.config.js` scoped to `**/*.spec.ts` only, severity `error`. Deliberately coarse: asserts a
reset *exists*, not that it sits in `afterEach`.

**This is the correct order of operations, and the contrast with I1 matters:** the D3 backlog was
driven to **zero first**, so the rule defends a clean surface and needs no suppressions. Compare
invariant I1, where 5 live consumers still exist — a rule there today would require exactly the
suppressions that would re-legitimise what the architecture intends to delete.

### Flagged, deliberately NOT fixed — correct restraint

The `frontend` CI job runs lint / `format:check` / `ng test` / `build` with **no tsc**, while
`CLAUDE.md` names four gates and never mentions `format:check`. Neither document matches the
other. The agent refused to pick a direction unilaterally: the test builder type-checks specs and
`build` type-checks app code, so the gap is narrower than it looks, and **which document is
authoritative is an owner call**. Silently resolving it would be the exact drift this branch
exists to reduce. → owner decision.

### Gates — raw, unpiped, run twice

```
tsc app 0 · tsc spec 0 · lint 0 · ng test 0   →  183 files / 2409 tests
```

### Residual limit, correctly named

jsdom has no layout engine, so these tests prove wiring and dispatched actions — **not CSS,
visual reachability, or overlap**. Same limit already recorded for `/calculadora`.

---

## Agent A — Landing Product Showcase

### Branch reconciled against git

```
11 commits · working tree clean · no upstream configured (nothing pushed)
15 files / 4472 insertions
git diff --name-only develop..HEAD -- emulador  -> (empty)   APP UNTOUCHED
landing/package.json  -> no "dependencies", no "devDependencies"   INVARIANT 8 HELD
```

### Verified by the orchestrator directly

| Check | Result |
|---|---|
| `npm run build` raw | **`LANDING_BUILD_EXIT=0`** — 6 files, 139.1 kB |
| Console messages (2 loads) | **none at any level** |
| Overflow @1440 | `scrollWidth 1425 === clientWidth 1425`; **0** elements past the edge |
| Narrative / forbidden copy | Read the rendered page in full. No user counts, profitability claims, testimonials, performance promises, AI buzzwords or broker language. **PASS** |
| Never-scores doctrine | Held in 4 places incl. the hero stat "0 puntuaciones de disciplina"; Cabin prompts render **empty** |
| Multi-symbol honesty | 4 independent future signals + names the real architectural blocker + no date/design promised. **Exemplary** |
| Visual provenance | All reconstructions labelled in-page; one clearly-marked future concept; **no real captures** (auth-gated). Categories not blurred |

**CONFIRMED** on all of the above.

### ⚠ REFUTED: "sample arithmetic is internally consistent with the real registry"

Computed in-browser against the real sizing kernel (`priceUnitsPerDisplayUnit = pipSize ?? 1`):

```
NAS100  5 000 pts @1% of 10 000 -> shown 2,00 lotes | real Lotaje 0,02 | chart-divisor 2,00
XAUUSD    750 pts @1%           -> shown 0,13 lotes | real Lotaje 0,00 | chart-divisor 0,13
TradePanel "100,00 $ · 750 pts" -> shown Lotaje 0,66 | correct 0,13 (its own card says 0,13)
```

Both calculator mocks use the **chart/TradePanel divisor (0.01)** on a surface that is explicitly
the **Lotaje calculator** (divisor 1 for all non-FX under D.20.6). **100× overstated.**

**Classification: `CONFIRMED DEFECT` (F-8).** Blocks the Vercel deploy.

**Why it is the campaign's most instructive finding:** an expert agent, explicitly briefed on the
unit hazard, with the truth table available, still transcribed the wrong divisor into a
public-facing artifact. The `pts` ambiguity is no longer theoretical.

### Vercel — correction to the agent's report

Agent A reported Vercel blocked on an unauthenticated CLI. True of the CLI, but the **Vercel MCP
is authenticated**: `list_teams` → `hum24 / team_dVBTaqwZmidnC7KJf7h6BpLI`; `list_projects` →
exactly one project, `prj_KpNe7NDXP95iXljbwcZCh4Wcv0Wo` "emulador" (production, **not touched**).
A new-project preview deploy is genuinely available.

**The orchestrator deliberately did not deploy** — publishing is outward-facing and the page
currently misstates position size by 100×. One operation stopped; all other work completed.
