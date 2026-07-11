# SDD Run Ledger — RFC-014 Alta Fidelidad + Telemetría

- **RFC (spec):** `docs/architecture/rfcs/014-simulacion-alta-fidelidad-telemetria.md`
- **Plan:** `docs/superpowers/plans/2026-07-10-rfc-014-implementation-plan.md`
- **Branch:** `feature/rfc-014-alta-fidelidad-telemetria` @ base `cee5fa9` (develop)
- **Run mode:** FULL (per-task review + final whole-branch audit) — R5: largest money-path
  change since RFC-004. Implementer = `sdd-implementer` (sonnet). Reviews: opus on
  money-path tasks (1–4), sonnet on 5–6; final audit = `branch-auditor` (opus).
- **Baseline evidence (fresh, 2026-07-10):** tsc app ✓, tsc spec ✓, `ng test` 993/993 green
  (74 files), lint 0 problems.
- **Run decisions:** D14.A (STOP-compatible `base` plumbing with legacy fallback),
  D14.B (placement reveal horizon — documented deviation from RFC §1.3 literal
  "createdAt = cursor", forced by the RFC's own no-hindsight property), D14.C (engine
  signature stability via optional trailing args), D14.D (single Ask derivation point).
  See plan §Design decisions. Previous run's ledger (workspace panel polish, PASS,
  merged) replaced — recoverable from git history.
- **D14.E (USER DECISION, 2026-07-10, Task 4a):** the user explicitly authorized a punctual
  STOP-rule exception: the two pre-existing specs whose fixtures contradict I-14/I-15 on the
  modification path (`trading.reducer.spec.ts:120-126` sl===entry via modifyOrder;
  `:128-134` SL widen via modifyPosition) MAY be minimally edited preserving each spec's
  original intent (lots-0 guard; no re-sizing), so I-14/I-15 enforcement lands complete
  (V-10 íntegro). Every other pre-existing spec remains untouchable.
- **D14.F (orchestrator, Task 4b, requires-attention):** the plan's preferred
  `TradingState.lastFacts` surfacing is TYPE-IMPOSSIBLE without STOP violations (NgRx
  createFeature rejects optional feature-state props; a required field breaks 11 literal
  TradingState construction sites across 6 protected spec files — evidence in
  task-4b-report.md). Resolution: engine-level reification stands as `ProcessResult.facts`
  (emitted during the walk, spec-covered); the Task-5 telemetry observer derives its
  OrderFilled/PositionClosed events from post-reducer state transitions (pairwise diffing:
  new positions ⇒ OrderFilled; new history entries ⇒ PositionClosed, synthesizing the
  same-candle fill+close OrderFilled from the history entry's openTime/origin).
  `ProcessResult.facts` has zero production read sites this phase — reserved extension
  point (PHILOSOPHY §2.6) for Fase 2-3 engine-level consumers; final audit verifies it
  stays unread.

## Tasks
- [x] Task 1: Base-resolution execution loop + same-candle fills (V-4, V-5)
- [x] Task 2: ExecutionCosts + Bid/Ask predicates + cost decomposition (V-1, V-2, V-3)
- [x] Task 3: Mark-to-market + MAE/MFE + floatingEquity (V-11)
- [x] Task 4: SimulationDomain I-14/I-15 + reified facts (V-10)
- [x] Task 5: Telemetry black box (V-7, V-8, V-9)
- [x] Task 6: UI history columns + summary aggregates + costs (G1/G4)
- [x] Task 7: Documentation closure + ambiguousCount KPI

## Completed

Task 1: complete (commits 4b150df..11115b4, review clean — Spec ✅, Quality Approved by opus
reviewer; 993→1016 tests / 74→78 files, tsc+lint clean). NOTE: implementer session was killed
by a usage limit after committing but before reporting; report reconstructed by orchestrator
from git evidence + fresh personal gate run; reviewer instructed to verify point-by-point
without implementer narrative (it did). D14.B verified: createdAt stamped at reveal horizon
via selectPlacementTime in the only two placeOrder dispatch sites (chart.component.ts:1021,
trade-panel.component.ts:174); openMarket keeps cursor time.

Task 2: complete (commits 11115b4..9bfba5e = 1093d86 feat + 59190d2 test + 9bfba5e review-fix;
review opus: Spec ✅, Quality Approved after 1 fix wave — Important crypto-pointSize finding
closed with regression-pinning test; 1016→1073 tests / 78→82 files, tsc+lint clean).
R3 RESOLVED: bars confirmed Bid inferentially — pipeline's only rate fetch is
mt5.copy_rates_range (mt5_common.py:119), MT5 returns Bid-based OHLC, no Ask/tick path exists.
Documented deviations (all judged sound by reviewer): ExecutionCosts carries 4th field
pointSize; TradingData.executionCosts is `ExecutionCosts | null` (NgRx createFeature rejects
optional feature-state props — follows sessionEnd/sessionName/folderId convention); closeTrade
always populates grossProfit/commission (keeps V-1 deep-equality symmetric).

Task 3: complete (commits 9bfba5e..920193b = 846bf1b feat + 920193b test; review opus: Spec ✅,
Quality Approved, 0 Critical/Important; 1073→1096 tests / 82→85 files, tsc+lint clean).
Two-agent execution: first implementer killed by session limit AFTER leaving gates green but
uncommitted; finisher closed the orchestrator-confirmed reducer integration gap (reducer
dropped result.book on !changed, discarding accumulators on quiet candles) via additive
ProcessResult.excursionsMoved + three-way reducer gate (idle path byte-identical), then
committed. Sealing decision: never-walked positions seal mae/mfe=0, tMae/tMfe=openTime.
Legacy-path (coarse-grain) excursions documented as fidelity limitation, not defect
(excursions never feed resolveExit; V-1 intact).

Task 4: complete (commits 920193b..401fa46 = b281875+0bb6df8 T4a, 58e85ca T4a/D14.E,
43237df+401fa46 T4b; review opus: Spec ✅, Quality Approved, 0 Critical/Important;
1096→1140 tests / 85→88 files, tsc+lint clean). D14.E consumed: exactly 2 pre-existing
specs minimally edited (verified intent-preserving by reviewer). D14.F verified sound by
reviewer (lastFacts type-impossible; facts = ProcessResult.facts engine-level, reserved
unread this phase per PHILOSOPHY §2.6). Reviewer ⚠️ noted: modifyPosition intentionally
runs NO TP-geometry check (I-15 declares TP free) — scope decision, note in walkthrough.
FINAL-AUDIT ATTENTION: verify ProcessResult.facts stays production-unread.

Task 5a: complete (commits bedf095 feat + 6197411 test; 1140→1151 tests / 88→89 files,
tsc+lint clean; per-task review deferred to the combined Task 5 review after 5b).
DEVIATION (documented, requires walkthrough note): telemetry store lives in a DEDICATED
`emulador-telemetry` DB, not the RFC-named `emulador-workspaces` — joining required bumping
the shared DB_VERSION, breaking a STOP-protected assertion (workspace-db.service.spec.ts
pins store count = 6). Cap decision + envelope types in task-5a-report.md. Open items for
5b: verify ReplaySeekPayload.direction / ReplayJumpPayload.grain typing against RFC intent
(RESOLVED in 5b-i: grain type fixed in fd388a5).

Task 5: complete (commits bedf095..28fb1c0 across 3 slices + 1 fix wave; combined review
opus: Spec ✅, Quality Approved after fix — Important stale-pendingJumpOrigin finding closed
structurally in 28fb1c0, re-derived and verified by reviewer incl. legitimate-fold non-race;
1140→1231 tests / 88→95 files, tsc+lint clean). V-8 evidence: 8.1–13.0 ms per 69-event
jump-50 burst vs 16 ms/frame budget (jsdom bound 50 ms; conservative — includes MockStore
harness overhead). N-1 grep: 0 hits in telemetry dir. V-9: assertNoCandles reused on every
batch. Reviewer-verified soft-degradation asymmetry: any future ordering change drops a
telemetry event, never fabricates one, never touches domain state.
FINAL-AUDIT ATTENTION: telemetry store lives in DEDICATED emulador-telemetry DB (sanctioned
deviation from RFC's emulador-workspaces naming — STOP-protected store-count assertion);
Task 7 must reflect it in docs.

Task 6: complete (commits 28fb1c0..75f4ff6 = 2d425f7+501d6af T6a, f8019ef+daa304d+75f4ff6
T6b; review sonnet: Spec ✅, Quality Approved, 0 Critical/Important; 1231→1277 tests /
95→101 files, tsc+lint clean). ambiguousCount surfaced for the first time (was computed but
never rendered — RFC UI scope sanctions it). switchAsset carries executionCosts TOP-LEVEL
(sibling of thenNewSession) — forced by STOP-protected objectContaining assertion, verified
sound by reviewer; costs read only inside if(thenNewSession) (no leak). Reviewer ⚠️ for
docs: MAE_R divisor uses the trade's FINAL sl (RFC-mandated formula |entry−sl|) which can
diverge from the entry-time 1R after SL tightening — document in Task 7.

Task 7: complete (commits 091cbee docs + aedd7b4 KPI spec; review sonnet: Spec ✅, Approved,
0 Critical/Important; 1277→1278 tests / 101→102 files, tsc+lint clean; implementer cut off
pre-commit, orchestrator verified tree + re-ran gates + committed unchanged). KPI (DoD #3):
ambiguousCount reference scenario legacy H1-envelope = 3 vs base-grain M1 walk = 1
(irreducible same-M1 collision floor, per-trade asserted). Reviewer traced every doc claim
to shipped code; Desviaciones registradas complete (D14.B, dedicated DB, D14.E, D14.F,
go-to-date gap).

ALL 7 TASKS COMPLETE. Final test count: 1278/1278 (102 files), baseline was 993/74.

## Final audit (branch-auditor, opus) — cee5fa9..a3c0a03
**VERDICT: PASS — "Ship it".** Gates re-run personally: tsc app+spec clean; ng test
1278/1278 (102 files); lint 0; `npm run build` exit 0 (known 623 kB budget warning only,
NO vitest sentinel chunks). Invariant greps all clean: no new deps (package.json/lock
untouched), engine purity (7 pure modules framework-free), no spec-util/vitest in app code,
D8 no factory selectors, N-1 only benign pre-existing hits, ProcessResult.facts verified
reserved-unread, assertNoCandles guards telemetry batches, syncPriceScale still
reserved-unimplemented, STOP verified (only trading.reducer.spec.ts modified = D14.E,
28 spec files newly added). Ledger arithmetic corroborated independently (74+28=102 files).
All six attention flags reviewed line-by-line: sound. Money path deep-reviewed: sided
predicates consistent, V-1 degeneration preserved, costs round-trip lossless, no third
placement site. Zero Critical/High/Medium. One Low (T7-m1 stale domain-facts.ts comment)
fixed post-audit in 51e2249 (comment-only; tsc app + lint re-verified). Remaining rollup
minors ruled no-fix with written reasons (see audit report / PHILOSOPHY §3.5).

## Minor findings rollup (for final audit triage)

- T1-m1 (theoretical): base-candle walk slices only within resolution-candle intervals
  (trading.effects.ts:39, replay.effects.ts:181) — a base candle inside a resolution-series
  gap would be skipped; unreachable while resolution aggregates base (same gaps). Suggested:
  one-line comment if a future task decouples the series.
- T1-m2 (coverage depth): idempotence spec (fill-engine.base-loop.spec.ts:771-778) proves
  no-double-fill but not no-double-exit; strict V-4 separately covered by no-hindsight test.
- T1-m3 (type-level): `as MemoizedSelector<object, FillContext, FillContextProjector>` cast
  (selectors.ts:638) — documented STOP-rule workaround; acceptable as-is.
- T2-m1 (coverage): round-trip "absent" test proves null→null, not key-absent legacy JSON →
  zero-cost (session-sync.execution-costs.spec.ts:101-106); runtime-safe via `?? undefined`.
- T2-m2 (near-tautological): V-2 test asserts profit<=grossProfit which follows from the
  formula; doesn't verify spread/slippage reflected in grossProfit vs clean baseline.
- T2-m3 (latent type-vs-runtime): executionCosts non-optional but legacy payloads deserialize
  key-absent (undefined) — absorbed by `?? undefined`, mirrors existing convention.
- T2-m4 (cosmetic): costPresetFor runs assetClassOf twice per call after the fix; trivial.
- T3-m1 (doc wording): ProcessResult.excursionsMoved doc says "still-open" but flag also set
  for same-candle closers — harmless (reducer reads it only under !changed); imprecise wording.
- T3-m2 (future note): accumulators never reset on step-back; a manual close at a rewound
  cursor can seal tMae/tMfe later than closeTime — consistent with engine idempotency
  philosophy, out of scope, untested interaction.
- T3-m3 (coverage): no single e2e test composes reducer quiet-candle accumulation + manual-close
  sealing; halves tested separately.
- T4-m1 (idiom): ProcessResult.facts is required while sibling additive fields are optional;
  safe (no external ProcessResult constructor), worth a one-line rationale if standardized.
- T4-m2 (cosmetic): modifyOrder rejection returns fresh outer state object (order-level ref
  identity only) — matches pre-existing .map idiom; place/openMarket give whole-state identity.
- T5-m1 (limitation note): go-to-date teleport dispatches goToTime (not seekTo) → captured
  neither as ReplaySeek nor as anchor reset; candlesRevealed can inflate/clamp for the next
  order. Out of tracked-action scope; document as limitation (Task 7 candidate).
- T5-m2 (cosmetic): V-8 proof spec leaves an intentional console.log evidence line.
- T5-m3 (coverage): wildcard arm-clear path tested only via advanceCandle; a non-replay
  action test would pin the generalization.
- T5-m4 (doc precision): "NEVER emits regardless" doc comment slightly overstates the proof;
  hedge to "for all current and realistic producers".
- T6-m1 (coverage depth): crear-sesion costs spec never renders the template (matches the
  file's pre-existing idiom); 3 new inputs exercised via handler calls, wiring verified by
  reviewer reading.
- T6-m2 (DRY cosmetic): .cost-label duplicated verbatim in two component CSS files vs the
  existing .label class.
- T6-m3 (copy symmetry): unit shown inline in summary ("7.00 $/lote") vs label-only in the
  dialog ("Comisión ($/lote)").
- T6-m4 (comment precision): pickR2Asset resets overrides on every pick, comment implies
  class-change-only.
- T7-m1 (stale comment, this-branch): domain-facts.ts:6-8 still describes the abandoned
  TradingState.lastFacts surfacing; actual mechanism is diffDomainFacts state diffing
  (D14.F). One-line comment fix candidate for the final fix wave.
