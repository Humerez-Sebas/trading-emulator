# TEDS Motion — Doctrine, Tokens & Choreography

| Field | Value |
| :--- | :--- |
| Status | Foundational (normative, living document) |
| Date | 2026-07-22 (consolidates Claude Design "TEDS Phase 4 — Motion · RATIFIED" + "Phase 5 — Motion Consolidation") |
| Authority | Normative source for **how TEDS transitions move**. Choreographs the state pairs defined in `TEDS_INTERACTION.md`; obeys `TEDS_GRAMMAR.md` (INV-05: ≤240ms, nothing at idle). Token integration flows through `DESIGN_SYSTEM.md` §6.4 |
| Scope | Motion is **progressive enhancement**: the interface is fully correct and operable with this entire layer deleted. It never delays state, performs logic, or competes with market data |
| Renders | Claude Design "TEDS Phase 4 — Motion (Final Spec)" + "Phase 5 — Motion Consolidation"; archived at `docs/superpowers/specs/2026-07-teds-phase{4,5}-*.md` (*exploration artifacts*; this file is normative) |
| Decisions | `TEDS-D21`–`TEDS-D29` (registered in `TEDS_GRAMMAR.md` §9) |

---

## 1. Global Motion Doctrine (TEDS-D21)

Every animation must satisfy this hierarchy **in order**. A transition that fails a higher rule is illegal regardless of how well it serves a lower one.

| # | Principle | Reading |
| :--- | :--- | :--- |
| 01 | **State changes first** | The reducer commits before any transition begins; at frame 0 the DOM and canvas already hold the new truth. |
| 02 | **Motion only narrates completed state** | An animation describes what already happened; it is never the "loading" of a result. |
| 03 | **Motion never delays state** | No input, read, or action waits on a transition; every beat is interruptible by the next gesture. |
| 04 | **Motion never performs logic** | Nothing is computed, validated, routed, or fetched inside an animation. Presentation only. |
| 05 | **Motion never competes with market data** | Tier 0 (price, candles, crosshair) always wins the eye; UI motion yields. |
| 06 | **Motion disappears after repeated use** | Durations sit below conscious notice on the hundredth repeat. Nothing you watch twice. |
| 07 | **Every transition reduces cognitive load** | It answers "what just changed?" and never adds a question. |
| 08 | **If removing it improves clarity, it must not exist** | The anti-decoration gate. The default state of any element is no motion. |
| 09 | **Market motion is reality; interface motion is explanation** | Two ontologies, never blended (see §7). |
| 10 | **The trader's attention belongs to price, never the UI** | The north star the other nine serve. |

---

## 2. Motion hierarchy & the attention budget

| Tier | Name | Examples | Rule |
| :--- | :--- | :--- | :--- |
| **0** | Reality | live price · candles · crosshair · live rider | Continuous, market-driven — the data itself (§7). No UI motion may ever compete with it. |
| **1** | Critical trading state | order filled · position opened/closed · stop hit | Subtle confirmation only. **Win and loss seal identically** — no celebration, no color wash (INV-07, no gamification). |
| **2** | Workspace | panels · layout · tabs · dock | Fast, purely functional. Luminance cross-fades ≤ `--duration-base` (180ms). The slot itself never moves (D16). |
| **3** | Cosmetic | hover · focus · selection | Almost invisible. Strictly under INV-05: ≤240ms end to end, nothing at rest. |

**The One-Animation Rule (Motion Budget).** At most **one** intentional UI animation competes for attention at any instant. When a higher tier fires mid-beat, lower-tier motion is cancelled **to its end state** — never queued, never blended. Enforced by a single motion-owner guard in the state layer (`activeMotionTier`), never left to CSS timing (see §8). Tier 0 (canvas geometry-truth) is uninterruptible, never interrupts, and never registers as `activeMotionTier`.

---

## 3. Token system (TEDS-D22) — two additions, nothing else changes

The codebase already ships the three-rung duration ladder + asymmetric easing pair (`emulador/src/styles.css:134-138`). TEDS adds exactly **two** tokens.

| Token | Value | Role | Status |
| :--- | :--- | :--- | :--- |
| `--duration-fast` | 120ms | T3 entries · hover · chips · small ink arriving | existing |
| `--duration-base` | 180ms | T2 veils · form swap · workspace · object-scale | **existing** — Phase 4's "re-anchor 140→180" is a **no-op**; the repo value is already 180ms |
| `--duration-slow` | 240ms | INV-05 ceiling · whole-world Quiet only | existing |
| `--duration-exit` | 80ms | every leaving mark (INVARIANT: exit ≤ entry) | **ADD** |
| `--ease-out` | `cubic-bezier(0.2,0,0,1)` | E-ENTER — decelerating arrival | existing |
| `--ease-in` | `cubic-bezier(0.4,0,1,1)` | E-EXIT — accelerating departure | existing |
| `--ease-linear` | `linear` | E-TRUE — geometry-truth only | **ADD** |

> **Integration status:** these values are **approved-for-integration** (registered in `DESIGN_SYSTEM.md` §6.4). The actual edits to `styles.css` / `ui-primitives.css` and the component keyframes happen at **implementation** time (a downstream plan), not in this document.

---

## 4. The motion vocabulary (TEDS-D21) — eight moves, never a ninth

A closed set mirroring the grammar's six primitives. A choreography that cannot be written as a sequence of these eight is rejected by the anti-decoration gate.

| Move | Token | Technique |
| :--- | :--- | :--- |
| Dissolve | MV-DIS | opacity → 0 · exit · ease-in (the universal exit of conversational ink) |
| Lift | MV-LIFT | opacity .55→1 · fast · ease-out (hover luminance ramp; witness halo) |
| Quiet | MV-QUIET | world opacity → .18 · slow · ease-out (E7 subtraction; the only move touching every trade) |
| Emerge | MV-EMG | opacity 0→1 · base · ease-out (ink grows from its owner: veil from Ticks, chips from anchor) |
| Travel | MV-TRV | canvas x-lerp · base · linear→out (a chip seat or Tick glides along the Filament) |
| Seal | MV-SEAL | canvas edge+node · exit · geometry (open→closed: live edge stops, exit Node draws) |
| Swap | MV-SWAP | opacity crossfade · fast (≤120) (designed-form exchange at zoom thresholds, L7) |
| Snap | MV-SNAP | canvas x-lerp → rung · fast · ease-out (ghost rail magnetizing; cancelled drag returning home) |

---

## 5. The utility layer — five composable classes

Compose onto elements; **never inline a transition**. Every class is luminance-only (opacity), so reduced motion (§6) degrades them by construction.

```css
.motion-enter { transition: opacity var(--duration-fast) var(--ease-out); }  /* hover ink · chips · dock content-in */
.motion-exit  { transition: opacity var(--duration-exit) var(--ease-in);  }  /* every leaving mark                  */
.motion-veil  { transition: opacity var(--duration-base) var(--ease-out); }  /* embodiment veils · halo · form swap */
.motion-quiet { transition: opacity var(--duration-slow) var(--ease-out); }  /* the world-dim layer (E7)            */
.motion-truth { transition: none;                                         }  /* geometry-truth; canvas rAF only    */
```

Existing keyframes to reconcile at implementation: `trade-panel.component.css` `.item-enter/.item-leave` and `side-dock.component.css` `.tab-enter/.tab-leave` currently use `translateY(±6px)` — drop the translate, opacity-only (luminance is the medium). `ui-primitives.css` `.ui-tooltip`/`.ui-btn` are already compliant.

---

## 6. Reduced motion — hybrid policy (TEDS-D25)

The current `@media (prefers-reduced-motion: reduce)` block (`styles.css:213`) kills all motion; that also removes the opacity fades that carry meaning. The ruling: **strip spatial keyframes + geometry travel; preserve luminance/color fades capped to the fast rung.**

```css
@media (prefers-reduced-motion: reduce) {
  .item-enter, .item-leave, .tab-enter, .tab-leave { animation: none !important; }  /* kill translate/scale */
  *, *::before, *::after {
    transition-property: opacity, color, background-color, border-color, fill, stroke;
    transition-duration: var(--duration-fast) !important;   /* ≤120ms */
    transition-timing-function: var(--ease-out) !important;
  }
}
```

Canvas geometry-truth reads `matchMedia('(prefers-reduced-motion: reduce)').matches` and sets travel duration to `0` (the Tick jumps to its committed price). `prefers-reduced-motion` is the **sole** accessibility switch; *modo enfoque* is orthogonal (it governs which price digits are hidden, not the motion system).

---

## 7. Geometry-truth — the canvas exemption (TEDS-D24)

Doctrine principle 09 draws a hard line. Live rider/meter dot, the live edge, and the Tick-commit travel are **the market moving, not the UI explaining** — exempt from "nothing moves at rest." They render on `--ease-linear` inside the canvas `requestAnimationFrame` loop, **never as a CSS transition** (no easing theatre, no `stroke-dashoffset` draw-on). The reducer commits the new state **before** the primitive interpolates; interpolation only narrates the move to an already-true value.

---

## 8. The eleven state-pair choreographies

Notation: `move@start-delay token`, all ms. Every sequence completes ≤240ms and the new state is true at `t=0`. `transition-delay` sequences the beats; the utility class fixes duration + easing.

| # | State pair | Sequence | Total | Ruling |
| :--- | :--- | :--- | :--- | :--- |
| 1 | idle → hover | EMG veil@0 base · EMG chips@40 fast | 180 | — |
| 2 | hover → idle | DIS all@0 exit | 80 | — |
| 3 | hover → selected *(exemplar)* | QUIET@0 slow · halo@60 base · handles@120 fast · DG@160 exit-dur | 240 | D23 — subtraction leads |
| 4 | selected → idle | DIS chips+handles@0 exit · DIS halo@40 exit · QUIET-return@40 base | ≤220 | object sheds first |
| 5 | selected → dragging | DIS other-chips@0 exit · EMG rail+ladder@40 base · EMG R:R@80 fast | 180 | **D28** block render |
| 6 | dragging → selected | commit: TRV tick@0 base (linear→out) · DIS rail@40 exit — cancel: SNAP home@0 · DIS rail@0 | ≤180 | **D24** geometry-truth |
| 7 | open → closed | SEAL edge@0 (canvas) · DIS rider@40 exit · EMG digits@80 base (if enfoque hid them) | 160 | **D29** silent dock |
| 8 | form ⇄ form (zoom) | SWAP@0 fast — DIS out ∥ LIFT in, both ≤120 | 120 | **D26** fast crossfade |
| 9 | selection ⇄ panel echo | origin: full exemplar · witnesses: EMG@0 fast — **simultaneous, no delay** | 240 / 120 | **D27** simultaneous t=0 |
| 10 | dock fill / empty | DIS old@0 exit ∥ EMG new@40 fast (slot never moves, D16) | 120 | — |
| 11 | enfoque on / off | DIS/EMG digits@0 base — workspace-simultaneous, no stagger | 180 | — |

**Exemplar (pair 3).** The world quiets first so the halo reads as emphasis: the trade steps forward because everything else has begun stepping back. Reversal is not the film backwards — the object sheds first (exit, 80ms), the world returns second (base); letting go is lighter than taking hold.

> **Single sanctioned override:** to hit the ratified 240ms, the entering DG chip in pair 3 carries `.motion-enter` **plus** an inline `transition-duration: var(--duration-exit)` (80ms): `160 delay + 80 = 240`. This is the only element permitted to override a class default — document it in the template, never generalize it.

---

## 9. The anti-collision guardrail (implementation rule)

The One-Animation Rule is enforced in the **state layer**, never left to CSS:
1. **Single owner** — hold `activeMotionTier: 0|1|2|3|null` in ephemeral motion state (Conversation domain — **never persisted**, INV-12/X-1).
2. **Collision = cancel-to-end, synchronously** — a higher-tier dispatch force-settles every in-flight lower-tier element to its final state on the same tick (apply `[data-motion-cut]` to snap `transition:none`, write the final class, force a reflow, release). Never queue, never blend.
3. **Never let CSS arbitrate** — priority is a state decision; CSS only executes the winner. Release `activeMotionTier = null` on the owning beat's completion.

Full CSS dictionary + the `motion-budget.ts` guard: `docs/superpowers/specs/2026-07-teds-phase5-consolidation.md` (the engineering handoff artifact).

---

## 10. Ledger (registered in `TEDS_GRAMMAR.md` §9)
- **D21** vocabulary + anti-decoration gate · **D22** timing/easing tokens (exit ≤ entry) · **D23** selection order — *ratified as proposed*.
- **D24** geometry-truth exemption · **D25** reduced-motion hybrid · **D26** fast crossfade · **D27** simultaneous echo · **D28** block-render ladder · **D29** silent dock seal — *minted Phase 4*.
