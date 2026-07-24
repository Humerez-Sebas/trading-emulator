# TEDS Phase 3 — Interaction · RULED

| Field | Value |
| :--- | :--- |
| Status | Exploration artifact (archived design render) — NON-normative |
| Phase | TEDS Phase 3 — Interaction |
| Source | Claude Design project "TEDS", standalone export (archived 2026-07-22) |
| Authority | Subordinate to `docs/architecture/TEDS_GRAMMAR.md` + `EXPERIENCE_DOMAINS.md`; on conflict the repo normative record wins |

> **Archivist's note.** This is a faithful English transcription of the Phase 3 design-exploration
> render ("TEDS · Trade Experience Design System · Phase 3 — Interaction · FINAL · RULED",
> rev. 20 jul 2026). Exhibit graphics were SVG in the original; their captions are preserved as
> text. Data tables were reconstructed verbatim from the render's data arrays. Spanish UI terms
> (e.g. *modo enfoque*) are left untranslated because they are product vocabulary.

---

## Overview

The full interaction contract of the Trade Object: seven states × three zoom forms, every legal
transition as a state pair, and the distributed progressive-reveal strategy composed from the
state ledgers. Drafted under the owner's rulings Q1–Q8; this document closes **D7, D8, D9** and
mints **D14–D20**. Phase 4 (Motion) begins at §10's handoff line.

Phase progress at time of authoring:

1. Conceptual ✓
2. Components ✓
3. Interaction ✓ *(this document)*
4. Motion — next
5. Tokens
6. Implementation

Chapter map: `00 Rulings · 01 Matrix · 02 Resting · 03 Hover · 04 Selected · 05 Dragging ·
06 Scalp · 07 Multi-panel · 08 Keyboard · 09 Reveal strategy · 10 Gate & handoff`

---

## 00 · The rulings that unlocked drafting

### Q1–Q8, as ruled by the owner — 19 jul 2026

Recorded verbatim in substance; each ruling names the chapter it shapes. These are premises of
this document, not subjects of it.

| ID | Ruling | Consequence |
| :-- | :--- | :--- |
| **Q1** | Spine ratified: the reveal ledger organizes the document, and the reveal deploys from the entry Stem outward along the Filament in time order. | Shapes §09; every chapter closes a ledger. |
| **Q2** | INV-11 is global: one selected trade per workspace; selecting in any panel — including secondary — assumes the single global focus. | Shapes §07 / D18. |
| **Q3** | Keyboard = read reachability only: navigate and reveal, never move levels or drag. | Shapes §08 / D19; audit bar is reachability, not parity. |
| **Q4** | Modo enfoque is a workspace-level session toggle that hides exact P/L digits (currency and R) and simplifies renders screen-wide. | Shapes §02 / D7; enfoque is a render modifier, not an eighth matrix column. |
| **Q5** | The scalp floor is one bar, and collapse must adapt across timeframes (a 15-min trade unfolds on M1, collapses cleanly on M15). | Shapes §06 / D15; forces pixel-threshold collapse. |
| **Q6** | Ink ceilings: design first, judge at final visual review. | §10 proposes numbers; ratification deferred to review. |
| **Q7** | Replay ghosts deferred to a future phase; Phase 3 concerns the active trade only. | Removes ghost cells from the matrix. |
| **Q8** | Multi-trade comparison is 100% out of scope — post-session analysis belongs to the Reflection Cabin. | INV-11 discipline holds; no teaser exhibits. |

---

## 01 · Method & the matrix contract

**Twenty-one designed cells.** Each cell is a designed answer, not a scaled one (L7). The matrix
is the canonical contract: Phase 4 animates its transitions, Phase 6 implements its states, and
nothing renders on the pane that is not a cell of this table or a transition between two.
Chapters 02–08 argue the cells; §09 composes their reveal ledgers; §10 ratifies the whole as
**TEDS-D20**.

The three zoom forms are **Completa ≥12 px/bar**, **Estándar 4–12 px**, and **Glifo <4 px**.

### The 21-cell state matrix

| State | Ch. | Completa ≥12 px/bar | Estándar 4–12 px | Glifo <4 px |
| :-- | :-- | :--- | :--- | :--- |
| **Idle** | C2 | P1 anatomy verbatim: entry Node, SL/TP Ticks, 1px Stem, Filament at 55%. No chips, no veils, nothing moves. *(E1·M2 · L5 · INV-05)* | Same marks; MAE/MFE notches withheld; Filament simplifies to its event polyline. *(L7 · INV-10)* | Constant-px glyph: outcome-hued Node + direction stub. Nothing else. *(E6·M3)* |
| **Hover** | C3 | P2 on loan: risk veil ≤8% between Ticks, level chips (entry · SL · TP in R). Dissolves without residue. *(D10.a · L5 · INV-12)* | One merged level chip — risk first per priority; veil holds; notches stay withheld. *(INV-10)* | Glyph lifts to 100%; one chip: id + outcome R. No veil — sub-4px cannot host an honest zone. *(E5·M3)* |
| **Selected** | C4 | E7 composite: world→18%, halo + handles, DG chip in seat A; seat B walks the events (D14). *(E7 · INV-03 · INV-04)* | Embodiment holds; notches (Nodes) appear; chips flip to the empty side; conviction-shading legal (D9). *(D10.b · PR-6)* | Selection decomposes the composite Node as a vertical unstack along the Stem (D15). Max 2 chips. *(D15 · L7)* |
| **Dragging** | C5 | Ghost rail + 1R/2R/3R ladder + R:R chip; all other chips retire; veil tracks the preview zone. *(E9 · D17 · INV-08)* | Rungs compress to labelled ticks; magnetism radius grows as px-per-R shrinks. *(PR-5)* | Not offered. Sub-4px cannot host honest price precision — zoom is the affordance. *(INV-10)* |
| **Open (live)** | C2 | P/L Rider on the Filament live edge: R primary, currency secondary at 55%. Enfoque: numberless meter (D7). *(E8·M1 · D7)* | Rider compresses to R only; under enfoque the meter alone travels the SL→TP span. *(D7)* | Live edge = hollow Node; rider is the meter by necessity — digits never render at this size. *(INV-10)* |
| **Closed** | C2 | Pure Filament record: hue at exit Node only; pixel-identical forever. No rider, no residue. *(E10·M1 · INV-07)* | Chaptered polyline: entry → MAE → MFE → exit. Identical on every visit. *(D9)* | Single outcome-hued glyph at fixed luminance — magnitude never encoded in ink; the record does not editorialize. *(L3 · L4)* |
| **Multi-panel** | C7 | Origin panel: full composite. Witness panels: luminance halo only — no dimming, no chips. *(D18 · FP-5)* | Witness halo at the panel's own form; the trade lifts, the world stays lit. *(D18)* | Witness = glyph lifted to 100%. Nothing else. *(D18 · INV-11)* |

---

## 02 · Resting states — Idle · Open · Closed

**The pane at rest, and the two rulings it settles.** Idle is transcription. P1 anatomy verbatim
from E1·M2: entry Node, SL/TP Ticks, 1px Stem, Filament at 55% luminance — zero chips, zero
veils, nothing moving (INV-05, L5). The two live questions of rest are the Open trade's voice
(D7) and the Closed record's silence (D9). Both are answered below from exhibits.

> **EXHIBIT A — The same open trade three ways.** Left: rider default — R primary, currency
> secondary at 55%. Center: modo enfoque — the rider becomes a numberless meter, a dot travelling
> the SL→TP span; geometry keeps speaking, digits go silent. Right: at close the record seals and
> digits return — enfoque governs live anxiety, never the record.
>
> *(Panels rendered in the original: "RIDER · DEFAULT" showing `+1.4R · $212`; "MODO ENFOQUE ·
> METER" showing a numberless SL→TP meter with a travelling dot and the note "sin dígitos"; "AL
> CIERRE · REGISTRO" showing `+1.8R` with the note "los dígitos vuelven — el registro nunca se
> oculta".)*

### TEDS-D7 · RULED — *consumes E8·M1 · Q4*

P/L Rider is the default voice of an open trade: R primary, currency secondary. Modo enfoque — a
workspace-level session toggle (Q4) — hides both currency and R: the rider degrades to the meter,
veils and diagnostics require an explicit ask, and digits return only at close.

**Basis:** the anxiety being managed is live magnitude, not structure. The meter keeps the trade
honest (position within its own risk) while refusing the number that hijacks attention. The
closed record is Trade domain — it never editorializes and never hides (INV-07).

### TEDS-D9 · RULED — RATIFIED — *consumes E10·M1 · INV-07 · INV-12*

The closed trade is the pure Filament record: outcome hue at the exit Node only, pixel-identical
on every future visit. Conviction-shading is Conversation, not record — legal only while
Selected, reverting on deselect, never persisted.

Exhibit E (§04) shows the record across two visits and the shading appearing only inside
selection. Interpretation stays in the Journal; the ink stays mute.

---

## 03 · Hover — the approach

**P2 on loan, dissolved without residue.** Hover opens the second tier temporarily: the risk veil
(≤8% accent between SL and TP, edges owned by the Ticks — D10.a) and level chips. Everything it
shows is recomputable and everything dissolves on exit (L5, INV-12). Hover never dims the world —
that is selection's subtraction, not hover's.

### Hover across the three forms

| Form | Title | Behaviour |
| :-- | :-- | :--- |
| **Completa ≥12 px/bar** | The full whisper | Veil spans SL→TP at ≤8% accent; three level chips offered but never more than two rendered (PR-6): risk pair first, entry on ask. |
| **Estándar 4–12 px** | One merged chip | Levels merge into a single chip (SL · TP in R). The veil holds; notches stay withheld until selection. |
| **Glifo <4 px** | Lift + identify | The glyph lifts to full luminance and speaks one chip: id + outcome R. No veil, no levels — hover at Glifo answers "which trade is this?", nothing more. |

**Precedence.** Hovering trade B while trade A is selected: B speaks at P2 over its dimmed 18%
tier — a whisper inside a quieted room — and A keeps its DG monopoly and both chip seats.
Precedence falls out of INV-03; no new rule is needed. Keyboard has no hover state: keys go
straight to selection (§08).

---

## 04 · Selected — subtract · embody · project

**The world goes quiet and the trade steps forward.** E7 verbatim: others drop to 18%, the object
gains halo and handles, the DG chip opens per INV-03 — never a panel, never covering candles
(INV-04). What Phase 3 adds is the third act: *project* — the aspatial judgments of the selection
appearing in the Dock, and conviction-shading as the one selection-only render (D9).

> **EXHIBIT E — Left, center:** the closed record on two separate visits — pixel-identical
> (INV-07 made visible). **Right:** the same trade Selected — conviction-shading breathes along
> the Filament only inside the selection; deselect reverts it without residue (INV-12).
>
> *(Panels: "CERRADO · VISITA 1", "CERRADO · VISITA 2 — IDÉNTICO", "SELECCIONADO · SOMBREADO"
> with the note "solo dentro de la selección · revierte al salir".)*

### TEDS-D16 · MINTED — *Dock choreography · consumes D12 · E13 verdict: Echo, amended*

The Dock is a fixed slot, not a moving panel: selection fills it instantly, deselection empties
it, and it holds nothing between selections. No summons verb, no residue.

Echo won because the projection must cost zero verbs (keyboard users get it free, Q3); Residue
died as storage-by-stealth (the exact thing D12 forbids); Summons died for taxing the commonest
aspatial read. The amendment answers Echo's own tension: because the slot is spatially fixed and
always allocated, filling it moves no layout — the pane never shifts under a click.

---

## 05 · Dragging — the rails conversation

**A deepening of selection, with a narrowed voice.**

> **EXHIBIT B — One TP drag, two ladders.** Left: the fixed 1R/2R/3R ladder, equal luminance,
> ghost rail snapping to rungs. Right: the same drag with a playbook rule active — the rungs keep
> their geometry, the required rung brightens to 90% and carries the one-line rule chip; the
> others recede. Same gesture, same grammar; Knowledge arrives as emphasis, never as new geometry.
>
> *(Panels: "ESCALERA FIJA 1R/2R/3R" with an R:R chip `1 : 2.3`; "PLAYBOOK ACTIVO" with the
> brightened 2R rung and the rule chip `TP ≥ 2R`; note "la regla ilumina su peldaño — énfasis, no
> geometría".)*

### TEDS-D8 · RULED — *consumes E9 · L3 · D11*

The ladder is fixed at 1R/2R/3R; the playbook brightens. When the active setup carries a rule
(e.g. TP ≥ 2R), its rung takes the luminance emphasis and the single-line rule chip; base rungs
recede to 25%. Alt = free placement ships regardless.

The rung is arithmetic of the trade's own risk — Trade domain. The playbook only chooses which
multiple gets the light: Knowledge projecting as emphasis (L3), never authoring geometry (L6 kept
intact).

### TEDS-D17 · MINTED — *drag × selection · E14 verdict: Deepening, narrowed*

Drag is reachable only from Selected — handles are selection affordances (E7). While dragging, the
trade's other chips retire: rail, ladder and the R:R chip hold both seats. Release commits and
returns to Selected; Esc cancels as if nothing happened.

Direct-verb died against E7's affordance chain; pure Suspension over-muted the object being
edited. Deepening keeps one state chain; the narrowed voice honors the 2-chip budget mid-gesture.
Drag is not offered at Glifo (INV-10) — zoom is the affordance.

---

## 06 · Density — the scalp collapse

**Merge at rest, unstack on ask — down to one bar.**

> **EXHIBIT C — The same 15-minute trade across timeframes.** Left: on M1 it owns fifteen bars —
> events self-space, the reveal walks. Center: on M15 it is one bar — entry, MAE, MFE and exit
> fuse into a composite event Node on the Stem; selecting unstacks them vertically along the price
> axis, which a scalp always has in abundance. Right: at Glifo the whole trade is one
> outcome-hued glyph at fixed luminance.

### TEDS-D15 · MINTED — *scalp form · consumes E12 · D10.b · E5·M3 · Q5*

Collapse is threshold-driven in pixels, not bars: when a trade's event span falls below 24px, its
event Nodes merge into one composite Node (a Node merge per E5·M3 — the sixth primitive folding,
not a seventh). Selection decomposes the composite as a vertical unstack along the Stem. At Glifo
no decomposition is offered; the record survives as a single glyph. Pixel thresholds make
timeframe adaptation automatic (Q5): the same trade crosses M1→M15 and meets the same rule. Floor:
the form is designed for a 1-bar trade — Stem + composite Node + one chip seat.

Priority-duel died for hiding facts of the record behind curation (INV-07's completeness read);
pure vertical-unstack at rest died for relocating event marks off their bars at idle (FP-2). The
composite keeps position truth at rest and honesty on demand.

---

## 07 · Multi-panel echo

**One selection, one loud panel, quiet witnesses.**

> **EXHIBIT D — Left:** the origin panel (M5) carries the full composite — world at 18%, halo,
> handles, chips. **Right:** the witness panel (M15) shows the same trade with a luminance halo
> only — no dimming, no chips; its candles stay fully readable. The selection is visible
> everywhere, loud in exactly one place.

### TEDS-D18 · MINTED — *echo policy · consumes E15 verdict: Origin + witness · Q2*

INV-11 is global (Q2): one selected Trade Object per workspace, and selecting in any panel —
including a secondary one — assumes the single global focus, demoting the previous origin to
witness. Full subtraction + embodiment renders only on the gesture panel; every other panel
showing the trade renders the witness halo at its own zoom form.

Full-echo died by proxy-violation of FP-5 — a selection would dim a panel you are reading for
something else; origin-only died for making the workspace's one selection invisible where it also
exists. The witness is the minimum ink that keeps INV-11 honest.

---

## 08 · Keyboard reach — read-only by ruling

**Every information state has a key path; no key moves a level.** Q3 sets the bar at read
reachability: the keyboard navigates and reveals, never drags. There is no keyboard-hover — keys
go straight to selection, and the reveal ladder answers the same ↑/↓ verb that §09 defines.
Dragging remains pointer-only by ruling, recorded here so P4 audits against reachability, not
parity.

| Key | Action |
| :-- | :--- |
| **Tab / Shift-Tab** | Cycle the roster of visible trades in time order on the active panel; the candidate lifts (witness-style halo) without selecting. |
| **Enter** | Embody the candidate — full E7 selection, global per INV-11/Q2. |
| **Esc** | Subtract: deselect in one step; from a drag, cancel as if nothing happened. |
| **↑ / ↓** | Walk the reveal ladder (the Ask verb): ↓ advances a tier in INV-03 order, ↑ retires one. |
| **← / →** | Walk the selected trade's events (the Walk verb): seat B's chip moves entry → MAE → MFE → exit, read-only. |
| **— (absent by ruling)** | No level-nudge, no keyboard drag, no keyboard hover. Q3 sets the bar at read reachability; editing geometry stays pointer-only pending a future RFC. |

### TEDS-D19 · MINTED — *keyboard model · consumes E16 verdict: Roster + ladder · Q3*

Tab cycles the roster of visible trades in time order; Enter embodies; Esc subtracts; ↑/↓ walk
the reveal ladder; ←/→ walk the selected trade's events (moving chip seat B). No level-nudge keys
exist — editing risk geometry is a pointer verb until a future RFC says otherwise.

---

## 09 · The reveal strategy — synthesis of the seven ledgers

**The sentence reads from its subject.** Per Q1 the reveal deploys from the entry Stem — the
trade's subject — outward along the Filament in time order. Selection opens tier 1; every deeper
tier is an explicit step; and within the active tier, the second chip seat follows the trader
along the events. Three moves, one mechanism:

| # | Move | Description |
| :-- | :-- | :--- |
| **ACT 1** | Selection opens tier 1 | Position + risk geometry render at once (P1+P2); seat A takes the DG chip. No further tier opens by itself — depth is never ambient. |
| **ACT 2** | Ask for depth | Each deeper tier — excursions, then diagnostics — advances on an explicit step: scroll-step or ↑/↓ while selected. Same verb on pointer and keys; INV-03 order, staggered, never reordered. |
| **ACT 3** | Walk for breadth | Within the active tier, seat B materializes at the event nearest the cursor (or ←/→) and travels with it — information follows the event (FP-3), and the farthest chip retires first. |

### TEDS-D14 · MINTED — *staggering mechanism · consumes E11 · FC-1..4 · D13 · Q1 · Q3*

Staggering = Ask for depth, Walk for breadth, within the fixed 2-seat budget. Seat A holds the
aspatial voice (DG / R:R / rule chip); seat B holds the nearest event's chip and travels with
cursor or ←/→. Tiers advance only on the explicit step verb (scroll-step / ↑↓ while selected),
always in INV-03 order — staggered, never reordered, never forked (FC-4). Dwell is rejected: time
as an invisible input re-imports the indeterminism that killed E3·M3.

**Retirement rule:** a chip yields its seat the moment a deeper or nearer claimant arrives — the
oldest voice goes quiet first. Under modo enfoque, tier advancement still works; only digits are
withheld (D7).

### The seven state ledgers, composed

| State | Reveals | Rejects | Defers |
| :-- | :--- | :--- | :--- |
| **Idle** | P1 marks only, 55% luminance. | Chips, veils, motion, notches. | Everything — to hover and selection. |
| **Hover** | P2 veil + level chips (≤2). | World-dimming, notches, diagnostics, residue. | Excursions and DG → selection. |
| **Selected** | P1+P2 held; notches; DG in seat A; seat B walks events. | A third chip; aggregates (L1); free text (L6); panels. | Aspatial judgments → Dock slot (D16); deeper tiers → the step verb. |
| **Dragging** | Ghost rail, ladder, R:R chip. | All other chips — the trade's own voice narrows (D17). | DG and excursions → release (back to Selected). |
| **Open (live)** | Rider at the live edge (R + currency, or meter under enfoque). | Digits under enfoque; any second permanent chip. | Diagnostics → selection; magnitude → close. |
| **Closed** | The pure record; hue at exit only. | Riders, shading at rest, any re-rendering across visits (INV-07). | Interpretation → Journal (Knowledge); shading → selection. |
| **Multi-panel** | Witness halo wherever the trade is visible. | Dimming or chips off the origin panel. | The full conversation → the origin panel; comparison → Reflection Cabin (Q8). |

---

## 10 · Audit · phase gate · the Phase 4 handoff

**The gate closes ruled; motion begins at the line below.**

### The six questions, per state

Every state passes all six or is cut — the notes record the question each state passes least
trivially. Ink ceilings per Q6 are **proposed, not pre-set**:

> **Proposed ink ceilings (Q6, ratify at visual review):** idle ≤3% · hover ≤5% · selected ≤8% ·
> dragging ≤8% of non-candle lit pixels per form (E6·M2 metric); you ratify the measured numbers
> at final visual review. Greyscale strips (FP-5) accompany every exhibit at review — candles
> brightest in all 21 cells.

| State | Verdict | Note (question passed least trivially) |
| :-- | :-- | :--- |
| **Idle** | 6/6 | "¿necesita ser visible?" — passes by refusal: 30px of hairline is the entire footprint; everything else is deferred. |
| **Hover** | 6/6 | "¿aparece con contexto?" — the veil exists only while the cursor asks, and its edges are owned by the trade's own Ticks. |
| **Selected** | 6/6 | "¿protege el gráfico?" — subtraction before addition: the world quiets 18%, candles stay brightest, chips flip away from price (INV-04). |
| **Dragging** | 6/6 | "¿enseña algo?" — the ladder converts a gesture into R-arithmetic; the playbook rung teaches the rule at the moment of temptation. |
| **Open (live)** | 6/6 | "¿reduce carga cognitiva?" — enfoque is this question made into a toggle: structure without magnitude (D7). |
| **Closed** | 6/6 | "¿sigue al trade?" — the record is bounded to its bars (INV-08) and never re-renders; nothing follows the viewport. |
| **Multi-panel** | 6/6 | "¿protege el gráfico?" — witnesses lift one object without dimming a panel being read for something else (FP-5 by proxy). |

### Decision ledger at the gate

D6, D10–D13 remain as ruled in prior phases. This document closes the three pending rulings and
mints seven:

| ID | Status | Summary |
| :-- | :-- | :--- |
| **D7** | RULED | Rider default (R primary, currency secondary); enfoque hides both — meter only, live-only, workspace toggle. §02. |
| **D8** | RULED | Fixed 1R/2R/3R ladder; the active playbook rule brightens its rung. Alt = free placement. §05. |
| **D9** | RULED | Ratified: pure Filament immutable record; conviction-shading selection-only, never persisted. §02 · §04. |
| **D14** | MINTED | Reveal staggering: Ask for depth, Walk for breadth, 2 fixed seats, INV-03 order. Dwell rejected. §09. |
| **D15** | MINTED | Scalp collapse: px-threshold Node merge at rest, vertical unstack on selection, 1-bar floor. §06. |
| **D16** | MINTED | Dock = fixed slot echo: fills on selection, empties on deselect, holds nothing. §04. |
| **D17** | MINTED | Drag = deepening of selection with narrowed voice; Esc cancels; not offered at Glifo. §05. |
| **D18** | MINTED | Echo policy: origin + witness; INV-11 global per Q2; witnesses never dim. §07. |
| **D19** | MINTED | Keyboard: roster + ladder, read-only per Q3; no keyboard hover; no level editing. §08. |
| **D20** | MINTED | The 21-cell matrix ratified as the canonical contract for Phases 4 and 6. §01 · §10. |

### Motion boundary — the handoff line

**PHASE 3 OWNS — SEMANTICS.** What exists in each state, in which reveal order, at which form;
which transitions are legal; what each transition must have true before and after. The pairs
below are that contract — complete and closed.

**PHASE 4 OWNS — CHOREOGRAPHY.** Durations, easings, ordering within a transition (does the world
dim before the halo lands?), the form-swap crossfade, and the meter's live cadence — all under
INV-05: ≤240ms, confirming state change only, and nothing moving at idle.

#### Handed to Phase 4 as state pairs only

| State pair | What must be true (fixed by Phase 3) |
| :-- | :--- |
| idle → hover | P2 enters on loan: veil + level chips; nothing else moves. |
| hover → idle | Full dissolve, zero residue (L5, INV-12). |
| hover → selected | Subtract world (→18%), embody (halo + handles), DG fills seat A per INV-03. |
| selected → idle | One-step reversal; the world returns, the object sheds its body, the Dock slot empties (D16). |
| selected → dragging | Other chips retire; rail + ladder + R:R materialize (D17); bounded to the trade (INV-08). |
| dragging → selected | Commit: the Tick moves, rail dissolves. Cancel (Esc): as if nothing happened. |
| open → closed | Live edge seals into the exit Node; rider retires; digits return if enfoque hid them (D7); record enters INV-07. |
| form ⇄ form (zoom) | Designed swap at px thresholds, including composite merge/unmerge (D15); the crossfade is Phase 4's. |
| selection ⇄ panel echo | Origin embodies, witnesses halo (D18); re-selection in another panel demotes the old origin to witness. |
| dock fill / empty | Slot fills on selection, empties on deselect (D16); content recomputable (INV-12). |
| enfoque on / off | Session boundary, workspace-wide (Q4); hides live digits both ways (D7); geometry untouched. |

#### Motion principles already owned by the grammar

| Principle | Note |
| :-- | :--- |
| Veils emerge from their owner | And dissolve into it (L5 · D10.a). A veil from nowhere is orphan ink in time — grammar, not choreography. |
| Chips flip to the empty side | Placement logic, not motion: a chip yields to candles before it overlaps them (INV-04 · PR-6). |
| Ladder magnetism | Snap-to-R is gesture physics from E9 — part of drag semantics, not an animation. |
| INV-05 stays the ceiling | ≤240ms, confirms state change only, and nothing — nothing — moves at idle. Phase 4 works under it, never around it. |

---

*END OF PHASE 3 · MATRIX RATIFIED AS TEDS-D20 · PHASE 4 (MOTION) MAY BEGIN*
