import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Component, output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { MouseEventParams, Time } from 'lightweight-charts';
import { ChartPanelComponent } from './chart-panel.component';
import { ChartComponent, ChartControlHandle } from '../chart/chart.component';
import { ChartModelMapper } from '../chart/chart-model-mapper.service';
import { ChartEventBus } from '../../domain/chart/chart-event-bus';
import { ChartSyncBus, PanelSyncEvent } from '../../domain/chart/chart-sync-bus';
import { ChartRegistry } from './chart-registry.service';
import { LayoutActions } from '../../state/layout/layout.actions';
import {
  selectCurrentTime,
  selectSeries,
  selectSessionTfs,
  selectUtcOffset,
} from '../../state/selectors';
import { PanelDescriptor } from '../../state/layout/layout.models';
import { linkGroupsFeature } from '../../state/link-groups/link-groups.reducer';
import { LinkGroup } from '../../state/link-groups/link-groups.models';

/** Stub of the audited ChartComponent: no engine, no canvas — just the outputs. */
@Component({ selector: 'app-chart', standalone: true, template: '' })
class ChartStubComponent {
  readonly chartReady = output<ChartEventBus>();
  readonly chartControlReady = output<ChartControlHandle>();
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
      providers: [
        provideMockStore(),
        { provide: ChartSyncBus, useValue: syncBus },
        { provide: ChartRegistry, useValue: new ChartRegistry() },
      ],
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
    store.overrideSelector(selectSessionTfs, ['M1', 'M5', 'M15']);
    store.overrideSelector(linkGroupsFeature.selectGroups, {});
  });

  afterEach(() => store.resetSelectors());

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

  it('registers applyCrosshair/applyVisibleRange delegates that forward to the chartControlReady handle', () => {
    const fixture = create();
    const registry = TestBed.inject(ChartRegistry);
    const stub = fixture.debugElement.query(By.directive(ChartStubComponent));
    const controlHandle = { applyCrosshair: vi.fn(), applyVisibleRange: vi.fn() };
    stub.componentInstance.chartControlReady.emit(controlHandle);

    const panelHandle = registry.get('panel-1')!;
    panelHandle.applyCrosshair(1000);
    // `LogicalRange.from/to` are the branded `Logical` type, not plain `number`; `as never`
    // matches this repo's existing convention for LogicalRange test literals (see
    // chart-sync-bus.spec.ts, chart-engine.spec.ts).
    panelHandle.applyVisibleRange({ from: 0, to: 10 } as never);

    expect(controlHandle.applyCrosshair).toHaveBeenCalledWith(1000);
    expect(controlHandle.applyVisibleRange).toHaveBeenCalledWith({ from: 0, to: 10 });
  });

  it('a delegate call BEFORE chartControlReady has fired is a silent no-op, not a throw', () => {
    create(); // registers panel-1 in the registry via ngOnInit; no chartControlReady emitted yet
    const registry = TestBed.inject(ChartRegistry);
    const panelHandle = registry.get('panel-1')!;
    expect(() => panelHandle.applyCrosshair(1000)).not.toThrow();
  });

  function createWithVisible(visible: boolean, desc: PanelDescriptor = descriptor) {
    const fixture = TestBed.createComponent(ChartPanelComponent);
    fixture.componentRef.setInput('descriptor', desc);
    fixture.componentRef.setInput('visible', visible);
    fixture.detectChanges();
    return fixture;
  }

  describe('lazy chart creation on first show (RFC-012 Task 3)', () => {
    it('does NOT render <app-chart> for a panel that has never been visible', () => {
      const fixture = createWithVisible(false);
      expect(fixture.debugElement.query(By.directive(ChartStubComponent))).toBeNull();
      // header still renders so the tab is not blank
      expect(fixture.nativeElement.querySelector('.panel-label').textContent).toContain(
        'SP500 · M5',
      );
    });

    it('renders <app-chart> once the panel first becomes visible', () => {
      const fixture = createWithVisible(false);
      expect(fixture.debugElement.query(By.directive(ChartStubComponent))).toBeNull();
      fixture.componentRef.setInput('visible', true);
      fixture.detectChanges();
      expect(fixture.debugElement.query(By.directive(ChartStubComponent))).not.toBeNull();
    });

    it('keeps <app-chart> mounted after the panel is hidden again (sticky latch preserves RFC-009 keep-alive)', () => {
      const fixture = createWithVisible(true);
      expect(fixture.debugElement.query(By.directive(ChartStubComponent))).not.toBeNull();
      fixture.componentRef.setInput('visible', false);
      fixture.detectChanges();
      // still mounted: hiding after first show must NOT tear the engine down
      expect(fixture.debugElement.query(By.directive(ChartStubComponent))).not.toBeNull();
    });
  });

  describe('per-panel timeframe selector (RFC-013 Task 3)', () => {
    it('renders a select whose value mirrors the descriptor timeframe', () => {
      const fixture = create(); // descriptor.timeframe === 'M5'
      const select: HTMLSelectElement = fixture.nativeElement.querySelector('.panel-tf-select');
      expect(select).toBeTruthy();
      expect(select.value).toBe('M5');
    });

    it('lists exactly the session/global timeframe options (selectSessionTfs)', () => {
      const fixture = create();
      const select: HTMLSelectElement = fixture.nativeElement.querySelector('.panel-tf-select');
      const values = Array.from(select.options).map((o) => o.value);
      expect(values).toEqual(['M1', 'M5', 'M15']);
    });

    it('changing the select dispatches setPanelTimeframe with THIS panel id and the chosen timeframe', () => {
      const fixture = create();
      const dispatch = vi.spyOn(store, 'dispatch');
      const select: HTMLSelectElement = fixture.nativeElement.querySelector('.panel-tf-select');
      select.value = 'M15';
      select.dispatchEvent(new Event('change'));
      expect(dispatch).toHaveBeenCalledWith(
        LayoutActions.setPanelTimeframe({ panelId: 'panel-1', timeframe: 'M15' }),
      );
    });
  });

  describe('link-group chip (RFC-013 Task 4)', () => {
    const groupA: LinkGroup = {
      id: 'g1',
      color: '#2962FF',
      syncCrosshair: true,
      syncTimeRange: true,
    };
    const groupB: LinkGroup = {
      id: 'g2',
      color: '#F23645',
      syncCrosshair: true,
      syncTimeRange: true,
    };

    it('an unlinked panel shows a hollow (unfilled) chip', () => {
      const fixture = create({ ...descriptor, linkGroupId: null });
      const chip: HTMLElement = fixture.nativeElement.querySelector('.panel-link-chip');
      expect(chip).toBeTruthy();
      expect(chip.classList.contains('linked')).toBe(false);
    });

    it('a linked panel shows the chip filled with its group color', () => {
      store.overrideSelector(linkGroupsFeature.selectGroups, { g1: groupA });
      const fixture = create({ ...descriptor, linkGroupId: 'g1' });
      const chip: HTMLElement = fixture.nativeElement.querySelector('.panel-link-chip');
      expect(chip.classList.contains('linked')).toBe(true);
      expect((chip.style as CSSStyleDeclaration).backgroundColor).toBeTruthy();
    });

    it('a dangling linkGroupId (group no longer exists) renders hollow without throwing', () => {
      store.overrideSelector(linkGroupsFeature.selectGroups, {});
      let fixture!: ReturnType<typeof create>;
      expect(() => {
        fixture = create({ ...descriptor, linkGroupId: 'ghost' });
      }).not.toThrow();
      const chip: HTMLElement = fixture.nativeElement.querySelector('.panel-link-chip');
      expect(chip.classList.contains('linked')).toBe(false);
    });

    it('clicking the chip opens a mini-menu listing every group plus "Sin grupo"', () => {
      store.overrideSelector(linkGroupsFeature.selectGroups, { g1: groupA, g2: groupB });
      const fixture = create({ ...descriptor, linkGroupId: null });
      const chip: HTMLButtonElement = fixture.nativeElement.querySelector('.panel-link-chip');
      chip.click();
      fixture.detectChanges();
      const items = fixture.nativeElement.querySelectorAll('.link-chip-menu .link-chip-menu-item');
      expect(items).toHaveLength(3); // g1, g2, Sin grupo
      expect(fixture.nativeElement.querySelector('.link-chip-menu').textContent).toContain(
        'Sin grupo',
      );
    });

    it('choosing a group in the mini-menu dispatches setPanelLinkGroup with THIS panel id and closes the menu', () => {
      store.overrideSelector(linkGroupsFeature.selectGroups, { g1: groupA, g2: groupB });
      const fixture = create({ ...descriptor, linkGroupId: null });
      const dispatch = vi.spyOn(store, 'dispatch');
      const chip: HTMLButtonElement = fixture.nativeElement.querySelector('.panel-link-chip');
      chip.click();
      fixture.detectChanges();
      const items: NodeListOf<HTMLButtonElement> = fixture.nativeElement.querySelectorAll(
        '.link-chip-menu .link-chip-menu-item',
      );
      items[0].click(); // g1
      expect(dispatch).toHaveBeenCalledWith(
        LayoutActions.setPanelLinkGroup({ panelId: 'panel-1', linkGroupId: 'g1' }),
      );
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.link-chip-menu')).toBeNull();
    });

    it('choosing "Sin grupo" dispatches setPanelLinkGroup with linkGroupId null', () => {
      store.overrideSelector(linkGroupsFeature.selectGroups, { g1: groupA });
      const fixture = create({ ...descriptor, linkGroupId: 'g1' });
      const dispatch = vi.spyOn(store, 'dispatch');
      const chip: HTMLButtonElement = fixture.nativeElement.querySelector('.panel-link-chip');
      chip.click();
      fixture.detectChanges();
      const items: NodeListOf<HTMLButtonElement> = fixture.nativeElement.querySelectorAll(
        '.link-chip-menu .link-chip-menu-item',
      );
      const sinGrupo = Array.from(items).find((el) => el.textContent?.includes('Sin grupo'))!;
      sinGrupo.click();
      expect(dispatch).toHaveBeenCalledWith(
        LayoutActions.setPanelLinkGroup({ panelId: 'panel-1', linkGroupId: null }),
      );
    });
  });
});
