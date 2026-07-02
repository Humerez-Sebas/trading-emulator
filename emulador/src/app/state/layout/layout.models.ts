import { Timeframe } from '../../models';

/** (R1) Hard per-tab panel cap, derived from performance profiling (RFC-012). */
export const MAX_PANELS_PER_TAB = 8;

/** Closed, bounded single-level grid topology (no BSP / recursive splits). */
export type GridTemplate = '1' | '2h' | '2v' | '3' | '2x2' | '1+2' | '1+3';

/** Number of grid cells each template projects. */
export const GRID_TEMPLATE_CELLS: Record<GridTemplate, number> = {
  '1': 1,
  '2h': 2,
  '2v': 2,
  '3': 3,
  '2x2': 4,
  '1+2': 3,
  '1+3': 4,
};

/** Stable identity of one chart panel inside the Session. */
export interface PanelDescriptor {
  id: string;
  /** '' = active asset (primarySymbol wiring arrives with RFC-011). */
  symbol: string;
  timeframe: Timeframe;
  /** null = not linked; the layout reducer only transports it (sync = RFC-010). */
  linkGroupId: string | null;
}

/** A tab-group inside one grid cell: stacked panels, one visible at a time. */
export interface GridCell {
  panelIds: string[];
  /** '' when the cell has no panels (empty placeholder cell). */
  activePanelId: string;
}

export interface TabLayout {
  id: string;
  name: string;
  template: GridTemplate;
  cells: GridCell[];
}

export interface WorkspaceLayout {
  tabs: TabLayout[];
  activeTabId: string;
}

/** Runtime NgRx state of the `layout` feature (persistence shape = RFC-011). */
export interface LayoutState {
  workspace: WorkspaceLayout;
  /** Descriptor lookup for every panelId referenced by the cells. */
  panels: Record<string, PanelDescriptor>;
}

/**
 * RFC-008 fixed in-memory panel set: one tab, '2h' template, two panels of the
 * active asset (M1 | M5). Dynamic creation/close arrives with RFC-009.
 */
export function createInitialLayoutState(): LayoutState {
  return {
    workspace: {
      tabs: [
        {
          id: 'tab-main',
          name: 'Principal',
          template: '2h',
          cells: [
            { panelIds: ['panel-1'], activePanelId: 'panel-1' },
            { panelIds: ['panel-2'], activePanelId: 'panel-2' },
          ],
        },
      ],
      activeTabId: 'tab-main',
    },
    panels: {
      'panel-1': { id: 'panel-1', symbol: '', timeframe: 'M1', linkGroupId: null },
      'panel-2': { id: 'panel-2', symbol: '', timeframe: 'M5', linkGroupId: null },
    },
  };
}
