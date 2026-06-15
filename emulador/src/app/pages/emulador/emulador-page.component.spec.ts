import { TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { EmuladorPageComponent } from './emulador-page.component';
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
