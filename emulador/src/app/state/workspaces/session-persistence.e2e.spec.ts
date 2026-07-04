import { describe, expect, it } from 'vitest';
import { toPayload } from '../../services/session-sync.mapping';
import { parseSessionPayload } from '../../services/session-migration';
import { fromPayload } from '../../services/session-sync.mapping';
import type { PayloadInput, DrawingCollection } from '../../services/session-sync.models';
import { assertLayoutConsistent } from '../layout/layout-invariants.spec-util';
import { layoutFeature } from '../layout/layout.reducer';
import { LayoutActions } from '../layout/layout.actions';
import { linkGroupsFeature } from '../link-groups/link-groups.reducer';
import { LinkGroupsActions } from '../link-groups/link-groups.actions';
import { drawingsFeature } from '../drawings/drawings.reducer';
import { DrawingsActions } from '../drawings/drawings.actions';
import { defaultTradingData } from '../trading/trading.models';
import type { WorkspaceLayout, PanelDescriptor } from '../layout/layout.models';
import type { LinkGroup } from '../link-groups/link-groups.models';
import type { Drawing } from '../drawings/drawings.models';

/**
 * RFC-011 Task 5 Step 7 — full-cycle proof (no new production code): a
 * MULTI-panel layout (2h template, two panels, one link group) survives
 * persist -> serialize -> JSON round-trip -> parse -> restore-dispatch
 * against FRESH reducers, and the resulting state satisfies the same
 * `assertLayoutConsistent` invariant the live reducer enforces, with the
 * original link groups and per-symbol drawing items preserved.
 */
describe('session persistence full-cycle (RFC-011 Task 5 Step 7)', () => {
  it('layout/panels/linkGroups/drawings round-trip through toPayload -> JSON -> parseSessionPayload -> restore actions -> fresh reducers', () => {
    const layout: WorkspaceLayout = {
      tabs: [
        {
          id: 'tab-main',
          name: 'Principal',
          template: '2h',
          cells: [
            { panelIds: ['p1'], activePanelId: 'p1' },
            { panelIds: ['p2'], activePanelId: 'p2' },
          ],
        },
      ],
      activeTabId: 'tab-main',
    };
    const panels: Record<string, PanelDescriptor> = {
      p1: { id: 'p1', symbol: 'EURUSD', timeframe: 'M1', linkGroupId: 'g1' },
      p2: { id: 'p2', symbol: 'GBPUSD', timeframe: 'H1', linkGroupId: 'g1' },
    };
    const linkGroups: LinkGroup[] = [
      { id: 'g1', color: '#f00', syncCrosshair: true, syncTimeRange: true },
    ];
    const eurusdDrawing: Drawing = {
      id: 'd1',
      kind: 'line',
      p1: { time: 0, price: 1.1 },
      p2: { time: 3600, price: 1.2 },
    };
    const gbpusdDrawing: Drawing = {
      id: 'd2',
      kind: 'line',
      p1: { time: 0, price: 1.3 },
      p2: { time: 3600, price: 1.4 },
    };
    const drawings: Record<string, DrawingCollection> = {
      EURUSD: { version: 1, items: [eurusdDrawing] },
      GBPUSD: { version: 1, items: [gbpusdDrawing] },
    };

    const input: PayloadInput = {
      trading: defaultTradingData(10000),
      currentTime: 1700050000,
      activeTf: 'M1',
      customTfMinutes: null,
      playbackSpeed: 1,
      drawings,
      notes: [],
      selectedTfs: ['M1', 'H1'],
      startRange: 1699000000,
      endRange: 1700200000,
      requiredDatasets: [
        { symbol: 'EURUSD', timeframe: 'M1' },
        { symbol: 'GBPUSD', timeframe: 'H1' },
      ],
      layout,
      panels,
      linkGroups,
    };

    // persist: build the payload and push it through a JSON round-trip
    // exactly as IndexedDB/Supabase storage does.
    const payload = toPayload(input);
    const stored = JSON.parse(JSON.stringify(payload));

    // read back: defensive parse (never trusts a persisted shape blindly),
    // then the same projection the restore dispatch path consumes.
    const parsed = parseSessionPayload(stored, 'EURUSD');
    const restored = fromPayload(parsed, 'EURUSD');

    // wire: feed the restored values through the actual restore actions
    // against FRESH feature reducers (mirrors what workspaceRestored/
    // thenRestore dispatch in production).
    const layoutState = layoutFeature.reducer(
      undefined,
      LayoutActions.restoreLayout({ layout: restored.layout, panels: restored.panels }),
    );
    const linkGroupsState = linkGroupsFeature.reducer(
      undefined,
      LinkGroupsActions.restoreGroups({ groups: restored.linkGroups }),
    );
    const eurusdDrawingsState = drawingsFeature.reducer(
      undefined,
      DrawingsActions.restoreDrawingsForSymbol({ drawings: restored.drawings, symbol: 'EURUSD' }),
    );
    const gbpusdDrawingsState = drawingsFeature.reducer(
      undefined,
      DrawingsActions.restoreDrawingsForSymbol({ drawings: restored.drawings, symbol: 'GBPUSD' }),
    );

    // assert: the invariant the live reducer relies on holds on the restored
    // state, and nothing was lost or reshaped along the way.
    expect(() => assertLayoutConsistent(layoutState)).not.toThrow();
    expect(layoutState.workspace).toEqual(layout);
    expect(layoutState.panels).toEqual(panels);
    expect(linkGroupsState.groups).toEqual({ g1: linkGroups[0] });
    expect(eurusdDrawingsState.items).toEqual([eurusdDrawing]);
    expect(gbpusdDrawingsState.items).toEqual([gbpusdDrawing]);
  });
});
