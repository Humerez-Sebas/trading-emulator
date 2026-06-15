import { TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MercadosPageComponent } from './mercados-page.component';
import { BackendApiService } from '../../services/backend-api.service';
import { UserSymbolsActions } from '../../state/user-symbols/user-symbols.actions';
import { userSymbolsFeature } from '../../state/user-symbols/user-symbols.reducer';
import { backendSymbol, tfCoverage } from '../../testing/fixtures';

function makeApiStub(result: 'ok' | 'error' = 'ok') {
  const symbols = [
    backendSymbol({ name: 'XAUUSD', descripcion: 'Oro', categoria: 'Metales' }),
    backendSymbol({
      name: 'EURUSD',
      descripcion: 'Euro Dolar',
      categoria: 'Forex',
      cobertura: [tfCoverage({ tf: 'H1', velas: 1200000 })],
    }),
    backendSymbol({ name: 'GBPUSD', descripcion: 'Libra Dolar', categoria: 'Forex' }),
  ];
  return {
    symbols: vi
      .fn()
      .mockReturnValue(
        result === 'ok'
          ? of({ total: symbols.length, symbols })
          : throwError(() => new Error('network error')),
      ),
  };
}

describe('MercadosPageComponent', () => {
  let component: MercadosPageComponent;
  let store: MockStore;
  let dispatch: ReturnType<typeof vi.spyOn>;

  function create(result: 'ok' | 'error' = 'ok', selected: string[] = []) {
    const apiStub = makeApiStub(result);
    TestBed.configureTestingModule({
      providers: [
        MercadosPageComponent,
        provideMockStore(),
        { provide: BackendApiService, useValue: apiStub },
      ],
    });
    store = TestBed.inject(MockStore);
    store.overrideSelector(userSymbolsFeature.selectSymbols, selected);
    store.refreshState();
    dispatch = vi.spyOn(store, 'dispatch');
    component = TestBed.inject(MercadosPageComponent);
  }

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('sets state to "ok" and populates symbols on success', () => {
    create('ok');
    expect(component.state()).toBe('ok');
    expect(component.symbols()).toHaveLength(3);
  });

  it('dispatches UserSymbolsActions.load on init', () => {
    create('ok');
    expect(dispatch).toHaveBeenCalledWith(UserSymbolsActions.load());
  });

  describe('selection', () => {
    it('isSelected reflects the curated set', () => {
      create('ok', ['XAUUSD']);
      expect(component.isSelected('XAUUSD')).toBe(true);
      expect(component.isSelected('EURUSD')).toBe(false);
    });

    it('toggleSelected dispatches an optimistic toggle', () => {
      create('ok');
      component.toggleSelected('EURUSD');
      expect(dispatch).toHaveBeenCalledWith(UserSymbolsActions.toggle({ symbol: 'EURUSD' }));
    });

    it('"mis" mode filters to the selection; "todos" shows all', () => {
      create('ok', ['XAUUSD']);
      expect(component.filtered()).toHaveLength(3);
      component.setMode('mis');
      expect(component.filtered().map((s) => s.name)).toEqual(['XAUUSD']);
      component.setMode('todos');
      expect(component.filtered()).toHaveLength(3);
    });

    it('"mis" mode + search both apply', () => {
      create('ok', ['XAUUSD', 'EURUSD']);
      component.setMode('mis');
      component.query.set('eur');
      expect(component.filtered().map((s) => s.name)).toEqual(['EURUSD']);
    });
  });

  it('sets state to "error" on API failure', () => {
    create('error');
    expect(component.state()).toBe('error');
    expect(component.symbols()).toHaveLength(0);
  });

  describe('filtered', () => {
    beforeEach(() => create('ok'));

    it('returns all symbols when query is empty', () => {
      expect(component.filtered()).toHaveLength(3);
    });

    it('filters by name (case-insensitive)', () => {
      component.query.set('xau');
      expect(component.filtered()).toHaveLength(1);
      expect(component.filtered()[0].name).toBe('XAUUSD');
    });

    it('filters by descripcion (case-insensitive)', () => {
      component.query.set('oro');
      expect(component.filtered()).toHaveLength(1);
      expect(component.filtered()[0].name).toBe('XAUUSD');
    });

    it('returns empty when nothing matches', () => {
      component.query.set('zzz');
      expect(component.filtered()).toHaveLength(0);
    });
  });

  describe('groups', () => {
    beforeEach(() => create('ok'));

    it('groups symbols by categoria', () => {
      const groups = component.groups();
      const categories = groups.map((g) => g.category).sort();
      expect(categories).toEqual(['Forex', 'Metales']);
      const forex = groups.find((g) => g.category === 'Forex')!;
      expect(forex.items).toHaveLength(2);
    });

    it('reflects filtered results', () => {
      component.query.set('oro');
      const groups = component.groups();
      expect(groups).toHaveLength(1);
      expect(groups[0].category).toBe('Metales');
    });
  });

  describe('rangeLabel', () => {
    beforeEach(() => create('ok'));

    it('formats desde/hasta as localized date range', () => {
      const label = component.rangeLabel(1700006400, 1718236800);
      expect(label).toContain('–');
      // just check it's non-empty and contains a separator
      expect(label.length).toBeGreaterThan(5);
    });
  });

  describe('compactCount', () => {
    beforeEach(() => create('ok'));

    it('formats 1.2M correctly', () => {
      expect(component.compactCount(1_200_000)).toBe('1.2M');
    });

    it('formats 12k correctly', () => {
      expect(component.compactCount(12_000)).toBe('12k');
    });

    it('formats numbers below 1000 as-is', () => {
      expect(component.compactCount(999)).toBe('999');
    });
  });

  describe('coverageSummary', () => {
    beforeEach(() => create('ok'));

    it('rolls up TF count, the date envelope and total velas', () => {
      const cobertura = [
        tfCoverage({ tf: 'M1', desde: 100, hasta: 900, velas: 1000 }),
        tfCoverage({ tf: 'H1', desde: 200, hasta: 800, velas: 50 }),
      ];
      expect(component.coverageSummary(cobertura)).toEqual({
        tfCount: 2,
        desde: 100, // earliest start across TFs
        hasta: 900, // latest end across TFs
        totalVelas: 1050,
      });
    });
  });

  describe('tfTooltip', () => {
    beforeEach(() => create('ok'));

    it('includes the TF, a separator and a compact velas count', () => {
      const tip = component.tfTooltip(tfCoverage({ tf: 'M1', velas: 1_200_000 }));
      expect(tip).toContain('M1');
      expect(tip).toContain('·');
      expect(tip).toContain('1.2M velas');
    });
  });
});
