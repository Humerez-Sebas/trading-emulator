import { TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MercadosPageComponent } from './mercados-page.component';
import { BackendApiService } from '../../services/backend-api.service';
import { UserSymbolsActions } from '../../state/user-symbols/user-symbols.actions';
import { userSymbolsFeature } from '../../state/user-symbols/user-symbols.reducer';
import { backendSymbol, tfCoverage } from '../../testing/fixtures';
import { workspaceDbStub } from '../../testing/workspace-db.stub';
import { WorkspaceDbService } from '../../services/workspace-db.service';
import { DialogService } from '../../components/ui/dialog.service';
import { authFeature } from '../../state/auth/auth.reducer';
import { OfflineSymbol } from '../../services/offline-catalog';
import { environment } from '../../../environments/environment';

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
    // These tests cover the csv/backend Markets branch; force that data source
    // (dev env defaults to 'r2', which renders the separate R2 hub component).
    environment.dataSource = 'csv';
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

  const originalDataSource = environment.dataSource;
  afterEach(() => {
    environment.dataSource = originalDataSource;
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

// ---------------------------------------------------------------------------
// Offline / guest mode
// ---------------------------------------------------------------------------

const catalogEntry: OfflineSymbol = {
  symbol: 'XAUUSD',
  descripcion: 'Oro (CSV)',
  categoria: 'Mis CSV',
  coverage: [{ tf: 'H1', desde: 1_700_000_000, hasta: 1_710_000_000, velas: 1000 }],
  createdAt: 1,
  lastModified: 1,
};

describe('MercadosPageComponent (offline)', () => {
  let component: MercadosPageComponent;
  let store: MockStore;
  let dbStub: ReturnType<typeof workspaceDbStub>;
  let dialogStub: { confirm: ReturnType<typeof vi.fn> };

  function createOffline(listResult: OfflineSymbol[] = [catalogEntry]) {
    // Offline/guest is a csv-branch concern; force it (dev env defaults to 'r2').
    environment.dataSource = 'csv';
    dbStub = workspaceDbStub();
    (dbStub.listSymbols as ReturnType<typeof vi.fn>).mockResolvedValue(listResult);
    dialogStub = { confirm: vi.fn().mockResolvedValue(true) };

    const apiStub = { symbols: vi.fn().mockReturnValue(of({ total: 0, symbols: [] })) };

    TestBed.configureTestingModule({
      providers: [
        MercadosPageComponent,
        provideMockStore(),
        { provide: BackendApiService, useValue: apiStub },
        { provide: WorkspaceDbService, useValue: dbStub },
        { provide: DialogService, useValue: dialogStub },
      ],
    });

    store = TestBed.inject(MockStore);
    // Override auth status to 'guest' BEFORE constructing the component so that
    // the constructor's offline() computed reads true from the start.
    store.overrideSelector(authFeature.selectStatus, 'guest');
    store.overrideSelector(userSymbolsFeature.selectSymbols, []);
    store.refreshState();

    component = TestBed.inject(MercadosPageComponent);
  }

  const originalDataSource = environment.dataSource;
  afterEach(() => {
    environment.dataSource = originalDataSource;
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('loads symbols from the catalog and maps them to cards', async () => {
    createOffline([catalogEntry]);
    // Wait for the async listSymbols promise to resolve
    await Promise.resolve();

    expect(component.offline()).toBe(true);
    expect(component.symbols()).toHaveLength(1);
    expect(component.symbols()[0].name).toBe('XAUUSD');
    expect(component.symbols()[0].categoria).toBe('Mis CSV');
  });

  it('removeSymbol cascades and reloads the catalog after confirm', async () => {
    createOffline([catalogEntry]);
    // Wait for initial load to settle
    await Promise.resolve();

    // Prepare fresh catalog after deletion (empty list after remove)
    (dbStub.listSymbols as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await component.remove('XAUUSD');

    expect(dialogStub.confirm).toHaveBeenCalledOnce();
    expect(dbStub.removeSymbol).toHaveBeenCalledWith('XAUUSD');
    // listSymbols should have been called at least twice: initial load + reload after delete
    expect(dbStub.listSymbols).toHaveBeenCalledTimes(2);
    // After reload, symbols list is empty
    await Promise.resolve();
    expect(component.symbols()).toHaveLength(0);
  });
});
