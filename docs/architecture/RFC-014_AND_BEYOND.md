# RFC-014 and Beyond: The Mastery Block

| Field | Value |
| :--- | :--- |
| Status | Draft RFC bundle, revision 2 (each RFC graduates to `docs/architecture/rfcs/` on acceptance) |
| Date | 2026-07-10 (revision 2; revision 1: 2026-07-09) |
| Authority basis | Owner directive of 2026-07 (knowledge-conservation reorientation); [TRADER_KNOWLEDGE_MODEL.md](file:///C:/Users/78701/Desktop/trading-emulator/docs/architecture/TRADER_KNOWLEDGE_MODEL.md) (Phase 0); Stages 1-5 of the architecture corpus; [strategic_audit.md](file:///C:/Users/78701/Desktop/trading-emulator/docs/architecture/strategic_audit.md) Part 7 (engine critique) |
| Language note | Drafted in English with the architecture corpus by explicit owner directive; on graduation to `docs/architecture/rfcs/`, repo convention (Spanish RFCs) applies unless the owner re-confirms English |

---

## 0. Numbering, Supersessions and Sequencing

This revision restructures the bundle around the Trader Knowledge Model. Canonical
numbering (supersedes revision 1 of this document AND both numbering schemes inside
the strategic audit):

| RFC | Title | Phase | Provenance |
| :--- | :--- | :--- | :--- |
| RFC-014 | High-Fidelity Simulation & Behavioral Telemetry Engine | 1 | Merges revision-1 RFC-014 (base-resolution loop, simulation domain layer) and revision-1 RFC-015 (execution costs), plus the black-box telemetry engine from TRADER_KNOWLEDGE_MODEL Sections 3 and 7 |
| RFC-015 | Playbook & Rule Adherence Domain | 2 | New (TRADER_KNOWLEDGE_MODEL Section 5.1) |
| RFC-016 | The Playbook Amendment Journal | 3 | Replaces the revision-1 "Journal Aggregate" draft, reframed as the Reflection Cabin + permanent lessons (TRADER_KNOWLEDGE_MODEL Sections 4-5) |

Rationale for the RFC-014 merge: execution physics (base-resolution walk, bid/ask
predicates, cost terms) and behavioral telemetry (MAE/MFE, mark-to-market, timing
capture) traverse **the same engine loop over the same base candles**. Implementing
them as one mathematical refactor avoids touching the audited money path twice and
keeps the second pass from re-litigating the first (reuse audited machinery,
PHILOSOPHY Section 2.5).

**Graduation note (2026-07-10).** RFC-014 has graduated to its normative Spanish
form at `docs/architecture/rfcs/014-simulacion-alta-fidelidad-telemetria.md`,
incorporating the Grill alignment decisions G1-G4 (cost presets in code with
per-session override; post-placement rule tagging — transferred to RFC-015 scope;
frozen vector drawing snapshots; MAE/MFE as history columns + summary aggregates).
That file is authoritative for RFC-014; the draft section below remains as the
English abstract.

Absorbed and retired concepts from the audit roadmap:

- *Vector Snapshots for Closed Trades* (audit RFC-017): absorbed into Reflective
  Scenes — reconstruction over storage is now doctrine (invariant N-3), so no
  separate snapshot RFC exists.
- *Performance Dashboard & Analytics Engine* (audit RFC-018): demoted by the
  excluded-metrics doctrine (TRADER_KNOWLEDGE_MODEL Section 6). Physical descriptive
  views may ride along Phase 3; no aggregate-scoring dashboard is planned.
- *AI Integration Gateway* and *Challenge Mode* (audit RFC-019/020): remain
  contingent, and any future draft must comply with stances S1/S2 and invariants
  N-1/N-6 (an on-demand lens over facts; never an autonomous judge; never an author
  of permanent knowledge).

Workflow: each RFC is architectural work — branch `feature/rfc-XXX-*`, PR to
`develop`, released to `main` as a whole-block release PR
(`docs/engineering/git-workflow.md`). Frozen non-goals
([ARCHITECTURE_VISION.md](file:///C:/Users/78701/Desktop/trading-emulator/docs/architecture/ARCHITECTURE_VISION.md)
Section 8.3) and the verification gates apply to every phase.

---

## RFC-014 (DRAFT): High-Fidelity Simulation & Behavioral Telemetry Engine

| Field | Value |
| :--- | :--- |
| Status | DRAFT for review |
| Phase | 1 |
| Depends on | RFC-013 (shipped); TRADER_KNOWLEDGE_MODEL (Phase 0) |
| Bounded contexts | Simulation/Trading; Replay; new Telemetry register (passive) |
| Invariants touched | I-3 (cost terms), I-5/I-6 (bid/ask sided, base-resolution), I-7/I-8 (strengthened, guarantees preserved), I-11 (net vs gross); I-14/I-15 gain detectors; N-1..N-6 become enforceable |

### Motivation

Trust in execution fidelity is the product's central asset, and the knowledge model
requires a black box that records physical truth. Both demands converge on the same
defect set (audit Part 7; DOMAIN_MODEL Section 8): evaluation at display grain,
placement-candle latency, clean frictionless fills, realized-only equity, and order
lifecycle law living outside the domain layer. One engine refactor addresses all of
them because they are all properties of the same candle walk.

### Goals

1. **Base-resolution engine loop.** Execution (fills, SL, TP) always evaluates at
   the finest loaded series for the primary symbol (M1 ground truth when present),
   regardless of displayed timeframe or replay-resolution setting — realized on the
   existing fold pipeline (`foldForwardFills`), not as a parallel system.
2. **Same-candle execution without hindsight.** An order placed at cursor time `T`
   may fill on base candles with `time > T` inside the same parent interval. The
   placement exclusion refines from parent grain to base grain; idempotence and
   no-hindsight (I-8) are preserved because `createdAt` compares against base-candle
   times and the high-water mark moves to base resolution.
3. **Two-sided pricing and execution costs.** `Ask = Bid + spread` (stored series
   remain single-stream, bid-side by MT5 convention — confirm against the pipeline
   at implementation). Side-correct predicates (a short's exit-to-cover triggers on
   Ask); commission per lot; optional deterministic slippage on stop fills, off by
   default. Session-scoped `ExecutionCosts` config as an optional
   backward-compatible payload field; absent = zero-cost legacy semantics.
   Disclosure in UI per PRODUCT_PRINCIPLES P7.
4. **Dynamic mark-to-market.** The same base-resolution walk maintains floating
   position valuation, closing DOMAIN_MODEL Section 8.3 (realized-only equity) and
   producing the excursion stream MAE/MFE with `tMAE`/`tMFE`
   (TRADER_KNOWLEDGE_MODEL Section 3.3) as a by-product of candles already visited.
5. **The black-box appender.** A passive observer policy (the `dispatch: false`
   pattern) recording navigation events (`ReplaySeek`, `ReplayJump`, playback
   toggles), entry timing (`TimeElapsedBeforeOrder` with its anchor semantics),
   excursion diagnostics, and drawing snapshots into an append-only, session-scoped,
   local-only IndexedDB log — outside `SessionPayloadV2` (D9 untouched),
   candle-free, invisible (invariants N-1/N-2/N-5).
6. **A `SimulationDomain` module for order lifecycle law.** Pure validation
   (geometry I-14; SL-non-widening I-15 with explicit tightening allowance; risk
   derivation I-1 as the single sizing entry point), invoked by reducers,
   hard-TDD'd. Reified execution facts (`OrderFilled`, `PositionClosed` carrying
   fill sub-index and ambiguity provenance) close EVENT_STORMING Section 8 items
   1-2 and give the appender exact capture points.

### Non-Goals

- No tick data or synthetic intra-M1 interpolation (the base candle remains the
  quantum of time; I-9 pessimism-with-disclosure stands, now confined to base
  atoms).
- No interpretive telemetry of any kind (N-1): no behavior scores, no heat maps, no
  session-start prompts.
- No web workers (frozen non-goal; measure against the 16 ms budget first).
- No change to seek-is-teleportation or backward-review semantics (frozen); seeks
  are *recorded*, exactly as they occur.
- No variable-spread feeds, no liquidity/depth model, no margin/leverage model.

### Design Sketch

- `processCandle` contract sharpens to base resolution; the fill context always
  supplies the finest session series for the primary symbol, independent of what
  panels display.
- `ExecutionCosts { spreadPoints, commissionPerLot, slippagePoints }` threaded as an
  explicit engine argument (purity preserved). `ClosedTrade` gains a cost
  decomposition (`grossProfit`, `costs`, `profit` becomes net) — additive and
  migration-safe; `rMultiple` stays net-based on the geometric 1R.
- The mark-to-market walk emits per-position excursion samples; the appender folds
  them into MAE/MFE with timestamps. Telemetry writes are batched off the hot path.
- The call-local fill-index limitation (DOMAIN_MODEL I-7 scope caveat) dissolves:
  base-grain evaluation makes the parent-interval walk the only walk.

### Verification

Hard TDD on the engine. Anchors: zero-cost configuration reproduces current outputs
bit-for-bit; the phantom-stop regression is retained verbatim (STOP rule);
same-candle fill/TP scenarios (the audit's Sell-Stop case, both orderings);
idempotence property tests at base grain (step-back/forward); cost monotonicity
(net <= gross for any non-negative configuration); sided-predicate suite over all
four side/type combinations against bid/ask; determinism (C5). Telemetry detectors:
N-1 vocabulary grep on schemas, N-2 frame-budget measurement with capture enabled,
N-5 `assertNoCandles` on the log stores. CPU of dense folds measured on jump-50
over M1 before any optimization is considered.

### Risks

Densest change to the audited money path since RFC-004 — mitigated by the
bit-for-bit zero-cost anchor and phased landing (loop refinement first, costs
second, telemetry observer last; each step green). Telemetry volume growth —
mitigated by session-scoped, size-bounded, local-only logs (loss is tolerable by
the conservation asymmetry). Silent semantics drift for saved sessions — mitigated
by absent-config = zero-cost equivalence and payload round-trip tests.

---

## RFC-015 (DRAFT): Playbook & Rule Adherence Domain

| Field | Value |
| :--- | :--- |
| Status | DRAFT for review |
| Phase | 2 |
| Depends on | RFC-014 (reified facts recommended, not strictly required) |
| Bounded contexts | New: Playbook (permanent knowledge tier); touches Trading (opaque declaration field), Identity & Sync |
| Invariants touched | none of I-1..I-15; introduces P-domain invariants below |

### Motivation

Deliberate practice trains *declared rules*, not vibes (TRAINING_WORKFLOW: the
strategy lives in the trader's head — this RFC gives it a durable, opaque home).
For the amendment loop to work, a trade must be attributable to the rule it was
training — with zero friction and zero system judgment.

### Goals

1. **The Playbook aggregate.** `Playbook { rules: PlaybookRule[] }`;
   `PlaybookRule { id, title, statement, createdAt, status, amendments[] }` —
   trader-authored, opaque to the system (never parsed, validated, or evaluated).
   Permanent knowledge tier: own per-row LWW sync (the `SessionFolder` pattern),
   RLS owner-isolation, export support, survives all session deletion (N-4).
2. **Frictionless rule declaration — post-placement tagging (Grill decision G2,
   2026-07-10).** The Playbook is configured and listed in the side-panel Dock.
   During practice the flow is: the trader first executes the trade and places
   SL/TP; then, while the order or position is ACTIVE, a single keystroke (e.g.
   `1`) tags it with an opaque `declaredRuleId`. The tag (e.g. `[R1]`) renders
   attached to the trade's own label on the chart and disappears automatically
   when the trade closes (the fact persists on the record through the identity
   chain). Keystrokes with no active trade do nothing. Optional, never prompted,
   correctable later in cold review (S2).
3. **Declaration as fact, never as score.** The system records *that* a rule was
   declared; adherence, quality, and meaning are the trader's cold-review judgment
   (S1). No adherence percentage, no compliance indicator, no streaks.

### Non-Goals

- No rule engine: the system never checks whether the trade "followed" the rule.
- No mandatory tagging; the undeclared trade is a first-class citizen.
- No strategy semantics in schemas: rule content is free text, opaque (preserves
  the strategy-neutrality obligation of UBIQUITOUS_LANGUAGE Section 1).
- No amendment authoring UI (that is Phase 3); this RFC only accumulates the
  structure amendments will attach to.

### Design Sketch

- `declaredRuleId?` as a nullable, opaque field on `PendingOrder` / `Position` /
  `ClosedTrade` — additive, migration-safe, carried by the existing identity
  continuity; dangling-tolerant if the rule is later retired.
- Keyboard bindings live in user-level settings (`SettingsState`, localStorage),
  not in sessions — consistent with chart appearance precedent.
- Playbook storage: new IndexedDB store + cloud table with per-row LWW; candle-free
  by construction; `assertNoCandles` reused (N-5).

### Verification

Placement-path tests proving no flow requires a declaration (P-1 below); identity
chain round-trip (order -> position -> trade keeps the stamp); LWW round-trips;
deletion tests for N-4 (purge sessions, Playbook intact); N-1 vocabulary grep on
the new schemas.

### Invariants introduced

| Id | Invariant | Detector |
| :--- | :--- | :--- |
| P-1 | Declaration is optional on every placement path | placement-path test suite |
| P-2 | Rule content is opaque: no code path reads `statement` except display/edit | grep: no parser/matcher over rule text |
| P-3 | Playbook survives all session/telemetry deletion | N-4 deletion round-trip |

### Risks

Shortcut collisions with existing replay navigation keys — resolved by a reserved
binding namespace and a conflict check in settings. Scope creep toward "rule
templates" or semantic categories — rejected by P-2; rules are text.

---

## RFC-016 (DRAFT): The Playbook Amendment Journal

| Field | Value |
| :--- | :--- |
| Status | DRAFT for review |
| Phase | 3 |
| Depends on | RFC-014 (telemetry + reified facts), RFC-015 (rules to amend) |
| Bounded contexts | Journal/Reflection (read side) + Playbook (write side, amendments); Identity & Sync |
| Invariants touched | none of I-1..I-15; enforces N-3/N-4/N-6; introduces J-domain invariants below |

### Motivation

TRAINING_WORKFLOW step 7 (Registro y Reevaluación) is the last unbuilt stage of the
cognitive cycle. The knowledge model defines its shape precisely: a mirror that
reconstructs what happened and a pen that writes what it meant — with the mirror
belonging to the system and the pen belonging exclusively to the trader.

### Goals

1. **The Reflection Cabin.** End-of-session and on-demand cold review: for each
   Trade Record, reconstruct the three canonical Reflective Scenes — Entry, Exit,
   Maximum Tension (`tMAE`) — as pure functions of `SceneSpec` (telemetry + trade
   geometry + drawing snapshots + local datasets), rendered vectorially through the
   existing `RenderModel` -> `ChartEngine` path. No screenshots, no Base64 (N-3).
2. **Uninterpreted fact panels.** Beside each scene: elapsed-time-before-order,
   seeks within the window, MAE/MFE and slack ratios, execution costs, declared
   rule. Numbers and geometry only; no scores, no system commentary (N-6).
3. **Lesson authoring and Playbook amendment.** The trader writes free-text
   lessons; a lesson may link to rules as an amendment and embeds FROZEN copies of
   its evidence `SceneSpec`s (provenance pointers may dangle; scenes degrade
   gracefully when datasets are absent). Offline-first: own per-row LWW cycle,
   exportable.
4. **Session-independence of knowledge.** Deleting any or all sessions leaves every
   lesson and the Playbook fully readable (N-4).

### Non-Goals

- No system-generated critique, suggestions, insights, or summaries of behavior.
- No aggregate scoring dashboards; no cross-session trending of excluded metrics
  (TRADER_KNOWLEDGE_MODEL Section 6).
- No cloud-side processing: reconstruction and review are local.
- No mandatory review step: closing a session without reflecting is valid (S2).

### Design Sketch

- Scene computation is a pure module: `(TradeRecord, TelemetryLog) -> SceneSpec[3]`;
  reconstruction reuses the mapper/engine machinery panel-side (a read-only,
  replay-decoupled render target).
- `Lesson { id, authoredAt, text, linkedRuleIds[], evidence: SceneSpec[],
  tradeRefs[], sessionRef, clientUpdatedAt, syncedAt }` per TRADER_KNOWLEDGE_MODEL
  Section 5.2.
- Cabin UI per PRODUCT_PRINCIPLES P10/P11: a receding surface, zero mandatory
  input, opened by the trader.

### Verification

Purity/determinism tests on scene computation (same spec, same output); N-3
storage-shape tests (no image blobs); N-4 deletion round-trips; graceful-degradation
tests (missing datasets -> geometry + text fallback); LWW round-trips and RLS
verification extension; N-1 grep on all new schemas.

### Invariants introduced

| Id | Invariant | Detector |
| :--- | :--- | :--- |
| J-1 | Scenes are recomputable: no scene rendering is ever persisted | N-3 storage-shape test |
| J-2 | Lesson `text` is the only meaningful-content field, and only the trader writes it | schema review + N-1/N-6 greps |
| J-3 | Evidence is frozen at authoring; later session/telemetry changes never mutate a lesson | immutability test on evidence copies |

### Risks

Evidence bloat if traders attach many scenes — bounded by per-lesson evidence caps
and the payload size-guard pattern. Temptation to "help" with generated summaries —
structurally rejected (N-6); any future analysis feature requires its own RFC under
the S1 constraints.

---

## Beyond the Mastery Block (contingent, not drafted)

Reserved, in no committed order, each requiring measured demand and its own RFC:
multi-symbol trading (revokes D1), AI analysis lens (S1-constrained, on-demand,
never a judge), shared/mentor sessions, challenge-style physical rule limits. None
may start by momentum; all inherit the N-invariants where they touch knowledge.

---

## References

- [TRADER_KNOWLEDGE_MODEL.md](file:///C:/Users/78701/Desktop/trading-emulator/docs/architecture/TRADER_KNOWLEDGE_MODEL.md) — Phase 0 foundation (ontology, black box, cabin, schemas, S1/S2, N-invariants).
- [ROADMAP.md](file:///C:/Users/78701/Desktop/trading-emulator/docs/architecture/ROADMAP.md) — Mastery Block sequencing.
- [strategic_audit.md](file:///C:/Users/78701/Desktop/trading-emulator/docs/architecture/strategic_audit.md) — Part 7 (engine critique; still authoritative), Parts 5/8/9 (feature and numbering framings superseded as noted in Section 0 and TRADER_KNOWLEDGE_MODEL Section 9).
- [DOMAIN_MODEL.md](file:///C:/Users/78701/Desktop/trading-emulator/docs/architecture/DOMAIN_MODEL.md) (I-1..I-15), [EVENT_STORMING.md](file:///C:/Users/78701/Desktop/trading-emulator/docs/architecture/EVENT_STORMING.md) (Section 8), [PRODUCT_PRINCIPLES.md](file:///C:/Users/78701/Desktop/trading-emulator/docs/architecture/PRODUCT_PRINCIPLES.md) (P7, P8, P10-P12), [ARCHITECTURE_VISION.md](file:///C:/Users/78701/Desktop/trading-emulator/docs/architecture/ARCHITECTURE_VISION.md).
- [replay-trading.md](file:///C:/Users/78701/Desktop/trading-emulator/docs/engineering/domain/replay-trading.md) (realism invariant, fold pipeline), [git-workflow.md](file:///C:/Users/78701/Desktop/trading-emulator/docs/engineering/git-workflow.md) (RFC branch discipline).
