# RFC-008 Panel System & Layout Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render N chart panels inside one Session via a tab-bar + single-level-grid host (`WorkspaceViewport`), with per-panel reactive derivation (`ChartModelMapper` local, D8) and the `ChartSyncBus` skeleton — without touching the audited mono-core render path.

**Architecture:** A new NgRx `layout` feature holds `WorkspaceLayout` (tabs → cells → stacked panels) plus a runtime `panels: Record<string, PanelDescriptor>` lookup. `ChartPanelComponent` is a thin wrapper that provides its own `ChartModelMapper`, embeds the audited `ChartComponent`, and forwards its interaction events to a session-scoped `ChartSyncBus` tagged with `panelId`. `WorkspaceViewport` projects the active tab's cells according to a closed `GridTemplate` enum using CSS grid.

**Tech Stack:** Angular 21 standalone components + signals, NgRx 21 (`createFeature`/`createActionGroup`), RxJS 7.8, Vitest 4 via `ng test`, lightweight-charts 5 types only.

## Global Constraints

- `MAX_PANELS_PER_TAB = 8` (R1) — hard cap **per tab** (sum across the tab's cells); the reducer rejects (no-op) the 9th panel.
- `type GridTemplate = '1' | '2h' | '2v' | '3' | '2x2' | '1+2' | '1+3'` — closed enum, single-level grid, no BSP/nesting (max depth 1).
- **FORBIDDEN:** shared NgRx factory selectors of the form `selectChartView(panelId)` anywhere in the `layout` feature or panel derivation path (single-slot thrash, P1 regression). Per-panel derivation = `combineLatest` over raw slice selectors inside each `ChartModelMapper` instance with **per-instance** memoization.
- **Audited-code protection:** `ChartEngine`, capabilities, and `ChartComponent` are NOT modified — with ONE sanctioned exception: Task 4 adds a single additive `chartReady` output to `ChartComponent` (no behavioral change), required by RFC-008 Decision 1 ("ChartPanelComponent … expone los eventos de interaccion hacia el ChartSyncBus") since the engine's event bus is private to the component. Nothing else in `chart.component.ts` may change.
- **No page integration in RFC-008:** the emulador page keeps its single `<app-chart>`. RFC-008 validates the host with the fixed in-memory panel set (initial layout state) via component tests; hot mounting arrives with RFC-009 lifecycle.
- **No new dependencies.** Everything uses libraries already in `package.json`.
- `emulador/src/app/domain/**` must have zero `@angular/*` / `@ngrx/*` imports (`rxjs` and `lightweight-charts` types are allowed — precedent: `chart-event-bus.ts` imports lightweight-charts).
- `PanelDescriptor.symbol = ''` in the fixed initial set means "active asset" (the market slice is not symbol-keyed yet; `primarySymbol` wiring is RFC-011).
- Verification per task (run from `emulador/`):
  - `npx tsc -p tsconfig.app.json --noEmit` → zero errors
  - `npx tsc -p tsconfig.spec.json --noEmit` → zero errors
  - `npm test -- --watch=false` → all tests green
- Task-scoped conventional commits (`feat(layout): …`, `feat(chart): …`, `test(…): …`).

---

### Task 1: NgRx `layout` feature (models, actions, reducer, registration)

**Files:**
- Create: `emulador/src/app/state/layout/layout.models.ts`
- Create: `emulador/src/app/state/layout/layout.actions.ts`
- Create: `emulador/src/app/state/layout/layout.reducer.ts`
- Test: `emulador/src/app/state/layout/layout.reducer.spec.ts`
- Modify: `emulador/src/app/app.config.ts` (register `layoutFeature`)

**Interfaces:**
- Consumes: `Timeframe` from `emulador/src/app/models.ts`.
- Produces (later tasks rely on these exact names):
  - `MAX_PANELS_PER_TAB: 8`, `GridTemplate`, `GRID_TEMPLATE_CELLS: Record<GridTemplate, number>`
  - `PanelDescriptor { id: string; symbol: string; timeframe: Timeframe; linkGroupId: string | null }`
  - `GridCell { panelIds: string[]; activePanelId: string }` (empty cell ⇒ `activePanelId === ''`)
  - `TabLayout { id: string; name: string; template: GridTemplate; cells: GridCell[] }`
  - `WorkspaceLayout { tabs: TabLayout[]; activeTabId: string }`
  - `LayoutState { workspace: WorkspaceLayout; panels: Record<string, PanelDescriptor> }`
  - `LayoutActions.createTab / closeTab / setActiveTab / applyGridTemplate / addPanel / removePanel / setActivePanel`
  - `layoutFeature` (name `'layout'`) with generated `selectWorkspace`, `selectPanels`; composed `selectActiveTab`.

- [ ] **Step 1: Create the models file**

`emulador/src/app/state/layout/layout.models.ts`:

```ts
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
```

- [ ] **Step 2: Create the actions file**

`emulador/src/app/state/layout/layout.actions.ts`:

```ts
import { createActionGroup, props } from '@ngrx/store';
import { GridTemplate, PanelDescriptor } from './layout.models';

export const LayoutActions = createActionGroup({
  source: 'Layout',
  events: {
    /** Appends a tab (template '1', one empty cell) and activates it. Ids come from the caller (reducer stays pure). */
    'Create Tab': props<{ id: string; name: string }>(),
    /** Removes the tab and its panels' descriptors. Closing the last remaining tab is a no-op. */
    'Close Tab': props<{ tabId: string }>(),
    'Set Active Tab': props<{ tabId: string }>(),
    /** Resizes the tab's cells to the template; panels of removed cells merge into the last kept cell. */
    'Apply Grid Template': props<{ tabId: string; template: GridTemplate }>(),
    /** No-op if the tab already holds MAX_PANELS_PER_TAB panels or cellIndex is out of range. */
    'Add Panel': props<{ tabId: string; cellIndex: number; descriptor: PanelDescriptor }>(),
    'Remove Panel': props<{ panelId: string }>(),
    /** No-op unless the cell actually contains panelId. */
    'Set Active Panel': props<{ tabId: string; cellIndex: number; panelId: string }>(),
  },
});
```

- [ ] **Step 3: Write the failing reducer spec**

`emulador/src/app/state/layout/layout.reducer.spec.ts`:

```ts
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
```

- [ ] **Step 4: Run the spec to verify it fails**

Run (from `emulador/`): `npm test -- --watch=false`
Expected: FAIL — cannot resolve `./layout.reducer`.

- [ ] **Step 5: Implement the reducer**

`emulador/src/app/state/layout/layout.reducer.ts`:

```ts
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
      const nextActive =
        activeTabId === tabId ? remaining[Math.max(0, index - 1)].id : activeTabId;
      return { workspace: { tabs: remaining, activeTabId: nextActive }, panels };
    }),
    on(LayoutActions.setActiveTab, (state, { tabId }): LayoutState => {
      if (!state.workspace.tabs.some((t) => t.id === tabId)) return state;
      return { ...state, workspace: { ...state.workspace, activeTabId: tabId } };
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
      const { [panelId]: _removed, ...panels } = state.panels;
      return {
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
        workspace: updateTab(state.workspace, tabId, (t) => ({
          ...t,
          cells: t.cells.map((c, i) => (i === cellIndex ? { ...c, activePanelId: panelId } : c)),
        })),
      };
    }),
  ),
});

/** The tab currently projected by the WorkspaceViewport (null only if state is corrupt). */
export const selectActiveTab = createSelector(
  layoutFeature.selectWorkspace,
  (ws) => ws.tabs.find((t) => t.id === ws.activeTabId) ?? null,
);
```

- [ ] **Step 6: Register the feature in the store**

In `emulador/src/app/app.config.ts` add the import:

```ts
import { layoutFeature } from './state/layout/layout.reducer';
```

and add the entry inside `provideStore({ … })` after `authFeature`:

```ts
      [layoutFeature.name]: layoutFeature.reducer,
```

- [ ] **Step 7: Run the spec to verify it passes**

Run (from `emulador/`): `npm test -- --watch=false`
Expected: PASS (all suites, including the 13 new layout tests).

- [ ] **Step 8: Compile**

Run (from `emulador/`): `npx tsc -p tsconfig.app.json --noEmit` then `npx tsc -p tsconfig.spec.json --noEmit`
Expected: zero errors.

- [ ] **Step 9: Commit**

```bash
git add emulador/src/app/state/layout emulador/src/app/app.config.ts
git commit -m "feat(layout): add NgRx layout feature with tabs, single-level grid and MAX_PANELS_PER_TAB guard (RFC-008 Task 1)"
```

---

### Task 2: `ChartSyncBus` skeleton (multiplexed, per-Session event hub)

**Files:**
- Create: `emulador/src/app/domain/chart/chart-sync-bus.ts`
- Test: `emulador/src/app/domain/chart/chart-sync-bus.spec.ts`

**Interfaces:**
- Consumes: `MouseEventParams<Time>`, `LogicalRange` from `lightweight-charts` (types only, same as `chart-event-bus.ts`).
- Produces (Tasks 4-5 and RFC-009/010 rely on):
  - `PanelSyncEventMap { CrosshairMoved: MouseEventParams<Time>; VisibleRangeChanged: LogicalRange | null }`
  - `PanelSyncEventType = keyof PanelSyncEventMap`
  - `PanelSyncEvent` (discriminated union `{ panelId, type, payload }`)
  - `class ChartSyncBus { events$: Observable<PanelSyncEvent>; emit<K>(panelId: string, type: K, payload: PanelSyncEventMap[K]): void; destroy(): void }`
- Constraint: NO `@angular/*` / `@ngrx/*` imports (domain purity). No sync logic — skeleton only (RFC-010 adds routing).

- [ ] **Step 1: Write the failing smoke spec**

`emulador/src/app/domain/chart/chart-sync-bus.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { MouseEventParams, Time } from 'lightweight-charts';
import { ChartSyncBus, PanelSyncEvent } from './chart-sync-bus';

const crosshair = { point: { x: 10, y: 20 } } as unknown as MouseEventParams<Time>;

describe('ChartSyncBus (RFC-008 skeleton)', () => {
  it('emits events tagged with the source panelId', () => {
    const bus = new ChartSyncBus();
    const seen: PanelSyncEvent[] = [];
    bus.events$.subscribe((e) => seen.push(e));
    bus.emit('panel-1', 'CrosshairMoved', crosshair);
    expect(seen).toEqual([{ panelId: 'panel-1', type: 'CrosshairMoved', payload: crosshair }]);
  });

  it('multiplexes events from several panels over one stream, in order', () => {
    const bus = new ChartSyncBus();
    const seen: string[] = [];
    bus.events$.subscribe((e) => seen.push(`${e.panelId}:${e.type}`));
    bus.emit('panel-1', 'VisibleRangeChanged', { from: 0, to: 100 } as never);
    bus.emit('panel-2', 'CrosshairMoved', crosshair);
    bus.emit('panel-1', 'CrosshairMoved', crosshair);
    expect(seen).toEqual([
      'panel-1:VisibleRangeChanged',
      'panel-2:CrosshairMoved',
      'panel-1:CrosshairMoved',
    ]);
  });

  it('delivers each event to every subscriber', () => {
    const bus = new ChartSyncBus();
    let a = 0;
    let b = 0;
    bus.events$.subscribe(() => a++);
    bus.events$.subscribe(() => b++);
    bus.emit('panel-1', 'VisibleRangeChanged', null);
    expect(a).toBe(1);
    expect(b).toBe(1);
  });

  it('does not replay past events to late subscribers', () => {
    const bus = new ChartSyncBus();
    bus.emit('panel-1', 'CrosshairMoved', crosshair);
    let late = 0;
    bus.events$.subscribe(() => late++);
    expect(late).toBe(0);
  });

  it('destroy() completes the stream', () => {
    const bus = new ChartSyncBus();
    let completed = false;
    bus.events$.subscribe({ complete: () => (completed = true) });
    bus.destroy();
    expect(completed).toBe(true);
  });
});
```

- [ ] **Step 2: Run the spec to verify it fails**

Run (from `emulador/`): `npm test -- --watch=false`
Expected: FAIL — cannot resolve `./chart-sync-bus`.

- [ ] **Step 3: Implement the bus**

`emulador/src/app/domain/chart/chart-sync-bus.ts`:

```ts
import { LogicalRange, MouseEventParams, Time } from 'lightweight-charts';
import { Observable, Subject } from 'rxjs';

/**
 * RFC-008: payloads of the per-panel interaction events forwarded to the bus.
 * Mirrors `ChartEventMap` minus `ChartClicked` (clicks are panel-local; only
 * crosshair and visible-range participate in cross-panel sync, RFC-010).
 */
export interface PanelSyncEventMap {
  CrosshairMoved: MouseEventParams<Time>;
  VisibleRangeChanged: LogicalRange | null;
}

export type PanelSyncEventType = keyof PanelSyncEventMap;

/** One multiplexed bus event: the source panel, the kind, and its payload. */
export type PanelSyncEvent = {
  [K in PanelSyncEventType]: { panelId: string; type: K; payload: PanelSyncEventMap[K] };
}[PanelSyncEventType];

/**
 * RFC-008 skeleton of the per-Session multiplexed event hub (one instance per
 * Session, provided by the WorkspaceViewport — NOT one per panel). Panels emit
 * their interaction events tagged with their `panelId`; the bus only exposes
 * them as a multiplexed observable. NO synchronization logic lives here yet:
 * routing by link group is RFC-010; nobody subscribes in RFC-008 except the
 * bus's own smoke tests.
 *
 * Framework-agnostic on purpose (domain layer): plain class + RxJS, provided
 * via `useFactory` — never decorated with `@Injectable`.
 */
export class ChartSyncBus {
  private readonly subject = new Subject<PanelSyncEvent>();

  /** Multiplexed stream of every panel's interaction events. */
  readonly events$: Observable<PanelSyncEvent> = this.subject.asObservable();

  emit<K extends PanelSyncEventType>(
    panelId: string,
    type: K,
    payload: PanelSyncEventMap[K],
  ): void {
    this.subject.next({ panelId, type, payload } as PanelSyncEvent);
  }

  destroy(): void {
    this.subject.complete();
  }
}
```

- [ ] **Step 4: Run the spec to verify it passes**

Run (from `emulador/`): `npm test -- --watch=false`
Expected: PASS.

- [ ] **Step 5: Verify domain purity and compile**

Run (from `emulador/`): `npx tsc -p tsconfig.app.json --noEmit` then `npx tsc -p tsconfig.spec.json --noEmit`
Expected: zero errors.
Check: `chart-sync-bus.ts` imports only `lightweight-charts` and `rxjs` — zero `@angular/*` / `@ngrx/*`.

- [ ] **Step 6: Commit**

```bash
git add emulador/src/app/domain/chart/chart-sync-bus.ts emulador/src/app/domain/chart/chart-sync-bus.spec.ts
git commit -m "feat(chart): add ChartSyncBus multiplexed event hub skeleton (RFC-008 Task 2)"
```

---

### Task 3: Per-panel parametrized derivation in `ChartModelMapper` (D8)

**Files:**
- Modify: `emulador/src/app/components/chart/chart-model-mapper.service.ts` (additive only — existing observables/builders untouched)
- Test: `emulador/src/app/components/chart/chart-model-mapper.service.spec.ts` (append a new `describe` block)

**Interfaces:**
- Consumes: `PanelDescriptor` (Task 1), `selectSeries`, `selectCurrentTime`, `selectUtcOffset` from `../../state/selectors`, `lastIndexAtOrBefore(candles: Candle[], t: number): number` from `../../state/trading/fill-engine` (returns -1 when empty/before-first — reuse, do NOT duplicate the binary search).
- Produces (Task 4 relies on):
  - `interface PanelChartView { symbol: string; timeframe: Timeframe; candles: Candle[]; idx: number; utcOffset: number }`
  - `ChartModelMapper.configurePanel(descriptor: PanelDescriptor): void`
  - `ChartModelMapper.panelChartView$: Observable<PanelChartView>` (no emission before `configurePanel`)
- Discipline (D8): `combineLatest` over raw slice selectors + ONE memo slot **per mapper instance**; NO shared parametrized factory selector. Emission is reference-stable when the panel's own inputs did not change.

- [ ] **Step 1: Write the failing spec (append to the existing spec file)**

Add these imports at the top of `chart-model-mapper.service.spec.ts`, and extend the existing `./chart-model-mapper.service` import with `PanelChartView`:

```ts
import { vi } from 'vitest';
import { ChartModelMapper, PanelChartView } from './chart-model-mapper.service';
import { selectCurrentTime, selectSeries, selectUtcOffset } from '../../state/selectors';
import { PanelDescriptor } from '../../state/layout/layout.models';
import { Candle } from '../../models';
```

Append this `describe` block inside the top-level `describe('ChartModelMapper', …)`:

```ts
  describe('panelChartView$ (RFC-008 D8: per-panel parametrized derivation)', () => {
    const candle = (time: number, close = 1): Candle => ({
      time, open: close, high: close, low: close, close,
    });
    const m1 = [candle(100), candle(160), candle(220)];
    const m5 = [candle(100), candle(400)];
    const panel = (id: string, timeframe: 'M1' | 'M5'): PanelDescriptor => ({
      id, symbol: 'SP500', timeframe, linkGroupId: null,
    });

    beforeEach(() => {
      store.overrideSelector(selectSeries, { M1: m1, M5: m5 });
      store.overrideSelector(selectCurrentTime, 200);
      store.overrideSelector(selectUtcOffset, 0);
    });

    it('does not emit before configurePanel is called', () => {
      const emissions: unknown[] = [];
      mapper.panelChartView$.subscribe((v) => emissions.push(v));
      expect(emissions).toHaveLength(0);
    });

    it('derives candles and the at-or-before replay index for its own timeframe', () => {
      mapper.configurePanel(panel('p1', 'M1'));
      let view: PanelChartView | undefined;
      mapper.panelChartView$.subscribe((v) => (view = v));
      expect(view!.symbol).toBe('SP500');
      expect(view!.timeframe).toBe('M1');
      expect(view!.candles).toBe(m1);
      expect(view!.idx).toBe(1); // last candle at-or-before t=200 is time=160
      expect(view!.utcOffset).toBe(0);
    });

    it('yields empty candles and idx -1 for a timeframe with no loaded series', () => {
      mapper.configurePanel({ id: 'p1', symbol: 'SP500', timeframe: 'H4', linkGroupId: null });
      let view: PanelChartView | undefined;
      mapper.panelChartView$.subscribe((v) => (view = v));
      expect(view!.candles).toEqual([]);
      expect(view!.idx).toBe(-1);
    });

    it('ISOLATION (Estado Esperado): a change in one panel state does not recompute the others', () => {
      // two independent mapper instances sharing the same store (N panels => N memo slots)
      const mapperA = TestBed.runInInjectionContext(() => new ChartModelMapper());
      const mapperB = TestBed.runInInjectionContext(() => new ChartModelMapper());
      mapperA.configurePanel(panel('a', 'M1'));
      mapperB.configurePanel(panel('b', 'M5'));

      type WithCompute = { computePanelView: (...args: unknown[]) => unknown };
      const computeA = vi.spyOn(mapperA as unknown as WithCompute, 'computePanelView');
      const computeB = vi.spyOn(mapperB as unknown as WithCompute, 'computePanelView');
      let emissionsA = 0;
      let emissionsB = 0;
      mapperA.panelChartView$.subscribe(() => emissionsA++);
      mapperB.panelChartView$.subscribe(() => emissionsB++);
      expect(emissionsA).toBe(1);
      expect(emissionsB).toBe(1);
      const computedA = computeA.mock.calls.length;
      const computedB = computeB.mock.calls.length;

      // M1 gets a new candle array; the M5 array reference is unchanged
      store.overrideSelector(selectSeries, { M1: [...m1, candle(280)], M5: m5 });
      store.refreshState();

      // panel A recomputed and re-emitted…
      expect(computeA.mock.calls.length).toBe(computedA + 1);
      expect(emissionsA).toBe(2);
      // …panel B did NOT recompute its RenderModel nor re-emit
      expect(computeB.mock.calls.length).toBe(computedB);
      expect(emissionsB).toBe(1);
    });

    it('the global replay cursor recomputes every panel (single replay clock)', () => {
      const mapperA = TestBed.runInInjectionContext(() => new ChartModelMapper());
      mapperA.configurePanel(panel('a', 'M1'));
      let idx = -99;
      mapperA.panelChartView$.subscribe((v) => (idx = v.idx));
      expect(idx).toBe(1);
      store.overrideSelector(selectCurrentTime, 230);
      store.refreshState();
      expect(idx).toBe(2);
    });
  });
```

Note: the existing spec's `beforeEach` calls `provideMockStore()` with no selector defaults; the overrides above run before each test of this block, and `store.refreshState()` re-emits after an override changes. The `Candle` interface is exactly `{ time, open, high, low, close }` (`domain/chart/render-model.ts`, re-exported by `models.ts`) — the `candle()` helper above matches it.

- [ ] **Step 2: Run the spec to verify it fails**

Run (from `emulador/`): `npm test -- --watch=false`
Expected: FAIL — `configurePanel` / `panelChartView$` do not exist.

- [ ] **Step 3: Implement the additive mapper extension**

In `chart-model-mapper.service.ts`:

1. Extend the rxjs imports: `import { combineLatest, Observable, ReplaySubject } from 'rxjs';` and `import { distinctUntilChanged, map } from 'rxjs/operators';`
2. Add to the selector imports from `'../../state/selectors'`: `selectCurrentTime`, `selectSeries`, `selectUtcOffset`.
3. Add new imports:

```ts
import { lastIndexAtOrBefore } from '../../state/trading/fill-engine';
import { PanelDescriptor } from '../../state/layout/layout.models';
import { Candle, Timeframe } from '../../models';
```

4. Add the exported view interface (top level, after the imports):

```ts
/**
 * RFC-008 (D8): the per-panel chart view derived by a panel-local mapper
 * instance from raw NgRx slices, parametrized by the panel's descriptor.
 */
export interface PanelChartView {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
  idx: number;
  utcOffset: number;
}
```

5. Add inside the `ChartModelMapper` class (new section after the existing selector observables):

```ts
  // ───────── RFC-008: per-panel parametrized derivation (D8) ─────────

  /** Descriptor of the panel this instance serves (ReplaySubject: late-subscription safe). */
  private readonly panelDescriptor$ = new ReplaySubject<PanelDescriptor>(1);

  /** One memo slot per mapper instance — N panels ⇒ N independent memoizers. */
  private lastPanelInputs: {
    descriptor: PanelDescriptor;
    candles: Candle[] | undefined;
    currentTime: number;
    utcOffset: number;
  } | null = null;
  private lastPanelView: PanelChartView | null = null;

  /** Parametrizes this instance with its panel's identity. Idempotent. */
  configurePanel(descriptor: PanelDescriptor): void {
    this.panelDescriptor$.next(descriptor);
  }

  /** Pure recompute — spied on by the RFC-008 isolation test; called on memo miss only. */
  private computePanelView(
    descriptor: PanelDescriptor,
    candles: Candle[],
    currentTime: number,
    utcOffset: number,
  ): PanelChartView {
    return {
      symbol: descriptor.symbol,
      timeframe: descriptor.timeframe,
      candles,
      idx: lastIndexAtOrBefore(candles, currentTime),
      utcOffset,
    };
  }

  /**
   * Per-panel view composed with `combineLatest` over RAW slice selectors and
   * memoized per instance. Deliberately NOT a shared NgRx factory selector
   * (`selectChartView(panelId)`): a single-slot memo receiving alternating
   * panelIds would invalidate on every tick (0% hit rate) — the P1 defect this
   * RFC forbids re-introducing. Emissions are reference-stable when this
   * panel's own inputs did not change.
   */
  readonly panelChartView$: Observable<PanelChartView> = combineLatest([
    this.panelDescriptor$,
    this.store.select(selectSeries),
    this.store.select(selectCurrentTime),
    this.store.select(selectUtcOffset),
  ]).pipe(
    map(([descriptor, series, currentTime, utcOffset]) => {
      const candles = series[descriptor.timeframe];
      const last = this.lastPanelInputs;
      if (
        last &&
        last.descriptor === descriptor &&
        last.candles === candles &&
        last.currentTime === currentTime &&
        last.utcOffset === utcOffset
      ) {
        return this.lastPanelView!;
      }
      this.lastPanelInputs = { descriptor, candles, currentTime, utcOffset };
      this.lastPanelView = this.computePanelView(descriptor, candles ?? [], currentTime, utcOffset);
      return this.lastPanelView;
    }),
    distinctUntilChanged(),
  );
```

Keep the existing `import { map } from 'rxjs/operators';` merged with the new operators import (one line, no duplicates).

- [ ] **Step 4: Run the spec to verify it passes**

Run (from `emulador/`): `npm test -- --watch=false`
Expected: PASS — including the isolation test and all pre-existing mapper tests (regression guard: `chartStyle$`, builders, etc. must stay green untouched).

- [ ] **Step 5: Compile**

Run (from `emulador/`): `npx tsc -p tsconfig.app.json --noEmit` then `npx tsc -p tsconfig.spec.json --noEmit`
Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add emulador/src/app/components/chart/chart-model-mapper.service.ts emulador/src/app/components/chart/chart-model-mapper.service.spec.ts
git commit -m "feat(chart): add per-panel parametrized PanelChartView derivation to ChartModelMapper (RFC-008 Task 3, D8)"
```

---

### Task 4: `ChartPanelComponent` wrapper + `chartReady` output on `ChartComponent`

**Files:**
- Modify: `emulador/src/app/components/chart/chart.component.ts` (SANCTIONED additive-only change: one output + one emit line)
- Create: `emulador/src/app/components/workspace/chart-panel.component.ts`
- Test: `emulador/src/app/components/workspace/chart-panel.component.spec.ts`

**Interfaces:**
- Consumes: `ChartModelMapper.configurePanel` / `panelChartView$` (Task 3), `ChartSyncBus.emit` (Task 2), `PanelDescriptor` (Task 1), `ChartEventBus`/`Unsubscribe` from `domain/chart/chart-event-bus`.
- Produces (Task 5 relies on):
  - `ChartComponent.chartReady: OutputEmitterRef<ChartEventBus>` — emits the engine's event bus once in `ngAfterViewInit`.
  - `ChartPanelComponent` (selector `app-chart-panel`), `descriptor = input.required<PanelDescriptor>()`, `providers: [ChartModelMapper]`, injects `ChartSyncBus` from the parent injector.

- [ ] **Step 1: Add the sanctioned additive output to `ChartComponent`**

In `emulador/src/app/components/chart/chart.component.ts`:

1. Add `output` to the existing `@angular/core` import list.
2. Add to the existing domain imports: `import { ChartEventBus } from '../../domain/chart/chart-event-bus';`
3. Add this field right after `dragInfo = signal<string | null>(null);`:

```ts
  /**
   * RFC-008: exposes the engine's interaction event bus so the wrapping
   * ChartPanelComponent can forward crosshair/range events to the ChartSyncBus.
   * Additive only — the audited render path is unchanged.
   */
  readonly chartReady = output<ChartEventBus>();
```

4. In `ngAfterViewInit`, immediately after the `this.busUnsubs.push( … );` block (before `window.addEventListener('keydown', …)`), add:

```ts
    this.chartReady.emit(this.engine.events);
```

No other line of `chart.component.ts` may change.

- [ ] **Step 2: Write the failing panel spec**

`emulador/src/app/components/workspace/chart-panel.component.spec.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Component, output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { MouseEventParams, Time } from 'lightweight-charts';
import { ChartPanelComponent } from './chart-panel.component';
import { ChartComponent } from '../chart/chart.component';
import { ChartModelMapper } from '../chart/chart-model-mapper.service';
import { ChartEventBus } from '../../domain/chart/chart-event-bus';
import { ChartSyncBus, PanelSyncEvent } from '../../domain/chart/chart-sync-bus';
import { selectCurrentTime, selectSeries, selectUtcOffset } from '../../state/selectors';
import { PanelDescriptor } from '../../state/layout/layout.models';

/** Stub of the audited ChartComponent: no engine, no canvas — just the output. */
@Component({ selector: 'app-chart', standalone: true, template: '' })
class ChartStubComponent {
  readonly chartReady = output<ChartEventBus>();
}

const descriptor: PanelDescriptor = {
  id: 'panel-1',
  symbol: 'SP500',
  timeframe: 'M5',
  linkGroupId: null,
};

describe('ChartPanelComponent', () => {
  let store: MockStore;
  let syncBus: ChartSyncBus;

  beforeEach(() => {
    syncBus = new ChartSyncBus();
    TestBed.configureTestingModule({
      imports: [ChartPanelComponent],
      providers: [provideMockStore(), { provide: ChartSyncBus, useValue: syncBus }],
    });
    TestBed.overrideComponent(ChartPanelComponent, {
      remove: { imports: [ChartComponent] },
      add: { imports: [ChartStubComponent] },
    });
    store = TestBed.inject(MockStore);
    store.overrideSelector(selectSeries, {
      M5: [{ time: 100, open: 1, high: 1, low: 1, close: 42 }],
    });
    store.overrideSelector(selectCurrentTime, 100);
    store.overrideSelector(selectUtcOffset, 0);
  });

  function create(desc: PanelDescriptor = descriptor) {
    const fixture = TestBed.createComponent(ChartPanelComponent);
    fixture.componentRef.setInput('descriptor', desc);
    fixture.detectChanges();
    return fixture;
  }

  it('shows the panel identity (symbol · timeframe) in the header', () => {
    const fixture = create();
    const header: HTMLElement = fixture.nativeElement.querySelector('.panel-label');
    expect(header.textContent).toContain('SP500 · M5');
  });

  it('configures its own mapper with the descriptor', () => {
    const fixture = TestBed.createComponent(ChartPanelComponent);
    const mapper = fixture.debugElement.injector.get(ChartModelMapper);
    const spy = vi.spyOn(mapper, 'configurePanel');
    fixture.componentRef.setInput('descriptor', descriptor);
    fixture.detectChanges();
    expect(spy).toHaveBeenCalledWith(descriptor);
  });

  it('provides an isolated ChartModelMapper per panel instance', () => {
    const a = create();
    const b = create({ ...descriptor, id: 'panel-2' });
    const mapperA = a.debugElement.injector.get(ChartModelMapper);
    const mapperB = b.debugElement.injector.get(ChartModelMapper);
    expect(mapperA).not.toBe(mapperB);
  });

  it('forwards chart interaction events to the ChartSyncBus tagged with its panelId', () => {
    const fixture = create();
    const events: PanelSyncEvent[] = [];
    syncBus.events$.subscribe((e) => events.push(e));

    const engineBus = new ChartEventBus();
    const stub = fixture.debugElement.query(By.directive(ChartStubComponent));
    stub.componentInstance.chartReady.emit(engineBus);

    const params = { point: { x: 1, y: 2 } } as unknown as MouseEventParams<Time>;
    engineBus.emit('CrosshairMoved', params);
    engineBus.emit('VisibleRangeChanged', null);

    expect(events).toEqual([
      { panelId: 'panel-1', type: 'CrosshairMoved', payload: params },
      { panelId: 'panel-1', type: 'VisibleRangeChanged', payload: null },
    ]);
  });

  it('stops forwarding after destroy', () => {
    const fixture = create();
    const events: PanelSyncEvent[] = [];
    syncBus.events$.subscribe((e) => events.push(e));
    const engineBus = new ChartEventBus();
    const stub = fixture.debugElement.query(By.directive(ChartStubComponent));
    stub.componentInstance.chartReady.emit(engineBus);
    fixture.destroy();
    engineBus.emit('VisibleRangeChanged', null);
    expect(events).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run the spec to verify it fails**

Run (from `emulador/`): `npm test -- --watch=false`
Expected: FAIL — cannot resolve `./chart-panel.component`.

- [ ] **Step 4: Implement the panel component**

`emulador/src/app/components/workspace/chart-panel.component.ts`:

```ts
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ChartComponent } from '../chart/chart.component';
import { ChartModelMapper } from '../chart/chart-model-mapper.service';
import { ChartEventBus, Unsubscribe } from '../../domain/chart/chart-event-bus';
import { ChartSyncBus } from '../../domain/chart/chart-sync-bus';
import { PanelDescriptor } from '../../state/layout/layout.models';

/**
 * RFC-008: thin wrapper around the audited ChartComponent — one instance per
 * `PanelDescriptor.id`, no implicit shared state between instances.
 *
 * - Provides its OWN `ChartModelMapper` (D8: per-panel derivation + memo slot).
 * - Forwards the chart's interaction events (crosshair, visible range) to the
 *   session's `ChartSyncBus`, tagged with this panel's id.
 */
@Component({
  selector: 'app-chart-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ChartModelMapper],
  imports: [ChartComponent],
  template: `
    <div class="panel-header">
      <span class="panel-label">{{ headerLabel() }}</span>
      @if (lastClose() !== null) {
        <span class="panel-price">{{ lastClose() }}</span>
      }
    </div>
    <app-chart class="panel-chart" (chartReady)="onChartReady($event)" />
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        overflow: hidden;
      }
      .panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 4px 8px;
        font-size: 11.5px;
        color: var(--text-muted);
        border-bottom: 1px solid var(--border);
      }
      .panel-label {
        font-weight: 600;
      }
      .panel-chart {
        flex: 1;
        min-height: 0;
      }
    `,
  ],
})
export class ChartPanelComponent implements OnDestroy {
  readonly descriptor = input.required<PanelDescriptor>();

  private readonly mapper = inject(ChartModelMapper);
  private readonly syncBus = inject(ChartSyncBus);
  private busUnsubs: Unsubscribe[] = [];

  /** Panel-local view (own mapper instance, own memo slot — D8). */
  private readonly panelView = toSignal(this.mapper.panelChartView$, { initialValue: null });

  readonly headerLabel = computed(() => {
    const d = this.descriptor();
    return d.symbol ? `${d.symbol} · ${d.timeframe}` : d.timeframe;
  });

  readonly lastClose = computed(() => {
    const view = this.panelView();
    if (!view || view.idx < 0) return null;
    return view.candles[view.idx]?.close ?? null;
  });

  constructor() {
    effect(() => this.mapper.configurePanel(this.descriptor()));
  }

  /** Wires the wrapped chart's engine bus into the session ChartSyncBus. */
  onChartReady(events: ChartEventBus): void {
    this.busUnsubs.push(
      events.on('CrosshairMoved', (p) =>
        this.syncBus.emit(this.descriptor().id, 'CrosshairMoved', p),
      ),
      events.on('VisibleRangeChanged', (r) =>
        this.syncBus.emit(this.descriptor().id, 'VisibleRangeChanged', r),
      ),
    );
  }

  ngOnDestroy(): void {
    this.busUnsubs.forEach((off) => off());
    this.busUnsubs = [];
  }
}
```

- [ ] **Step 5: Run the spec to verify it passes**

Run (from `emulador/`): `npm test -- --watch=false`
Expected: PASS (all suites — the whole pre-existing suite guards the `chart.component.ts` touch).

- [ ] **Step 6: Compile**

Run (from `emulador/`): `npx tsc -p tsconfig.app.json --noEmit` then `npx tsc -p tsconfig.spec.json --noEmit`
Expected: zero errors.

- [ ] **Step 7: Commit**

```bash
git add emulador/src/app/components/workspace emulador/src/app/components/chart/chart.component.ts
git commit -m "feat(workspace): add ChartPanelComponent wrapper wired to ChartSyncBus (RFC-008 Task 4)"
```

---

### Task 5: `WorkspaceViewport` (tab bar + single-level grid host)

**Files:**
- Create: `emulador/src/app/components/workspace/workspace-viewport.component.ts`
- Test: `emulador/src/app/components/workspace/workspace-viewport.component.spec.ts`

**Interfaces:**
- Consumes: `layoutFeature.selectWorkspace` / `selectPanels`, `selectActiveTab`, `LayoutActions.setActiveTab` / `setActivePanel` (Task 1), `ChartPanelComponent` (Task 4), `ChartSyncBus` (Task 2).
- Produces: `WorkspaceViewportComponent` (selector `app-workspace-viewport`) providing the per-Session `ChartSyncBus` via `useFactory`. Not mounted in any page in RFC-008 (fixed in-memory panel set; hot integration = RFC-009).

- [ ] **Step 1: Write the failing spec**

`emulador/src/app/components/workspace/workspace-viewport.component.spec.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { WorkspaceViewportComponent } from './workspace-viewport.component';
import { ChartPanelComponent } from './chart-panel.component';
import { LayoutActions } from '../../state/layout/layout.actions';
import { LayoutState, PanelDescriptor } from '../../state/layout/layout.models';

/** Stub panel: renders nothing, keeps the required input contract. */
@Component({ selector: 'app-chart-panel', standalone: true, template: '' })
class ChartPanelStubComponent {
  readonly descriptor = input.required<PanelDescriptor>();
}

const desc = (id: string, timeframe: 'M1' | 'M5' | 'M15' = 'M1'): PanelDescriptor => ({
  id,
  symbol: 'SP500',
  timeframe,
  linkGroupId: null,
});

/** Two tabs; active tab '2x2' with 3 panels (one cell stacks two) + 1 empty cell. */
const layoutState: LayoutState = {
  workspace: {
    tabs: [
      {
        id: 'tab-a',
        name: 'Principal',
        template: '2x2',
        cells: [
          { panelIds: ['p1'], activePanelId: 'p1' },
          { panelIds: ['p2', 'p3'], activePanelId: 'p2' },
          { panelIds: [], activePanelId: '' },
          { panelIds: [], activePanelId: '' },
        ],
      },
      { id: 'tab-b', name: 'Contexto', template: '1', cells: [{ panelIds: [], activePanelId: '' }] },
    ],
    activeTabId: 'tab-a',
  },
  panels: { p1: desc('p1'), p2: desc('p2', 'M5'), p3: desc('p3', 'M15') },
};

describe('WorkspaceViewportComponent', () => {
  let store: MockStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [WorkspaceViewportComponent],
      providers: [provideMockStore({ initialState: { layout: layoutState } })],
    });
    TestBed.overrideComponent(WorkspaceViewportComponent, {
      remove: { imports: [ChartPanelComponent] },
      add: { imports: [ChartPanelStubComponent] },
    });
    store = TestBed.inject(MockStore);
  });

  function create() {
    const fixture = TestBed.createComponent(WorkspaceViewportComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('renders one tab button per tab and marks the active one', () => {
    const fixture = create();
    const tabs = fixture.nativeElement.querySelectorAll('.tab-bar .tab');
    expect(tabs).toHaveLength(2);
    expect(tabs[0].textContent).toContain('Principal');
    expect(tabs[0].classList.contains('active')).toBe(true);
    expect(tabs[1].classList.contains('active')).toBe(false);
  });

  it('projects the active tab: one panel per populated cell, placeholders for empty cells', () => {
    const fixture = create();
    const panels = fixture.debugElement.queryAll(By.directive(ChartPanelStubComponent));
    // 3 panels exist but only the ACTIVE panel of each populated cell renders
    expect(panels).toHaveLength(2);
    expect(panels[0].componentInstance.descriptor().id).toBe('p1');
    expect(panels[1].componentInstance.descriptor().id).toBe('p2');
    expect(fixture.nativeElement.querySelectorAll('.cell')).toHaveLength(4);
    expect(fixture.nativeElement.querySelectorAll('.cell-empty')).toHaveLength(2);
    const grid = fixture.nativeElement.querySelector('.grid');
    expect(grid.getAttribute('data-template')).toBe('2x2');
  });

  it('shows an inner tab strip only for cells stacking more than one panel', () => {
    const fixture = create();
    const strips = fixture.nativeElement.querySelectorAll('.cell-tabs');
    expect(strips).toHaveLength(1);
    const cellTabs = strips[0].querySelectorAll('.cell-tab');
    expect(cellTabs).toHaveLength(2);
    expect(cellTabs[0].classList.contains('active')).toBe(true);
  });

  it('dispatches setActiveTab when a tab is clicked', () => {
    const fixture = create();
    const dispatch = vi.spyOn(store, 'dispatch');
    const tabs = fixture.nativeElement.querySelectorAll('.tab-bar .tab');
    (tabs[1] as HTMLButtonElement).click();
    expect(dispatch).toHaveBeenCalledWith(LayoutActions.setActiveTab({ tabId: 'tab-b' }));
  });

  it('dispatches setActivePanel when a stacked cell tab is clicked', () => {
    const fixture = create();
    const dispatch = vi.spyOn(store, 'dispatch');
    const cellTabs = fixture.nativeElement.querySelectorAll('.cell-tabs .cell-tab');
    (cellTabs[1] as HTMLButtonElement).click();
    expect(dispatch).toHaveBeenCalledWith(
      LayoutActions.setActivePanel({ tabId: 'tab-a', cellIndex: 1, panelId: 'p3' }),
    );
  });
});
```

- [ ] **Step 2: Run the spec to verify it fails**

Run (from `emulador/`): `npm test -- --watch=false`
Expected: FAIL — cannot resolve `./workspace-viewport.component`.

- [ ] **Step 3: Implement the viewport**

`emulador/src/app/components/workspace/workspace-viewport.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, OnDestroy, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { ChartPanelComponent } from './chart-panel.component';
import { ChartSyncBus } from '../../domain/chart/chart-sync-bus';
import { LayoutActions } from '../../state/layout/layout.actions';
import { layoutFeature, selectActiveTab } from '../../state/layout/layout.reducer';
import { GridCell, PanelDescriptor } from '../../state/layout/layout.models';

/**
 * RFC-008: tab bar + single-level grid host. Projects `WorkspaceLayout.tabs`,
 * highlights `activeTabId`, and renders the active tab's cells according to
 * the closed `GridTemplate` enum (max depth 1 — no BSP/nesting). Each cell is
 * a tab-group: several stacked panels, one visible at a time.
 *
 * Provides the per-Session `ChartSyncBus` (one hub per Session, not per panel).
 * The bus stays framework-free, hence the `useFactory` provider.
 */
@Component({
  selector: 'app-workspace-viewport',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: ChartSyncBus, useFactory: () => new ChartSyncBus() }],
  imports: [ChartPanelComponent],
  template: `
    <div class="tab-bar" role="tablist">
      @for (tab of workspace().tabs; track tab.id) {
        <button
          role="tab"
          class="tab"
          [class.active]="tab.id === workspace().activeTabId"
          [attr.aria-selected]="tab.id === workspace().activeTabId"
          (click)="selectTab(tab.id)"
        >
          {{ tab.name }}
        </button>
      }
    </div>
    @if (activeTab(); as tab) {
      <div class="grid" [attr.data-template]="tab.template">
        @for (cell of tab.cells; track $index; let ci = $index) {
          <div class="cell">
            @if (cell.panelIds.length > 1) {
              <div class="cell-tabs" role="tablist">
                @for (pid of cell.panelIds; track pid) {
                  <button
                    role="tab"
                    class="cell-tab"
                    [class.active]="pid === cell.activePanelId"
                    [attr.aria-selected]="pid === cell.activePanelId"
                    (click)="selectPanel(tab.id, ci, pid)"
                  >
                    {{ panelLabel(pid) }}
                  </button>
                }
              </div>
            }
            @if (activeDescriptor(cell); as d) {
              <app-chart-panel class="cell-panel" [descriptor]="d" />
            } @else {
              <div class="cell-empty">Sin panel</div>
            }
          </div>
        }
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
      }
      .tab-bar {
        display: flex;
        gap: 2px;
        padding: 4px 4px 0;
        border-bottom: 1px solid var(--border);
      }
      .tab {
        padding: 5px 14px;
        background: none;
        border: 1px solid transparent;
        border-bottom: none;
        border-radius: var(--radius) var(--radius) 0 0;
        color: var(--text-muted);
        font-size: 12px;
        cursor: pointer;
      }
      .tab.active {
        background: var(--surface);
        border-color: var(--border);
        color: var(--text);
      }
      .grid {
        flex: 1;
        min-height: 0;
        display: grid;
        gap: 4px;
        padding: 4px;
      }
      .grid[data-template='1'] {
        grid-template-columns: 1fr;
      }
      .grid[data-template='2h'] {
        grid-template-columns: 1fr 1fr;
      }
      .grid[data-template='2v'] {
        grid-template-rows: 1fr 1fr;
      }
      .grid[data-template='3'] {
        grid-template-columns: repeat(3, 1fr);
      }
      .grid[data-template='2x2'] {
        grid-template-columns: 1fr 1fr;
        grid-template-rows: 1fr 1fr;
      }
      .grid[data-template='1+2'] {
        grid-template-columns: 2fr 1fr;
        grid-template-rows: 1fr 1fr;
      }
      .grid[data-template='1+2'] .cell:first-child {
        grid-row: span 2;
      }
      .grid[data-template='1+3'] {
        grid-template-columns: 3fr 1fr;
        grid-template-rows: repeat(3, 1fr);
      }
      .grid[data-template='1+3'] .cell:first-child {
        grid-row: span 3;
      }
      .cell {
        display: flex;
        flex-direction: column;
        min-height: 0;
        min-width: 0;
      }
      .cell-tabs {
        display: flex;
        gap: 2px;
        padding: 2px 2px 0;
      }
      .cell-tab {
        padding: 3px 10px;
        background: none;
        border: 1px solid var(--border);
        border-bottom: none;
        border-radius: var(--radius) var(--radius) 0 0;
        color: var(--text-muted);
        font-size: 11px;
        cursor: pointer;
      }
      .cell-tab.active {
        background: var(--surface);
        color: var(--text);
      }
      .cell-panel {
        flex: 1;
        min-height: 0;
      }
      .cell-empty {
        flex: 1;
        display: grid;
        place-items: center;
        border: 1px dashed var(--border);
        border-radius: var(--radius);
        color: var(--text-muted);
        font-size: 12px;
      }
    `,
  ],
})
export class WorkspaceViewportComponent implements OnDestroy {
  private readonly store = inject(Store);
  private readonly syncBus = inject(ChartSyncBus);

  readonly workspace = this.store.selectSignal(layoutFeature.selectWorkspace);
  readonly panels = this.store.selectSignal(layoutFeature.selectPanels);
  readonly activeTab = this.store.selectSignal(selectActiveTab);

  selectTab(tabId: string): void {
    this.store.dispatch(LayoutActions.setActiveTab({ tabId }));
  }

  selectPanel(tabId: string, cellIndex: number, panelId: string): void {
    this.store.dispatch(LayoutActions.setActivePanel({ tabId, cellIndex, panelId }));
  }

  activeDescriptor(cell: GridCell): PanelDescriptor | null {
    return cell.activePanelId ? (this.panels()[cell.activePanelId] ?? null) : null;
  }

  panelLabel(panelId: string): string {
    const d = this.panels()[panelId];
    if (!d) return panelId;
    return d.symbol ? `${d.symbol} · ${d.timeframe}` : d.timeframe;
  }

  ngOnDestroy(): void {
    this.syncBus.destroy();
  }
}
```

- [ ] **Step 4: Run the spec to verify it passes**

Run (from `emulador/`): `npm test -- --watch=false`
Expected: PASS.

- [ ] **Step 5: Compile and lint**

Run (from `emulador/`): `npx tsc -p tsconfig.app.json --noEmit`, `npx tsc -p tsconfig.spec.json --noEmit`, `npm run lint`
Expected: zero errors.

- [ ] **Step 6: Final RFC-008 invariant check**

Run from the repo root:

```bash
grep -rn "selectChartView(" emulador/src/app/state/layout/ ; grep -rn "@angular\|@ngrx" emulador/src/app/domain/chart/chart-sync-bus.ts
```

Expected: NO matches from either grep (no shared factory selectors in the layout feature; domain purity of the bus).

- [ ] **Step 7: Commit**

```bash
git add emulador/src/app/components/workspace/workspace-viewport.component.ts emulador/src/app/components/workspace/workspace-viewport.component.spec.ts
git commit -m "feat(workspace): add WorkspaceViewport tab bar + single-level grid host (RFC-008 Task 5)"
```
