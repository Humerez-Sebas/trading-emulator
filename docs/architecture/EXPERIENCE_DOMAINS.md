# Experience Domains — Market · Trade · Conversation · Knowledge

| Field | Value |
| :--- | :--- |
| Status | Foundational (normative, living document) |
| Date | 2026-07-19 (born from the TEDS Phase 2 review; decision TEDS-D11) |
| Authority | **Cross-cutting boundary doctrine** (*doctrina transversal de fronteras*): defines *which domain every piece of information belongs to* and therefore where it may appear — normative over every surface and document on questions of domain placement. `TRADER_KNOWLEDGE_MODEL.md` retains supremacy **on knowledge-conservation matters only** (S1/S2, N-1..N-6); this document projects that doctrine onto the experience plane and creates no new epistemology. Sits beside `TEDS_GRAMMAR.md` (which governs *how* the Chart domain draws) and `DESIGN_SYSTEM.md` (which governs DOM surfaces) |
| Language authority | `UBIQUITOUS_LANGUAGE.md` §7 |
| Upstream sources | `TRADER_KNOWLEDGE_MODEL.md` §1.3/§2, `DESIGN_SYSTEM.md` §1, TEDS Phase 1/2 (L5, DG tier), RFC-015/016 |

---

> **Scope note — Experience Domains ≠ Bounded Contexts.** The four domains named
> here classify *information* by authorship, tense, and persistence on the
> experience plane. They are **not** DDD bounded contexts: model boundaries with
> aggregates live in `DOMAIN_MODEL.md` §2 (Market Data, Simulation/Trading,
> Workspace/Presentation, Knowledge Conservation). The two taxonomies correlate
> (Trade facts live in the Simulation context; Knowledge in the Knowledge
> Conservation context) but never merge — cite `DOMAIN_MODEL.md` for model
> boundaries, this document for placement doctrine.

## 1. Purpose — the missing middle tier

The corpus already had a documented boundary between the two poles:

- **The system observes and conserves; the trader interprets** (TKM S1).
- **Meaning lives exclusively in trader-authored content** (`DESIGN_SYSTEM.md` §1;
  TKM N-6).

What no document named was the **middle tier**: the ephemeral, derived state that
exists while the trader converses with a Trade Object — hover, selection, veils,
diagnostic reveals, drag previews, reconstructed scenes. Its properties already
existed in three disconnected fragments, described identically and connected by
nobody:

1. TEDS L5: *"Veils are conversational"* — render during interaction, dissolve on
   release.
2. TKM §2.1/§2.2: the Reflective Scene — *"recomputable value object… exists as
   parameters, never as stored pixels"*, loss cost **zero**, ceremony **none**.
3. TEDS Phase 1 §07: the DG tier — diagnostics that exist only in selection and
   review states.

When three independent fragments of a corpus describe the same thing without naming
it, naming it is discovery, not invention. This document names it: the
**Conversation** domain.

## 2. The founding principle

> **The Chart shows what happened.
> The Conversation reveals what matters now.
> Knowledge preserves what it meant.**

Corollaries, each anchored to existing doctrine:

- The Chart never editorializes (TEDS INV-07; TKM S1/N-6).
- The Conversation is never persisted (X-1 below; generalizes TKM N-3
  "reconstruction over storage").
- Knowledge never floods the pane: it projects at most single-line summaries
  (X-3 below; TEDS L6).
- Surfaces (Dock, Journal pages, Reflection Cabin) are *projections of domains*,
  never domains themselves (X-2 below).

The principle speaks in **domains**, deliberately not in surfaces: "Journal" the
surface projects Knowledge the domain; anchoring doctrine to a UI component would
invert that dependency.

---

## 3. The four domains

```
Market  →  Trade  →  Conversation  →  Knowledge
(reality)  (facts)   (ephemeral now)   (durable meaning)
```

| Property | Market | Trade | Conversation | Knowledge |
| :--- | :--- | :--- | :--- | :--- |
| Nature | The replayed market reality | Physical facts of executions | Ephemeral interaction state | Durable trader-authored meaning |
| Authored by | The market (historical data) | The fill engine (execution) | Derived on demand (system) | **The trader only** (N-6) |
| Tense | Present of the replay | Past perfect (immutable) | Present of the interaction | Reflective past + future conditional |
| Has price-time coordinates | Yes | Yes | Borrowed from its subject | No (references them as evidence) |
| Persistence | Immutable datasets (R2/IndexedDB) | Append-only records | **Never persisted** | Highest ceremony: LWW rows, export, deletion-protected (TKM §2.2) |
| Loss cost | Re-downloadable | Annoying | **Zero — recomputable** | **Catastrophic** |
| Existing anchors | Market Data Context (UL §6) | Trade Record (TKM §2.1, UL §9) | *new* — this document | Knowledge Conservation Context (UL §9, TKM §5) |

**Market.** Candles, sessions of history, the replay cursor's world. Already
strictly separated from the User Workspace domain (`CLAUDE.md` invariant 3).

**Trade.** What executions physically did: entries, exits, partials, levels, MAE/MFE
excursions, elapsed times. Evidence, not knowledge (TKM §2.1). On the pane, this
domain speaks TEDS: it renders as the Trade Object's grammar.

**Conversation.** Everything that exists *because the trader is currently asking*:
hover states, the selected Trade Object, veils, DG reveals, drag previews (ghost
rails), progressive disclosure, and — in cold review — the Reflection Cabin's
reconstructed scenes. The Reflective Scene (TKM §2.1) is hereby understood as the
Conversation tier's cold-review species: same derivation, same zero-storage law,
different moment. The Conversation borrows coordinates and facts from Trade/Market,
composes them, and dissolves without residue.

**Knowledge.** Playbook rules, Lessons, amendments, reflections, and every
cross-trade aggregate (statistics, adherence trends). Two independent reasons bar it
from the pane: it is language, not geometry (TEDS L6), and aggregates have no single
owner on a chart (TEDS L1 — no orphan ink).

---

## 4. Boundary invariants (X)

Per `PHILOSOPHY.md` §2.7, invariants ship with detectors.

| Id | Invariant | Detector |
| :--- | :--- | :--- |
| X-1 | **Conversation is never persisted.** No selection, hover, veil, reveal, or scene state enters `SessionPayloadV2/V3`, IndexedDB stores, or cloud sync. Scenes exist as `SceneSpec` parameters only (TKM N-3) | Schema review: no interaction-state fields in persisted payloads; TEDS INV-12 mirrors this on the pane side |
| X-2 | **Surfaces are projections, never domains.** The Dock projects Conversation; Journal pages and the Reflection Cabin project Knowledge and Conversation respectively. A projection never stores, never owns, never outlives its domain's state | Design review: any surface holding state its domain doesn't own is a violation |
| X-3 | **Knowledge projects into the pane at most as single-line chips.** A declared-rule check (`plan: ✓`) may ride the DG conversation; the rule's statement, the lesson's text, the analysis never enter the pane | TEDS L6 + PR-6 budget (≤2 chips/trade) |
| X-4 | **The Chart never editorializes and never aggregates.** Interpretation is trader-authored (N-6); aggregates have no owner (TEDS L1) and belong to Knowledge surfaces | TKM N-1 vocabulary ban; TEDS INV-07 |
| X-5 | **Spatial facts render at their coordinates; aspatial judgments never fake one.** MAE renders at its Node; exit efficiency (a whole-trade judgment) projects to the DG chip/Dock, never pinned to an arbitrary bar | TEDS §8.1 distributed reveal |
| X-6 | **Cross-domain references, never copies.** The Conversation references Trade facts; Knowledge embeds only frozen `SceneSpec` evidence (TKM §5.2); no domain caches another's substance | `assertNoCandles` discipline (N-5) as the existing model |

## 5. The three-question test

For any future piece of information, ask:

1. **Coordinate** — did it happen at a price-time point you can point at?
2. **Authorship** — market/execution fact, system-computed judgment, or
   trader-authored meaning?
3. **Reading mode** — read in under a second during action, or thought about in
   language after it?

Fact + coordinate + glance → **Trade domain, rendered by TEDS at its coordinate**.
Trader-authored, or cross-trade, or language → **Knowledge**.
System-computed about the current focus, alive only during interaction →
**Conversation** (DG chip and/or Dock projection).
A tie means it is a *projection*: one summary chip in the conversation, substance in
Knowledge.

### Adjudicated cases (normative examples)

| Case | Ruling |
| :--- | :--- |
| Entry/exit prices, SL/TP levels | Trade — Nodes/Ticks at their coordinates |
| MAE/MFE | Trade facts (RFC-014 §3) — Nodes on the Filament; values as chips on demand. Their cross-trade averages: Knowledge |
| Duration | The Filament's own extent (geometry). "I hold losers too long": Knowledge |
| Exit efficiency, plan-adherence check | Conversation — DG chip / Dock projection while selected; substance in Knowledge |
| The declared rule's statement, lessons, amendments | Knowledge — never on the pane (X-3) |
| Emotional state, behavioral tags | Knowledge, trader-authored only; never ink (X-4, N-1) |
| Replay ghost trades (past attempts) | Trade — spatial facts, H-tier render (TEDS §5). The lesson from an attempt: Knowledge |
| A trader note about a chart moment | Knowledge (the sentence) + a minimal grammar presence mark on the pane. *The Chart keeps the pointing finger; Knowledge keeps the sentence* |
| Win rate, expectancy, streaks | Knowledge surfaces only — constitutionally banned from the pane (TEDS L1) and demoted from knowledge-tier prominence anyway (TKM §6) |

---

## 6. The Dock, resolved (decision TEDS-D12)

The Dock's historical ambiguity — L6 called it a text destination, the E7 verdict
made it "the overflow home", RFC-017 §6 made a corner HUD permanent — was the
symptom that this taxonomy was missing. Resolution:

- The Dock is a **projection surface of the Conversation domain**. It renders
  aspatial judgments about the selected trade *while the selection conversation is
  alive*, and empties when it ends.
- It never stores knowledge, never replaces the Journal, never editorializes the
  Chart, and is never the *destination* of the selection conversation (FP-3: the
  eye stays with the trade; spatial diagnostics render at their events, TEDS §8.1).
- Naming: the TEDS Dock is distinct from the *workspaces dock* (panel container,
  TKM §5.1 Playbook Panel). `UBIQUITOUS_LANGUAGE.md` §7 registers the
  disambiguation.

## 7. Relationship to the corpus

- **TKM is supreme.** The mapping is: Facts ↔ Trade · Scenes ↔ Conversation
  (cold-review species) · Lessons ↔ Knowledge. This document adds the Market tier
  below and generalizes Scenes to all ephemeral interaction; S1/S2 and N-1..N-6
  govern every tier unchanged.
- **TEDS_GRAMMAR.md** — how the Trade and Conversation domains draw on the pane
  (primitives, laws, tiers). TEDS INV-11 (selection cardinality one) and INV-12
  (no persisted conversation state) are the pane-side enforcement of this
  document.
- **DESIGN_SYSTEM.md §1** — the Learning Loop (Observe → … → Update Knowledge →
  Return) is the trader's trajectory *across* these domains; the surface-task
  separation ("The Journal is for discovering patterns. The Reflection Cabin is
  for cognitive replay") is X-2 applied.
- **RFC-015 / RFC-016** — the Knowledge domain's aggregates (Playbook, Lesson) and
  its projection surfaces (Journal, Reflection Cabin).
- **RFC-017** / **RFC-018** — panel composition serves the Market/Trade render path;
  the RFC-018 T-1/T-2 gating (`panelRendersTrades`) decides where the Trade domain
  may speak, retiring the `syncTrades` LinkGroup channel this line used to cite.

## 8. References

- `docs/architecture/TRADER_KNOWLEDGE_MODEL.md` — S1/S2, the three knowledge forms
  (§1.3), conservation asymmetry (§2.2), N-1..N-6.
- `docs/architecture/TEDS_GRAMMAR.md` — the pane grammar; decisions TEDS-D11..D13.
- `DESIGN_SYSTEM.md` §1 — Learning Loop, Information Architecture, interaction
  principles.
- `docs/architecture/UBIQUITOUS_LANGUAGE.md` §6/§7/§9 — Market Data, Presentation,
  and Knowledge Conservation contexts.
- `docs/architecture/rfcs/015-playbook-adherencia-reglas.md`,
  `016-diario-enmiendas-playbook.md`, `017-compositional-panel-sync.md`.
- `docs/engineering/PHILOSOPHY.md` §2.7 — executable invariants.
