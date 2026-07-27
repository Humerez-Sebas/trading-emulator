import { describe, expect, it } from 'vitest';
import { toPayload } from '../../services/session-sync.mapping';
import { parseSessionPayload } from '../../services/session-migration';
import { fromPayload } from '../../services/session-sync.mapping';
import type { PayloadInput } from '../../services/session-sync.models';
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
      {
        id: 'g1',
        color: '#f00',
        syncCrosshair: true,
        syncTimeRange: true,
        syncDrawings: true,
      },
    ];
    const eurusdDrawing: Drawing = {
      id: 'd1',
      symbol: 'EURUSD',
      owner: { type: 'panel', id: 'p1' },
      kind: 'line',
      p1: { time: 0, price: 1.1 },
      p2: { time: 3600, price: 1.2 },
      zIndex: 0,
      locked: false,
      visible: true,
    };
    const gbpusdDrawing: Drawing = {
      id: 'd2',
      symbol: 'GBPUSD',
      owner: { type: 'panel', id: 'p2' },
      kind: 'line',
      p1: { time: 0, price: 1.3 },
      p2: { time: 3600, price: 1.4 },
      zIndex: 0,
      locked: false,
      visible: true,
    };
    const drawings = { version: 2 as const, items: [eurusdDrawing, gbpusdDrawing] };

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
    // thenRestore dispatch in production). The drawings store holds the
    // WHOLE session (every symbol) in one entity map, hydrated in a single
    // `restoreDrawings` call from the already-flat V3 set — per-symbol
    // scoping becomes a filter over the composed entities, not a separate
    // action.
    const layoutState = layoutFeature.reducer(
      undefined,
      LayoutActions.restoreLayout({ layout: restored.layout, panels: restored.panels }),
    );
    const linkGroupsState = linkGroupsFeature.reducer(
      undefined,
      LinkGroupsActions.restoreGroups({ groups: restored.linkGroups }),
    );
    const drawingsState = drawingsFeature.reducer(
      undefined,
      DrawingsActions.restoreDrawings({ drawings: restored.drawings.items }),
    );
    const bySymbol = (symbol: string) =>
      Object.values(drawingsState.entities).filter((d) => d.symbol === symbol);

    // assert: the invariant the live reducer relies on holds on the restored
    // state, and nothing was lost or reshaped along the way.
    expect(() => assertLayoutConsistent(layoutState)).not.toThrow();
    expect(layoutState.workspace).toEqual(layout);
    expect(layoutState.panels).toEqual(panels);
    expect(linkGroupsState.groups).toEqual({ g1: linkGroups[0] });
    expect(bySymbol('EURUSD')).toEqual([eurusdDrawing]);
    expect(bySymbol('GBPUSD')).toEqual([gbpusdDrawing]);
  });

  /**
   * RFC-013 Task 5 Step 3 (DoD-5): a workspace built the way the NEW UI
   * actually builds one — createTab -> applyGridTemplate('2x2') -> addPanel x2
   * -> setPanelTimeframe -> LinkGroupsActions.createGroup + setPanelLinkGroup,
   * all folded through the REAL feature reducers (not hand-authored fixture
   * state) — must survive the exact same persist -> JSON -> parse -> restore
   * cycle proven above, landing on an equal layout/panels/linkGroups state
   * that still satisfies `assertLayoutConsistent`.
   */
  it('a UI-built workspace (createTab, applyGridTemplate, addPanel, setPanelTimeframe, LinkGroups) survives the full persistence cycle', () => {
    // build: fold the exact action sequence the new UI dispatches over FRESH reducers.
    let layoutState = layoutFeature.reducer(undefined, { type: '@@INIT' } as never);
    layoutState = layoutFeature.reducer(
      layoutState,
      LayoutActions.createTab({
        id: 'tab-ui',
        name: 'UI Tab',
        descriptor: { id: 'tab-ui-seed', symbol: '', timeframe: 'M1', linkGroupId: null },
      }),
    );
    layoutState = layoutFeature.reducer(
      layoutState,
      LayoutActions.applyGridTemplate({ tabId: 'tab-ui', template: '2x2' }),
    );
    layoutState = layoutFeature.reducer(
      layoutState,
      LayoutActions.addPanel({
        tabId: 'tab-ui',
        cellIndex: 0,
        descriptor: { id: 'ui-p1', symbol: '', timeframe: 'M1', linkGroupId: null },
      }),
    );
    layoutState = layoutFeature.reducer(
      layoutState,
      LayoutActions.addPanel({
        tabId: 'tab-ui',
        cellIndex: 1,
        descriptor: { id: 'ui-p2', symbol: '', timeframe: 'M1', linkGroupId: null },
      }),
    );
    layoutState = layoutFeature.reducer(
      layoutState,
      LayoutActions.setPanelTimeframe({ panelId: 'ui-p2', timeframe: 'M15' }),
    );

    let linkGroupsState = linkGroupsFeature.reducer(undefined, { type: '@@INIT' } as never);
    const uiGroup: LinkGroup = {
      id: 'ui-g1',
      color: '#2962FF',
      syncCrosshair: true,
      syncTimeRange: true,
      syncDrawings: true,
    };
    linkGroupsState = linkGroupsFeature.reducer(
      linkGroupsState,
      LinkGroupsActions.createGroup({ group: uiGroup }),
    );
    layoutState = layoutFeature.reducer(
      layoutState,
      LayoutActions.setPanelLinkGroup({ panelId: 'ui-p1', linkGroupId: 'ui-g1' }),
    );
    layoutState = layoutFeature.reducer(
      layoutState,
      LayoutActions.setPanelLinkGroup({ panelId: 'ui-p2', linkGroupId: 'ui-g1' }),
    );

    expect(() => assertLayoutConsistent(layoutState)).not.toThrow();

    // persist: same PayloadInput shape as the proof above, but sourced from the built state.
    const input: PayloadInput = {
      trading: defaultTradingData(10000),
      currentTime: 1700050000,
      activeTf: 'M1',
      customTfMinutes: null,
      playbackSpeed: 1,
      drawings: { version: 2, items: [] },
      notes: [],
      selectedTfs: ['M1', 'M15'],
      startRange: 1699000000,
      endRange: 1700200000,
      requiredDatasets: [{ symbol: 'EURUSD', timeframe: 'M1' }],
      layout: layoutState.workspace,
      panels: layoutState.panels,
      linkGroups: Object.values(linkGroupsState.groups),
    };

    const payload = toPayload(input);
    const stored = JSON.parse(JSON.stringify(payload));
    const parsed = parseSessionPayload(stored, 'EURUSD');
    const restored = fromPayload(parsed, 'EURUSD');

    const restoredLayoutState = layoutFeature.reducer(
      undefined,
      LayoutActions.restoreLayout({ layout: restored.layout, panels: restored.panels }),
    );
    const restoredLinkGroupsState = linkGroupsFeature.reducer(
      undefined,
      LinkGroupsActions.restoreGroups({ groups: restored.linkGroups }),
    );

    expect(() => assertLayoutConsistent(restoredLayoutState)).not.toThrow();
    expect(restoredLayoutState.workspace).toEqual(layoutState.workspace);
    expect(restoredLayoutState.panels).toEqual(layoutState.panels);
    expect(restoredLinkGroupsState.groups).toEqual(linkGroupsState.groups);
  });
});
