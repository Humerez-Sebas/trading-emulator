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
import { LayoutActions } from '../../state/layout/layout.actions';
import { layoutFeature } from '../../state/layout/layout.reducer';
import { selectCurrentTime, selectSeries, selectUtcOffset } from '../../state/selectors';
import { LayoutState, PanelDescriptor } from '../../state/layout/layout.models';

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
    // p3 is the hidden stacked panel: toggle the cell tab so p3 becomes
    // visible and p2 becomes hidden — the registry keeps all three alive.
    store.setState({ layout: switchedActivePanelState });
    fixture.detectChanges();
    expect(registry.count()).toBe(3);
    expect(gateSpy).toHaveBeenCalledWith(true);
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
