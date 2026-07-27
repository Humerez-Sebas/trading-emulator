import type {
  SessionPayloadV1,
  SessionPayloadV2,
  SessionPayloadV3,
  StoredSessionPayload,
} from './session-sync.models';
import { SESSION_PAYLOAD_VERSION_2, SESSION_PAYLOAD_VERSION_3 } from './session-sync.models';
import type {
  WorkspaceLayout,
  PanelDescriptor,
  TabLayout,
  GridCell,
} from '../state/layout/layout.models';
import { isLayoutConsistentPure } from '../state/layout/layout-invariants';
import type { Timeframe } from '../models';
import type { Drawing } from '../state/drawings/drawings.models';
import { liftLegacyDrawing, ownerPanelFor } from './drawings-migration';
import { normalizeLinkGroup } from '../state/link-groups/link-groups.models';

/** Builds the vision-mandated migration default (single tab/cell/panel). Pure, deterministic id (no crypto.randomUUID — keeps round-trip tests reproducible; the id only needs to be internally unique within this one payload, which a fixed literal satisfies). */
export function singlePanelLayoutFor(
  symbol: string,
  timeframe: Timeframe,
): { layout: WorkspaceLayout; panels: Record<string, PanelDescriptor> } {
  const panelId = 'panel-migrated-1';
  const cell: GridCell = { panelIds: [panelId], activePanelId: panelId };
  const tab: TabLayout = { id: 'tab-migrated-1', name: 'Principal', template: '1', cells: [cell] };
  const layout: WorkspaceLayout = { tabs: [tab], activeTabId: tab.id };
  const panels: Record<string, PanelDescriptor> = {
    [panelId]: { id: panelId, symbol, timeframe, linkGroupId: null },
  };
  return { layout, panels };
}

export function migrateV1ToV2(v1: SessionPayloadV1, primarySymbol: string): SessionPayloadV2 {
  const { layout, panels } = singlePanelLayoutFor(primarySymbol, v1.activeTf ?? 'M1');
  return {
    schemaVersion: SESSION_PAYLOAD_VERSION_2,
    trading: v1.trading,
    currentTime: v1.currentTime,
    activeTf: v1.activeTf,
    customTfMinutes: v1.customTfMinutes,
    playbackSpeed: v1.playbackSpeed,
    replayResolution: v1.replayResolution ?? null,
    drawings: { [primarySymbol]: { version: 1, items: v1.drawings } },
    notes: v1.notes,
    selectedTfs: v1.selectedTfs,
    startRange: v1.startRange,
    endRange: v1.endRange,
    requiredDatasets: v1.requiredDatasets,
    layout,
    panels,
    linkGroups: [],
  };
}

/** Structural check only (schemaVersion + shape) — does NOT validate layout consistency; parseSessionPayload does that separately so a malformed-but-labeled-V2 payload still gets the defensive fallback rather than a thrown error. */
export function isSessionPayloadV2(p: StoredSessionPayload): p is SessionPayloadV2 {
  const rec = p as Record<string, unknown>;
  return (
    rec['schemaVersion'] === SESSION_PAYLOAD_VERSION_2 &&
    typeof rec['drawings'] === 'object' &&
    !Array.isArray(rec['drawings']) &&
    typeof rec['layout'] === 'object' &&
    typeof rec['panels'] === 'object'
  );
}

/** Structural check only (schemaVersion + shape) — mirrors `isSessionPayloadV2`'s style: `drawings` is a flat `{items: []}` object rather than V2's per-symbol record, which is exactly what distinguishes the two versions. */
export function isSessionPayloadV3(p: StoredSessionPayload): p is SessionPayloadV3 {
  const rec = p as Record<string, unknown>;
  const drawings = rec['drawings'] as Record<string, unknown> | undefined;
  return (
    rec['schemaVersion'] === SESSION_PAYLOAD_VERSION_3 &&
    typeof drawings === 'object' &&
    drawings !== null &&
    Array.isArray(drawings['items']) &&
    typeof rec['layout'] === 'object' &&
    typeof rec['panels'] === 'object'
  );
}

function isLayoutConsistent(
  layout: WorkspaceLayout,
  panels: Record<string, PanelDescriptor>,
): boolean {
  return isLayoutConsistentPure({ workspace: layout, panels });
}

/**
 * Lifts a V2 payload's per-symbol drawing record into V3's flat, owner-tagged
 * set. Every item is re-stamped from scratch via `liftLegacyDrawing` (id/kind/
 * geometry carried over verbatim; symbol/owner/zIndex/locked/visible always
 * freshly derived, never read off the item) — `zIndex` is one running counter
 * across every symbol's bucket, in record-key order, so paint order survives
 * exactly. `owner` resolves against THIS payload's own `layout`/`panels`
 * (never the live store): the first panel showing that symbol, falling back
 * to the layout's first panel. A missing/non-array bucket is treated as
 * empty rather than thrown on (parse, don't trust — mirrors the layout-
 * consistency guard already in front of this function).
 */
export function migrateV2ToV3(v2: SessionPayloadV2): SessionPayloadV3 {
  const items: Drawing[] = [];
  let zIndex = 0;
  for (const symbol of Object.keys(v2.drawings ?? {})) {
    const legacyItems = v2.drawings[symbol]?.items;
    if (!Array.isArray(legacyItems) || legacyItems.length === 0) continue;
    const ownerPanelId = ownerPanelFor(symbol, v2.layout, v2.panels);
    for (const item of legacyItems) {
      items.push(liftLegacyDrawing(item, symbol, ownerPanelId, zIndex));
      zIndex++;
    }
  }
  return {
    schemaVersion: SESSION_PAYLOAD_VERSION_3,
    trading: v2.trading,
    currentTime: v2.currentTime,
    activeTf: v2.activeTf,
    customTfMinutes: v2.customTfMinutes,
    playbackSpeed: v2.playbackSpeed,
    replayResolution: v2.replayResolution,
    drawings: { version: 2, items },
    notes: v2.notes,
    selectedTfs: v2.selectedTfs,
    startRange: v2.startRange,
    endRange: v2.endRange,
    requiredDatasets: v2.requiredDatasets,
    layout: v2.layout,
    panels: v2.panels,
    // A group predating the composition flags normalizes to the migration
    // defaults here too, the same rule every other hydration path applies —
    // parse, don't trust: a legacy payload may carry no linkGroups at all.
    linkGroups: (v2.linkGroups ?? []).map(normalizeLinkGroup),
  };
}

export function parseSessionPayload(
  raw: StoredSessionPayload,
  primarySymbol: string,
): SessionPayloadV3 {
  if (isSessionPayloadV3(raw)) return raw;
  if (isSessionPayloadV2(raw)) {
    if (isLayoutConsistent(raw.layout, raw.panels)) return migrateV2ToV3(raw);
    // Defensive parse: corrupt/foreign layout — replace it BEFORE migrating,
    // so owner resolution targets a panel that exists in the replaced layout
    // (Global Constraints).
    const { layout, panels } = singlePanelLayoutFor(primarySymbol, raw.activeTf ?? 'M1');
    return migrateV2ToV3({ ...raw, layout, panels });
  }
  return migrateV2ToV3(migrateV1ToV2(raw as SessionPayloadV1, primarySymbol));
}
