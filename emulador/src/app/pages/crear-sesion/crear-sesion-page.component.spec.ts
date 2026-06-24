import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CrearSesionPageComponent } from './crear-sesion-page.component';
import { WorkspacesActions } from '../../state/workspaces/workspaces.actions';
import { series } from '../../testing/fixtures';
import { MarketDataRepository } from '../../domain/market-data.repository';
import { StorageManagerService } from '../storage-manager/storage-manager.service';
import type { DatasetRecord } from '../../services/market-data-db';

const DESDE_H1 = 1_700_000_000;
const HASTA_H1 = 1_710_000_000;
const DESDE_D1 = 1_700_000_000;
const HASTA_D1 = 1_705_000_000; // narrower than H1 — drives the intersection

function dataset(symbol: string, timeframe: string): DatasetRecord {
  return {
    id: `${symbol}|${timeframe}|all`,
    symbol,
    timeframe,
    year: 'all',
    size: 100,
    etag: 'x',
    updatedAt: new Date().toISOString(),
  };
}

function makeRoute(symbol: string | null = null) {
  return {
    snapshot: {
      queryParamMap: {
        get: (k: string) => (k === 'symbol' ? symbol : null),
      },
    },
  };
}

function makeRepoStub(
  bounds: Partial<Record<string, { from: number; to: number }>> = {
    H1: { from: DESDE_H1, to: HASTA_H1 },
    D1: { from: DESDE_D1, to: HASTA_D1 },
  },
) {
  return {
    getCoverage: vi.fn(async (_symbol: string, tf: string) => bounds[tf] ?? null),
    getCandles: vi.fn().mockResolvedValue(series(3)),
  };
}

function makeStorageManagerStub(datasets: DatasetRecord[] = [dataset('XAUUSD', 'H1')]) {
  return { listDatasets: vi.fn().mockResolvedValue(datasets) };
}

describe('CrearSesionPageComponent (R2-only)', () => {
  let store: MockStore;
  let dispatch: ReturnType<typeof vi.spyOn>;
  let routerStub: { navigateByUrl: ReturnType<typeof vi.fn> };
  let component: CrearSesionPageComponent;

  function create(
    options: {
      routeSymbol?: string | null;
      datasets?: DatasetRecord[];
      repo?: ReturnType<typeof makeRepoStub>;
      storageManager?: ReturnType<typeof makeStorageManagerStub>;
    } = {},
  ) {
    routerStub = { navigateByUrl: vi.fn().mockResolvedValue(undefined) };

    TestBed.configureTestingModule({
      providers: [
        CrearSesionPageComponent,
        provideMockStore(),
        { provide: Router, useValue: routerStub },
        { provide: ActivatedRoute, useValue: makeRoute(options.routeSymbol ?? null) },
        { provide: MarketDataRepository, useValue: options.repo ?? makeRepoStub() },
        {
          provide: StorageManagerService,
          useValue: options.storageManager ?? makeStorageManagerStub(options.datasets),
        },
      ],
    });
    store = TestBed.inject(MockStore);
    dispatch = vi.spyOn(store, 'dispatch');
    component = TestBed.inject(CrearSesionPageComponent);
  }

  /**
   * Flushes the constructor's `loadR2Assets` microtask queue — deep enough
   * to cover the preselect path, which chains into `pickR2Asset`'s own
   * `Promise.all(getCoverage)` await.
   */
  async function flush() {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  // ---- loadR2Assets (constructor) ----

  it('discovers unique assets (anchors only) and sets state ok', async () => {
    create({
      datasets: [dataset('XAUUSD', 'H1'), dataset('XAUUSD', 'D1'), dataset('XAUUSD', 'M5')],
    });
    await flush();
    expect(component.state()).toBe('ok');
    expect(component.r2Assets()).toEqual([{ symbol: 'XAUUSD', tfs: ['H1', 'D1'] }]);
  });

  it('groups datasets by symbol and sorts assets alphabetically', async () => {
    create({ datasets: [dataset('EURUSD', 'H1'), dataset('XAUUSD', 'M1')] });
    await flush();
    expect(component.r2Assets().map((a) => a.symbol)).toEqual(['EURUSD', 'XAUUSD']);
  });

  it('shows empty state when no assets are downloaded', async () => {
    create({ datasets: [] });
    await flush();
    expect(component.r2Assets()).toEqual([]);
    expect(component.state()).toBe('ok');
  });

  it('preselects symbol from query param and goes to step 2', async () => {
    create({ routeSymbol: 'XAUUSD', datasets: [dataset('XAUUSD', 'H1')] });
    await flush();
    expect(component.r2Symbol()).toBe('XAUUSD');
    expect(component.step()).toBe(2);
  });

  it('does NOT jump to step 2 when preselect symbol not found', async () => {
    create({ routeSymbol: 'NOTFOUND', datasets: [dataset('XAUUSD', 'H1')] });
    await flush();
    expect(component.step()).toBe(1);
    expect(component.r2Symbol()).toBeNull();
  });

  it('sets r2Error and an empty asset list when listDatasets rejects', async () => {
    const storageManager = { listDatasets: vi.fn().mockRejectedValue(new Error('boom')) };
    create({ storageManager });
    await flush();
    expect(component.r2Error()).toBe('boom');
    expect(component.r2Assets()).toEqual([]);
    expect(component.state()).toBe('ok');
  });

  // ---- pickR2Asset ----

  it('pickR2Asset reads coverage per anchor and advances to step 2', async () => {
    create({ datasets: [dataset('XAUUSD', 'H1'), dataset('XAUUSD', 'D1')] });
    await flush();
    await component.pickR2Asset({ symbol: 'XAUUSD', tfs: ['H1', 'D1'] });

    expect(component.r2Symbol()).toBe('XAUUSD');
    expect(component.r2Tfs()).toEqual(['H1', 'D1']);
    expect(component.selectedTfs()).toEqual(new Set(['H1', 'D1']));
    expect(component.step()).toBe(2);
    expect(component.startDate()).not.toBe('');
  });

  it('pickR2Asset sets r2Error when getCoverage throws', async () => {
    const repo = {
      getCoverage: vi.fn().mockRejectedValue(new Error('no se pudo leer')),
      getCandles: vi.fn(),
    };
    create({ datasets: [dataset('XAUUSD', 'H1')], repo });
    await flush();
    await component.pickR2Asset({ symbol: 'XAUUSD', tfs: ['H1'] });

    expect(component.r2Error()).toBe('no se pudo leer');
    expect(component.r2Loading()).toBe(false);
  });

  // ---- dateRange / dateValid / endValid (R2 path, unconditional) ----

  it('dateRange is the intersection of the selected anchors bounds', async () => {
    create({ datasets: [dataset('XAUUSD', 'H1'), dataset('XAUUSD', 'D1')] });
    await flush();
    await component.pickR2Asset({ symbol: 'XAUUSD', tfs: ['H1', 'D1'] });

    expect(component.dateRange()).toEqual({ from: DESDE_D1, to: HASTA_D1 });
  });

  it('dateRange is null when no tfs are selected', async () => {
    create({ datasets: [dataset('XAUUSD', 'H1')] });
    await flush();
    await component.pickR2Asset({ symbol: 'XAUUSD', tfs: ['H1'] });
    component.toggleTf('H1'); // remove the only one
    expect(component.dateRange()).toBeNull();
  });

  it('dateValid is false when startDate is empty', async () => {
    create({ datasets: [dataset('XAUUSD', 'H1')] });
    await flush();
    await component.pickR2Asset({ symbol: 'XAUUSD', tfs: ['H1'] });
    component.startDate.set('');
    expect(component.dateValid()).toBe(false);
  });

  it('dateValid is true when startDate is inside the range', async () => {
    create({ datasets: [dataset('XAUUSD', 'H1')] });
    await flush();
    await component.pickR2Asset({ symbol: 'XAUUSD', tfs: ['H1'] });
    const mid = new Date((DESDE_H1 + (HASTA_H1 - DESDE_H1) / 2) * 1000).toISOString().slice(0, 10);
    component.startDate.set(mid);
    expect(component.dateValid()).toBe(true);
  });

  it('dateValid is false when startDate is before the range', async () => {
    create({ datasets: [dataset('XAUUSD', 'H1')] });
    await flush();
    await component.pickR2Asset({ symbol: 'XAUUSD', tfs: ['H1'] });
    component.startDate.set('1990-01-01');
    expect(component.dateValid()).toBe(false);
  });

  it('endValid is true when endDate is empty', async () => {
    create({ datasets: [dataset('XAUUSD', 'H1')] });
    await flush();
    await component.pickR2Asset({ symbol: 'XAUUSD', tfs: ['H1'] });
    component.endDate.set('');
    expect(component.endValid()).toBe(true);
  });

  it('endValid is false when endDate is before startDate', async () => {
    create({ datasets: [dataset('XAUUSD', 'H1')] });
    await flush();
    await component.pickR2Asset({ symbol: 'XAUUSD', tfs: ['H1'] });
    component.endDate.set('1990-01-01');
    expect(component.endValid()).toBe(false);
  });

  it('endValid is true when endDate is > start and within range', async () => {
    create({ datasets: [dataset('XAUUSD', 'H1')] });
    await flush();
    await component.pickR2Asset({ symbol: 'XAUUSD', tfs: ['H1'] });
    // one day before HASTA_H1 so 23:59:59 of that day still sits <= range.to
    const end = new Date((HASTA_H1 - 86400) * 1000).toISOString().slice(0, 10);
    const start = new Date((DESDE_H1 + 86400) * 1000).toISOString().slice(0, 10);
    component.startDate.set(start);
    component.endDate.set(end);
    expect(component.endValid()).toBe(true);
  });

  it('step2Valid is true when tfs>0 and dateValid and endValid', async () => {
    create({ datasets: [dataset('XAUUSD', 'H1')] });
    await flush();
    await component.pickR2Asset({ symbol: 'XAUUSD', tfs: ['H1'] });
    expect(component.step2Valid()).toBe(true);
  });

  // ---- next / back ----

  it('next moves from step 1 to 2 once an asset is picked', async () => {
    create({ datasets: [dataset('XAUUSD', 'H1')] });
    await flush();
    await component.pickR2Asset({ symbol: 'XAUUSD', tfs: ['H1'] });
    component.step.set(1);
    component.next();
    expect(component.step()).toBe(2);
  });

  it('next moves from step 2 to 3 when step2Valid', async () => {
    create({ datasets: [dataset('XAUUSD', 'H1')] });
    await flush();
    await component.pickR2Asset({ symbol: 'XAUUSD', tfs: ['H1'] });
    component.step.set(2);
    component.next();
    expect(component.step()).toBe(3);
  });

  it('back moves from step 2 to 1', async () => {
    create({ datasets: [dataset('XAUUSD', 'H1')] });
    await flush();
    component.step.set(2);
    component.back();
    expect(component.step()).toBe(1);
  });

  // ---- confirmR2 ----

  it('confirmR2 reads candles per selected tf and dispatches switchAsset', async () => {
    create({ datasets: [dataset('XAUUSD', 'H1'), dataset('XAUUSD', 'D1')] });
    await flush();
    await component.pickR2Asset({ symbol: 'XAUUSD', tfs: ['H1', 'D1'] });
    component.sessionName.set('Mi Sesión');
    await component.confirmR2();

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: '[Workspaces] Switch Asset',
        symbol: 'XAUUSD',
        thenNewSession: { name: 'Mi Sesión' },
        thenGoTo: expect.any(Number),
      }),
    );
    const action = dispatch.mock.calls[0][0] as ReturnType<typeof WorkspacesActions.switchAsset>;
    expect(Array.isArray(action.thenLoad)).toBe(true);
    expect(action.thenLoad!.map((p) => p.tf).sort()).toEqual(['D1', 'H1']);
    expect(routerStub.navigateByUrl).toHaveBeenCalledWith('/');
  });

  it('confirmR2 includes thenSessionEnd when endDate is set', async () => {
    create({ datasets: [dataset('XAUUSD', 'H1')] });
    await flush();
    await component.pickR2Asset({ symbol: 'XAUUSD', tfs: ['H1'] });
    const end = new Date(HASTA_H1 * 1000).toISOString().slice(0, 10);
    const start = new Date((DESDE_H1 + 86400) * 1000).toISOString().slice(0, 10);
    component.startDate.set(start);
    component.endDate.set(end);
    await component.confirmR2();

    const action = dispatch.mock.calls[0][0] as ReturnType<typeof WorkspacesActions.switchAsset>;
    expect(action.thenSessionEnd).toBeDefined();
    expect(typeof action.thenSessionEnd).toBe('number');
  });

  it('confirmR2 sets r2Error and does NOT navigate on getCandles failure', async () => {
    const repo = {
      getCoverage: vi.fn().mockResolvedValue({ from: DESDE_H1, to: HASTA_H1 }),
      getCandles: vi.fn().mockRejectedValue(new Error('boom')),
    };
    create({ datasets: [dataset('XAUUSD', 'H1')], repo });
    await flush();
    await component.pickR2Asset({ symbol: 'XAUUSD', tfs: ['H1'] });
    await component.confirmR2();

    expect(component.r2Error()).toBe('boom');
    expect(component.r2Loading()).toBe(false);
    expect(routerStub.navigateByUrl).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('confirmR2 does nothing while already loading', async () => {
    create({ datasets: [dataset('XAUUSD', 'H1')] });
    await flush();
    await component.pickR2Asset({ symbol: 'XAUUSD', tfs: ['H1'] });
    component.r2Loading.set(true);
    await component.confirmR2();
    expect(dispatch).not.toHaveBeenCalled();
  });
});
