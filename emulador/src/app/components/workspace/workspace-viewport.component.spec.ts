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
