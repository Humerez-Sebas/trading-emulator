import { describe, it, expect, beforeEach } from 'vitest';
import { SERVER_ZONE_ID } from '../../domain/chart/display-time';
import { Component, output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { WorkspaceViewportComponent } from './workspace-viewport.component';
import { ChartPanelComponent } from './chart-panel.component';
import { ChartComponent, ChartControlHandle } from '../chart/chart.component';
import { ChartEventBus } from '../../domain/chart/chart-event-bus';
import { selectCurrentTime, selectSeries, selectDisplayZone } from '../../state/selectors';
import { LayoutState } from '../../state/layout/layout.models';

/** Leaf stub of the audited ChartComponent — no engine, no canvas — one instance per mounted panel. */
@Component({ selector: 'app-chart', standalone: true, template: '' })
class ChartLeafStub {
  readonly chartReady = output<ChartEventBus>();
  readonly chartControlReady = output<ChartControlHandle>();
}

// tab-a ACTIVE with p1,p2 (two cells); tab-b INACTIVE with p3,p4.
const layoutState: LayoutState = {
  workspace: {
    tabs: [
      {
        id: 'tab-a',
        name: 'A',
        template: '2h',
        cells: [
          { panelIds: ['p1'], activePanelId: 'p1' },
          { panelIds: ['p2'], activePanelId: 'p2' },
        ],
      },
      {
        id: 'tab-b',
        name: 'B',
        template: '2h',
        cells: [
          { panelIds: ['p3'], activePanelId: 'p3' },
          { panelIds: ['p4'], activePanelId: 'p4' },
        ],
      },
    ],
    activeTabId: 'tab-a',
  },
  panels: {
    p1: { id: 'p1', symbol: 'SP500', timeframe: 'M1', linkGroupId: null },
    p2: { id: 'p2', symbol: 'SP500', timeframe: 'M5', linkGroupId: null },
    p3: { id: 'p3', symbol: 'SP500', timeframe: 'M15', linkGroupId: null },
    p4: { id: 'p4', symbol: 'SP500', timeframe: 'H1', linkGroupId: null },
  },
  focusedPanelId: 'p1',
};

describe('WorkspaceViewport lazy chart creation (RFC-012 Task 4)', () => {
  let store: MockStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [WorkspaceViewportComponent],
      providers: [provideMockStore({ initialState: { layout: layoutState } })],
    });
    // Keep the REAL ChartPanelComponent mounted (so its real hasBeenVisible() latch, Task 3,
    // gates the child); only the LEAF app-chart is swapped for a counting stub.
    TestBed.overrideComponent(ChartPanelComponent, {
      remove: { imports: [ChartComponent] },
      add: { imports: [ChartLeafStub] },
    });
    store = TestBed.inject(MockStore);
    store.overrideSelector(selectSeries, { M1: [], M5: [], M15: [], H1: [] });
    store.overrideSelector(selectCurrentTime, 0);
    store.overrideSelector(selectDisplayZone, SERVER_ZONE_ID);
  });

  function create() {
    const fixture = TestBed.createComponent(WorkspaceViewportComponent);
    fixture.detectChanges();
    return fixture;
  }

  it("mounts <app-chart> ONLY for the active tab's visible panels (2), not the inactive tab's (RFC-012 Task 4)", () => {
    const fixture = create();
    const charts = fixture.debugElement.queryAll(By.directive(ChartLeafStub));
    expect(charts).toHaveLength(2); // p1,p2 only — p3,p4 create no ChartEngine yet
  });

  it("activating tab-b mounts its previously-lazy panels while tab-a's stay alive (sticky keep-alive)", () => {
    const fixture = create();
    store.setState({
      layout: { ...layoutState, workspace: { ...layoutState.workspace, activeTabId: 'tab-b' } },
    });
    fixture.detectChanges();
    const charts = fixture.debugElement.queryAll(By.directive(ChartLeafStub));
    expect(charts).toHaveLength(4); // p1,p2 latched-open + p3,p4 now shown
  });
});
