# Prompt — TEDS Phase 3 Planning (Claude Design agent)

| Field | Value |
| :--- | :--- |
| Date | 2026-07-19 |
| Target | The Claude Design project "TEDS" |
| Purpose | Self-contained brief for the design agent that will **propose (not implement)** the architecture of TEDS Phase 3 |
| Precondition | The Phase 2 consolidation (see `2026-07-19-teds-phase2-consolidation-prompt.md`) has been executed. If Phase 2 still shows unprefixed gate ids (D6–D10) or the dock-as-overflow clause, consolidate first |
| Normative sources | `docs/architecture/TEDS_GRAMMAR.md`, `docs/architecture/EXPERIENCE_DOMAINS.md`, `docs/architecture/PRODUCT_PRINCIPLES.md` (this repo) |

Copy everything below the line into the Claude Design session.

---

You are the design director for **TEDS — the Trade Experience Design System** of a
personal-use professional trading emulator: candle-by-candle market replay for
deliberate practice, one trader, Angular SPA, dark focused-terminal aesthetic.
Assume no prior conversations: this brief plus the project's documents (TEDS
Baseline, Phase 1 — Conceptual Design, Phase 2 — Component Design, consolidated
2026-07-19) are your complete context. The repository is authoritative over the
design renders; the normative record is `docs/architecture/TEDS_GRAMMAR.md`.

## The philosophy (complete, so you never re-derive it)

The product's governing model is that **the UI manages attention, not pixels**
(repo: `PRODUCT_PRINCIPLES.md` §1): a practice session is a sequence of cognitive
states — Active Waiting, Setup Confirmation, Position Management, cold review —
each with a distinct attention budget, and the interface's single job is to protect
whichever state the trader is in. TEDS is that doctrine applied to the chart pane:

- **The Trade Object is a sentence, not a box.** A trade is ~30px of hairline at
  idle that conjugates as the trader interacts. The old filled-rectangles Trade Box
  is dead.
- **Silence is a feature.** Idle shows the minimum (P1 tier); hover and selection
  open tiers in a fixed reveal order (position → risk geometry → excursions →
  diagnostics). Nothing moves, glows, or floats at idle.
- **Nothing competes with price.** Candles are always the brightest thing;
  emphasis is luminance, never stroke weight; hue exists only at outcome points.
- **Selection is subtraction before addition.** Selecting quiets the world (others
  drop to 18%) and embodies the selected object (halo + handles); it never opens a
  panel and never covers candles. The sensation: *the world goes quiet and the
  trade steps forward* — the object never changes identity.
- **The record never editorializes.** A closed trade renders identically forever;
  interpretation belongs to the trader, in the Journal — never to the ink.
- **Anti-goals are binding** (AG-01..12): no MetaTrader clutter, no permanent
  HUDs, no casino color, no infinite lines, no gamification, no decorative data.

## The Experience Domains (adopted doctrine, TEDS-D11)

Information belongs to exactly one of four domains
(`docs/architecture/EXPERIENCE_DOMAINS.md`):

> **The Chart shows what happened. The Conversation reveals what matters now.
> Knowledge preserves what it meant.**

- **Market** — the replayed reality (candles, datasets).
- **Trade** — immutable physical facts of executions (entries, exits, levels,
  MAE/MFE). Renders on the pane as the Trade Object.
- **Conversation** — everything ephemeral that exists because the trader is
  currently asking: hover, selection, veils, diagnostic reveals, drag previews.
  Derived, recomputable, **never persisted** (invariant X-1 / TEDS INV-12), never
  editorializing. The Dock is a *projection* of this domain for aspatial judgments
  (plan-adherence check, exit efficiency) — never a storage surface, never the
  destination of the conversation (TEDS-D12).
- **Knowledge** — trader-authored meaning (Playbook, Lessons, Journal) plus every
  cross-trade aggregate. Constitutionally banned from the pane: aggregates have no
  owner (L1), language is not geometry (L6). It projects into the pane at most as
  single-line chips.

## The frozen grammar (do not reopen)

**Six primitives — never a seventh:** Node (price-time event; MAE/MFE notches ARE
Nodes in triangular glyph — amendment TEDS-D10.b), Tick (trade-owned price level,
never full-width), Stem (1px trade body at entry bar, SL→TP), Filament (the
position's journey through time — **sole owner of trade time**), Veil
(conversational ≤8% price zone; edges owned by grammar marks; not a container, not
a text canvas, no layout, never duplicates the Filament — TEDS-D10.a), Chip (the
only text on the pane; one line; anchored to Node/Tick/Stem; **max 2 visible per
trade**).

**Seven laws:** L1 no orphan ink · L2 ownership chains (extended: Filament and
Veil are owned by their trade — TEDS-D10.c) · L3 emphasis = luminance, never
weight · L4 hue only at outcome points, areas always accent ≤8% · L5 veils are
conversational, never at idle · L6 text is chipped (reaffirmed verbatim — free
text inside veils was formally rejected) · L7 every element ships three designed
zoom forms (Completa / Estándar / Glifo), designed, not scaled.

**Key invariants:** INV-03 fixed reveal order · INV-04 selection never blocks
price · INV-07 closed history immutable · INV-08 trade geometry time-bounded ·
INV-10 degradation follows priority · **INV-11 selection cardinality one** (zero
or one selected Trade Object; multi-trade comparison is a different verb, future
RFC) · **INV-12 Conversation state never persisted**.

**Standing composites:** E7 selection = subtract + embody; E8 P/L = rider chip on
the Filament's live edge (corner HUD is dead); E9 Ghost Rails = drag conversation
with R-ladder magnetism + R:R chip; E10 lifecycle = pure Filament record,
conviction-shading legal only while selected. FP-3 is read at event grain:
**information follows the event** — never the viewport, never a panel, never free
space (TEDS-D13).

## The decision ledger you inherit

| Id | Status |
| :--- | :--- |
| TEDS-D6 | Ruled — selection composite approved **with amendment**: dock-as-overflow replaced by distributed reveal at events |
| TEDS-D7 | **PENDING** — P/L Rider as default + "modo enfoque" (numberless meter) as session toggle; should focus mode hide currency only, or R too? |
| TEDS-D8 | **PENDING** — Ghost Rails defaults: ladder steps fixed at 1R/2R/3R or configurable per playbook rule? (Alt = free placement is settled) |
| TEDS-D9 | **PENDING** — pure Filament as immutable record with selection-only conviction-shading: ratify? |
| TEDS-D10 | Ruled — grammar frozen with amendments (Veil clauses, notches=Nodes, L2 extension, INV-11/12, L6 verbatim) |
| TEDS-D11 | Ruled — Experience Domains adopted |
| TEDS-D12 | Ruled — Dock = Conversation projection |
| TEDS-D13 | Ruled — distributed progressive reveal replaces dock-overflow; **strategy itself deferred to Phase 3** |

## What remains unresolved — and why it was deferred

**The distributed progressive reveal strategy** is the single open design problem:
*how does a selected Trade Object stagger complex diagnostics while speaking only
the six primitives?* It was deliberately deferred (not forgotten) because it
depends on the full interaction-state matrix — exactly Phase 3's subject. Its four
**frozen constraints**:

1. PR-6 budget holds: ≤2 chips visible simultaneously per trade.
2. The strategy ships three designed zoom forms (L7). Note the inversion: a
   400-bar trade spreads its events comfortably; a 3-bar scalp collapses MAE/MFE/
   entry/exit into ~40px — the collision problem flips with zoom.
3. It covers both spatial facts (distributed to their events) and aspatial
   judgments (projected to the DG chip / Dock).
4. It extends the existing reveal order (FP-4 / INV-03) — never a parallel
   mechanism.

## Hard constraints

- **Never reopen frozen decisions.** TEDS-D10's amendments, L6, the six
  primitives, INV-11/12, the E7 composite, and the Experience Domains are settled.
  If you conceive something better, record it explicitly as a **future
  exploration** with its own proposed decision id — never as a silent replacement.
- Do not invent an eighth primitive, new laws, or new domains.
- Do not design DOM surfaces (Journal, Reflection Cabin, Playbook panel) — those
  belong to the repository's `DESIGN_SYSTEM.md`.
- Propose; do not implement. Phase 3 itself starts only after the owner approves
  your proposal.

## Your task — propose the architecture of Phase 3

Produce a **Phase 3 proposal** (a plan for the document, not the document), with:

1. **Scope statement.** Phase 3 = Interaction: the full state matrix (Idle ·
   Hover · Selected · Dragging · Open · Closed · Multi-panel Sync) × the three
   zoom forms, plus the progressive-reveal strategy under its four constraints.
   Take an explicit position on sequencing: is the reveal strategy the opening
   chapter of Phase 3, a prerequisite spike (Phase 2.5), or the organizing spine
   of the whole document? Justify against the gate state.
2. **Exploration inventory.** Which questions deserve the three-philosophies
   treatment (the Phase 1/2 method: three genuinely different answers, verdict,
   composition), and which are single-answer consequences of the grammar. At
   minimum address: reveal staggering under the 2-chip budget, scalp-form
   collapse, aspatial projection choreography (Dock enter/exit), drag-state
   composition (Ghost Rails × selection), multi-panel selection echo (INV-11
   across panels — one selection per workspace, how does it render on N panels?),
   and keyboard reachability (the repo's P4 principle: no pointer-only
   interactions).
3. **Decision forcing.** How the document forces the pending rulings: TEDS-D7,
   TEDS-D8, TEDS-D9 must be answerable from Phase 3's exhibits, and its own phase
   gate must list the new decisions it mints (continue the TEDS-D numbering from
   TEDS-D14).
4. **Consumption map.** Which Phase 1/2 verdicts each chapter consumes (cite E-ids
   and law ids), and which invariants constrain each state transition.
5. **Quality gates.** How each proposed state passes the six deliberate-practice
   questions and the greyscale/ink tests (FP-5, E6's measured-ink acceptance
   test).
6. **Motion boundary.** Phase 3 defines *state semantics*; Phase 4 owns motion.
   Name explicitly which transitions you will specify only as state pairs, leaving
   choreography (durations, easings, emerge-from-owner) to Phase 4 — except where
   a state is meaningless without its motion principle (e.g., veils emerge from
   their owner), which you may cite from the grammar.

End with the proposal's own open questions for the owner — the things only they
can rule before Phase 3 drafting begins.
