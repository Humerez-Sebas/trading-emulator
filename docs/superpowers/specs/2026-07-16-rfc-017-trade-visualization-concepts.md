# RFC-017 — Trade Visualization Layer: Visual Exploration (Step 1)

| Field | Value |
| :--- | :--- |
| Status | Direction selected (Concept A + two adoptions) |
| Date | 2026-07-16 |
| Governing docs | `docs/architecture/rfcs/017-compositional-panel-sync.md` §6, `DESIGN_SYSTEM.md` (visual authority), `PRODUCT.md` (anti-references) |
| Scope | Visual design of the trade overlay only. State/sync architecture lives in the RFC-017 design spec. |

This document fulfills the mandatory visual exploration phase: three genuinely
distinct visual directions for the Trade Visualization Layer, each evaluated
against (1) visual readability and cognitive load, (2) replay usability and
spatial awareness, (3) visual hierarchy against background candles. A final
direction is selected at the end, with its Design System token definitions.

---

## 0. What the layer must show (shared across all concepts)

Fixed inventory, derived from the trading domain (mono-symbol, D1) and RFC-017 §6:

| Element | Live position | Pending order | Closed trade |
| :--- | :--- | :--- | :--- |
| Entry level | ✓ | ✓ (would-be entry) | ✓ (historical) |
| Stop / Target levels | ✓ | ✓ | — (implied by box) |
| Risk/Reward zones | ✓ | ✓ | ✓ (frozen extent) |
| Fill/exit markers | entry only | — | entry + exit |
| Trade path | — | — | ✓ |
| Position label (size, side, floating P/L) | ✓ | ✓ (type + size) | — |

Anti-reference (binding, `PRODUCT.md`): MetaTrader's language — full-width
dashed price lines for every level, axis-label pollution for every trade,
opaque colored rectangles — is what we are explicitly moving away from.

The layer renders on panels whose `symbol === primarySymbol`, composed after
drawings in the same pipeline (see RFC-017 design spec §4). Everything below
is purely about how the elements look and behave.

---

## 1. Concept A — "Ghost Rails" (TradingView-inspired, span-scoped geometry)

### Description

Every trade element is scoped to the trade's own time span — nothing bleeds
across the full chart width. The trade is a compact, self-contained figure
laid over the candles:

```
                        ┌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┐  ← target rail (segment, not full-width)
                        │   profit zone (8%)    │
  entry ▶───────────────┼───────────────────────┤  ← entry rail (solid 1px, side color)
                        │   loss zone (8%)      │
                        └╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘  ← stop rail (segment)
                        ↑ entry bar        cursor ↑
```

- **Zones:** two flat rectangles (profit above/below entry per side) from the
  entry bar to the replay cursor (live) or exit bar (closed). Fill `--up`/`--down`
  at 8% opacity, 1px border at 32% opacity. No gradients (DESIGN_SYSTEM §4.1).
- **Rails:** entry/SL/TP are horizontal *segments* spanning only the trade's
  time range. Entry solid, SL/TP dotted 1px. No full-width lines; no price-axis
  labels except the entry price.
- **Markers:** 8px triangles at fills (▲ buy / ▼ sell in side color, outlined
  with `--bg` for candle separation), diamond ◆ at exits.
- **Label:** a compact pill at the entry rail's left edge: side glyph + lots +
  floating P/L (`tabular-nums`, monospace stack).
- **Trade path (closed trades):** thin dashed polyline entry → exit, colored by
  outcome (`--up` if R ≥ 0, `--down` otherwise).

### Evaluation

- **Readability / cognitive load.** Excellent. Ink is proportional to relevance:
  a trade occupies exactly the chart region where it happened. Ten historical
  trades add ten local figures, not thirty full-width lines. The trader parses
  "where the trade lived" in a single fixation. Weakness: while a position is
  open, its stop/target rails end at the cursor, so projecting "where is my
  stop relative to future price action" requires following an implied line.
- **Replay usability / spatial awareness.** Strong. Zones grow bar-by-bar with
  the cursor — the replay's temporal progress is physically visible as the box's
  right edge advances. Nothing repaints outside the trade's span, so stepping
  is visually calm. The growing-edge metaphor already exists in today's trade
  boxes, preserving learned behavior.
- **Hierarchy vs candles.** Excellent by construction: 8% fills and 1px rails
  cannot compete with full-opacity candles; the overlay reads as background
  annotation, candles stay the hero (Information Architecture rank 1,
  DESIGN_SYSTEM §1).

## 2. Concept B — "Command HUD" (Sierra Chart-inspired, management-first)

### Description

Optimizes for managing the live position rather than narrating past ones.
Price levels stay chart-wide but nearly silent; the numeric truth lives in a
docked HUD widget, off the price canvas:

- **Guides:** full-width 1px dotted lines for SL/TP at 20% opacity that
  brighten to 60% on cursor proximity (hover affordance for dragging). Entry as
  a 1px solid line at 35%.
- **Zones:** none by default. Risk geometry is communicated by the HUD's R
  progress bar instead of painted area.
- **HUD:** a fixed widget docked to the panel's top-right corner (DOM, not
  canvas): side badge, lots, entry price, floating P/L in R and currency
  (`tabular-nums`), and a horizontal 1R progress bar (current excursion between
  −1R and +R-target). Rendered on `--surface-2`, `--radius-sm`, `--elevation-1`.
- **Markers:** as Concept A.
- **Closed trades:** collapse to markers + path only; no persistent zones.

### Evaluation

- **Readability / cognitive load.** Numeric precision is unbeatable — the HUD
  is a clean instrument cluster, and `tabular-nums` keeps it jitter-free. But
  spatial risk information is *displaced*: the trader must glance away from the
  candles to the corner widget and mentally re-project "−0.4R" back onto price
  space. That is a context switch on every management decision — measurable
  cognitive tax exactly when load is highest (position open, replay running).
- **Replay usability / spatial awareness.** Weak-to-medium. Full-width guides
  restore MT-style "where is my level relative to anything" at all times, which
  helps drag-management; but without zones the *history* of the trade leaves
  almost no spatial trace, and excursions (how deep did it go against me?) are
  invisible during replay unless the trader watches the HUD numbers.
- **Hierarchy vs candles.** Good on canvas (thin, low-opacity guides), but the
  HUD widget itself competes with the chart in rank — a persistent DOM panel
  sits at Information Architecture rank 2 territory and partially occludes
  candles in the corner. Full-width guides also resurrect a mild form of the
  MetaTrader anti-reference.

## 3. Concept C — "Path Narrative" (Bookmap/excursion-inspired, review-first)

### Description

Centers the trade's journey — the excursion path — as the primary artifact,
treating levels as secondary reference marks:

- **Path:** a per-bar polyline of close prices from entry to exit (or cursor),
  2px, colored segment-by-segment by sign of open P/L. MAE and MFE points get
  small tick markers (`--zone-risk` amber for MAE, `--up` for MFE).
- **Excursion shading:** the area between the path and the entry level is
  tinted (6% favorable / 6% adverse), making time-under-water literally visible.
- **1R ruler:** instead of zones, a slim vertical bracket at the entry bar
  marking one 1R unit of height; risk is a measuring stick, not an area.
- **Levels:** SL/TP as short end-capped segments (as in A).
- **Markers/label:** as Concept A.

### Evaluation

- **Readability / cognitive load.** For a *closed* trade under review, this is
  the richest single picture: path efficiency, excursions, and time-in-trade
  in one glance — exactly the deliberate-practice questions (MAE/MFE are already
  first-class domain facts, RFC-014 §3). But *while a trade is open* the
  segment-recolored path over live candles is noisy: it duplicates the candles'
  own shape one price-offset away, nearly doubling line density in the busiest
  region of the chart.
- **Replay usability / spatial awareness.** Mixed. The growing path gives
  superb temporal awareness in replay; but the excursion shading between path
  and entry repaints its whole area on every bar, and visually "flickers" sign
  changes on whipsaw bars — motion that conveys state changes the trader did not
  ask about (violates DESIGN_SYSTEM §2.4's "motion conveys state, not decoration"
  in spirit).
- **Hierarchy vs candles.** Poor while open: a 2px multi-colored polyline plus
  shading over the current price region *competes directly* with the candles.
  For historical trades it is acceptable but still heavier than A.

---

## 4. Comparison summary

| Criterion | A — Ghost Rails | B — Command HUD | C — Path Narrative |
| :--- | :--- | :--- | :--- |
| Readability / cognitive load | **Excellent** — local ink, one fixation | Precise numbers, but displaced spatiality | Excellent post-trade, noisy live |
| Replay usability / spatial awareness | **Strong** — growing edge, calm stepping | Weak history trace | Strong temporally, flickery shading |
| Hierarchy vs candles | **Excellent** — 8%/1px cannot compete | HUD competes as DOM rank-2 element | Path competes with live candles |
| Anti-reference risk (MetaTrader) | None | Mild (full-width guides) | None |
| Implementation fit (existing primitives) | High — evolves `TradeBoxesPrimitive` | Medium — new DOM widget + proximity states | Medium — new path primitive + area fills |

## 5. Selected direction

**Concept A — Ghost Rails — is the final direction**, with two scoped
adoptions from the other concepts:

1. **From B: the position label as a docked HUD chip** (not an on-price pill).
   A canvas pill glued to the entry rail occludes candles at the exact price
   region under management. Instead the label is a *minimal* DOM chip in the
   panel's top-right (side glyph, lots, floating P/L in R and currency,
   `tabular-nums`), on `--surface-2` with `--elevation-1`. Unlike B's full HUD
   it contains no progress bar and no duplicated level prices — small enough
   to stay at Information Architecture rank 2 without occluding meaningful
   chart area.
2. **From C: MAE/MFE ticks on the closed-trade path.** The dashed entry→exit
   path (already in A) gains two small tick marks at the MAE and MFE bars.
   These facts are already computed per trade (RFC-014 §3); surfacing them
   costs two 4px ticks and directly serves the deliberate-practice loop.
   The live excursion path and area shading from C are *rejected*: their
   hierarchy cost while open outweighs review value, and the Reflection Cabin
   already owns deep post-trade excursion analysis.

Rationale: A is the only concept that wins or ties on all three mandated
criteria, keeps every element inside the trade's own time span (ink
proportional to information), evolves the already-audited `TradeBoxesPrimitive`
geometry instead of introducing a parallel system (PHILOSOPHY §2.5), and has
zero anti-reference risk.

---

## 6. Design System integration (tokens and states)

New tokens to be registered in `DESIGN_SYSTEM.md` §2.1 (semantic extension;
base primitives `--up`/`--down`/`--accent` are NOT redefined). Canvas
primitives cannot read CSS custom properties at paint time; the authoritative
values below are mirrored into the chart color config at the ACL boundary
(`ChartModelMapper`), exactly as `tpZone`/`slZone` are today. The token table
is the single source of truth; the mapper constants cite it.

| Token | Value | Use |
| :--- | :--- | :--- |
| `--trade-zone-profit-fill` | `color-mix(in srgb, var(--up) 8%, transparent)` | Profit zone fill |
| `--trade-zone-loss-fill` | `color-mix(in srgb, var(--down) 8%, transparent)` | Loss zone fill |
| `--trade-zone-border` | 32% of the zone's base color | Zone 1px border |
| `--trade-rail-entry` | `var(--up)` / `--down` by side, solid 1px | Entry segment |
| `--trade-rail-guide` | 55% of `--up`/`--down`, dotted 1px | SL/TP segments |
| `--trade-path` | `--up` / `--down` by outcome, dashed 1px, pattern 4-3 | Closed-trade path |
| `--trade-marker-entry` | side color, 8px triangle, 1px `--bg` outline | Fill marker |
| `--trade-marker-exit` | outcome color, 7px diamond, 1px `--bg` outline | Exit marker |
| `--trade-excursion-tick` | MAE `--zone-risk`, MFE `--up`, 4px tick | Path MAE/MFE marks |
| `--trade-hud-bg` | `var(--surface-2)` | HUD chip background |
| `--trade-hud-radius` | `var(--radius-sm)` (6px) | HUD chip radius |

**Typography.** On-chart text (entry price on the axis, HUD chip figures):
`--text-2xs` (11px / 500) labels, monospace stack for all numbers,
`font-variant-numeric: tabular-nums` mandatory (DESIGN_SYSTEM §2.2).

**Interactive states** (per DESIGN_SYSTEM §3.2, applied to the overlay's
hit-targets):

| State | Behavior |
| :--- | :--- |
| `default` | Values above. |
| `hover` (zone or rail) | Zone fill 8% → 14%; border 32% → 60%; cursor `ns-resize` on draggable rails. Tooltip on `--surface-3`, `--elevation-2`, anchored to the rail (never cursor-following, §4.1). |
| `active` (dragging SL/TP) | Rail solid at 100% side color while dragging; zone re-extends live. |
| `selected` | Selection anchors: 4px radius circular handles in `--accent` at the rail's span endpoints — same idiom as drawing handles, one selection language everywhere. |
| `disabled / locked` | Closed trades are not draggable; no hover brightening, tooltip only. |
| `hidden` | Per-panel trade-layer toggle off → layer skipped at composition (no painted trace). |

**Motion.** Zone growth follows the replay cursor (state change, not
animation). Hover transitions 150ms; no entrance animations; crossfade only
when the whole layer toggles. `prefers-reduced-motion` inherits the global
rule (§5.5).

**Accessibility.** The HUD chip is DOM: it carries
`aria-label="Posición: compra 0.20 lotes, P/L flotante +0.8R"`-style labels
and updates via `aria-live="polite"`. Canvas overlay elements are decorative
duplicates of state that the HUD chip and trade panel already expose
textually.

---

## 7. Consequences for the RFC-017 design spec

- The overlay stays a **canvas capability concern** except the HUD chip
  (DOM, panel-scoped component) — the chip is the only element that needs
  Angular; everything else evolves `TradingCapability`'s primitives.
- Full-width price lines for SL/TP/entry (today's `createPriceLine` usage)
  are **retired** in favor of span-scoped rails inside the primitives; the
  price-axis keeps only the entry label of the focused live position.
- `syncTrades` (RFC-017 §5) gates whether group-linked panels showing the
  primary symbol render this layer; the per-panel layer toggle wins locally.
- Markers move from lightweight-charts' `createSeriesMarkers` (limited shapes,
  axis-locked) into the trade primitive for exact geometry control — evaluated
  during implementation; if `seriesMarkers` suffices visually, keep it (reuse
  audited machinery first, PHILOSOPHY §2.5).
