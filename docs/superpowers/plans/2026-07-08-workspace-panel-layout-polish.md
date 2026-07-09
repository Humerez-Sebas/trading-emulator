# Workspace Panel & Layout Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two workspace layout defects — inactive tabs/panels rendering stacked instead of hidden (Bug 1), and destructive grid-template changes that lose panel positions (Bug 2) — so tabs and templates behave predictably and reversibly.

**Architecture:** Two independent root causes. (1) A CSS cascade defect: author `display` rules (`.grid{display:grid}`, `:host{display:flex}`) override the low-priority UA `[hidden]{display:none}` rule, so `[hidden]` never hides anything. Fixed with targeted higher-specificity `[hidden]` rules. (2) `applyGridTemplate` destroys layout by merging shrunk cells into one; replaced with a non-destructive "park cells" model where the template is a *lens* over a stable, ordered cell list — shrinking parks (keeps mounted + hidden) the cells that don't fit, growing reveals them in their original slot.

**Tech Stack:** Angular 20 (standalone, signals, OnPush), NgRx (`createFeature`/`createReducer`), Vitest via the Angular test builder, lightweight-charts. App code lives under `emulador/src/app`.

## Global Constraints

- Test command is `npm test` (from `emulador/`) — the Angular Vitest builder that bootstraps TestBed. **Never run bare `npx vitest run`** — it does not bootstrap TestBed and always fails.
- Keep `changeDetection: ChangeDetectionStrategy.OnPush` and signal-based state on all touched components.
- The layout reducer stays **pure**: all ids come from the caller (component generates `crypto.randomUUID()`), never generated inside the reducer.
- `layout-invariants.ts` must stay free of any `vitest` import (it ships in the production bundle via `session-migration.ts`).
- Preserve RFC-009 **keep-alive**: hidden/parked panels stay MOUNTED (never removed from the `@for`), with update-gating (`visible=false`) doing the work of "zero render cost while hidden". Tests count leaf mounts, never `registry.count()`.
- `MAX_PANELS_PER_TAB = 8` cap counts panels across ALL cells including parked ones (unchanged).
- Do not introduce a shared parametrized selector for panel views (D8: one mapper per panel).
- Commit after each task with a `feat(workspace):` / `fix(workspace):` message ending with the repo's `Co-Authored-By` trailer.

---

## File Structure

**Modified:**
- `emulador/src/app/components/workspace/chart-panel.component.ts` — add `:host([hidden])` hide rule (Task 1).
- `emulador/src/app/components/workspace/workspace-viewport.component.ts` — add `.grid[hidden]`/`.cell[hidden]` hide rules (Task 1); render parked cells hidden via `renderedCount` (Task 4); dispatch `createTab` with a descriptor (Task 2).
- `emulador/src/app/state/layout/layout.actions.ts` — `Create Tab` gains a `descriptor` prop (Task 2).
- `emulador/src/app/state/layout/layout.reducer.ts` — `createTab` seeds a panel (Task 2); `fitCells` replaces `normalizeCells` + focus-follows-visibility in `applyGridTemplate`; `selectVisiblePanelIds` slices to rendered cells (Task 3).
- `emulador/src/app/state/layout/layout.effects.ts` — replace dummy `{type:'noop'}` with `filter` (Task 5).
- `docs/engineering/domain/workspace-panels.md` — document the park model + the focused-panel↔global-TF coupling invariant (Task 5).

**Tests modified:**
- `emulador/src/app/state/layout/layout.reducer.spec.ts` — createTab + park behavior.
- `emulador/src/app/components/workspace/workspace-viewport.component.spec.ts` — createTab signature, parked-cell rendering. Also re-run `workspace-viewport.lazy-creation.spec.ts` and `link-groups-menu.component.spec.ts` and repair any `createTab` call sites.

---

### Task 1: Make `[hidden]` actually hide (CSS cascade fix) — resolves Bug 1

**Files:**
- Modify: `emulador/src/app/components/workspace/workspace-viewport.component.ts` (styles array)
- Modify: `emulador/src/app/components/workspace/chart-panel.component.ts` (styles array)

**Interfaces:**
- Consumes: nothing.
- Produces: hidden grids/cells/panels compute `display:none`. No API change.

**Why no unit test:** the Angular Vitest builder runs in jsdom, which does **not** compute layout/`display` from stylesheets — this is exactly why the bug escaped 980 green tests. The regression guard is a real-browser computed-style check (Step 3). Add no fake unit assertion.

- [ ] **Step 1: Add the hide rules to the viewport styles**

In `workspace-viewport.component.ts`, inside the `styles` template string, immediately after the `.grid { … }` block (the one containing `display: grid;`), add:

```css
      .grid[hidden] {
        display: none;
      }
      .cell[hidden] {
        display: none;
      }
```

(The `.cell[hidden]` rule is used by Task 4; adding it here keeps the whole cascade fix in one place. Specificity `(0,2,0)` beats `.grid`/`.cell` `(0,1,0)`, so it wins.)

- [ ] **Step 2: Add the host hide rule to the panel styles**

In `chart-panel.component.ts`, inside the `styles` template string, immediately after the `:host { … }` block, add:

```css
      :host([hidden]) {
        display: none;
      }
```

- [ ] **Step 3: Verify in the running app (Bug 1)**

Start the dev server (`preview_start` with the app's launch config; create `.claude/launch.json` with `ng serve` on its port if absent) and load any session that has candle data so panels render.

- Confirm one tab shows: `preview_inspect` selector `.grid:not([hidden])` → exactly one visible grid.
- `preview_click` the tab-bar `+` (`.tab-bar-add`) to create a second tab. Then `preview_inspect` the FIRST tab's grid (`.grid[hidden]`) → computed `display` must be `none`. Before the fix it was `grid`.
- `preview_screenshot` → the new tab shows a single full-height area (no chart stacked above an empty region). Compare against the reported Bug-1 screenshot.

- [ ] **Step 4: Run the full suite (nothing should break)**

Run (from `emulador/`): `npm test`
Expected: PASS (no spec asserts computed display, so this is a no-regression check).

- [ ] **Step 5: Commit**

```bash
git add emulador/src/app/components/workspace/workspace-viewport.component.ts emulador/src/app/components/workspace/chart-panel.component.ts
git commit -m "fix(workspace): make [hidden] hide inactive tabs and stacked panels"
```

---

### Task 2: New tab opens with one chart of the active symbol — completes Bug 1

**Files:**
- Modify: `emulador/src/app/state/layout/layout.actions.ts:9`
- Modify: `emulador/src/app/state/layout/layout.reducer.ts:59-68` (the `createTab` handler)
- Modify: `emulador/src/app/components/workspace/workspace-viewport.component.ts` (`addTab()`)
- Test: `emulador/src/app/state/layout/layout.reducer.spec.ts`

**Interfaces:**
- Consumes: `PanelDescriptor` from `layout.models`.
- Produces: `LayoutActions.createTab({ id: string; name: string; descriptor: PanelDescriptor })`. Reducer registers `descriptor` in `panels`, seeds the new tab with one cell holding it, activates the tab, and focuses the panel.

- [ ] **Step 1: Update the failing/adjusted reducer test**

In `layout.reducer.spec.ts`, replace the existing `it('createTab appends a single-cell tab and activates it', …)` test body with:

```typescript
  it('createTab appends a single-cell tab pre-populated with the given panel and focuses it', () => {
    const state = reducer(
      createInitialLayoutState(),
      LayoutActions.createTab({ id: 'tab-2', name: 'Tab 2', descriptor: descriptor('p-new') }),
    );
    expect(state.workspace.tabs).toHaveLength(2);
    expect(state.workspace.activeTabId).toBe('tab-2');
    const tab = state.workspace.tabs[1];
    expect(tab.template).toBe('1');
    expect(tab.cells).toEqual([{ panelIds: ['p-new'], activePanelId: 'p-new' }]);
    expect(state.panels['p-new']).toEqual(descriptor('p-new'));
    expect(state.focusedPanelId).toBe('p-new');
    assertLayoutConsistent(state);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `createTab` does not yet accept `descriptor`; type error / cells mismatch.

- [ ] **Step 3: Add `descriptor` to the `Create Tab` action**

In `layout.actions.ts`, change the `Create Tab` line to:

```typescript
    /** Appends a tab (template '1') pre-populated with the caller-supplied panel, and activates + focuses it. Ids come from the caller (reducer stays pure). */
    'Create Tab': props<{ id: string; name: string; descriptor: PanelDescriptor }>(),
```

`PanelDescriptor` is already imported at the top of the file.

- [ ] **Step 4: Update the `createTab` reducer handler**

In `layout.reducer.ts`, replace the `on(LayoutActions.createTab, …)` handler with:

```typescript
    on(LayoutActions.createTab, (state, { id, name, descriptor }): LayoutState => {
      const tab: TabLayout = {
        id,
        name,
        template: '1',
        cells: [{ panelIds: [descriptor.id], activePanelId: descriptor.id }],
      };
      return {
        ...state,
        panels: { ...state.panels, [descriptor.id]: descriptor },
        workspace: {
          tabs: [...state.workspace.tabs, tab],
          activeTabId: id,
        },
        focusedPanelId: descriptor.id,
      };
    }),
```

- [ ] **Step 5: Update `addTab()` in the viewport to supply a descriptor**

In `workspace-viewport.component.ts`, replace `addTab()` with:

```typescript
  /** RFC-013 (D4): appends a new tab seeded with one active-asset panel; caller supplies both ids (reducer stays pure). */
  addTab(): void {
    const n = this.workspace().tabs.length + 1;
    this.store.dispatch(
      LayoutActions.createTab({
        id: crypto.randomUUID(),
        name: `Tab ${n}`,
        descriptor: { id: crypto.randomUUID(), symbol: '', timeframe: 'M1', linkGroupId: null },
      }),
    );
  }
```

- [ ] **Step 6: Repair other `createTab` call sites**

Search for `createTab(` across specs and fix any call missing `descriptor`:

Run: `npm test`
Expected: FAIL points at `workspace-viewport.component.spec.ts` / `link-groups-menu.component.spec.ts` if they call `createTab`. Add `descriptor: { id: 'seed-<n>', symbol: '', timeframe: 'M1', linkGroupId: null }` to each such dispatch. Re-run until the only failures are unrelated (or none).

- [ ] **Step 7: Verify in the running app**

`preview_click` the `+` tab button → `preview_snapshot` shows the new tab renders a chart panel (a `app-chart-panel` header with the active symbol · M1), not a "Sin panel" placeholder. `preview_screenshot` for the record.

- [ ] **Step 8: Commit**

```bash
git add emulador/src/app/state/layout/ emulador/src/app/components/workspace/
git commit -m "feat(workspace): open new tabs with one active-asset chart"
```

---

### Task 3: Non-destructive "park cells" template model (reducer + selector) — Bug 2 state

**Files:**
- Modify: `emulador/src/app/state/layout/layout.reducer.ts` (`normalizeCells` → `fitCells`; `applyGridTemplate`; `selectVisiblePanelIds`)
- Test: `emulador/src/app/state/layout/layout.reducer.spec.ts`

**Interfaces:**
- Consumes: `GRID_TEMPLATE_CELLS` (already imported in the reducer).
- Produces: after `applyGridTemplate`, `tab.cells.length >= GRID_TEMPLATE_CELLS[template]`; non-empty cells beyond the count are retained ("parked"); trailing empty cells are trimmed. `focusedPanelId` is repaired to a rendered panel when it would otherwise point at a parked one. `selectVisiblePanelIds` returns only panels in the first `GRID_TEMPLATE_CELLS[template]` cells of the active tab.

- [ ] **Step 1: Replace the merge test with park-model tests**

In `layout.reducer.spec.ts`, replace the `it('applyGridTemplate shrink merges orphaned panels into the last kept cell', …)` test with these three:

```typescript
  it('applyGridTemplate shrink parks non-empty cells instead of merging (positions preserved)', () => {
    let state = reducer(
      createInitialLayoutState(),
      LayoutActions.applyGridTemplate({ tabId: 'tab-main', template: '2h' }),
    );
    state = reducer(
      state,
      LayoutActions.addPanel({ tabId: 'tab-main', cellIndex: 1, descriptor: descriptor('panel-2') }),
    );
    state = reducer(state, LayoutActions.applyGridTemplate({ tabId: 'tab-main', template: '1' }));
    const tab = state.workspace.tabs[0];
    expect(tab.template).toBe('1');
    // panel-2 stays in its OWN cell (index 1), parked — never merged into cell 0
    expect(tab.cells).toEqual([
      { panelIds: ['panel-1'], activePanelId: 'panel-1' },
      { panelIds: ['panel-2'], activePanelId: 'panel-2' },
    ]);
    expect(state.panels['panel-2']).toBeDefined();
    assertLayoutConsistent(state);
  });

  it('applyGridTemplate grow reveals parked cells in their original slot (reversible)', () => {
    let state = reducer(
      createInitialLayoutState(),
      LayoutActions.applyGridTemplate({ tabId: 'tab-main', template: '2h' }),
    );
    state = reducer(
      state,
      LayoutActions.addPanel({ tabId: 'tab-main', cellIndex: 1, descriptor: descriptor('panel-2') }),
    );
    state = reducer(state, LayoutActions.applyGridTemplate({ tabId: 'tab-main', template: '1' }));
    state = reducer(state, LayoutActions.applyGridTemplate({ tabId: 'tab-main', template: '2h' }));
    const tab = state.workspace.tabs[0];
    expect(tab.cells[0].panelIds).toEqual(['panel-1']);
    expect(tab.cells[1].panelIds).toEqual(['panel-2']); // back on the right, not stacked left
    assertLayoutConsistent(state);
  });

  it('applyGridTemplate shrink trims TRAILING EMPTY cells (no ghost slots accumulate)', () => {
    let state = reducer(
      createInitialLayoutState(),
      LayoutActions.applyGridTemplate({ tabId: 'tab-main', template: '2h' }),
    );
    // cell 1 left empty on purpose
    state = reducer(state, LayoutActions.applyGridTemplate({ tabId: 'tab-main', template: '1' }));
    const tab = state.workspace.tabs[0];
    expect(tab.cells).toHaveLength(1);
    expect(tab.cells[0].panelIds).toEqual(['panel-1']);
    assertLayoutConsistent(state);
  });
```

Also add a focus-repair test:

```typescript
  it('applyGridTemplate re-focuses a rendered panel when the focused panel gets parked', () => {
    let state = reducer(
      createInitialLayoutState(),
      LayoutActions.applyGridTemplate({ tabId: 'tab-main', template: '2h' }),
    );
    state = reducer(
      state,
      LayoutActions.addPanel({ tabId: 'tab-main', cellIndex: 1, descriptor: descriptor('panel-2') }),
    );
    // focus the right panel, then collapse to a single cell
    state = reducer(state, LayoutActions.setFocusedPanel({ panelId: 'panel-2' }));
    state = reducer(state, LayoutActions.applyGridTemplate({ tabId: 'tab-main', template: '1' }));
    expect(state.focusedPanelId).toBe('panel-1'); // panel-2 is parked → focus falls to the rendered cell
  });
```

- [ ] **Step 2: Add a `selectVisiblePanelIds` park test**

In the section of `layout.reducer.spec.ts` that tests `selectVisiblePanelIds`, add:

```typescript
  it('selectVisiblePanelIds excludes parked cells (beyond the template cell count)', () => {
    let state = reducer(
      createInitialLayoutState(),
      LayoutActions.applyGridTemplate({ tabId: 'tab-main', template: '2h' }),
    );
    state = reducer(
      state,
      LayoutActions.addPanel({ tabId: 'tab-main', cellIndex: 1, descriptor: descriptor('panel-2') }),
    );
    state = reducer(state, LayoutActions.applyGridTemplate({ tabId: 'tab-main', template: '1' }));
    const visible = selectVisiblePanelIds.projector(state.workspace);
    expect(visible).toEqual({ 'panel-1': true }); // panel-2 parked → update-gated
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — current merge behavior returns `cells: [{panelIds:['panel-1','panel-2']…}]`; focus + selector assertions fail.

- [ ] **Step 4: Replace `normalizeCells` with `fitCells`**

In `layout.reducer.ts`, replace the `normalizeCells` function (and its doc comment) with:

```typescript
/**
 * Fits a tab's cell list to the template's cell count WITHOUT losing panels.
 * Growing appends empty cells. Shrinking drops only TRAILING EMPTY cells; a
 * non-empty cell beyond `need` is retained ("parked") so template changes are
 * non-destructive and reversible — the template is a lens over a stable cell
 * list, not a blender. Never returns fewer than `need` cells, nor fewer than
 * the number of non-empty cells.
 */
function fitCells(cells: GridCell[], need: number): GridCell[] {
  if (cells.length < need) {
    return [...cells, ...Array.from({ length: need - cells.length }, emptyCell)];
  }
  let end = cells.length;
  while (end > need && cells[end - 1].panelIds.length === 0) end--;
  return end === cells.length ? cells : cells.slice(0, end);
}
```

- [ ] **Step 5: Rewrite the `applyGridTemplate` handler (park + focus repair)**

In `layout.reducer.ts`, replace the `on(LayoutActions.applyGridTemplate, …)` handler with:

```typescript
    on(LayoutActions.applyGridTemplate, (state, { tabId, template }): LayoutState => {
      if (!state.workspace.tabs.some((t) => t.id === tabId)) return state;
      const need = GRID_TEMPLATE_CELLS[template];
      const workspace = updateTab(state.workspace, tabId, (tab) => ({
        ...tab,
        template,
        cells: fitCells(tab.cells, need),
      }));
      // Only the active tab drives focus; a background template change leaves focus alone.
      if (tabId !== workspace.activeTabId) return { ...state, workspace };
      // Focus follows visibility: if the focused panel is now parked (in a cell beyond
      // the rendered count), fall back to the first rendered cell's active panel so the
      // global timeframe controls always target a panel the user can see.
      const tab = workspace.tabs.find((t) => t.id === tabId)!;
      const rendered = tab.cells.slice(0, need);
      const visible = new Set(rendered.map((c) => c.activePanelId).filter(Boolean));
      const focusedPanelId =
        state.focusedPanelId && visible.has(state.focusedPanelId)
          ? state.focusedPanelId
          : (rendered[0]?.activePanelId || null);
      return { ...state, workspace, focusedPanelId };
    }),
```

- [ ] **Step 6: Slice `selectVisiblePanelIds` to rendered cells**

In `layout.reducer.ts`, replace the `selectVisiblePanelIds` selector body with:

```typescript
export const selectVisiblePanelIds = createSelector(
  layoutFeature.selectWorkspace,
  (ws): Record<string, true> => {
    const active = ws.tabs.find((t) => t.id === ws.activeTabId);
    if (!active) return {};
    const rendered = GRID_TEMPLATE_CELLS[active.template];
    const visible: Record<string, true> = {};
    for (const cell of active.cells.slice(0, rendered)) {
      if (cell.activePanelId) visible[cell.activePanelId] = true;
    }
    return visible;
  },
);
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test`
Expected: PASS for all Task-3 tests. If the property-based invariant test (`keeps the invariant across an arbitrary create/move/close/closeTab/shrink sequence`) fails, confirm it's asserting the OLD merge shape and update its expectations to the park shape (it should still call `assertLayoutConsistent` — the invariant itself is unchanged and must stay green).

- [ ] **Step 8: Commit**

```bash
git add emulador/src/app/state/layout/
git commit -m "feat(workspace): non-destructive reversible grid templates (park cells)"
```

---

### Task 4: Viewport renders parked cells hidden (keep-alive preserved) — Bug 2 visual

**Files:**
- Modify: `emulador/src/app/components/workspace/workspace-viewport.component.ts` (template + `renderedCount` method + imports)
- Test: `emulador/src/app/components/workspace/workspace-viewport.component.spec.ts`

**Interfaces:**
- Consumes: `GRID_TEMPLATE_CELLS` from `layout.models`; `TabLayout`.
- Produces: cells at index `>= GRID_TEMPLATE_CELLS[tab.template]` carry `[hidden]` and render `display:none` (via the `.cell[hidden]` rule from Task 1) while staying mounted.

- [ ] **Step 1: Add a spec asserting parked cells are hidden but mounted**

In `workspace-viewport.component.spec.ts`, add (adapt the harness/`setState` helper to the file's existing pattern for driving the store):

```typescript
  it('keeps parked cells mounted but hidden when the template shrinks below their index', () => {
    // Arrange a tab: template '1' but two non-empty cells (cell 1 parked)
    // using the store the component reads (mirror the existing spec's setup helper).
    store.setState(stateWithTab({
      template: '1',
      cells: [
        { panelIds: ['p1'], activePanelId: 'p1' },
        { panelIds: ['p2'], activePanelId: 'p2' },
      ],
      panels: { p1: panel('p1'), p2: panel('p2') },
    }));
    fixture.detectChanges();
    const cells = fixture.nativeElement.querySelectorAll('.cell');
    expect(cells).toHaveLength(2);                 // both mounted (keep-alive)
    expect(cells[0].hasAttribute('hidden')).toBe(false);
    expect(cells[1].hasAttribute('hidden')).toBe(true); // cell index 1 >= renderedCount(1)
  });
```

If the spec file has no `stateWithTab`/`panel` helper, reuse whatever store-seeding pattern the neighbouring tests use; the assertion (two `.cell` nodes, second `[hidden]`) is what matters.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — no `[hidden]` on the second cell (all cells currently render visible).

- [ ] **Step 3: Import `GRID_TEMPLATE_CELLS` in the viewport**

In `workspace-viewport.component.ts`, add `GRID_TEMPLATE_CELLS` to the existing import from `../../state/layout/layout.models`:

```typescript
import {
  GRID_TEMPLATE_CELLS,
  GridTemplate,
  MAX_PANELS_PER_TAB,
  PanelDescriptor,
  TabLayout,
} from '../../state/layout/layout.models';
```

- [ ] **Step 4: Add a `renderedCount` method**

In the `WorkspaceViewportComponent` class, near `tabAtCap`, add:

```typescript
  /** RFC-013 follow-up: number of cells the current template renders; cells past this index are parked (kept mounted, hidden). */
  renderedCount(tab: TabLayout): number {
    return GRID_TEMPLATE_CELLS[tab.template];
  }
```

- [ ] **Step 5: Mark parked cells hidden in the template**

In `workspace-viewport.component.ts`, change the cell wrapper line inside the grid `@for`:

```html
        @for (cell of tab.cells; track $index; let ci = $index) {
          <div class="cell" [hidden]="ci >= renderedCount(tab)">
```

(The `.cell[hidden]{display:none}` rule was added in Task 1. Parked cells stay in the `@for` — mounted — but collapse out of the CSS grid, so the visible cells fill the template tracks exactly.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (the new spec + all existing viewport specs). Fix any neighbour spec that assumed every cell renders visible.

- [ ] **Step 7: Verify the full Bug-2 scenario in the app**

With a data-loaded session (single panel A in the main tab):
1. `preview_click` the `2h` template button (`.template-btn` with text `2h`).
2. `preview_click` the right cell's `+` (`.cell-add`), then confirm a second panel B appears on the right (`preview_snapshot`).
3. `preview_click` the `1` template button. `preview_inspect` `.cell` nodes: the second `.cell[hidden]` computes `display:none`; only panel A shows full-width; `preview_inspect` the focused panel is A.
4. `preview_click` the `2h` button again. `preview_screenshot`: panel B is back **on the right** (not stacked on the left). This is the corrected behaviour from your image `M1`.

- [ ] **Step 8: Commit**

```bash
git add emulador/src/app/components/workspace/
git commit -m "fix(workspace): keep parked panels mounted but hidden on template shrink"
```

---

### Task 5: Audit-driven cleanups + documentation (optional but recommended)

**Files:**
- Modify: `emulador/src/app/state/layout/layout.effects.ts`
- Modify: `docs/engineering/domain/workspace-panels.md`
- Test: `emulador/src/app/state/layout/layout.effects.spec.ts` (create if absent, or extend)

**Interfaces:**
- Consumes: existing effect + actions.
- Produces: `syncTimeframeOnFocus$` dispatches ONLY real `changeTimeframe`/`changeCustomTimeframe` actions (no `{type:'noop'}` reaches the store).

- [ ] **Step 1: Add/extend an effect spec asserting no dummy action is emitted**

In `layout.effects.spec.ts`, add:

```typescript
  it('emits nothing when the focused panel is unknown (no noop action)', async () => {
    actions$ = of(LayoutActions.setFocusedPanel({ panelId: 'ghost' }));
    store.overrideSelector(layoutFeature.selectPanels, {});
    const emitted: unknown[] = [];
    effects.syncTimeframeOnFocus$.subscribe((a) => emitted.push(a));
    expect(emitted).toEqual([]);
  });
```

(Follow the file's existing effect-testing harness — `provideMockActions`, `provideMockStore` — if one is already established elsewhere in the repo.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — currently emits `{type:'noop'}`.

- [ ] **Step 3: Replace the noop path with `filter`**

In `layout.effects.ts`, rewrite `syncTimeframeOnFocus$` so non-syncable focuses emit nothing:

```typescript
  syncTimeframeOnFocus$ = createEffect(() =>
    this.actions$.pipe(
      ofType(LayoutActions.setFocusedPanel, LayoutActions.setActivePanel),
      withLatestFrom(this.store.select(layoutFeature.selectPanels)),
      map(([{ panelId }, panels]) => panels[panelId]?.timeframe ?? null),
      filter((tf): tf is Timeframe => tf !== null),
      map((tf) => {
        const standardTfs = new Set<string>(Object.keys(TIMEFRAME_SECONDS));
        if (standardTfs.has(tf)) return MarketActions.changeTimeframe({ tf });
        const minutes = tf.startsWith('M') ? parseInt(tf.substring(1), 10) : NaN;
        return isNaN(minutes) ? null : MarketActions.changeCustomTimeframe({ minutes });
      }),
      filter((action): action is NonNullable<typeof action> => action !== null),
    ),
  );
```

Add `filter` to the `rxjs/operators` import and `Timeframe` to the `../../models` import.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Document the model + coupling invariant**

In `docs/engineering/domain/workspace-panels.md`, under the "UI integration (RFC-013)" section, append two short paragraphs:

```markdown
### Template = lens, not blender (RFC-013 follow-up)

`applyGridTemplate` is non-destructive: cells are a stable ordered list; the
template only decides how many are rendered. Shrinking parks (keeps mounted +
`[hidden]`, update-gated) the non-empty cells that no longer fit and trims only
trailing empty cells; growing reveals parked cells in their original slot. So
`cells.length` may exceed `GRID_TEMPLATE_CELLS[template]` — the layout invariant
permits this (it only enforces the panel↔cell bijection). `[hidden]` genuinely
hides only because each host declares a `[hidden]{display:none}` rule that
out-specifies its own `display` rule — the UA rule alone loses the cascade.

### Focused panel is the global-TF proxy

The focused panel and the global market timeframe are two-way bound:
focusing a panel syncs the global TF to it (`LayoutEffects.syncTimeframeOnFocus$`
→ `MarketActions.changeTimeframe`), and the global M1/H1/D1 controls write the
focused panel's TF (handled in `layout.reducer`). A panel's own `<select>`
(`setPanelTimeframe`) is intentionally panel-local and does NOT move the global
TF. `applyGridTemplate` re-focuses a rendered panel whenever the focused one is
parked, so the global controls never target an off-screen panel.
```

- [ ] **Step 6: Commit**

```bash
git add emulador/src/app/state/layout/layout.effects.ts docs/engineering/domain/workspace-panels.md
git commit -m "refactor(workspace): drop noop effect action; document layout+TF model"
```

---

## Deferred (not in this plan)

- **De-duplicate forming-candle/countdown** between `selectChartView` and `ChartModelMapper.computeFormingCandle`/`computeCountdown`. High value (removes divergence risk) but touches the mapper's core derivation and many specs — worth its own scoped change with a shared pure helper, not bundled into a layout bugfix.
- **Dangling `focusedPanelId` after `closeTab`/`removePanel`** — currently tolerated (all readers guard). Task 3 fixes the template-change case; a small follow-up can repair the close/remove cases the same way.

## Risks & notes

- **Persistence:** the park model lets a saved layout carry `cells.length > GRID_TEMPLATE_CELLS[template]`. `layout-invariants.ts` already allows this and `GRID_TEMPLATE_CELLS` is only read in the reducer/viewport, so restore is safe — but re-run `session-migration.spec.ts` and `workspace-db.service.spec.ts` after Task 3 to confirm round-trips stay green.
- **Verification honesty:** the CSS tasks (1 & 4-visual) are proven in a real browser via `preview_*`, not by unit tests — jsdom cannot compute `display`. Do not claim Bug 1/2 fixed on `npm test` alone; attach the `preview_screenshot`/`preview_inspect` evidence.

## Self-Review

- **Spec coverage:** Bug 1 → Task 1 (hide inactive tab) + Task 2 (new tab shows a chart). Bug 2 → Task 1 (no stacked-visible panels) + Task 3 (park state, reversible, focus repair) + Task 4 (parked cells hidden, mounted). Audit refactor asks → Task 5 + Deferred. All covered.
- **Placeholder scan:** every code/step block contains full code or an exact command; no TBD/TODO.
- **Type consistency:** `createTab({id,name,descriptor})`, `PanelDescriptor`, `fitCells(cells, need)`, `renderedCount(tab)`, `GRID_TEMPLATE_CELLS[template]`, `selectVisiblePanelIds` — names used consistently across Tasks 2–4.
