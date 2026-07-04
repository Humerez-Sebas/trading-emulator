# RFC-013 Workspace UI Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mount the RFC-008..012 multi-chart workspace in the production page and add the user-facing controls that drive the (almost entirely pre-existing) NgRx actions: replace `<app-chart>` with `<app-workspace-viewport>` in `EmuladorPageComponent` (`emulador/src/app/pages/emulador/emulador-page.component.ts:39`), add tab management (create/rename/close) and a `GridTemplate` switcher to the viewport's tab bar, add a per-panel timeframe selector and a LinkGroup assignment chip to the panel header, and add a LinkGroups manager popover (create/delete groups, toggle `syncCrosshair`/`syncTimeRange`). Spec: `docs/architecture/rfcs/013-workspace-ui-integration.md` (Decisions D1–D9 govern this plan).

**Architecture:** The engine is DONE — this RFC is a thin dispatch layer. Existing actions consumed as-is: `LayoutActions.createTab/closeTab/setActiveTab/applyGridTemplate/addPanel/removePanel/setActivePanel/setPanelLinkGroup` (`state/layout/layout.actions.ts`) and `LinkGroupsActions.createGroup/removeGroup/setSyncCrosshair/setSyncTimeRange` (`state/link-groups/link-groups.actions.ts`). Only TWO additive actions are new: `renameTab` and `setPanelTimeframe` (Task 1). The default layout changes from the RFC-008 demo (`'2h'`, M1|M5) to mono-panel (`'1'`, M1) so cold start looks identical to today's single chart (D2). `LinkGroup` has NO `name` field (frozen interface, `state/link-groups/link-groups.models.ts:1-8`) — groups are identified by COLOR throughout the UI (D6). Panels stay `symbol: ''` (active-asset sentinel) — this RFC is mono-symbol/multi-timeframe (D3). Persistence needs ZERO work: descriptor/layout/linkGroups changes already flow through `selectWorkspaceMetaSnapshot` → `persistMeta$` → `WorkspaceMeta` → `SessionPayloadV2` (RFC-011).

**Tech Stack:** Angular 21 standalone + signals (`input`/`computed`/`effect`/`signal`), NgRx 21, Vitest 4 via `ng test` (NEVER bare `npx vitest run` — it fails on `TestBed.initTestEnvironment`; the Angular builder owns the env), `provideMockStore`.

## Global Constraints

- **No new dependencies.** No CDK overlay/menu libs — popovers/menus are plain conditional DOM (`@if` + a document-click-to-close host listener), consistent with the repo's existing dialog components.
- **FORBIDDEN (AUDITED-FILE PROTECTION):** `emulador/src/app/domain/chart/chart-engine.ts`, `emulador/src/app/components/chart/chart.component.ts` — in NO task's file list. Also untouched this RFC: `chart-model-mapper.service.ts`, `chart-registry.service.ts`, `chart-sync-router.ts` (no sanction needed — nothing here requires them).
- **SANCTIONED files:** `state/layout/layout.actions.ts` + `layout.reducer.ts` (+ models default; additive), `components/workspace/workspace-viewport.component.ts`, `components/workspace/chart-panel.component.ts` (both RFC-008 wrappers, NOT audited), `pages/emulador/emulador-page.component.ts`, NEW UI component files under `components/workspace/`.
- **FORBIDDEN: factory selectors parametrized by `panelId`/`symbol`** (block discipline D8/D9, unchanged).
- **`syncPriceScale` stays RESERVED (R3):** no UI control reads or writes it.
- **A11y follows the repo's established pattern** (RFC-009 precedent): clickable non-button elements get `role`/`tabindex`/`keydown.enter`/`keydown.space`; lint enforces this — budget for it up front.
- **Harness:** gates per task, from `emulador/`: `npx tsc -p tsconfig.app.json --noEmit`, `npx tsc -p tsconfig.spec.json --noEmit`, `npm test -- --watch=false`, `npm run lint` → 0 problems. Known flake rule: if only `trading-capability.spec.ts`/`selectors.spec.ts` fail, re-run once. Pre-existing initial-bundle budget warning (~608 kB) is acceptable at build; do not fix here.
- Baseline at branch start: **939 tests / 72 files green** (develop after RFC-012 merge).
- Task-scoped conventional commits; explicit pathspec staging (`git add <files>`).

---

### Task 1: Additive layout actions (`renameTab`, `setPanelTimeframe`) + mono-panel default (D2/D7)

**Files:**
- Modify: `emulador/src/app/state/layout/layout.actions.ts` (2 new events)
- Modify: `emulador/src/app/state/layout/layout.reducer.ts` (2 new `on()` handlers)
- Modify: `emulador/src/app/state/layout/layout.models.ts` (`createInitialLayoutState` default — D2)
- Test: append to `emulador/src/app/state/layout/layout.reducer.spec.ts`; update ONLY assertions that encoded the old `'2h'` demo default (see Step 4)

**Interfaces:**

```ts
// layout.actions.ts — ADD to the events map (existing events untouched):
    /** Renames a tab in place. No-op if tabId is unknown. */
    'Rename Tab': props<{ tabId: string; name: string }>(),
    /** Updates one panel's timeframe (descriptor-only; the mapper re-derives the view). No-op if panelId is unknown. */
    'Set Panel Timeframe': props<{ panelId: string; timeframe: Timeframe }>(),
```

(`Timeframe` imported from `../../models` — confirm the exact import path/union members by reading `layout.models.ts`'s own `Timeframe` import first.)

```ts
// layout.models.ts — createInitialLayoutState() becomes mono-panel (D2). Update the doc
// comment too (it currently says "RFC-008 fixed in-memory panel set ... '2h' ... M1 | M5"):
export function createInitialLayoutState(): LayoutState {
  return {
    workspace: {
      tabs: [{ id: 'tab-main', name: 'Principal', template: '1', cells: [{ panelIds: ['panel-1'], activePanelId: 'panel-1' }] }],
      activeTabId: 'tab-main',
    },
    panels: { 'panel-1': { id: 'panel-1', symbol: '', timeframe: 'M1', linkGroupId: null } },
  };
}
```

- [ ] **Step 1: Read the real files** — `layout.reducer.ts` end-to-end (handler style: typed returns, no-op guard conventions, `on()` ordering), `layout.reducer.spec.ts` (fixture helpers), `models.ts` (`Timeframe` union).
- [ ] **Step 2: Failing specs** (append to `layout.reducer.spec.ts`, matching its house fixture style): `renameTab` renames the target tab and leaves others untouched; unknown `tabId` is a no-op (state identity preserved). `setPanelTimeframe` updates ONLY that descriptor's `timeframe` (id/symbol/linkGroupId untouched, other panels untouched); unknown `panelId` is a no-op. After each, `assertLayoutConsistent` (import from `./layout-invariants.spec-util`) still passes.
- [ ] **Step 3: Implement** the two handlers following the file's exact conventions (e.g. no-op via early identity return, `Object.fromEntries`/spread map updates as the file already does).
- [ ] **Step 4: Apply the D2 default change** and run the FULL suite. Existing specs that encoded the `'2h'`/two-panel demo default (candidates: layout reducer specs asserting `panel-2`, any viewport/panel spec relying on the initial state rather than its own fixture) WILL fail — update ONLY the assertions that hard-coded the old default, documenting each in the report. If a failure is NOT clearly a default-encoding, STOP and report BLOCKED (it means the default is load-bearing somewhere unexpected).
- [ ] **Step 5: Verify** — all four gates.
- [ ] **Step 6: Commit** — `feat(state): add renameTab/setPanelTimeframe and mono-panel default layout (RFC-013 Task 1)`

---

### Task 2: Tab management + GridTemplate switcher in the viewport tab bar (D4/D5)

**Files:**
- Modify: `emulador/src/app/components/workspace/workspace-viewport.component.ts`
- Test: append to `emulador/src/app/components/workspace/workspace-viewport.component.spec.ts`

**Design:** extend the EXISTING `.tab-bar` row (`workspace-viewport.component.ts:41-53`): per-tab hover `×` close affordance (span with the RFC-009 a11y pattern, `stopPropagation`, dispatches `closeTab`; hidden/disabled when it is the last tab), double-click on the tab label enters inline rename (a small `<input>` bound to a local `editingTabId` signal; Enter/blur commits `renameTab`, Escape cancels), an `+` add-tab button after the last tab (dispatches `createTab({ id: crypto.randomUUID(), name: `Tab ${tabs.length + 1}` })` — caller supplies ids, reducer stays pure, same convention as `addPanel` at line 253-261), and a right-aligned `.tab-bar-tools` cluster holding the template switcher: seven buttons (one per `GridTemplate`, imported `GRID_TEMPLATE_CELLS` keys or a literal array of the closed union), each with a CSS mini-glyph or text label (`1`, `▦2h`…), active template highlighted, click dispatches `applyGridTemplate({ tabId: activeTabId, template })`.

- [ ] **Step 1: Read** the current viewport spec end-to-end (it stubs `ChartPanelComponent` — fine here, this task tests toolbar dispatches, not mounting) and reuse its store fixture/`setState` conventions.
- [ ] **Step 2: Failing specs** (behavioral contracts, matching the file's dispatch-spy style): add-tab button dispatches `createTab` with a fresh id and activates nothing else; `×` dispatches `closeTab` for THAT tab and does not fire `setActiveTab` (stopPropagation); the `×` is absent/disabled when only one tab exists; double-click → input appears → Enter dispatches `renameTab` with the typed name; Escape dispatches nothing; each template button dispatches `applyGridTemplate` for the ACTIVE tab; the active template's button carries the active class.
- [ ] **Step 3: Implement** template + minimal CSS consistent with the existing `.tab`/`.cell-add` styles (muted borders, `var(--radius)`, 11-12px). A11y: the `×` span follows the exact pattern at lines 69-78 (`role="button"`, `tabindex="0"`, `keydown.enter/space`); the rename input gets an `aria-label`.
- [ ] **Step 4: Verify** — four gates.
- [ ] **Step 5: Commit** — `feat(workspace): tab create/rename/close and grid-template switcher in viewport tab bar (RFC-013 Task 2)`

---

### Task 3: Per-panel timeframe selector in the panel header (D7)

**Files:**
- Modify: `emulador/src/app/components/workspace/chart-panel.component.ts`
- Test: append to `emulador/src/app/components/workspace/chart-panel.component.spec.ts`

**Design:** a compact `<select>` in `.panel-header` (between the label and the price), value = `descriptor().timeframe`, options = the SAME timeframe list the global UI offers — find the single source of truth first (grep for the global TF option list; candidates: a constant in `models.ts` or the list `ControlsComponent` renders) and REUSE it (import the constant; do NOT hand-write a second list). `change` dispatches `LayoutActions.setPanelTimeframe({ panelId: descriptor().id, timeframe })`. The component gains a `Store` injection for this single dispatch (it currently has none — mapper/bus/registry only); that is acceptable wrapper-layer wiring (the viewport already injects Store).

- [ ] **Step 1: Read** `chart-panel.component.spec.ts` conventions (TestBed module, `ChartStubComponent` override, `create(desc)` helper) and locate the global TF list source.
- [ ] **Step 2: Failing specs:** the header renders a select whose value mirrors the descriptor's timeframe; changing it dispatches `setPanelTimeframe` with THIS panel's id; the select lists exactly the global TF options.
- [ ] **Step 3: Implement** (template + dispatch + small CSS: font-size 11px, transparent background, `var(--border)`). Note: `headerLabel()` already renders the timeframe (line 98-101) — keep label behavior coherent (symbol-only label when the select shows the TF, or leave both; pick the cleaner read and document).
- [ ] **Step 4: Verify** — four gates.
- [ ] **Step 5: Commit** — `feat(workspace): per-panel timeframe selector in panel header (RFC-013 Task 3)`

---

### Task 4: LinkGroups manager popover + panel link chip (D6)

**Files:**
- Create: `emulador/src/app/components/workspace/link-groups-menu.component.ts`
- Create: `emulador/src/app/components/workspace/link-groups-menu.component.spec.ts`
- Modify: `emulador/src/app/components/workspace/workspace-viewport.component.ts` (mount the menu button + popover in `.tab-bar-tools`)
- Modify: `emulador/src/app/components/workspace/chart-panel.component.ts` (link chip + mini-menu in `.panel-header`)
- Test: append to both touched components' specs

**Design:**
- **Palette (fixed, exported const in `link-groups-menu.component.ts`):** `LINK_GROUP_PALETTE = ['#2962FF', '#F23645', '#089981', '#FF9800', '#9C27B0', '#00BCD4']`. "Nuevo grupo" picks the first palette color not already used (wrap around if all used); dispatches `LinkGroupsActions.createGroup({ group: { id: crypto.randomUUID(), color, syncCrosshair: true, syncTimeRange: true } })` (both toggles default ON — a fresh group should visibly sync immediately; `syncPriceScale` intentionally ABSENT, R3).
- **`LinkGroupsMenuComponent`:** standalone, OnPush, selects `linkGroupsFeature.selectGroups`; renders each group as a row (color swatch + two labeled checkbox toggles dispatching `setSyncCrosshair`/`setSyncTimeRange` + delete button dispatching `removeGroup`). NOTE the known semantics: `removeGroup` does NOT clear `PanelDescriptor.linkGroupId` (dangling ids are tolerated by the router — RFC-010 verified); the menu's delete should ALSO dispatch `LayoutActions.setPanelLinkGroup({ panelId, linkGroupId: null })` for each panel currently in that group (read `layoutFeature.selectPanels` for membership) so the UI never shows a chip for a deleted group — assert this in the spec.
- **Panel link chip (`chart-panel.component.ts` header):** a small round swatch button — group color when linked, hollow/gray when not — that toggles a local mini-menu listing existing groups (color dots) + "Sin grupo"; selection dispatches `LayoutActions.setPanelLinkGroup({ panelId, linkGroupId })`. Panel needs `linkGroupsFeature.selectGroups` via the Store it gained in Task 3.
- **Popover mechanics (both menus):** local `open` signal + `@if`; close on selection and on a `(document:click)` host listener that ignores clicks inside the component (plain DOM, no CDK). A11y per the repo pattern.

- [ ] **Step 1: Failing specs.** Menu: create dispatches `createGroup` with an unused palette color and both sync flags true; toggles dispatch the right action with the right groupId/enabled; delete dispatches `removeGroup` AND one `setPanelLinkGroup(null)` per member panel. Chip: unlinked panel shows the hollow chip; choosing a group dispatches `setPanelLinkGroup` with THIS panel id; linked panel's chip shows the group color; "Sin grupo" dispatches null.
- [ ] **Step 2: Implement** both, matching existing CSS vocabulary.
- [ ] **Step 3: Verify** — four gates.
- [ ] **Step 4: Commit** — `feat(workspace): link-group manager popover and per-panel link chip (RFC-013 Task 4)`

---

### Task 5: Production swap + cold-start and persistence-integration proofs (D1)

**Files:**
- Modify: `emulador/src/app/pages/emulador/emulador-page.component.ts`
- Test: append/create `emulador/src/app/pages/emulador/emulador-page.component.spec.ts` (check whether one exists; if not, create following the sibling `sesiones-page.component.spec.ts` conventions)
- Test: append to `emulador/src/app/state/workspaces/session-persistence.e2e.spec.ts` (one UI-shaped case)

**Steps:**
- [ ] **Step 1: The swap.** In `emulador-page.component.ts`: replace `<app-chart></app-chart>` (line 39) with `<app-workspace-viewport />`; replace the `ChartComponent` import with `WorkspaceViewportComponent`; REMOVE `providers: [ChartModelMapper]` and its import (its only consumer was the bare chart — verified: the only injectors of `ChartModelMapper` are `chart.component.ts` and `chart-panel.component.ts`, both panel-provided now). Overlays (`app-floating-pnl`, `app-playback-controller`, `app-floating-toolbar`) and the rest of the template stay byte-identical.
- [ ] **Step 2: Failing page specs** (stub `WorkspaceViewportComponent` shallowly or mount with a mock store — follow whatever the existing page/side-dock specs do): the page renders the viewport (not `app-chart`); overlays render under their existing store flags; no `ChartModelMapper` provider remains at page level (assert via `TestBed` injector isolation or simply by the component metadata — pick the file's idiomatic approach).
- [ ] **Step 3: Persistence-integration case** (append to `session-persistence.e2e.spec.ts`, reusing its reducer-chain style): simulate the UI flow AS ACTIONS — `createTab` → `applyGridTemplate('2x2')` → `addPanel`×2 → `setPanelTimeframe` → `createGroup` + `setPanelLinkGroup` — feed the resulting layout/panels/linkGroups through the existing `toPayload → JSON → parseSessionPayload → fromPayload → restore actions` chain, and assert the restored state equals the built state and passes `assertLayoutConsistent`. This is the DoD-5 proof that UI-built workspaces survive the full persistence cycle.
- [ ] **Step 4: Verify** — four gates PLUS `npm run build` (the swap changes the lazy `emulador-page-component` chunk; only the pre-existing ~608 kB budget warning is acceptable; `app-chart` remains bundled via the panels — expect no dead-code surprises).
- [ ] **Step 5: Commit** — `feat(emulador): mount workspace viewport in the production page (RFC-013 Task 5)`

---

## Final verification (RFC-013 Estado Esperado / DoD)

- DoD-1: tsc app + lint 0 — every task's gates plus the final whole-branch run.
- DoD-2: cold start mono-panel + overlays — Task 5 page specs + Task 1's D2 default.
- DoD-3: tabs (create/rename/close), 7 templates, add/close panels, per-panel TF — Tasks 1–3 specs.
- DoD-4: link groups CRUD + toggles + assignment; sync itself is RFC-010 machinery (unchanged, already proven) — Task 4 specs.
- DoD-5: UI-built layout survives the persistence cycle — Task 5 Step 3 integration case.
- DoD-6: whole suite green; `assertLayoutConsistent` asserted after every state-mutating UI spec (Tasks 1, 5).
- DoD-7 invariant greps: `git diff develop..HEAD -- emulador/src/app/domain/chart/chart-engine.ts emulador/src/app/components/chart/chart.component.ts` → empty; zero new `createSelector` factories by panelId/symbol in touched files; `package.json` untouched; no CDK/overlay dependency appeared.
