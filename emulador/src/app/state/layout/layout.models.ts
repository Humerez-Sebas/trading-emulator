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
  /** Per-panel local toggle (T-2): drops the trade layer from THIS panel only. Absent = false; never persisted as an explicit `false`. */
  hideTrades?: boolean;
}

/** '' on a descriptor means "whatever asset is active"; resolve it before use. */
export function effectivePanelSymbol(
  descriptor: PanelDescriptor,
  activeSymbol: string | null,
): string {
  return descriptor.symbol || activeSymbol || '';
}

/**
 * RFC-018 (T-1 ∧ T-2): where the Trade domain may speak. T-1 (the symbol clause) is a
 * correctness invariant and is NOT user-togglable — painting one instrument's levels on
 * another's price axis is a false statement about the market. T-2 (`hideTrades`) is a
 * panel-local preference. Mirrors `composePanelDrawings`: symbol filter + local opt-out.
 */
export function panelRendersTrades(
  descriptor: PanelDescriptor,
  primarySymbol: string | null,
): boolean {
  if (primarySymbol == null) return false;
  if (effectivePanelSymbol(descriptor, primarySymbol) !== primarySymbol) return false;
  return !descriptor.hideTrades;
}

/**
 * RFC-018 (T-3): may a trading verb originate from this pane? Deliberately ignores
 * `hideTrades` — hiding the layer is a visual preference, not a trading lockout. The
 * UI rule that a hidden-layer panel also retires its order verbs lives in the component
 * (RFC-018 §8), not in this predicate.
 */
export function panelMayExecute(
  descriptor: PanelDescriptor,
  primarySymbol: string | null,
): boolean {
  return (
    primarySymbol != null &&
    effectivePanelSymbol(descriptor, primarySymbol) === primarySymbol
  );
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
