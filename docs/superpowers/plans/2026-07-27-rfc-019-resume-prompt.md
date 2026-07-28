# RFC-019 — Resume Prompt (paste into a fresh session)

> You are the **orchestrator** resuming an SDD run that paused mid-flight for a usage-limit
> reset. You do not implement, and you do not audit your own dispatches beyond mechanical
> diff-scans.
>
> This document supersedes `2026-07-27-rfc-019-sdd-prompt.md` **for resumption only** —
> that prompt's §2 roles, §4 scope rules, §5 gates and §6 operating principles all still
> bind. Read it for the parts this file does not repeat.

---

## §0 — BOOT (read in this order, do not skip)

| # | Document | Why |
| :-- | :--- | :--- |
| 1 | `CLAUDE.md` | Kernel: invariants, gates, git rules |
| 2 | `docs/engineering/PHILOSOPHY.md` | §3.1 authority, §3.5 severity asymmetry, §5.4-5.7 roles/deviation/STOP |
| 3 | `docs/engineering/sdd-orchestration.md` | Run protocol, ledger, audit taxonomy |
| 4 | `docs/architecture/rfcs/019-pane-guard-cross-tf-forming.md` | The spec (D19.A–J, N19-1..5) |
| 5 | `docs/superpowers/plans/2026-07-27-rfc-019-implementation-plan.md` | The plan. **§0 corrections C1–C6 bind over the RFC's prose.** Task 5 is §3. |
| 6 | **`.superpowers/rfc-019/dev-log.md` §8** | **The run ledger. Start here for state.** |
| 7 | `docs/superpowers/plans/2026-07-27-rfc-019-sdd-prompt.md` | The original orchestration contract |

Read `docs/engineering/testing.md` before dispatching Task 5. Read
`docs/engineering/domain/replay-trading.md` + `workspace-panels.md` only if you need to
adjudicate a Task 2 audit finding.

**After reading, state in one sentence** what Task 2 changed and why Task 5 cannot be
written before Task 2 is audited. If you cannot, re-read the ledger's Wave 2 entry.

---

## §1 — Where the run actually is

| Fact | Value |
| :--- | :--- |
| Branch | `feature/rfc-019-pane-guard-cross-tf-forming` |
| Base | `develop` @ `0e66392` (RFC-018 merge, PR #46) |
| PR target | **`develop`** — never PR an individual RFC to `main` |
| Run mode | **TIERED with batched review** (ledger §8.0) |
| Ledger | `.superpowers/rfc-019/dev-log.md` **§8** (decision O1 — *not* `.superpowers/sdd/progress.md`, which still holds RFC-017) |

### Test-count chain — every number below was measured, not assumed

| Point | Files / Tests | Status |
| :--- | :--- | :--- |
| Baseline @ `fbf02a9` | 161 / **1989** | orchestrator-verified; matched the RFC-018 claim |
| Post-Wave-1 @ `75e747e` | 165 / **2028** | orchestrator-verified **and** auditor-verified |
| Post-Task-2 @ `7e4ab2a` | 165 / **2043** | ⚠️ **implementer-claimed only — re-verify** |

Wave 1 deltas that reconcile to 2028: T1 +8, T3 +13, T4 +18.

### Task status

| Task | Commit | Implemented | Audited |
| :--- | :--- | :---: | :---: |
| 1 — forming-candle collapse (D19.F) | `69b90bd` / merge `8ea8143` | ✅ | ✅ PASS |
| 4 — paint-geometry hit-test (D19.B) | `815dfb0` / merge `005a417` | ✅ | ✅ PASS |
| 3 — pane guard + `hitTestTradeLine(x,y)` (D19.A/J) | `a10d089` / merge `75e747e` | ✅ | ✅ PASS |
| **2 — `chartView$` lookahead fix (HIGH)** | `7e4ab2a` | ✅ | ❌ **NOT AUDITED** |
| 5 — `assertNoLookahead` (D19.I) | — | ❌ | ❌ |

Wave 1 worktrees (`../rfc019-t{1,3,4}`) and their branches are **removed**; the commits live
in the merge history. Working tree was clean at pause.

---

## §2 — FIRST ACTION: Checkpoint 2. It is a hard gate.

Do this before anything else. Do **not** start Task 5 to "save a dispatch."

**Step 1 — four gates, raw, from `emulador/`.** Never pipe through `| tail`/`| head` (it
swallows the non-zero exit); `> file 2>&1` is fine, it preserves `$?`. Never bare
`npx vitest run` — only `ng test` bootstraps the TestBed.

```bash
cd emulador && npx tsc -p tsconfig.app.json --noEmit && npx tsc -p tsconfig.spec.json --noEmit && npm run lint && npx ng test --watch=false
```

Confirm **165 files / 2043 tests**. If it differs, the ledger records the real number and
the discrepancy — it does not "correct" the claim.

**Step 2 — dispatch a `branch-auditor` (Opus) for an INDIVIDUAL audit of Task 2 only.**
Diff under audit: `20f830a..7e4ab2a`. The auditor **re-runs every gate personally**;
implementer and orchestrator reports are claims.

Attention flags the audit brief must carry:

| Flag | What to verify |
| :--- | :--- |
| **B1 — the C1 override** | `chartView$` must gate on `panelTracksPrimarySeries`, **never** `panelRendersTrades`. The latter carries `!hideTrades`; gating on it would make a `hideTrades: true` panel fall back to `idx` inclusive and **re-paint the future candle** — reintroducing the exact defect RFC-019 closes. Scenario 6 is the regression guard. Verify the spec genuinely exercises `hideTrades: true`, not just that the code reads right. |
| **B2 — D-B1 (N19-2)** | `idx - 1` conditioned on `subGrain` **alone**, never on `forming != null`. Scenario 3 (gap → `forming === null` **and `idx` still decremented**) is the proof. Verify the fixture really produces `hi < lo` rather than merely asserting the shape. |
| **B3 — single-panel byte-identity** | Scenario 1. The most common configuration must be provably unchanged. Verify the spec compares against the *actual* pre-RFC emission, not a hand-written expectation that could encode the same bug. |
| **B4 — Step 1 refactor is behavior-preserving** | `panelRendersTrades` / `panelMayExecute` re-expressed via `panelTracksPrimarySeries`. **All pre-existing predicate specs must pass untouched** — that is the substitution proof. |
| **B5 — deviation D2 (judgement call)** | The brief's scenarios 8/9 specified a `vi.spyOn` call-count proof of the D19.H memo; the implementer used **reference-identity assertions**, reporting that `vi.spyOn` throws `TypeError: Cannot redefine property` on this module (strict-mode ESM bindings) with no codebase precedent for spying app-source modules. **Verify the `TypeError` claim independently**, then rule whether reference-identity establishes memoization as strongly as a call count. |
| **B6 — memo staleness (plan risk R7)** | `resolveForming`'s key includes `cursor`, so a rewind should be a miss by construction. An R7 rewind spec is claimed — verify it actually rewinds and re-advances. |
| **B7 — `idx = -1` boundary (plan risk R4)** | Scenario 7. Confirm `render()`'s incremental `while` loop and `renderWindow` tolerate `idx === -1` — the ledger notes this was reasoned through but **not verified by execution**. |
| **B8 — dead-code deletion (D19.G/C6)** | Inline `generateCustomSeries` block, the `activeSeconds = minutes * 60` recompute, the `?? 0` fallback, and the now-unused `computeFormingCandle` wrapper all gone; the `generateCustomSeries` **import stays** (`resolvePanelCandles` uses it). |

Invariant greps for the auditor to run itself:

```bash
grep -rn "selectFormingCandle(" emulador/src --include=*.ts          # zero calls WITH an argument (D8)
grep -n  "panelRendersTrades" emulador/src/app/components/chart/chart-model-mapper.service.ts   # zero inside chartView$
grep -rn "from '.*spec-util'" emulador/src/app --include=*.ts | grep -v "\.spec\.ts"            # zero (kernel inv. 7)
git diff --stat 0e66392 -- emulador/package.json emulador/package-lock.json                     # empty (kernel inv. 8)
grep -rn "@angular\|@ngrx" emulador/src/app/domain/chart/                                       # zero (kernel inv. 1)
```

**PASS = zero Critical/High/Medium.** On a fail: fix, re-audit, and only then proceed.
Record the outcome in ledger §8.3.

---

## §3 — Wave 3: Task 5 (only after Checkpoint 2 PASSes)

**Task 5 — `assertNoLookahead` + boundary specs (D19.I, N19-4).** Plan §3 Task 5. Risk LOW,
additive test code, touches no production logic. Dispatch one `sdd-implementer`.

Files: new `emulador/src/app/components/chart/lookahead-invariants.spec-util.ts`, plus
`chart-model-mapper.service.spec.ts`.

The brief must carry, non-negotiably:

1. **The invariant, stated plainly.** *No candle whose close exceeds the replay cursor may
   reach the render model, on any panel, at any timeframe.* A candle opening at `t` on an
   `activeSeconds` timeframe closes at `t + activeSeconds` and is honest only once the
   cursor reaches that close. The forming candle is exempt from the close test **by
   construction** — it *is* the partial bar — but its **open** must not be in the future.
2. **Test-only placement (kernel inv. 7).** `*.spec-util.ts` / `*.spec.ts`, **never**
   imported from app code — a spec-util import ships vitest into the production bundle
   while tsc and tests both stay green. Precedent to model on:
   `layout-invariants.spec-util.ts` (a vitest-free predicate plus a thin vitest wrapper).
3. **Step 2 is the point of the task.** The helper must be **proven to fail** on the
   pre-RFC shape (an H1 panel with `idx` un-decremented at a mid-bucket cursor).
   *An invariant that cannot fail is not an invariant.*
4. **The scenario matrix** (plan §3 Task 5 Step 3): H1+M5 mid-bucket; single M5 panel with
   no resolution; `idx === 0` boundary; hidden panel via `setUpdatesEnabled(false)` (must
   emit nothing — C5 gating still holds); foreign-symbol panel (`forming === null`);
   unconfigured mapper (`descriptor: null` → falls back to `globalChartView`).
5. **The critical instruction:** *if a scenario fails, that is a **Task 2 defect** — report
   it, do not patch the assertion.* An implementer who weakens `assertNoLookahead` to make
   it pass has destroyed the deliverable. **The invariant is the durable artifact of this
   RFC; the patches are not.**

**Checkpoint 3:** four gates raw; confirm `assertNoLookahead` both passes on current
behavior **and** provably fails on the pre-RFC shape; then **Batch A audit part 2** —
a `branch-auditor` on Task 5.

---

## §4 — Final

1. Four gates + `npm run build`. Watch for **NEW chunk types** (a vitest sentinel is the
   thing to fear). The bundle-budget warning is known-accepted, Arrow/parquet-dominated.
2. Invariant greps (§2 above).
3. **Docs pass:**
   - Register RFC-019 in `docs/architecture/ROADMAP.md`. **Note before you start:** the
     ROADMAP's "Mastery Block" table currently stops at Phase 3 / RFC-016 — **RFC-017 and
     RFC-018 are not registered either.** RFC-019 declares itself "Bloque Mastery — Fase 4".
     Registering RFC-019 alone into a table that skips two predecessors will read as an
     error. Decide deliberately: either add Phase 4 and note the gap, or register all three.
     Whichever you choose, record it as a ledger decision — do not improvise silently.
   - Update `.superpowers/rfc-019/dev-log.md` with the final gate evidence.
4. **Whole-branch Opus audit.** PASS = "Ship it", zero Critical/High/Medium. Lows may be
   ruled no-fix **with written reasons** so they are not re-litigated (PHILOSOPHY §3.5).
5. **PR to `develop`** via the GitHub MCP. Body summarizes D19.A–J, the two defect classes
   (Bug A friction / Bug B fidelity) and N19-1..5. Branch protection and Supabase auth admin
   have no MCP/CLI path — if either is implicated, say so as a human dashboard task.

---

## §5 — Carried items (do not lose these)

| # | Item | Disposition |
| :--- | :--- | :--- |
| **C-1** | **Bundle figure.** The Wave 1 auditor measured `npm run build` initial total at **648.42 kB**; `CLAUDE.md` and the plan DoD both cite "~609 kB" as known-accepted. Attribution is reasoning, not measurement — Wave 1 adds ~60 net lines and cannot explain a 39 kB delta. Already a tracked open owner item from the RFC-017 run. | `CLAUDE.md` is a **protected path** — do not edit without explicit owner approval. Raise in the PR as an owner decision. |
| **C-2** | **L1 — the unreachable fail-open branch** in `inPane()` (`chart.component.ts:1415-1416`) is a future refactor trap: if engine construction is ever deferred, N19-1 stops being enforced with no test failing. | **Ruled no-fix for this PR** by the Wave 1 audit. The suggested fix (add `paneRect` to the two engine stubs and scaffold `engine` in four `handleContextMenu` tests in `chart.component.trade-guard.spec.ts`, then tighten `inPane` to fail closed) is **harness scaffolding for a LATER run**, explicitly not this one. |
| **C-3** | **F19-2 — foreign-symbol candle sourcing.** A view-only panel on a different symbol renders the **primary** symbol's candles under a foreign label (`market.reducer.ts:8`, mono-symbol D1). Pre-existing defect found in passing. N19-3 stops RFC-019 from *worsening* it; it does not fix it. | Open as its own issue (plan §5 follow-up). Not in scope. |
| **C-4** | Lows **L2–L5** from the Wave 1 audit are ruled no-fix with written reasons in ledger §8.3. | Do not re-litigate. Carry the rulings into the whole-branch audit so it does not re-raise them. |

---

## §6 — Standing rules that still bind

- **Evidence precedes assertion.** Fresh raw gate output is the only acceptable proof.
  Never claim a gate passed without it.
- **Never mask exit codes.** No `| tail`, no `| head`, no `tee | tail` on any gate.
- **`npx ng test --watch=false` only** — bare `npx vitest run` always fails (no TestBed env).
- **Pathspec commits.** `git commit <paths> -m "..."`. Never `git add -A`. Brand-new
  untracked files may need an explicit `git add` of just those files first (git
  2.47.0.windows.1 quirk hit twice in this run).
- **STOP rule.** Pre-existing specs are authority. Appending new `it`s to an existing spec
  file is additive and allowed; editing existing assertions is not.
- **Deviation honesty.** Every departure from plan or brief goes in the ledger, classified
  inert / requires-attention. Silent deviation is the one unrecoverable failure mode.
- **Angular 21 syntax:** consult the `context7` MCP before writing Signals / `linkedSignal` /
  `resource()` / standalone / new-control-flow code. Never rely on training-data recall.
- **Protected paths** — never touch without explicit approval: `pipeline/**`, `.claude/`
  hooks / `settings.json` / `steering.md`, `CLAUDE.md`.

**Degraded-run fallback:** if the session cannot finish, ship **Tasks 1 + 2** alone (plus
the already-merged 3 and 4). Task 2 is the lookahead fix, it is independently correct, and
it outranks everything else in this RFC. Task 5 then becomes a follow-up run against the
same RFC. Record the split as a ledger decision.
