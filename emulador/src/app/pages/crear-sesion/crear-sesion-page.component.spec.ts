import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CrearSesionPageComponent } from './crear-sesion-page.component';
import { BackendApiService } from '../../services/backend-api.service';
import { WorkspaceDbService } from '../../services/workspace-db.service';
import { WorkspacesActions } from '../../state/workspaces/workspaces.actions';
import { backendSymbol, tfCoverage, series, workspaceMeta } from '../../testing/fixtures';
import { workspaceDbStub } from '../../testing/workspace-db.stub';

const DESDE = 1_700_000_000;
const HASTA = 1_710_000_000;
const RANGE = HASTA - DESDE; // 10_000_000 seconds

function buildSymbol(velas = 1000) {
  return backendSymbol({
    name: 'XAUUSD',
    cobertura: [tfCoverage({ tf: 'H1', desde: DESDE, hasta: HASTA, velas })],
  });
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

function makeApiStub(
  downloadFn?: (
    s: string,
    tf: string,
    desde: unknown,
    onChunk: (c: unknown[]) => Promise<void>,
  ) => Promise<void>,
) {
  return {
    symbols: vi.fn().mockReturnValue(
      of({
        total: 1,
        symbols: [
          buildSymbol(),
          // symbol with no cobertura — should be filtered out
          backendSymbol({ name: 'EMPTY', cobertura: [] }),
        ],
      }),
    ),
    downloadChunked: downloadFn
      ? vi.fn(downloadFn)
      : vi.fn(
          async (
            _s: string,
            _tf: string,
            _desde: unknown,
            onChunk: (c: unknown[]) => Promise<void>,
          ) => {
            await onChunk(series(3));
          },
        ),
  };
}

describe('CrearSesionPageComponent', () => {
  let store: MockStore;
  let dispatch: ReturnType<typeof vi.spyOn>;
  let dbStub: ReturnType<typeof workspaceDbStub>;
  let routerStub: { navigateByUrl: ReturnType<typeof vi.fn> };
  let component: CrearSesionPageComponent;

  function create(
    options: {
      routeSymbol?: string | null;
      downloadFn?: Parameters<typeof makeApiStub>[0];
      dbOverride?: Partial<ReturnType<typeof workspaceDbStub>>;
    } = {},
  ) {
    dbStub = workspaceDbStub();
    if (options.dbOverride) Object.assign(dbStub, options.dbOverride);
    routerStub = { navigateByUrl: vi.fn().mockResolvedValue(undefined) };

    TestBed.configureTestingModule({
      providers: [
        CrearSesionPageComponent,
        provideMockStore(),
        { provide: BackendApiService, useValue: makeApiStub(options.downloadFn) },
        { provide: WorkspaceDbService, useValue: dbStub },
        { provide: Router, useValue: routerStub },
        { provide: ActivatedRoute, useValue: makeRoute(options.routeSymbol ?? null) },
      ],
    });
    store = TestBed.inject(MockStore);
    dispatch = vi.spyOn(store, 'dispatch');
    component = TestBed.inject(CrearSesionPageComponent);
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  // ---- constructor ----

  it('filters out symbols with empty cobertura and sets state ok', () => {
    create();
    expect(component.state()).toBe('ok');
    expect(component.symbols().every((s) => s.cobertura.length > 0)).toBe(true);
    expect(component.symbols().find((s) => s.name === 'EMPTY')).toBeUndefined();
  });

  it('preselects symbol from query param and goes to step 2', () => {
    create({ routeSymbol: 'XAUUSD' });
    expect(component.selected()?.name).toBe('XAUUSD');
    expect(component.step()).toBe(2);
  });

  it('does NOT jump to step 2 when preselect symbol not found', () => {
    create({ routeSymbol: 'NOTFOUND' });
    expect(component.step()).toBe(1);
    expect(component.selected()).toBeNull();
  });

  // ---- pickSymbol ----

  it('pickSymbol selects all tfs and sets a default date', () => {
    create();
    const sym = component.symbols()[0];
    component.pickSymbol(sym);
    expect(component.selected()).toBe(sym);
    expect(component.selectedTfs().has('H1')).toBe(true);
    expect(component.startDate()).not.toBe('');
  });

  it('defaultDate sets start at ~70% of the range', () => {
    create();
    component.pickSymbol(component.symbols()[0]);
    const t = DESDE + (HASTA - DESDE) * 0.7;
    const expected = new Date(t * 1000).toISOString().slice(0, 10);
    expect(component.startDate()).toBe(expected);
  });

  // ---- toggleTf ----

  it('toggleTf removes a selected tf', () => {
    create();
    component.pickSymbol(component.symbols()[0]);
    component.toggleTf('H1');
    expect(component.selectedTfs().has('H1')).toBe(false);
  });

  it('toggleTf adds tf back when deselected', () => {
    create();
    component.pickSymbol(component.symbols()[0]);
    component.toggleTf('H1');
    component.toggleTf('H1');
    expect(component.selectedTfs().has('H1')).toBe(true);
  });

  it('toggleTf re-defaults the date when it becomes invalid', () => {
    create();
    component.pickSymbol(component.symbols()[0]);
    // set an invalid date then toggle; the default should be reset
    component.startDate.set('1900-01-01');
    component.toggleTf('H1');
    // after removing the only tf, dateRange is null, date cleared
    expect(component.startDate()).toBe('');
  });

  // ---- dateRange ----

  it('dateRange is null when no tfs selected', () => {
    create();
    component.pickSymbol(component.symbols()[0]);
    component.toggleTf('H1'); // remove the only one
    expect(component.dateRange()).toBeNull();
  });

  it('dateRange is the intersection of selected tfs', () => {
    create();
    component.pickSymbol(component.symbols()[0]);
    const range = component.dateRange();
    expect(range).not.toBeNull();
    expect(range!.from).toBe(DESDE);
    expect(range!.to).toBe(HASTA);
  });

  // ---- startEpoch / dateValid ----

  it('dateValid is false when startDate is empty', () => {
    create();
    component.pickSymbol(component.symbols()[0]);
    component.startDate.set('');
    expect(component.dateValid()).toBe(false);
  });

  it('dateValid is true when startDate is inside the range', () => {
    create();
    component.pickSymbol(component.symbols()[0]);
    // a date whose UTC midnight sits strictly inside [DESDE, HASTA]
    const mid = new Date((DESDE + RANGE / 2) * 1000).toISOString().slice(0, 10);
    component.startDate.set(mid);
    expect(component.dateValid()).toBe(true);
  });

  it('dateValid is false when startDate is before the range', () => {
    create();
    component.pickSymbol(component.symbols()[0]);
    component.startDate.set('1990-01-01');
    expect(component.dateValid()).toBe(false);
  });

  // ---- endValid ----

  it('endValid is true when endDate is empty', () => {
    create();
    component.pickSymbol(component.symbols()[0]);
    component.endDate.set('');
    expect(component.endValid()).toBe(true);
  });

  it('endValid is true when endDate == startDate (a single-day session)', () => {
    // start is parsed at 00:00:00 and end at 23:59:59 of the same day, so the
    // end timestamp is still after the start: a one-day session is valid
    create();
    component.pickSymbol(component.symbols()[0]);
    const d = component.startDate();
    component.endDate.set(d);
    expect(component.endValid()).toBe(true);
  });

  it('endValid is false when endDate is before startDate', () => {
    create();
    component.pickSymbol(component.symbols()[0]);
    component.endDate.set('1990-01-01');
    expect(component.endValid()).toBe(false);
  });

  it('endValid is false when endDate is beyond the coverage range', () => {
    create();
    component.pickSymbol(component.symbols()[0]);
    component.endDate.set('2099-12-31');
    expect(component.endValid()).toBe(false);
  });

  it('endValid is true when endDate is > start and within range', () => {
    create();
    component.pickSymbol(component.symbols()[0]);
    // Use the last covered day
    const end = new Date(HASTA * 1000).toISOString().slice(0, 10);
    const start = new Date((DESDE + 86400) * 1000).toISOString().slice(0, 10);
    component.startDate.set(start);
    component.endDate.set(end);
    expect(component.endValid()).toBe(true);
  });

  // ---- step2Valid ----

  it('step2Valid is true when tfs>0 and dateValid and endValid', () => {
    create();
    component.pickSymbol(component.symbols()[0]);
    // startDate set by defaultDate — should be valid
    expect(component.step2Valid()).toBe(true);
  });

  // ---- progressPct ----

  it('progressPct is 0 when progress is null', () => {
    create();
    expect(component.progressPct()).toBe(0);
  });

  it('progressPct is 0 when total is 0', () => {
    create();
    component.progress.set({ loaded: 0, total: 0, tf: 'H1' });
    expect(component.progressPct()).toBe(0);
  });

  it('progressPct is clamped to 100', () => {
    create();
    component.progress.set({ loaded: 200, total: 100, tf: 'H1' });
    expect(component.progressPct()).toBe(100);
  });

  // ---- next / back ----

  it('next moves from step 1 to 2 when symbol selected', () => {
    create();
    component.pickSymbol(component.symbols()[0]);
    component.step.set(1);
    component.next();
    expect(component.step()).toBe(2);
  });

  it('next moves from step 2 to 3 when step2Valid', () => {
    create();
    component.pickSymbol(component.symbols()[0]);
    component.step.set(2);
    component.next();
    expect(component.step()).toBe(3);
  });

  it('back moves from step 2 to 1', () => {
    create();
    component.step.set(2);
    component.back();
    expect(component.step()).toBe(1);
  });

  it('back is blocked while downloading', () => {
    create();
    component.step.set(2);
    component.downloading.set(true);
    component.back();
    expect(component.step()).toBe(2);
  });

  // ---- confirm() — small fresh dataset (accumulate path) ----

  it('confirm() calls appendSeriesChunk per chunk and dispatches switchAsset with thenLoad', async () => {
    create();
    component.pickSymbol(component.symbols()[0]);
    component.sessionName.set('Mi Sesión');
    await component.confirm();

    expect(dbStub.appendSeriesChunk).toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: '[Workspaces] Switch Asset',
        symbol: 'XAUUSD',
        thenNewSession: { name: 'Mi Sesión' },
        thenGoTo: expect.any(Number),
      }),
    );
    // thenLoad should be an array (small dataset, accumulate=true)
    const action = dispatch.mock.calls[0][0] as ReturnType<typeof WorkspacesActions.switchAsset>;
    expect(Array.isArray(action.thenLoad)).toBe(true);
    expect(routerStub.navigateByUrl).toHaveBeenCalledWith('/');
  });

  it('confirm() includes thenSessionEnd when endDate is set', async () => {
    create();
    component.pickSymbol(component.symbols()[0]);
    const end = new Date(HASTA * 1000).toISOString().slice(0, 10);
    const start = new Date((DESDE + 86400) * 1000).toISOString().slice(0, 10);
    component.startDate.set(start);
    component.endDate.set(end);
    await component.confirm();

    const action = dispatch.mock.calls[0][0] as ReturnType<typeof WorkspacesActions.switchAsset>;
    expect(action.thenSessionEnd).toBeDefined();
    expect(typeof action.thenSessionEnd).toBe('number');
  });

  // ---- confirm() — resume path (getSeriesInfo returns data) ----

  it('confirm() resumes from stored lastTime and calls getMeta/putMeta', async () => {
    const stored = { lastTime: DESDE + 3600, count: 50 };
    create({
      dbOverride: {
        getSeriesInfo: vi.fn().mockResolvedValue(stored),
        getMeta: vi.fn().mockResolvedValue(workspaceMeta({ symbol: 'XAUUSD' })),
      },
    });
    component.pickSymbol(component.symbols()[0]);
    await component.confirm();

    // downloadChunked called with desde = lastTime + 1
    const downloadMock = TestBed.inject(BackendApiService).downloadChunked as ReturnType<
      typeof vi.fn
    >;
    expect(downloadMock).toHaveBeenCalledWith(
      'XAUUSD',
      'H1',
      stored.lastTime + 1,
      expect.any(Function),
    );
    expect(dbStub.putMeta).toHaveBeenCalled();
    // hydrateFromDb path: thenLoad is undefined
    const action = dispatch.mock.calls[0][0] as ReturnType<typeof WorkspacesActions.switchAsset>;
    expect(action.thenLoad).toBeUndefined();
  });

  // ---- confirm() — large dataset (>= 200k, hydrateFromDb path) ----

  it('confirm() uses hydrateFromDb path when total >= 200k', async () => {
    // Create a symbol with >= 200k velas
    const bigSymbol = backendSymbol({
      name: 'BIGASSET',
      cobertura: [tfCoverage({ tf: 'H1', desde: DESDE, hasta: HASTA, velas: 200_001 })],
    });
    const apiStub = {
      symbols: vi.fn().mockReturnValue(of({ total: 1, symbols: [bigSymbol] })),
      downloadChunked: vi.fn(
        async (
          _s: string,
          _tf: string,
          _desde: unknown,
          onChunk: (c: unknown[]) => Promise<void>,
        ) => {
          await onChunk(series(3));
        },
      ),
    };
    dbStub = workspaceDbStub();
    Object.assign(dbStub, {
      getMeta: vi.fn().mockResolvedValue(undefined), // no meta yet => newMeta path
    });
    TestBed.configureTestingModule({
      providers: [
        CrearSesionPageComponent,
        provideMockStore(),
        { provide: BackendApiService, useValue: apiStub },
        { provide: WorkspaceDbService, useValue: dbStub },
        { provide: Router, useValue: { navigateByUrl: vi.fn().mockResolvedValue(undefined) } },
        { provide: ActivatedRoute, useValue: makeRoute(null) },
      ],
    });
    store = TestBed.inject(MockStore);
    dispatch = vi.spyOn(store, 'dispatch');
    component = TestBed.inject(CrearSesionPageComponent);

    component.pickSymbol(component.symbols()[0]);
    await component.confirm();

    expect(dbStub.putMeta).toHaveBeenCalled();
    const action = dispatch.mock.calls[0][0] as ReturnType<typeof WorkspacesActions.switchAsset>;
    expect(action.thenLoad).toBeUndefined();
  });

  // ---- confirm() — download failure ----

  it('confirm() sets downloadError and does NOT navigate on failure', async () => {
    const failFn = vi.fn(async () => {
      throw new Error('network');
    });
    create({ downloadFn: failFn as any });
    component.pickSymbol(component.symbols()[0]);
    await component.confirm();

    expect(component.downloadError()).toContain('descargado');
    expect(component.downloading()).toBe(false);
    expect(component.progress()).toBeNull();
    expect(routerStub.navigateByUrl).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });
});
