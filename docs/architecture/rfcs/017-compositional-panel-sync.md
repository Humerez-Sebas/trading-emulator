# RFC-017: Compositional Panel Synchronization & Layer Composition

| Campo | Valor |
| :--- | :--- |
| **Estado** | Diseño Aprobado (Pendiente de Implementación) |
| **Fecha** | 2026-07-17 |
| **Bloque** | Mastery Block — Fase 4 |
| **Documentos Rectores** | [TRADER_KNOWLEDGE_MODEL.md](../TRADER_KNOWLEDGE_MODEL.md), [DOMAIN_MODEL.md](../DOMAIN_MODEL.md), `DESIGN_SYSTEM.md` |

---

## 1. Product Philosophy

> [!IMPORTANT]
> **This emulator is not a trading platform. It is a deliberate practice instrument for developing trading skill. Every architectural and UI decision must prioritize learning, clarity, replay fidelity, and cognitive ergonomics over feature parity with commercial trading software.**

The emulator exists to help traders build mental models through high-fidelity playback, structured reflection, and visual feedback. Visual elements are not decorative; they are cognitive scaffolds.

---

## 2. Architectural Principles (DoD Invariants)

The synchronization and composition layers must respect four invariants:

1. **Zero Implicit Mutability (No Merges):** Drawings are never merged, automatically cloned, or implicitly changed in ownership. There are no state transitions where drawings merge.
2. **Compositional Rendering:** A panel renders by dynamically overlaying independent visual layers matching its local context.
3. **Context Resolution Over Data Storage:** LinkGroups do not own, store, or manage drawing collections. A LinkGroup is strictly a metadata resolver that maps a panel's active link to a shared drawing namespace.
4. **Explicit Identity Ownership:** Every drawing has exactly one owner, modeled via a domain-level `DrawingOwner` structure.

---

## 3. Domain Model & Ownership

The specification establishes a unified, entity-based ownership model rather than split collections.

### 3.1 Schema
A drawing belongs to exactly one `DrawingOwner` which resolved to either a specific panel or a group:

```typescript
export interface DrawingOwner {
  type: 'panel' | 'group';
  id: string; // panelId or linkGroupId
}

export interface Drawing {
  id: string;
  symbol: string;
  owner: DrawingOwner;
  kind: DrawingType;
  p1: DrawingPoint;
  p2: DrawingPoint;
  zIndex: number;
  locked: boolean;
  visible: boolean;
}
```

*The implementation agent is free to optimize the internal store structure (e.g. standardizing on a flat `@ngrx/entity` map) provided these ownership identity fields remain primary.*

---

## 4. Rendering Pipeline

To maintain the **16 ms/frame budget** and avoid memory leaks, the rendering pipeline must follow a strict composition path:

```
[Entity Store] ──► [All Drawings]
                        │
                        ▼
[State Selectors] ──► [Filter by (Owner OR Active Group) AND Symbol]
                        │
                        ▼
[Composition Layer] ──► [Sort by zIndex]
                        │
                        ▼
[Viewport Filter] ──► [Prune off-screen elements]
                        │
                        ▼
[Renderer Engine] ──► [Paint on Canvas]
```

### Performance Constraints:
* **Zero Allocations in Selectors:** Avoid array slicing or object reconstruction inside hot path selectors.
* **Memoized Composition:** The composed drawing list must be resolved via memoized selectors, preventing canvas repaint cycles if the inputs haven't changed.
* **O(1) Owner Lookups:** Use indexed lookups rather than scanning collections.

---

## 5. Synchronization Channels

Synchronization across panels is split into independent, extensible channels:

* **Crosshair (`syncCrosshair`):** Coordinates cursor movements.
* **Time Range (`syncTimeRange`):** Syncs scrolling and zooming levels.
* **Drawings (`syncDrawings`):** Resolves the shared drawings layer context.
* **Trade Visualization (`syncTrades`):** Syncs execution path overlays.

---

## 6. Trade Visualization Layer (Visual Design Goals)

Instead of reproducing the retro visual style of legacy trading platforms, the emulator targets a clean, modern visual hierarchy inspired by orderflow tools (Sierra Chart, Bookmap) and modern charts (TradingView).

```
Entry Marker [▲] ───────────────────────[ Trade Path: Dashed Line ]───────────────────────► Exit Marker [▼]
                                                                                               │
  ┌────────────────────────────────────────────────────────────────────────┐                   ▼
  │ Trade Box (Semi-transparent risk/reward volume, 1R height guide)       ├────────────── Target Line
  └────────────────────────────────────────────────────────────────────────┘
```

### 6.1 UI Components & Specifications
* **Trade Box (Risk/Reward):** A semi-transparent zone showing initial risk. It uses low-opacity semantic colors (e.g., Green 8% for profit zones, Red 8% for loss zones) to avoid overlapping price action.
* **Entry / Exit Markers:** Pinned markers showing execution fills. Uses high-contrast shapes (arrows or diamonds) with clear semantic outlines.
* **Trade Path:** A thin, dashed line connecting entry and exit coordinates.
  * *UX/Practice Purpose:* Instantly exposes time-in-trade and path efficiency (slippage, MAE/MFE excursions) in a single visual sweep.
  * *Visual styling:* Dashes are colored based on positive/negative R-multiple outcome.
* **Position Label:** Clean HUD widget with `tabular-nums` displaying size, position side, and live floating P/L.
* **Stop/Target Guides:** Extended horizontal guides utilizing very thin dotted lines.

Every overlay must be part of the Design System, specifying colors, font sizing, line widths, and interaction states (hover tooltips for markers).

---

## 7. Operational Rules for Drawings

* **Deletion:** Deleting a shared drawing removes it from the group context, immediately updating all member panels. Deleting a local drawing only affects the current panel.
* **Visibility:**
  * *Global (Drawing.visible):* Shared across group members.
  * *Local (Panel layer toggle):* A panel-specific button hides the shared layer only on that panel's screen.
* **Panel/Group Switching:** Switching groups simply alters the panel's resolved `owner.id` to the new group. No data is copied or merged.
* **Symbol Switching:** Selecting a new symbol alters the symbol filter, loading matching drawings.

---

## 8. User Interaction Rules

### 8.1 Undo / Redo
The command history stack must be panel-scoped to prevent concurrent edits from colliding:
* Panel A maintains its own undo/redo history.
* Undoing a command from Panel A updates the shared drawing in the store.
* The implementation must propose a deterministic conflict-resolution strategy if Panel A and Panel B edit the same shared shape concurrently.

### 8.2 Clipboard (Copy / Paste)
* Copying a drawing captures its geometry.
* Pasting a drawing instantiates a copy under the destination panel's active symbol. The implementation must evaluate whether the pasted drawing adopts the destination panel's active target layer or local layer by default.

### 8.3 Lock Semantics
* Locked drawings (`locked: true`) are unmodifiable across all panels in the group. Any panel can unlock it.

### 8.4 zIndex
* Sorting is flat across composed layers. No hardcoded layer stacking offsets.

---

## 9. Architectural Self-Review

Before the implementation phase, the agent must execute a mandatory design validation step:
1. **Try to break the composition model:** Analyze potential edge-cases where the selector might emit stale states during rapid group transitions.
2. **Review performance budgets:** Verify that O(1) lookups are preserved.
3. **Draft the sync routing lifecycle:** Diagram how state transitions propagate through the router.

---

## 10. Migration from Previous RFC

* **Schema Version:** Incremented from `2` to `3`.
* **Payload Migration:** V2 payloads are imported by assigning flat drawing arrays to the primary panel ID (`panel-1`) under the new `owner` object, setting `locked: false` and `visible: true` as fallback values.
