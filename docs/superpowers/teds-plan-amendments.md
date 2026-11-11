# TEDS Implementation Plan — Amendments from RFC-018

| Field | Value |
| :--- | :--- |
| **Amends** | `docs/superpowers/specs/2026-07-TEDS-implementation-plan.md` ("TEDS Phase 2 + Conversation Layer") |
| **Source** | `docs/architecture/rfcs/018-trade-visibility-refinement.md` (D18.A–D, T-1..T-4, F3) |
| **Date** | 2026-07-26 |
| **Status** | Normative over the TEDS plan on the points below. Everything not named here is unchanged. |

RFC-018 does not compete with the TEDS plan — it **removes work from it** and closes
two gaps the plan would otherwise have hit at execution time. This document records
exactly what changes, so the TEDS run does not re-derive it.

---

## A1 — The trade-layer gating predicate leaves the TEDS plan

**Amends:** plan preamble, line ~35.

> Current text: *"the architectural parts of that plan (gating `syncTrades` §5.1,
> composition) are untouched."*

**Replace with:** *the architectural parts of RFC-017 (composition) are untouched; the
trade-layer gating predicate has moved to RFC-018 and is **implemented before this plan
starts** (RFC-018 Task 3). This plan consumes it, never re-derives it.*

Rationale: RFC-017 §13 point 2 deferred §5.1's predicate to "the TEDS plan". RFC-018
takes it back, in simplified form:

| | Deferred form (RFC-017 §5.1) | RFC-018 form |
| :--- | :--- | :--- |
| Clauses | `symbol === primary` ∧ (`unlinked` ∨ `group.syncTrades`) | `symbol === primary` ∧ `!panel.hideTrades` |
| Mapper inputs | 4 (`descriptor`, `currentAsset`, `groups`, trade view) | **3** (`descriptor`, `currentAsset`, trade view) |
| Group lookup | required | **none** |
| Home | undefined | `panelRendersTrades()` in `layout.models.ts` |

**Net effect on the TEDS plan: one less thing to build, and one fewer memo input on the
hottest per-panel stream.**

---

## A2 — The gating predicate must **migrate** to `tradeObjects$`, not die with `tradeChartView$`

**Amends:** Phase 3 Task 4 (`trade-object-builder.ts` + `ChartModelMapper.tradeObjects$`)
and Phase 4 Task 6 (dismantling).

This is the highest-risk interaction between the two workstreams and must not be missed.

- RFC-018 Task 3 installs `panelRendersTrades` as the gate on **`tradeChartView$`**.
- TEDS Phase 4 Task 6 explicitly *"drop[s] … the `tradeChartView$` stream (superseded by
  `tradeObjects$` + direct slices)"*.

**Deleting `tradeChartView$` without carrying the gate forward silently repeals T-1 and
T-2.** An observation panel would resume painting the primary symbol's trades on a
foreign price axis, and `hideTrades` would become dead state.

**Required amendment to Phase 3 Task 4:** `tradeObjects$` is gated by
`panelRendersTrades(descriptor, currentAsset)` from its first commit. When the predicate
is false the stream emits a **stable frozen empty array** (never a fresh `[]` per
emission — TPL-D4's legacy/TEDS narrowing must not reintroduce per-tick allocation).

**Required amendment to Phase 4 Task 6:** add an acceptance step — *"`tradeChartView$` may
only be deleted once `tradeObjects$` carries the RFC-018 gate; the RFC-018 gating specs
are re-pointed at `tradeObjects$`, not deleted."*

**Required amendment to Task 7 (invariant audits):** add the T-1 detector to the audit
list — a grep proving no trade-render path consumes trading slices without passing
through `panelRendersTrades`.

---

## A3 — F3 (per-panel trade geometry) becomes a **prerequisite** of TEDS Phase 2

**Amends:** Gap Analysis, and the Phase 2 entry condition.

RFC-018 §7 records a defect independent of gating: `selectTradeMarkers` and
`selectTradeBoxes` derive from `selectActiveCandles`, the **global active TF** series.
A panel on H1 receives markers snapped to the global (typically M1) grid **today**.

The TEDS plan's Gap Analysis names gaps A–D but not this one, because it is invisible
until you render per panel — which is exactly what TEDS does. TEDS Phase 2 renders Nodes
at price-time coordinates; if those coordinates come from another panel's timeframe
grid, the Nodes land on the wrong bars and the whole grammar inherits the error.

**Add to the Gap Analysis:**

| Gap | Evidence | Closed by |
| :--- | :--- | :--- |
| **E — Trade geometry is derived at the global active timeframe, not the panel's.** `selectTradeMarkers` snaps via `selectActiveCandles`; `selectTradeBoxes` shares that provenance. A panel at H1 gets M1-snapped marks. | `state/selectors.ts` (`selectTradeMarkers`, `selectActiveCandles`) | **RFC-018 Task 5 (F3), before this plan** |

**Entry condition for Phase 2:** F3 has landed. TEDS renders correct per-panel geometry
or it renders a prettier version of the same error.

**Scope reduction for Phase 4 Task 6:** its selector-deletion step
(*"delete `selectTradeMarkers`, `selectTradeBoxes`, `selectTradeChartView`"*) becomes
smaller — F3 will already have moved the pane's derivation into the mapper, so Task 6
deletes selectors that no longer feed the render path. `selectClosedTradeBoxes` and
`selectTradeBoxesVisible` still survive, as the plan already says.

---

## A4 — T-3 (execution guard) is shippable **now**, independent of TEDS

**Amends:** Non-Goals / scope boundary.

RFC-018 D18.D guards the four pane-originated trading verbs (`handleContextMenu`,
`finishPlacing`, `dragTradeLine`, and the cancel/close dispatches) with
`panelMayExecute`. It touches `chart.component.ts` only, needs no conversation slice, no
DTO, and no engine change.

**It must not be folded into the TEDS run.** It is a fill-fidelity fix (RFC-017 §5.1
declared the rule; nothing enforced it) and should ship on the RFC-018 branch, ahead of
everything else.

**Add to the TEDS plan's Non-Goals:** *"The T-3 execution guard (RFC-018 D18.D) — already
shipped on the RFC-018 branch; this plan neither implements nor relaxes it. Phase 3
Task 5's interaction wiring must preserve it: any new pane-originated trading verb
inherits the `panelMayExecute` guard."*

---

## A5 — TEDS-D18 needs `originPanelId` on the anchor (gap in the current plan)

**Amends:** Phase 1 Task 1 (`state/conversation/` feature slice).

RFC-018 registers **T-4** (selection origin is Conversation state, 0..1 per workspace,
never persisted) but explicitly **excludes it from RFC-018's scope** (RFC-018 §6) — it
belongs here.

Verified gap: the plan's `TradeAnchor` is `{ tradeId, kind }`. It carries **no panel
identity**. TEDS-D18 requires distinguishing the *gesture panel* (full subtract +
embody) from every *witness panel* (luminance halo only, no dimming, no chips). With the
current anchor shape that distinction is not expressible, so TEDS-D18 cannot be
implemented as planned.

**Required amendment:**

```typescript
export interface TradeAnchor {
  tradeId: string;
  kind: TradeAnchorKind;
  /** TEDS-D18 / RFC-018 T-4: the panel the gesture came from. Conversation-domain, never persisted (X-1 / INV-12). */
  originPanelId: string;
}
```

Constraints that travel with it:

- **Never persisted.** It is a Conversation fact; Task 7's INV-12 / X-1 persistence-grep
  detector already covers the slice and now covers this field by construction.
- **Not a panel of execution.** RFC-018 §2.5 rejects that concept outright. This field is
  about *what the trader is currently asking*, changes only on selection gestures, and
  has zero loss cost. It must never be read by any trading verb, any persistence path, or
  any render decision other than origin-vs-witness.
- **Stale-id tolerance** follows TPL-D1: an anchor whose `originPanelId` no longer exists
  (panel closed while selected) degrades to *all panels are witnesses* at derivation
  time; the reducer stays pure and total.

**Witness set, now expressible with no additional state:**

```
witnesses = { p : panelRendersTrades(p, primarySymbol) } \ { anchor.originPanelId }
```

---

## A6 — TPL-D8 keyboard roster is gated by the RFC-018 predicate

**Amends:** TPL-D8 (read-only keyboard reachability).

> Current text: *"`Tab`/`Shift+Tab` cycles the focused panel's Trade Objects in
> chronological `entryTime` order…"*

**Add:** *…where the focused panel's roster is empty whenever
`panelRendersTrades(descriptor, primarySymbol)` is false. A panel showing another symbol
(T-1) or with its trade layer hidden (T-2) exposes no Trade Objects to the keyboard —
reachability never exceeds visibility.*

Rationale: TEDS-D19 is *read* reachability. Tabbing to an object that is not drawn would
create an invisible focus, violating FP-2 (no trade datum without an on-chart anchor
traceable by eye). No new state: the roster is `focusedPanelId` (existing) ∩
`panelRendersTrades` (RFC-018).

---

## A7 — Documentation references to `syncTrades`

Three normative documents cite `syncTrades` as the gating substrate. RFC-018's branch
updates them; the TEDS run must not re-introduce the old wording.

| File | Current | Becomes |
| :--- | :--- | :--- |
| `TEDS_INTERACTION.md` §7 | *"`RFC-017` — panel composition and the `syncTrades` gating that decides where a Trade Object may render (the substrate for §3.7 multi-panel echo)."* | *"`RFC-017` — panel composition. `RFC-018` — the T-1/T-2 gating that decides where a Trade Object may render (the substrate for §3.7 multi-panel echo); T-4 registers the selection-origin invariant this section relies on."* |
| `EXPERIENCE_DOMAINS.md` §7 | *"**RFC-017** — panel composition serves the Market/Trade render path; `syncTrades` gates where the Trade domain may speak."* | *"**RFC-017** — panel composition serves the Market/Trade render path. **RFC-018** — T-1 (symbol invariant) and T-2 (panel-local preference) gate where the Trade domain may speak; T-4 places selection origin in the Conversation domain."* |
| `TEDS_GRAMMAR.md` §10 | *"…the panel gating predicate (RFC-017 §5.1), and `syncTrades` composition (RFC-017 §5) — all consistent with this grammar."* | *"…the panel gating predicate (RFC-017 §5.1, refined by RFC-018 into T-1 ∧ T-2; `syncTrades` retired by D18.A) — consistent with this grammar."* |

Also update `TEDS_GRAMMAR.md` §2 ("Does not govern") — the bullet naming *"Panel
composition, sync channels, and the trade-layer gating predicate — RFC-017 §2–§5"* should
read *"— RFC-017 §2–§5 and RFC-018"*.

---

## Summary of net effect on the TEDS plan

| | Change |
| :--- | :--- |
| **Removed** | Deriving the gating predicate (A1) |
| **Removed** | Part of Phase 4 Task 6's selector-deletion scope (A3) |
| **Added** | Carry the gate onto `tradeObjects$` before deleting `tradeChartView$` (A2) — *do not miss this* |
| **Added** | `originPanelId` on `TradeAnchor` (A5) — closes a gap that blocks TEDS-D18 |
| **Added** | Roster gating in TPL-D8 (A6) |
| **Added** | A T-1 detector in Task 7's audits (A2) |
| **Gated** | Phase 2 now requires F3 to have landed (A3) |
| **Excluded** | T-3 stays on the RFC-018 branch (A4) |
