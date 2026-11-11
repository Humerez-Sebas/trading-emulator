# Prompt — TEDS Phase 2 Consolidation (Claude Design agent)

| Field | Value |
| :--- | :--- |
| Date | 2026-07-19 |
| Target | The Claude Design project "TEDS" (files: `TEDS Baseline.dc.html`, `TEDS Phase 1 - Conceptual Design.dc.html`, `TEDS Phase 2 - Component Design.dc.html`) |
| Purpose | Self-contained brief for the design agent that will consolidate Phase 2 after the 2026-07-19 phase-gate rulings |
| Normative sources | `docs/architecture/TEDS_GRAMMAR.md`, `docs/architecture/EXPERIENCE_DOMAINS.md` (this repo) |

Copy everything below the line into the Claude Design session.

---

You are the design director for **TEDS — the Trade Experience Design System** of a
personal-use professional trading emulator (candle-by-candle market replay for
deliberate practice; Angular SPA; the trader is the only user). You are continuing
work on an existing Claude Design project that contains three documents: **TEDS
Baseline** (the current UI, kept as the "before" reference), **Phase 1 — Conceptual
Design** (rev 18-jul-2026), and **Phase 2 — Component Design** (rev 19-jul-2026).
Assume no other context: everything you need is in this brief plus those documents.

## Context — what TEDS is

TEDS defines the visual language in which trades speak on a chart pane. Its central
move: the Trade Box (filled TP/SL rectangles painted over candles) dies; the **Trade
Object is a sentence** — ~30px of hairline at idle that conjugates with interaction.
Everything trade-related is built from **six primitives** (Node, Tick, Stem,
Filament, Veil, Chip) and **seven laws** (L1 no orphan ink · L2 ownership chains ·
L3 emphasis = luminance, never weight · L4 hue only at outcomes · L5 veils are
conversational · L6 text is chipped · L7 every element ships three zoom forms).
Phase 1 fixed seven first principles (FP-1..7), ten invariants (INV-01..10), the
five priority tiers (P1/P2/P3/DG/H), and six exploration verdicts (E1–E6); Phase 2
fixed the grammar and four more explorations (E7–E10) plus a phase gate (previously
labeled D6–D10). The product is training-first: monochrome restraint, silence by
default, anti-MetaTrader by explicit audit (AG-01..12).

Since Phase 2's last revision, an owner-led design review (2026-07-18/19)
interrogated the "Selected Trade" interaction (the Veil-expansion proposal and the
side-dock diagnostics), ran a repository-wide consistency audit, and consolidated
the results into the repository as the **normative record**. The repository now
outranks the design renders: on conflict, `TEDS_GRAMMAR.md` wins. Repository
documents updated: `TEDS_GRAMMAR.md` (new — the normative grammar with all
amendments), `EXPERIENCE_DOMAINS.md` (new — domain taxonomy), RFC-017 §6 and its
visual spec (superseded with registered notes), `UBIQUITOUS_LANGUAGE.md` §7.1 (TEDS
vocabulary + naming collisions resolved), `DESIGN_SYSTEM.md` §4.7 (token
registration hold), `TRADER_KNOWLEDGE_MODEL.md` §9 (domain-taxonomy bridge),
`CLAUDE.md` (context routing).

## Problems the review solved (so you don't re-litigate them)

1. **The Veil-as-container trap.** A proposal to let the selected trade "unfold" a
   Veil across its duration with diagnostic text inscribed inside was rejected: it
   duplicates the Filament (the sole owner of trade time), turns a primitive into a
   UI component (padding/wrapping/overflow), and resurrects the Trade Box at 8%
   alpha. The Veil keeps its strict definition — a conversational **price zone**
   whose edges are owned by grammar marks, with no layout and no text.
2. **Law 6 stands unamended.** No naked text on the pane, ever.
3. **The dock ambiguity.** The dock is no longer "the overflow home" for
   diagnostics. Spatial diagnostics render **at their events**; the dock is a
   projection surface for aspatial judgments only, alive only during the selection
   conversation.
4. **The 400-bar question dissolved.** The Veil never spans the trade's duration
   (the Filament does), so there is no giant veil to manage; residual density
   behavior is L7's job (three designed zoom forms).
5. **A missing architectural tier was named.** Market → Trade → **Conversation** →
   Knowledge: the Conversation is all ephemeral interaction state (hover,
   selection, veils, DG reveals, drag previews) — derived, never persisted, never
   editorializing. Founding principle: *The Chart shows what happened. The
   Conversation reveals what matters now. Knowledge preserves what it meant.*

## Approved decisions you must incorporate (the official ledger)

Decisions now use the **`TEDS-D#` namespace** (the bare D6–D10 labels collided with
the repository's engineering decision registry — rename them in the document):

- **TEDS-D6 — ruled, approved with amendment.** Selection composite (subtract +
  embody) approved; the "dock as DG overflow home" clause is **replaced** by
  distributed reveal (below).
- **TEDS-D7 — still pending** (P/L Rider default + "modo enfoque" scope). Keep it
  open in the gate.
- **TEDS-D8 — still pending** (Ghost Rails R-ladder defaults). Keep it open.
- **TEDS-D9 — still pending** (pure Filament + selection-only shading). Keep it
  open.
- **TEDS-D10 — ruled: grammar frozen with amendments:**
  a. **PR-5 Veil strict clauses:** contextual surface; edges owned by grammar
     marks, never sized by content; not a panel/container/inspector/text canvas;
     communicates only through extent and alpha; never duplicates the Filament;
     no layout ("the chart is the layout"); exists in data-space, viewport clips
     the render, never re-anchors to viewport edges; emerges from its owner (the
     Stem) and dissolves back toward it.
  b. **MAE/MFE notches are Nodes** (PR-1) in a triangular glyph variant — making
     them legal Chip anchors under PR-6.
  c. **L2 extended:** Filaments and Veils are explicitly owned by their trade
     (Filament anchors to the trade's Nodes; Veil edges anchor to
     Ticks/Nodes/Stem).
  d. **Two new invariants:** INV-11 (selection cardinality one — exactly zero or
     one selected Trade Object; multi-trade comparison is a different verb,
     future RFC) and INV-12 (Conversation state is never persisted).
  e. **L6 reaffirmed verbatim.**
- **TEDS-D11 — ruled.** Experience-domain taxonomy adopted
  (Market/Trade/Conversation/Knowledge), subordinate to the trader-knowledge
  doctrine (the system observes and conserves; the trader interprets; meaning
  lives exclusively in trader-authored content).
- **TEDS-D12 — ruled.** The Dock is a **projection of the Conversation domain**:
  renders aspatial judgments (plan-adherence check, exit efficiency) while a trade
  is selected; never stores knowledge; never replaces the Journal; never the
  destination of the conversation. (Note: "dock" must not be confused with the
  app's *workspaces dock* — qualify the term.)
- **TEDS-D13 — ruled.** **Distributed progressive reveal** replaces dock-overflow:
  spatial diagnostics render at their events (MAE chip at the MAE Node, MFE at
  its Node, duration as the Filament's own extent, entry/exit on their Nodes);
  FP-3 is refined to event grain ("information follows the **event** — never the
  viewport, never a panel, never free space"). The *full* reveal strategy (how a
  selected trade staggers many diagnostics) is **deliberately deferred to Phase 3**
  under four frozen constraints: (1) ≤2 chips visible per trade (PR-6); (2) the
  strategy ships three designed zoom forms (L7) — a 3-bar scalp inverts the
  collision problem of a 400-bar trade; (3) it covers spatial facts AND aspatial
  judgments; (4) it extends the existing reveal order (FP-4/INV-03), never a
  parallel mechanism.

## Superseded repository direction (so you don't inherit it)

A previous repo exploration ("RFC-017 §6 / trade-visualization concepts",
2026-07-16) selected a different visual direction that is now **superseded**: idle
risk/reward zone rectangles, a docked corner HUD chip for position P/L, an
outcome-colored dashed trade path, triangle/diamond markers, and an entry
price-axis label. None of these may appear in TEDS. What survives from it:
span-scoped geometry (= INV-08), retirement of full-width price lines, MAE/MFE as
first-class facts. Also, "Ghost Rails" now names **only** the TEDS E9 drag
conversation.

## Current state of Phase 2

**Valid and unchanged:** the six primitives' core roles; laws L1, L3, L4, L5, L7;
L6 verbatim; the anatomy states IDLE and HOVER; the three zoom forms; the E8/E9/E10
triads and verdicts (as recommendations pending TEDS-D7/D8/D9); the extensibility
proofs (Break Even, Trailing, Scale In/Out, Order Preview, Replay Ghosts,
Multi-panel); the quality-gates table; the not-MetaTrader audit.

**Amended:** PR-1 (notches are Nodes), PR-5 (strict clauses), L2 (ownership of
Filament/Veil), E7 verdict (dock clause replaced by distributed reveal), the
SELECTED anatomy state (the diagnostics chip "in the empty quadrant" and the E4
"anchored card in the empty quadrant" inheritance are superseded — diagnostics
anchor to their events), the phase-gate ids (D6–D10 → TEDS-D6..D10) and their
statuses (D6/D10 ruled, D7/D8/D9 pending).

**New to represent:** INV-11, INV-12, the Conversation domain and the founding
principle, the Dock as projection, the four frozen constraints of the deferred
Phase 3 reveal strategy.

## Your task — consolidate Phase 2

Update **`TEDS Phase 2 - Component Design.dc.html`** (and its standalone copy if
kept in sync) so it exactly reflects the ruled state. Concretely:

1. Rev the header (date + a "consolidated post phase-gate 2026-07-19" note, with a
   pointer that the normative record lives in the repository:
   `docs/architecture/TEDS_GRAMMAR.md`).
2. Update PR-1, PR-5, and L2 card copy per the amendments; keep the copy as tight
   as the existing cards (these are exhibit cards, not essays).
3. Update the SELECTED anatomy vignette and card: world dims to 18%, halo +
   handles, filament + MAE/MFE Nodes with their chips at the events, DG/aspatial
   content noted as Dock projection — remove the "empty quadrant" framing.
4. Update the E7 exhibit verdict text (composite stands; dock-overflow clause
   replaced by distributed reveal at events; M3's dock survives only as the
   Conversation projection for aspatial judgments).
5. Add the two invariants where Phase 2 surfaces invariants (INV-11 selection
   cardinality; INV-12 conversation never persisted) and a compact statement of
   the domain principle (Chart shows / Conversation reveals / Knowledge
   preserves) — one exhibit, not a new chapter.
6. Rename the phase-gate ids to TEDS-D6..TEDS-D10 and mark their statuses: TEDS-D6
   approved-with-amendment, TEDS-D10 ruled (list the five amendment letters),
   TEDS-D7/D8/D9 pending. Add TEDS-D11/D12/D13 as ruled entries with one-line
   summaries.
7. Sweep every vignette for contradictions with the amendments (e.g. any
   diagnostics text floating in free space, any veil spanning trade duration, any
   corner-HUD remnant). The "sel-room" (side dock) exploration card stays — it is
   history — but its verdict framing must say "rejected as default; dock =
   Conversation projection".
8. Do **not** invent new behavior, new primitives, new laws, or the Phase 3 reveal
   strategy — that exploration is deliberately deferred. Consolidate only.
9. Keep Phase 1 and Baseline untouched except, if you deem it cheap, a one-line
   pointer in Phase 1's header noting that verdict E4's empty-quadrant clause was
   amended by TEDS-D13 (Phase 2 §gate).

Quality bar: every change must be expressible in the six primitives and seven laws;
every ruled decision must be traceable to its TEDS-D id; the document must remain
self-consistent for a reader who has never seen the repository.

## After consolidating — propose the roadmap (do not implement it)

When Phase 2 is consolidated, end your response with a **roadmap proposal** for the
next Claude Design document. Do not start it — propose and justify:

- **What the next phase should be.** The standing sequence is Phase 3 —
  Interaction (full state matrix: Idle · Hover · Selected · Dragging · Open ·
  Closed · Multi-panel Sync, plus zoom rules). Evaluate whether Phase 3 should
  proceed as planned, or whether the deferred **distributed progressive reveal
  exploration** (with its four frozen constraints) must be resolved first as a
  Phase 2.5 — or whether they are the same document. Take a position.
- **Why** — grounded in the gate state (TEDS-D7/D8/D9 pending block parts of the
  state matrix; TEDS-D13's deferred strategy is Phase 3 scope by definition).
- **What problems it resolves** — name them concretely (the scalp-collision
  inversion, aspatial projection choreography, reveal staggering under the 2-chip
  budget, the pending gate rulings it would force).
- **How it connects to the previous phases** — which Phase 1/2 verdicts it
  consumes, which invariants constrain it, and what its own phase gate should ask
  the owner to rule.
