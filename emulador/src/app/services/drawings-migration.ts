import { Drawing, DrawingPoint, DrawingType } from '../state/drawings/drawings.models';
import { PanelDescriptor, WorkspaceLayout } from '../state/layout/layout.models';
import { DrawingCollection } from './session-sync.models';

/** The legacy (V2 and earlier) on-wire shape of one drawing: no owner, no z-order, no lock/visibility. */
export interface LegacyDrawingItem {
  id: string;
  kind: DrawingType;
  p1: DrawingPoint;
  p2: DrawingPoint;
}

/**
 * Lifts one legacy drawing item into the current owner-tagged shape, assigning
 * it to a panel and stamping the fields legacy records never carried. `id`,
 * `kind`, `p1`, `p2` are carried over by reference, never re-created.
 */
export function liftLegacyDrawing(
  item: LegacyDrawingItem,
  symbol: string,
  ownerPanelId: string,
  zIndex: number,
): Drawing {
  return {
    id: item.id,
    symbol,
    owner: { type: 'panel', id: ownerPanelId },
    kind: item.kind,
    p1: item.p1,
    p2: item.p2,
    zIndex,
    locked: false,
    visible: true,
  };
}

/**
 * Picks which panel should own a legacy (pre-ownership) drawing for the given
 * symbol: the first panel showing that symbol, walking the layout in
 * deterministic order (tabs, then each tab's cells, then each cell's
 * panelIds). If no panel shows the symbol, the first panel in that same
 * order owns it instead — every legacy drawing needs a home even when its
 * symbol isn't open anywhere. An empty layout (no panels at all) has no
 * possible owner, so callers get '' and treat it as "unresolvable".
 */
export function ownerPanelFor(
  symbol: string,
  layout: WorkspaceLayout,
  panels: Record<string, PanelDescriptor>,
): string {
  let firstPanelId: string | null = null;
  for (const tab of layout.tabs) {
    for (const cell of tab.cells) {
      for (const panelId of cell.panelIds) {
        if (firstPanelId === null) firstPanelId = panelId;
        if (panels[panelId]?.symbol === symbol) return panelId;
      }
    }
  }
  return firstPanelId ?? '';
}

/**
 * Buckets a flat, owner-tagged drawing set by symbol into the versioned
 * per-symbol shape the V2 payload writer expects — the write-side inverse of
 * flattening a restored `Record<symbol, DrawingCollection>` back into one array.
 */
export function groupDrawingsBySymbol(
  drawings: readonly Drawing[],
): Record<string, DrawingCollection> {
  const bySymbol: Record<string, Drawing[]> = {};
  for (const d of drawings) {
    (bySymbol[d.symbol] ??= []).push(d);
  }
  const result: Record<string, DrawingCollection> = {};
  for (const symbol of Object.keys(bySymbol)) {
    result[symbol] = { version: 1, items: bySymbol[symbol] };
  }
  return result;
}
