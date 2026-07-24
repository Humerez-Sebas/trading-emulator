# TEDS Grammar — Trade Experience Design System

| Field | Value |
| :--- | :--- |
| Status | Foundational (normative, living document) |
| Date | 2026-07-22 (consolidates TEDS Phase 1 rev 18-jul + Phase 2 rev 19-jul + phase-gate rulings 2026-07-19; **Phase 3 Interaction (RULED) + Phase 4/5 Motion (RATIFIED)** folded in 2026-07-22 — interaction spec = `TEDS_INTERACTION.md`, motion spec = `TEDS_MOTION.md`) |
| Authority | Normative source for everything trade-related drawn on a chart pane. Sits below `TRADER_KNOWLEDGE_MODEL.md` (S1/S2, N-1..N-6) and `EXPERIENCE_DOMAINS.md` (domain boundaries); visual token integration is governed by `DESIGN_SYSTEM.md` §6.4 |
| Upstream | `PRODUCT_PRINCIPLES.md` §1 — "The UI Manages Attention, Not Pixels". TEDS is that governing model applied at pane grain: the pane's attention budget is spent on price first, and every First Principle below is a pane-level application of a product principle (normative mapping in §3.1) |
| Renders | The Claude Design project "TEDS" (Baseline, Phase 1 — Conceptual Design, Phase 2 — Component Design, Phase 3 — Interaction, Phase 4 — Motion, Phase 5 — Motion Consolidation) holds the exploratory renders; archived under `docs/superpowers/specs/2026-07-teds-phase{3,4,5}-*.md`. Those are *exploration artifacts*; **this file plus `TEDS_INTERACTION.md` (interaction) and `TEDS_MOTION.md` (motion) are the normative record**. On conflict, the normative record wins |
| Language authority | `UBIQUITOUS_LANGUAGE.md` §7 (TEDS vocabulary registered there) |
| Supersedes | The visual direction of RFC-017 §6 and `docs/superpowers/specs/2026-07-16-rfc-017-trade-visualization-concepts.md` (registered supersession — see Section 10) |
| Decision namespace | `TEDS-D#` (Section 9; resolves the collision between the design docs' bare D-numbers and the repository decision registry D1/D8/D9/D14.x/D16.x/D17.x) |

---

## 1. Purpose and Philosophy

TEDS (Trade Experience Design System) defines the **visual language in which trades
speak on a chart pane**. It exists because the inherited language — filled TP/SL
rectangles, full-width dashed price lines, axis-label pollution, a corner P/L HUD —
is MetaTrader's language, and it teaches the eye to skim, never to see
(`PRODUCT.md` anti-references; Baseline audit).

The central move of TEDS: **the Trade Box dies; the Trade Object is a sentence.**
A trade is not a container with content painted over candles. It is a compact mark —
about 30px of hairline at idle — that *conjugates* as the trader interacts with it.
Everything trade-related ever drawn on a pane is built from six primitives and seven
laws, and nothing else. New features may combine primitives; they may never invent a
seventh. That single constraint is what makes the system feel like one instrument
instead of a widget collection.

TEDS is training-first: it serves a deliberate-practice instrument, not an execution
platform (RFC-017 §1). Its information model exists to answer the six deliberate-
practice questions (does it reduce cognitive load? protect the chart? teach
something? need to be visible? appear with context? follow the trade?) — audited per
component in Phase 2 §05.

### 1.1 Anti-goals (inherited from Phase 1, binding)

| Id | Anti-goal | Why it is banned |
| :--- | :--- | :--- |
| AG-01 | MetaTrader clutter | Density is not information |
| AG-02 | Bloomberg chaos | Competing modules destroy single-question focus |
| AG-03 | Dashboard overload | KPIs by default invite performance-watching |
| AG-04 | Disconnected widgets | Re-assembly is the interface's job, not the trader's |
| AG-05 | Gamification | Rewards outcome over process — the bias training must undo |
| AG-06 | Casino color | Saturated red/green floods equate money with emotion |
| AG-07 | Permanent HUDs | Anything floating over candles taxes every glance at price |
| AG-08 | Alert soup | Toasts interrupt deliberate review with someone else's priorities |
| AG-09 | Infinite lines | A trade's geometry is time-bounded; eternal levels claim false relevance |
| AG-10 | Decorative data | If it isn't read, it isn't drawn |
| AG-11 | Configuration theater | Every preference is a design decision we refused to make |
| AG-12 | Broker mimicry | Execution-platform patterns import execution values into a school |

---

## 2. Authority and Scope

**Governs:** every mark a trade (pending, open, closed, ghost/replayed) paints on a
chart pane: geometry, ink levels, hue policy, text policy, interaction reveal,
zoom behavior, coexistence and collapse.

**Does not govern:**

- DOM surfaces (Journal, Playbook panel, Reflection Cabin, dialogs) — governed by
  `DESIGN_SYSTEM.md`.
- What information *belongs* to the pane at all — governed by
  `EXPERIENCE_DOMAINS.md` (the Market / Trade / Conversation / Knowledge boundary).
- Domain semantics of trades and knowledge — `DOMAIN_MODEL.md`,
  `TRADER_KNOWLEDGE_MODEL.md`.
- Panel composition, sync channels, and the trade-layer gating predicate — RFC-017
  §2–§5 (which survive TEDS untouched; only RFC-017's §6 visual direction is
  superseded, Section 10).

Token values used by TEDS renders (Geist/Geist Mono, monochrome candles, accent
candidates) are **exploratory** until integrated into `DESIGN_SYSTEM.md` through its
own §6.4 evolution procedure (justification + contrast verification). Until then,
`DESIGN.md` / `DESIGN_SYSTEM.md` remain the token authority (its §6.1).

---

## 3. First Principles (FP)

| Id | Rule | Executable test |
| :--- | :--- | :--- |
| FP-1 | The chart is always the primary surface | In any state, ≥80% of workspace pixels belong to price panes; nothing overlaps candles at idle |
| FP-2 | Trades belong to the chart | No trade datum in chrome without an on-chart anchor traceable by eye |
| FP-3 | Information follows the trade | Pan the chart: every trade label moves with its trade |
| FP-4 | Interaction reveals information | Visible labels at idle ≤ 1 per trade |
| FP-5 | Nothing competes with price action | Greyscale screenshot: candles are the brightest elements in the pane |
| FP-6 | Remove before adding | Every new element names the element it replaces or the empty state it fills |
| FP-7 | Every pixel justifies its existence | "What question does this answer?" — no answer, no pixel |

Refinement registered 2026-07-19 (TEDS-D13): FP-3 is read at event grain —
**information follows the event**, not the viewport, not a panel, not free space.
A spatial fact renders at the price-time coordinate where it happened.

### 3.1 Provenance — the FP ladder derives from the Product Principles

The grammar invents no philosophy: each First Principle is the pane-grain
application of a governing product principle (`PRODUCT_PRINCIPLES.md` §1–§2, whose
§1 establishes that the UI manages attention, not pixels). This mapping is
normative — a conflict between an FP reading and a P reading resolves upward,
toward the product principle.

| FP | Derives from | Reading |
| :--- | :--- | :--- |
| FP-1 | P1 | The chart's hero status at pane grain: ≥80% of workspace pixels for price, nothing over candles at idle |
| FP-2 | P3 · P10 | Management-phase information overlays the chart (P3) instead of pulling the eye to chrome (P10's frozen split) |
| FP-3 | P3 · P10 | The eye stays with the trade; no panel, viewport edge, or free space may host a trade datum |
| FP-4 | P3 | Observation is the dominant cognitive state: silence by default; tiers open only on the trader's gesture |
| FP-5 | P1 · P2 | Nothing competes with price — hero chart (P1) and visual hygiene (P2) enforced inside the pane |
| FP-6 | P2 | Empty space is a feature; every addition must displace something, never accumulate |
| FP-7 | P2 | Every pixel earns its attention cost or does not render |

---

## 4. Invariants (INV)

INV-01..10 are carried verbatim from Phase 1. INV-11 and INV-12 were added by the
2026-07-19 phase-gate rulings (Section 9).

| Id | Invariant | Detail |
| :--- | :--- | :--- |
| INV-01 | A trade owns its information | Levels, path, P/L, notes render as facets of one object — never as free-floating siblings |
| INV-02 | Information never duplicates | Each datum has exactly one authoritative position per panel state; a second appearance must replace the first |
| INV-03 | Context precedes detail | Reveal order is fixed: position → risk geometry → excursions → diagnostics. No tier skips ahead |
| INV-04 | Selection never blocks price | Selected-state affordances draw beside, not over, the candles of the trade's own bars |
| INV-05 | Motion never distracts | Animation only confirms user action or state change; nothing moves at idle; durations ≤ 240 ms |
| INV-06 | Same interaction, same result | Hover reveals, click selects, drag adjusts — identical on every component |
| INV-07 | Closed history is immutable | A closed trade's record never re-renders differently: same geometry, same encoding, forever. The record never editorializes |
| INV-08 | Trade geometry is time-bounded | No infinite horizontal lines: every level spans its trade's lifetime only (open = growing edge) |
| INV-09 | Panels compose, never copy | Render(panel) = Local(panelId, symbol) + Shared(groupId, symbol) — no merge logic (aligned with RFC-017 Invariant 2) |
| INV-10 | Degradation follows priority | When space runs out, elements collapse bottom-tier-first per the tier ladder — never arbitrarily |
| **INV-11** | **Selection has cardinality one** | Exactly zero or one Trade Object is selected per workspace. Subtractive selection ("the world dims") is a world-state relative to a single focus; two simultaneous foci are undefined. Multi-trade *comparison* is a different verb, out of scope, revocable only by an explicit future RFC (same mechanism as the 008-012 frozen non-goals) |
| **INV-12** | **Conversation state is never persisted** | Hover, selection, veils, DG reveals, and every other TEDS interaction state are Conversation-domain state (`EXPERIENCE_DOMAINS.md` X-1): derived, ephemeral, recomputable. It never enters `SessionPayloadV2/V3`, never syncs, never survives a reload. Detector: schema review — no selection/hover/reveal fields in any persisted payload |

---

## 5. Information Priority Tiers

The tier ladder binds ink and reveal politics (silence-by-default, E3·M1 verdict):
idle shows P1 only; hover adds P2; selection opens P3 + DG.

> **Nota de alcance (F-6):** la política de revelación por tiers es la capa de
> interacción, ahora especificada normativamente en `TEDS_INTERACTION.md`
> (Phase 3 · matriz de 21 celdas, TEDS-D14–D20). Este resumen de tiers permanece
> como el ancla de tinta de la gramática; el contrato de interacción completo vive
> en ese documento.

| Tier | Name | Content | Encoding |
| :--- | :--- | :--- | :--- |
| P1 · PRIMARY | Position truth | Direction, entry, live P/L in R | 100% ink · always on · anchored to trade |
| P2 · SECONDARY | Risk geometry | SL/TP levels, size, distance-to-level | ~70% ink · hover strengthens |
| P3 · TERTIARY | Trade metadata | Lots, age, rule tag, session | ~45% ink · never at idle |
| DG · DIAGNOSTIC | Learning signals | MAE/MFE, efficiency, plan-vs-execution deltas | ~45% ink + semantic hue at markers · selection only |
| H · HISTORICAL | The archive | Closed lifecycles, replay ghosts | ~30% ink · no fills · immutable geometry |

---

## 6. The Six Primitives (PR)

Everything trade-related on a pane is built from these six marks and nothing else.

**PR-1 — Node.** A price-time event: entry, exit, partial. Filled = executed fact;
hollow = pending level. The only mark that may carry outcome hue. Radius constant
2.4–4.5px; colliding nodes merge.
*Amendment TEDS-D10.b (2026-07-19):* **MAE/MFE notches are Nodes** — price-time
events rendered in a triangular glyph variant. This makes them legal chip anchors
under PR-6 and closes the gap where "notches" appeared in L4 without belonging to
any primitive.

**PR-2 — Tick.** A price level owned by a trade: entry, SL, TP. 8–10px wide, never
a full-width line. Draggable when hollow-handled. Lives on a Stem; width ∝
importance.

**PR-3 — Stem.** The trade's body: a 1px vertical at the entry bar spanning SL→TP.
Time-bounded ownership made visible (INV-08). 1–1.2px; halo on selection; never
thickens.

**PR-4 — Filament.** The position's journey through time, entry node to exit (or
live edge). **The Filament is the sole owner of trade time**: duration,
path, and lifecycle belong to it exclusively. 1.5px max; width may *decrease*
(scale-out). The lifecycle record and the training payload.

**PR-5 — Veil.** A translucent field (≤8% alpha) marking a **price zone** during a
conversation: R:R area on hover, drag previews, cluster extents. Interaction-only
(L5); never at idle.
*Amendment TEDS-D10.a (2026-07-19), strict clauses now normative:*

- A Veil is a **contextual surface**: the spatial projection of a relation that
  already exists in the grammar (entry→TP, entry→SL, cluster extent). Its edges are
  always owned by grammar marks (Ticks, Nodes, Stems) — never by the amount of
  content someone wants to display.
- A Veil is **not** a panel, a container, an inspector, or a text canvas. It
  communicates through exactly two channels: extent (geometry) and alpha
  (intensity).
- A Veil **never duplicates the Filament**: it must not become the physical
  representation of time-in-trade. A veil whose bounds are dictated by text layout
  is the Trade Box resurrected at 8% alpha.
- A Veil has **no layout**. The chart is the layout: every datum has a price-time
  coordinate.
- A Veil exists in data-space; the viewport clips its render (existence ≠ paint).
  It never re-anchors to viewport edges (that is HUD behavior, AG-07).
- Motion: a Veil *emerges from its owner* (unfolds from the Stem) and dissolves
  back toward it — never fades in place like an overlay (Phase 4 choreography
  principle, decidable now).

**PR-6 — Chip.** The only text container on the pane: price, R, count. Monospace,
one line, anchored to a Node/Tick/Stem — never free-floating. **Max 2 visible per
trade**; flips to the empty side on collision. (MAE/MFE notches qualify as anchors
via PR-1 as amended.)
*Disambiguation:* the TEDS Chip is canvas ink and is distinct from the DOM UI
primitive "Badge / Chip" (`.ui-badge`, `DESIGN_SYSTEM.md` §3.1) — see
`UBIQUITOUS_LANGUAGE.md` §7.

---

## 7. The Seven Laws (L)

| Id | Law | Detail |
| :--- | :--- | :--- |
| L1 | No orphan ink | Every mark belongs to an object (trade, order, market). Unownable decoration does not exist. Corollary: the pane is constitutionally incapable of showing aggregates (win rate, expectancy) — they have no single owner |
| L2 | Ownership chains | Chips anchor to Nodes/Ticks/Stems; Ticks live on Stems; Stems anchor to price-time. *Amendment TEDS-D10.c (2026-07-19):* **Filaments and Veils are owned by their trade** — the Filament anchors to the trade's Nodes (entry→exit/live edge); the Veil's edges anchor to the trade's Ticks/Nodes/Stem. Delete the owner, the chain vanishes |
| L3 | Emphasis = luminance, never weight | Strokes stay 1–2px forever; importance is brightness, so density never turns into thickness |
| L4 | Hue only at outcomes | Win/loss/risk color appears exclusively on Nodes, Ticks, and notches (Nodes per PR-1 amendment) — points, not areas. Areas are always the accent at ≤8% |
| L5 | Veils are conversational | Zones render during hover/drag/selection and dissolve on release. The idle chart carries hairlines only |
| L6 | Text is chipped | No naked text on the pane. If it can't live in a chip anchored to the grammar, it belongs in a Conversation projection (Dock) or in Knowledge (Journal). **Reaffirmed unchanged 2026-07-19** — the proposal to allow free text inside a selected Veil was rejected (TEDS-D10.a rationale: it converts a primitive into a UI component — padding, alignment, wrapping, overflow — and breaks the grammar/UI separation) |
| L7 | Every element ships its three zoom forms | Completa / Estándar / Glifo, switched at bar-spacing breakpoints, each form *designed, not scaled*; nothing renders sub-pixel. Extension TEDS-D13: the progressive-reveal strategy is itself an "element" under this law — it ships three designed forms, not one scaled behavior |

---

## 8. Exploration Verdicts (E1–E10)

The verdicts below are the standing composites. Amendments of 2026-07-19 are marked;
unmarked verdicts are carried unchanged from the design documents.

| Id | Question | Standing verdict |
| :--- | :--- | :--- |
| E1 | Trade ownership | **Spine** (M2): 1px vertical spine at entry, near-zero idle ink; M1's zone fills demoted to hover/selection states; M3's bracket review-mode only |
| E2 | Lifecycle | **Filament** (M1) is the canonical record; waypoint constellation (M3) is its low-zoom collapse form, not an alternative; envelope reads (M2) belong to the Journal |
| E3 | Reveal politics | **Silence by default** (M1), strictly: idle = P1; hover = +P2; selection = +P3+DG. Opacity ladder survives only as a review-mode "show all tiers" toggle |
| E4 | Selection standing | Composite: dimming (M1) + halo (M3) as the universal selected state. **Amended (TEDS-D13):** the "anchored card in the pane's empty quadrant" clause is superseded — diagnostics distribute to their events (Section 8.1); the Dock is a Conversation projection, not the diagnostic destination |
| E5 | Coexistence | Micro-lanes + merged levels (M1) as default; cluster chips (M3) as escape hatch past ~4 colliding anchors; focus+ghosts (M2) as a deliberate review tool on a hotkey |
| E6 | Zoom collapse | Semantic zoom thresholds (M1) as skeleton + constant-px anchors (M3) as flesh; the ink-budget metric (M2) becomes the acceptance test each zoom form must pass |
| E7 | Selection philosophy | Compose subtraction (M1: world drops to 18%, candles untouched) + embodiment (M2: halo + grab handles on the selected object). Relocation (M3) rejected as default. **Amended (TEDS-D13):** the clause "its dock remains the overflow home for DG text beyond two chips" is superseded — see Section 8.1 |
| E8 | Floating P/L | **Rider** (M1): one chip rides the Filament's live edge, P/L in R first, currency on hover; kills the corner HUD (AG-07). Meter (M3) becomes "modo enfoque" (session toggle). Axis delta (M2) rejected (re-crowds the axis; orphans the number, L1) — *pending owner ratification, TEDS-D7* |
| E9 | Ghost Rails (drag conversation) | R-ladder magnetism (M2) over the live-rail chassis (M1), with M3's R:R chip joining the drag state; Alt = free placement — *pending owner ratification, TEDS-D8*. **Note:** "Ghost Rails" names THIS drag conversation; the RFC-017 spec's use of "Ghost Rails" for its Concept A is retired (Section 10) |
| E10 | Lifecycle rendering | **Pure Filament** (M1) is the immutable record (INV-07); conviction-shading (M2) is legal only while selected, reverting on deselect (the record stays pure, the diagnosis is conversational); chapters (M3) = the Estándar/Glifo collapse of M1 — *pending owner ratification, TEDS-D9* |

### 8.1 The distributed-reveal amendment (supersedes dock-as-overflow)

> **Nota de alcance (F-6):** la estrategia de revelación progresiva quedó **resuelta
> en Phase 3** (TEDS-D14, *staggering* = Ask-for-depth + Walk-for-breadth) y se
> especifica normativamente en `TEDS_INTERACTION.md`. Las cuatro restricciones
> congeladas de abajo se conservan como el origen de esa decisión.

The 2026-07-19 review identified that the E4/E7 dock-overflow clause violated FP-3
(eye travel chart ⇄ dock) and resolved it **without amending L6**:

- **Spatial diagnostics render at their events.** MAE and MFE are price-time events
  (Nodes per PR-1 amendment); their values are chips anchored to those Nodes.
  Duration is the Filament's own horizontal extent. Entry/exit facts live on their
  Nodes. Information follows the *event* — never free space, never a side panel.
- **Aspatial judgments** (plan-adherence check, exit efficiency — facts about the
  whole trade with no coordinate) render as the DG chip and/or project to the Dock,
  which is a **Conversation projection** (`EXPERIENCE_DOMAINS.md` X-2), never a
  storage surface and never the *destination* of the selection conversation.
- **The (former) open problem — resolved in Phase 3 as TEDS-D14:** the full
  progressive-reveal strategy — *how a selected Trade Object staggers complex
  diagnostics speaking only the six primitives* — is now specified in
  `TEDS_INTERACTION.md`. Its binding constraints, frozen at the Phase 2 gate and
  honored by the D14 mechanism:
  1. PR-6 budget holds: ≤2 chips visible simultaneously per trade.
  2. The strategy ships three designed zoom forms (L7) — distribution that works at
     Completa must have designed collapses for Estándar/Glifo (a 3-bar scalp
     inverts the collision problem a 400-bar trade poses).
  3. It covers both categories: spatial facts (distributed) and aspatial judgments
     (projected).
  4. It extends the existing reveal order (FP-4 / INV-03) — it does not invent a
     parallel mechanism.

---

## 9. Decision Ledger (TEDS-D)

TEDS decisions use the `TEDS-D#` namespace. The Claude Design Phase 2 document
labeled its phase-gate items D6–D10; those bare numbers collide with the repository
decision registry (D1 mono-symbol, D8 factory-selector ban, D9 atomic payload —
`UBIQUITOUS_LANGUAGE.md` §12) and are hereby renamed. The design renders must adopt
the prefixed ids on their next revision.

| Id | Decision | Status |
| :--- | :--- | :--- |
| TEDS-D6 | Selection composite: subtract + embody as the single selection philosophy | **Approved with amendment** — the dock-as-DG-overflow clause is replaced by distributed reveal (Section 8.1) |
| TEDS-D7 | P/L Rider as default (R primary, currency secondary at 55%); *modo enfoque* = workspace-level session toggle that hides **both** currency and R (rider degrades to a numberless meter travelling the SL→TP span); digits return only at close (the record never hides — INV-07) | **Ruled — Phase 3 (2026-07-22)** — scope of hidden digits settled: enfoque hides currency AND R |
| TEDS-D8 | Ghost Rails ladder fixed at **1R/2R/3R**; when the active setup carries a playbook rule, its required rung takes the luminance emphasis + the one-line rule chip and base rungs recede to 25%; Alt = free placement ships regardless | **Ruled — Phase 3** — ladder steps fixed (not per-rule); Knowledge projects as emphasis (L3), never geometry (L6) |
| TEDS-D9 | Lifecycle: pure Filament as the immutable record (outcome hue at the exit Node only, pixel-identical forever — INV-07); conviction-shading is Conversation, legal **only while Selected**, reverts on deselect, never persisted (INV-12) | **Ruled / Ratified — Phase 3** |
| TEDS-D10 | Grammar freeze (six primitives + seven laws) | **Ruled — frozen with amendments:** (a) PR-5 strict clauses (Veil is a contextual surface; not a container; never duplicates the Filament; no layout; L6 not amended); (b) MAE/MFE notches classified as Nodes (PR-1); (c) L2 ownership chain extended to name Filament and Veil ownership; (d) INV-11 and INV-12 added; (e) L6 reaffirmed verbatim |
| TEDS-D11 | **Experience-domain taxonomy adopted**: Market → Trade → Conversation → Knowledge, documented in `EXPERIENCE_DOMAINS.md`, subordinate to TKM S1/S2 | Ruled 2026-07-19 |
| TEDS-D12 | **The Dock is a projection, not a domain**: it projects Conversation-tier content (aspatial judgments) during the selection conversation; it never stores knowledge, never replaces the Journal, never editorializes the Chart. It is demoted from "overflow home" to projection surface | Ruled 2026-07-19 |
| TEDS-D13 | **Distributed progressive reveal** replaces dock-overflow as the diagnostic strategy; FP-3 refined to event grain; strategy details deferred to Phase 3 under the four binding constraints of Section 8.1 | Ruled 2026-07-19 |
| TEDS-D14 | **Reveal staggering mechanism**: *Ask for depth + Walk for breadth* within the fixed 2-chip-seat budget (PR-6). Seat A holds the aspatial voice (DG / R:R / rule chip); seat B holds the nearest event's chip and travels with cursor or ←/→. Tiers advance only on an explicit step verb, always in INV-03 order; dwell rejected | Ruled — Phase 3 (2026-07-22) |
| TEDS-D15 | **Scalp collapse** is threshold-driven in **pixels**: when a trade's event span falls below 24px its event Nodes merge into one composite Node (a Node merge, not a seventh primitive); selection decomposes it as a vertical unstack along the Stem; floor = a 1-bar trade; no decomposition offered at Glifo | Ruled — Phase 3 |
| TEDS-D16 | **Dock choreography = fixed slot** (Echo, amended): selection fills it instantly, deselection empties it, it holds nothing between; because the slot is spatially fixed and always allocated, filling it moves no layout (the pane never shifts under a click) | Ruled — Phase 3 |
| TEDS-D17 | **Drag × selection = Deepening, narrowed**: drag is reachable only from Selected (handles are selection affordances); while dragging, the trade's other chips retire — rail + ladder + R:R chip hold both seats; release commits → Selected, Esc cancels; not offered at Glifo | Ruled — Phase 3 |
| TEDS-D18 | **Multi-panel echo = Origin + witness**: INV-11 is global (one selected Trade Object per workspace); the gesture panel renders full subtract + embody, every other panel showing the trade renders a witness luminance-halo only (no dimming, no chips) | Ruled — Phase 3 |
| TEDS-D19 | **Keyboard = read-only reachability**: Tab cycles the roster of visible trades in time order, Enter embodies, Esc subtracts, ↑/↓ walk the reveal ladder, ←/→ walk the selected trade's events; no level-nudge keys (editing risk geometry stays a pointer verb) | Ruled — Phase 3 |
| TEDS-D20 | **The 21-cell state matrix** (7 states × Completa / Estándar / Glifo) ratified as the canonical interaction contract; normative record = `TEDS_INTERACTION.md` | Ruled — Phase 3 |
| TEDS-D21 | **Motion vocabulary + anti-decoration gate**: the eight moves (Dissolve · Lift · Quiet · Emerge · Travel · Seal · Swap · Snap) are a closed set; any choreography not expressible as these is rejected. Motion narrates completed state, never delays it | Ratified — Phase 4 |
| TEDS-D22 | **Timing/easing tokens, exit ≤ entry**: reuse the wired `--duration-fast/base/slow` + `--ease-out/--ease-in`; **add** `--duration-exit: 80ms` and `--ease-linear`; opacity is the only medium (integration via `DESIGN_SYSTEM.md` §6.4 / `TEDS_MOTION.md`) | Ratified — Phase 4 |
| TEDS-D23 | **Selection choreography order**: subtraction leads (the world quiets first), information begins last, all beats resolve ≤ 240ms (INV-05) | Ratified — Phase 4 |
| TEDS-D24 | **Geometry-truth canvas exemption**: the live rider/meter dot, the live edge and the Tick-commit travel are Tier-0 reality (linear, canvas rAF), exempt from "nothing moves at rest" and never CSS transitions | Minted — Phase 4 |
| TEDS-D25 | **Reduced-motion hybrid**: strip spatial keyframes + geometry travel, preserve luminance/color fades capped to the fast rung (≤120ms) | Minted — Phase 4 |
| TEDS-D26 | **Fast crossfade** for the zoom form-swap (≤120ms; outgoing dissolves as incoming lifts; no scale, no morph) | Minted — Phase 4 |
| TEDS-D27 | **Simultaneous multi-panel echo**: every witness surface updates on the same frame as the origin (t=0, no stagger, no temporal hierarchy) | Minted — Phase 4 |
| TEDS-D28 | **Block-render ladder**: the Ghost-Rails R-ladder renders complete in one beat (one class on the container), no per-rung cascade | Minted — Phase 4 |
| TEDS-D29 | **Silent Dock seal** (open → closed): no pulse, no exit-efficiency projection; win and loss seal identically — closure is informational, not celebratory (INV-07, no gamification) | Minted — Phase 4 |

All TEDS design decisions are now ruled (TEDS-D6–D29); nothing in the ledger remains
pending. The interaction-state matrix is specified normatively in `TEDS_INTERACTION.md`
(Phase 3) and the motion layer in `TEDS_MOTION.md` (Phase 4/5). Implementation of these
behaviors is a downstream plan, not a reopening of the grammar.

---

## 10. Supersessions (registered, never silent)

- **RFC-017 §6 "Capa de Visualización de Trades (dirección visual)"** and its
  companion spec `docs/superpowers/specs/2026-07-16-rfc-017-trade-visualization-concepts.md`
  (Concept A "Ghost Rails" + two adoptions, selected 2026-07-16) are **superseded by
  this grammar** as of 2026-07-19. Specifically retired: idle risk/reward zone
  rectangles (violate L5/PR-5), the docked corner HUD chip (violates AG-07 and the
  E8 verdict), the outcome-colored trade path (violates L4 — hue only at points),
  triangle/diamond markers (replaced by Nodes, PR-1), and the entry price-axis
  label (trade levels never emit axis tags; they live on their Stems). **What
  survives from that work:** the span-scoped geometry principle (it *is* INV-08),
  the retirement of full-width price lines, MAE/MFE surfaced as first-class facts
  (RFC-014 §3), the panel gating predicate (RFC-017 §5.1), and `syncTrades`
  composition (RFC-017 §5) — all consistent with this grammar.
- **Term reassignment:** "Ghost Rails" now names exclusively the E9 drag
  conversation. The RFC-017 spec's Concept A is referred to historically as
  "span-scoped geometry (2026-07-16 exploration)".
- Supersession notes are registered in both superseded documents (same mechanism as
  RFC-016's "Nota de supersesión — TKM §6 vs D16.C").

---

## 11. Relationship to the Corpus

- `TRADER_KNOWLEDGE_MODEL.md` — supreme on knowledge conservation. TEDS renders
  Facts (Trade domain) and Conversation-tier reveals; it never authors meaning
  (N-6) and never editorializes the record (INV-07 aligns with S1).
- `EXPERIENCE_DOMAINS.md` — defines *what* may appear on the pane (domain
  boundaries, projections, the three-question test); TEDS defines *how* it is
  drawn.
- `DESIGN_SYSTEM.md` — authority for DOM surfaces and tokens; TEDS token
  integration pending via its §6.4. The Information Architecture hierarchy
  (`DESIGN_SYSTEM.md` §1: Chart rank 1, Active trade rank 2) is honored by
  construction (FP-1/FP-5).
- `UBIQUITOUS_LANGUAGE.md` §7 — registers the TEDS vocabulary and resolves the
  Chip/Dock/Ghost Rails collisions.
- RFC-014 — provides the MAE/MFE/tMAE/tMFE facts the DG tier renders.
- RFC-015 / RFC-016 — the Knowledge domain (Playbook, Lessons, Journal, Reflection
  Cabin) that the pane links to but never absorbs.
- RFC-017 — panel composition, sync families, and trade-layer gating; visual §6
  superseded (Section 10).

## 12. References

- Claude Design project "TEDS": `TEDS Baseline.dc.html`, `TEDS Phase 1 - Conceptual
  Design.dc.html` (rev 18-jul-2026), `TEDS Phase 2 - Component Design.dc.html`
  (rev 19-jul-2026), Phase 3 — Interaction, Phase 4 — Motion, Phase 5 — Motion
  Consolidation — exploratory renders, archived at
  `docs/superpowers/specs/2026-07-teds-phase{3,4,5}-*.md`.
- `docs/architecture/TEDS_INTERACTION.md` — normative Phase-3 record (21-cell state
  matrix TEDS-D20, reveal strategy TEDS-D14, D15–D19).
- `docs/architecture/TEDS_MOTION.md` — normative Phase-4/5 record (motion doctrine,
  tiers, tokens, choreography, TEDS-D21–D29).
- `docs/architecture/EXPERIENCE_DOMAINS.md` — domain boundary doctrine.
- `docs/architecture/TRADER_KNOWLEDGE_MODEL.md` — S1/S2 stances, N-invariants.
- `DESIGN_SYSTEM.md`, `DESIGN.md`, `PRODUCT.md` — visual authority and brand.
- `docs/architecture/rfcs/017-compositional-panel-sync.md` — composition and gating.
- `docs/engineering/PHILOSOPHY.md` §3.2 — decision identity (the D-number culture
  this ledger applies to design).
