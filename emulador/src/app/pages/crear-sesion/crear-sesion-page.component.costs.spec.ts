import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CrearSesionPageComponent } from './crear-sesion-page.component';
import { WorkspacesActions } from '../../state/workspaces/workspaces.actions';
import { COST_PRESETS, ZERO_COSTS } from '../../state/trading/execution-costs';
import { series } from '../../testing/fixtures';
import { MarketDataRepository } from '../../domain/market-data.repository';
import { StorageManagerService } from '../storage-manager/storage-manager.service';
import type { DatasetRecord } from '../../services/market-data-db';

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

function makeRepoStub() {
  return {
    getCoverage: vi.fn(async () => ({ from: 1_700_000_000, to: 1_710_000_000 })),
    getCandles: vi.fn().mockResolvedValue(series(3)),
  };
}

function makeStorageManagerStub(datasets: DatasetRecord[]) {
  return { listDatasets: vi.fn().mockResolvedValue(datasets) };
}

describe('CrearSesionPageComponent — cost preset + override (RFC-014 T6b, G1)', () => {
  let store: MockStore;
  let dispatch: ReturnType<typeof vi.spyOn>;
  let component: CrearSesionPageComponent;

  function create(datasets: DatasetRecord[] = [dataset('XAUUSD', 'H1')]) {
    TestBed.configureTestingModule({
      providers: [
        CrearSesionPageComponent,
        provideMockStore(),
        { provide: Router, useValue: { navigateByUrl: vi.fn().mockResolvedValue(undefined) } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: { get: () => null } } },
        },
        { provide: MarketDataRepository, useValue: makeRepoStub() },
        { provide: StorageManagerService, useValue: makeStorageManagerStub(datasets) },
      ],
    });
    store = TestBed.inject(MockStore);
    dispatch = vi.spyOn(store, 'dispatch');
    component = TestBed.inject(CrearSesionPageComponent);
  }

  async function flush() {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  afterEach(() => {
    store.resetSelectors();
    TestBed.resetTestingModule();
  });

  it('resolves the preset for the picked symbol asset class (XAUUSD → Metales)', async () => {
    create([dataset('XAUUSD', 'H1')]);
    await flush();
    await component.pickR2Asset({ symbol: 'XAUUSD', tfs: ['H1'] });
    expect(component.costPreset()).toEqual({ ...COST_PRESETS.Metales, pointSize: 0.01 });
  });

  it('resolves the preset for a forex symbol (EURUSD → Forex)', async () => {
    create([dataset('EURUSD', 'H1')]);
    await flush();
    await component.pickR2Asset({ symbol: 'EURUSD', tfs: ['H1'] });
    expect(component.costPreset()).toEqual({ ...COST_PRESETS.Forex, pointSize: 0.00001 });
  });

  it('before any asset is picked, costPreset degrades to ZERO_COSTS (defensive)', async () => {
    create([]);
    await flush();
    expect(component.costPreset()).toEqual(ZERO_COSTS);
  });

  it('with no override, effectiveExecutionCosts equals the resolved preset', async () => {
    create([dataset('XAUUSD', 'H1')]);
    await flush();
    await component.pickR2Asset({ symbol: 'XAUUSD', tfs: ['H1'] });
    expect(component.effectiveExecutionCosts()).toEqual(component.costPreset());
  });

  it('overriding spread/commission/slippage round-trips into effectiveExecutionCosts', async () => {
    create([dataset('XAUUSD', 'H1')]);
    await flush();
    await component.pickR2Asset({ symbol: 'XAUUSD', tfs: ['H1'] });

    component.onSpreadOverride({ target: { value: '15' } } as unknown as Event);
    component.onCommissionOverride({ target: { value: '2.5' } } as unknown as Event);
    component.onSlippageOverride({ target: { value: '3' } } as unknown as Event);

    expect(component.effectiveExecutionCosts()).toEqual({
      spreadPoints: 15,
      commissionPerLot: 2.5,
      slippagePoints: 3,
      pointSize: component.costPreset().pointSize, // never user-editable (D14.D)
    });
  });

  it('a negative override falls back to the preset (sensible constraint)', async () => {
    create([dataset('XAUUSD', 'H1')]);
    await flush();
    await component.pickR2Asset({ symbol: 'XAUUSD', tfs: ['H1'] });

    component.onSpreadOverride({ target: { value: '-5' } } as unknown as Event);
    expect(component.effectiveExecutionCosts().spreadPoints).toBe(
      component.costPreset().spreadPoints,
    );
  });

  it('clearing an override input (empty string) reverts to the preset value', async () => {
    create([dataset('XAUUSD', 'H1')]);
    await flush();
    await component.pickR2Asset({ symbol: 'XAUUSD', tfs: ['H1'] });

    component.onSpreadOverride({ target: { value: '15' } } as unknown as Event);
    expect(component.effectiveExecutionCosts().spreadPoints).toBe(15);
    component.onSpreadOverride({ target: { value: '' } } as unknown as Event);
    expect(component.effectiveExecutionCosts().spreadPoints).toBe(
      component.costPreset().spreadPoints,
    );
  });

  it('picking a new asset resets any prior override', async () => {
    create([dataset('XAUUSD', 'H1'), dataset('EURUSD', 'H1')]);
    await flush();
    await component.pickR2Asset({ symbol: 'XAUUSD', tfs: ['H1'] });
    component.onSpreadOverride({ target: { value: '99' } } as unknown as Event);
    expect(component.effectiveExecutionCosts().spreadPoints).toBe(99);

    await component.pickR2Asset({ symbol: 'EURUSD', tfs: ['H1'] });
    expect(component.effectiveExecutionCosts()).toEqual(component.costPreset());
  });

  it('confirmR2 dispatches switchAsset with the effective executionCosts (default preset, no override)', async () => {
    create([dataset('XAUUSD', 'H1')]);
    await flush();
    await component.pickR2Asset({ symbol: 'XAUUSD', tfs: ['H1'] });
    await component.confirmR2();

    const action = dispatch.mock.calls[0][0] as ReturnType<typeof WorkspacesActions.switchAsset>;
    expect(action.executionCosts).toEqual({ ...COST_PRESETS.Metales, pointSize: 0.01 });
  });

  it('confirmR2 dispatches switchAsset with the OVERRIDDEN executionCosts when the user edited them', async () => {
    create([dataset('XAUUSD', 'H1')]);
    await flush();
    await component.pickR2Asset({ symbol: 'XAUUSD', tfs: ['H1'] });
    component.onSpreadOverride({ target: { value: '42' } } as unknown as Event);
    await component.confirmR2();

    const action = dispatch.mock.calls[0][0] as ReturnType<typeof WorkspacesActions.switchAsset>;
    expect(action.executionCosts).toEqual({
      ...COST_PRESETS.Metales,
      pointSize: 0.01,
      spreadPoints: 42,
    });
  });
});
