import type {
  SessionPayloadV1,
  SessionPayloadV2,
  StoredSessionPayload,
} from './session-sync.models';
import { SESSION_PAYLOAD_VERSION_2 } from './session-sync.models';
import type { WorkspaceLayout, PanelDescriptor, TabLayout, GridCell } from '../state/layout/layout.models';
import { isLayoutConsistentPure } from '../state/layout/layout-invariants';
import type { Timeframe } from '../models';

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

function isLayoutConsistent(layout: WorkspaceLayout, panels: Record<string, PanelDescriptor>): boolean {
  return isLayoutConsistentPure({ workspace: layout, panels });
}

export function parseSessionPayload(raw: StoredSessionPayload, primarySymbol: string): SessionPayloadV2 {
  if (!isSessionPayloadV2(raw)) {
    return migrateV1ToV2(raw as SessionPayloadV1, primarySymbol);
  }
  const v2 = raw as SessionPayloadV2;
  if (isLayoutConsistent(v2.layout, v2.panels)) return v2;
  // Defensive parse: corrupt/foreign layout — never hydrate it as-is (Global Constraints).
  const { layout, panels } = singlePanelLayoutFor(primarySymbol, v2.activeTf ?? 'M1');
  return { ...v2, layout, panels };
}
