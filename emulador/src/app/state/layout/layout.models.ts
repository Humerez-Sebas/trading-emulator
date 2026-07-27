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
  /** Per-panel local toggle: drops the shared group layer from THIS panel's composition only. Absent = false; never persisted as an explicit `false`. */
  hideSharedDrawings?: boolean;
}

/** '' on a descriptor means "whatever asset is active"; resolve it before use. */
export function effectivePanelSymbol(
  descriptor: PanelDescriptor,
  activeSymbol: string | null,
): string {
  return descriptor.symbol || activeSymbol || '';
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
  focusedPanelId: string | null;
}

/**
 * RFC-013 (D2) mono-panel cold-start default: one tab, '1' template, a single
 * panel of the active asset (M1). Keeps first launch visually identical to
 * the pre-workspace single-chart app; multi-panel is opt-in via the grid
 * template switcher (dynamic creation/close, RFC-009).
 */
export function createInitialLayoutState(): LayoutState {
  return {
    workspace: {
      tabs: [
        {
          id: 'tab-main',
          name: 'Principal',
          template: '1',
          cells: [{ panelIds: ['panel-1'], activePanelId: 'panel-1' }],
        },
      ],
      activeTabId: 'tab-main',
    },
    panels: {
      'panel-1': { id: 'panel-1', symbol: '', timeframe: 'M1', linkGroupId: null },
    },
    focusedPanelId: 'panel-1',
  };
}
