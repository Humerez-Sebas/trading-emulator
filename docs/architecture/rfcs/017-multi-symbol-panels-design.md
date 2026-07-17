# RFC-017 Design Specification: Multi-Symbol Panels & Compositional Sync Layers

| Campo | Valor |
| :--- | :--- |
| **Estado** | Diseño Aprobado (Pendiente de Implementación) |
| **Fecha** | 2026-07-17 |
| **Bloque** | Mastery Block — Fase 4 |
| **Documentos Rectores** | [TRADER_KNOWLEDGE_MODEL.md](../TRADER_KNOWLEDGE_MODEL.md), [DOMAIN_MODEL.md](../DOMAIN_MODEL.md), `DESIGN_SYSTEM.md` |

---

## 1. Executive Summary

RFC-017 introduces multi-symbol support per workspace panel ("Diferente símbolo por panel") and restructures the drawing synchronization architecture. The previous model, which relied on complex state merging and implicit cloning, has been completely abandoned. 

Instead, this specification establishes a **Layer-based Composition Model**. Drawings are stored in a single, normalized entity collection in the NgRx state and IndexedDB, qualified by explicit ownership (`DrawingOwner`). Chart panels render drawings by dynamically composing their local drawing layer and the shared drawing layer resolved from their LinkGroup context. This eliminates data corruption, prevents echo loops, provides total reversibility, and establishes a clear separation of concerns.

---

## 2. Architectural Principles

The synchronization and rendering of workspace visual layers are governed by four absolute invariants:

1. **Zero Implicit Mutability (No Merges):** Drawings are never merged, automatically copied, or altered in ownership by state transitions. 
2. **Compositional Rendering:** Chart rendering is a pure composition function. A panel queries and overlays independent visual layers based on its current context.
3. **Context Resolution Over Data Storage:** LinkGroups do not store, own, or manage drawing collections. A LinkGroup is strictly a metadata selector used by the rendering pipeline to resolve the current shared drawing context.
4. **Explicit Identity Ownership:** Every visual element exists under exactly one domain owner. Ownership is resolved via a dedicated `DrawingOwner` schema.

---

## 3. Domain Model

### 3.1 Split Collections vs. Entity Ownership (Trade-Offs)

* **Split Collections Model (Local vs. Shared stores):**
  * *Pros:* Simple to query locally (different keys in the store).
  * *Cons:* Causes duplicate reducer logic, redundant IndexedDB object stores, complex migration paths, and breaks when adding new layers (e.g., templates, libraries).
* **Entity-Based Unified Store (Recommended):**
  * *Pros:* Highly extensible. Reuses a single normalized NgRx entity collection. All drawings share the same persistence, syncing, and migration pipelines. Supports adding new layers (templates, global profiles) without domain model restructuring.
  * *Cons:* Requires slightly more complex query selectors utilizing filtering. This overhead is mitigated by NgRx memoization.

### 3.2 Final State Schema Recommendation
We standardize on a single, normalized `DrawingsState` using the NgRx Entity pattern:

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
  color?: string;
  strokeWidth?: number;
}

export interface DrawingsState {
  entities: Record<string, Drawing>; // drawingId -> Drawing
  ids: string[];
}
```

---

## 4. Ownership Model

Every drawing entity is bound to a single `DrawingOwner`. 

* **PanelOwner (`owner: { type: 'panel', id: panelId }`):** Bound to a specific layout panel. These drawings remain local to the panel and are unaffected by link group assignments.
* **GroupOwner (`owner: { type: 'group', id: groupId }`):** Bound to a LinkGroup. These drawings are shared by all panels in that group that display the same financial instrument.
* **Symbol Coupling:** All drawings remain strongly typed to their parent `symbol` property. A drawing is never rendered on a chart displaying a different symbol, preventing time-price coordinate scaling mismatches.

---

## 5. Render Pipeline

The visual state of a panel is composed on-the-fly during selector evaluation. The rendering function is:

$$\text{Render}(\text{panel}) = \text{LocalDrawings}(\text{panelId}, \text{symbol}) + \text{SharedDrawings}(\text{groupId}, \text{symbol}) + \text{TradeVisualization}(\text{panelId})$$

```
                   +---------------------------------------+
                   |          Panel Render Engine          |
                   +-------------------+-------------------+
                                       |
          +----------------------------+----------------------------+
          |                            |                            |
          v                            v                            v
┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│   Local Layer    │         │   Shared Layer   │         │   Trades Layer   │
│  (owner: panel)  │         │  (owner: group)  │         │  (Closed/Active) │
└─────────┬────────┘         └─────────┬────────┘         └─────────┬────────┘
          |                            |                            |
          +────────────────────────────┼────────────────────────────+
                                       |
                                       v
                             [ Sort by zIndex ]
                                       |
                                       v
                              [ Paint on Canvas ]
```

### Stacking Order (Bottom to Top):
1. **Base Chart Layer:** Candles, grid lines, price/time scales.
2. **Trade Visualization Layer:** Entry markers, exit markers, risk/reward boxes, trade paths.
3. **Composed Drawings Layer:** Union of Local and Shared drawings, sorted by `zIndex`.
4. **Interactive HUD Overlay:** Selected drawing handles, crosshair coordinates, tooltips.

---

## 6. Synchronization Channels

Sincronization across panels is divided into independent, decoupled visual channels. LinkGroups govern these channels using explicit flags:

| Sync Channel | LinkGroup Property | Event Type | Description |
| :--- | :--- | :--- | :--- |
| **Crosshair** | `syncCrosshair: boolean` | `CrosshairMoved` | Syncs crosshair cursor positions across panels. |
| **Time Range** | `syncTimeRange: boolean` | `VisibleRangeChanged` | Syncs visible chart viewport timeframes (zoom/scroll). |
| **Drawings** | `syncDrawings: boolean` | `DrawingsUpdated` | Syncs drawing coordinates via shared group ownership context. |
| **Trade Vis** | `syncTrades: boolean` | — (Implicit) | Controls whether trades are displayed locally or shared. |

---

## 7. Trade Visualization Layer

To maintain the emulator's status as a **deliberate practice tool**, all broker-centric concepts (such as partial close, scale in/out, and breakeven) are excluded. The Trade Visualization Layer is strictly defined as follows:

1. **Trade Box:** A semi-transparent box displaying initial entry price, stop-loss, and target bounds (representing 1R risk/reward geometry).
2. **Entry Marker:** A visual icon (e.g., arrow) pinned to the exact execution candle time and entry price.
3. **Exit Marker:** An icon representing the trade's exit point.
4. **Trade Path:** A dashed or dotted colored line connecting the Entry Marker to the Exit Marker.
   * *UX Purpose:* Provides immediate cognitive feedback on the trade's space-time trajectory, allowing the trader to evaluate adverse excursions, speed of execution, and holding time relative to standard volatility.
   * *Visual Improvements:* The line is dynamically colored based on trade outcome (e.g., green for positive R-multiple trades, red for negative R-multiple trades).
5. **Position Label:** Displays size, side, and running P/L.
6. **Stop/Target Guides:** Extended horizontal dashed guidelines across the chart to track target levels.

---

## 8. Drawing Layer Operational Rules

* **Deletion:**
  * Deleting a local drawing removes the entity from the store.
  * Deleting a shared drawing (owner type `'group'`) deletes the entity from the store, instantly removing it from all panels in the group.
* **Visibility:**
  * **Drawing Visibility (`Drawing.visible`):** Shared across all panels (if hidden, it hides for the entire group).
  * **Layer Visibility (`panel.showSharedDrawings`):** Local to the panel. Toggling it off hides the group drawings on that panel's screen only.
* **Panel/Group Switching:**
  * Changing a panel's link group modifies its `linkGroupId` property. The selectors dynamically re-evaluate the owner context and render the new group's drawings immediately. No data is copied or deleted.
* **Symbol Switching:**
  * Changing a panel's symbol changes its rendering scope. The selectors query drawings matching `(owner, newSymbol)`. Drawings on the old symbol remain in memory under the `oldSymbol` key.

---

## 9. User Interaction Rules

### 9.1 Undo / Redo
* **Rule:** The command stack is local to each panel. 
* **Mechanics:** If Panel A changes a shared drawing, Panel A pushes the command onto its local undo stack. Pressing `Ctrl+Z` on Panel A pops the command and reverts the shared drawing in the store. Panels B and C reactively update. Panel A's undo stack never contains commands for drawings created/modified on Panel B.

### 9.2 Clipboard (Copy / Paste)
* Pasting a drawing instantiates a copy of the shape with a new UUID.
* The pasted drawing adopts the **current panel's active symbol** and the **panel's active target layer** (`local` or `shared`).

### 9.3 Lock Semantics
* Locking a drawing sets `locked: true` in the store.
* Locked drawings cannot be dragged or modified on any chart panel. Any panel can unlock it if needed.

### 9.4 zIndex
* Stacking order is determined by a single integer `zIndex` on the drawing entity.
* New drawings default to `max(zIndexVisible) + 1`. Actions like "Bring to Front" or "Send to Back" update this value on the entity in the store.

---

## 10. State Management & Selectors

### Selector for Panel Drawings:
```typescript
export const selectDrawingsForPanel = (panelId: string, symbol: string) =>
  createSelector(
    selectDrawingEntities, // Record<string, Drawing>
    selectPanels,          // Record<string, PanelDescriptor>
    (drawings, panels) => {
      const panel = panels[panelId];
      const linkGroupId = panel?.linkGroupId;
      const isSyncActive = linkGroupId && panel?.syncDrawings;
      
      return Object.values(drawings)
        .filter(d => 
          d.symbol === symbol && (
            (d.owner.type === 'panel' && d.owner.id === panelId) ||
            (isSyncActive && d.owner.type === 'group' && d.owner.id === linkGroupId)
          )
        )
        .sort((a, b) => a.zIndex - b.zIndex);
    }
  );
```

---

## 11. Open Questions (Architectural Status)

* **Clipboard Ownership:** [READY] Pasting adopts destination panel active target layer/symbol.
* **Undo / Redo:** [READY] Local command stacks with global store dispatch side-effects.
* **Lock Semantics:** [READY] Shared boolean property in the entity; anyone can unlock.
* **zIndex:** [READY] Flat integer stack ordering across all composed layers.
* **Panel Lifecycle:** [READY] Closing a panel dispatches an action that cleanup-deletes all drawings associated with `owner: { type: 'panel', id: closedPanelId }` to prevent database bloat.
* **Owner Lifecycle:** [READY] Group drawings survive panel destruction (they persist under `owner: { type: 'group', id: groupId }` in the session payload).
* **Workspace/Session boundaries:** [READY] Drawings remain scoped to their parent Workspace / Session database.

---

## 12. Risks and Mitigations

* **Risk: Selector Cache Churn:** If multiple panels query drawings, parameterized selectors can trigger recalculations.
  * *Mitigation:* Memoize the list of active drawings at a global level using a dictionary index before filtering by panel, or ensure panel selectors are properly memoized based on stable descriptor inputs.
* **Risk: Orphaned Panel Drawings:** Deleting layout configurations might leave drawing entities in IndexedDB with panel IDs that no longer exist.
  * *Mitigation:* Run an offline garbage collection task on session start that cleans up drawing records whose `owner.type === 'panel'` does not match any panel ID in the current workspace layout.

---

## 13. Database Schema Migration

### SessionPayloadV2 (Old)
```json
{
  "drawings": {
    "GBPUSD": {
      "version": 2,
      "items": [ { "id": "d1", "kind": "line" } ]
    }
  }
}
```

### SessionPayloadV3 (New)
```json
{
  "schemaVersion": 3,
  "drawings": {
    "GBPUSD": {
      "version": 3,
      "items": [
        {
          "id": "d1",
          "kind": "line",
          "owner": {
            "type": "panel",
            "id": "panel-1"
          },
          "zIndex": 100,
          "locked": false,
          "visible": true
        }
      ]
    }
  }
}
```

* **Legacy Importer:** When importing a V2 session, the migration engine assigns all legacy drawings to the primary panel ID (`panel-1`) under the `owner` object, setting `zIndex = index` and `locked = false`.

---

## 14. Final Recommendation

We recommend proceeding with **Entity-Based Unified Store** and the **Compositional Render Pipeline**. It is the most robust, maintainable, and mathematically sound model for the multi-symbol system. It eliminates edge-case state synchronization bugs, simplifies local persistence, and provides an extensible base for future features.

This specification is complete, finalized, and ready to act as the source of truth for the RFC-017 implementation.
