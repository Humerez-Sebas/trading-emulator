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
  readonly chartFocused = output<void>();
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

  it('dispatches LayoutActions.setFocusedPanel to the store with the panel ID when chartFocused is emitted', () => {
    const fixture = create();
    const dispatch = vi.spyOn(store, 'dispatch');
    const stub = fixture.debugElement.query(By.directive(ChartStubComponent));
    stub.componentInstance.chartFocused.emit();
    expect(dispatch).toHaveBeenCalledWith(LayoutActions.setFocusedPanel({ panelId: 'panel-1' }));
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
      syncDrawings: true,
    };
    const groupB: LinkGroup = {
      id: 'g2',
      color: '#F23645',
      syncCrosshair: true,
      syncTimeRange: true,
      syncDrawings: true,
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

  describe('eye popover (RFC-018 §8, Task 6)', () => {
    const groupSharing: LinkGroup = {
      id: 'g1',
      color: '#2962FF',
      syncCrosshair: true,
      syncTimeRange: true,
      syncDrawings: true,
    };
    const groupNotSharing: LinkGroup = {
      id: 'g1',
      color: '#2962FF',
      syncCrosshair: true,
      syncTimeRange: true,
      syncDrawings: false,
    };

    function eye(fixture: ReturnType<typeof create>): HTMLButtonElement {
      return fixture.nativeElement.querySelector('.panel-eye');
    }

    function openEyeMenu(fixture: ReturnType<typeof create>): void {
      eye(fixture).click();
      fixture.detectChanges();
    }

    function eyeMenuItems(fixture: ReturnType<typeof create>): NodeListOf<HTMLButtonElement> {
      return fixture.nativeElement.querySelectorAll('.eye-menu .eye-menu-item');
    }

    function drawingsRow(fixture: ReturnType<typeof create>): HTMLButtonElement {
      return eyeMenuItems(fixture)[0];
    }

    function tradesRow(fixture: ReturnType<typeof create>): HTMLButtonElement {
      return eyeMenuItems(fixture)[1];
    }

    it('renders the eye button on an unlinked panel (regression on the removed @if)', () => {
      const fixture = create({ ...descriptor, linkGroupId: null });
      expect(eye(fixture)).toBeTruthy();
    });

    it('clicking the eye opens a popover with exactly two rows', () => {
      const fixture = create({ ...descriptor, linkGroupId: null });
      openEyeMenu(fixture);
      expect(eyeMenuItems(fixture)).toHaveLength(2);
    });

    it('unlinked panel: the "Dibujos compartidos" row is disabled and carries the Spanish hint', () => {
      const fixture = create({ ...descriptor, linkGroupId: null });
      openEyeMenu(fixture);
      const row = drawingsRow(fixture);
      expect(row.textContent).toContain('Dibujos compartidos');
      expect(row.classList.contains('disabled')).toBe(true);
      expect(row.getAttribute('title')).toBe('Vincula el panel a un grupo para compartir dibujos');
    });

    it('linked panel, syncDrawings: false: the row is still disabled', () => {
      store.overrideSelector(linkGroupsFeature.selectGroups, { g1: groupNotSharing });
      const fixture = create({ ...descriptor, linkGroupId: 'g1' });
      openEyeMenu(fixture);
      expect(drawingsRow(fixture).classList.contains('disabled')).toBe(true);
    });

    it('linked panel, syncDrawings: true: the row is enabled; clicking dispatches setPanelHideSharedDrawings with THIS panel id', () => {
      store.overrideSelector(linkGroupsFeature.selectGroups, { g1: groupSharing });
      const fixture = create({ ...descriptor, linkGroupId: 'g1' });
      openEyeMenu(fixture);
      const row = drawingsRow(fixture);
      expect(row.classList.contains('disabled')).toBe(false);
      const dispatch = vi.spyOn(store, 'dispatch');
      row.click();
      expect(dispatch).toHaveBeenCalledWith(
        LayoutActions.setPanelHideSharedDrawings({ panelId: 'panel-1', hidden: true }),
      );
    });

    it('any panel: the "Trades" row is always enabled; clicking dispatches setPanelHideTrades with THIS panel id', () => {
      const fixture = create({ ...descriptor, linkGroupId: null });
      openEyeMenu(fixture);
      const row = tradesRow(fixture);
      expect(row.textContent).toContain('Trades');
      expect(row.hasAttribute('aria-disabled')).toBe(false);
      const dispatch = vi.spyOn(store, 'dispatch');
      row.click();
      expect(dispatch).toHaveBeenCalledWith(
        LayoutActions.setPanelHideTrades({ panelId: 'panel-1', hidden: true }),
      );
    });

    it('R18-7: the inert row carries aria-disabled="true" and tabindex="-1", never the native disabled attribute', () => {
      const fixture = create({ ...descriptor, linkGroupId: null });
      openEyeMenu(fixture);
      const row = drawingsRow(fixture);
      expect(row.getAttribute('aria-disabled')).toBe('true');
      expect(row.getAttribute('tabindex')).toBe('-1');
      expect(row.hasAttribute('disabled')).toBe(false);
    });

    it('R18-7: clicking the inert row dispatches nothing toggle-related (the click guard holds)', () => {
      const fixture = create({ ...descriptor, linkGroupId: null });
      openEyeMenu(fixture);
      const dispatch = vi.spyOn(store, 'dispatch');
      drawingsRow(fixture).click();
      expect(dispatch).not.toHaveBeenCalledWith(
        LayoutActions.setPanelHideSharedDrawings(expect.anything()),
      );
    });

    it('R18-7: the inert row keeps a non-empty title — the tooltip stays reachable', () => {
      const fixture = create({ ...descriptor, linkGroupId: null });
      openEyeMenu(fixture);
      const title = drawingsRow(fixture).getAttribute('title');
      expect(title).toBeTruthy();
      expect(title!.length).toBeGreaterThan(0);
    });

    it('enabled row: aria-disabled is false/absent and tabindex is 0', () => {
      store.overrideSelector(linkGroupsFeature.selectGroups, { g1: groupSharing });
      const fixture = create({ ...descriptor, linkGroupId: 'g1' });
      openEyeMenu(fixture);
      const row = drawingsRow(fixture);
      const ariaDisabled = row.getAttribute('aria-disabled');
      expect(ariaDisabled === null || ariaDisabled === 'false').toBe(true);
      expect(row.getAttribute('tabindex')).toBe('0');
    });

    it('hideTrades: true makes the header eye carry .active', () => {
      const fixture = create({ ...descriptor, linkGroupId: null, hideTrades: true });
      expect(eye(fixture).classList.contains('active')).toBe(true);
    });

    it('linked + syncDrawings: true + hideSharedDrawings: true makes the header eye carry .active', () => {
      store.overrideSelector(linkGroupsFeature.selectGroups, { g1: groupSharing });
      const fixture = create({ ...descriptor, linkGroupId: 'g1', hideSharedDrawings: true });
      expect(eye(fixture).classList.contains('active')).toBe(true);
    });

    it('R18-8: unlinked + stale hideSharedDrawings: true does NOT make the header eye .active', () => {
      const fixture = create({ ...descriptor, linkGroupId: null, hideSharedDrawings: true });
      expect(eye(fixture).classList.contains('active')).toBe(false);
    });

    it('clicking outside the popover closes it', () => {
      const fixture = create({ ...descriptor, linkGroupId: null });
      openEyeMenu(fixture);
      expect(fixture.nativeElement.querySelector('.eye-menu')).not.toBeNull();
      document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.eye-menu')).toBeNull();
    });

    it('Escape closes the eye popover', () => {
      const fixture = create({ ...descriptor, linkGroupId: null });
      openEyeMenu(fixture);
      expect(fixture.nativeElement.querySelector('.eye-menu')).not.toBeNull();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.eye-menu')).toBeNull();
    });

    it('Escape also closes the link-chip menu (declared side-effect)', () => {
      const fixture = create({ ...descriptor, linkGroupId: null });
      const chip: HTMLButtonElement = fixture.nativeElement.querySelector('.panel-link-chip');
      chip.click();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.link-chip-menu')).not.toBeNull();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.link-chip-menu')).toBeNull();
    });
  });
});
