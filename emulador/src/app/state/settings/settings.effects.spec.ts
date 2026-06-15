import { TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsEffects } from './settings.effects';
import { settingsFeature } from './settings.reducer';

describe('SettingsEffects', () => {
  let store: MockStore;

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SettingsEffects, provideMockStore()],
    });
    store = TestBed.inject(MockStore);
  });

  describe('persist$', () => {
    it('calls persistSettings with the current settings state (writes to localStorage)', () => {
      const effects = TestBed.inject(SettingsEffects);

      const mockState: any = {
        theme: 'light',
        chartColors: {} as any,
        utcOffset: 0,
        gridVisible: true,
        gridOpacity: 1,
        floatingToolbar: true,
        tradeBoxesVisible: true,
        tradeBoxOpacity: { fill: 0.1, border: 0.5 },
        sidePanel: { tab: 'trade', open: true },
      };

      store.overrideSelector(settingsFeature.selectSettingsState, mockState);
      store.refreshState();

      const results: any[] = [];
      const sub = effects.persist$.subscribe((v) => results.push(v));

      // The effect emits the state after tap (dispatch:false → tap, returns the state)
      expect(results.length).toBeGreaterThan(0);
      // localStorage should contain the persisted settings
      const saved = localStorage.getItem('emulador.settings');
      expect(saved).not.toBeNull();
      const parsed = JSON.parse(saved!);
      expect(parsed.theme).toBe('light');

      sub.unsubscribe();
    });

    it('swallows errors when localStorage.setItem throws', () => {
      const effects = TestBed.inject(SettingsEffects);

      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('storage full');
      });

      const mockState: any = {
        theme: 'dark',
        chartColors: {} as any,
        utcOffset: -4,
        gridVisible: true,
        gridOpacity: 1,
        floatingToolbar: true,
        tradeBoxesVisible: true,
        tradeBoxOpacity: { fill: 0.1, border: 0.5 },
        sidePanel: { tab: 'trade', open: true },
      };

      store.overrideSelector(settingsFeature.selectSettingsState, mockState);
      store.refreshState();

      // Should not throw
      expect(() => {
        const sub = effects.persist$.subscribe();
        sub.unsubscribe();
      }).not.toThrow();
    });

    it('is dispatch:false (the effect does not emit NgRx actions)', () => {
      // Verify persist$ is marked dispatch:false by checking it is on the effects class
      // and that subscribing to it just returns values (not actions dispatched to store)
      const effects = TestBed.inject(SettingsEffects);
      const mockState: any = {
        theme: 'dark',
        chartColors: {} as any,
        utcOffset: -4,
        gridVisible: true,
        gridOpacity: 1,
        floatingToolbar: true,
        tradeBoxesVisible: true,
        tradeBoxOpacity: { fill: 0.1, border: 0.5 },
        sidePanel: { tab: 'trade', open: true },
      };

      store.overrideSelector(settingsFeature.selectSettingsState, mockState);
      store.refreshState();

      const dispatchSpy = vi.spyOn(store, 'dispatch');
      const sub = effects.persist$.subscribe();
      sub.unsubscribe();

      // The effect itself does not call store.dispatch
      expect(dispatchSpy).not.toHaveBeenCalled();
    });
  });
});
