# TEDS Phase 5 — Motion Design System Consolidation

| Field | Value |
| :--- | :--- |
| Status | Exploration artifact (archived design render) — NON-normative |
| Phase | TEDS Phase 5 — Motion Design System Consolidation |
| Source | Claude Design project "TEDS", standalone export (archived 2026-07-22) |
| Authority | Subordinate to `docs/architecture/TEDS_GRAMMAR.md` + `EXPERIENCE_DOMAINS.md`; on conflict the repo normative record wins |

---

**Handoff artifact · RATIFIED · feeds `DESIGN_SYSTEM.md` + global `styles.css`**
Supersedes nothing; consolidates the immutable Phase 4 decisions (Doctrine · 4-Tier Hierarchy · Rulings D24–D29 · token additions · 11 state-pair choreographies). No new motion is designed here. Every value below is a direct extraction from the ratified Final Spec.

---

## 1 · The Global Motion CSS Dictionary

Engineering's single source of truth. Paste verbatim into global `styles.css`. Nothing outside this block defines TEDS motion; nothing inside it is negotiable.

```css
/* ============================================================
   TEDS MOTION — GLOBAL DICTIONARY (Phase 4, ratified)
   Motion narrates completed state. It never delays, performs,
   or competes with market data. Opacity is the only medium.
   ============================================================ */
:root {
  /* durations — three rungs + the exit rung (INVARIANT: exit ≤ entry) */
  --duration-fast:  120ms;  /* T3 entries · hover · chips · small ink arriving */
  --duration-base:  180ms;  /* T2 veils · form swap · workspace · object-scale  */
  --duration-slow:  240ms;  /* INV-05 ceiling · whole-world Quiet only          */
  --duration-exit:   80ms;  /* every leaving mark                               */

  /* easing — asymmetric: decelerate in, accelerate out */
  --ease-out:    cubic-bezier(0.2, 0, 0, 1);  /* E-ENTER — arrival   */
  --ease-in:     cubic-bezier(0.4, 0, 1, 1);  /* E-EXIT  — departure */
  --ease-linear: linear;                      /* E-TRUE  — geometry  */
}

/* --- The five utility classes. Compose; never inline a transition. --- */
.motion-enter { transition: opacity var(--duration-fast) var(--ease-out); }  /* hover ink · chips · dock content-in */
.motion-exit  { transition: opacity var(--duration-exit) var(--ease-in);  }  /* every leaving mark                  */
.motion-veil  { transition: opacity var(--duration-base) var(--ease-out); }  /* embodiment veils · halo · form swap */
.motion-quiet { transition: opacity var(--duration-slow) var(--ease-out); }  /* the world-dim layer (E7)            */
.motion-truth { transition: none;                                         }  /* geometry-truth; canvas rAF only — §2 */

/* --- Reduced motion — HYBRID (D25): strip spatial, keep luminance --- */
@media (prefers-reduced-motion: reduce) {
  /* 1 · kill spatial keyframes (translate/scale) → instant */
  .item-enter, .item-leave,
  .tab-enter,  .tab-leave { animation: none !important; }

  /* 2 · preserve luminance/color fades, capped to the fast rung */
  *, *::before, *::after {
    transition-property: opacity, color, background-color, border-color, fill, stroke;
    transition-duration: var(--duration-fast) !important;   /* ≤120ms */
    transition-timing-function: var(--ease-out) !important;
  }
}
```

> **Geometry-truth under reduced motion (canvas, not CSS):** the canvas primitives read `matchMedia('(prefers-reduced-motion: reduce)').matches` and set travel duration to `0` — the Tick jumps straight to its committed price. `prefers-reduced-motion` is the sole accessibility switch; **modo enfoque is orthogonal** (it governs which price digits are hidden, not the motion system). One degradation path, not two.

---

## 2 · Interaction Mapping — State Pairs → Utility Classes

For each ratified pair: the DOM target, the class it carries, and its `transition-delay` (the delay is what sequences the beats — the class fixes duration + easing). **Do not invent choreography; these are transcriptions of the Phase 4 sequences.** All compound sequences complete ≤ 240ms and the new state is already committed at `t=0`.

### Tier 1 / Tier 3 — selection & embodiment (CSS-driven)

| # | State pair | DOM target | Utility class | `transition-delay` | Beat (ratified) |
|---|------------|-----------|---------------|--------------------|-----------------|
| 1 | idle → hover | `.embodiment-veil` | `.motion-veil` | `0` | EMG veil @0 base |
|   |  | `.dg-chip` | `.motion-enter` | `40ms` | EMG chips @40 fast |
| 2 | hover → idle | `.embodiment-veil`, `.dg-chip` | `.motion-exit` | `0` | DIS all @0 exit |
| 3 | **hover → selected** *(exemplar)* | `.world` | `.motion-quiet` | `0` | QUIET @0 slow |
|   |  | `.sel-halo` | `.motion-veil` | `60ms` | halo @60 base |
|   |  | `.sel-handle` | `.motion-enter` | `120ms` | handles @120 fast |
|   |  | `.dg-chip` | `.motion-enter` † | `160ms` | DG @160 exit-dur |
| 4 | selected → idle | `.dg-chip`, `.sel-handle` | `.motion-exit` | `0` | object sheds first |
|   |  | `.sel-halo` | `.motion-exit` | `40ms` | halo second |
|   |  | `.world` | `.motion-veil` | `40ms` | QUIET-return @40 **base** (return is lighter than dim) |
| 9 | selection ⇄ panel echo | origin surface | *(full exemplar, row 3)* | *(as row 3)* | origin choreography |
|   |  | `[data-selection-echo]` witnesses | `.motion-enter` | `0` | **SIMULTANEOUS (D27)** — every witness on the same frame, no stagger |
| 11 | enfoque on / off | `.price-digit` | `.motion-veil` | `0` | DIS/EMG @0 base — one breath, workspace-simultaneous mode toggle |

> **† Single sanctioned override.** To honor the ratified "all beats resolve at 240ms," the entering DG chip carries `.motion-enter` **plus** an inline `style="transition-duration: var(--duration-exit)"` (80ms). `160ms delay + 80ms = 240ms`. This is the only element permitted to override a class default; document it in the component template, do not generalize it.

### Tier 2 — workspace (CSS-driven)

| # | State pair | DOM target | Utility class | `transition-delay` | Beat (ratified) |
|---|------------|-----------|---------------|--------------------|-----------------|
| 5 | selected → dragging | `.dg-chip` (siblings) | `.motion-exit` | `0` | DIS other chips |
|   |  | `.ghost-rail`, **`.r-ladder` (container)** | `.motion-veil` | `40ms` | **BLOCK RENDER (D28)** — one class on the ladder container; **no per-rung stagger** |
|   |  | `.rr-readout` | `.motion-enter` | `80ms` | EMG R:R fast |
| 8 | form ⇄ form (zoom) | incoming `.chart-form-layer` | `.motion-enter` | `0` | **FAST CROSSFADE (D26)** — LIFT in ≤120ms |
|   |  | outgoing `.chart-form-layer` | `.motion-exit` | `0` | DIS out (80ms); no scale, no morph |
| 10 | dock fill / empty | outgoing `.dock .slot` content | `.motion-exit` | `0` | DIS old |
|   |  | incoming `.dock .slot` content | `.motion-enter` | `40ms` | EMG new — **slot itself never moves (D16)** |

### Geometry-Truth exemption — `.motion-truth` (canvas-driven, **no CSS transition**)

These are the market moving, not the UI explaining (Doctrine §9). They receive **`.motion-truth`** — `transition: none` — and are driven exclusively by the canvas `requestAnimationFrame` loop on `--ease-linear`. **No CSS transition, no easing theatre, no `stroke-dashoffset` draw-on.**

| # | State pair / element | Target | Rule |
|---|----------------------|--------|------|
| — | **Live rider / meter dot** | canvas primitive | Continuous linear from the price feed. Tier 0 reality; exempt from "nothing moves at rest" (D24). |
| — | **Live edge** | canvas primitive | Advances one candle-width per bar close, linear. Geometry, not transition. |
| 6 | **dragging → selected — Tick commit travel** | `trade-boxes-primitive.ts` | `x` interpolates grab→committed price over `--duration-base`, sampled **linear**, easing out only on the final settle. Cancel = SNAP home (canvas x-lerp), `.ghost-rail` → `.motion-exit`. The moving Tick **is** the confirmation — no extra flourish. |
| 7 | **open → closed — SEAL edge** | `trade-boxes-primitive.ts` | **SILENT DOCK (D29):** live edge stops + exit Node draws (canvas) @0; `.live-rider` → `.motion-exit` @40; re-revealed `.price-digit` → `.motion-veil` @80. **No pulse, no exit-efficiency projection. Win and loss seal identically.** |

**State-layer invariant for every canvas beat:** the reducer commits the new state **before** the primitive interpolates (Doctrine 1 & 3). Interpolation only narrates the move to an already-true value; input never waits on it.

---

## 3 · The Anti-Collision Guardrail (Angular Implementation Rule)

**Directive — the One-Animation Rule (Motion Budget).** At most **one** intentional UI animation may compete for attention at any instant. This is enforced in the **state layer**, never left to CSS timing to resolve.

**Mechanism.**
1. **Single owner.** Hold `activeMotionTier: 0 | 1 | 2 | 3 | null` in the motion feature state. A beat may begin only if its tier is **≥** (higher priority than, i.e. numerically ≤) the current owner, or the owner is `null`.
2. **Collision = cancel-to-end, synchronously.** When a higher-tier action dispatches mid-beat, a meta-reducer/effect **force-settles** every in-flight lower-tier element to its **final** state on the same tick — it does **not** wait for `transitionend`, does **not** queue the interrupted beat, and does **not** blend the two curves.
3. **How to settle a CSS beat to its end state (one frame):** apply `[data-motion-cut]` (below) to snap `transition` off, write the element's final opacity/class, force a reflow, then release the attribute. The element is now *at* its destination with zero residual animation; the incoming higher-tier beat owns the frame cleanly.

```css
/* utility — cancels an in-flight transition to its committed end value */
[data-motion-cut], [data-motion-cut] * { transition: none !important; }
```


```ts
// motion-budget.ts — invoked by the effect that handles the higher-tier action
function preemptLowerTier(host: HTMLElement, endClass: string): void {
  host.setAttribute('data-motion-cut', '');   // 1 · kill the transition
  host.classList.remove('motion-enter', 'motion-exit', 'motion-veil', 'motion-quiet');
  host.classList.add(endClass);               // 2 · write the committed end state
  void host.offsetWidth;                       // 3 · force reflow — snap applies now
  host.removeAttribute('data-motion-cut');     // 4 · release for the next owner
}
```

**Rules, absolute:**
- **Never queue.** A preempted lower-tier beat is discarded, not deferred. It does not replay after the higher tier finishes.
- **Never blend.** No two `--ease-*` curves may run on overlapping frames for competing tiers.
- **Never let CSS arbitrate.** Priority is a state decision; CSS only executes the winner.
- **Tier 0 is uninterruptible and never interrupts.** Canvas geometry-truth (`.motion-truth`) runs on its own rAF loop, is exempt from the budget, and is never cut — but it also never registers as `activeMotionTier`, so it can never suppress a Tier 1 confirmation.
- **Release on settle.** Set `activeMotionTier = null` on the owning beat's completion so the budget frees for the next gesture.

---

*END OF PHASE 5 CONSOLIDATION · TEDS MOTION · RATIFIED · feeds `DESIGN_SYSTEM.md` + `styles.css`*
