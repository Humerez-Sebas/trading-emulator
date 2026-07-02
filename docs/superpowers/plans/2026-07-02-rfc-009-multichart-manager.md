# RFC-009 MultiChart Manager & Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable hot creation/close/move of panels on the RFC-008 host, with keep-alive of hidden panels (never destroyed on hide) and update-gating (no render work on non-visible panels), tracked by `PanelRegistry` (entity map in the `layout` feature) and `ChartRegistry` (session-scoped runtime service).

**Architecture:** The `layout` feature's existing `panels: Record<string, PanelDescriptor>` map IS the `PanelRegistry` entity map (single source of truth of "which panels exist" — no `@ngrx/entity` dependency is introduced; the RFC asks for the EntityAdapter *pattern*, which this Record-based entity map already implements). Visibility is **derived** (`selectVisiblePanelIds`, one non-parametrized selector — D8 discipline: no factory selectors). Keep-alive = the `WorkspaceViewport` renders ALL panels of ALL tabs and hides non-visible ones with `[hidden]` instead of destroying them. Update-gating happens at the `ChartModelMapper` seam: the mapper's exposed observables gain a gate that suppresses emissions while the panel is hidden and re-emits the latest value on re-show (D6 re-sync). `ChartRegistry` (provided per `WorkspaceViewport`, like `ChartSyncBus`) tracks the live panel handles; destruction happens only through the `removePanel`/`closeTab` state path.

**Tech Stack:** Angular 21 standalone + signals, NgRx 21, RxJS 7.8, Vitest 4 via `ng test`.

## Global Constraints

- **No new dependencies.** `@ngrx/entity` is NOT added; the entity-map pattern is realized with the existing `Record<string, PanelDescriptor>`.
- **FORBIDDEN:** shared NgRx factory selectors parametrized by `panelId` (D8, inherited from RFC-008). `selectVisiblePanelIds` returns ONE map for all panels (single memo slot, no parametrization).
- **Sanctioned changes to RFC-001..008 audited/reviewed code (each additive or single-line, mandated by RFC-009 D6):**
  1. `chart.component.ts`: REMOVE the line `providers: [ChartModelMapper],` — the wrapping `ChartPanelComponent`'s provider becomes THE mapper instance (this is what RFC-008 Decision 5 specifies: "proveedor a nivel de ChartPanelComponent"). No other line changes.
  2. `emulador-page.component.ts` (hosts a bare `<app-chart>`): ADD `providers: [ChartModelMapper]` + its import, so the single-chart page keeps its own instance.
  3. `chart-model-mapper.service.ts`: the five exposed observables (`chartStyle$`, `chartView$`, `tradeChartView$`, `sessionEnd$`, `drawingsState$`) each gain a terminal `this.gated()` stage (D6). Behavior with gating enabled (the default) is identical — the full pre-existing suite is the regression guard. `sessionEnd` (signal) is NOT gated (it feeds dialog state, not engine render).
  4. `chart-panel.component.ts` / `workspace-viewport.component.ts` (RFC-008 components, reviewed not frozen): extended per Tasks 2, 4, 5.
- **Lifecycle invariant (both directions):** every `panelId` referenced by any `GridCell` exists in `panels`, and every id in `panels` is referenced by exactly one `GridCell`. Asserted by a shared spec helper after every lifecycle operation.
- **Keep-alive rule:** hiding (tab switch, cell-tab switch) NEVER destroys a `ChartPanelComponent`; only `removePanel` / `closeTab` / template-shrink-with-merge (which keeps panels) may remove components — and removal must always go through the state actions.
- `PanelRuntime.visible` is derived, not stored (per RFC-009 D6); no new NgRx slice is created. `visibleRange` arrives with RFC-010.
- Verification per task (from `emulador/`): `npx tsc -p tsconfig.app.json --noEmit`, `npx tsc -p tsconfig.spec.json --noEmit`, `npm test -- --watch=false`, and `npx eslint <changed files>` → zero NEW lint errors (18 pre-existing errors on develop are tracked separately; do not fix them here).
- Known pre-existing suite flakiness in `trading-capability.spec.ts` / `selectors.spec.ts` (tracked separately): if a run fails there, re-run before concluding.
- Task-scoped conventional commits.

---

### Task 1: `movePanel` + lifecycle consistency invariant suite

**Files:**
- Modify: `emulador/src/app/state/layout/layout.actions.ts`
- Modify: `emulador/src/app/state/layout/layout.reducer.ts`
- Test: `emulador/src/app/state/layout/layout.reducer.spec.ts` (append)
- Create: `emulador/src/app/state/layout/layout-invariants.spec-util.ts` (spec-only helper)

**Interfaces:**
- Consumes: RFC-008 `LayoutState`, `LayoutActions.addPanel/removePanel/closeTab/applyGridTemplate`, `MAX_PANELS_PER_TAB`.
- Produces: `LayoutActions.movePanel: props<{ panelId: string; targetTabId: string; targetCellIndex: number }>` (the RFC's `movePanel(id, targetCellId)` adapted to the frozen interfaces — `GridCell` has no id, so cells are addressed by `(tabId, cellIndex)`, consistent with `setActivePanel`); spec helper `assertLayoutConsistent(state: LayoutState): void`.

- [ ] **Step 1: Create the invariant spec helper**

`emulador/src/app/state/layout/layout-invariants.spec-util.ts`:

```ts
import { expect } from 'vitest';
import { LayoutState } from './layout.models';

/**
 * RFC-009 lifecycle invariant: cells and the panels entity map reference each
 * other exactly — no orphan panelId in any cell, and every registered panel
 * lives in exactly one cell.
 */
export function assertLayoutConsistent(state: LayoutState): void {
  const referenced: string[] = state.workspace.tabs.flatMap((t) =>
    t.cells.flatMap((c) => c.panelIds),
  );
  const registered = Object.keys(state.panels);
  // no duplicates: each panel lives in exactly one cell
  expect(new Set(referenced).size).toBe(referenced.length);
  // both directions
  expect([...referenced].sort()).toEqual([...registered].sort());
  // every non-empty cell has a valid activePanelId; empty cells use ''
  for (const tab of state.workspace.tabs) {
    for (const cell of tab.cells) {
      if (cell.panelIds.length === 0) expect(cell.activePanelId).toBe('');
      else expect(cell.panelIds).toContain(cell.activePanelId);
    }
  }
}
```

- [ ] **Step 2: Write the failing spec (append to `layout.reducer.spec.ts`)**

```ts
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
```

Add to the spec's imports: `assertLayoutConsistent` from `./layout-invariants.spec-util` and `MAX_PANELS_PER_TAB` (already imported).

- [ ] **Step 3: Run to verify failure** — `npm test -- --watch=false` fails: `movePanel` is not a member of `LayoutActions`.

- [ ] **Step 4: Implement**

`layout.actions.ts` — add to the events map:

```ts
    /** Relocates an existing panel to (targetTabId, targetCellIndex). No-op if it would exceed MAX_PANELS_PER_TAB in the target tab. */
    'Move Panel': props<{ panelId: string; targetTabId: string; targetCellIndex: number }>(),
```

`layout.reducer.ts` — add the handler (after `removePanel`):

```ts
    on(LayoutActions.movePanel, (state, { panelId, targetTabId, targetCellIndex }): LayoutState => {
      if (!state.panels[panelId]) return state;
      const targetTab = state.workspace.tabs.find((t) => t.id === targetTabId);
      if (!targetTab || targetCellIndex < 0 || targetCellIndex >= targetTab.cells.length) return state;
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
                  activePanelId: cell.activePanelId === panelId ? (panelIds[0] ?? '') : cell.activePanelId,
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
```

- [ ] **Step 5: Run to verify pass** — full suite green; both tsc configs clean; `npx eslint src/app/state/layout` clean.

- [ ] **Step 6: Commit** — `git add emulador/src/app/state/layout` ; `git commit -m "feat(layout): add movePanel lifecycle operation with cross-tab cap guard and invariant suite (RFC-009 Task 1)"`

---

### Task 2: Derived visibility + keep-alive rendering in `WorkspaceViewport`

**Files:**
- Modify: `emulador/src/app/state/layout/layout.reducer.ts` (add `selectVisiblePanelIds`)
- Modify: `emulador/src/app/components/workspace/workspace-viewport.component.ts`
- Modify: `emulador/src/app/components/workspace/chart-panel.component.ts` (add `visible` input, `[hidden]` host binding)
- Test: append to `layout.reducer.spec.ts` and `workspace-viewport.component.spec.ts`

**Interfaces:**
- Produces: `selectVisiblePanelIds: MemoizedSelector<..., Record<string, true>>` — a panel is visible iff its tab is the active tab AND it is the `activePanelId` of its cell. ONE selector for all panels (no parametrization). `ChartPanelComponent.visible = input<boolean>(true)`.

- [ ] **Step 1: Failing selector spec (append to `layout.reducer.spec.ts`)**

```ts
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
```

- [ ] **Step 2: Implement the selector** (in `layout.reducer.ts`, after `selectActiveTab`):

```ts
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
```

- [ ] **Step 3: Keep-alive viewport template.** In `workspace-viewport.component.ts`:

1. Add signals: `readonly visibleIds = this.store.selectSignal(selectVisiblePanelIds);` (import it) — keep existing members.
2. Replace the single-active-tab projection with all-tabs keep-alive. The `@if (activeTab(); as tab) { <div class="grid" …> }` block becomes:

```html
    @for (tab of workspace().tabs; track tab.id) {
      <div class="grid" [attr.data-template]="tab.template" [hidden]="tab.id !== workspace().activeTabId">
        @for (cell of tab.cells; track $index; let ci = $index) {
          <div class="cell">
            @if (cell.panelIds.length > 1) {
              <div class="cell-tabs" role="tablist">
                @for (pid of cell.panelIds; track pid) {
                  <button role="tab" class="cell-tab" [class.active]="pid === cell.activePanelId"
                          [attr.aria-selected]="pid === cell.activePanelId"
                          (click)="selectPanel(tab.id, ci, pid)">{{ panelLabel(pid) }}</button>
                }
              </div>
            }
            @for (pid of cell.panelIds; track pid) {
              @if (descriptorOf(pid); as d) {
                <app-chart-panel class="cell-panel" [descriptor]="d" [visible]="visibleIds()[pid] === true"
                                 [hidden]="pid !== cell.activePanelId" />
              }
            }
            @if (cell.panelIds.length === 0) {
              <div class="cell-empty">Sin panel</div>
            }
          </div>
        }
      </div>
    }
```

3. Replace `activeDescriptor(cell: GridCell)` with `descriptorOf(panelId: string): PanelDescriptor | null { return this.panels()[panelId] ?? null; }` (update the spec accordingly — `activeDescriptor` has no remaining caller). Keep `panelLabel` unchanged.
4. `track pid` keyed by panel id is what preserves component instances across visibility toggles — moves/re-orders must not recreate panels unnecessarily.

- [ ] **Step 4: Panel `visible` input + hidden host binding.** In `chart-panel.component.ts` add:

```ts
  /** RFC-009 (D6): drives update-gating; the viewport derives it from selectVisiblePanelIds. */
  readonly visible = input<boolean>(true);
```

(the `[hidden]` attribute is set by the viewport; the panel consumes `visible` in Task 3's gating effect).

- [ ] **Step 5: Keep-alive viewport tests (append to `workspace-viewport.component.spec.ts`):**

```ts
  it('keep-alive: renders ALL panels of ALL tabs, hiding non-visible ones instead of destroying', () => {
    const fixture = create();
    const panels = fixture.debugElement.queryAll(By.directive(ChartPanelStubComponent));
    expect(panels).toHaveLength(3); // p1, p2 AND stacked p3 are all alive in the DOM
    const hiddenStates = panels.map((p) => (p.nativeElement as HTMLElement).hidden);
    expect(hiddenStates.filter((h) => !h)).toHaveLength(2); // only active-of-cell panels shown
  });

  it('switching the stacked cell tab flips [hidden] without recreating the component', () => {
    const fixture = create();
    const before = fixture.debugElement.queryAll(By.directive(ChartPanelStubComponent))[2].componentInstance;
    store.setState({ layout: switchedActivePanelState }); // same layout, cell 1 activePanelId -> 'p3'
    fixture.detectChanges();
    const after = fixture.debugElement.queryAll(By.directive(ChartPanelStubComponent))[2].componentInstance;
    expect(after).toBe(before); // identity preserved: keep-alive, not re-creation
  });
```

Define `switchedActivePanelState` as a structuredClone of `layoutState` with `tabs[0].cells[1].activePanelId = 'p3'`. Extend `ChartPanelStubComponent` with `readonly visible = input<boolean>(true);` to keep the stub contract faithful.

- [ ] **Step 6: Verify (full gates) and commit** — `git commit -m "feat(workspace): derived panel visibility + keep-alive rendering with [hidden] gating (RFC-009 Task 2)"`

---

### Task 3: Update-gating at the `ChartModelMapper` seam (D6)

**Files:**
- Modify: `emulador/src/app/components/chart/chart-model-mapper.service.ts`
- Modify: `emulador/src/app/components/chart/chart.component.ts` (SANCTIONED single-line removal of `providers: [ChartModelMapper],`)
- Modify: `emulador/src/app/pages/emulador/emulador-page.component.ts` (ADD `providers: [ChartModelMapper]` + import — the bare `<app-chart>` at line ~37 now needs an ancestor provider)
- Modify: `emulador/src/app/components/workspace/chart-panel.component.ts` (gating effect)
- Test: append to `chart-model-mapper.service.spec.ts`; update `chart-panel.component.spec.ts`

**Interfaces:**
- Produces: `ChartModelMapper.setUpdatesEnabled(enabled: boolean): void` (default enabled). While disabled, `chartStyle$`, `chartView$`, `tradeChartView$`, `sessionEnd$`, `drawingsState$` emit nothing; on re-enable each re-emits its LATEST upstream value if it changed while gated (D6 re-sync: "aplicar el ultimo RenderModel calculado"). `panelChartView$` is NOT gated (it feeds the always-visible panel header, and RFC-010's sync needs it live).

- [ ] **Step 1: Failing gating spec (append to `chart-model-mapper.service.spec.ts`):**

```ts
  describe('setUpdatesEnabled (RFC-009 D6 update-gating)', () => {
    beforeEach(() => {
      store.overrideSelector(selectChartStyle, styleFixtureA); // build one from existing spec fixtures
    });

    it('suppresses emissions while disabled and re-emits the latest value on enable', () => {
      const seen: unknown[] = [];
      mapper.chartStyle$.subscribe((v) => seen.push(v));
      expect(seen).toHaveLength(1);
      mapper.setUpdatesEnabled(false);
      store.overrideSelector(selectChartStyle, styleFixtureB);
      store.refreshState();
      expect(seen).toHaveLength(1); // gated: no emission
      mapper.setUpdatesEnabled(true);
      expect(seen).toHaveLength(2); // re-sync: latest value delivered
    });

    it('does not duplicate the last value when nothing changed while gated', () => {
      const seen: unknown[] = [];
      mapper.chartStyle$.subscribe((v) => seen.push(v));
      mapper.setUpdatesEnabled(false);
      mapper.setUpdatesEnabled(true);
      expect(seen).toHaveLength(1);
    });

    it('default state is enabled (regression: pre-RFC-009 behavior unchanged)', () => {
      const seen: unknown[] = [];
      mapper.chartStyle$.subscribe((v) => seen.push(v));
      expect(seen).toHaveLength(1);
    });
  });
```

Build `styleFixtureA/B` from the shapes already used by the existing `chartStyle$` tests in this spec (two distinct ChartColors objects). Also verify `panelChartView$` stays UNgated: add one test asserting it still emits while `setUpdatesEnabled(false)`.

- [ ] **Step 2: Implement the gate in the mapper:**

```ts
  /** RFC-009 (D6): update-gating switch — true by default (visible panel). */
  private readonly updatesEnabled$ = new BehaviorSubject<boolean>(true);

  setUpdatesEnabled(enabled: boolean): void {
    if (this.updatesEnabled$.value !== enabled) this.updatesEnabled$.next(enabled);
  }

  /**
   * Pauses the stream while updates are disabled and replays the LATEST
   * upstream value on re-enable (distinctUntilChanged suppresses the replay
   * when nothing changed while hidden — the engine already painted it).
   */
  private gated<T>(): (source: Observable<T>) => Observable<T> {
    return (source) =>
      combineLatest([source, this.updatesEnabled$]).pipe(
        filter(([, enabled]) => enabled),
        map(([value]) => value),
        distinctUntilChanged(),
      );
  }
```

Append `.pipe(this.gated())` as the terminal stage of `chartStyle$`, `chartView$`, `tradeChartView$`, `sessionEnd$`, and `drawingsState$` (e.g. `readonly sessionEnd$: Observable<number | null> = this.store.select(selectSessionEnd).pipe(this.gated());`). Merge `BehaviorSubject`/`filter` into the existing rxjs imports. Note: `distinctUntilChanged` reference-compares — safe for these streams because every upstream recompute yields a new reference and memoized no-ops keep the old one (that is exactly RFC-008's referential discipline).

- [ ] **Step 3: Move the mapper provider (SANCTIONED).** In `chart.component.ts` delete the single line `providers: [ChartModelMapper],`. In `emulador-page.component.ts` add `providers: [ChartModelMapper],` to its `@Component` metadata + `import { ChartModelMapper } from '../../components/chart/chart-model-mapper.service';`. Rationale (record in the report): with the component-level provider gone, the `ChartPanelComponent`'s provider is the single per-panel instance (RFC-008 Decision 5 verbatim), which is the seam the gating needs; the emulador page keeps a page-scoped instance for the audited single-chart flow.

- [ ] **Step 4: Drive the gate from the panel.** In `chart-panel.component.ts`'s constructor add:

```ts
    effect(() => this.mapper.setUpdatesEnabled(this.visible()));
```

- [ ] **Step 5: Verify + commit.** Full suite MUST stay green — every pre-existing chart/mapper test now exercises the enabled-by-default gate. Any existing test that provided `ChartModelMapper` explicitly still works (TestBed roots provide it in the mapper spec). Run all four gates, then `git commit -m "feat(chart): mapper-level update gating with latest-value resync; panel mapper becomes the single instance (RFC-009 Task 3, D6)"`

---

### Task 4: `ChartRegistry` (session-scoped) + lifecycle/leak test suite

**Files:**
- Create: `emulador/src/app/components/workspace/chart-registry.service.ts`
- Test: `emulador/src/app/components/workspace/chart-registry.service.spec.ts`
- Modify: `emulador/src/app/components/workspace/chart-panel.component.ts` (register/deregister)
- Modify: `emulador/src/app/components/workspace/workspace-viewport.component.ts` (provide the registry)
- Test: append lifecycle suite to `workspace-viewport.component.spec.ts`

**Interfaces:**
- Produces:

```ts
export interface PanelChartHandle {
  /** Toggles update-gating on the panel's mapper (spied on by lifecycle tests). */
  setUpdatesEnabled(enabled: boolean): void;
}

export class ChartRegistry {
  register(panelId: string, handle: PanelChartHandle): void;   // throws on duplicate id
  deregister(panelId: string): void;                           // idempotent
  get(panelId: string): PanelChartHandle | null;
  ids(): string[];
  count(): number;
}
```

- Plain class (like `ChartSyncBus`), provided at `WorkspaceViewport` via `useFactory` — one registry per Session, outside the NgRx store (runtime instances are not serializable state). Destruction path: `removePanel`/`closeTab` state change → viewport's `track pid` drops the panel → Angular destroys `ChartPanelComponent` → `ngOnDestroy` deregisters (and the inner `ChartComponent` destroys its engine as audited). The registry never destroys engines itself; it is the source of truth for "which instances are alive" and the leak detector.

- [ ] **Step 1: Failing registry spec** (`chart-registry.service.spec.ts`): plain vitest, no TestBed — register/get/ids/count; duplicate register throws; deregister idempotent; deregistered id no longer listed.

```ts
import { describe, it, expect } from 'vitest';
import { ChartRegistry, PanelChartHandle } from './chart-registry.service';

const handle = (): PanelChartHandle => ({ setUpdatesEnabled: () => void 0 });

describe('ChartRegistry (RFC-009)', () => {
  it('registers, resolves, lists and counts handles', () => {
    const reg = new ChartRegistry();
    const h = handle();
    reg.register('p1', h);
    expect(reg.get('p1')).toBe(h);
    expect(reg.ids()).toEqual(['p1']);
    expect(reg.count()).toBe(1);
  });
  it('throws on duplicate registration (one live instance per panelId)', () => {
    const reg = new ChartRegistry();
    reg.register('p1', handle());
    expect(() => reg.register('p1', handle())).toThrowError(/p1/);
  });
  it('deregister removes and is idempotent', () => {
    const reg = new ChartRegistry();
    reg.register('p1', handle());
    reg.deregister('p1');
    reg.deregister('p1');
    expect(reg.get('p1')).toBeNull();
    expect(reg.count()).toBe(0);
  });
});
```

- [ ] **Step 2: Implement** `chart-registry.service.ts` (plain class, `Map<string, PanelChartHandle>` inside, JSDoc explaining the session scope + destruction path above; NO `@Injectable`, mirrors `ChartSyncBus`).

- [ ] **Step 3: Wire the panel.** `chart-panel.component.ts`: inject `ChartRegistry`; in the constructor `effect` is NOT the place — register once in `ngOnInit` (`this.registry.register(this.descriptor().id, { setUpdatesEnabled: (on) => this.mapper.setUpdatesEnabled(on) })`) and `this.registry.deregister(this.descriptor().id)` first in `ngOnDestroy`. Provide `ChartRegistry` in `workspace-viewport.component.ts` providers via `{ provide: ChartRegistry, useFactory: () => new ChartRegistry() }`. Update the panel spec's TestBed providers with a registry instance.

- [ ] **Step 4: Lifecycle/leak suite (append to `workspace-viewport.component.spec.ts`), P1-A-3 discipline:**

```ts
  describe('lifecycle: create/hide/show/close (RFC-009, P1 A-3 discipline)', () => {
    it('registry tracks exactly the live panels across arbitrary close order', () => {
      const fixture = create();
      const registry = fixture.debugElement.injector.get(ChartRegistry);
      expect(registry.ids().sort()).toEqual(['p1', 'p2', 'p3']);
      store.setState({ layout: stateWithout('p2') }); fixture.detectChanges();
      expect(registry.ids().sort()).toEqual(['p1', 'p3']);
      store.setState({ layout: stateWithout('p2', 'p1') }); fixture.detectChanges();
      expect(registry.ids()).toEqual(['p3']);
    });

    it('hidden panels are gated (setUpdatesEnabled(false)) and never destroyed', () => {
      const fixture = create();
      const registry = fixture.debugElement.injector.get(ChartRegistry);
      const gateSpy = vi.spyOn(registry.get('p3')!, 'setUpdatesEnabled');
      // p3 is the hidden stacked panel: the stub's visible input is false
      // toggle cell tab: p3 visible, p2 hidden — registry keeps all three
      store.setState({ layout: switchedActivePanelState }); fixture.detectChanges();
      expect(registry.count()).toBe(3);
      expect(gateSpy).toHaveBeenCalledWith(true);
    });

    it('no leaks after repeated hide/show cycles: registry count and handle set stable', () => {
      const fixture = create();
      const registry = fixture.debugElement.injector.get(ChartRegistry);
      for (let i = 0; i < 5; i++) {
        store.setState({ layout: switchedActivePanelState }); fixture.detectChanges();
        store.setState({ layout: layoutState }); fixture.detectChanges();
      }
      expect(registry.count()).toBe(3);
    });
  });
```

`stateWithout(...ids)` = spec helper deriving a consistent `LayoutState` from `layoutState` with those panels removed (reuse the real reducer: fold `LayoutActions.removePanel` over the ids — that also keeps the invariant honest). NOTE: for the gate spy to observe calls, the stub panel must actually call the registry — so for THIS suite, stub `app-chart` (not `app-chart-panel`) and use the REAL `ChartPanelComponent` inside the viewport (override the viewport's imports to swap `ChartComponent` inside `ChartPanelComponent` via `TestBed.overrideComponent(ChartPanelComponent, …)` exactly as `chart-panel.component.spec.ts` already does; provide `provideMockStore` selectors for `selectSeries`/`selectCurrentTime`/`selectUtcOffset` as that spec does).

- [ ] **Step 5: Verify all four gates and commit** — `git commit -m "feat(workspace): add session-scoped ChartRegistry with lifecycle and leak coverage (RFC-009 Task 4)"`

---

### Task 5: Hot create/close affordances in the viewport

**Files:**
- Modify: `emulador/src/app/components/workspace/workspace-viewport.component.ts`
- Test: append to `workspace-viewport.component.spec.ts`

**Interfaces:**
- Consumes: `LayoutActions.addPanel/removePanel`, `MAX_PANELS_PER_TAB`, `selectActiveTab`.
- Produces: per-cell "+" button (dispatches `addPanel` with `{ id: crypto.randomUUID(), symbol: '', timeframe: 'M1', linkGroupId: null }`), disabled when the active tab holds `MAX_PANELS_PER_TAB` panels; per-cell-tab "×" button (dispatches `removePanel`). No move UI (registry-level `movePanel` is enough for RFC-009; drag-and-drop is out of scope).

- [ ] **Step 1: Failing spec (append):** "+" renders per cell and dispatches `addPanel` targeting that `(tabId, cellIndex)` with a fresh uuid and `timeframe 'M1'`; "+" is disabled when the active tab is at the cap (build an 8-panel `layoutState` variant); "×" renders on each cell tab (stacked cells) and dispatches `removePanel({ panelId })`; clicking "×" must NOT also trigger the cell-tab's `setActivePanel` (use `$event.stopPropagation()` — assert `dispatch` called exactly once).
- [ ] **Step 2: Implement:** add to the cell template a `.cell-add` button (`(click)="addPanel(tab.id, ci)"`, `[disabled]="tabAtCap(tab)"`), an `×` span inside each cell-tab button (`(click)="closePanel($event, pid)"`), and the methods:

```ts
  addPanel(tabId: string, cellIndex: number): void {
    this.store.dispatch(LayoutActions.addPanel({
      tabId, cellIndex,
      descriptor: { id: crypto.randomUUID(), symbol: '', timeframe: 'M1', linkGroupId: null },
    }));
  }
  closePanel(event: Event, panelId: string): void {
    event.stopPropagation();
    this.store.dispatch(LayoutActions.removePanel({ panelId }));
  }
  tabAtCap(tab: TabLayout): boolean {
    return tab.cells.reduce((n, c) => n + c.panelIds.length, 0) >= MAX_PANELS_PER_TAB;
  }
```

with matching minimal styles (reuse `.cell-tab` sizing; `.cell-add` mirrors it).
- [ ] **Step 3: Verify all gates (tsc app+spec, full test suite, eslint on changed files) and commit** — `git commit -m "feat(workspace): hot panel create/close affordances honoring MAX_PANELS_PER_TAB (RFC-009 Task 5)"`

---

## Final verification (RFC-009 Estado Esperado)

- `npx tsc -p tsconfig.app.json --noEmit` → zero errors.
- Hot create/close/move via `LayoutActions` keeps the layout consistent — `assertLayoutConsistent` holds across every lifecycle spec (no orphan `panelId` in either direction).
- Lifecycle tests: create N, hide/show in arbitrary order, close in arbitrary order — green, with explicit `ChartRegistry` assertions that (a) no destroyed panel remains registered, (b) hidden panels' handles are gated (`setUpdatesEnabled(false)`), (c) counts are stable across repeated hide/show cycles (no leak growth).
- Invariant greps: no `selectChartView(panelId)`-style factory selector introduced; `chart-registry.service.ts` and `chart-sync-bus.ts` free of `@angular`/`@ngrx` imports.
