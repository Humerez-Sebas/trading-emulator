# Product Principles

| Field | Value |
| :--- | :--- |
| Status | Normative (living document) |
| Date | 2026-07-09 |
| Stage | 4 of the Engineering Knowledge Roadmap |
| Relationship to other documents | `PRODUCT.md` defines brand and anti-references; `DESIGN.md` defines visual tokens. This document defines the *interaction and cognition principles* that both serve. On visual token questions, `DESIGN.md` wins; on brand voice, `PRODUCT.md` wins |
| Upstream sources | `TRAINING_WORKFLOW.md` (cognitive model, frictions), `strategic_audit.md` Parts 2-4 (trader/UX findings), `PRODUCT.md`, `DESIGN.md`, `docs/engineering/domain/replay-trading.md` (frozen UI split) |

---

## 1. The Governing Model: the UI Manages Attention, Not Pixels

The training domain establishes that a practice session is a sequence of *cognitive
states* — Active Waiting, Setup Confirmation, Position Management — each with a
distinct attention budget. The product's single job is to protect whichever state the
trader is in. Every principle below is an application of that job; every future UI
decision must be justifiable against one of these principles by name.

The brand frame is the **Focused Terminal** (`DESIGN.md`): professional, dark,
technical, objective. The named anti-reference is MetaTrader-style clutter and the
"casino layout" of retail platforms.

---

## 2. Principles

### P1 — The Chart Is the Hero

The chart and its metrics carry maximum visual weight; everything else recedes.
Structural chrome uses subtle borders on flat surfaces (never shadows on structural
sidebars); floating elements alone may cast shadows. No component may compete with
the chart for attention at rest.

### P2 — Visual Hygiene

Every pixel must earn its attention cost. Concretely:

- Signal Blue is reserved for interaction (active states, focus); never decorative.
- No glowing text, no gradients-as-decoration, no ambient animation.
- Up/down colors (`#26a69a` / `#ef5350`) carry exactly one meaning: direction and
  profit/loss semantics. They are never reused for unrelated states.
- Empty space is a feature: clarity over density (`PRODUCT.md`); dense tables get
  breathing room rather than compression.

### P3 — Serve the Cognitive State (asymmetric interaction)

The interface must recognize that the trader's dominant state is *observation, not
action* (Active Waiting), punctuated by short high-focus phases:

- **Waiting phase:** high-speed advancement must be effortless — autoplay with
  adjustable speed, auto-repeat stepping, configurable jumps (`jumpSize`), and,
  as future work, operative-window-aware fast advance.
- **Evaluation phase:** deceleration must be one gesture away — Replay Resolution
  (intrabar grain) engages without leaving the chart or losing the formed context.
- **Management phase:** open-position information (floating P/L, levels) overlays
  the chart rather than pulling the eye to a side panel.

A control scheme that imposes uniform pacing across these states violates the domain.

### P4 — Interaction Economy (anti click-fatigue)

Named pain points from the training workflow: repetitive manual clicks to traverse
inactive periods, and overshoot at high speed. Rules:

- Any navigation the trader performs more than a few times per minute must be
  keyboard-reachable and auto-repeat capable.
- Overshoot must be cheap to correct: fine backward alignment ("retreat for
  chronological precision") is a first-class gesture, not a menu action.
- The distinction between *simulating* motion (steps, jumps — fills processed) and
  *viewing* motion (seek — teleportation) must be legible in the control itself;
  a trader must never wonder whether the market "happened".
- Adopt fluid keyboard shortcuts (audit: the one thing worth copying from
  TradingView); never require pointer precision for temporal navigation.

### P5 — Scale Integrity (the two-channel rule)

Multi-timeframe analysis requires *decoupled* navigation by default: each panel owns
its X/Y scales so that macro and operative reading are never distorted by a foreign
zoom level. Synchronization is an intermittent, opt-in bridge (Link Group crosshair
sync) used to verify intersection, then released. Consequences:

- Never introduce global forced range synchronization.
- Price-scale sync remains reserved-unimplemented until an RFC activates it.
- Crosshair bridging must be visually quiet (a reference line, not a highlight
  show).

### P6 — Numeric Legibility

Financial numbers are the product's payload. All dynamic numerics use
`tabular-nums` (the Tabular Rule, `DESIGN.md`) so digits never jitter layout. High
contrast per WCAG AA is an absolute floor on dark surfaces, prioritized for chart,
metrics, and text (`PRODUCT.md`). The R-multiple is a first-class display unit
alongside currency: practice analytics read in R.

### P7 — Simulation Honesty Is a UX Feature

Trust in execution fidelity is the product's central asset (audit conclusion). The
interface must therefore *disclose* rather than smooth over model limits:

- Ambiguous exits (`ClosedTrade.ambiguous`) are visibly flagged in history and
  counted in session summaries — never hidden.
- Session-end force-closures are visually distinct from SL/TP outcomes.
- End-of-data and scheduled-session-end states announce themselves explicitly.
- When spread/commission simulation arrives (RFC-014 draft), its assumptions are
  shown, not buried in settings.

### P8 — Risk-First Order Entry

The order ticket embodies the Risk Invariant: the trader edits risk (percent or
currency) and SL geometry; lot size is a derived, read-only consequence
(`lotsForRisk`). Placing and adjusting SL/TP is direct manipulation on the chart
(visual risk positioning — drag the levels), with the risk/reward geometry updating
live. An editable lots field would violate the domain and is forbidden.

### P9 — Progressive Complexity

Cold start is deliberately mono-panel (one tab, template `'1'`, active asset M1 —
decision D2): first launch looks like a focused single-chart terminal. Multi-panel
workspaces, tabs, link groups, and templates are opt-in, bounded (single-level grid,
eight panels per tab), and non-destructive (template = lens: shrinking parks panels,
growing restores them in place). Density is always the trader's choice, never the
default.

### P10 — Focus Preservation (frozen UI split)

Frozen with the owner (`replay-trading.md`): the top bar carries *context only*
(symbol, timeframe); the floating Playback HUD owns *all* backtesting navigation;
floating P/L is a chart overlay. Session metrics follow the Focused Terminal
register. Modals are reserved for genuine decisions (session summary); side panels
recede when unused. New features must find their home within this split rather than
adding chrome.

### P11 — Automatic First, Annotation Optional

For the journaling roadmap (Mastery Block Phase 3): records are captured
automatically at domain events (trade closed, session ended); subjective annotation
(tags, notes, self-critique) is always optional enrichment. The named
anti-reference is mandatory 20-field-per-trade classification (audit: Edgewonk's
burden). A journal the trader must feed manually is a journal that dies in a week.

`TRADER_KNOWLEDGE_MODEL.md` sharpens this principle into two binding stances:
telemetry capture is passive and invisible during practice, with annotation
existing only in cold review (S2); and the system presents facts without ever
interpreting them — no system-authored judgments, scores, or verdicts about the
trader's behavior (S1).

### P12 — Alert Without Alarm

Warnings use Caution Gold and measured emphasis; state changes announce themselves
once, without strobing. Even hard limits (future challenge-mode drawdown boundaries)
signal with clear persistent indicators rather than panic effects — this is a
training instrument, not a slot machine. Motion respects reduced-motion preferences;
long-session ergonomics (hours of replay) outrank momentary spectacle.

---

## 3. Interaction Vocabulary (canonical gestures)

| Intent | Canonical interaction | Principle |
| :--- | :--- | :--- |
| Traverse dead time | autoplay speed / jump forward (5/10/50) / auto-repeat step | P3, P4 |
| Correct an overshoot | step back / jump back (review-only, clearly non-simulating) | P4, P7 |
| Inspect candle formation | Replay Resolution grain selection; forming-candle progress reads as a time range | P3 |
| Verify macro/operative intersection | momentary Link Group crosshair bridge | P5 |
| Place a trade | on-chart level placement; risk input; derived lots display | P8 |
| Manage a position | drag TP freely; SL tightening only (asymmetric management) | P8, P7 |
| Review a session | summary modal with stats in R and currency, ambiguous count visible | P6, P7 |

---

## 4. Accessibility and Ergonomics

- WCAG AA contrast minimum on all text and data against dark surfaces; charts and
  metrics get priority contrast tuning (`PRODUCT.md`).
- Long-session ergonomics govern: no element may demand sustained precise pointing
  for a frequent action (P4); type sizes follow `DESIGN.md` hierarchy with 13 px
  body as the working floor.
- All color semantics must survive a color-vision-deficiency check: direction is
  never encoded by hue alone (shape/position redundancy on markers).
- Keyboard reachability for the full replay-navigation vocabulary is a requirement,
  not an enhancement.

---

## 5. Anti-References (what this product refuses to be)

Consolidated from `PRODUCT.md` and the audit's comparison table:

1. MetaTrader-style density: cluttered toolbars, nested menus, decade-old chrome.
2. TradingView's social sidebar: no feeds, no noise around the chart.
3. Cloud-replay latency patterns: interaction must never wait on a network
   round-trip during replay (offline-first is a UX principle, not just an
   architecture).
4. Analytics-tool table walls: human-readable summaries first, dense grids on
   demand.
5. Mandatory classification bureaucracy: see P11.

---

## 6. How Future Work Consumes This Document

Every future RFC or spec with a UI surface must include a "Principles" line citing
which of P1-P12 the design serves and, where trade-offs exist, which principle was
subordinated and why. UI review checks against this document the same way code
review checks against `CLAUDE.md` invariants. Amendments to the principles follow
the same PR discipline as `PHILOSOPHY.md`: a new principle arrives with the friction
or evidence that motivated it.
