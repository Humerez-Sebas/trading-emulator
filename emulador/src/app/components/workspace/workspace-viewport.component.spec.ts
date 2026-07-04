import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Component, input, output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { WorkspaceViewportComponent } from './workspace-viewport.component';
import { ChartPanelComponent } from './chart-panel.component';
import { ChartComponent } from '../chart/chart.component';
import { ChartModelMapper } from '../chart/chart-model-mapper.service';
import { ChartEventBus } from '../../domain/chart/chart-event-bus';
import { ChartRegistry } from './chart-registry.service';
import { ChartSyncBus } from '../../domain/chart/chart-sync-bus';
import { LayoutActions } from '../../state/layout/layout.actions';
import { layoutFeature } from '../../state/layout/layout.reducer';
import { selectCurrentTime, selectSeries, selectUtcOffset } from '../../state/selectors';
import { LayoutState, MAX_PANELS_PER_TAB, PanelDescriptor } from '../../state/layout/layout.models';

/** Stub panel: renders nothing, keeps the required input contract. */
@Component({ selector: 'app-chart-panel', standalone: true, template: '' })
class ChartPanelStubComponent {
  readonly descriptor = input.required<PanelDescriptor>();
  readonly visible = input<boolean>(true);
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

/** Same layout, but the stacked cell's active panel flips from p2 to p3. */
const switchedActivePanelState: LayoutState = structuredClone(layoutState);
switchedActivePanelState.workspace.tabs[0].cells[1].activePanelId = 'p3';

/** Active tab ('tab-a') holds MAX_PANELS_PER_TAB (8) panels — the "+" must be disabled. */
const fullTabState: LayoutState = (() => {
  const ids = Array.from({ length: MAX_PANELS_PER_TAB }, (_, i) => `full-${i}`);
  const panels: Record<string, PanelDescriptor> = {};
  for (const id of ids) panels[id] = desc(id);
  return {
    workspace: {
      tabs: [
        {
          id: 'tab-a',
          name: 'Principal',
          template: '2x2',
          cells: [
            { panelIds: ids.slice(0, 4), activePanelId: ids[0] },
            { panelIds: ids.slice(4, 8), activePanelId: ids[4] },
            { panelIds: [], activePanelId: '' },
            { panelIds: [], activePanelId: '' },
          ],
        },
        { id: 'tab-b', name: 'Contexto', template: '1', cells: [{ panelIds: [], activePanelId: '' }] },
      ],
      activeTabId: 'tab-a',
    },
    panels,
  };
})();

/**
 * Derives a consistent `LayoutState` from `layoutState` with the given panels
 * removed, by folding the REAL `removePanel` reducer over the ids — this keeps
 * the lifecycle/leak suite honest against the actual invariant-preserving
 * reducer logic instead of hand-rolled fixture state (RFC-009 Task 4).
 */
function stateWithout(...panelIds: string[]): LayoutState {
  return panelIds.reduce(
    (state, panelId) => layoutFeature.reducer(state, LayoutActions.removePanel({ panelId })),
    layoutState,
  );
}

/** Stub of the audited ChartComponent: no engine, no canvas — just the output. */
@Component({ selector: 'app-chart', standalone: true, template: '' })
class ChartStubComponent {
  readonly chartReady = output<ChartEventBus>();
}

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

  it('projects the active tab: every panel of populated cells renders (keep-alive), placeholders for empty cells', () => {
    const fixture = create();
    const panels = fixture.debugElement.queryAll(By.directive(ChartPanelStubComponent));
    // all 3 panels are kept alive in the DOM; only the active panel of each cell is shown
    expect(panels).toHaveLength(3);
    expect(panels[0].componentInstance.descriptor().id).toBe('p1');
    expect(panels[1].componentInstance.descriptor().id).toBe('p2');
    expect(panels[2].componentInstance.descriptor().id).toBe('p3');
    const nonHidden = panels.filter((p) => !(p.nativeElement as HTMLElement).hidden);
    expect(nonHidden).toHaveLength(2);
    const grid = fixture.nativeElement.querySelector('.grid:not([hidden])');
    expect(grid.querySelectorAll('.cell')).toHaveLength(4);
    expect(grid.querySelectorAll('.cell-empty')).toHaveLength(2);
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

  it('a "+" button renders per cell and dispatches addPanel targeting that (tabId, cellIndex)', () => {
    const fixture = create();
    const dispatch = vi.spyOn(store, 'dispatch');
    const addButtons = fixture.nativeElement.querySelectorAll('.grid:not([hidden]) .cell-add');
    expect(addButtons).toHaveLength(4); // one per cell of the active '2x2' tab
    (addButtons[2] as HTMLButtonElement).click(); // third cell: empty, cellIndex 2
    expect(dispatch).toHaveBeenCalledTimes(1);
    const dispatched = dispatch.mock.calls[0][0] as unknown as ReturnType<typeof LayoutActions.addPanel>;
    expect(dispatched.type).toBe(LayoutActions.addPanel.type);
    expect(dispatched.tabId).toBe('tab-a');
    expect(dispatched.cellIndex).toBe(2);
    expect(dispatched.descriptor).toEqual({
      id: expect.any(String),
      symbol: '',
      timeframe: 'M1',
      linkGroupId: null,
    });
  });

  it('"+" is disabled when the active tab already holds MAX_PANELS_PER_TAB panels', () => {
    store.setState({ layout: fullTabState });
    const fixture = create();
    fixture.detectChanges();
    const addButtons = fixture.nativeElement.querySelectorAll('.grid:not([hidden]) .cell-add');
    expect(addButtons).toHaveLength(4);
    for (const btn of Array.from(addButtons) as HTMLButtonElement[]) {
      expect(btn.disabled).toBe(true);
    }
  });

  it('an "x" affordance on each cell tab dispatches removePanel and does not also dispatch setActivePanel', () => {
    const fixture = create();
    const dispatch = vi.spyOn(store, 'dispatch');
    const closeButtons = fixture.nativeElement.querySelectorAll('.cell-tabs .cell-tab .cell-tab-close');
    expect(closeButtons).toHaveLength(2); // stacked cell has 2 panels (p2, p3)
    (closeButtons[1] as HTMLButtonElement).click(); // p3's close affordance
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(LayoutActions.removePanel({ panelId: 'p3' }));
  });
});

describe('WorkspaceViewportComponent lifecycle: create/hide/show/close (RFC-009, P1 A-3 discipline)', () => {
  let store: MockStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [WorkspaceViewportComponent],
      providers: [provideMockStore({ initialState: { layout: layoutState } })],
    });
    // Use the REAL ChartPanelComponent inside the viewport (not a stub) so its
    // ngOnInit/ngOnDestroy actually register/deregister with the ChartRegistry.
    // Only the innermost app-chart (audited ChartComponent) is stubbed, exactly
    // as chart-panel.component.spec.ts does.
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

  it('registry tracks exactly the live panels across arbitrary close order', () => {
    const fixture = create();
    const registry = fixture.debugElement.injector.get(ChartRegistry);
    expect(registry.ids().sort()).toEqual(['p1', 'p2', 'p3']);
    store.setState({ layout: stateWithout('p2') });
    fixture.detectChanges();
    expect(registry.ids().sort()).toEqual(['p1', 'p3']);
    store.setState({ layout: stateWithout('p2', 'p1') });
    fixture.detectChanges();
    expect(registry.ids()).toEqual(['p3']);
  });

  it('hidden panels are gated (setUpdatesEnabled(false)) and never destroyed', () => {
    const fixture = create();
    const registry = fixture.debugElement.injector.get(ChartRegistry);
    // p3's own ChartModelMapper is the real call path for gating (the panel's
    // effect calls `this.mapper.setUpdatesEnabled` directly, per Task 3 D6);
    // the registry handle wraps that same mapper call for external consumers.
    // Spy on the mapper reachable from p3's own component injector — this
    // observes the exact call the plan's semantics require, regardless of
    // which object identity the internal effect happens to invoke through.
    const p3Panel = fixture.debugElement
      .queryAll(By.directive(ChartPanelComponent))
      .find((de) => de.componentInstance.descriptor().id === 'p3')!;
    const p3Mapper = p3Panel.injector.get(ChartModelMapper);
    const gateSpy = vi.spyOn(p3Mapper, 'setUpdatesEnabled');
    // p2 becomes hidden on this same toggle (stacked cell flips its active
    // panel from p2 to p3): spy its mapper too and assert the (false) leg of
    // the same gate transition (RFC-009 Task 4 Medium finding, closed here).
    const p2Panel = fixture.debugElement
      .queryAll(By.directive(ChartPanelComponent))
      .find((de) => de.componentInstance.descriptor().id === 'p2')!;
    const p2Mapper = p2Panel.injector.get(ChartModelMapper);
    const hideGateSpy = vi.spyOn(p2Mapper, 'setUpdatesEnabled');
    // p3 is the hidden stacked panel: toggle the cell tab so p3 becomes
    // visible and p2 becomes hidden — the registry keeps all three alive.
    store.setState({ layout: switchedActivePanelState });
    fixture.detectChanges();
    expect(registry.count()).toBe(3);
    expect(gateSpy).toHaveBeenCalledWith(true);
    expect(hideGateSpy).toHaveBeenCalledWith(false);
  });

  it('no leaks after repeated hide/show cycles: registry count and handle set stable', () => {
    const fixture = create();
    const registry = fixture.debugElement.injector.get(ChartRegistry);
    for (let i = 0; i < 5; i++) {
      store.setState({ layout: switchedActivePanelState });
      fixture.detectChanges();
      store.setState({ layout: layoutState });
      fixture.detectChanges();
    }
    expect(registry.count()).toBe(3);
  });
});

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

  it('a 3+ panel topology bounds total handle-apply calls: one origin event never produces more than N-1 applies, across BOTH event types', () => {
    const fixture = create();
    const registry = fixture.debugElement.injector.get(ChartRegistry);
    const syncBus = fixture.debugElement.injector.get(ChartSyncBus);
    const spies = ['p1', 'p2', 'p3'].map((id) => ({
      id,
      crosshair: vi.spyOn(registry.get(id)!, 'applyCrosshair'),
      range: vi.spyOn(registry.get(id)!, 'applyVisibleRange'),
    }));

    syncBus.emit('p1', 'CrosshairMoved', { point: { x: 1, y: 1 }, time: 1000 } as never);
    syncBus.emit('p2', 'VisibleRangeChanged', { from: 0, to: 10 } as never);

    const totalApplies = spies.reduce(
      (n, s) => n + s.crosshair.mock.calls.length + s.range.mock.calls.length,
      0,
    );
    // Exactly N-1 (=2) applyCrosshair calls from p1's event, plus exactly N-1 (=2)
    // applyVisibleRange calls from p2's event: 4 total, never more (no cascade).
    expect(totalApplies).toBe(4);
    expect(spies.find((s) => s.id === 'p1')!.crosshair).not.toHaveBeenCalled();
    expect(spies.find((s) => s.id === 'p2')!.range).not.toHaveBeenCalled();
  });

  it('syncCrosshair and syncTimeRange gate independently: crosshair-only group routes CrosshairMoved but not VisibleRangeChanged', () => {
    // Reuse the same linked panels, but flip the group to crosshair-only via a fresh store state.
    const crosshairOnlyGroups = {
      groups: { g1: { id: 'g1', color: '#f00', syncCrosshair: true, syncTimeRange: false } },
    };
    store.setState({ layout: linkedState, linkGroups: crosshairOnlyGroups });
    const fixture = create();
    const registry = fixture.debugElement.injector.get(ChartRegistry);
    const syncBus = fixture.debugElement.injector.get(ChartSyncBus);
    const spyP2Crosshair = vi.spyOn(registry.get('p2')!, 'applyCrosshair');
    const spyP2Range = vi.spyOn(registry.get('p2')!, 'applyVisibleRange');

    syncBus.emit('p1', 'CrosshairMoved', { point: { x: 1, y: 1 }, time: 1000 } as never);
    syncBus.emit('p1', 'VisibleRangeChanged', { from: 0, to: 10 } as never);

    expect(spyP2Crosshair).toHaveBeenCalledTimes(1);
    expect(spyP2Range).not.toHaveBeenCalled();
  });

  it('syncCrosshair and syncTimeRange gate independently: timeRange-only group routes VisibleRangeChanged but not CrosshairMoved', () => {
    const rangeOnlyGroups = {
      groups: { g1: { id: 'g1', color: '#f00', syncCrosshair: false, syncTimeRange: true } },
    };
    store.setState({ layout: linkedState, linkGroups: rangeOnlyGroups });
    const fixture = create();
    const registry = fixture.debugElement.injector.get(ChartRegistry);
    const syncBus = fixture.debugElement.injector.get(ChartSyncBus);
    const spyP2Crosshair = vi.spyOn(registry.get('p2')!, 'applyCrosshair');
    const spyP2Range = vi.spyOn(registry.get('p2')!, 'applyVisibleRange');

    syncBus.emit('p1', 'CrosshairMoved', { point: { x: 1, y: 1 }, time: 1000 } as never);
    syncBus.emit('p1', 'VisibleRangeChanged', { from: 0, to: 10 } as never);

    expect(spyP2Crosshair).not.toHaveBeenCalled();
    expect(spyP2Range).toHaveBeenCalledTimes(1);
  });

  it('router state stays live across a layout change: unlinking p2 stops it from receiving further sync events', () => {
    const fixture = create();
    const registry = fixture.debugElement.injector.get(ChartRegistry);
    const syncBus = fixture.debugElement.injector.get(ChartSyncBus);
    const spyP2 = vi.spyOn(registry.get('p2')!, 'applyCrosshair');
    const spyP3 = vi.spyOn(registry.get('p3')!, 'applyCrosshair');

    syncBus.emit('p1', 'CrosshairMoved', { point: { x: 1, y: 1 }, time: 1000 } as never);
    expect(spyP2).toHaveBeenCalledTimes(1);
    expect(spyP3).toHaveBeenCalledTimes(1);

    const unlinkedP2State: LayoutState = structuredClone(linkedState);
    unlinkedP2State.panels['p2'].linkGroupId = null;
    store.setState({ layout: unlinkedP2State, linkGroups: linkGroupsState });
    fixture.detectChanges();

    syncBus.emit('p1', 'CrosshairMoved', { point: { x: 2, y: 2 }, time: 2000 } as never);
    expect(spyP2).toHaveBeenCalledTimes(1); // unchanged: p2 no longer in the group, router state updated live
    expect(spyP3).toHaveBeenCalledTimes(2); // p3 still linked: keeps receiving
  });

  it('destroys the ChartSyncRouter alongside the ChartSyncBus on ngOnDestroy (no post-destroy routing)', () => {
    const fixture = create();
    const registry = fixture.debugElement.injector.get(ChartRegistry);
    const syncBus = fixture.debugElement.injector.get(ChartSyncBus);
    const spyP2 = vi.spyOn(registry.get('p2')!, 'applyCrosshair');

    fixture.destroy();

    expect(() =>
      syncBus.emit('p1', 'CrosshairMoved', { point: { x: 1, y: 1 }, time: 1000 } as never),
    ).not.toThrow();
    expect(spyP2).not.toHaveBeenCalled();
  });
});
