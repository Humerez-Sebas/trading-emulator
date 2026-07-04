import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { EmuladorPageComponent } from './emulador-page.component';
import { WorkspaceViewportComponent } from '../../components/workspace/workspace-viewport.component';
import { ControlsComponent } from '../../components/controls/controls.component';
import { DrawingToolbarComponent } from '../../components/drawing-toolbar/drawing-toolbar.component';
import { SideDockComponent } from '../../components/side-dock/side-dock.component';
import { SessionSummaryComponent } from '../../components/session-summary/session-summary.component';
import { FloatingToolbarComponent } from '../../components/floating-toolbar/floating-toolbar.component';
import { CsvStartDialogComponent } from '../../components/csv-start-dialog/csv-start-dialog.component';
import { IntervalDialogComponent } from '../../components/interval-dialog/interval-dialog.component';
import { PlaybackControllerComponent } from '../../components/playback-controller/playback-controller.component';
import { FloatingPnlComponent } from '../../components/floating-pnl/floating-pnl.component';
import { tradingFeature } from '../../state/trading/trading.reducer';
import { settingsFeature } from '../../state/settings/settings.reducer';

/**
 * Smoke test for the emulador shell. The child components (chart, controls,
 * etc.) live under `components/` and are not measured by coverage; we avoid
 * rendering them in jsdom by injecting the class directly rather than calling
 * createComponent. We just assert that the two signals correctly reflect the
 * overridden selectors.
 */
describe('EmuladorPageComponent', () => {
  let store: MockStore;
  let component: EmuladorPageComponent;

  function create() {
    TestBed.configureTestingModule({
      providers: [EmuladorPageComponent, provideMockStore()],
    });
    store = TestBed.inject(MockStore);
    // Set initial values via overrides before injecting the component
    store.overrideSelector(tradingFeature.selectSummaryOpen, false);
    store.overrideSelector(settingsFeature.selectFloatingToolbar, true);
    store.refreshState();
    component = TestBed.inject(EmuladorPageComponent);
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('is created successfully', () => {
    create();
    expect(component).toBeTruthy();
  });

  it('summaryOpen() reflects the tradingFeature selector', () => {
    create();
    store.overrideSelector(tradingFeature.selectSummaryOpen, true);
    store.refreshState();
    expect(component.summaryOpen()).toBe(true);
  });

  it('summaryOpen() is false when selector emits false', () => {
    create();
    store.overrideSelector(tradingFeature.selectSummaryOpen, false);
    store.refreshState();
    expect(component.summaryOpen()).toBe(false);
  });

  it('floatingToolbar() reflects the settingsFeature selector', () => {
    create();
    store.overrideSelector(settingsFeature.selectFloatingToolbar, false);
    store.refreshState();
    expect(component.floatingToolbar()).toBe(false);
  });

  it('floatingToolbar() is true when selector emits true', () => {
    create();
    store.overrideSelector(settingsFeature.selectFloatingToolbar, true);
    store.refreshState();
    expect(component.floatingToolbar()).toBe(true);
  });
});

/**
 * RFC-013 Task 5 (D1): the production swap. Every child is stubbed with a
 * same-selector placeholder (none carry required inputs at the page's own
 * template level, so a bare `standalone: true` stub with an empty template
 * is a faithful substitute) so the REAL page template renders in jsdom
 * without pulling in the heavy subtrees (Store-only children aside, several
 * of these have no dedicated spec of their own and are not otherwise
 * exercised in isolation).
 */
describe('EmuladorPageComponent template (RFC-013 Task 5)', () => {
  @Component({ selector: 'app-workspace-viewport', standalone: true, template: '' })
  class WorkspaceViewportStub {}
  @Component({ selector: 'app-controls', standalone: true, template: '' })
  class ControlsStub {}
  @Component({ selector: 'app-drawing-toolbar', standalone: true, template: '' })
  class DrawingToolbarStub {}
  @Component({ selector: 'app-side-dock', standalone: true, template: '' })
  class SideDockStub {}
  @Component({ selector: 'app-session-summary', standalone: true, template: '' })
  class SessionSummaryStub {}
  @Component({ selector: 'app-floating-toolbar', standalone: true, template: '' })
  class FloatingToolbarStub {}
  @Component({ selector: 'app-csv-start-dialog', standalone: true, template: '' })
  class CsvStartDialogStub {}
  @Component({ selector: 'app-interval-dialog', standalone: true, template: '' })
  class IntervalDialogStub {}
  @Component({ selector: 'app-playback-controller', standalone: true, template: '' })
  class PlaybackControllerStub {}
  @Component({ selector: 'app-floating-pnl', standalone: true, template: '' })
  class FloatingPnlStub {}

  let store: MockStore;

  function create(summaryOpen = false, floatingToolbar = true) {
    TestBed.configureTestingModule({
      imports: [EmuladorPageComponent],
      providers: [provideMockStore()],
    });
    TestBed.overrideComponent(EmuladorPageComponent, {
      remove: {
        imports: [
          WorkspaceViewportComponent,
          ControlsComponent,
          DrawingToolbarComponent,
          SideDockComponent,
          SessionSummaryComponent,
          FloatingToolbarComponent,
          CsvStartDialogComponent,
          IntervalDialogComponent,
          PlaybackControllerComponent,
          FloatingPnlComponent,
        ],
      },
      add: {
        imports: [
          WorkspaceViewportStub,
          ControlsStub,
          DrawingToolbarStub,
          SideDockStub,
          SessionSummaryStub,
          FloatingToolbarStub,
          CsvStartDialogStub,
          IntervalDialogStub,
          PlaybackControllerStub,
          FloatingPnlStub,
        ],
      },
    });
    store = TestBed.inject(MockStore);
    store.overrideSelector(tradingFeature.selectSummaryOpen, summaryOpen);
    store.overrideSelector(settingsFeature.selectFloatingToolbar, floatingToolbar);
    store.refreshState();
    const fixture = TestBed.createComponent(EmuladorPageComponent);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders app-workspace-viewport and NOT app-chart', () => {
    const fixture = create();
    expect(fixture.nativeElement.querySelector('app-workspace-viewport')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-chart')).toBeNull();
  });

  it('renders the always-on overlays (floating-pnl, playback-controller) unconditionally', () => {
    const fixture = create();
    expect(fixture.nativeElement.querySelector('app-floating-pnl')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-playback-controller')).toBeTruthy();
  });

  it('renders app-floating-toolbar only when settingsFeature.selectFloatingToolbar is true', () => {
    const shown = create(false, true);
    expect(shown.nativeElement.querySelector('app-floating-toolbar')).toBeTruthy();
  });

  it('does not render app-floating-toolbar when the flag is false', () => {
    const hidden = create(false, false);
    expect(hidden.nativeElement.querySelector('app-floating-toolbar')).toBeNull();
  });

  it('renders app-session-summary only when tradingFeature.selectSummaryOpen is true', () => {
    const shown = create(true, true);
    expect(shown.nativeElement.querySelector('app-session-summary')).toBeTruthy();
  });

  it('does not render app-session-summary when the flag is false', () => {
    const hidden = create(false, true);
    expect(hidden.nativeElement.querySelector('app-session-summary')).toBeNull();
  });

  it('always renders the csv-start and interval dialogs (self-gated by their own store flags)', () => {
    const fixture = create();
    expect(fixture.nativeElement.querySelector('app-csv-start-dialog')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-interval-dialog')).toBeTruthy();
  });

  it('the component metadata carries no ChartModelMapper provider (its only consumers are now panel-provided)', () => {
    const metadata = (EmuladorPageComponent as unknown as { ɵcmp: { providersResolver?: unknown } })
      .ɵcmp;
    // Angular compiles `providers: [...]` into a `providersResolver` on the component def;
    // its absence here is the compiled proof that no page-level providers array remains.
    expect(metadata.providersResolver).toBeFalsy();
  });
});
