# RFC-010 Synchronization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the RFC-008/009 panel host its first real cross-panel behavior: opt-in `LinkGroup`s that sync crosshair and/or visible time range between member panels (never price scale — reserved, R3), routed through the RFC-008 `ChartSyncBus` skeleton without reintroducing a feedback loop (A moves B, B moves A, ...), plus verification that the existing global replay clock (`selectReplayIndex`/`selectCurrentTime` → `lastIndexAtOrBefore` per panel, already live in `ChartModelMapper.panelChartView$`) fans out correctly to N panels with freeze-on-last for symbols with data gaps.

**Architecture:** A new `linkGroups` NgRx feature (`Record<string, LinkGroup>` entity map, same Record-based pattern as `layout`'s `panels` — no `@ngrx/entity`) owns group CRUD and the `syncCrosshair`/`syncTimeRange` toggles; membership (`PanelDescriptor.linkGroupId`) stays a `layout`-feature field (already transported since RFC-009) and is mutated via a new `LayoutActions.setPanelLinkGroup` event, because the reducer that owns `PanelDescriptor` must be the only writer of it. Routing logic lives in a new session-scoped `ChartSyncRouter` (plain class, `useFactory`-provided by `WorkspaceViewportComponent`, exactly like `ChartSyncBus`/`ChartRegistry` — framework-free, no Store/DI inside it): it subscribes to `ChartSyncBus.events$`, is fed a live snapshot of `{ panels, linkGroups }` by the viewport (via an `effect` calling `router.setState(...)`, since the router itself cannot inject the Store), resolves the origin panel's `linkGroupId`, and — only if the group has the relevant `sync*` flag on — fans the event out to every OTHER panel sharing that `linkGroupId` (never back to the origin) via a new pair of `ChartRegistry`/`PanelChartHandle` delegate methods, `applyCrosshair`/`applyVisibleRange`, applied idempotently (a no-op if the incoming value already matches the panel's last-applied value) so that even a receiving panel whose apply were to (incorrectly) re-emit cannot cascade. The replay clock needs no new state: `ChartModelMapper.panelChartView$` already derives `idx = lastIndexAtOrBefore(candles, currentTime)` per panel from the single global `selectCurrentTime`, and `lastIndexAtOrBefore`'s binary search already returns the last candle at-or-before `T` when `T` exceeds a panel's own coverage — this IS freeze-on-last, with zero new code; RFC-010's task here is a fan-out/freeze-on-last verification suite, not new clock plumbing.

**Tech Stack:** Angular 21 standalone + signals, NgRx 21, RxJS 7.8, Vitest 4 via `ng test`.

## Global Constraints

- **No new dependencies.** `@ngrx/entity` is NOT added; `linkGroups` uses the same `Record<string, LinkGroup>` pattern as `layout.panels`.
- **FORBIDDEN:** shared NgRx factory selectors parametrized by `panelId` (D8/RFC-009 discipline, inherited unchanged). Any lookup by panel id happens inside plain-class routing code (`ChartSyncRouter`), never as a `createSelector` factory.
- **`syncPriceScale` stays RESERVED, NOT implemented (R3).** The `LinkGroup` interface carries the optional field (schema stability for RFC-011's persistence), the reducer accepts and stores it verbatim, but NO code path reads or applies it. `ChartSyncRouter` never branches on it. If a future change makes `ChartSyncRouter` react to `syncPriceScale`, that is out of RFC-010's scope by design — flag it, don't implement it here.
- **A panel belongs to at most one `LinkGroup`** (`PanelDescriptor.linkGroupId: string | null`; no multi-membership). This is what lets `ChartSyncRouter` resolve "siblings" with a single map lookup instead of set-union over overlapping groups.
- **Sanctioned additive changes to RFC-001..009 audited/reviewed code (each additive-only, mandated by RFC-010's routing/apply seam):**
  1. `chart-engine.ts` (Task 3): ADD `applyCrosshair(time)`/`applyVisibleRange(range)` public methods (delegating to the ALREADY-PUBLIC `chartApi`/`seriesApi` — no new exposure, `chart-engine.ts` lines 9-10, pre-existing, marked with an unrelated removal TODO from RFC-004/005 that this RFC does not touch) PLUS a private `applyingSync` boolean re-entrancy guard wrapped around the two existing `subscribeCrosshairMove`/`subscribeVisibleLogicalRangeChange` callbacks in the constructor. No other line changes — `render`/`registerCapability`/`destroy`/etc. are untouched. Rationale: this is the ONE place that talks to `lightweight-charts` directly, so it is also the correct (and only) place to close the RFC's named feedback-loop risk at its root, rather than downstream in a component.
  2. `chart.component.ts` (Task 3): ADD a second output, `readonly chartControlReady = output<ChartControlHandle>();`, emitted alongside (not replacing) the existing `chartReady`, at the same call site in `ngAfterViewInit`, as a pure pass-through to `this.engine.applyCrosshair`/`applyVisibleRange` (item 1) — no logic of its own. Rationale: `ChartPanelComponent` needs a way to programmatically drive the chart from a received sync event; `chartReady`'s `ChartEventBus` is output-only (events FROM the chart), so a second, separate, additive output is the smallest seam that does not repurpose or widen the meaning of the first.
  3. `chart-panel.component.ts` (RFC-008/009 component, reviewed not frozen): extended per Task 3 to receive `chartControlReady`, store the handle, and register `applyCrosshair`/`applyVisibleRange` delegates on `PanelChartHandle` (extending the RFC-009 interface additively — new methods, no signature changes to `setUpdatesEnabled`).
  4. `chart-registry.service.ts`: `PanelChartHandle` gains the two new methods (Task 2/3). Purely additive to the interface; `ChartRegistry`'s class body (register/deregister/get/ids/count) is unchanged.
  5. `workspace-viewport.component.ts`: provides the new `ChartSyncRouter` (Task 5) alongside the existing `ChartSyncBus`/`ChartRegistry` providers, and feeds it live `{panels, linkGroups}` snapshots (Task 5).
  6. `layout.actions.ts` / `layout.reducer.ts`: ADD `setPanelLinkGroup` (Task 1) — one new action, one new `on()` handler, no changes to existing handlers.
  7. `app.config.ts`: register the new `linkGroupsFeature` reducer (Task 1), same one-line pattern as every other feature already listed there.
- **Feedback-loop prevention (the RFC's named risk) is two independent mechanisms, BOTH required, and both need dedicated tests, per RFC-010 point 6:**
  1. **No re-emission on receipt, enforced at the source:** `ChartEngine`'s `applyingSync` guard (Task 3) suppresses the engine's own `CrosshairMoved`/`VisibleRangeChanged` bus emission for the synchronous duration of any `applyCrosshair`/`applyVisibleRange` call, so a panel that receives and applies a sync event cannot possibly re-emit as a reaction to that application — regardless of whether the underlying `lightweight-charts` library does or does not itself re-fire `subscribeCrosshairMove`/`subscribeVisibleLogicalRangeChange` on programmatic calls (undocumented, version-dependent; the guard makes the answer irrelevant). `ChartPanelComponent` otherwise only calls `syncBus.emit` from `onChartReady`'s `events.on(...)` listeners, which are the SAME bus the guard protects.
  2. **Idempotent application:** `ChartSyncRouter` (Task 2) tracks the last-applied value per (panelId, event type) and short-circuits (no-op, no handle call) when the incoming value is referentially/structurally identical to the last one applied — the same short-circuit discipline the P1 `chartStyle$` regression suite already validates, reapplied here.
- **Freeze-on-last (D5) requires no new state**, only tests confirming `lastIndexAtOrBefore`'s existing at-or-before semantics (`fill-engine.ts` lines 253-265) produce the frozen index (not `-1`, not an out-of-bounds index) when the global cursor is past a panel's own last candle, and that the panel automatically un-freezes (tracks the cursor again) once it re-enters that panel's coverage — Task 4.
- Verification per task (from `emulador/`): `npx tsc -p tsconfig.app.json --noEmit`, `npx tsc -p tsconfig.spec.json --noEmit`, `npm test -- --watch=false`, and `npm run lint` → zero NEW lint problems (pre-existing baseline errors on this branch are tracked separately; do not fix them here).
- Known pre-existing suite flakiness in `trading-capability.spec.ts` / `selectors.spec.ts` (tracked separately): if a run fails there, re-run before concluding.
- Task-scoped conventional commits.

---

### Task 1: `linkGroups` NgRx feature + `PanelDescriptor.linkGroupId` mutation

**Files:**
- Create: `emulador/src/app/state/link-groups/link-groups.models.ts`
- Create: `emulador/src/app/state/link-groups/link-groups.actions.ts`
- Create: `emulador/src/app/state/link-groups/link-groups.reducer.ts`
- Create: `emulador/src/app/state/link-groups/link-groups.reducer.spec.ts`
- Modify: `emulador/src/app/state/layout/layout.actions.ts` (add `setPanelLinkGroup`)
- Modify: `emulador/src/app/state/layout/layout.reducer.ts` (add the handler)
- Test: append to `emulador/src/app/state/layout/layout.reducer.spec.ts`
- Modify: `emulador/src/app/app.config.ts` (register `linkGroupsFeature.name`/`.reducer`)

**Interfaces:**
- Produces:

```ts
// link-groups.models.ts
export interface LinkGroup {
  id: string;
  color: string;
  syncCrosshair: boolean;
  syncTimeRange: boolean;
  /** (R3) RESERVED — accepted and stored, never read/applied by any RFC-010 code. */
  syncPriceScale?: boolean;
}

export interface LinkGroupsState {
  groups: Record<string, LinkGroup>;
}

export function createInitialLinkGroupsState(): LinkGroupsState {
  return { groups: {} };
}
```

```ts
// link-groups.actions.ts (createActionGroup, source: 'LinkGroups')
'Create Group': props<{ group: LinkGroup }>(),        // no-op if group.id already exists
'Remove Group': props<{ groupId: string }>(),          // no-op if unknown; does NOT touch PanelDescriptor.linkGroupId (Task 1 Step 5 handles unlink)
'Set Sync Crosshair': props<{ groupId: string; enabled: boolean }>(),
'Set Sync Time Range': props<{ groupId: string; enabled: boolean }>(),
```

```ts
// layout.actions.ts — ADD
'Set Panel Link Group': props<{ panelId: string; linkGroupId: string | null }>(),
```

- Consumes: RFC-009 `LayoutState.panels: Record<string, PanelDescriptor>`.

- [ ] **Step 1: Failing reducer spec for `linkGroups`** (`link-groups.reducer.spec.ts`):

```ts
import { describe, it, expect } from 'vitest';
import { LinkGroupsActions } from './link-groups.actions';
import { linkGroupsFeature } from './link-groups.reducer';
import { createInitialLinkGroupsState, LinkGroup } from './link-groups.models';

const reducer = linkGroupsFeature.reducer;

const group = (id: string): LinkGroup => ({
  id,
  color: '#ff6b6b',
  syncCrosshair: true,
  syncTimeRange: true,
});

describe('linkGroupsFeature reducer', () => {
  it('starts empty', () => {
    const state = reducer(undefined, { type: '@@init' });
    expect(state).toEqual(createInitialLinkGroupsState());
  });

  it('createGroup adds a group; is a no-op on duplicate id', () => {
    const state = reducer(createInitialLinkGroupsState(), LinkGroupsActions.createGroup({ group: group('g1') }));
    expect(state.groups['g1']).toEqual(group('g1'));
    const again = reducer(state, LinkGroupsActions.createGroup({ group: { ...group('g1'), color: '#000' } }));
    expect(again).toBe(state); // no-op: id already exists
  });

  it('removeGroup deletes it; no-op on unknown id', () => {
    const state = reducer(createInitialLinkGroupsState(), LinkGroupsActions.createGroup({ group: group('g1') }));
    const removed = reducer(state, LinkGroupsActions.removeGroup({ groupId: 'g1' }));
    expect(removed.groups['g1']).toBeUndefined();
    expect(reducer(removed, LinkGroupsActions.removeGroup({ groupId: 'nope' }))).toBe(removed);
  });

  it('setSyncCrosshair / setSyncTimeRange toggle independently; no-op on unknown group', () => {
    let state = reducer(createInitialLinkGroupsState(), LinkGroupsActions.createGroup({ group: group('g1') }));
    state = reducer(state, LinkGroupsActions.setSyncCrosshair({ groupId: 'g1', enabled: false }));
    expect(state.groups['g1']).toEqual({ ...group('g1'), syncCrosshair: false });
    state = reducer(state, LinkGroupsActions.setSyncTimeRange({ groupId: 'g1', enabled: false }));
    expect(state.groups['g1']).toEqual({ ...group('g1'), syncCrosshair: false, syncTimeRange: false });
    expect(reducer(state, LinkGroupsActions.setSyncCrosshair({ groupId: 'nope', enabled: true }))).toBe(state);
  });

  it('accepts and stores the reserved syncPriceScale field without interpreting it', () => {
    const withReserved: LinkGroup = { ...group('g1'), syncPriceScale: true };
    const state = reducer(createInitialLinkGroupsState(), LinkGroupsActions.createGroup({ group: withReserved }));
    expect(state.groups['g1'].syncPriceScale).toBe(true); // stored verbatim, R3: never read elsewhere
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm test -- --watch=false` fails: module `./link-groups.actions` / `./link-groups.reducer` not found.

- [ ] **Step 3: Implement `link-groups.models.ts` and `link-groups.actions.ts`** per the Interfaces block above.

- [ ] **Step 4: Implement `link-groups.reducer.ts`:**

```ts
import { createFeature, createReducer, on } from '@ngrx/store';
import { LinkGroupsActions } from './link-groups.actions';
import { createInitialLinkGroupsState, LinkGroupsState } from './link-groups.models';

export const linkGroupsFeature = createFeature({
  name: 'linkGroups',
  reducer: createReducer(
    createInitialLinkGroupsState(),
    on(LinkGroupsActions.createGroup, (state, { group }): LinkGroupsState => {
      if (state.groups[group.id]) return state;
      return { groups: { ...state.groups, [group.id]: group } };
    }),
    on(LinkGroupsActions.removeGroup, (state, { groupId }): LinkGroupsState => {
      if (!state.groups[groupId]) return state;
      const groups = Object.fromEntries(Object.entries(state.groups).filter(([id]) => id !== groupId));
      return { groups };
    }),
    on(LinkGroupsActions.setSyncCrosshair, (state, { groupId, enabled }): LinkGroupsState => {
      const g = state.groups[groupId];
      if (!g || g.syncCrosshair === enabled) return state;
      return { groups: { ...state.groups, [groupId]: { ...g, syncCrosshair: enabled } } };
    }),
    on(LinkGroupsActions.setSyncTimeRange, (state, { groupId, enabled }): LinkGroupsState => {
      const g = state.groups[groupId];
      if (!g || g.syncTimeRange === enabled) return state;
      return { groups: { ...state.groups, [groupId]: { ...g, syncTimeRange: enabled } } };
    }),
  ),
});
```

- [ ] **Step 5: Failing spec for `setPanelLinkGroup` (append to `layout.reducer.spec.ts`):**

```ts
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
```

- [ ] **Step 6: Implement.** `layout.actions.ts` — add to the events map:

```ts
    /** Assigns/clears the panel's link group. Reducer transports only; sync semantics are RFC-010's ChartSyncRouter. No-op if panelId is unknown. */
    'Set Panel Link Group': props<{ panelId: string; linkGroupId: string | null }>(),
```

`layout.reducer.ts` — add the handler (after `movePanel`):

```ts
    on(LayoutActions.setPanelLinkGroup, (state, { panelId, linkGroupId }): LayoutState => {
      const panel = state.panels[panelId];
      if (!panel || panel.linkGroupId === linkGroupId) return state;
      return { ...state, panels: { ...state.panels, [panelId]: { ...panel, linkGroupId } } };
    }),
```

- [ ] **Step 7: Register the feature.** In `app.config.ts`: add `import { linkGroupsFeature } from './state/link-groups/link-groups.reducer';` and `[linkGroupsFeature.name]: linkGroupsFeature.reducer,` to the `provideStore({...})` map, alongside `layoutFeature`.

- [ ] **Step 8: Verify** — `npx tsc -p tsconfig.app.json --noEmit`, `npx tsc -p tsconfig.spec.json --noEmit`, `npm test -- --watch=false`, `npm run lint` all clean.

- [ ] **Step 9: Commit** — `git add emulador/src/app/state/link-groups emulador/src/app/state/layout emulador/src/app/app.config.ts` ; `git commit -m "feat(state): add linkGroups feature and panel linkGroupId assignment (RFC-010 Task 1)"`

---

### Task 2: `ChartSyncRouter` — group-scoped fan-out with idempotent apply

**Files:**
- Create: `emulador/src/app/components/workspace/chart-sync-router.ts`
- Create: `emulador/src/app/components/workspace/chart-sync-router.spec.ts`
- Modify: `emulador/src/app/components/workspace/chart-registry.service.ts` (extend `PanelChartHandle`)
- Modify: `emulador/src/app/components/workspace/chart-registry.service.spec.ts` (its `handle()` fixture, currently `{ setUpdatesEnabled: () => void 0 }`, must gain the two new required members or the file fails to type-check against the extended interface)

**Interfaces:**
- Produces:

```ts
// chart-registry.service.ts — PanelChartHandle gains two methods (additive; setUpdatesEnabled unchanged)
// Uses the SAME `LogicalRange` type (from 'lightweight-charts') that Task 3's ChartControlHandle
// uses, so the delegate wiring in Task 3 Step 5 is a direct pass-through with no reshaping.
import { LogicalRange } from 'lightweight-charts';

export interface PanelChartHandle {
  setUpdatesEnabled(enabled: boolean): void;
  /** RFC-010: applies a synced crosshair position (UTCTimestamp, see Task 2 Step 4's note on `Time`). `time === null` clears it. Idempotent per handle. */
  applyCrosshair(time: number | null): void;
  /** RFC-010: applies a synced visible logical range. `range === null` is a no-op (never clears). Idempotent per handle. */
  applyVisibleRange(range: LogicalRange | null): void;
}
```

```ts
// chart-sync-router.ts
import { LinkGroup } from '../../state/link-groups/link-groups.models';
import { PanelDescriptor } from '../../state/layout/layout.models';
import { ChartSyncBus, PanelSyncEvent } from '../../domain/chart/chart-sync-bus';
import { ChartRegistry } from './chart-registry.service';

export interface ChartSyncRouterState {
  panels: Record<string, PanelDescriptor>;
  linkGroups: Record<string, LinkGroup>;
}

/**
 * RFC-010: session-scoped router that gives the RFC-008 ChartSyncBus its first
 * real logic. Subscribes to `bus.events$`; for every event, resolves the
 * ORIGIN panel's `linkGroupId`, and — only if the owning LinkGroup has the
 * relevant `sync*` flag enabled — applies the event to every OTHER panel
 * sharing that `linkGroupId` via the ChartRegistry's PanelChartHandle. Never
 * routes back to the origin panel. Framework-agnostic (plain class + RxJS,
 * `useFactory`-provided by WorkspaceViewport, like ChartSyncBus/ChartRegistry)
 * — it cannot inject the Store, so the viewport feeds it state via `setState`.
 */
export class ChartSyncRouter {
  setState(state: ChartSyncRouterState): void;
  destroy(): void;
}
```

- Consumes: `ChartSyncBus.events$`, `ChartRegistry.get/ids`, `LinkGroup.syncCrosshair/syncTimeRange`, `PanelDescriptor.linkGroupId`.

- [ ] **Step 1: Failing spec** (`chart-sync-router.spec.ts`, plain vitest, no TestBed — mirrors `chart-registry.service.spec.ts`'s style):

```ts
import { describe, it, expect, vi } from 'vitest';
import { ChartSyncBus } from '../../domain/chart/chart-sync-bus';
import { ChartRegistry, PanelChartHandle } from './chart-registry.service';
import { ChartSyncRouter } from './chart-sync-router';
import { PanelDescriptor } from '../../state/layout/layout.models';
import { LinkGroup } from '../../state/link-groups/link-groups.models';

const panel = (id: string, linkGroupId: string | null): PanelDescriptor => ({
  id, symbol: 'SP500', timeframe: 'M1', linkGroupId,
});
const group = (id: string, overrides: Partial<LinkGroup> = {}): LinkGroup => ({
  id, color: '#fff', syncCrosshair: true, syncTimeRange: true, ...overrides,
});
const handle = (): PanelChartHandle & { applyCrosshair: ReturnType<typeof vi.fn>; applyVisibleRange: ReturnType<typeof vi.fn> } => ({
  setUpdatesEnabled: vi.fn(),
  applyCrosshair: vi.fn(),
  applyVisibleRange: vi.fn(),
});

function wire() {
  const bus = new ChartSyncBus();
  const registry = new ChartRegistry();
  const router = new ChartSyncRouter(bus, registry);
  return { bus, registry, router };
}

describe('ChartSyncRouter (RFC-010)', () => {
  it('fans a CrosshairMoved event out to every OTHER panel in the same linkGroup, never to the origin', () => {
    const { bus, registry, router } = wire();
    const hA = handle(), hB = handle(), hC = handle();
    registry.register('A', hA); registry.register('B', hB); registry.register('C', hC);
    router.setState({
      panels: { A: panel('A', 'g1'), B: panel('B', 'g1'), C: panel('C', null) },
      linkGroups: { g1: group('g1') },
    });
    bus.emit('A', 'CrosshairMoved', { point: { x: 0, y: 0 }, time: 1000 } as never); // A is the origin (a user interaction on panel A)
    expect(hA.applyCrosshair).not.toHaveBeenCalled();
    expect(hB.applyCrosshair).toHaveBeenCalledTimes(1);
    expect(hC.applyCrosshair).not.toHaveBeenCalled(); // unlinked: never participates
  });

  it('does not route when the group has the relevant sync flag off', () => {
    const { bus, registry, router } = wire();
    const hA = handle(), hB = handle();
    registry.register('A', hA); registry.register('B', hB);
    router.setState({
      panels: { A: panel('A', 'g1'), B: panel('B', 'g1') },
      linkGroups: { g1: group('g1', { syncCrosshair: false }) },
    });
    bus.emit('A', 'CrosshairMoved', { point: { x: 0, y: 0 }, time: 1000 } as never);
    expect(hB.applyCrosshair).not.toHaveBeenCalled();
  });

  it('routes VisibleRangeChanged only when syncTimeRange is on, independent of syncCrosshair', () => {
    const { bus, registry, router } = wire();
    const hA = handle(), hB = handle();
    registry.register('A', hA); registry.register('B', hB);
    router.setState({
      panels: { A: panel('A', 'g1'), B: panel('B', 'g1') },
      linkGroups: { g1: group('g1', { syncCrosshair: false, syncTimeRange: true }) },
    });
    bus.emit('A', 'VisibleRangeChanged', { from: 10, to: 20 } as never);
    expect(hB.applyVisibleRange).toHaveBeenCalledWith({ from: 10, to: 20 });
    expect(hB.applyCrosshair).not.toHaveBeenCalled();
  });

  it('a panel with linkGroupId null never triggers routing as an origin', () => {
    const { bus, registry, router } = wire();
    const hB = handle();
    registry.register('A', handle()); registry.register('B', hB);
    router.setState({
      panels: { A: panel('A', null), B: panel('B', null) },
      linkGroups: {},
    });
    bus.emit('A', 'CrosshairMoved', { point: { x: 0, y: 0 }, time: 1000 } as never);
    expect(hB.applyCrosshair).not.toHaveBeenCalled();
  });

  it('3+ panel group: one origin event applies to exactly N-1 siblings, no cascade', () => {
    const { bus, registry, router } = wire();
    const hA = handle(), hB = handle(), hC = handle(), hD = handle();
    registry.register('A', hA); registry.register('B', hB); registry.register('C', hC); registry.register('D', hD);
    router.setState({
      panels: { A: panel('A', 'g1'), B: panel('B', 'g1'), C: panel('C', 'g1'), D: panel('D', null) },
      linkGroups: { g1: group('g1') },
    });
    bus.emit('A', 'CrosshairMoved', { point: { x: 0, y: 0 }, time: 1000 } as never);
    expect(hB.applyCrosshair).toHaveBeenCalledTimes(1);
    expect(hC.applyCrosshair).toHaveBeenCalledTimes(1);
    expect(hA.applyCrosshair).not.toHaveBeenCalled();
    expect(hD.applyCrosshair).not.toHaveBeenCalled();
  });

  it('idempotent apply: an identical incoming value applied twice calls the handle only once', () => {
    const { bus, registry, router } = wire();
    const hB = handle();
    registry.register('A', handle()); registry.register('B', hB);
    router.setState({ panels: { A: panel('A', 'g1'), B: panel('B', 'g1') }, linkGroups: { g1: group('g1') } });
    bus.emit('A', 'VisibleRangeChanged', { from: 10, to: 20 } as never);
    bus.emit('A', 'VisibleRangeChanged', { from: 10, to: 20 } as never); // structurally identical, new reference
    expect(hB.applyVisibleRange).toHaveBeenCalledTimes(1);
  });

  it('destroy() unsubscribes from the bus', () => {
    const { bus, registry, router } = wire();
    const hB = handle();
    registry.register('A', handle()); registry.register('B', hB);
    router.setState({ panels: { A: panel('A', 'g1'), B: panel('B', 'g1') }, linkGroups: { g1: group('g1') } });
    router.destroy();
    bus.emit('A', 'CrosshairMoved', { point: { x: 0, y: 0 }, time: 1000 } as never);
    expect(hB.applyCrosshair).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure** — `chart-sync-router.ts` does not exist; `PanelChartHandle` lacks `applyCrosshair`/`applyVisibleRange`.

- [ ] **Step 3: Extend `PanelChartHandle`** in `chart-registry.service.ts` per the Interfaces block (interface only — `ChartRegistry`'s class body is untouched, since it is generic over whatever shape `PanelChartHandle` has). Then fix the now-broken fixture in `chart-registry.service.spec.ts`:

```ts
const handle = (): PanelChartHandle => ({
  setUpdatesEnabled: () => void 0,
  applyCrosshair: () => void 0,
  applyVisibleRange: () => void 0,
});
```

(Its three existing tests are otherwise unchanged — they only exercise `register`/`get`/`ids`/`count`/`deregister`, none of which read the handle's methods.)

- [ ] **Step 4: Implement `ChartSyncRouter`:**

```ts
import { Subscription } from 'rxjs';
import { PanelSyncEvent, PanelSyncEventMap, PanelSyncEventType, ChartSyncBus } from '../../domain/chart/chart-sync-bus';
import { PanelDescriptor } from '../../state/layout/layout.models';
import { LinkGroup } from '../../state/link-groups/link-groups.models';
import { ChartRegistry } from './chart-registry.service';

export interface ChartSyncRouterState {
  panels: Record<string, PanelDescriptor>;
  linkGroups: Record<string, LinkGroup>;
}

/** Which LinkGroup flag gates each event type. */
const GATE: { [K in PanelSyncEventType]: keyof LinkGroup } = {
  CrosshairMoved: 'syncCrosshair',
  VisibleRangeChanged: 'syncTimeRange',
};

/**
 * RFC-010: session-scoped fan-out router. Plain class (no Angular/NgRx import,
 * mirrors ChartSyncBus/ChartRegistry) provided per-Session via `useFactory` by
 * WorkspaceViewport. Cannot inject the Store: the viewport pushes state
 * snapshots via `setState` whenever `panels`/`linkGroups` change.
 *
 * Feedback-loop prevention (RFC-010 point 6): (1) events are only ever routed
 * to panels OTHER than the origin (`panelId !== originId` filter below); (2)
 * idempotent apply — the last value applied to each (panelId, eventType) pair
 * is tracked, and a structurally-identical incoming value is a no-op, so even
 * a 3+-panel topology where a receiving panel's handle might otherwise
 * re-trigger a downstream apply cannot cascade.
 */
export class ChartSyncRouter {
  private state: ChartSyncRouterState = { panels: {}, linkGroups: {} };
  private readonly lastApplied = new Map<string, unknown>();
  private readonly sub: Subscription;

  constructor(
    private readonly bus: ChartSyncBus,
    private readonly registry: ChartRegistry,
  ) {
    this.sub = this.bus.events$.subscribe((event) => this.route(event));
  }

  setState(state: ChartSyncRouterState): void {
    this.state = state;
  }

  private route(event: PanelSyncEvent): void {
    const origin = this.state.panels[event.panelId];
    if (!origin?.linkGroupId) return; // unlinked panels never originate routing
    const group = this.state.linkGroups[origin.linkGroupId];
    if (!group?.[GATE[event.type]]) return; // group missing or flag off

    for (const siblingId of this.registry.ids()) {
      if (siblingId === event.panelId) continue; // never back to the origin
      const sibling = this.state.panels[siblingId];
      if (sibling?.linkGroupId !== origin.linkGroupId) continue; // same group only
      this.applyIfChanged(siblingId, event.type, event.payload);
    }
  }

  private applyIfChanged<K extends PanelSyncEventType>(
    panelId: string,
    type: K,
    payload: PanelSyncEventMap[K],
  ): void {
    const key = `${panelId}:${type}`;
    const last = this.lastApplied.get(key);
    if (last !== undefined && JSON.stringify(last) === JSON.stringify(payload)) return; // idempotent short-circuit
    this.lastApplied.set(key, payload);
    const handle = this.registry.get(panelId);
    if (!handle) return;
    if (type === 'CrosshairMoved') {
      const p = payload as PanelSyncEventMap['CrosshairMoved'];
      // `lightweight-charts`' `Time` is `UTCTimestamp | BusinessDay | string`; this codebase's
      // chart is UTCTimestamp-only (`timeVisible: true`, no business-day mode anywhere in
      // chart.component.ts/chart-engine.ts), so a plain `Number(...)` cast is safe HERE and
      // matches the same assumption `chart.component.ts` already makes throughout. If a future
      // RFC introduces business-day mode, this cast must be revisited together with the rest of
      // the chart's Time handling — it is not a new assumption introduced by this router.
      handle.applyCrosshair(p.time != null ? Number(p.time) : null);
    } else {
      handle.applyVisibleRange(payload as PanelSyncEventMap['VisibleRangeChanged']);
    }
  }

  destroy(): void {
    this.sub.unsubscribe();
  }
}
```

Note: `JSON.stringify` equality is a pragmatic idempotence check over small plain-data payloads (`{from, to}` / a timestamp) — consistent with the RFC's "aplicacion idempotente" requirement without introducing a deep-equal dependency (Global Constraints: no new dependencies).

- [ ] **Step 5: Verify** — all four gates green.

- [ ] **Step 6: Commit** — `git add emulador/src/app/components/workspace/chart-sync-router.ts emulador/src/app/components/workspace/chart-sync-router.spec.ts emulador/src/app/components/workspace/chart-registry.service.ts emulador/src/app/components/workspace/chart-registry.service.spec.ts` ; `git commit -m "feat(workspace): add ChartSyncRouter with group-scoped fan-out and idempotent apply (RFC-010 Task 2)"`

---

### Task 3: Wire `ChartPanelComponent` — control handle + guarded apply on `ChartEngine`

**Files:**
- Modify: `emulador/src/app/domain/chart/chart-engine.ts` (SANCTIONED: add `applyCrosshair`/`applyVisibleRange` methods with a re-entrancy guard around the two existing `subscribeCrosshairMove`/`subscribeVisibleLogicalRangeChange` callbacks)
- Create: `emulador/src/app/domain/chart/chart-engine.spec.ts` (this class currently has NO spec anywhere in the repo — `ChartComponent`/`ChartEngine` are always stubbed out in `chart-panel.component.spec.ts`/`workspace-viewport.component.spec.ts` because `lightweight-charts`' `createChart()` needs real canvas rendering that this repo's jsdom setup does not polyfill; this task adds the first FOCUSED spec, exercising only the guard logic against a **stubbed** `IChartApi`/`ISeriesApi`, not a real chart)
- Modify: `emulador/src/app/components/chart/chart.component.ts` (SANCTIONED: add `chartControlReady` output + `ChartControlHandle` interface; the two apply methods delegate straight to `this.engine`)
- Modify: `emulador/src/app/components/workspace/chart-panel.component.ts` (consume `chartControlReady`; extend the `ChartRegistry.register` call with the two new delegate methods)
- Test: append to `emulador/src/app/components/workspace/chart-panel.component.spec.ts` (the only place `ChartComponent`'s outputs are exercised — via `ChartStubComponent`, per this repo's existing convention)

**Design decision (documented because it deviates from "test against the real dependency"):** `ChartEngine` wraps `lightweight-charts`' real `createChart()`, which needs actual canvas rendering; this repo has never unit-tested `ChartEngine`/`ChartComponent` directly (zero existing spec files for either) and has no canvas polyfill installed (`package.json` — no `canvas`/`jest-canvas-mock`). Rather than add a new, unprecedented canvas-dependent test harness for this one behavior, the re-entrancy risk named in the RFC is closed PROACTIVELY: `ChartEngine.applyCrosshair`/`applyVisibleRange` set a private re-entrancy flag BEFORE calling into `lightweight-charts` and check it inside the two existing `subscribeCrosshairMove`/`subscribeVisibleLogicalRangeChange` callbacks, unconditionally — regardless of whether the underlying library actually re-fires on programmatic calls (undocumented/version-dependent behavior we cannot cheaply verify here). This is defensive, not speculative: the guard is a single boolean, has zero behavioral cost on the real (user-driven) interaction path, and is unit-testable in isolation with a stubbed `IChartApi`/`ISeriesApi` (Step 1) without touching canvas rendering at all.

**Interfaces:**
- Produces (in `chart-engine.ts`):

```ts
export interface ChartApplyHandle {
  /** Sets the crosshair to a given time; `null` clears it. Re-entrancy-guarded (see class doc). */
  applyCrosshair(time: UTCTimestamp | null): void;
  /** Sets the visible logical range; `null` is a no-op (never clears). Re-entrancy-guarded. */
  applyVisibleRange(range: LogicalRange | null): void;
}
```

`ChartEngine implements ChartApplyHandle` (in addition to its existing public surface — `chartApi`/`seriesApi`/`events`/`registerCapability`/etc. are all unchanged).

- Produces (in `chart.component.ts`), re-exposing the engine's handle to the wrapping panel:

```ts
export interface ChartControlHandle {
  applyCrosshair(time: UTCTimestamp | null): void;
  applyVisibleRange(range: LogicalRange | null): void;
}
```

`readonly chartControlReady = output<ChartControlHandle>();` emitted once, from `ngAfterViewInit`, right after `this.chartReady.emit(this.engine.events);`.

- [ ] **Step 1: Failing spec for the engine-level guard** (`chart-engine.spec.ts`, new file — stubs `lightweight-charts`' `createChart` so no real canvas is touched):

```ts
import { describe, it, expect, vi } from 'vitest';
import { ChartEngine } from './chart-engine';

// `chart-engine.ts` imports `createChart` as a NAMED import from 'lightweight-charts'; the
// reliable way to stub a named export under Vitest's ESM handling is `vi.mock` with a factory
// (a bare `vi.spyOn` on a `* as lwc` namespace import is not guaranteed to intercept a named
// import bound at module-load time in every bundler/transform combination this repo's Vite
// config might use — `vi.mock` sidesteps that entirely).
let crosshairCb: ((p: unknown) => void) | undefined;
let rangeCb: ((r: unknown) => void) | undefined;
/**
 * When true, `setCrosshairPosition`/`setVisibleLogicalRange` synchronously invoke their
 * matching subscribed callback BEFORE returning — simulating the (undocumented,
 * version-dependent) possibility that `lightweight-charts` itself re-fires
 * `subscribeCrosshairMove`/`subscribeVisibleLogicalRangeChange` as a side effect of a
 * PROGRAMMATIC call, which is exactly the risk `ChartEngine.applyingSync` guards against.
 * Off by default so the "delegates to..." tests stay simple; the two "regression" tests below
 * turn it on to exercise the guard under that worst-case assumption.
 */
let librarySelfFiresOnProgrammaticCalls = false;
const timeScaleStub = {
  subscribeVisibleLogicalRangeChange: (cb: (r: unknown) => void) => { rangeCb = cb; },
  setVisibleLogicalRange: vi.fn((r: unknown) => {
    if (librarySelfFiresOnProgrammaticCalls) rangeCb?.(r);
  }),
};
const seriesStub = { applyOptions: vi.fn(), setData: vi.fn(), priceScale: () => ({ applyOptions: vi.fn() }) };
const chartStub = {
  subscribeClick: vi.fn(),
  subscribeDblClick: vi.fn(),
  subscribeCrosshairMove: (cb: (p: unknown) => void) => { crosshairCb = cb; },
  timeScale: () => timeScaleStub,
  addSeries: () => seriesStub,
  applyOptions: vi.fn(),
  setCrosshairPosition: vi.fn((price: number, time: unknown) => {
    if (librarySelfFiresOnProgrammaticCalls) crosshairCb?.({ time });
  }),
  clearCrosshairPosition: vi.fn(),
  remove: vi.fn(),
};

vi.mock('lightweight-charts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lightweight-charts')>();
  return { ...actual, createChart: vi.fn(() => chartStub) };
});

/** Resets captured callbacks and mock call history before each test; `selfFires` controls the worst-case simulation above. */
function stubChart(selfFires = false) {
  crosshairCb = undefined;
  rangeCb = undefined;
  librarySelfFiresOnProgrammaticCalls = selfFires;
  vi.clearAllMocks();
  return {
    chart: chartStub,
    fireCrosshair: () => crosshairCb?.({}),
    fireRange: () => rangeCb?.(null),
  };
}

describe('ChartEngine.applyCrosshair/applyVisibleRange (RFC-010 Task 3)', () => {
  it('applyCrosshair delegates to chartApi.setCrosshairPosition / clearCrosshairPosition', () => {
    const { chart } = stubChart();
    const engine = new ChartEngine(document.createElement('div'));
    engine.applyCrosshair(1000 as never);
    expect(chart.setCrosshairPosition).toHaveBeenCalled();
    engine.applyCrosshair(null);
    expect(chart.clearCrosshairPosition).toHaveBeenCalled();
  });

  it('applyVisibleRange delegates to timeScale().setVisibleLogicalRange; null is a no-op', () => {
    const { chart } = stubChart();
    const engine = new ChartEngine(document.createElement('div'));
    engine.applyVisibleRange({ from: 0, to: 10 } as never);
    expect(chart.timeScale().setVisibleLogicalRange).toHaveBeenCalledWith({ from: 0, to: 10 });
    engine.applyVisibleRange(null);
    expect(chart.timeScale().setVisibleLogicalRange).toHaveBeenCalledTimes(1); // still 1: null guarded
  });

  it('regression: even if lightweight-charts self-fires subscribeCrosshairMove DURING a programmatic setCrosshairPosition (worst case), the engine suppresses that emission (feedback-loop guard)', () => {
    stubChart(true); // simulate the library re-firing synchronously inside the programmatic call
    const engine = new ChartEngine(document.createElement('div'));
    const seen: unknown[] = [];
    engine.events.on('CrosshairMoved', (p) => seen.push(p));
    engine.applyCrosshair(1000 as never); // triggers the stub's synchronous self-fire internally
    expect(seen).toEqual([]); // guarded: suppressed because it happened synchronously during our own applyCrosshair
  });

  it('regression: even if lightweight-charts self-fires subscribeVisibleLogicalRangeChange DURING a programmatic setVisibleLogicalRange (worst case), the engine suppresses that emission', () => {
    stubChart(true);
    const engine = new ChartEngine(document.createElement('div'));
    const seen: unknown[] = [];
    engine.events.on('VisibleRangeChanged', (r) => seen.push(r));
    engine.applyVisibleRange({ from: 0, to: 10 } as never); // triggers the stub's synchronous self-fire internally
    expect(seen).toEqual([]);
  });

  it('a genuine user-driven crosshair move (NOT inside an apply call) still emits normally', () => {
    const { fireCrosshair } = stubChart();
    const engine = new ChartEngine(document.createElement('div'));
    const seen: unknown[] = [];
    engine.events.on('CrosshairMoved', (p) => seen.push(p));
    fireCrosshair(); // no apply in progress: this is what a real user drag looks like
    expect(seen).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `ChartEngine.applyCrosshair`/`applyVisibleRange` don't exist yet.

- [ ] **Step 3: Implement the guard in `chart-engine.ts`.** Add a private flag and gate both existing subscriptions on it, then add the two public methods:

```ts
  /** RFC-010: true only for the synchronous duration of an applyCrosshair/applyVisibleRange call — suppresses re-emission if the underlying library fires its own subscribeX callback as a side effect of a PROGRAMMATIC change, closing the A->B->A feedback-loop risk at its root (chart-engine.ts is the only place that talks to lightweight-charts directly). */
  private applyingSync = false;

  public applyCrosshair(time: UTCTimestamp | null): void {
    this.applyingSync = true;
    try {
      if (time === null) this.chart.clearCrosshairPosition();
      else this.chart.setCrosshairPosition(0, time, this.mainSeries);
    } finally {
      this.applyingSync = false;
    }
  }

  public applyVisibleRange(range: LogicalRange | null): void {
    if (!range) return; // mirrors the engine's own maybeLoadMore-adjacent null guards
    this.applyingSync = true;
    try {
      this.chart.timeScale().setVisibleLogicalRange(range);
    } finally {
      this.applyingSync = false;
    }
  }
```

Change the constructor's two relevant subscriptions from:

```ts
    this.chart.subscribeCrosshairMove((p) => this.bus.emit('CrosshairMoved', p));
    this.chart
      .timeScale()
      .subscribeVisibleLogicalRangeChange((r) => this.bus.emit('VisibleRangeChanged', r));
```

to:

```ts
    this.chart.subscribeCrosshairMove((p) => {
      if (!this.applyingSync) this.bus.emit('CrosshairMoved', p);
    });
    this.chart.timeScale().subscribeVisibleLogicalRangeChange((r) => {
      if (!this.applyingSync) this.bus.emit('VisibleRangeChanged', r);
    });
```

Add `UTCTimestamp` to the existing `lightweight-charts` import at the top of the file (`LogicalRange` is already imported there). No other line changes — `render`/`registerCapability`/`destroy`/etc. are untouched.

- [ ] **Step 4: Verify Task 3's engine-level gate and commit checkpoint** — `npx tsc -p tsconfig.app.json --noEmit`, `npx tsc -p tsconfig.spec.json --noEmit`, `npm test -- --watch=false -- chart-engine`, `npm run lint` on the changed file, all green before moving to Step 5.

- [ ] **Step 5: Expose the handle through `ChartComponent`.** Add near the `chartReady` output (after its doc comment/declaration, line ~348):

```ts
  /**
   * RFC-010: a second, additive output — a handle the wrapping ChartPanelComponent
   * uses to APPLY synced crosshair/range changes (as opposed to chartReady's
   * ChartEventBus, which only reports the chart's OWN interaction events out).
   * Pure pass-through to the engine's own re-entrancy-guarded ChartApplyHandle
   * (chart-engine.ts) — no additional logic lives here.
   */
  readonly chartControlReady = output<ChartControlHandle>();
```

Add the top-level interface (exported, just above the `@Component` decorator):

```ts
export interface ChartControlHandle {
  applyCrosshair(time: UTCTimestamp | null): void;
  applyVisibleRange(range: LogicalRange | null): void;
}
```

In `ngAfterViewInit`, immediately after `this.chartReady.emit(this.engine.events);` add:

```ts
    this.chartControlReady.emit({
      applyCrosshair: (t) => this.engine!.applyCrosshair(t),
      applyVisibleRange: (r) => this.engine!.applyVisibleRange(r),
    });
```

(`UTCTimestamp` and `LogicalRange` are already imported in this file's top-level `lightweight-charts` import — no new import needed.)

- [ ] **Step 6: Wire `ChartPanelComponent`.** In `chart-panel.component.ts`:

1. Add `ChartControlHandle` to the existing `import { ChartComponent } from '../chart/chart.component';` line (`import { ChartComponent, ChartControlHandle } from '../chart/chart.component';`) — no new import statement needed, since `chart.component.ts` is already imported here. Add a new import line `import { UTCTimestamp } from 'lightweight-charts';` (not previously imported in this file).
2. Track the control handle: `private controlHandle: ChartControlHandle | null = null;` and add `onChartControlReady(handle: ChartControlHandle): void { this.controlHandle = handle; }`, bound in the template: `<app-chart class="panel-chart" (chartReady)="onChartReady($event)" (chartControlReady)="onChartControlReady($event)" />`.
3. Change the `ngOnInit` registration to include the two new delegate methods:

```ts
  ngOnInit(): void {
    this.registry.register(this.descriptor().id, {
      setUpdatesEnabled: (on) => this.mapper.setUpdatesEnabled(on),
      applyCrosshair: (time) => this.controlHandle?.applyCrosshair(time as UTCTimestamp | null),
      applyVisibleRange: (range) => this.controlHandle?.applyVisibleRange(range),
    });
  }
```

Both delegate lambdas read `this.controlHandle` lazily at CALL time (not captured at registration time), so registration order relative to `chartControlReady`'s emission does not matter: even if `register()` runs before `onChartControlReady` has fired, any call arriving before that point is simply a no-op (`?.`) rather than a crash, and every call after `onChartControlReady` fires reaches the real handle. Step 7's test asserts this end-to-end.

- [ ] **Step 7: Panel-level integration test (append to `chart-panel.component.spec.ts`):**

```ts
  it('registers applyCrosshair/applyVisibleRange delegates that forward to the chartControlReady handle', () => {
    const fixture = create();
    const registry = TestBed.inject(ChartRegistry);
    const stub = fixture.debugElement.query(By.directive(ChartStubComponent));
    const controlHandle = { applyCrosshair: vi.fn(), applyVisibleRange: vi.fn() };
    stub.componentInstance.chartControlReady.emit(controlHandle);

    const panelHandle = registry.get('panel-1')!;
    panelHandle.applyCrosshair(1000);
    panelHandle.applyVisibleRange({ from: 0, to: 10 });

    expect(controlHandle.applyCrosshair).toHaveBeenCalledWith(1000);
    expect(controlHandle.applyVisibleRange).toHaveBeenCalledWith({ from: 0, to: 10 });
  });

  it('a delegate call BEFORE chartControlReady has fired is a silent no-op, not a throw', () => {
    const fixture = create();
    const registry = TestBed.inject(ChartRegistry);
    const panelHandle = registry.get('panel-1')!;
    expect(() => panelHandle.applyCrosshair(1000)).not.toThrow();
  });
```

Add `readonly chartControlReady = output<ChartControlHandle>();` to this spec's `ChartStubComponent` stub, matching the real component's new output.

- [ ] **Step 8: Verify all four gates and commit** — `git commit -m "feat(chart): add re-entrancy-guarded ChartApplyHandle on ChartEngine, expose via ChartControlHandle, wire panel registry delegates (RFC-010 Task 3)"`

---

### Task 4: Replay clock fan-out verification + freeze-on-last suite

**Files:**
- Test: append to `emulador/src/app/components/chart/chart-model-mapper.service.spec.ts`
- Test: create `emulador/src/app/state/trading/fill-engine.freeze-on-last.spec.ts` (focused, small — kept separate from the large existing `fill-engine.spec.ts` per this repo's convention of one concern per spec file where the existing file is already large)

**Interfaces:**
- Consumes ONLY: `ChartModelMapper.panelChartView$` (existing, unchanged), `lastIndexAtOrBefore` (existing, unchanged), `selectCurrentTime`/`selectSeries` (existing, unchanged). This task adds NO new production code — RFC-010's Estado Esperado requires proof, not new plumbing, per the RFC's own framing ("fan-out por proyeccion, no replicacion").

- [ ] **Step 1: Two-panel same-clock, different-projection spec (append to `chart-model-mapper.service.spec.ts`, INSIDE the existing `describe('panelChartView$ (RFC-008 D8: per-panel parametrized derivation)', ...)` block, reusing its `beforeEach`/`m1`/`m5`/`panel` fixtures already in scope — do NOT duplicate them):**

```ts
    it('RFC-010 D5: two panels of the SAME symbol but DIFFERENT timeframes project the SAME global currentTime to DIFFERENT candle indices (fan-out by projection, not shared-index replication)', () => {
      // reuses this describe block's own beforeEach: selectSeries={M1: m1, M5: m5}, selectCurrentTime=200
      const mapperA = TestBed.runInInjectionContext(() => new ChartModelMapper()); // own instance = own D8 memo slot
      const mapperB = TestBed.runInInjectionContext(() => new ChartModelMapper());
      mapperA.configurePanel(panel('a', 'M1'));
      mapperB.configurePanel(panel('b', 'M5'));

      let idxA = -99, idxB = -99;
      mapperA.panelChartView$.subscribe((v) => (idxA = v.idx));
      mapperB.panelChartView$.subscribe((v) => (idxB = v.idx));

      expect(idxA).toBe(1); // M1 candle at t=160 is at-or-before the shared cursor t=200
      expect(idxB).toBe(0); // M5 candle at t=100 is at-or-before t=200; M5's t=400 candle is still ahead
      // Same cursor T, different indices per panel: proof of per-panel projection, matching the
      // existing 'the global replay cursor recomputes every panel' test just above, extended to
      // show DIVERGENT (not merely simultaneous) projections across timeframes.
    });
```

- [ ] **Step 2: Freeze-on-last spec** (new file `fill-engine.freeze-on-last.spec.ts`, small and focused):

```ts
import { describe, it, expect } from 'vitest';
import { lastIndexAtOrBefore } from './fill-engine';
import { Candle } from '../../models';

const candles = (times: number[]): Candle[] =>
  times.map((time) => ({ time, open: 1, high: 1, low: 1, close: 1 }));

describe('lastIndexAtOrBefore — freeze-on-last (RFC-010 D5)', () => {
  it('a cursor T past the last candle freezes on the LAST index (not -1, not out of range)', () => {
    const c = candles([100, 200, 300]); // this symbol/panel has a data gap after t=300
    expect(lastIndexAtOrBefore(c, 300)).toBe(2);
    expect(lastIndexAtOrBefore(c, 500)).toBe(2); // T beyond coverage: freeze on the last known candle
    expect(lastIndexAtOrBefore(c, 10_000)).toBe(2); // arbitrarily far beyond: still frozen, never -1
  });

  it('a cursor T before the first candle has no valid index yet (-1), distinct from freeze-on-last', () => {
    const c = candles([100, 200, 300]);
    expect(lastIndexAtOrBefore(c, 50)).toBe(-1);
  });

  it('re-entering coverage after a gap un-freezes automatically: the projection tracks T again', () => {
    // Simulates a secondary symbol with a mid-series gap: candles resume after a session gap.
    const c = candles([100, 200, /* gap */ 500, 600]);
    expect(lastIndexAtOrBefore(c, 300)).toBe(1); // frozen at the pre-gap candle while T is inside the gap
    expect(lastIndexAtOrBefore(c, 500)).toBe(2); // T reaches the post-gap candle: un-frozen, tracks again
    expect(lastIndexAtOrBefore(c, 550)).toBe(2);
    expect(lastIndexAtOrBefore(c, 600)).toBe(3);
  });
});
```

- [ ] **Step 3: `panelChartView$` freeze-on-last integration (append INSIDE the same `describe('panelChartView$ (RFC-008 D8: per-panel parametrized derivation)', ...)` block as Step 1, using the OUTER `mapper`/`store` from the file's top-level `beforeEach` — same as every other test already inside that block):**

```ts
    it('RFC-010 D5: a panel whose symbol has a data gap freezes idx on the last available candle when the global cursor is beyond its coverage, and un-freezes on returning to coverage', () => {
      const gappy = [{ time: 100, open: 1, high: 1, low: 1, close: 1 }, { time: 200, open: 1, high: 1, low: 1, close: 2 }];
      store.overrideSelector(selectSeries, { M1: gappy });
      store.overrideSelector(selectCurrentTime, 100);
      store.refreshState();
      mapper.configurePanel({ id: 'gap-panel', symbol: 'Y', timeframe: 'M1', linkGroupId: null });
      const views: PanelChartView[] = [];
      mapper.panelChartView$.subscribe((v) => views.push(v));

      store.overrideSelector(selectCurrentTime, 9999); // cursor far beyond this panel's own last candle
      store.refreshState();
      expect(views.at(-1)!.idx).toBe(1); // frozen on the last candle (index 1), not -1

      store.overrideSelector(selectCurrentTime, 150); // cursor moves back within coverage (replay resolution change, etc.)
      store.refreshState();
      expect(views.at(-1)!.idx).toBe(0); // un-frozen: tracks the cursor again
    });
```

- [ ] **Step 4: Verify all four gates (no production code changed — this task is pure regression/verification) and commit** — `git commit -m "test(chart,trading): verify replay-clock per-panel fan-out and freeze-on-last projection (RFC-010 Task 4)"`

---

### Task 5: End-to-end sync integration suite (3+ panel feedback-loop regression)

**Files:**
- Modify: `emulador/src/app/components/workspace/workspace-viewport.component.ts` (provide `ChartSyncRouter`; feed it state)
- Test: append to `emulador/src/app/components/workspace/workspace-viewport.component.spec.ts`

**Interfaces:**
- Produces: `WorkspaceViewportComponent` provides `ChartSyncRouter` via `useFactory` (constructed from the already-provided `ChartSyncBus`/`ChartRegistry`) and keeps it fed via an `effect()` that calls `router.setState({ panels: this.panels(), linkGroups: this.linkGroups() })` whenever either signal changes.
- Consumes: `linkGroupsFeature.selectGroups` (new selector, `layoutFeature`-sibling — add `export const selectGroups = linkGroupsFeature.selectGroups;` re-export or select directly via `linkGroupsFeature.selectGroups` from Task 1's `createFeature`, which auto-generates it).

- [ ] **Step 1: Failing spec — full 3-panel loop regression.** Append a NEW top-level `describe` block to `workspace-viewport.component.spec.ts` (a sibling of the existing `describe('WorkspaceViewportComponent lifecycle: create/hide/show/close ...')` block, copying its exact `beforeEach` structure — REAL `ChartPanelComponent` + stubbed innermost `app-chart`, per that block's own comment — extended with a `linkGroups` slice in `initialState`):

```ts
describe('ChartSyncRouter wiring end-to-end (RFC-010 Task 5)', () => {
  let store: MockStore;

  /** p1, p2, p3 all in linkGroup 'g1' with syncCrosshair+syncTimeRange on. */
  const linkedState: LayoutState = structuredClone(layoutState);
  linkedState.panels['p1'].linkGroupId = 'g1';
  linkedState.panels['p2'].linkGroupId = 'g1';
  linkedState.panels['p3'].linkGroupId = 'g1';
  const linkGroupsState = {
    groups: { g1: { id: 'g1', color: '#f00', syncCrosshair: true, syncTimeRange: true } },
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [WorkspaceViewportComponent],
      providers: [
        provideMockStore({ initialState: { layout: linkedState, linkGroups: linkGroupsState } }),
      ],
    });
    // Same discipline as the lifecycle describe block above: REAL ChartPanelComponent so its
    // ngOnInit/ngOnDestroy register/deregister with ChartRegistry and its onChartReady wiring
    // forwards to ChartSyncBus; only the innermost app-chart (audited ChartComponent) is stubbed.
    TestBed.overrideComponent(ChartPanelComponent, {
      remove: { imports: [ChartComponent] },
      add: { imports: [ChartStubComponent] },
    });
    store = TestBed.inject(MockStore);
    store.overrideSelector(selectSeries, {
      M1: [{ time: 100, open: 1, high: 1, low: 1, close: 42 }],
      M5: [{ time: 100, open: 1, high: 1, low: 1, close: 42 }],
      M15: [{ time: 100, open: 1, high: 1, low: 1, close: 42 }],
    });
    store.overrideSelector(selectCurrentTime, 100);
    store.overrideSelector(selectUtcOffset, 0);
  });

  function create() {
    const fixture = TestBed.createComponent(WorkspaceViewportComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('one user interaction on p1 produces exactly one applyCrosshair call on EACH of p2 and p3, zero on p1 itself, and no cascade on re-emission of the same value', () => {
    const fixture = create();
    const registry = fixture.debugElement.injector.get(ChartRegistry);
    const syncBus = fixture.debugElement.injector.get(ChartSyncBus);
    const spyP1 = vi.spyOn(registry.get('p1')!, 'applyCrosshair');
    const spyP2 = vi.spyOn(registry.get('p2')!, 'applyCrosshair');
    const spyP3 = vi.spyOn(registry.get('p3')!, 'applyCrosshair');

    // Simulates the ONE user-driven interaction: p1's ChartPanelComponent forwarding its
    // OWN engine's CrosshairMoved to the shared bus (RFC-008 wiring, unchanged).
    syncBus.emit('p1', 'CrosshairMoved', { point: { x: 1, y: 1 }, time: 1000 } as never);

    expect(spyP1).not.toHaveBeenCalled(); // never back to the origin
    expect(spyP2).toHaveBeenCalledTimes(1);
    expect(spyP3).toHaveBeenCalledTimes(1);

    // Re-emitting the SAME payload (as an idempotent handle's own no-op re-apply would, if it
    // ever incorrectly looped) must not cascade further:
    syncBus.emit('p1', 'CrosshairMoved', { point: { x: 1, y: 1 }, time: 1000 } as never);
    expect(spyP2).toHaveBeenCalledTimes(1); // still 1: idempotent short-circuit, no re-render/re-apply
    expect(spyP3).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `ChartSyncRouter` is not provided/wired in `WorkspaceViewportComponent`; the spy calls never happen.

- [ ] **Step 3: Implement.** In `workspace-viewport.component.ts`:

```ts
  providers: [
    { provide: ChartSyncBus, useFactory: () => new ChartSyncBus() },
    { provide: ChartRegistry, useFactory: () => new ChartRegistry() },
    {
      provide: ChartSyncRouter,
      useFactory: (bus: ChartSyncBus, registry: ChartRegistry) => new ChartSyncRouter(bus, registry),
      deps: [ChartSyncBus, ChartRegistry],
    },
  ],
```

Add the signals and the feeding effect to the component body:

```ts
  private readonly syncRouter = inject(ChartSyncRouter);
  readonly linkGroups = this.store.selectSignal(linkGroupsFeature.selectGroups);

  constructor() {
    effect(() => this.syncRouter.setState({ panels: this.panels(), linkGroups: this.linkGroups() }));
  }
```

Import `ChartSyncRouter` from `./chart-sync-router`, `linkGroupsFeature` from `../../state/link-groups/link-groups.reducer`, and `effect` from `@angular/core`. Add `this.syncRouter.destroy();` to `ngOnDestroy` alongside the existing `this.syncBus.destroy();`.

- [ ] **Step 4: Verify all four gates and commit** — `git commit -m "feat(workspace): wire ChartSyncRouter into WorkspaceViewport with 3-panel feedback-loop regression coverage (RFC-010 Task 5)"`

---

## Final verification (RFC-010 Estado Esperado)

- `npx tsc -p tsconfig.app.json --noEmit` → zero errors.
- A `LinkGroup` with `syncCrosshair`/`syncTimeRange` active correctly propagates crosshair and visible range between its member panels — verified by the `link-groups.reducer.spec.ts` + `chart-sync-router.spec.ts` integration (Tasks 1-2) and the end-to-end `WorkspaceViewportComponent` wiring test (Task 5).
- The global replay clock (`selectCurrentTime` → `lastIndexAtOrBefore`, unchanged since RFC-008) advances every panel via its OWN per-symbol/timeframe projection (Task 4), with gapped-data panels correctly frozen on their last known candle and auto-un-freezing on re-entering coverage.
- A regression test over a 3+-panel linked group (Task 5) demonstrates that exactly one outgoing sync event per user interaction produces exactly N-1 inbound applications, with zero cascade/infinite-loop — backed by two independent mechanisms verified separately: never-route-to-origin (`ChartSyncRouter.route`'s `siblingId === event.panelId` guard), idempotent apply (`applyIfChanged`'s short-circuit), and `ChartEngine`'s proactive `applyingSync` re-entrancy guard (Task 3) that suppresses bus re-emission for the duration of any programmatic apply regardless of the underlying library's behavior.
- Invariant greps: no `selectChartView(panelId)`/`selectXyz(panelId)`-style factory selector introduced anywhere in `state/link-groups/` or `components/workspace/`; `chart-sync-router.ts` and `chart-registry.service.ts` remain free of `@angular`/`@ngrx` imports; `syncPriceScale` has zero read-sites outside `link-groups.models.ts`'s type declaration and the reducer's pass-through storage.
