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
