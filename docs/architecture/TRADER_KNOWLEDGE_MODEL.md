# Trader Knowledge Model

| Field | Value |
| :--- | :--- |
| Status | Foundational (normative, living document) |
| Date | 2026-07-09 |
| Phase | 0 of the Mastery Block (see [ROADMAP.md](file:///C:/Users/78701/Desktop/trading-emulator/docs/architecture/ROADMAP.md)) |
| Authority | Establishes the knowledge-conservation doctrine for Phases 1-3 (RFC-014/015/016). Sits below explicit owner direction; supersedes the interpretive data-capture framing of [strategic_audit.md](file:///C:/Users/78701/Desktop/trading-emulator/docs/architecture/strategic_audit.md) Part 9 (see Section 9) |
| Language authority | [UBIQUITOUS_LANGUAGE.md](file:///C:/Users/78701/Desktop/trading-emulator/docs/architecture/UBIQUITOUS_LANGUAGE.md) |
| Upstream sources | [TRAINING_WORKFLOW.md](file:///C:/Users/78701/Desktop/trading-emulator/docs/architecture/TRAINING_WORKFLOW.md), [DOMAIN_MODEL.md](file:///C:/Users/78701/Desktop/trading-emulator/docs/architecture/DOMAIN_MODEL.md), [EVENT_STORMING.md](file:///C:/Users/78701/Desktop/trading-emulator/docs/architecture/EVENT_STORMING.md), [PRODUCT_PRINCIPLES.md](file:///C:/Users/78701/Desktop/trading-emulator/docs/architecture/PRODUCT_PRINCIPLES.md) |

---

## 1. Introduction and Philosophy of the Model

### 1.1 Why this document does not model "how the brain learns"

Any attempt to encode a theory of learning into the emulator (attention models,
psychological state inference, skill curves) would force the system to *interpret*
the trader — and interpretation is unfalsifiable in software: the system cannot know
whether a pause was doubt, analysis, or a coffee break. A model built on such
inferences would be both scientifically indefensible and, worse, an authority the
trader might mistakenly defer to.

This document therefore models the only thing the system can model honestly: **what
physical knowledge deserves to be conserved**, in what form, and for how long.
Learning is the trader's act; conservation is the system's duty.

### 1.2 The two non-negotiable stances

**S1 — The system observes and conserves; the trader interprets.**
The emulator is a flight recorder: a neutral black box that registers physical facts
(times, prices, geometry, navigation) with total fidelity and zero opinion. It never
concludes. A rewind is recorded as a rewind — never as "cheating". A long pause
before an order is recorded as elapsed time — never as "indecision". The trader is
the investigator who, in cold review, reads the recorded facts and extracts the
meaning. No schema in this model may contain an interpretive field (invariant N-1,
Section 8), and no system component may author judgments into permanent knowledge
(invariant N-6).

**S2 — Zero friction during training.**
The emulator disappears during practice. All behavioral and execution telemetry is
recorded passively and invisibly; the trader is never prompted, blocked, or asked to
fill a form, tag, or note while operating. Annotation exists exclusively in cold
review, after the session, and is always optional. This sharpens
[PRODUCT_PRINCIPLES.md](file:///C:/Users/78701/Desktop/trading-emulator/docs/architecture/PRODUCT_PRINCIPLES.md)
P11 from "automatic first" to "automatic only, during practice".

### 1.3 What "knowledge" is, then

Under S1/S2, knowledge in this emulator exists in exactly three forms, ordered by
value:

1. **Facts** — immutable physical records of what happened (trades, telemetry).
2. **Scenes** — deterministic geometric reconstructions of key moments, derived
   from facts on demand.
3. **Lessons** — trader-authored heuristics and Playbook amendments, the only tier
   where meaning lives, and the only tier that must survive everything else.

The final product of training is not the accumulation of transactions; it is the
amended Playbook. Everything below exists to make that amendment loop cheap,
truthful, and permanent.

---

## 2. Ontology and Conceptual Boundaries

### 2.1 The four concepts, delimited

| Concept | Nature | Mutability | Lifetime | Knowledge tier |
| :--- | :--- | :--- | :--- | :--- |
| Trade Record (`ClosedTrade`) | Physical execution fact | Immutable (only presentation flags mutate) | Bound to its Session's history | Fact (evidence) |
| Session | Transitory practice container | Mutable while active; archivable; deletable | Disposable scaffolding | Container (not knowledge) |
| Reflective Scene | Geometric-temporal reconstruction | Recomputable value object | Derived — exists as parameters, never as stored pixels | Derived fact |
| Permanent Lesson | Trader-authored heuristic / Playbook amendment | Trader-editable text; write-once evidence links | **Survives deletion of all sessions, records, and telemetry** | Knowledge (the product) |

**Trade Record.**
The immutable fact of one execution, exactly as defined in
[DOMAIN_MODEL.md](file:///C:/Users/78701/Desktop/trading-emulator/docs/architecture/DOMAIN_MODEL.md)
Section 3.1: identity-continuous (`PendingOrder -> Position -> ClosedTrade`),
append-only, produced atomically by the fill engine
([fill-engine.ts](file:///C:/Users/78701/Desktop/trading-emulator/emulador/src/app/state/trading/fill-engine.ts)).
A Trade Record is *evidence*, not knowledge: a thousand records teach nothing by
themselves.

**Session.**
The transitory container of practice: Practice Parameters, the book, the replay
cursor, drawings, layout. The laboratory bench. Sessions are deliberately cheap to
create, archive, and destroy; the model explicitly rejects any design in which
deleting a session destroys learning (invariant N-4).

**Reflective Scene.**
A deterministic reconstruction of one key moment of one trade. Formally, a scene is
a value object — a specification, never a stored rendering:

```
SceneSpec := ( symbol,
               datasetRefs,              // AnchorTf references, candle-free
               window [t0, t1],          // market-time interval around the moment
               cursorTime,               // the exact moment reconstructed
               orderGeometry,            // entry, sl, tp, side, lots (physical)
               drawingSet,               // vector primitives present at the moment
               telemetryMarkers )        // seeks, elapsed times, tMAE/tMFE in window
```

Determinism property: identical `SceneSpec` yields an identical rendering, because
candle series are immutable (Market Data plane), the engine render path is pure
(`RenderModel` in, pixels out), and every other component of the tuple is frozen
data. The three canonical scenes per trade are **Entry** (window around `openTime`),
**Exit** (window around `closeTime`), and **Maximum Tension** (window around
`tMAE`, the moment of peak floating adverse excursion — Section 3.4).

**Permanent Lesson.**
The true product of training: a heuristic, observation, or self-instruction written
by the trader in cold review, optionally linked to Playbook rules as an amendment
and to frozen scene evidence. Lessons outlive everything: sessions may be purged,
telemetry expired, records deleted — the lesson remains (Section 5).

### 2.2 The conservation asymmetry (error-cost asymmetry applied)

Per [PHILOSOPHY.md](file:///C:/Users/78701/Desktop/trading-emulator/docs/engineering/PHILOSOPHY.md)
Section 3.5, not all data loss costs the same:

| Tier | Loss cost | Ceremony |
| :--- | :--- | :--- |
| Telemetry | Tolerable (one session's diagnostics) | Low: append-only local log, size-bounded, no cloud sync by default |
| Trade Records / Sessions | Annoying (evidence gone, stats gone) | Medium: existing LWW session sync |
| Scenes | Zero (recomputable from spec) | None: never stored as renderings |
| **Lessons / Playbook** | **Catastrophic (the product of months of practice)** | **Highest: own LWW-synced rows, exportable, deletion-protected** |

---

## 3. The Raw Telemetry Register (The Black Box)

The black box is an append-only, session-scoped log of neutral physical events,
written passively in the background of the training loop. Every event shares one
envelope:

```
TelemetryEvent := { seq,            // monotonic per-session sequence number
                    wallClockMs,    // real-world capture instant
                    marketTime,     // replay cursor at capture (UTC seconds)
                    kind, payload } // one of the families below
```

### 3.1 Navigation events

Objective record of how the trader moved through time — including rewinds, recorded
as geometry, never as verdicts:

```
ReplayJump   := { fromTime, toTime, grain }       // fold-processed forward, review back
PlaybackToggled := { playing }                    // play / pause transitions
SpeedChanged    := { msPerCandle }
```

`ReplayJump` captures time jumps exactly as the navigation
semantics define it:
a viewing motion. The register stores from, to, and grain. It does **not**
store, and no schema may ever add, fields such as `isBacktrack`, `honesty`, or
`retryOfTradeId` — that is interpretation (N-1).

### 3.2 Entry events

The physical timing context of every order placement:

```
TimeElapsedBeforeOrder := { orderRef,
                            anchorKind,        // sessionStart | lastJump | lastOrderEvent
                            pausedMs,          // wall time paused since anchor
                            playingMs,         // wall time playing since anchor
                            candlesRevealed }  // base-resolution candles revealed since anchor
```

The anchor is defined as the most recent of: session start, last `ReplayJump`, last
order event. This makes the measure unambiguous and computable without inference.
Whether a long `pausedMs` was patience or paralysis is a question only the trader
can answer, in the mirror (Section 4).

### 3.3 Efficiency diagnostics: intrabar MAE / MFE

Computed inside the base-resolution execution loop (RFC-014's mark-to-market walk),
per open position, using the exit-relevant price side once bid/ask exists. For a
position with entry `E`, stop `S`, distance `d = |E - S|`, over the base candles
`c_k` spanning `[openTime, closeTime]`:

```
adverse_k   = (E - L_k)+  for buy;   (H_k - E)+  for sell
favorable_k = (H_k - E)+  for buy;   (E - L_k)+  for sell

MAE  = max_k adverse_k     tMAE = time of first k attaining the maximum
MFE  = max_k favorable_k   tMFE = time of first k attaining the maximum

MAE_R = MAE / d      // fraction of stop distance consumed; >= 1 iff stop touched
MFE_R = MFE / d      // maximum favorable excursion, in R units
```

Derived slack diagnostics (still physical ratios — their meaning belongs to the
trader):

- **Stop slack** `= 1 - MAE_R` for surviving trades: unused stop headroom.
- **Excursion capture** `= realized R / MFE_R` when `MFE_R > 0`: fraction of the
  maximum available favorable excursion actually realized.

These quantities measure the Geometric Tolerance Profile
([TRAINING_WORKFLOW.md](file:///C:/Users/78701/Desktop/trading-emulator/docs/architecture/TRAINING_WORKFLOW.md)
Section 4) against what the market actually did — the physical substrate for the
trader's own judgment about stop and target placement.

### 3.4 Vector drawing snapshots

At key events (order placement, position close), the register captures a
copy-on-write snapshot of the drawing vectors present on the primary-symbol canvas:

```
DrawingSnapshot := { eventRef, drawings: [ { type, anchorPoints[(time, price)], styleToken } ] }
```

Drawings are already serializable vector primitives (audit Part 5, Ficha 1:
serialization resolved in `drawings-primitive.ts`); a snapshot is a small JSON copy,
never an image.

### 3.5 Register properties

1. **Append-only, session-scoped.** One log per session, ordered by `seq`.
2. **Local-only by default.** Telemetry is bulky and low-value-density; it lives in
   IndexedDB and does not enter the cloud sync cycle. Lessons carry their own frozen
   evidence (Section 5), so telemetry expiry never breaks knowledge.
3. **Outside the session payload.** The log is NOT part of `SessionPayloadV2`; the
   atomic payload decision (D9) is untouched.
4. **Candle-free.** The `assertNoCandles` discipline applies to every telemetry and
   scene structure; series are referenced, never embedded.
5. **Invisible and non-blocking.** Capture is a background observer of existing
   domain facts (Section 7); it may never block a gesture, open a prompt, or breach
   the 16 ms/frame budget.

---

## 4. The Reflection Cabin (The Mirror)

At session end — or later, on demand, in cold review — the system assembles the
mirror: for each Trade Record it computes the three canonical `SceneSpec`s (Entry,
Exit, Maximum Tension) from the black box and the trade's geometry, and reconstructs
each scene vectorially:

```
( TradeRecord, TelemetryLog, local datasets )
        |                                        pure computation
        v
  SceneSpec x 3 per trade  ->  candle window loaded from IndexedDB (requiredDatasets)
        |                      + order geometry overlay
        |                      + drawing snapshot overlay
        |                      + telemetry markers (seeks, tMAE, tMFE, elapsed times)
        v
  vector rendering via the existing RenderModel -> ChartEngine path
```

Principles of the cabin:

1. **Reconstruction over storage.** No screenshots, no Base64, no rasterized blobs —
   ever (invariant N-3). A scene weighs as much as its parameters. The audit's
   vector-snapshot mitigation is hereby promoted to the *only* permitted mechanism.
2. **Facts, uninterpreted.** Beside each scene the cabin shows the physical numbers:
   elapsed time before entry, seeks within the window, MAE/MFE and slack ratios,
   declared Playbook rule if any (Phase 2). It presents; it never concludes. There
   is no score, no grade, no "insight".
3. **The cabin asks nothing.** It renders when opened and is silent otherwise.
   Writing a lesson is a trader-initiated act (S2). An empty review is a valid
   review.
4. **Fidelity is determinism.** Because scene reconstruction is a pure function of
   `SceneSpec`, the trader is guaranteed to see exactly what the recorder saw — the
   property that makes self-analysis trustworthy.
5. **Entry points from the sessions catalog.** To prevent the trader from having to
   spin up the full interactive replay workspace just to review history, each session
   card in the saved sessions catalog displays dedicated "Reflect" and "Journal"
   buttons:
   - **Reflect button:** Opens the Reflection Cabin for that specific session, rendering
     the recomputable scenes and telemetry facts.
     - **Journal button:** Opens the Lessons ledger filtered to display the permanent
       lessons and Playbook amendments authored during or after that session.

---

## 5. The Permanent Knowledge Schema

### 5.1 The Playbook

The Playbook is the explicit set of rules the trader has decided to train. Rules are
trader-authored and **opaque to the system** (strategy neutrality: the system never
parses, validates, or evaluates rule content):

```
Playbook     := { rules: PlaybookRule[] }                     // one per trader
PlaybookRule := { id, title, statement,                       // trader-authored text
                  createdAt, status: active | retired,
                  amendments: LessonRef[] }                   // accumulated history
```

**Workspaces Dock Integration.**
Rule creation and configuration do not require a separate settings modal. Instead,
the workspaces dock supports a dedicated **Playbook Panel** type (`playbook`). The
trader can mount this panel in any dock cell, allowing them to create new rules,
edit statements, and assign keyboard shortcuts (shortcuts `1..9`) directly adjacent
to their charts while training.

### 5.2 The Permanent Lesson (Playbook amendment)

```
Lesson := { id, authoredAt,
            text,                        // the trader's words — the only field with meaning
            linkedRuleIds[],             // rules this lesson amends (may be empty)
            evidence: SceneSpec[],       // FROZEN copies at authoring time
            tradeRefs[], sessionRef,     // dangling-tolerant provenance pointers
            clientUpdatedAt, syncedAt }  // per-row LWW, like SessionFolder
```

Design decisions:

- **Evidence is frozen, provenance may dangle.** A lesson embeds its own copies of
  the `SceneSpec`s it cites; if the origin session or telemetry is later deleted the
  lesson still renders its scenes (as long as the referenced datasets exist locally;
  otherwise it degrades gracefully to its geometry and text). `tradeRefs` and
  `sessionRef` are best-effort pointers, allowed to dangle.
- **Lessons are the trader's D-numbers.** Exactly as this repository gives durable
  identity and written rationale to engineering decisions (PHILOSOPHY Section 3.2),
  a lesson gives durable identity to a trading decision-rule change. A rule's
  amendment history is the trader's own decision ledger.
- **Sync and survival.** Playbook and lessons are small, append-mostly rows with
  their own LWW cycle (the proven `SessionFolder` pattern), RLS owner-isolation, and
  export support. They are deliberately outside `SessionPayloadV2`.

### 5.3 The amendment loop (the product realized)

```
practice (S2: frictionless)  ->  black box records facts (S1: neutral)
     -> cabin reconstructs scenes  ->  trader interprets in cold review
     -> trader authors Lesson      ->  Lesson amends PlaybookRule
     -> next session trains the amended rule  ->  ...
```

Mastery is this loop converging; the emulator's job is to make each arrow cheap and
truthful.

---

## 6. Excluded Metrics and Their Justification

The following metrics are deliberately **excluded from the knowledge tier**: they
are never conserved as knowledge, never trended across sessions, and never granted
UI prominence. The reasons are specific, not aesthetic:

| Excluded metric | Reason for exclusion |
| :--- | :--- |
| Short-window win rate | Statistically meaningless at practice sample sizes (a 10-trade session's win rate is noise); worse, it trains outcome-fixation — the opposite of rule-execution focus. Deliberate practice needs process feedback, not outcome streaks |
| Sharpe ratio | Presupposes a portfolio return series over continuous calendar time. Replay sessions are compressed, hand-picked historical windows; a Sharpe computed on them is pseudo-rigor — a number that looks scientific and measures nothing |
| Profit factor | Aggregates heterogeneous experiments into one scalar. A session mixing two rules under test produces an uninterpretable blend; the trader learns from per-trade geometry and per-rule evidence, not from a blended quotient |
| Click / interaction heat maps, behavioral scoring | Interpretive by construction (violates S1): a heat map exists to *suggest* meaning the system cannot verify. High cost, zero conserved knowledge |

What remains, and why it remains — all physical, geometry-derived quantities:

- **R-multiple** (per trade): the risk-normalized physical result; the natural unit
  of the Risk Invariant.
- **MAE / MFE and slack ratios**: physical excursion measurements (Section 3.3).
- **`ambiguousCount`**: honesty of the simulation itself — always disclosed.
- **The realized ledger** (balance, equity after each close): accounting fact.
- **Practice Volume & Temporal Distribution** (grouped by day, week, month): total counts
  of completed sessions and executed trades. This directly answers the behavioral
  question: *"Am I overtrading (volume spikes) or maintaining a consistent practice
  schedule (distribution uniformity)?"*
- **Rule Adherence Rate** (session-level and aggregate): the percentage of trades
  executed with a declared `declaredRuleId` vs. total trades. This is the ultimate measure
  of execution discipline, showing whether the trader is executing their playbook or
  improvising.

*Current status note (honest accounting):* `computeSessionStats`
([fill-engine.ts](file:///C:/Users/78701/Desktop/trading-emulator/emulador/src/app/state/trading/fill-engine.ts))
computes `winRate` and `profitFactor` today (DOMAIN_MODEL I-11). They remain as
transient, session-local descriptive output for now; this document demotes them
normatively (excluded from permanent knowledge, no cross-session trending), and
their UI de-emphasis is scheduled inside Phases 1-3 — not performed as a drive-by
change.

---

## 7. Domain Event Flow (conceptual)

The black box is an *observer* of existing domain facts — the same
`dispatch: false` orchestration pattern the sync layer already uses
([EVENT_STORMING.md](file:///C:/Users/78701/Desktop/trading-emulator/docs/architecture/EVENT_STORMING.md)
Section 4). It adds no domain behavior and no new write path into trading state:

```
existing commands & facts                      new, passive
(ReplayClockAdvanced, ReplayJump gesture,      +----------------------+
 OrderPlaced, OrderFilled, PositionClosed) --> | black-box appender   |
                                               | (observer policy)    |
                                               +----------+-----------+
                                                          v
                                               telemetry log (IndexedDB,
                                               append-only, session-scoped)
                                                          |
                                       session end / cold review (pure)
                                                          v
                                               SceneSpec computation
                                                          v
                                               Reflection Cabin read models
                                                          |
                                       trader-initiated commands only
                                                          v
                                    AuthorLesson / AmendRule -> Playbook aggregate
                                                          v
                                               per-row LWW sync (cloud)
```

Dependency note: high-fidelity capture of `OrderFilled` / `PositionClosed` moments
wants the reified fact stream identified in EVENT_STORMING Section 8; RFC-014
provides it together with the base-resolution loop.

---

## 8. Invariants (executable, per PHILOSOPHY Section 2.7)

| Id | Invariant | Detector |
| :--- | :--- | :--- |
| N-1 | **Neutrality.** No telemetry, scene, or knowledge schema contains interpretive fields. | Greppable vocabulary ban on schema identifiers (`hesitation`, `indecision`, `cheat`, `honesty`, `discipline`, `revenge`, `fomo`, `score`, `grade`, `verdict`); reviewed per RFC |
| N-2 | **Passivity.** Telemetry capture never blocks a gesture, opens a prompt, or exceeds the frame budget. | No dialog/confirm in capture paths; frame-budget measurement on the capture-enabled loop |
| N-3 | **Reconstruction over storage.** No rasterized captures anywhere in the knowledge path. | No Base64/image blobs in telemetry, scene, or lesson stores (storage-shape test) |
| N-4 | **Conservation asymmetry.** Deleting sessions, records, or telemetry never cascades to Lessons or the Playbook. | Deletion round-trip tests: purge all sessions, assert Playbook + Lessons intact and scenes render or degrade gracefully |
| N-5 | **Candle-free knowledge.** SceneSpecs, lessons, and telemetry reference datasets; they never embed candles. | Reuse of the `assertNoCandles` deep walk on the new stores |
| N-6 | **Interpretation authorship.** Only trader-authored text fields carry meaning; every system-written field is a number, geometry, time, or reference. | Schema review rule; N-1's vocabulary ban covers the mechanical part |

---

## 9. Relationship to the Corpus and Supersessions

- **Supersedes** the interpretive capture proposals of
  [strategic_audit.md](file:///C:/Users/78701/Desktop/trading-emulator/docs/architecture/strategic_audit.md)
  Part 9 Section 2: pointer/stress "behavior signatures", playback-rewind "honesty
  and discipline" scoring, and mandatory session-start mood tags (a session-start
  prompt violates S2; behavioral scoring violates S1). Rewinds ARE still recorded —
  as neutral `ReplayJump` facts.
- **Reframes** the audit's AI Coach: any future analysis feature (audit Fase 4)
  operates as an on-demand lens over recorded facts at the trader's explicit
  request, never as an autonomous judge, and never writes into the permanent
  knowledge tier. Its RFC must demonstrate compliance with N-1/N-6.
- **Extends** [PRODUCT_PRINCIPLES.md](file:///C:/Users/78701/Desktop/trading-emulator/docs/architecture/PRODUCT_PRINCIPLES.md)
  P11 (automatic-first) with S2's stricter form, and realizes TRAINING_WORKFLOW
  Section 1 step 7 (Registro y Reevaluación) as the amendment loop.
- **Consumes** DOMAIN_MODEL invariants unchanged; adds N-1..N-6 on top. The
  fill-engine and persistence invariants (I-1..I-15) are untouched by this
  document.
- **Is projected by** [EXPERIENCE_DOMAINS.md](file:///C:/Users/78701/Desktop/trading-emulator/docs/architecture/EXPERIENCE_DOMAINS.md)
  (2026-07-19) onto the experience plane: its Market → Trade → Conversation →
  Knowledge taxonomy maps this document's three knowledge forms (Facts ↔ Trade,
  Scenes ↔ Conversation as its cold-review species, Lessons ↔ Knowledge) and adds
  the live-interaction generalization of the Reflective Scene. S1/S2 and N-1..N-6
  govern every tier unchanged; this document remains supreme on conservation. The
  on-pane rendering of Facts and Conversation-tier reveals is governed by
  [TEDS_GRAMMAR.md](file:///C:/Users/78701/Desktop/trading-emulator/docs/architecture/TEDS_GRAMMAR.md).

---

## 10. References

- [TRAINING_WORKFLOW.md](file:///C:/Users/78701/Desktop/trading-emulator/docs/architecture/TRAINING_WORKFLOW.md) — the cognitive cycle this model serves.
- [UBIQUITOUS_LANGUAGE.md](file:///C:/Users/78701/Desktop/trading-emulator/docs/architecture/UBIQUITOUS_LANGUAGE.md) — term authority (Knowledge Conservation section).
- [DOMAIN_MODEL.md](file:///C:/Users/78701/Desktop/trading-emulator/docs/architecture/DOMAIN_MODEL.md) — aggregates and invariants I-1..I-15.
- [EVENT_STORMING.md](file:///C:/Users/78701/Desktop/trading-emulator/docs/architecture/EVENT_STORMING.md) — the fact fabric the black box observes.
- [PRODUCT_PRINCIPLES.md](file:///C:/Users/78701/Desktop/trading-emulator/docs/architecture/PRODUCT_PRINCIPLES.md) — P7 (simulation honesty), P11 (automatic first).
- [ARCHITECTURE_VISION.md](file:///C:/Users/78701/Desktop/trading-emulator/docs/architecture/ARCHITECTURE_VISION.md) — offline-first planes the knowledge tiers map onto.
- [RFC-014_AND_BEYOND.md](file:///C:/Users/78701/Desktop/trading-emulator/docs/architecture/RFC-014_AND_BEYOND.md) — the Mastery Block RFC drafts (Phases 1-3).
- [strategic_audit.md](file:///C:/Users/78701/Desktop/trading-emulator/docs/architecture/strategic_audit.md) — Parts 5, 7, 9 (superseded framings noted above).
- [PHILOSOPHY.md](file:///C:/Users/78701/Desktop/trading-emulator/docs/engineering/PHILOSOPHY.md) — Sections 2.7 (executable invariants), 3.2 (decision identity), 3.5 (error-cost asymmetry).
