import { describe, it, expect } from 'vitest';
import { LayoutActions } from './layout.actions';
import { layoutFeature, selectActiveTab } from './layout.reducer';
import {
  createInitialLayoutState,
  GridCell,
  LayoutState,
  MAX_PANELS_PER_TAB,
  PanelDescriptor,
} from './layout.models';

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
});
