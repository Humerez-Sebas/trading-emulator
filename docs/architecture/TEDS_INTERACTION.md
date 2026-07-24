# TEDS Interaction — The Trade Object State Matrix & Reveal Strategy

| Field | Value |
| :--- | :--- |
| Status | Foundational (normative, living document) |
| Date | 2026-07-22 (consolidates Claude Design "TEDS Phase 3 — Interaction · RULED"; owner rulings Q1–Q8 of 2026-07-19) |
| Authority | Normative source for the **interaction contract** of the Trade Object: what exists in each state, in which reveal order, at which zoom form, and which transitions are legal. Sits below `TRADER_KNOWLEDGE_MODEL.md` and `EXPERIENCE_DOMAINS.md`; **beside `TEDS_GRAMMAR.md`** — the grammar governs *how marks draw* (six primitives, seven laws), this doc governs *how they behave under interaction*. On any grammar conflict, `TEDS_GRAMMAR.md` wins |
| Motion | This document defines **state semantics only**. Choreography (durations, easings, ordering) is `TEDS_MOTION.md` (Phase 4/5). Transitions here are handed to motion as state pairs |
| Renders | Claude Design "TEDS Phase 3 — Interaction"; archived at `docs/superpowers/specs/2026-07-teds-phase3-interaction.md` (*exploration artifact*; this file is normative) |
| Decisions | `TEDS-D14`–`TEDS-D20` (registered in `TEDS_GRAMMAR.md` §9); this doc is their normative expansion |

---

## 1. Owner rulings (Q1–Q8, 2026-07-19)

These are premises, not subjects, of the interaction spec.

| Id | Ruling | Shapes |
| :--- | :--- | :--- |
| Q1 | **Spine ratified** — the reveal ledger organizes the contract; the reveal deploys from the entry Stem outward along the Filament in time order | §4 (reveal) |
| Q2 | **INV-11 is global** — one selected Trade Object per workspace; selecting in any panel (incl. secondary) assumes the single global focus | §3.7 / TEDS-D18 |
| Q3 | **Keyboard = read reachability only** — navigate and reveal, never move levels or drag | §3.8 / TEDS-D19 |
| Q4 | **Modo enfoque** = a workspace-level session toggle that hides exact P/L digits (currency **and** R) and simplifies renders screen-wide; a render modifier, **not** an eighth matrix column | TEDS-D7 |
| Q5 | **Scalp floor = one bar**; collapse must adapt across timeframes → pixel-threshold collapse | TEDS-D15 |
| Q6 | **Ink ceilings: design first, judge at final visual review** — numbers below are proposed | §5 |
| Q7 | **Replay ghosts deferred** to a future phase; Phase 3 concerns the active trade only | scope |
| Q8 | **Multi-trade comparison is 100% out of scope** — post-session analysis belongs to the Reflection Cabin (INV-11 holds) | scope |

---

## 2. The 21-cell matrix (TEDS-D20)

Seven states × three designed zoom forms. Each cell is a **designed** answer, not a scaled one (L7). Nothing renders on the pane that is not a cell of this table or a legal transition between two. Breakpoints: **Completa ≥ 12px/bar · Estándar 4–12px · Glifo < 4px**.

| State | Completa (≥12px) | Estándar (4–12px) | Glifo (<4px) |
| :--- | :--- | :--- | :--- |
| **Idle** | P1 anatomy verbatim: entry Node, SL/TP Ticks, 1px Stem, Filament at 55%. No chips, no veils, nothing moves. `E1·M2 · L5 · INV-05` | Same marks; MAE/MFE notches withheld; Filament simplifies to its event polyline. `L7 · INV-10` | Constant-px glyph: outcome-hued Node + direction stub. Nothing else. `E6·M3` |
| **Hover** | P2 on loan: risk veil ≤8% between Ticks, level chips (entry · SL · TP in R). Dissolves without residue. `D10.a · L5 · INV-12` | One merged level chip — risk first per priority; veil holds; notches stay withheld. `INV-10` | Glyph lifts to 100%; one chip: id + outcome R. No veil — sub-4px cannot host an honest zone. `E5·M3` |
| **Selected** | E7 composite: world → 18%, halo + handles, DG chip in seat A; seat B walks the events (D14). Never a panel, never over candles. `E7 · INV-03 · INV-04` | Embodiment holds; notches (Nodes) appear; chips flip to the empty side; conviction-shading legal (D9). `D10.b · PR-6` | Selection decomposes the composite Node as a vertical unstack along the Stem (D15). Max 2 chips. `D15 · L7` |
| **Dragging** | Ghost rail + 1R/2R/3R ladder + R:R chip; all other chips retire; veil tracks the preview zone. `E9 · D17 · INV-08` | Rungs compress to labelled ticks; magnetism radius grows as px-per-R shrinks. `PR-5` | Not offered. Sub-4px cannot host honest price precision — zoom is the affordance. `INV-10` |
| **Open (live)** | P/L Rider on the Filament live edge: R primary, currency secondary at 55%. Enfoque: numberless meter (D7). `E8·M1 · D7` | Rider compresses to R only; under enfoque the meter alone travels the SL→TP span. `D7` | Live edge = hollow Node; rider is the meter by necessity — digits never render at this size. `INV-10` |
| **Closed** | Pure Filament record: hue at exit Node only; pixel-identical forever. No rider, no residue. `E10·M1 · INV-07` | Chaptered polyline: entry → MAE → MFE → exit. Identical on every visit. `D9` | Single outcome-hued glyph at fixed luminance — magnitude never encoded in ink; the record does not editorialize. `L3 · L4` |
| **Multi-panel** | Origin panel: full composite. Witness panels: luminance halo only — no dimming, no chips. `D18 · FP-5` | Witness halo at the panel's own form; the trade lifts, the world stays lit. `D18` | Witness = glyph lifted to 100%. Nothing else. `D18 · INV-11` |

*Open (live) and Closed are the two "resting" species of a trade; enfoque governs live anxiety (Open), never the record (Closed).*

---

## 3. The rulings the states settle

### 3.1 Resting — Idle · Open · Closed (TEDS-D7 · TEDS-D9)
Idle is transcription (P1 only, nothing moving — INV-05, L5). The two live questions of rest are the open trade's voice (**D7**) and the closed record's silence (**D9**), both registered in `TEDS_GRAMMAR.md` §9.

### 3.2 Hover — the approach
Hover opens the second tier temporarily: the risk veil (≤8% accent between the Ticks, edges owned by the Ticks — D10.a) and level chips. Everything dissolves on exit (L5, INV-12). **Hover never dims the world** — that is selection's subtraction. Precedence: hovering trade B while A is selected → B speaks at P2 over its dimmed 18% tier; A keeps its DG monopoly and both chip seats (falls out of INV-03). Keyboard has no hover state.

### 3.3 Selected — subtract · embody · project
E7 verbatim: others drop to 18%, the object gains halo + handles, the DG chip opens per INV-03 — never a panel, never covering candles (INV-04). Phase 3 adds the third act — **project**: aspatial judgments appear in the Dock (a Conversation projection, TEDS-D12/D16), and conviction-shading is the one selection-only render (D9).

### 3.4 Dragging — the Rails conversation (TEDS-D8 · TEDS-D17)
Ladder fixed at 1R/2R/3R; a playbook rule brightens its required rung + carries the one-line rule chip, base rungs recede to 25% (D8). Drag is reachable **only from Selected**; while dragging, the trade's other chips retire so rail + ladder + R:R hold both seats (**D17**, "Deepening, narrowed"). Release commits and returns to Selected; Esc cancels as if nothing happened. Not offered at Glifo (INV-10).

### 3.5 Density — the scalp collapse (TEDS-D15)
Collapse is threshold-driven **in pixels, not bars**: when a trade's event span falls below **24px**, its event Nodes merge into one composite Node (a Node merge per E5·M3 — the sixth primitive folding, not a seventh). Selection decomposes the composite as a vertical unstack along the Stem (a scalp always has price axis in abundance). Floor: the form is designed for a 1-bar trade (Stem + composite Node + one chip seat). Rejected: hiding facts of the record behind curation (INV-07); relocating event marks off their bars at idle (FP-2).

### 3.6 Dock choreography (TEDS-D16)
The Dock is a **fixed slot**, not a moving panel: selection fills it instantly, deselection empties it, it holds nothing between. Because the slot is spatially fixed and always allocated, filling it moves no layout — the pane never shifts under a click. (Echo won over Residue = storage-by-stealth, and over Summons = taxing the commonest aspatial read.)

### 3.7 Multi-panel echo (TEDS-D18)
INV-11 is **global** (Q2): one selected Trade Object per workspace; selecting in any panel assumes the single global focus, demoting the previous origin to witness. Full subtraction + embodiment renders **only on the gesture panel**; every other panel showing the trade renders the **witness halo** (luminance only, no dimming, no chips) at its own zoom form. Rejected: full-echo (dims a panel you are reading for something else, FP-5); origin-only (makes the workspace's one selection invisible where it also exists).

### 3.8 Keyboard reach — read-only (TEDS-D19)
`Tab` cycles the roster of visible trades in time order; `Enter` embodies (selects); `Esc` subtracts (dismisses selection, then focus); `↑/↓` walk the reveal ladder (§4); `←/→` walk the selected trade's events (moving chip seat B). **No level-nudge keys exist** — editing risk geometry is a pointer verb until a future RFC says otherwise. There is no keyboard-hover; keys go straight to selection.

---

## 4. The reveal strategy (TEDS-D14) — synthesis of the seven state ledgers

Per Q1 the reveal deploys **from the entry Stem** — the trade's subject — outward along the Filament in time order. Selection opens tier 1; every deeper tier is an explicit step; within the active tier, the second chip seat follows the trader along the events. **Three moves, one mechanism:**

1. **Ask for depth** — tiers advance only on an explicit step verb (scroll-step, or `↑/↓` while selected), always in **INV-03 order** (position → risk geometry → excursions → diagnostics). Staggered, never reordered, never forked. **Dwell is rejected** — time as an invisible input re-imports the indeterminism that killed E3·M3.
2. **Walk for breadth** — seat B holds the nearest event's chip and travels with the cursor or `←/→` along the events.
3. **Budget holds** — seat A holds the aspatial voice (DG / R:R / rule chip); seat B the nearest event. **≤ 2 chips visible per trade at all times** (PR-6). Retirement rule: a chip yields its seat the moment a deeper or nearer claimant arrives — the oldest voice goes quiet first.

Under *modo enfoque* (D7), tier advancement still works; only the digits are withheld. The strategy covers both **spatial facts** (distributed to their event Nodes — §8.1 of the grammar) and **aspatial judgments** (projected to the DG chip / Dock).

---

## 5. Ink ceilings (Q6 — proposed, ratify at visual review)

Per-form, as a fraction of **non-candle lit pixels** (the E6·M2 metric). Greyscale strips (FP-5) accompany every state at review — candles must be the brightest elements in all 21 cells.

| State | Ceiling |
| :--- | :--- |
| Idle | ≤ 3% |
| Hover | ≤ 5% |
| Selected | ≤ 8% |
| Dragging | ≤ 8% |

---

## 6. Motion boundary — the handoff to Phase 4

**Phase 3 (this doc) owns semantics:** what exists in each state, in which reveal order, at which form; which transitions are legal; what each transition must have true before and after. **Phase 4 (`TEDS_MOTION.md`) owns choreography:** durations, easings, ordering within a transition, the form-swap crossfade, the meter's live cadence — all under INV-05 (≤ 240ms, confirming state change only, nothing moving at idle). Motion principles the grammar already owns (a veil emerges from its owner; the state commits before any transition) are cited, not re-decided.

---

## 7. Relationship to the corpus
- `TEDS_GRAMMAR.md` — the six primitives and seven laws these states are built from; hosts the TEDS-D ledger.
- `TEDS_MOTION.md` — the choreography of every transition named here.
- `EXPERIENCE_DOMAINS.md` — interaction state is Conversation-domain: derived, ephemeral, **never persisted** (X-1 / INV-12).
- `RFC-017` — panel composition and the `syncTrades` gating that decides where a Trade Object may render (the substrate for §3.7 multi-panel echo).
