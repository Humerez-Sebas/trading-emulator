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

### 8.3 Task log

_(entries appended per task)_
