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
