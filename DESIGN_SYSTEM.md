# Design System: Trading Emulator

The single source of truth for every visual, interaction, and accessibility decision
in the emulator. `DESIGN.md` remains the canonical base token registry; this document
extends it into a complete system that governs how surfaces are composed, how
visualizations behave, and how the trader moves through the application.

When a new feature RFC references this document, it does so by section (§2, §4, §6).
RFCs do not duplicate design decisions.

---

## 1. Vision

### The Focused Terminal

The emulator is a focused terminal, not a SaaS dashboard. The chart and its metrics
are the hero. Everything else recedes. The aesthetic is clean, dark, precise, and
professional. Emotional goals: instill focus, confidence, and clarity, avoiding the
anxiety of cluttered interfaces.

Anti-references: MetaTrader 4 (outdated, cluttered), Bloomberg 1995 (authentic but
visually obsolete), dashboards with decorative noise, any interface where the chart
is not the primary artifact.

### The Learning Loop

This is the architectural difference between a dashboard and a training instrument:

```
Observe → Detect Pattern → Open Evidence → Relive Trade
    → Reflect → Update Knowledge → Return to Analysis
```

- **Every visualization is actionable.** No dead charts. No dead metrics.
- **Every analytical insight must lead to evidence.** Clicking any data point that
  represents a trade navigates to that trade's Reflection Cabin.
- **The system observes and presents; the trader interprets and decides.**
- **Surfaces are task-specific.** One surface = one purpose. The Journal is for
  discovering patterns. The Reflection Cabin is for cognitive replay of a single
  trade. They are distinct, and navigation between them is intentional.

### Information Architecture

The hierarchy of visual importance is inviolable across every surface:

| Rank | Layer | Role |
|:-----|:------|:-----|
| 1 | Chart | Primary artifact. Always takes maximum visual weight. |
| 2 | Active trade | Current position/order state. |
| 3 | Metrics | Support the chart with physical facts. |
| 4 | Analysis | Support metrics with derived patterns (Journal). |
| 5 | Controls | Support navigation without competing for attention. |
| 6 | Metadata | Context only; never action. |

No surface may invert this hierarchy. A screen where the chart occupies one-third of
the space while cards fill the rest is a design violation.

### Interaction Principles

- Every visualization is actionable. Clicking a data point that represents a trade
  opens the Reflection Cabin for that trade.
- The system captures and presents physical facts. It never interprets, scores, or
  judges. Meaning lives exclusively in trader-authored content.
- Navigation is intentional, not accidental. Surfaces have clear entry and exit
  points. The flow between Journal and Reflection Cabin is a deliberate loop.
- The boundary between what the system shows (facts), what the interaction reveals
  (ephemeral conversation), and what the trader preserves (meaning) is formalized
  in `docs/architecture/EXPERIENCE_DOMAINS.md`; surfaces are projections of those
  domains, never domains themselves (its invariant X-2).
- Preference for keyboard-first interaction in data-dense surfaces. Mouse is
  available but never required.
- State changes are communicated through controlled transitions, never through
  surprise.

---

## 2. Foundations

### 2.1 Colors

**Base tokens** — defined in `DESIGN.md` and `styles.css`. These are the canonical
color primitives and must not be redefined by any surface:

| Token | Value | Role |
|:------|:------|:-----|
| `--bg` | `#000000` | Absolute canvas background |
| `--surface` | `#0a0a0a` | Panels, cards |
| `--surface-2` | `#181818` | Modals, elevated surfaces |
| `--surface-3` | `#1f1f1f` | Popovers, tooltips |
| `--border` | `#222222` | Subtle dividers |
| `--border-strong` | `#333333` | Hover/active emphasis |
| `--text` | `#d1d4dc` | Primary data and body text |
| `--text-muted` | `#787b86` | Secondary labels and metadata |
| `--accent` | `#2962ff` | Primary actions, focus rings, active states |
| `--accent-hover` | `#1e53e5` | Hover state for primary actions |
| `--up` | `#26a69a` | Profit, gains, upward movement |
| `--down` | `#ef5350` | Loss, downward movement |
| `--warning` | `#f0b90b` | Warnings, pending states |

**Semantic zone colors** — these categorize information domains in analysis surfaces
(Journal). They encode *what domain you are looking at*, never profit or loss.

| Token | Value | Domain | Applied to |
|:------|:------|:-------|:-----------|
| `--zone-performance` | `#10b981` | Results | Performance section: P&L, R-multiples, balance |
| `--zone-execution` | `#4a7dff` | Trade geometry | Execution section: scatter, duration charts |
| `--zone-behavior` | `#8b5cf6` | Patterns | Behavior section: seeks, manipulation, calendars |
| `--zone-risk` | `#f59e0b` | Risk | Risk metrics: MAE, drawdown, distance to SL |
| `--zone-temporal` | `#06b6d4` | Time | Time of Day performance |
| `--zone-rules` | `#eab308` | Playbook | Rule performance section |
| `--zone-reflection` | `#a8a29e` | Learning | Reflection Cabin accents |

**The Semantic Color Rule:**

> Zone colors encode domain. `--up` and `--down` are the **only** colors that encode
> profit or loss. When a Performance card (green `--zone-performance`) contains a
> losing trade (red `--down`), both colors coexist correctly: green says "you are
> viewing Performance," red says "this trade lost money." Neither color is wrong.
> Neither color is decoration.

Zone colors tint the section header, icons, and left-border accents of their
respective Journal sections. They are structural, never decorative.

**Palette for rule identification** — used in scatter plots, bubble charts, and
heatmaps to distinguish which Playbook rule a trade was declared under:

| Token | Value |
|:------|:------|
| `--rule-1` | `#5470c6` |
| `--rule-2` | `#91cc75` |
| `--rule-3` | `#fac858` |
| `--rule-4` | `#ee6666` |
| `--rule-5` | `#73c0de` |
| `--rule-6` | `#3ba272` |
| `--rule-7` | `#fc8452` |
| `--rule-8` | `#9a60b4` |
| `--rule-9` | `#ea7ccc` |

Trades with no declared rule use `--text-muted`.

### 2.2 Typography

One family: **Inter**. No display/body pairing. One well-tuned sans-serif carries
headings, buttons, labels, body, and tabular data.

| Scale step | Size | Weight | Use |
|:-----------|:-----|:-------|:----|
| `--text-2xs` | 11px | 500 | Labels, metadata, chart axis labels |
| `--text-xs` | 12px | 400 | Secondary data, timestamps |
| `--text-sm` | 13px | 400 | Default body, tabular data |
| `--text-base` | 14px | 400 | Body in reading surfaces (Reflection Cabin) |
| `--text-md` | 16px | 500 | Panel and card titles |
| `--text-lg` | 20px | 600 | Section titles |
| `--text-xl` | 22px | 600 | Page headers |

**Rules:**
- Fixed scale. No `clamp()` or fluid typography. Users view at consistent DPI.
- `font-variant-numeric: tabular-nums` on every dynamic numeric value (prices, P&L,
  R-multiples, percentages). This prevents layout jitter as digits change.
- `text-wrap: balance` on headings (`h1`–`h3`). `text-wrap: pretty` on prose.
- Line length: 65–75ch for prose; 120ch+ for data tables.
- Monospace stack for numerical readouts: `'Geist Mono', 'JetBrains Mono',
  'SFMono-Regular', ui-monospace, Menlo, Consolas, monospace`. Applied via
  `.font-mono` utility class.

### 2.3 Density Profiles

One design language. Four densities. Each surface declares its density profile via
a root CSS class that redefines a shared set of custom properties. Components use
`var(--density-gap)`, `var(--density-pad)`, `var(--density-font)`,
`var(--density-metric)`, `var(--density-heading)` — they are density-agnostic. The
surface controls the density.

| Profile | Surface | Gap | Pad | Font | Metric | Heading | Radius |
|:--------|:--------|:----|:----|:-----|:-------|:--------|:-------|
| `compact` | Journal | 8px | 8px | 12px | 13px | 16px | 4px |
| `comfortable` | Reflection Cabin | 16px | 16px | 13px | 14px | 20px | 6px |
| `reading` | Playbook | 16px | 16px | 13px | 14px | 20px | 10px |
| `forms` | Settings | 20px | 16px | 13px | 14px | 22px | 10px |

**Implementation pattern:**

```css
.journal-page {
  --density-gap: var(--space-2);
  --density-pad: var(--space-2);
  --density-font: var(--text-xs);
  --density-metric: var(--text-sm);
  --density-heading: var(--text-md);
  --density-radius: var(--radius-xs);
}

.reflection-cabin-page {
  --density-gap: var(--space-4);
  --density-pad: var(--space-4);
  --density-font: var(--text-sm);
  --density-metric: var(--text-base);
  --density-heading: var(--text-lg);
  --density-radius: var(--radius-sm);
}
```

### 2.4 Motion

Motion conveys state, not decoration. Every animation must answer: *what changed?*

- Transition duration: 150–250ms.
- Easing: `cubic-bezier(0.2, 0, 0, 1)` (ease-out-quart) for enter; `cubic-bezier(0.4, 0, 1, 1)`
  (ease-in) for exit.
- `@media (prefers-reduced-motion: reduce)` → `animation-duration: 0.01ms !important`
  and `transition-duration: 0.01ms !important` on all elements.
- No orchestrated page-load sequences. Product loads into a task; the trader does
  not wait for choreography.
- Crossfade (opacity transition) is the default reduced-motion fallback.

**Surface-specific motion:**
- Journal: 150ms on section expand/collapse, row hover highlight.
- Reflection Cabin: 180ms crossfade between timeline nodes when the frozen scene
  changes.
- Playbook: 120ms on save confirmation.
- Settings: instantaneous. Configuration is not a performance.

### 2.5 Spacing

8px base grid with half-step. Tokens defined in `DESIGN.md`:

`--space-1` (4px) · `--space-2` (8px) · `--space-3` (12px) · `--space-4` (16px) ·
`--space-5` (20px) · `--space-6` (24px) · `--space-8` (32px) · `--space-10` (40px)

### 2.6 Elevation

Flat by default. Shadows appear only as a response to state (hover, elevation, focus)
or when separating a modal from the canvas.

| Level | Token | Value | Use |
|:------|:------|:------|:----|
| 0 | `--elevation-0` | `none` | Resting panels |
| 1 | `--elevation-1` | `0 1px 2px rgba(0,0,0,0.4)` | Floating panels, resting cards |
| 2 | `--elevation-2` | `0 2px 8px rgba(0,0,0,0.45)` | Dropdowns, popovers |
| 3 | `--elevation-3` | `0 8px 28px rgba(0,0,0,0.55)` | Modals |

Border radius: `--radius-xs` (4px) · `--radius-sm` (6px) · `--radius-md` (10px) ·
`--radius-lg` (14px) · `--radius-pill` (999px) · `--radius-full` (50%).

Cards top out at `--radius-md` (10px). Full-pill is for tags and buttons only.
Radius ≥ 32px on cards is a design violation.

---

## 3. Components

### 3.1 UI Primitives

Defined in `ui-primitives.css`. All interactive surfaces use these. No surface may
invent its own button, input, badge, or tooltip.

| Primitive | CSS Class | Directive |
|:----------|:----------|:----------|
| Button | `.ui-btn` | `appButton` |
| Icon button | `.ui-icon-btn` | `appIconButton` |
| Input / Field | `.ui-input` | `appInput` |
| Badge / Chip | `.ui-badge` | `appBadge` |
| Tooltip | `.ui-tooltip` | `appTooltip` |
| Menu item | `.ui-menu-item` | — |
| Field group | `.ui-field` | — |
| Modal footer | `.modal-foot` | — |
| KBD | `.ui-kbd` | — |

### 3.2 Interactive States

Every interactive component must implement these states. Shipping a component with
only `default` and `hover` is incomplete.

| State | Requirement |
|:------|:------------|
| `default` | Resting visual. No feedback. |
| `hover` | Cursor is over the element. Distinct from default. |
| `focus-visible` | Keyboard-focused. `outline: 2px solid var(--accent)`, `outline-offset: 2px`. |
| `active` | Being pressed/clicked. Distinct from hover. |
| `disabled` | Not available. `opacity: 0.5`, `cursor: not-allowed`, `pointer-events: none`. |
| `loading` | Waiting for data. **Skeleton**, never a spinner in empty space. |
| `empty` | No data to display. Must teach the interface ("No trades in this session" with
  context), never abandon ("No results."). |
| `error` | Recoverable failure. Actionable message, not a red banner. |

**Surface-specific states:**

Journal:
- `trade-without-reflection` — no `✎` indicator.
- `trade-with-reflection` — shows `✎` indicator.
- `rule-without-trades` — "No trades declared under this rule in this session."
- `session-without-trades` — empty state with context.
- `insufficient-data` — "At least 3 trades are required to render this visualization."

Reflection Cabin:
- `scene-loading` — skeleton in the mini-chart area.
- `node-without-data` — a timeline node that has no corresponding telemetry event
  (e.g., no seeks → no Mgmt node). The node is absent, not grayed out.
- `reflection-existing` — pre-filled fields with subtle green left-border.
- `reflection-saving` — save button in loading state.
- `reflection-saved` — brief toast + automatic redirect to Journal.

---

## 4. Data Visualization

### 4.1 Shared Principles

- **Canvas:** `--viz-grid` (`#1a1a1a`) — lighter than `--bg` to distinguish the
  visualization area from the chart canvas.
- **Grid lines:** `--viz-axis` (`#333333`) — subtle, structural. Never compete with
  data points.
- **Axes:** `--text-muted` color. No decoration. No arrowheads. No 3D.
- **Tooltip:** rendered on `--surface-3` with `--elevation-2`. Anchored to the data
  point, never follows the cursor.
- **Colors:** points and cells use the rule palette (§2.1) when encoding rule
  identity, or `--up`/`--down` when encoding profit/loss.
- **Motion:** crossfade on data change, never morph or animate-in. Data
  visualizations are static artifacts, not live dashboards.
- **No gradients.** No 3D effects. No shadows on data elements.
- **Accessibility:** every visualization has a descriptive `aria-label`. Tabular data
  alternatives are provided where practical.

### 4.2 Scatter (MAE vs MFE)

- **Axes:** X = MAE (in R), Y = MFE (in R). Origin at (0,0) always visible.
- **Points:** 6px radius, opacity 0.85. Color = rule palette (`--rule-1` through
  `--rule-9`). No rule = `--text-muted`.
- **Reference lines:** dashed identity line (MAE = MFE) and axes at zero.
- **Hover:** tooltip showing trade #, date, R-multiple, declared rule.
- **Click:** navigates to `/journal/:sessionId/reflect/:tradeId`.

### 4.3 Bubble (Duration vs R)

- **Axes:** X = trade duration (bars), Y = R-multiple.
- **Bubble radius:** proportional to number of seeks. Min radius 4px, max 20px.
- **Color:** rule palette.
- **Hover:** tooltip showing trade #, duration, R, seeks, rule.
- **Click:** navigates to Reflection Cabin.

### 4.4 Heatmap (Trade Calendar)

- **Axes:** X = trade sequence number within session, Y = session (for single
  session: 1 row).
- **Cell color:** diverging scale. Green intensity for positive R, red intensity
  for negative R. Neutral gray for R ≈ 0.
- **Cell size:** uniform within the row.
- **Hover:** tooltip showing trade #, R, rule.
- **Click:** navigates to Reflection Cabin.

### 4.5 Timeline (Reflection Cabin)

- **Orientation:** horizontal, centered above the frozen scene chart.
- **Nodes:** 5 waypoints — Entry · Management · Maximum Adverse Excursion ·
  Maximum Favorable Excursion · Exit.
- **Dynamic visibility:** a node is rendered only if its corresponding telemetry
  data exists. A trade with zero seeks has no Management node. A trade where MAE
  coincides with exit merges those nodes.
- **Management node:** expandable. When ≥2 seeks exist, clicking the node expands
  a sub-timeline showing individual seek events with type (SL tighten, SL widen,
  TP move) and timestamp.
- **Active node:** filled with `--accent`, outer ring `0 0 0 3px
  color-mix(in srgb, var(--accent) 40%, transparent)`. A dotted vertical connector
  line links the active node to the frozen scene chart.
- **Inactive node:** `--timeline-connector` (`#444444`).
- **Connector line:** `--timeline-connector` (`#333333`), 2px stroke.
- **Interaction:** click a node to select it. The frozen scene crossfades (180ms).
  Keyboard: `1`–`5` keys mapped to nodes (Entry = `1`, Exit = `5`).
- **Facts panel below each node:** context-dependent. Only information that would
  have been visible at that moment in the trade is shown (e.g., Entry shows entry
  price and initial risk; MAE shows current drawdown; Exit shows final result).

### 4.6 Future Visualization Types

This section will grow. When it exceeds reasonable document size, extract to
`DATA_VISUALIZATION.md` and reference it from here. Expected future types:
equity curve, distribution histograms, expectancy charts, drawdown profiles,
Monte Carlo simulations, rule dependency graphs.

### 4.7 On-Chart Trade Language (TEDS)

Everything a trade draws on a chart pane — primitives, ink levels, hue policy,
text policy, reveal states, zoom collapse — is governed by
`docs/architecture/TEDS_GRAMMAR.md`, not by this section. Which information may
appear on the pane at all is governed by
`docs/architecture/EXPERIENCE_DOMAINS.md`.

Registration hold (2026-07-19): the trade-layer token table proposed in
`docs/superpowers/specs/2026-07-16-rfc-017-trade-visualization-concepts.md` §6
was superseded before registration (see that document's supersession note) and
**must not be added to §2.1**. TEDS token integration (typography and palette for
the pane grammar) is pending and will enter through the §6.4 evolution procedure
— written justification, contrast verification (§5.1), and review against the
Information Architecture hierarchy (§1). Until then, `DESIGN.md` base tokens
remain the only registered values.

Motion-token integration (2026-07-22): the TEDS motion layer (Phase 4/5, ratified —
`docs/architecture/TEDS_MOTION.md`) reuses the wired duration/easing ladder and adds
exactly **two** tokens, registered here via §6.4 (justification: TEDS-D22, exit ≤ entry;
opacity-only, so `prefers-reduced-motion` §5.5 degrades them by construction — no
contrast impact):

| Token | Value | Role |
| :--- | :--- | :--- |
| `--duration-exit` | `80ms` | Every leaving mark (exit is faster than entry) |
| `--ease-linear` | `linear` | Geometry-truth canvas interpolation only (never CSS UI transitions) |

`--duration-base` stays **180ms** — Phase 4's proposed "re-anchor 140→180" is a no-op
(`styles.css` already defines it at 180ms). `TEDS_MOTION.md` is the authority for how
these tokens choreograph; the `styles.css` / `ui-primitives.css` edits land at
implementation time, not here.

---

## 5. Accessibility

### 5.1 Contrast

| Pairing | Ratio | Grade | Status |
|:--------|:------|:------|:------|
| `--text` on `--surface` | 11.3:1 | AAA | Pass |
| `--text-muted` on `--surface` | 4.6:1 | AA (large) | Review for body text |
| `--accent` on `--bg` | 5.2:1 | AA | Pass |
| `--up` on `--surface` | 4.8:1 | AA | Pass |
| `--down` on `--surface` | 4.8:1 | AA | Pass |
| `--zone-performance` on `--bg` | 5.0:1 | AA | Pass |
| `--zone-execution` on `--bg` | 5.1:1 | AA | Pass |
| `--zone-behavior` on `--bg` | 4.6:1 | AA | Review for body text |
| `--zone-risk` on `--bg` | 5.5:1 | AA | Pass |
| `--zone-temporal` on `--bg` | 4.8:1 | AA | Pass |
| `--zone-rules` on `--bg` | 5.7:1 | AA | Pass |
| `--zone-reflection` on `--bg` | 4.5:1 | AA | Borderline |

All zone colors are verified against `--surface` (`#0a0a0a`) for section headers
and accent borders. When used as text on `--bg`, `--zone-behavior` and
`--zone-reflection` require larger font sizes (≥14px bold or ≥18px) for AA
compliance. Prefer using zone colors for borders, icons, and headers rather than
body text.

### 5.2 Keyboard Navigation

Every surface defines its keyboard map. No surface is mouse-only.

**Journal:**
| Key | Action |
|:----|:------|
| `Tab` | Move between sections |
| `↑` `↓` | Navigate rows within a table or list |
| `Enter` | Open Reflection Cabin for selected trade |
| `Escape` | Return to session catalog |

**Reflection Cabin:**
| Key | Action |
|:----|:------|
| `↑` `↓` | Navigate between trades in the trade list |
| `1`–`5` | Select timeline node (Entry = 1, Exit = 5) |
| `Tab` | Move between reflection form fields |
| `Enter` | Submit reflection |
| `Escape` | Return to Journal |

**Playbook:**
| Key | Action |
|:----|:------|
| `↑` `↓` | Navigate between rules |
| `Enter` | Edit selected rule |
| `1`–`9` | Assign shortcut slot to selected rule |
| `Escape` | Cancel editing |

**Settings:**
| Key | Action |
|:----|:------|
| `Tab` | Natural form navigation |
| `Enter` | Submit current field |
| `Escape` | Close panel |

**Global:**
| Key | Action |
|:----|:------|
| `Escape` | Close any modal or panel |
| `Ctrl+K` / `Cmd+K` | Command palette (future) |

### 5.3 Focus Management

- `focus-visible` on every interactive element. Ring: `2px solid var(--accent)`,
  `outline-offset: 2px`.
- Tab order follows visual order (DOM = visual). No `tabindex` hacks.
- No focus traps except in modals. Modal focus trap returns focus to the trigger
  element on close.
- Page navigation sets focus to the main content heading (`h1`).

### 5.4 Screen Reader

- All visualizations have `aria-label` describing what is shown, not how it looks
  (e.g., "Scatter plot: MAE vs MFE for 12 trades. Each point is a trade. Select
  a point to open its detailed replay.").
- Data tables use `<caption>` and `<th scope="col|row">`.
- Timeline uses `role="tablist"` with `role="tab"` per node and `aria-selected`
  on the active node.
- Metrics include context in their accessible name ("Profit Factor: 1.85", not
  bare "1.85").
- Reflection form fields are labeled. "What happened?" is a visible label, not a
  placeholder.

### 5.5 Motion

- `@media (prefers-reduced-motion: reduce)` sets `animation-duration: 0.01ms
  !important` and `transition-duration: 0.01ms !important` globally.
- No animation is essential to understanding information. All animated states
  have a static equivalent.
- No parallax, no scroll-jacking, no infinite animations.

---

## 6. Governance

### 6.1 Authority

This document is the single source of truth for all visual, interaction, and
accessibility decisions in the emulator. When a conflict arises between a
feature specification and this document, this document wins.

`DESIGN.md` remains the canonical registry of base design tokens. This document
extends `DESIGN.md` with semantic colors, density profiles, visualization rules,
interaction patterns, and accessibility requirements. They are complementary,
not competing.

### 6.2 Stability

- **Existing components cannot change visual behavior without an RFC.** A
  component's default appearance is part of its contract.
- **New components inherit existing primitives.** No ad-hoc button, input, or
  tooltip variants. If a surface needs a new variant, the primitive system is
  extended, not bypassed.
- **Design debt must be documented.** Any visual inconsistency discovered during
  review is recorded as a comment in the relevant CSS file with the prefix
  `DESIGN-DEBT:` and a reference to the issue.
- **No ad-hoc component variants.** `.ui-btn--special`, `.ui-input--custom`, and
  similar one-off classes are forbidden. If a genuine need exists, propose a
  permanent addition to `ui-primitives.css` with justification.

### 6.3 RFC Integration

Feature RFCs reference this document by section number. They do not duplicate
design decisions.

Example: *"The Journal page must follow the `compact` density profile (§2.3). Its
sections use semantic zone colors (§2.1). All visualizations must be interactive
(§4) and meet accessibility requirements (§5)."*

The RFC describes **what** is built and **why**. This document describes **how**
it looks, feels, and behaves.

### 6.4 Evolution

Changes to this document require:
1. Written justification for the change.
2. Contrast verification for any new or modified colors (§5.1).
3. Confirmation that no existing density profile is broken (§2.3).
4. Review against the Information Architecture hierarchy (§1).

**When a new surface is introduced:** define its density profile (§2.3), its
keyboard map (§5.2), and any new visualization types (§4). If the surface
introduces a new information domain, define its semantic zone color (§2.1).

**When Data Visualization exceeds reasonable size:** extract to
`DATA_VISUALIZATION.md`. This document references it; feature RFCs may reference
either document.

**When a new technology constraint emerges** (e.g., adopting a component library):
revise §3.1 (UI Primitives) to define the mapping between the design system's
primitives and the library's components. No surface may bypass the design system
to use library components directly.

### 6.5 Verification Checklist

Before any feature branch is merged, verify:
- [ ] All interactive components cover the 8 required states (§3.2).
- [ ] All numeric values use `tabular-nums`.
- [ ] No component exceeds `--radius-md` (10px) unless it is a pill or circle.
- [ ] No gradient text, no side-stripe borders, no glassmorphism decoration.
- [ ] All colors meet contrast minimums (§5.1).
- [ ] `prefers-reduced-motion` is respected (§5.5).
- [ ] Keyboard navigation is complete per surface (§5.2).
- [ ] Every visualization is clickable and navigates to evidence (§1, §4).
- [ ] No surface inverts the Information Architecture hierarchy (§1).
- [ ] Density profile is applied correctly per surface (§2.3).

---

## References

- `DESIGN.md` — base token registry (colors, typography scale, spacing, radius,
  elevation values, component specifications).
- `PRODUCT.md` — brand personality, anti-references, design principles.
- `styles.css` — CSS custom property definitions for all base tokens.
- `styles/ui-primitives.css` — global CSS classes for shared UI components.
- `docs/architecture/TRADER_KNOWLEDGE_MODEL.md` — S1/S2 stances (the system
  observes; the trader interprets).
- `docs/architecture/TEDS_GRAMMAR.md` — normative grammar for everything a trade
  draws on a chart pane (§4.7).
- `docs/architecture/EXPERIENCE_DOMAINS.md` — Market/Trade/Conversation/Knowledge
  information boundaries.
