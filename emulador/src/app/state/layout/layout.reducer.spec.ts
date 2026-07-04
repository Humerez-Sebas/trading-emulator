import { describe, it, expect } from 'vitest';
import { LayoutActions } from './layout.actions';
import { layoutFeature, selectActiveTab, selectVisiblePanelIds } from './layout.reducer';
import {
  createInitialLayoutState,
  GridCell,
  LayoutState,
  MAX_PANELS_PER_TAB,
  PanelDescriptor,
  WorkspaceLayout,
} from './layout.models';
import { assertLayoutConsistent } from './layout-invariants.spec-util';

const reducer = layoutFeature.reducer;

const descriptor = (id: string): PanelDescriptor => ({
  id,
  symbol: '',
  timeframe: 'M1',
  linkGroupId: null,
});

describe('layoutFeature reducer', () => {
  it('starts with the fixed in-memory panel set (one 2h tab, panels M1/M5)', () => {
    const state = reducer(undefined, { type: '@@init' });
    expect(state.workspace.tabs).toHaveLength(1);
    expect(state.workspace.tabs[0].template).toBe('2h');
    expect(state.workspace.activeTabId).toBe('tab-main');
    expect(state.panels['panel-1'].timeframe).toBe('M1');
    expect(state.panels['panel-2'].timeframe).toBe('M5');
  });

  it('createTab appends a single-cell tab and activates it', () => {
    const state = reducer(
      createInitialLayoutState(),
      LayoutActions.createTab({ id: 'tab-2', name: 'Contexto' }),
    );
    expect(state.workspace.tabs).toHaveLength(2);
    const tab = state.workspace.tabs[1];
    expect(tab.id).toBe('tab-2');
    expect(tab.template).toBe('1');
    expect(tab.cells).toEqual([{ panelIds: [], activePanelId: '' }]);
    expect(state.workspace.activeTabId).toBe('tab-2');
  });

  it('closeTab removes the tab, drops its descriptors, and re-activates a neighbor', () => {
    let state = reducer(
      createInitialLayoutState(),
      LayoutActions.createTab({ id: 'tab-2', name: 'Contexto' }),
    );
    // active is tab-2; close it -> tab-main becomes active again
    state = reducer(state, LayoutActions.closeTab({ tabId: 'tab-2' }));
    expect(state.workspace.tabs).toHaveLength(1);
    expect(state.workspace.activeTabId).toBe('tab-main');
    // descriptors of the surviving tab are intact
    expect(state.panels['panel-1']).toBeDefined();
  });

  it('closeTab drops the descriptors owned by the closed tab', () => {
    let state = reducer(
      createInitialLayoutState(),
      LayoutActions.createTab({ id: 'tab-2', name: 'Contexto' }),
    );
    state = reducer(
      state,
      LayoutActions.addPanel({ tabId: 'tab-2', cellIndex: 0, descriptor: descriptor('p-x') }),
    );
    state = reducer(state, LayoutActions.closeTab({ tabId: 'tab-2' }));
    expect(state.panels['p-x']).toBeUndefined();
  });

  it('closeTab on the last remaining tab is a no-op', () => {
    const initial = createInitialLayoutState();
    const state = reducer(initial, LayoutActions.closeTab({ tabId: 'tab-main' }));
    expect(state).toBe(initial);
  });

  it('setActiveTab switches; unknown tab id is a no-op', () => {
    let state = reducer(
      createInitialLayoutState(),
      LayoutActions.createTab({ id: 'tab-2', name: 'Contexto' }),
    );
    state = reducer(state, LayoutActions.setActiveTab({ tabId: 'tab-main' }));
    expect(state.workspace.activeTabId).toBe('tab-main');
    const same = reducer(state, LayoutActions.setActiveTab({ tabId: 'nope' }));
    expect(same).toBe(state);
  });

  it('applyGridTemplate grows the tab with empty cells', () => {
    const state = reducer(
      createInitialLayoutState(),
      LayoutActions.applyGridTemplate({ tabId: 'tab-main', template: '2x2' }),
    );
    const tab = state.workspace.tabs[0];
    expect(tab.template).toBe('2x2');
    expect(tab.cells).toHaveLength(4);
    expect(tab.cells[2]).toEqual({ panelIds: [], activePanelId: '' });
    expect(tab.cells[3]).toEqual({ panelIds: [], activePanelId: '' });
  });

  it('applyGridTemplate shrink merges orphaned panels into the last kept cell', () => {
    const state = reducer(
      createInitialLayoutState(),
      LayoutActions.applyGridTemplate({ tabId: 'tab-main', template: '1' }),
    );
    const tab = state.workspace.tabs[0];
    expect(tab.cells).toHaveLength(1);
    expect(tab.cells[0].panelIds).toEqual(['panel-1', 'panel-2']);
    expect(tab.cells[0].activePanelId).toBe('panel-1');
    // no descriptor is lost on a shrink
    expect(state.panels['panel-2']).toBeDefined();
  });

  it('addPanel stores the descriptor and activates it in the target cell', () => {
    const state = reducer(
      createInitialLayoutState(),
      LayoutActions.addPanel({ tabId: 'tab-main', cellIndex: 0, descriptor: descriptor('p-3') }),
    );
    const cell = state.workspace.tabs[0].cells[0];
    expect(cell.panelIds).toEqual(['panel-1', 'p-3']);
    expect(cell.activePanelId).toBe('p-3');
    expect(state.panels['p-3']).toEqual(descriptor('p-3'));
  });

  it('addPanel rejects the 9th panel of a tab (MAX_PANELS_PER_TAB)', () => {
    let state: LayoutState = createInitialLayoutState();
    // initial tab holds 2 panels; add 6 more to reach the cap of 8
    for (let i = 0; i < MAX_PANELS_PER_TAB - 2; i++) {
      state = reducer(
        state,
        LayoutActions.addPanel({ tabId: 'tab-main', cellIndex: 0, descriptor: descriptor(`p-${i}`) }),
      );
    }
    const full = state;
    const cells: GridCell[] = full.workspace.tabs[0].cells;
    expect(cells.reduce((n, c) => n + c.panelIds.length, 0)).toBe(MAX_PANELS_PER_TAB);
    const rejected = reducer(
      full,
      LayoutActions.addPanel({ tabId: 'tab-main', cellIndex: 1, descriptor: descriptor('p-9th') }),
    );
    expect(rejected).toBe(full);
  });

  it('removePanel clears the id, fixes activePanelId, and drops the descriptor', () => {
    let state = reducer(
      createInitialLayoutState(),
      LayoutActions.addPanel({ tabId: 'tab-main', cellIndex: 0, descriptor: descriptor('p-3') }),
    );
    state = reducer(state, LayoutActions.removePanel({ panelId: 'p-3' }));
    const cell = state.workspace.tabs[0].cells[0];
    expect(cell.panelIds).toEqual(['panel-1']);
    expect(cell.activePanelId).toBe('panel-1');
    expect(state.panels['p-3']).toBeUndefined();
  });

  it('setActivePanel switches within the cell and rejects foreign ids', () => {
    let state = reducer(
      createInitialLayoutState(),
      LayoutActions.addPanel({ tabId: 'tab-main', cellIndex: 0, descriptor: descriptor('p-3') }),
    );
    state = reducer(
      state,
      LayoutActions.setActivePanel({ tabId: 'tab-main', cellIndex: 0, panelId: 'panel-1' }),
    );
    expect(state.workspace.tabs[0].cells[0].activePanelId).toBe('panel-1');
    const same = reducer(
      state,
      LayoutActions.setActivePanel({ tabId: 'tab-main', cellIndex: 0, panelId: 'panel-2' }),
    );
    expect(same).toBe(state);
  });

  it('selectActiveTab resolves the active tab from the workspace', () => {
    const state = createInitialLayoutState();
    expect(selectActiveTab.projector(state.workspace)?.id).toBe('tab-main');
  });

  describe('movePanel + lifecycle invariants (RFC-009)', () => {
    const twoTabs = (): LayoutState => {
      let s = reducer(createInitialLayoutState(), LayoutActions.createTab({ id: 'tab-2', name: 'Contexto' }));
      s = reducer(s, LayoutActions.addPanel({ tabId: 'tab-2', cellIndex: 0, descriptor: descriptor('p-ctx') }));
      return s;
    };

    it('moves a panel to another tab/cell and fixes both activePanelIds', () => {
      const state = reducer(
        twoTabs(),
        LayoutActions.movePanel({ panelId: 'panel-2', targetTabId: 'tab-2', targetCellIndex: 0 }),
      );
      const source = state.workspace.tabs[0].cells[1];
      const target = state.workspace.tabs[1].cells[0];
      expect(source.panelIds).toEqual([]);
      expect(source.activePanelId).toBe('');
      expect(target.panelIds).toEqual(['p-ctx', 'panel-2']);
      expect(target.activePanelId).toBe('panel-2');
      assertLayoutConsistent(state);
    });

    it('movePanel within the same tab relocates between cells', () => {
      const state = reducer(
        createInitialLayoutState(),
        LayoutActions.movePanel({ panelId: 'panel-2', targetTabId: 'tab-main', targetCellIndex: 0 }),
      );
      expect(state.workspace.tabs[0].cells[0].panelIds).toEqual(['panel-1', 'panel-2']);
      expect(state.workspace.tabs[0].cells[1].panelIds).toEqual([]);
      assertLayoutConsistent(state);
    });

    it('rejects moves that would exceed MAX_PANELS_PER_TAB in the target tab', () => {
      let state = twoTabs();
      for (let i = 0; i < MAX_PANELS_PER_TAB - 1; i++) {
        state = reducer(state, LayoutActions.addPanel({ tabId: 'tab-2', cellIndex: 0, descriptor: descriptor(`f-${i}`) }));
      }
      const full = state;
      const same = reducer(
        full,
        LayoutActions.movePanel({ panelId: 'panel-1', targetTabId: 'tab-2', targetCellIndex: 0 }),
      );
      expect(same).toBe(full);
    });

    it('rejects unknown panel, unknown tab, and out-of-range cell (no-ops)', () => {
      const state = twoTabs();
      expect(reducer(state, LayoutActions.movePanel({ panelId: 'nope', targetTabId: 'tab-2', targetCellIndex: 0 }))).toBe(state);
      expect(reducer(state, LayoutActions.movePanel({ panelId: 'panel-1', targetTabId: 'nope', targetCellIndex: 0 }))).toBe(state);
      expect(reducer(state, LayoutActions.movePanel({ panelId: 'panel-1', targetTabId: 'tab-2', targetCellIndex: 9 }))).toBe(state);
    });

    it('keeps the invariant across an arbitrary create/move/close/closeTab/shrink sequence', () => {
      let s = twoTabs();
      assertLayoutConsistent(s);
      s = reducer(s, LayoutActions.addPanel({ tabId: 'tab-main', cellIndex: 0, descriptor: descriptor('p-3') }));
      assertLayoutConsistent(s);
      s = reducer(s, LayoutActions.movePanel({ panelId: 'p-3', targetTabId: 'tab-2', targetCellIndex: 0 }));
      assertLayoutConsistent(s);
      s = reducer(s, LayoutActions.applyGridTemplate({ tabId: 'tab-main', template: '1' }));
      assertLayoutConsistent(s);
      s = reducer(s, LayoutActions.removePanel({ panelId: 'panel-1' }));
      assertLayoutConsistent(s);
      s = reducer(s, LayoutActions.closeTab({ tabId: 'tab-2' }));
      assertLayoutConsistent(s); // tab-2's panels (p-ctx, p-3) fully deregistered
      expect(s.panels['p-ctx']).toBeUndefined();
      expect(s.panels['p-3']).toBeUndefined();
    });
  });

  describe('selectVisiblePanelIds (RFC-009 D6, derived — not stored)', () => {
    it('marks visible exactly the active panel of each cell of the active tab', () => {
      let s = reducer(createInitialLayoutState(), LayoutActions.createTab({ id: 'tab-2', name: 'B' }));
      s = reducer(s, LayoutActions.addPanel({ tabId: 'tab-2', cellIndex: 0, descriptor: descriptor('p-b') }));
      // active tab is tab-2 after createTab
      expect(selectVisiblePanelIds.projector(s.workspace)).toEqual({ 'p-b': true });
      s = reducer(s, LayoutActions.setActiveTab({ tabId: 'tab-main' }));
      expect(selectVisiblePanelIds.projector(s.workspace)).toEqual({ 'panel-1': true, 'panel-2': true });
    });

    it('stacked cell: only the activePanelId of the cell is visible', () => {
      const s = reducer(
        createInitialLayoutState(),
        LayoutActions.addPanel({ tabId: 'tab-main', cellIndex: 0, descriptor: descriptor('p-3') }),
      );
      expect(selectVisiblePanelIds.projector(s.workspace)).toEqual({ 'p-3': true, 'panel-2': true });
    });
  });

  describe('setPanelLinkGroup (RFC-010 Task 1)', () => {
    it('assigns a linkGroupId to an existing panel', () => {
      const state = reducer(
        createInitialLayoutState(),
        LayoutActions.setPanelLinkGroup({ panelId: 'panel-1', linkGroupId: 'g1' }),
      );
      expect(state.panels['panel-1'].linkGroupId).toBe('g1');
      expect(state.panels['panel-2'].linkGroupId).toBeNull(); // untouched
    });

    it('clears a linkGroupId back to null', () => {
      let state = reducer(createInitialLayoutState(), LayoutActions.setPanelLinkGroup({ panelId: 'panel-1', linkGroupId: 'g1' }));
      state = reducer(state, LayoutActions.setPanelLinkGroup({ panelId: 'panel-1', linkGroupId: null }));
      expect(state.panels['panel-1'].linkGroupId).toBeNull();
    });

    it('is a no-op for an unknown panelId', () => {
      const state = createInitialLayoutState();
      expect(reducer(state, LayoutActions.setPanelLinkGroup({ panelId: 'nope', linkGroupId: 'g1' }))).toBe(state);
    });
  });

  describe('restoreLayout (RFC-011 Task 2)', () => {
    it('replaces both workspace and panels wholesale', () => {
      const layout: WorkspaceLayout = {
        tabs: [{ id: 't1', name: 'Restored', template: '1', cells: [{ panelIds: ['p9'], activePanelId: 'p9' }] }],
        activeTabId: 't1',
      };
      const panels = { p9: { id: 'p9', symbol: 'EURUSD', timeframe: 'H1' as const, linkGroupId: null } };
      const state = reducer(createInitialLayoutState(), LayoutActions.restoreLayout({ layout, panels }));
      expect(state.workspace).toEqual(layout);
      expect(state.panels).toEqual(panels);
    });

    it('a restored layout satisfies assertLayoutConsistent', () => {
      const layout: WorkspaceLayout = {
        tabs: [{ id: 't1', name: 'Restored', template: '2h', cells: [
          { panelIds: ['p1'], activePanelId: 'p1' },
          { panelIds: ['p2', 'p3'], activePanelId: 'p2' },
        ] }],
        activeTabId: 't1',
      };
      const panels = {
        p1: { id: 'p1', symbol: 'A', timeframe: 'M1' as const, linkGroupId: null },
        p2: { id: 'p2', symbol: 'B', timeframe: 'M1' as const, linkGroupId: null },
        p3: { id: 'p3', symbol: 'B', timeframe: 'M5' as const, linkGroupId: 'g1' },
      };
      const state = reducer(createInitialLayoutState(), LayoutActions.restoreLayout({ layout, panels }));
      expect(() => assertLayoutConsistent(state)).not.toThrow();
    });
  });
});
