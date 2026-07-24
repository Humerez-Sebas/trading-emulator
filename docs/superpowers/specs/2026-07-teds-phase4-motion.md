# TEDS Phase 4 — Motion · RATIFIED

| Field | Value |
| :--- | :--- |
| Status | Exploration artifact (archived design render) — NON-normative |
| Phase | TEDS Phase 4 — Motion |
| Source | Claude Design project "TEDS", standalone export (archived 2026-07-22) |
| Authority | Subordinate to `docs/architecture/TEDS_GRAMMAR.md` + `EXPERIENCE_DOMAINS.md`; on conflict the repo normative record wins |

> **Archivist's note.** Faithful English transcription of the Phase 4 design-exploration render
> ("TEDS · Phase 4 — Motion · Final Spec · RATIFIED", predecessor: Phase 3 ratified 20 jul 2026).
> Code blocks (CSS/TS) are reproduced exactly as authored. Data tables were reconstructed verbatim
> from the render's data arrays. The repo normative record is authoritative on any conflict.

---

## Overview

The PRE-DRAFT is approved and the six open questions are ruled. This document freezes the motion
vocabulary, the timing tokens, and the choreography of all eleven state pairs into concrete CSS
properties and canvas interpolation — the exact overlay engineering applies on top of the Phase 3
static states. Motion here is **progressive enhancement**: the interface is fully correct and
operable with this entire layer deleted. It obeys the ten-point Global Motion Doctrine and the
Tier 0–3 hierarchy without exception.

Chapter map: `01 Doctrine · 02 Hierarchy & budget · 03 Token system · 04 Vocabulary ·
05 Transition classes · 06 Exemplar · 07 Eleven pairs · 08 Geometry-truth · 09 Reduced motion ·
10 Rulings · 11 Handoff`

---

## 01 · Global Motion Doctrine — RATIFIED

**Motion communicates truth — not delight, not reward.** Every animation in TEDS must satisfy this
hierarchy in order. A transition that fails any higher rule is illegal, regardless of how well it
serves a lower one.

| # | Principle | Meaning |
| :-- | :--- | :--- |
| **01** | State changes first. | The reducer commits before any transition begins; at frame 0 the DOM and canvas already hold the new truth. |
| **02** | Motion only narrates completed state. | An animation describes what already happened. It is never the "loading" of a result. |
| **03** | Motion never delays state. | No input, read, or action waits on a transition; every beat is interruptible by the next gesture. |
| **04** | Motion never performs logic. | Nothing is computed, validated, routed, or fetched inside an animation. Presentation only. |
| **05** | Motion never competes with market data. | Tier 0 — price, candles, crosshair — always wins the eye; UI motion yields to it. |
| **06** | Motion disappears after repeated use. | Durations sit below conscious notice on the hundredth repeat. Nothing you watch twice. |
| **07** | Every transition reduces cognitive load. | It answers "what just changed?" and never adds a question. |
| **08** | If removing it improves clarity, it must not exist. | The anti-decoration gate. The default state of any element is no motion. |
| **09** | Market motion is reality; interface motion is explanation. | Two ontologies, never blended — §08 draws the line. |
| **10** | The trader's attention belongs to price, never the UI. | The north star the other nine principles serve. |

---

## 02 · Motion hierarchy & the attention budget

**Four tiers, and only one may speak at a time.**

| Tier | Name | Examples | Rule |
| :-- | :-- | :--- | :--- |
| **Tier 0** | Reality | Live price · candles · crosshair · live rider | Continuous, market-driven. Not "animation" — it is the data itself (§08). No UI motion may ever compete with it. |
| **Tier 1** | Critical trading state | Order filled · position opened/closed · stop hit | Subtle confirmation only. Win and loss seal identically — no celebration, no color wash (AG-04 · INV-07). |
| **Tier 2** | Workspace | Panels · layout · tabs · dock | Fast, purely functional. Luminance cross-fades ≤ `--duration-base` (180ms). The slot itself never moves (D16). |
| **Tier 3** | Cosmetic | Hover · focus · selection | Almost invisible. Strictly under INV-05: ≤240ms end to end, and nothing at rest. |

### The One-Animation Rule

At most one intentional UI animation competes for attention at any instant. When a higher tier
fires mid-beat, lower-tier motion is cancelled to its end state — never queued, never blended. A
single motion-owner guard in the interaction layer enforces this (§11).

---

## 03 · Token system — two additions, nothing else changes

**Reuse what is already wired; add only the exit rung and linear.** The codebase already ships a
three-rung duration ladder and an asymmetric easing pair on every `.ui-*` primitive. The
proposal's bespoke bézier values are superseded by those wired curves — they already express
decelerate-in / accelerate-out. Phase 4 adds exactly two tokens.

```css
/* TEDS motion tokens — Phase 4, applied over styles.css §2 */
:root {
  /* durations — three rungs + the exit rung (exit ≤ entry) */
  --duration-fast: 120ms; /* T3 entries · hover · chips (existing) */
  --duration-base: 180ms; /* T2 veils · form swap · workspace (existing) */
  --duration-slow: 240ms; /* INV-05 ceiling · whole-world only (existing) */
  --duration-exit:  80ms; /* every leaving mark (ADD) */

  /* easing — asymmetric: decelerate in, accelerate out */
  --ease-out:    cubic-bezier(0.2, 0, 0, 1); /* E-ENTER — arrival (existing) */
  --ease-in:     cubic-bezier(0.4, 0, 1, 1); /* E-EXIT — departure (existing) */
  --ease-linear: linear;                     /* E-TRUE — geometry (ADD) */
}
```

| Token | Value | Role | Status |
| :-- | :-- | :--- | :-- |
| `--duration-fast` | 120ms | T3 entries · hover · chips · small ink arriving | existing |
| `--duration-base` | 180ms | T2 veils · form swap · workspace · object-scale | **re-anchors T2 (140→180)** |
| `--duration-slow` | 240ms | INV-05 ceiling · whole-world Quiet only | existing |
| `--duration-exit` | 80ms | every leaving mark (exit ≤ entry) | ADD |
| `--ease-out` | `cubic-bezier(.2,0,0,1)` | E-ENTER — decelerating arrival | existing |
| `--ease-in` | `cubic-bezier(.4,0,1,1)` | E-EXIT — accelerating departure | existing |
| `--ease-linear` | `linear` | E-TRUE — geometry-truth only | ADD |

---

## 04 · The motion vocabulary — eight moves, never a ninth

**Every transition composes from these, or it does not ship.** A closed set, mirroring the
grammar's six primitives. Each move names its exact CSS technique or canvas operation. A
choreography that cannot be written as a sequence of these eight is the anti-decoration gate's job
to reject (D21).

| Move | Token | Description | CSS / canvas technique |
| :-- | :-- | :--- | :--- |
| **Dissolve** | MV-DIS | Opacity out, into the owner. The universal exit of conversational ink. | `opacity → 0 · exit · ease-in` |
| **Lift** | MV-LIFT | Luminance ramp up on an existing mark — hover's 55→100%, the witness halo. | `opacity .55→1 · fast · ease-out` |
| **Quiet** | MV-QUIET | World luminance down to 18% (E7 subtraction). The only move that touches every trade at once. | `world opacity → .18 · slow · ease-out` |
| **Emerge** | MV-EMG | Conversational ink grows from its owner: veil from Ticks, chips from anchor, ladder from handle. | `opacity 0→1 · base · ease-out` |
| **Travel** | MV-TRV | A chip seat or Tick glides along the Filament between events. The one sanctioned positional slide. | `canvas x-lerp · base · linear→out` |
| **Seal** | MV-SEAL | Open→closed: the live edge stops, the exit Node draws, the rider retires. Geometry-truth motion. | `canvas edge+node · exit · geometry` |
| **Swap** | MV-SWAP | Designed-form exchange at zoom thresholds (L7): outgoing form dissolves as the incoming lifts. | `opacity crossfade · fast (≤120)` |
| **Snap** | MV-SNAP | Ghost rail magnetizing to an R-rung (E9) and a cancelled drag returning home. Gesture physics. | `canvas x-lerp → rung · fast · ease-out` |

---

## 05 · Transition classes — the utility layer engineering applies

**Five composable classes; add to `ui-primitives.css`.** Compose these onto elements; never inline
the transition. Because every one is luminance-only (opacity), the reduced-motion policy (§09)
degrades them by construction.

| Class | CSS | Use |
| :-- | :--- | :--- |
| `.motion-enter` | `transition: opacity var(--duration-fast) var(--ease-out);` | hover ink · chips · dock content-in |
| `.motion-exit` | `transition: opacity var(--duration-exit) var(--ease-in);` | every leaving mark |
| `.motion-veil` | `transition: opacity var(--duration-base) var(--ease-out);` | embodiment veils · halo · form swap |
| `.motion-quiet` | `transition: opacity var(--duration-slow) var(--ease-out);` | the world-dim layer (E7 subtraction) |
| `.motion-truth` | `transition: none; /* driven by rAF — see §08 */` | geometry-truth canvas; never CSS-eased |

### Compliance audit — existing keyframes

| Hook | File | Now | Change |
| :-- | :-- | :--- | :--- |
| `.item-enter` / `.item-leave` | `trade-panel.component.css` | translateY(±6px) + opacity | Drop the translate — opacity-only (M-3). Luminance is the medium, not position. |
| `.tab-enter` / `.tab-leave` | `side-dock.component.css` | translateY(±6px) + opacity | Strip the translate; cross-fade inside the fixed slot (D16). The slot never moves. |
| `.ui-tooltip.is-visible` | `ui-primitives.css` | opacity · fast · ease-out | Already compliant — this is exactly `.motion-enter`. No change. |
| `.ui-btn` / `.ui-icon-btn` / `.ui-input` | `ui-primitives.css` | background/border/color · fast · ease-out | Already compliant (Tier 3, color-only, ≤120ms). No change. |

---

## 06 · The exemplar — hover → selected, beat by beat (D23)

**Subtraction leads; information begins last; all resolve at 240.** The quieting world starts
first, so the halo reads as emphasis rather than decoration — the trade steps forward because
everything else has begun stepping back (E7, made temporal). Beats stagger their
`transition-delay` but land on the same frame at the 240ms ceiling: information was simply the last
to begin.

Beat timeline: `0 → 60 → 120 → 180 → 240ms`

| Beat | Move · token · start |
| :-- | :--- |
| Quiet world | MV-QUIET · slow · @0 |
| Halo | MV-EMG · base · @+60 |
| Handles | MV-EMG · fast · @+120 |
| DG chip | MV-EMG · exit · @+160 |

Reversal (selected → idle) is **not** this film played backwards: the object sheds first (exit,
80ms), the world returns second (base) — letting go is always lighter than taking hold.

```css
/* hover → selected — the one Tier-1 composite beat (D23) */
.world     { transition: opacity var(--duration-slow) var(--ease-out); } /* @0 → .18 */
.sel-halo  { transition: opacity var(--duration-base) var(--ease-out);
             transition-delay: 60ms; }  /* @+60 */
.sel-handle{ transition: opacity var(--duration-fast) var(--ease-out);
             transition-delay: 120ms; } /* @+120 */
.dg-chip   { transition: opacity var(--duration-exit) var(--ease-out);
             transition-delay: 160ms; } /* @+160 — all resolve @240 */
```

---

## 07 · The eleven pairs — final choreography

**Every pair as beats, targets, and totals.** Notation: `move@start token`, all ms. Every sequence
completes ≤240ms and the new state is true at `t=0` — motion narrates a change that has already
committed; input never waits. "Ruling" tags mark where a ruling changed the proposal.

| # | State pair | Sequence | Targets | Total (ms) | Ruling |
| :-- | :-- | :--- | :--- | :-- | :-- |
| 1 | idle → hover | EMG veil@0 base · EMG chips@40 fast | `.embodiment-veil` · `.dg-chip` | 180 | — |
| 2 | hover → idle | DIS all@0 exit | `.embodiment-veil` · `.dg-chip` | 80 | — |
| 3 | hover → selected | QUIET@0 slow · halo@60 base · handles@120 fast · DG@160 exit | `.world` · `.sel-halo` · `.sel-handle` · `.dg-chip` | 240 | — |
| 4 | selected → idle | DIS chips+handles@0 exit · DIS halo@40 exit · QUIET-return@40 base | `.sel-*` · `.world` · `.dock .slot` | ≤220 | — |
| 5 | selected → dragging | DIS other-chips@0 exit · EMG rail+ladder@40 base · EMG R:R@80 fast | `.r-ladder` · `.ghost-rail` | 180 | OQ5 · BLOCK RENDER |
| 6 | dragging → selected | commit: TRV tick@0 base (linear→out) · DIS rail@40 exit — cancel: SNAP home@0 fast · DIS rail@0 exit | `trade-boxes-primitive.ts` | ≤180 | OQ1 · GEOMETRY-TRUTH |
| 7 | open → closed | SEAL edge@0 (canvas) · DIS rider@40 exit · EMG digits@80 base (if enfoque hid them) | `trade-boxes-primitive.ts` · `.dock` | 160 | OQ6 · SILENT DOCK |
| 8 | form ⇄ form (zoom) | SWAP@0 fast — DIS out ∥ LIFT in, both ≤120 | `.chart-form-layer` | 120 | OQ3 · FAST CROSSFADE |
| 9 | selection ⇄ panel echo | origin: full exemplar · witnesses: EMG@0 fast — SIMULTANEOUS, no delay | `[data-selection-echo]` | 240 / 120 | OQ4 · SIMULTANEOUS t=0 |
| 10 | dock fill / empty | DIS old@0 exit ∥ EMG new@40 fast | `.dock .slot` | 120 | — |
| 11 | enfoque on / off | DIS digits@0 base (on) / EMG digits@0 base (off) | `.price-digit` | 180 | — |

Per-pair notes:

1. **idle → hover** — Veil grows from the Ticks; chips settle after. World untouched.
2. **hover → idle** — One breath out, zero residue. Exit (80) is faster than entry.
3. **hover → selected** — The exemplar (§06). Subtraction leads 60ms; information begins last; all resolve at 240.
4. **selected → idle** — Object sheds first, world returns second. Dock empties with a content fade.
5. **selected → dragging** — Ladder renders complete in one beat — no rung cascade. Analysis appears whole.
6. **dragging → selected** — The moving Tick IS the confirmation — geometry-truth, no extra flourish.
7. **open → closed** — Silent Dock: no pulse, no exit-efficiency projection. Win and loss seal identically. Closure is informational.
8. **form ⇄ form (zoom)** — Cross-fade of representation. No scale, no morph — the UI never performs transformation.
9. **selection ⇄ panel echo** — Every witness surface updates on the same frame as the origin. No temporal hierarchy.
10. **dock fill / empty** — Content cross-fades inside the fixed slot; the slot itself never moves (D16).
11. **enfoque on / off** — One breath across all panes, workspace-simultaneous. A mode, not a wave — no stagger. The motion system itself is unchanged.

---

## 08 · Geometry-truth — the canvas exemption (OQ1 → D24)

**Market motion is reality; it is not a transition.** Doctrine principle 9 draws a hard line. A
small set of continuous movements are the market moving, not the UI explaining — they are exempt
from "nothing moves at rest." They render on `--ease-linear` with no theatre, inside the canvas
primitives, never as a CSS transition.

| Element | How it moves |
| :-- | :--- |
| **Live rider / meter dot** | Continuous, linear, deterministic — driven by the price feed inside the render loop. No easing, no CSS. It is Tier 0 reality, exempt from "nothing moves at rest" (OQ1 → D24). |
| **Live edge** | The open position's right boundary advances one candle-width per bar close, linear. Geometry telling the truth, not a transition. |
| **Tick commit travel** | On drag→commit the SL/TP line interpolates x from grab point to committed price over `--duration-base` — sampled linear, easing out only on the final settle. The single sanctioned positional slide; it follows trade geometry. |

```js
// geometry-truth interpolation — inside primitive.render(now)
// state is ALREADY committed; this only narrates the move to it
const t = Math.min((now - t0) / durMs, 1);        // 0..1
const x = lerp(fromX, toX, t);                     // linear = identity easing
ctx.moveTo(x, yTop); ctx.lineTo(x, yBot);          // draw at interpolated x
if (t < 1) engine.requestFrame();                  // keep animating; never block state
```

**Prohibited:** no `stroke-dashoffset` "draw-on" of nodes or lines (reads as assembly — violates
principle 2 and the OQ5 spirit); no easing theatre on the rider (it is reality, not explanation);
no scale or bounce on any canvas mark (AG-04).

---

## 09 · Reduced motion — hybrid policy (OQ2 → D25)

**Keep the fades; strip the spatial and the travel.** The codebase currently kills all motion to
0.01ms — which also removes the opacity fades that carry meaning, producing jarring
discontinuities. The ruling: retain luminance fades capped to the fast rung, remove spatial
keyframes and geometry travel. Replace the blunt block in `styles.css` with this.

```css
/* Phase 4 hybrid reduced-motion (OQ2 → D25) — replaces the blunt block in styles.css */
@media (prefers-reduced-motion: reduce) {
  /* 1 · strip spatial keyframes (translate/scale) → instant */
  .item-enter, .item-leave,
  .tab-enter,  .tab-leave { animation: none !important; }

  /* 2 · keep luminance fades, capped to the fast rung */
  *, *::before, *::after {
    transition-property: opacity, color, background-color, border-color, fill, stroke;
    transition-duration: var(--duration-fast) !important;   /* ≤120ms */
    transition-timing-function: var(--ease-out) !important;
  }
}
/* 3 · geometry-truth (canvas): primitives read the query and skip the travel */
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const durMs  = reduce ? 0 : DUR_BASE;   // Tick jumps straight to committed price
```

**Note:** the two switches are independent. `prefers-reduced-motion` is the accessibility path
above. Modo enfoque is orthogonal — it governs which price digits are hidden, and does NOT dampen
the motion system. Phase 6 therefore ships one motion-degradation path, not two.

---

## 10 · The six rulings, applied

**Each open question → its ruling → what it mints.**

| OQ | Ruling | Impact | Mints |
| :-- | :--- | :--- | :-- |
| **OQ1** | Exempt as geometry truth. | Continuous, linear, deterministic; no easing. Market movement is reality, not UI. → §08 · pair 6. | **D24** |
| **OQ2** | Hybrid reduced-motion. | Opacity/color fades ≤120ms; strip spatial + travel. Enfoque is orthogonal (digits only) — one degradation path. → §09. | **D25** |
| **OQ3** | Fast cross-fade ≤120ms. | No physical scaling or morphing. The UI changes representation; it never performs transformation. → pair 8 · MV-SWAP. | **D26** |
| **OQ4** | Simultaneous at t=0. | All witness surfaces update on the exact same frame. Supersedes the proposal's +60ms stagger. → pair 9. | **D27** |
| **OQ5** | Block render. | Render the entire ladder immediately; no cascade. Analysis appears complete, never assembled. → pair 5 · MV-EMG. | **D28** |
| **OQ6** | Silent Dock. | Immediate state update, quiet docking. No celebratory pulses, no exit-efficiency projection. Closure is informational. → pair 7. | **D29** |

**Ledger.** D21–D23 are ratified as proposed (vocabulary + anti-decoration gate · timing/easing
tokens with exit ≤ entry · selection order). D24–D29 are minted by the rulings above. The ledger
carries D1–D29 into Phase 5 tokenisation.

---

## 11 · Engineering handoff — what to touch

**Eight edits, applied as an overlay on Phase 3.** Ordered by blast radius. Items 1–4 are pure CSS;
5–6 touch the canvas primitives; 7 is a verification; 8 is the budget guard. State must always
commit before any of this runs (principles 1 & 3).

| # | File | Task |
| :-- | :--- | :--- |
| 1 | `src/styles.css §2` | Add two tokens: `--duration-exit: 80ms` and `--ease-linear: linear`. Nothing else in the scale changes. |
| 2 | `src/styles/ui-primitives.css` | Add the `.motion-enter` / `-exit` / `-veil` / `-quiet` classes (§05). Compose them onto elements; do not inline transitions. |
| 3 | `trade-panel.component.css` · `side-dock.component.css` | Refactor `.item-*` / `.tab-*` keyframes to opacity-only; delete the translateY (M-3, doctrine principle 9 for UI ink). |
| 4 | `src/styles.css` | Replace the blunt `prefers-reduced-motion` block with the hybrid block (§09 · D25). |
| 5 | `trade-boxes-primitive.ts` · `trade-buttons-primitive.ts` · `countdown-primitive.ts` | Implement geometry-truth interpolation (§08). Commit state before interpolating (principles 1 & 3); honor reduced-motion by setting travel = 0. |
| 6 | selection overlay (halo · handles · DG chip) | SVG group opacity transitions per the exemplar (§06); block-render, no stroke draw-on. Respect `transition-delay` for the beat order. |
| 7 | `ui-primitives.css .ui-*` | Verified already compliant (Tier 3, color-only, fast/ease-out). No change required — see the §05 audit. |
| 8 | interaction layer | Add the single motion-owner budget guard: a higher tier firing cancels lower-tier motion to its end state, never queues or blends (§02). |

---

*END OF FINAL SPEC · TEDS · PHASE 4 MOTION RATIFIED · FEEDS PHASE 5 TOKENISATION*
