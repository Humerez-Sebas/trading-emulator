# RFC-019 — Dev Log

Run ledger for `feature/rfc-019-pane-guard-cross-tf-forming` (off `develop` @ `0e66392`,
the RFC-018 merge / PR #46).

Artifact language per `CLAUDE.md` §Conventions: English here, Spanish in the RFC.

---

## 2026-07-27 — Design phase (this entry): artifacts generated, no implementation

Produced:

| Artifact | Path |
| :--- | :--- |
| RFC-019 (Spanish) | `docs/architecture/rfcs/019-pane-guard-cross-tf-forming.md` |
| Implementation plan (English) | `docs/superpowers/plans/2026-07-27-rfc-019-implementation-plan.md` |
| SDD orchestration prompt (English) | `docs/superpowers/plans/2026-07-27-rfc-019-sdd-prompt.md` |
| This log | `.superpowers/rfc-019/dev-log.md` |

No source file under `emulador/` was touched. Verification gates were **not** run — there
is nothing to verify yet; they gate the implementation commits, not the design commit.

---

## 1. Origin of the decisions

An architectural review (Opus 5, 2026-07-27) was commissioned on two defects found during
live backtesting, explicitly authorized to reject the framing. It rejected both.

**Bug A — original framing:** "the rect hit-test uses the full bounding box; make it
edge-only (TradingView parity)."

> **Rejected.** «El robo no lo causa la *forma* del hit-test. Lo causa que
> `handleMouseDown` trate coordenadas del **contenedor** como coordenadas del **pane**.»
> The review supplied three independent proofs that edge-only leaves the reported repro
> broken (RFC §3.3), the decisive one being that `hitTestTradeLine` takes no `x` parameter
> at all and runs *before* the drawing hit-test.

**Bug B — original framing:** "higher-TF panels don't form candles unless sub-TF mode is
toggled; make it automatic."

> **Rejected, and reclassified upward.** «Su panel H1 no está congelado — está pintando
> una vela futura completa.» `renderWindow` slices `[winStart, idx]` inclusive and `idx`
> resolves to the candle *containing* the cursor. This is **lookahead bias** on every
> multi-timeframe layout, not a missing convenience.

The reclassification is what disqualified three of the four candidate approaches: you do
not put lookahead bias behind a user setting (B4), and correctness cannot depend on which
panel has focus (B3).

---

## 2. Verification of the review against the tree

Every claim was re-checked at `0e66392` before writing a line of design. All confirmed:

| Claim | Verified at |
| :--- | :--- |
| `handleMouseDown` measures from the container, not the pane | `chart.component.ts:1408-1410` |
| `hitTestTradeLine` has no `x` parameter | `trading-capability.ts:220` |
| `paneWidth` pattern already exists | `trade-boxes-primitive.ts:193`, `trade-buttons-primitive.ts:145` |
| `renderWindow` slices inclusive of `idx` | `chart.component.ts:838` |
| `chartView$` gates forming on the nullable `resolutionMinutes` | `chart-model-mapper.service.ts:360-370` |
| `selectReplayTfSeconds` / `selectReplaySeries` exist and are never null | `selectors.ts:621`, `selectors.ts:607` |
| `generateCustomSeries` called inline on every emission | `chart-model-mapper.service.ts:352-358` |
| `MarketState.series` is symbol-agnostic (mono-symbol D1) | `market.reducer.ts:8` |
| `chartView$` is `.gated()` — hidden panels already skip it | `chart-model-mapper.service.ts:373` |
| Hit-test regression surface is 2 destroy-guard assertions | `drawings-capability.spec.ts:64-65` |

---

## 3. Decision ledger — D19.A to D19.J

| ID | Decision | Rationale |
| :--- | :--- | :--- |
| **D19.A** | Pane-rect guard: `ChartEngine.paneRect()` + guard in `handleMouseDown`, `handleHoverFeedback`, `handleContextMenu` | The real fix for Bug A. Coordinate space, not hit-test shape (RFC §3.1). ~8 lines + accessor; pattern exists at 2 sites. Accessor lives in the engine because it reports geometry, not behavior — kernel inv. 2 intact. |
| **D19.B** | Paint-geometry hit-test: rect = 4 edges, fib = 7 level lines; share `y1+(y2-y1)*level` with `drawFib` | Independent UX change, **demoted from "the fix"**. One rule instead of a per-kind menu, so it resolves the rect/fib inconsistency rather than creating it. Sharing the formula makes renderer/hit-test drift impossible. |
| **D19.C** | Swap `chartView$` inputs → `selectReplayTfSeconds` / `selectReplaySeries` / `selectCurrentAsset` | The real fix for Bug B. Removes a conflation instead of adding a mode. The effective, never-null grain already exists and the fill engine already uses it. |
| **D19.D** | D-B1: `idx - 1` conditioned on `subGrain`, never on `forming != null` | When the honest partial bar is uncomputable (gap → `hi < lo`), today's code falls through to `idx` inclusive and paints the future candle. Wrong failure mode. Declared behavior change in sub-TF mode too. |
| **D19.E** | Symbol gate: the isolated T-1 clause via a new `panelTracksPrimarySeries` | **Amended against the brief — see §4 D1.** |
| **D19.F** | Collapse `selectFormingCandle` + `computeFormingCandle` into `aggregateFormingCandle(resSeries, bucketStart, cursor)` | The two implementations are near-identical but only the mapper's carries the `grain >= activeSeconds` guard; the selector is safe only by construction. Duplication that can diverge. **Amended against the brief — see §4 D2.** |
| **D19.G** | Route `chartView$` through `resolvePanelCandles`; drop the inline `generateCustomSeries` | Live perf defect: RFC-018 F3 built the memo for exactly this and consolidated two of three streams onto it, leaving out the one that actually drives rendering. O(n) aggregation per replay tick, fresh array reference every time. |
| **D19.H** | Memo slot keyed `(replaySeries, bucketStart, cursor)` | `chartView$` recomputes on any of 8 `combineLatest` inputs, not just the cursor. O(bucket) form kept deliberately — an incremental O(1) form is only valid under monotonic advance and breaks on jumps and rewind. |
| **D19.I** | `assertNoLookahead` test invariant, mirroring `assertNoCandles` | Nothing in the suite asserts it today, which is why a multi-timeframe emulator has been showing the future for the life of the multi-panel feature. **This is the durable artifact of the RFC; the patches are not.** Test-only (kernel inv. 7); precedent `layout-invariants.spec-util.ts`. |
| **D19.J** | `hitTestTradeLine(x, y)` | Low priority — D19.A already protects the reported case. Kept as defense in depth and to close a misleading signature. Deferrable without reopening the defect. |

---

## 4. Deviations detected while generating the artifacts

| # | Deviation | Classification | Resolution |
| :--- | :--- | :--- | :--- |
| **D1** | **The brief's D19.E is defective.** It says "reuse `panelRendersTrades`", and its Task 2 pseudocode uses it in `subGrain`. But `panelRendersTrades` (`layout.models.ts:48-55`) is `symbol match ∧ !hideTrades`. A panel with `hideTrades: true` would lose its forming candle and **fall back to `idx` inclusive — re-painting the future candle.** The gate as briefed reintroduces the exact defect RFC-019 exists to close. | **REQUIRES-ATTENTION — blocking** | D19.E amended. The T-1 clause is extracted to `panelTracksPrimarySeries` and both existing predicates are re-expressed in its terms (pure refactor, provable by substitution: `panelMayExecute` is *literally* this predicate today, but its name speaks of trading verbs — reusing it for candle fidelity would be a naming lie). Recorded as plan §0 **C1** with a dedicated regression spec (Task 2, scenario 6). |
| **D2** | The brief's D19.F specifies the shared fn "takes **seconds**". Every caller already computes `bucketStart` from its own `activeSeconds`; threading a duration through only re-creates the `/60` hazard one layer down. | Inert (refinement in the brief's own direction) | Signature is `aggregateFormingCandle(resSeries, bucketStart, cursor)` — no duration, no policy. Policy stays in each caller. Recorded as plan §0 **C2**. |
| **D3** | The brief's §1 says "branch desde `main`" and §7 says "PR a `main`". `CLAUDE.md` §Git: architectural/RFC work branches from `origin/develop` and PRs to `develop`; **never PR an individual RFC to `main`.** RFC-018 (PR #46) followed exactly that. | **REQUIRES-ATTENTION** | Repo rule wins. Branch cut from `origin/develop` @ `0e66392`; PR target is `develop` in the RFC (§11), the plan (header, DoD) and the prompt (§1, §7). Flagged to the owner. |
| **D4** | Brief risk "parked/hidden panels still compute forming — wasteful" | Inert (already false) | `chartView$` carries `.gated()` (`chart-model-mapper.service.ts:373`, RFC-009 D6). No work needed; Task 5 scenario 4 asserts the gating survives the change. Recorded as plan §0 **C5**. |
| **D5** | Brief implies `activeSeconds` may be 0 for custom M-timeframes, justifying the `?? 0` fallback and the `activeSeconds = minutes * 60` recompute | Inert (dead code) | `descriptor.timeframe` is typed `Timeframe`; `TIMEFRAME_SECONDS` covers every member (`models.ts:28-49`). D19.G deletes both. Recorded as plan §0 **C6**. |
| **D6** | Brief's Task 3 lists `hitTestTradeLine` as a single-signature change | Inert | Two call sites (`chart.component.ts:1447` and `:1513`) must both be updated or `tsc` fails. Recorded as plan §0 **C4**. |
| **D7** | Deliverable paths: the brief names the spec `docs/superpowers/plans/2026-07-27-rfc-019-implementation-plan.md` | Inert (consistent) | Matches the established convention (`2026-07-26-rfc-018-implementation-plan.md`). The SDD prompt is filed alongside it rather than in `specs/`, since it is run-orchestration, not design. |

---

## 5. Risks carried into implementation

| # | Risk | Task | Why it matters |
| :--- | :--- | :--- | :--- |
| **R1** | **Lookahead** — `subGrain` computed wrong returns future candles silently. | Task 2 | The defect this RFC exists to close. Two independent checks: the 9-scenario matrix, and `assertNoLookahead` (Task 5) written by a different implementer. |
| **R2** | **The C1 trap** — an implementer following the original brief wires `panelRendersTrades` and reintroduces lookahead for `hideTrades` panels. | Task 2 | Highest-probability way to get this task wrong. Task 2's brief must carry C1 verbatim, plus scenario 6 and the grep. |
| **R3** | **Single-panel drift** — the most common configuration silently changes. | Task 2 | Byte-identity is provable by construction (`activeSeconds > replaySeconds` is false), so scenario 1 is a cheap, non-negotiable guard. |
| **R4** | **Coordinate space** — a wrong height source in `paneRect()` rejects valid in-pane clicks; a wrong width leaves the axis strip exposed. | Tasks 3-4 | Guarded in both directions: scenarios 3/4 (axis must pass through) and scenario 5 (pane must still select). |
| **R5** | **Hit-test over-tightening** — thin shapes become ungrabbable. | Task 4 | Analysis says the opposite (a 2 px rect has both edges within tolerance), but the claim is asserted, not assumed: scenario 6. |
| **R6** | **`idx = -1` boundary** — `renderWindow` paints `[]` and `renderedIdx` sticks at `-1`. | Tasks 2, 5 | Reasoned through against `render()`'s incremental loop and believed safe; not verified by execution. Needs the boundary spec, not a reassurance. |
| **R7** | **Memo staleness after rewind.** | Task 2 | Keying on `cursor` makes a rewind a miss by construction; spec it anyway. |

---

## 6. Follow-ups deliberately not in scope

| # | Item | Why deferred |
| :--- | :--- | :--- |
| **F19-1** | Per-panel replay resolution | Real feature, orthogonal, much larger, conflicts with the global replay cursor. Own RFC if traders ask. |
| **F19-2** | **Foreign-symbol panels render the primary symbol's candles under a foreign label** (`market.reducer.ts:8`, mono-symbol D1) | Pre-existing defect found in passing. N19-3 stops RFC-019 from *worsening* it (no false forming), but does not fix it. **Should be opened as its own issue.** |
| **F19-3** | Touch/mobile hit-testing | Desktop-first. D19.B improves thin shapes, which was the real touch risk. |
| **F19-4** | Z-order hover disambiguation for stacked drawings | D19.B already improves reachability. Hover disambiguation belongs to TEDS Phase 3. |
| **F19-5** | Register RFC-019 in `docs/architecture/ROADMAP.md` | Docs pass at branch finalization, per the plan's DoD. |

---

## 7. Run state

**Status:** design committed, implementation **not started**.

**Next action:** open a fresh session and paste
`docs/superpowers/plans/2026-07-27-rfc-019-sdd-prompt.md`. It boots the orchestrator,
re-verifies the gate baseline (RFC-018 closed at 1989 tests — a claim to be checked, not
trusted), and runs Wave 1.

**Ledger note:** the run ledger proper is `.superpowers/sdd/progress.md` (git-tracked) per
`sdd-orchestration.md`. This file holds RFC-019's design rationale and deviation record;
the orchestrator writes run mechanics there.

> **Superseded at run start (2026-07-27) — see §8.2 decision O1.** The run ledger for
> RFC-019 lives in **§8 of this file**, not in `.superpowers/sdd/progress.md`, following
> the RFC-018 precedent (`.superpowers/rfc-018/dev-log.md` §8). `progress.md` still holds
> the RFC-017 ledger and is not clobbered.

---

## 8. Implementation run — ledger

### 8.0 Run header

| Field | Value |
| :--- | :--- |
| **RFC** | `docs/architecture/rfcs/019-pane-guard-cross-tf-forming.md` (D19.A–J, N19-1..5) |
| **Plan** | `docs/superpowers/plans/2026-07-27-rfc-019-implementation-plan.md` (5 tasks; §0 corrections C1–C6 are binding over the RFC's prose) |
| **Orchestration prompt** | `docs/superpowers/plans/2026-07-27-rfc-019-sdd-prompt.md` |
| **Branch** | `feature/rfc-019-pane-guard-cross-tf-forming` @ design commit `fbf02a9` |
| **Base** | `develop` @ `0e66392` (RFC-018 merge, PR #46) |
| **PR target** | **`develop`** — architectural/RFC track. Never an individual RFC to `main` (`CLAUDE.md` §Git). |
| **Run mode** (`decision-frameworks.md` §8) | **TIERED with batched review.** Tasks 1/3/4 → **Batch A** (one `branch-auditor` dispatch post-Wave 1, a second post-Wave 3 for Task 5). Task 2 → **Batch B**, individual audit, **PASS gates Wave 3**. ONE whole-branch Opus audit gates the PR. |
| **Implementer** | `sdd-implementer` subagent, one brief each, TDD, pathspec commits |
| **Auditor** | `branch-auditor` subagent (Opus) — re-runs all gates personally |
| **Wave structure** | W1 = T1‖T3‖T4 (parallel, separate worktrees, disjoint file sets) → W2 = T2 (sequential) → W3 = T5 (sequential) |

### 8.1 Baseline — orchestrator-run, fresh raw output, 2026-07-27

Run from `emulador/` on a **clean tree** at HEAD `fbf02a9`, each gate raw and unpiped, exit
status read directly. This is the arithmetic origin for every task's test-count progression.

| Gate | Command | Result |
| :--- | :--- | :--- |
| tsc app | `npx tsc -p tsconfig.app.json --noEmit` | **EXIT 0**, no output |
| tsc spec | `npx tsc -p tsconfig.spec.json --noEmit` | **EXIT 0**, no output |
| lint | `npm run lint` | **EXIT 0** — "All files pass linting." |
| tests | `npx ng test --watch=false` | **EXIT 0** — `Test Files 161 passed (161)`, `Tests 1989 passed (1989)` |

**The expected-baseline claim (1989) is confirmed by measurement.** No discrepancy to
record. Progression origin: **161 files / 1989 tests**.

### 8.2 Run decisions (orchestrator)

| # | Decision | Rationale |
| :--- | :--- | :--- |
| **O1** | RFC-019's run ledger lives in **§8 of this dev log**, not `.superpowers/sdd/progress.md`. §7's note above is superseded. | RFC-018 established this layout one run earlier (`.superpowers/rfc-018/dev-log.md` §8) and `progress.md` still carries the RFC-017 ledger; appending a second RFC's run mechanics there would bury both. Design rationale and run mechanics for one RFC belong in one tracked file. |
| **O2** | Wave-1 worktrees get their **own `npm ci`**, not a junction/symlink to the primary `node_modules`. | Three concurrent `ng test` runs sharing one `node_modules/.vite` is exactly the optimizeDeps race `docs/engineering/testing.md` documents as the source of order/cache-dependent flakes. A false red would send an implementer debugging a phantom. Disk cost is affordable (122 GB free). `npm ci` never rewrites `package-lock.json`, so the npm 11.x prune hazard does not apply — no `npm install` is run in any worktree. |
| **O3** (owner, 2026-07-28) | **ROADMAP registration shape decided by the owner.** Instead of extending the "Mastery Block" table (which stops at Phase 3 / RFC-016 and skips RFC-017 and RFC-018), add a **new bridge section** between the "Fases de Evolución" table and the "Mastery Block" table, registering **RFC-017 / RFC-018 / RFC-019** together as *Post-Infrastructure Refinements*. | The resume prompt flagged the gap and asked for a deliberate choice rather than improvisation; the owner made it. Registering RFC-019 alone into a table that skips two predecessors would read as an error, and the three RFCs are the same *kind* of work (bug fixes and UX refinement after the multi-panel infrastructure block) — a different kind from the Mastery Block's knowledge-conservation sequence, so they earn their own section rather than a fourth Mastery phase. Prompt §4 step 3 updated to carry the decision. |
| **O4** (owner, 2026-07-28) | **`CLAUDE.md`'s bundle figure is updated from "~609 kB" to "648 kB (known-accepted, Arrow/parquet-dominated)"** as part of this branch's docs pass. | Carried item C-1: the Wave 1 auditor measured `npm run build` initial total at **648.42 kB** while `CLAUDE.md` and the plan DoD both cite "~609 kB", a stale figure already tracked as an open owner item from the RFC-017 run. `CLAUDE.md` is a **protected path** — this edit is permitted only because the owner explicitly authorized it for this session, and it is recorded here so the authorization is auditable rather than assumed. |

### 8.3 Task log

#### Wave 1 — Tasks 1, 3, 4 (parallel, separate worktrees)

Dispatched simultaneously to three `sdd-implementer` subagents in worktrees
`../rfc019-t1`, `../rfc019-t3`, `../rfc019-t4` (branches `rfc019/task-{1,3,4}`), each with
its own `npm ci` per decision O2. Disjoint file sets per plan §1. **All three merged with
zero conflicts**, confirming the overlap analysis — no task exceeded its declared scope.

Merge order T1 → T4 → T3 (T1 first: it is Task 2's dependency).

---

**Task 1 — collapse forming-candle aggregation (D19.F)** — ✅ DONE

| Field | Value |
| :--- | :--- |
| Impl commit | `69b90bd` · merge `8ea8143` |
| Tests | 161/1989 → **162 files / 1997 tests** (+1 file, +8) |
| Gates | tsc app ✓, tsc spec ✓, `ng test` ✓, lint 0 problems — raw, in-worktree |
| Scope touched | `state/market/forming-candle.ts` (new), `…/forming-candle.spec.ts` (new), `state/selectors.ts`, `components/chart/chart-model-mapper.service.ts` — **exactly the 4 declared files** |

**Guard-reachability finding (the brief required deriving this, not copying it).** Given
`firstIndexAtOrAfter` → `candles.length` on overflow (never negative) and
`lastIndexAtOrBefore` → `-1` or at most `length-1`, both `lo < 0` and
`hi >= resSeries.length` from the plan's draft are **unreachable** and were correctly
omitted; `hi < lo` alone covers the empty-series case. One new guard `if (!resSeries)`
exists solely to make the exported function total against its `Candle[] | null` signature —
unreachable from either production caller, and spec'd. *Orchestrator note: this matches the
derivation I performed independently from `fill-engine.ts:458-483` before writing the brief.*

**Deviations**
- *Inert* — `git commit <paths>` rejected the two brand-new untracked files (pathspec error,
  git 2.47.0.windows.1); resolved with an explicit `git add` of **only** those two files,
  then the identical pathspec commit. Result is the exact 4-file commit specified. No
  `git add -A`.
- *Inert* — the brief's `spec-util` grep is not literally zero: it matches two **doc-comment**
  lines in `state/layout/layout-invariants.ts` (pre-existing, out of scope). Orchestrator
  re-verified with `grep -rn "from '.*spec-util'"` → **zero real imports**. Kernel inv. 7 holds.

---

**Task 4 — paint-geometry hit-test (D19.B)** — ✅ DONE

| Field | Value |
| :--- | :--- |
| Impl commit | `815dfb0` · merge `005a417` |
| Tests | 161/1989 → **162 files / 2007 tests** (+1 file, +18) |
| Gates | tsc app ✓, tsc spec ✓, `ng test` ✓, lint 0 problems — raw, in-worktree |
| Scope touched | `domain/chart/capabilities/drawings-primitive.ts` + new `drawings-primitive.spec.ts` — **2 files, nothing else** |

`distToSegment` extracted to module level (mechanical — no `this`); new exported
`fibLevelY` called by **both** `drawFib` and `hitTestDrawing`, which is the N19-5 invariant
itself. `hitTestHandle`, the 6 px tolerance and `drawFib`'s painted pixels unchanged.
**The pre-declared `drawings-capability.spec.ts:64-65` exception was NOT needed** — those
assertions test `DrawingsCapability`'s own post-destroy guard, which short-circuits before
reaching `DrawingsPrimitive`, so they are orthogonal to the geometry change.

**Deviations**
- *Inert* — the implementer's own first verification attempt piped `ng test` through
  `tee | tail -n 0`, which would have masked the exit code. It **caught this itself**,
  discarded the run, and re-ran raw. No reported gate evidence came from the piped run.
  Self-reported unprompted — exactly the deviation honesty PHILOSOPHY §5.6 asks for.
- *Inert* — new spec file rather than extending `drawings-capability.spec.ts` (the brief
  explicitly left this to the implementer's judgement; different unit under test).

---

**Task 3 — pane-space guard + `hitTestTradeLine(x, y)` (D19.A, D19.J)** — ✅ DONE

| Field | Value |
| :--- | :--- |
| Impl commit | `a10d089` · merge `75e747e` |
| Tests | 161/1989 → **163 files / 2002 tests** (+2 files, +13) |
| Gates | tsc app ✓, tsc spec ✓, `ng test` ✓, lint 0 problems — raw, in-worktree |
| Scope touched | `domain/chart/chart-engine.ts`, `components/chart/chart.component.ts`, `domain/chart/capabilities/trading-capability.ts`, + new `chart-engine.pane-rect.spec.ts`, `chart.component.pane-guard.spec.ts`, additive tests in `trading-capability.spec.ts` |

**Real class members found (the brief forbade inventing them).** `ChartEngine` had only
`chart`, `mainSeries`, `bus`, `capabilities` — **no `container` field and no `destroyed`
flag**. The implementer added `private destroyed = false` (set in `destroy()`) but did
**not** add a container field: `paneRect()` takes width from `chart.timeScale().width()`
(the established pattern at `trade-boxes-primitive.ts:193` / `trade-buttons-primitive.ts:145`)
and height from `chart.paneSize().height`. `TradingCapability` **does** hold a chart handle,
so `hitTestTradeLine` got a **real** `x` check, not an accepted-but-unused parameter.

**Deviations**
- **REQUIRES-ATTENTION — `inPane()` fails OPEN when the geometry API is absent.** The brief
  specified `return r != null && …` (fail closed). Implemented as a tri-state
  (`chart.component.ts:1414-1419`): `undefined` → `true` (allow), `null` (destroyed) →
  `false` (block), otherwise bounds-check. Reason: the literal spec would have broken
  **pre-existing** `chart.component.trade-guard.spec.ts` — 4 `handleContextMenu` tests run
  with `engine === undefined`, and 2 `handleMouseDown` tests use a stub with no `paneRect`
  method. Task 3 had **no** pre-declared STOP exception, so the implementer changed the
  production semantics to satisfy the specs rather than edit them (PHILOSOPHY §5.7).
  Claimed unreachable in production because listeners attach only after engine
  construction. **That reachability claim is a claim, not evidence — flagged to the auditor
  as attention item A1 for independent verification.**
- *Recorded for the auditor (A2):* `private destroyed` is **new state on the engine core**,
  which kernel inv. 2 closes to modification. D19.A argues `paneRect()` is exempt as
  geometry reporting; whether a lifecycle flag falls inside that exemption is an explicit
  audit question, not an orchestrator ruling.

---

#### Checkpoint 1 — post-Wave-1 gates (orchestrator, fresh raw output, merged branch @ `75e747e`)

| Gate | Result |
| :--- | :--- |
| `npx tsc -p tsconfig.app.json --noEmit` | **EXIT 0** |
| `npx tsc -p tsconfig.spec.json --noEmit` | **EXIT 0** |
| `npm run lint` | **EXIT 0** — "All files pass linting." |
| `npx ng test --watch=false` | **EXIT 0** — `Test Files 165 passed (165)`, `Tests 2028 passed (2028)` |

**Arithmetic verified:** 161 + 1 + 2 + 1 = **165 files**; 1989 + 8 + 13 + 18 = **2028
tests**. The merged total matches the sum of independently-measured per-task deltas exactly
— no specs silently skipped or deleted.

*(Output was redirected with `> file 2>&1`, which preserves `$?`; the prohibition is on
pipes such as `| tail` that replace the exit status with the pipe's own.)*

**Batch A audit part 1** dispatched over Tasks 1/3/4 together, with attention flags A1
(`inPane` fail-open reachability), A2 (`destroyed` flag vs. kernel inv. 2), A3 (mixed
width/height geometry sources vs. plan risk R5), A4 (`drawFib` pixel identity + N19-5),
A5 (Task 1 policy byte-identity + `chartView$` untouched), A6 (D19.B framing).

**Wave 2 held until the audit returns** — Task 2 edits `chart-model-mapper.service.ts`,
which the auditor is reading as part of Task 1's diff, and Task 2 builds directly on
`aggregateFormingCandle`. Running them concurrently would give the auditor a moving target.

**Ledger completeness fix (auditor finding L6).** Plan §3 Task 3 Step 3 asked the
implementer to "compute `x`/`y` once at the top and reuse them". The implementation instead
introduced a separate `guardRect` at `chart.component.ts:1430` and left the two later
`getBoundingClientRect()` calls (`:1436`, `:1447`) in place — three layout reads per
mousedown rather than two. **Classification: inert.** The deviation is strictly *safer* than
what the plan asked for: it avoids the exact hazard the plan warned about (perturbing the
`placing()` / `quickRuler` / `activeTool()` short-circuits) at zero behavioral cost, and
`mousedown` is not a hot path. The hover handler — which *is* hot (`mousemove`) — reuses its
existing `x`/`y` and gained no extra layout read. Recorded here because a deviation must
never be silent, not because it needs action.

---

#### Batch A audit part 1 — Tasks 1, 3, 4 · **PASS ("Ship it")**

`branch-auditor` (Opus), all gates re-run personally at code-HEAD `75e747e`.

| Result | Value |
| :--- | :--- |
| Verdict | **PASS** — Task 1 PASS, Task 3 PASS, Task 4 PASS |
| Critical / High / Medium | **0 / 0 / 0** |
| Low | 6, **all ruled no-fix with written reasons** (PHILOSOPHY §3.5) |
| Auditor's own gates | tsc app 0, tsc spec 0, lint 0, `ng test` **165 files / 2028 tests**, `npm run build` 0 — **no vitest sentinel, no new chunk type** |

**Arithmetic independently re-derived**, not accepted: baseline spec-file count recounted
from `git ls-tree` at `f00a478` (161), `it(` occurrences counted per new file
(T1 = 8, T3 = 13, T4 = 18), `git diff --name-status` showing 4 additions and **0 deletions**,
and a grep proving **zero** `.skip` / `.only` introduced.

**Attention-flag rulings:**

| Flag | Ruling |
| :--- | :--- |
| **A1** — `inPane()` fails open | **Not a finding.** Auditor traced it independently rather than accepting the claim: `engine` is assigned at exactly one site (`chart.component.ts:613`, first statement of `ngAfterViewInit`), the three DOM listeners attach at `:696-698` (last statements of the same straight-line method, no early return or `await`), the handlers have no other production caller, and `paneRect` is a prototype method so a real engine cannot lack it. `ngOnDestroy` removes all listeners *before* `engine.destroy()`, so the `null` branch is unreachable too. **`rect === undefined` is dead code in production; N19-1 is enforced on every path a gesture can take.** Accommodating the pre-existing specs (rather than STOPping) was ruled correct, on the RFC-013 `headerLabel()` precedent. Residual refactor risk recorded as L1. |
| **A2** — `private destroyed` on the core | **Does not violate kernel inv. 2.** The invariant closes the core on the axis of *behavior*; the flag is private, adds no `RenderModel` field, no bus event and no `Capability` surface, and its only reader is `paneRect()`'s null guard. `ChartEngine` already carries two RFC-010 lifecycle flags of the same species (`applyingSync`, `suppressNextRangeEvent`). It is derivative of an exemption RFC-019 §8 already grants — exempting the accessor while excluding the line that makes it safe would be incoherent. |
| **A3** — mixed width/height sources (plan risk **R5**) | **Closed.** Verified against the installed library, not the stub: `timeScale().width()` and `paneSize().width` are both set from the same local in the layout pass, so the two calls describe **one** rect whenever the time axis is visible — which it always is here. Single-pane confirmed (zero `addPane`/`paneIndex` hits), so `paneSize(0)` is the whole plot surface and shares the space `priceToCoordinate` maps into. In-pane counter-guard specs confirmed passing. |
| **A4** — `drawFib` pixel identity + N19-5 | **Verified.** The sole renderer change is the expression → `fibLevelY(...)` call, character-identical. Non-obvious extra check the auditor performed: the renderer passes **bitmap-space** coords and the hit-test **media-space** coords; `fibLevelY` is linear and homogeneous, so sharing it across the two spaces is sound rather than a latent scaling bug. Both call sites confirmed; no second copy of the formula exists, so drift is structurally impossible. |
| **A5** — Task 1 policy byte-identity | **Verified.** Both selector and mapper guards unchanged verbatim (including the mapper-only `minutes * 60 >= activeSeconds`); only the aggregation moved; **`chartView$` is not in the diff**. Guard simplification independently re-derived from the `fill-engine` contracts. |
| **A6** — D19.B framing | **Correct everywhere** — commit body, report, ledger and code comments all present it as an independent UX change, not the Bug-A fix. `trading-capability.ts:220-224` correctly subordinates D19.J to D19.A as the enforcing guard. |

**Lows ruled no-fix** (so they are not re-litigated): **L1** unreachable fail-open branch is a
future refactor trap (with a suggested harness-scaffolding fix for a *later* run, explicitly
not this PR); **L2** `paneRect()` width couples to time-axis visibility — hypothetical, and
the same coupling already exists at the two established call sites, so any fix should be one
sweep across all three; **L3** the pane-rect spec's stub cannot detect a width/height source
mismatch — test pragmatism, and jsdom performs no layout, so R5 was closed against library
source instead; **L4** `destroy()` sets the flag after `chart.remove()` — unreachable given
listener-removal ordering; **L5** middle-click on the axis no longer calls `preventDefault()`
— **mandated by D19.A's explicit guard placement**, cosmetic, recorded so it is not
rediscovered as a regression; **L6** the ledger omission, closed above.

**Informational, carried to branch finalization:** the auditor measured `npm run build`
initial total at **648.42 kB**, while `CLAUDE.md` and the plan DoD both cite "~609 kB" as the
known-accepted figure. Attribution is reasoning, not measurement (the auditor declined to
build the baseline in a tree a parallel actor might touch), but Wave 1 adds ~60 net lines of
app code and cannot plausibly account for a 39 kB delta. This is **already a tracked open
owner item from the RFC-017 run**. `CLAUDE.md` is a protected path — not edited here; raised
in the PR as an owner decision.

---

#### Wave 2 — Task 2: `chartView$` swap, D-B1, T-1 gate, memo, `resolvePanelCandles`

**Status: IMPLEMENTED, NOT YET AUDITED.** ⚠️ Checkpoint 2 (individual Batch B audit) has
**not** run — the session paused here for a usage-limit reset. Everything below is the
implementer's **claim** plus the orchestrator's mechanical diff-scan. It is **not** audited
evidence.

| Field | Value |
| :--- | :--- |
| Impl commit | `7e4ab2a` (direct on the branch — no worktree; sole actor in the tree) |
| Decisions | D19.C, D19.D, D19.E (as amended by plan §0 C1), D19.G, D19.H |
| Invariants | N19-2 (D-B1), N19-3 (T-1 gate) |
| Tests (claimed) | 2028 → **2043** (+15: 10 in the `chartView$` matrix incl. the R7 rewind spec, 5 additive `panelTracksPrimarySeries` unit tests). **165 spec files, unchanged** |
| Gates (claimed) | tsc app ✓, tsc spec ✓, `ng test` 165 files / 2043 tests ✓, lint 0 problems |
| Scope touched | `state/layout/layout.models.ts`, `components/chart/chart-model-mapper.service.ts`, `…/chart-model-mapper.service.spec.ts`, `state/layout/layout.trade-predicates.spec.ts` — all four inside the brief's scope table |

**Orchestrator mechanical diff-scan (not an audit — that is Checkpoint 2's job):**

| Check | Result |
| :--- | :--- |
| Spec-file count claim ("165 throughout") | ✅ **Verified.** `layout.trade-predicates.spec.ts` is `M`, not `A` — it pre-existed at `20f830a`. `git ls-tree` count at `7e4ab2a` = **165**. The claim initially looked inconsistent with a new file being listed; it is not. |
| **STOP rule** — Task 2 had no pre-declared exception, yet it modified a **pre-existing** spec | ✅ **Purely additive.** The only removed line in `layout.trade-predicates.spec.ts` is the `import` statement, replaced by one that also imports `panelTracksPrimarySeries`. **Zero assertions removed or altered.** `chart-model-mapper.service.spec.ts` has **zero** removed lines. Appending new `it`s to an existing spec file is what plan §1 authorizes ("spec files are additive per task"); it is not a STOP-rule breach. |
| **C1 override** (the highest-probability failure mode) | ✅ `chartView$` gates on `panelTracksPrimarySeries(descriptor, currentAsset)`. `panelRendersTrades` appears in the file only at the import and inside `tradeChartView$` (legitimate, out of scope) — **zero occurrences inside `chartView$`**. |
| **D-B1 shape** | ✅ `if (!subGrain) return { … forming: null … }` precedes the forming branch, so `idx - 1` is structurally reachable **only** under `subGrain` and can never be conditioned on `forming != null`. |
| D19.G / C6 | ✅ `this.resolvePanelCandles(series, tf)`; `TIMEFRAME_SECONDS[tf]` with no `?? 0` and no `minutes * 60` recompute. |
| Input swap (D19.C) | ✅ `selectResolutionMinutes`/`selectResolutionSeries` gone; `selectReplayTfSeconds`, `selectReplaySeries`, `selectCurrentAsset` present. All zero-argument globals — D8-safe. |

**Deviations — all classified inert by the implementer, all forwarded to Checkpoint 2:**

| # | Deviation | Class | Note for the auditor |
| :--- | :--- | :--- | :--- |
| **D1** | Reworded two in-`chartView$` **comments** that name-dropped `panelRendersTrades` in prose, so the C1 invariant grep cannot be tripped by a comment. | Inert | Confirms the grep is now unambiguous; verify the reworded prose still states *why* the predicate is excluded. |
| **D2** | Scenarios 8/9 (memo proofs) use **reference-identity assertions instead of `vi.spyOn`**, which the brief's matrix specified. Empirically `vi.spyOn` on this module throws `TypeError: Cannot redefine property` (strict-mode ESM bindings); no codebase precedent exists for spying app-source modules. | Inert, with evidence | **Attention item.** The brief asked for a call-count proof; a reference-identity proof is a different claim. The auditor should judge whether it establishes memoization as strongly — the implementer argues it is the codebase's established idiom for this class of claim. |
| **D3** | Added direct unit coverage for `panelTracksPrimarySeries` beyond the brief's literal ask. | Inert | Purely additive. |

Scenario **1** (single-panel byte-identity) and scenario **6** (the C1 `hideTrades`
regression guard) are both reported passing — the two that would let this RFC silently fail.

**⚠️ NEXT ACTION IS CHECKPOINT 2, AND IT IS A HARD GATE.** Four gates raw, then an
individual `branch-auditor` audit of Task 2 requiring zero Critical/High/Medium. **Task 5
must not be written until that PASSes** — Task 5's entire purpose is to check Task 2
independently, and it is worthless if authored against behavior that has not been verified.
Resume instructions: `docs/superpowers/plans/2026-07-27-rfc-019-resume-prompt.md`.

---

#### Checkpoint 2 — post-Wave-2 gates (orchestrator, fresh raw output, @ `6fe0d8b`)

Session resumed 2026-07-28 after the usage-limit pause. Clean tree, each gate raw and
unpiped, exit status read directly.

| Gate | Result |
| :--- | :--- |
| `npx tsc -p tsconfig.app.json --noEmit` | **EXIT 0**, no output |
| `npx tsc -p tsconfig.spec.json --noEmit` | **EXIT 0**, no output |
| `npm run lint` | **EXIT 0** — "All files pass linting." |
| `npx ng test --watch=false` | **EXIT 0** — `Test Files 165 passed (165)`, `Tests 2043 passed (2043)` |

**The implementer's 2043 claim is confirmed by measurement.** No discrepancy to record.
Progression: 1989 (baseline) → 2028 (Wave 1) → **2043** (Task 2, +15).

---

#### Batch B audit — Task 2 (individual) · **PASS ("Ship it")**

`branch-auditor` (Opus), diff `20f830a..7e4ab2a`, all gates re-run personally at `6fe0d8b`.

| Result | Value |
| :--- | :--- |
| Verdict | **PASS** |
| Critical / High / Medium | **0 / 0 / 0** |
| Low | 4 (L1 fix-now doc-only; L2–L4 ruled no-fix with written reasons) |
| Auditor's own gates | tsc app 0, tsc spec 0, lint 0, `ng test` **165 files / 2043 tests**, exit 0 |

**Arithmetic independently re-derived:** `git ls-tree` spec-file count at `7e4ab2a` = 165
(+0); `it(` additions across `20f830a..7e4ab2a` = **+15, zero removed**; all four files `M`,
none `A`; zero `.skip`/`.only` introduced. Scope is exactly the four claimed files —
`panelChartView$`, `tradeChartView$`, `selectChartView` and `chart.component.ts` confirmed
untouched by `git diff --name-status`.

**Invariant greps re-run by the auditor:** `selectFormingCandle(` with an argument → zero
(D8); `panelRendersTrades` in the mapper → lines 52/563/598 only, `chartView$` spans 337–395,
**zero occurrences inside it** (C1); `spec-util` imports from non-spec app code → zero;
`package.json`/`package-lock.json` diff vs `0e66392` → empty (kernel inv. 8); `@angular`/
`@ngrx` under `domain/chart/` → zero (kernel inv. 1). One pre-existing vitest import exists at
`src/app/testing/workspace-db.stub.ts:1` — **not in this diff**, and imported by zero non-spec
files, so kernel inv. 7 holds.

**Attention-flag rulings:**

| Flag | Ruling |
| :--- | :--- |
| **B1** — the C1 override | **PASS.** `chartView$:378` gates on `panelTracksPrimarySeries`. Scenario 6 really constructs `{ symbol: 'US30', timeframe: 'H1', hideTrades: true }` on the *same* fixture as scenario 2 and asserts `forming` non-null, `forming.time === 3600`, `idx === 0`. `hideTrades` is a real field (`layout.models.ts:31`), so the override is exercised, not merely read — had the gate used `panelRendersTrades`, this spec fails. |
| **B2** — D-B1 (N19-2) | **PASS, non-vacuous.** The auditor traced scenario 3's fixture by hand: `m5 = [{time:0}]`, `bucketStart = 3600`, `cursor = 4200` → `firstIndexAtOrAfter` returns `length` on overflow ⇒ `lo = 1`, `lastIndexAtOrBefore` ⇒ `hi = 0`, so **`hi < lo` is genuinely taken**; `idx` 1 → asserted 0. Forming null *and* idx decremented. |
| **B3** — single-panel byte-identity | **PASS.** Pre-RFC emission re-derived from the deleted code for the same fixture and matched field by field; the spec even asserts `toBe(m1)` (reference identity), which `resolvePanelCandles` preserves. Field-coverage nit → L3. |
| **B4** — Step 1 refactor | **PASS.** The only removed line in `layout.trade-predicates.spec.ts` is the `import`. **Zero pre-existing assertions removed or altered**; all six pre-existing predicate specs pass untouched. The substitution proof holds. |
| **B5** — deviation D2 (`vi.spyOn` → reference identity) | **No finding.** The auditor **independently reproduced** the failure with a throwaway probe spec: `AUDIT_PROBE_RESULT >>> THREW TypeError: Cannot redefine property: aggregateFormingCandle` (probe deleted, tree restored). Ruling: reference identity is **logically equivalent here, not weaker** — `aggregateFormingCandle` allocates a fresh object literal on every non-null return, and `resolveForming` has exactly two paths, so `r2.forming === r1.forming` is reachable *only* via the cache hit. The one gap (a `null` return compares `=== null` on both paths) does not apply: scenario 8 asserts `forming` non-null throughout. **Ruled acceptable — do not re-litigate.** |
| **B6** — memo staleness (R7) | **PASS.** The spec advances (cursor 4200, `forming.high === 15`), **rewinds** (3600, asserts `high === 12` — no carryover), then **re-advances** (4200, `high === 15` again, `not.toBe(rewound.forming)`). Asserts content, not just reference — exactly the proof an O(1) incremental form would have failed. |
| **B7** — `idx = -1` boundary (R4) | **PASS — now verified by execution and source, not reasoning.** `renderWindow` (`chart.component.ts:838`) is explicitly `idx >= 0 ? … : []`; the incremental `while (this.renderedIdx < idx)` at `:786` is a no-op at `-1/-1`; a drop from 5 to −1 takes the setData path; `updateCountdown` yields `price = null` and `buildCountdownModel` accepts null. **`idx === -1` was already reachable pre-RFC** — `chart.component.ts:751` carries a comment acknowledging it. Task 2 widens reachability; it does not create the state. |
| **B8** — dead-code deletion (D19.G/C6) | **PASS, all four.** Inline `generateCustomSeries` block, `activeSeconds = minutes * 60` recompute, `?? 0` fallback and the `computeFormingCandle` wrapper are all gone; the `generateCustomSeries` **import stays** (line 57), correctly. C6's premise re-verified member by member: `TIMEFRAME_SECONDS[tf] === minutes * 60` for M1..M30, so `countdown` is byte-identical on the custom-series path too. |
| **B9** — comment rewording (D1) | **PASS.** The reworded doc comment still carries the C1 *why* in full ("…`hideTrades` … is a visibility preference that must never govern candle fidelity … would silently reintroduce the exact lookahead this RFC closes…"). Referent nit → L4. |

**Cleared in passing, recorded so it is not re-opened:** the auditor chased whether
`bucketStart = floor(cursor / activeSeconds) * activeSeconds` misaligns for D1/W1/MN1 panels
(epoch buckets vs. broker session boundaries), since Task 2 widens when that formula fires.
**Cleared** — `pipeline/parquet_builder.py:90` resamples D1 from M1 on a **UTC** index, so
shipped D1 candles are UTC-midnight-aligned; W1/MN1 are not produced by the pipeline at all
and `generateCustomSeries` only synthesizes `M*`, so those panels resolve to `EMPTY_CANDLES`.
The formula is also identical to the pre-existing `computeCountdown` / `selectFormingCandle`.

##### Lows and their dispositions

**L1 — foreign-symbol / null-descriptor panels are outside N19-4, and that must be written
down BEFORE Task 5 is dispatched.** *(Fix-now, doc-only — no code change.)*

A foreign-symbol observation panel (`timeframe: 'H1'`, active TF H1, Replay Resolution on at
M5) fails `panelTracksPrimarySeries`, so `subGrain` is false and it emits **`idx`** — the
containing candle — where pre-RFC it emitted `idx - 1`. **This is not a plan deviation:**
plan §3 Task 2 scenario 5 prescribes exactly `forming === null, idx untouched`, RFC §9.2's
diagram shows the same, and D19.E/N19-3 mandate the gate. The implementer had zero latitude.

The gap is documentary, and it has a concrete downstream consequence: plan §3 **Task 5
scenarios 5 and 6** ("foreign-symbol panel → `assertNoLookahead` passes"; "unconfigured
mapper → `globalChartView`, passes") would **fail** on a faithful fixture, and Task 5's own
brief tells the implementer that a failing scenario is *a Task 2 defect to report, not an
assertion to patch*. Without this entry that instruction misdirects a whole cycle.

**Ruling (orchestrator, on the auditor's disposition):** both paths are **F19-2 territory,
explicitly deferred by RFC §10** — a foreign-symbol panel already renders the *primary*
symbol's candles under a foreign label (`market.reducer.ts:8`, mono-symbol D1), so its
lookahead is a strict subset of a larger pre-existing lie that N19-3 stops RFC-019 from
worsening and does not claim to fix. The null-descriptor branch is the legacy
`globalChartView` one-frame fallback, which has no lookahead guard at all and is untouched by
this RFC. Task 5 therefore **asserts the documented behavior explicitly on those two paths
(with F19-2 named in the spec) rather than running `assertNoLookahead` on them** — the
invariant is carved out in the open, never weakened. A **V9 row** goes into RFC §7 at branch
finalization, and the carve-out is surfaced in the PR body as an owner-visible item.

**L2 — `replayTfSeconds === 0` degenerate frame** (`chart-model-mapper.service.ts:379`).
`selectActiveTfSeconds` returns 0 when `activeTf == null && customTf == null`, so `subGrain`
could be true for a symbol-matching panel in that window. **Ruled NO-FIX:** the auditor could
not demonstrate the window is reachable (a configured panel requires a mounted workspace ⇒ a
session ⇒ `activeTf`); in that state the whole app is degenerate (every countdown and
`selectAvailableResolutions` are zeroed by the same 0); and the divergence direction is **one
fewer candle, never more** — it fails toward D-B1 and cannot produce lookahead. Single frame,
self-correcting.

**L3 — scenario 1 asserts three of six emission fields** (`forming`, `idx`, `candles`; not
`tf`, `utcOffset`, `countdown`). **Ruled NO-FIX** (test pragmatism ≠ production risk,
PHILOSOPHY §3.5): all six were re-derived against the deleted pre-RFC code and are identical;
`countdown` is provably unchanged because `computeCountdown` is untouched and its only input
went from `TIMEFRAME_SECONDS[tf] ?? 0` / `minutes * 60` to `TIMEFRAME_SECONDS[tf]`, equal in
every reachable case.

**L4 — ambiguous referent in the C1 doc comment** (`chart-model-mapper.service.ts:326-329`):
"the sibling trade-ink predicate **one block below**" is one block below in
`layout.models.ts`, not in this file. **Ruled NO-FIX for Task 2**; folded into the
branch-finalization docs pass. The load-bearing C1 rationale is fully present; rewording now
would re-touch the file the C1 grep is anchored on for no correctness gain. Suggested wording
for the docs pass: name the file, not the symbol, so the grep stays clean.

**Checkpoint 2 is PASSED. Wave 3 (Task 5) is unblocked.**

---

#### Wave 3 — Task 5: `assertNoLookahead` + boundary specs (D19.I, N19-4)

| Field | Value |
| :--- | :--- |
| Impl commit | `19602cc` (direct on the branch — sole actor in the tree) |
| Tests | 2043 → **2051** (+8); **165 spec files, unchanged** (the new file is `.spec-util.ts`) |
| Gates (orchestrator-verified, Checkpoint 3, raw) | tsc app **EXIT 0**, tsc spec **EXIT 0**, lint **EXIT 0**, `ng test` **EXIT 0** — `Test Files 165 passed (165)`, `Tests 2051 passed (2051)` |
| Scope touched | new `components/chart/lookahead-invariants.spec-util.ts`; `…/chart-model-mapper.service.spec.ts` (appended) — **zero production files** |

**Orchestrator mechanical diff-scan (`b4018ee..19602cc`):** 2 files (`M` spec, `A` spec-util),
zero production files, the only removed line is an `import`, `+8 it(`, zero `.skip`/`.only`,
165 `.spec.ts`. STOP rule intact.

**Implementer deviations:** two inert (import-line edit; the new `describe` nested *inside* the
existing `chartView$` block to reuse its `candle`/`descriptor`/`emit`/`dummyGlobalView`
helpers) and **one requires-attention, self-reported unprompted** — deviation #3, the scenario-2
cursor choice, escalated to the auditor as attention flag A1. That self-report is what surfaced
the finding below; it is exactly the deviation honesty PHILOSOPHY §5.6 asks for.

---

#### Batch A audit part 2 — Task 5 · **NOT PASS** (1 Medium, 3 Low)

`branch-auditor` (Opus), diff `b4018ee..19602cc`, all gates re-run personally at `19602cc`
(tsc app 0, tsc spec 0, lint 0, `ng test` 165/2051 exit 0). Arithmetic independently
re-derived: `+8 it(`, zero removed, exactly one removed line in the whole diff, all 13
ledger-cited commit hashes resolve. The auditor additionally ran `npm run build` (not required
at this checkpoint) precisely because Task 5 adds a **new vitest-importing file under
`src/app`**: **EXIT 0, 648.44 kB, no new chunk type, and zero `vitest` / zero
`lookaheadViolation` occurrences anywhere in `emulador/dist/`** — kernel inv. 7 proven by
build, not by grep alone.

##### M1 (Medium) — the invariant is off by one replay grain and is falsified by production

**Proven by execution, not reasoning.** The auditor wrote throwaway probe specs, ran the real
suite, read the values, deleted them and confirmed a clean tree.

The helper tests `candles[i].time + activeSeconds <= cursor`. But the replay cursor **names the
OPEN of the last revealed candle on the replay grain** — confirmed at `replay.effects.ts:49`
(`advance$` → `goToTime({ time: candles[next].time })`), and likewise `jumpBack$:147`,
`jumpForward$:131`, `stepBack$:73`, `foldForwardFills:193`; `ReplayState.currentTime`'s own doc
(`replay.reducer.ts:9`) says *"Timestamp of the last visible candle"*, and `renderWindow`
(`chart.component.ts:838`) slices inclusive of `idx`. The candle opening at `cursor` is
therefore fully revealed and fully painted.

Consequence, measured:

| Probe | Configuration | Result |
| :--- | :--- | :--- |
| **1** | Native-TF M5 panel, cursor `600` (what `advanceCandle` actually sets) | **THROWS** — `candles[2] opens at 600 and closes at 900, which is AFTER the replay cursor (600)` |
| **2** | M1 panel finer than an H1 grain (RFC §4.3 row 3, *"ya correcto"*) | **THROWS** — `candles[2] opens at 3600 and closes at 3660 … cursor (3600)` |
| **3** | Pre-RFC defect (H1, `idx` un-decremented, cursor 4200) | flagged under **both** the strict and the relaxed form ✅ |
| **4** | Sub-TF H1/M5 emission | passes under both ✅ |

So the checker is satisfiable on **1 of the 3** rows of RFC §4.3, while N19-4's own text claims
*"en ningún panel, en ninguna temporalidad"*. The implementer's scenario 2 masked this by
choosing `cursor = 900` — the *close* of the last painted M5 candle — a value no production
path produces (the next `advanceCandle` on that fixture yields `endOfData`), and wrote the
masking arithmetic into the spec as if it were principled.

**Severity Medium, not Low:** `decision-frameworks.md` §6's "risk confined to test code"
carve-out is about incidental scaffolding. Here **the test artifact *is* the deliverable**,
registered as repo invariant N19-4, and the RFC states it is the RFC's only durable output. The
concrete failure mechanism: the next engineer to call `assertNoLookahead` on a native-TF or
finer-than-grain path gets a false positive, and both rational responses — fudge the cursor as
scenario 2 did, or delete the invariant as junk — destroy the artifact. Not High/Critical: zero
production code is affected, nothing ships broken, and the checker does catch the defect it was
written for (probe 3).

**The reformulation, verified by the auditor rather than assumed.** Compare against the
*revealed instant* `R = cursor + replayGrainSeconds`. Total by algebra, given
`lastIndexAtOrBefore` guarantees `candles[idx].time <= cursor`:

- native TF (`activeSeconds === replaySeconds`): `close <= cursor + activeSeconds = R` — equality at worst;
- finer than grain (`activeSeconds < replaySeconds`): `close < R` strictly;
- sub-TF with the `idx-1` decrement: `candles[idx-1].time + activeSeconds <= candles[idx].time <= cursor <= R`.

`R` is not a fudge — it is exactly "the instant through which price action has been revealed",
which is the honesty condition the RFC is actually asserting. The same off-by-one exists inside
the forming candle itself (it aggregates the grain candle at `cursor`, whose own close is
`cursor + grain`); that is **pre-existing replay semantics and explicitly not RFC-019's
business**.

##### Lows

- **L1 — the forming-clause violation branch is never exercised.** A repo-wide grep finds its
  message string only at the definition site. Task 5's own standard was applied to the candle
  clause and not to the forming clause. *Fix in the same pass — the file is being reopened.*
- **L2 — scenario 6 compares the emission to itself** (`toEqual(dummyGlobalView)` where the
  `!descriptor` branch returns the very object the `beforeEach` injected). Not fully vacuous,
  but `toBe` is strictly stronger and cheaper. *Fold into the same pass.*
- **L3 — scenario numbering collides within one file** (the nested block restarts at
  "scenario 1"). **Ruled no-fix** — the block header disambiguates, both numberings track their
  own plan sections, and renumbering would re-touch a file two audits are anchored on for zero
  correctness gain.

##### Rulings on the other attention flags — all PASS

**A2** Step-2 sensitivity is real, not staged (message reproduced by execution). **A3** kernel
inv. 7 holds, proven by build output; recorded as *not a finding*: `tsconfig.app.json` includes
`src/**/*.ts` and excludes only `*.spec.ts`, so this file **is** inside the app typecheck
program and passes because vitest ships its own module types — precisely the "tsc and tests stay
green" trap the invariant warns about. The precedent `layout-invariants.spec-util.ts` has the
identical property, so the single-file layout adds no new class of hazard; reachability is the
real protection and the build proves it. **A4** STOP rule intact; the nesting is sound (outer
`beforeEach` rebuilds TestBed per test; the fixture helpers are pure factories; no bleed).
**A5** carve-out documented, helper not weakened, foreign-symbol gate genuinely exercised.
**A6** scenario 4 is strongly non-vacuous — `chartView$`'s descriptor input is
`panelDescriptor$.pipe(startWith(null))`, so the stream emits unconditionally once selectors
have values and **only** the gate suppresses it. **A7** `idx === -1` genuinely exercised on both
the integration and unit paths. **A8** `store.resetSelectors()` sits at the top-level `describe`
and vitest cascades parent hooks into nested describes, so the new block is covered.

##### Orchestrator decision on the fix

| # | Decision | Rationale |
| :--- | :--- | :--- |
| **O5** | **Fix the Medium in place and re-audit, rather than shipping Task 5 as-is or dropping it.** The helper compares against the revealed instant `cursor + replayGrainSeconds`; scenario 2 reverts to a production-faithful cursor; the matrix gains the finer-than-grain row; L1 and L2 fold into the same pass; and **RFC-019's D19.I / N19-4 prose is amended in the same commit** so the written invariant matches the code. | PHILOSOPHY §3.6: "parece terminado" is not a state. Shipping a false invariant is worse than shipping none — it teaches the next engineer the wrong rule and will be deleted the first time it fires a false positive. Amending the RFC text is a **correction of a defect in the spec's formalization discovered during implementation**, not a scope change: the RFC's *intent* (no lookahead reaches the render model) is untouched; only its arithmetic is corrected. Leaving §5/§6 asserting *"ninguna vela cuyo cierre exceda el cursor"* while the helper checks something else would recreate the very divergence one layer up. Surfaced to the owner in the PR as a spec amendment, not buried. |

---

#### Task 5 fix — M1 closed (commit `cebd6bc`)

Dispatched to an `sdd-implementer` with the audit's own probes as the brief. **Zero production
files touched.**

| Field | Value |
| :--- | :--- |
| Commit | `cebd6bc` |
| Tests | 2051 → **2053** (+2); 165 spec files, unchanged |
| Gates (orchestrator-verified, raw) | tsc app **EXIT 0**, tsc spec **EXIT 0**, lint **EXIT 0**, `ng test` **EXIT 0** — `Test Files 165 passed (165)`, `Tests 2053 passed (2053)` |
| Scope touched | `components/chart/lookahead-invariants.spec-util.ts`, `…/chart-model-mapper.service.spec.ts`, `docs/architecture/rfcs/019-pane-guard-cross-tf-forming.md` — 3 files, zero production |

**What changed:** the helper now compares candle closes against the **revealed instant**
`cursor + replayGrainSeconds` (new 6th parameter) instead of the raw cursor; the forming clause
stays at `forming.time > cursor` (already correct); scenario 2 reverts to the cursor
`advanceCandle` actually sets (`600`, an open) and the misleading comment is gone; a
finer-than-grain scenario (RFC §4.3 row 3) was added — the row whose absence let the second
falsification through; the forming-clause violation branch gained its unit case (audit L1); and
scenario 6 is now `toBe(dummyGlobalView)` (audit L2). RFC D19.I, the N19-4 row in §6, and a new
**V9** row in §7 were amended in the same commit so spec prose and code agree.

**The fix does not blunt the checker.** Re-verified against the pre-RFC shape:

```
lookahead: candles[1] opens at 3600 and closes at 7200, which is AFTER the revealed
instant (4500 = cursor 4200 + replay grain 300); activeSeconds=3600
```

**The implementer re-derived the cursor semantics independently** rather than accepting the
brief's summary — `advance$:49`, `jumpBack$:147`, `foldForwardFills:108/193`,
`ReplayState.currentTime`'s doc, `lastIndexAtOrBefore`'s contract and `renderWindow`'s inclusive
slice — and reported **no disagreement**, including re-deriving the three-row algebra.

**Orchestrator mechanical diff-scan (`89b4808..cebd6bc`):** 3 files, zero production; `+3 it(`
/ `-1 it(` = net +2, matching 2051 → 2053 exactly; the single removed `it(` is the scenario-2
title being reworded **inside Task 5's own block** (authorized — it is this task's code under an
audit finding); every hunk sits at line 887+, i.e. **entirely below Task 2's specs**, so Task 2's
scenarios 1–9 and its R7 rewind spec are untouched (STOP rule intact); kernel inv. 7 grep zero;
`package.json`/`package-lock.json` diff vs `0e66392` empty.

**Deviations (all inert):** the new finer-than-grain scenario is numbered "2b" rather than
renumbering the block — following the audit's own L3 ruling that this block's local numbering
may have gaps rather than re-touch untouched scenarios; the signature gained a 6th positional
parameter exactly as briefed; the forming-clause test uses `candles: []` / `idx: -1` so the
candle loop is a structural no-op and the forming clause is isolated cleanly.

---

#### Docs pass (branch finalization)

| Change | File |
| :--- | :--- |
| New **"Post-Infrastructure Refinements"** bridge section registering RFC-017/018/019 together, between the "Fases de Evolución" and "Mastery Block" tables (owner decision **O3**) | `docs/architecture/ROADMAP.md` |
| Bundle figure `~609 kB` → **`648 kB`** (owner decision **O4**; protected path, explicitly authorized) | `CLAUDE.md` |
| D19.I / N19-4 amended, **V9** row added (part of the M1 fix commit) | `docs/architecture/rfcs/019-pane-guard-cross-tf-forming.md` |

The stale "~609 kB" also appears in this run's plan (§5 DoD) and the two orchestration prompts.
**Left as-is deliberately:** those are frozen run artifacts and rewriting them mid-run would
muddy the audit trail. Only the kernel doc, which future sessions actually read as authority,
was corrected.

| # | Decision | Rationale |
| :--- | :--- | :--- |
| **O6** | **The Task 5 re-audit is folded into the whole-branch Opus audit** rather than dispatched as a separate targeted re-audit, with M1 carried as that audit's **lead attention item**. | `sdd-orchestration.md` requires a re-audit after a failed audit; it does not require a *separate dispatch*. The whole-branch auditor re-runs every gate personally and reads attention-flagged diffs line by line, so it is a **strictly stronger** check than a targeted re-audit of the same three files, and it is the PR gate regardless. Recorded here because a review-shape change is a decision, never an improvisation (PHILOSOPHY §5.2). If the whole-branch audit re-raises M1, the run fixes and re-audits exactly as it did the first time. |
