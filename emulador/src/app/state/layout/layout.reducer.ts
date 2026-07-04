import { createFeature, createReducer, createSelector, on } from '@ngrx/store';
import { LayoutActions } from './layout.actions';
import {
  createInitialLayoutState,
  GRID_TEMPLATE_CELLS,
  GridCell,
  LayoutState,
  MAX_PANELS_PER_TAB,
  TabLayout,
  WorkspaceLayout,
} from './layout.models';
import { WorkspacesActions } from '../workspaces/workspaces.actions';
import { MarketActions } from '../market/market.actions';
import { singlePanelLayoutFor } from '../../services/session-migration';
import { Timeframe } from '../../models';

const emptyCell = (): GridCell => ({ panelIds: [], activePanelId: '' });

/**
 * Resizes a tab's cell list to `count`. Growing appends empty cells; shrinking
 * merges the panels of the removed cells into the last kept cell so no panel
 * (and no descriptor) is ever lost by a template change.
 */
function normalizeCells(cells: GridCell[], count: number): GridCell[] {
  if (cells.length === count) return cells;
  if (cells.length < count) {
    return [...cells, ...Array.from({ length: count - cells.length }, emptyCell)];
  }
  const kept = cells.slice(0, count);
  const orphaned = cells.slice(count).flatMap((c) => c.panelIds);
  if (!orphaned.length) return kept;
  const last = kept[count - 1];
  const merged: GridCell = {
    panelIds: [...last.panelIds, ...orphaned],
    activePanelId: last.activePanelId || orphaned[0],
  };
  return [...kept.slice(0, count - 1), merged];
}

function countPanelsInTab(tab: TabLayout): number {
  return tab.cells.reduce((n, c) => n + c.panelIds.length, 0);
}

function updateTab(
  workspace: WorkspaceLayout,
  tabId: string,
  update: (tab: TabLayout) => TabLayout,
): WorkspaceLayout {
  return {
    ...workspace,
    tabs: workspace.tabs.map((t) => (t.id === tabId ? update(t) : t)),
  };
}

export const layoutFeature = createFeature({
  name: 'layout',
  reducer: createReducer(
    createInitialLayoutState(),
    on(LayoutActions.createTab, (state, { id, name }): LayoutState => {
      const tab: TabLayout = { id, name, template: '1', cells: [emptyCell()] };
      return {
        ...state,
        workspace: {
          tabs: [...state.workspace.tabs, tab],
          activeTabId: id,
        },
      };
    }),
    on(LayoutActions.closeTab, (state, { tabId }): LayoutState => {
      const { tabs, activeTabId } = state.workspace;
      const index = tabs.findIndex((t) => t.id === tabId);
      if (index === -1 || tabs.length === 1) return state;
      const closed = tabs[index];
      const remaining = tabs.filter((t) => t.id !== tabId);
      const closedIds = new Set(closed.cells.flatMap((c) => c.panelIds));
      const panels = Object.fromEntries(
        Object.entries(state.panels).filter(([id]) => !closedIds.has(id)),
      );
      const nextActive = activeTabId === tabId ? remaining[Math.max(0, index - 1)].id : activeTabId;
      return { ...state, workspace: { tabs: remaining, activeTabId: nextActive }, panels };
    }),
    on(LayoutActions.setActiveTab, (state, { tabId }): LayoutState => {
      if (!state.workspace.tabs.some((t) => t.id === tabId)) return state;
      return { ...state, workspace: { ...state.workspace, activeTabId: tabId } };
    }),
    on(LayoutActions.renameTab, (state, { tabId, name }): LayoutState => {
      if (!state.workspace.tabs.some((t) => t.id === tabId)) return state;
      return {
        ...state,
        workspace: updateTab(state.workspace, tabId, (tab) => ({ ...tab, name })),
      };
    }),
    on(LayoutActions.applyGridTemplate, (state, { tabId, template }): LayoutState => {
      if (!state.workspace.tabs.some((t) => t.id === tabId)) return state;
      return {
        ...state,
        workspace: updateTab(state.workspace, tabId, (tab) => ({
          ...tab,
          template,
          cells: normalizeCells(tab.cells, GRID_TEMPLATE_CELLS[template]),
        })),
      };
    }),
    on(LayoutActions.addPanel, (state, { tabId, cellIndex, descriptor }): LayoutState => {
      const tab = state.workspace.tabs.find((t) => t.id === tabId);
      if (!tab || cellIndex < 0 || cellIndex >= tab.cells.length) return state;
      // (R1) hard per-tab cap: reject the 9th panel
      if (countPanelsInTab(tab) >= MAX_PANELS_PER_TAB) return state;
      if (state.panels[descriptor.id]) return state;
      return {
        ...state,
        panels: { ...state.panels, [descriptor.id]: descriptor },
        workspace: updateTab(state.workspace, tabId, (t) => ({
          ...t,
          cells: t.cells.map((cell, i) =>
            i === cellIndex
              ? { panelIds: [...cell.panelIds, descriptor.id], activePanelId: descriptor.id }
              : cell,
          ),
        })),
      };
    }),
    on(LayoutActions.removePanel, (state, { panelId }): LayoutState => {
      if (!state.panels[panelId]) return state;
      const panels = Object.fromEntries(
        Object.entries(state.panels).filter(([id]) => id !== panelId),
      );
      return {
        ...state,
        panels,
        workspace: {
          ...state.workspace,
          tabs: state.workspace.tabs.map((tab) => ({
            ...tab,
            cells: tab.cells.map((cell) => {
              if (!cell.panelIds.includes(panelId)) return cell;
              const panelIds = cell.panelIds.filter((id) => id !== panelId);
              return {
                panelIds,
                activePanelId:
                  cell.activePanelId === panelId ? (panelIds[0] ?? '') : cell.activePanelId,
              };
            }),
          })),
        },
      };
    }),
    on(LayoutActions.setActivePanel, (state, { tabId, cellIndex, panelId }): LayoutState => {
      const tab = state.workspace.tabs.find((t) => t.id === tabId);
      const cell = tab?.cells[cellIndex];
      if (!cell || !cell.panelIds.includes(panelId)) return state;
      return {
        ...state,
        focusedPanelId: panelId,
        workspace: updateTab(state.workspace, tabId, (t) => ({
          ...t,
          cells: t.cells.map((c, i) => (i === cellIndex ? { ...c, activePanelId: panelId } : c)),
        })),
      };
    }),
    on(LayoutActions.movePanel, (state, { panelId, targetTabId, targetCellIndex }): LayoutState => {
      if (!state.panels[panelId]) return state;
      const targetTab = state.workspace.tabs.find((t) => t.id === targetTabId);
      if (!targetTab || targetCellIndex < 0 || targetCellIndex >= targetTab.cells.length)
        return state;
      const alreadyThere = targetTab.cells[targetCellIndex].panelIds.includes(panelId);
      if (alreadyThere) return state;
      const sourceTab = state.workspace.tabs.find((t) =>
        t.cells.some((c) => c.panelIds.includes(panelId)),
      )!;
      // R1 cap applies to the TARGET tab (unless moving within the same tab)
      if (sourceTab.id !== targetTabId && countPanelsInTab(targetTab) >= MAX_PANELS_PER_TAB) {
        return state;
      }
      return {
        ...state,
        workspace: {
          ...state.workspace,
          tabs: state.workspace.tabs.map((tab) => ({
            ...tab,
            cells: tab.cells.map((cell, i) => {
              const isTarget = tab.id === targetTabId && i === targetCellIndex;
              const holds = cell.panelIds.includes(panelId);
              if (holds && !isTarget) {
                const panelIds = cell.panelIds.filter((id) => id !== panelId);
                return {
                  panelIds,
                  activePanelId:
                    cell.activePanelId === panelId ? (panelIds[0] ?? '') : cell.activePanelId,
                };
              }
              if (isTarget && !holds) {
                return { panelIds: [...cell.panelIds, panelId], activePanelId: panelId };
              }
              return cell;
            }),
          })),
        },
      };
    }),
    on(LayoutActions.setPanelLinkGroup, (state, { panelId, linkGroupId }): LayoutState => {
      const panel = state.panels[panelId];
      if (!panel || panel.linkGroupId === linkGroupId) return state;
      return { ...state, panels: { ...state.panels, [panelId]: { ...panel, linkGroupId } } };
    }),
    on(LayoutActions.setPanelTimeframe, (state, { panelId, timeframe }): LayoutState => {
      const panel = state.panels[panelId];
      if (!panel || panel.timeframe === timeframe) return state;
      return { ...state, panels: { ...state.panels, [panelId]: { ...panel, timeframe } } };
    }),
    on(LayoutActions.setFocusedPanel, (state, { panelId }): LayoutState => {
      if (!state.panels[panelId] || state.focusedPanelId === panelId) return state;
      return { ...state, focusedPanelId: panelId };
    }),
    on(MarketActions.changeTimeframe, (state, { tf }): LayoutState => {
      const focusedId = state.focusedPanelId;
      if (!focusedId || !state.panels[focusedId]) return state;
      const panel = state.panels[focusedId];
      if (panel.timeframe === tf) return state;
      return {
        ...state,
        panels: {
          ...state.panels,
          [focusedId]: { ...panel, timeframe: tf },
        },
      };
    }),
    on(MarketActions.changeCustomTimeframe, (state, { minutes }): LayoutState => {
      const focusedId = state.focusedPanelId;
      if (!focusedId || !state.panels[focusedId]) return state;
      const panel = state.panels[focusedId];
      const customTf = `M${minutes}` as Timeframe;
      if (panel.timeframe === customTf) return state;
      return {
        ...state,
        panels: {
          ...state.panels,
          [focusedId]: { ...panel, timeframe: customTf },
        },
      };
    }),
    on(LayoutActions.restoreLayout, (_state, { layout, panels }): LayoutState => {
      const activeTab = layout.tabs.find((t) => t.id === layout.activeTabId);
      const focusedPanelId = activeTab?.cells[0]?.activePanelId ?? null;
      return {
        workspace: layout,
        panels,
        focusedPanelId,
      };
    }),
    on(WorkspacesActions.workspaceRestored, (_state, { workspace }): LayoutState => {
      const layout = workspace.layout;
      const panels = workspace.panels;
      if (layout && panels) {
        const activeTab = layout.tabs.find((t) => t.id === layout.activeTabId);
        const focusedPanelId = activeTab?.cells[0]?.activePanelId ?? null;
        return { workspace: layout, panels, focusedPanelId };
      }
      const fallback = singlePanelLayoutFor(workspace.symbol, workspace.activeTf ?? 'M1');
      const activeTab = fallback.layout.tabs.find((t) => t.id === fallback.layout.activeTabId);
      const focusedPanelId = activeTab?.cells[0]?.activePanelId ?? null;
      return { workspace: fallback.layout, panels: fallback.panels, focusedPanelId };
    }),
  ),
});

/** The tab currently projected by the WorkspaceViewport (null only if state is corrupt). */
export const selectActiveTab = createSelector(
  layoutFeature.selectWorkspace,
  (ws) => ws.tabs.find((t) => t.id === ws.activeTabId) ?? null,
);

/**
 * RFC-009 (D6): derived visibility — a panel is visible iff its tab is active
 * and it is its cell's activePanelId. One selector for ALL panels (single memo
 * slot, non-parametrized): consumers check their own id in the map. Never a
 * per-panel factory selector (D8 discipline).
 */
export const selectVisiblePanelIds = createSelector(
  layoutFeature.selectWorkspace,
  (ws): Record<string, true> => {
    const active = ws.tabs.find((t) => t.id === ws.activeTabId);
    if (!active) return {};
    const visible: Record<string, true> = {};
    for (const cell of active.cells) {
      if (cell.activePanelId) visible[cell.activePanelId] = true;
    }
    return visible;
  },
);
