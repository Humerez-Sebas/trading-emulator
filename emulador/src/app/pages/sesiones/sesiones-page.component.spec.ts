import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SesionesPageComponent, SessionCard } from './sesiones-page.component';
import { WorkspaceDbService } from '../../services/workspace-db.service';
import { TradingActions } from '../../state/trading/trading.actions';
import { ReplayActions } from '../../state/replay/replay.actions';
import { WorkspacesActions } from '../../state/workspaces/workspaces.actions';
import {
  selectCurrentAsset,
  selectCurrentTime,
  selectTradingData,
  selectSavedSessions,
} from '../../state/selectors';
import { authFeature } from '../../state/auth/auth.reducer';
import { workspaceDbStub } from '../../testing/workspace-db.stub';
import { workspaceMeta, savedSession, closed } from '../../testing/fixtures';
import { defaultTradingData, SessionFolder, TradingData } from '../../state/trading/trading.models';
import { DialogService } from '../../components/ui/dialog.service';
import { SessionService } from '../../services/session.service';
import { SessionSyncService } from '../../services/session-sync.service';
import { SessionSummary } from '../../services/session-sync.models';
import { MarketDataRepository } from '../../domain/market-data.repository';
import { DataOnboardingService } from '../../services/market-data/data-onboarding.service';
import { ManifestService } from '../../services/market-data/manifest.service';
import type { DatasetRecord } from '../../services/market-data-db';

function dataset(p: Partial<DatasetRecord> = {}): DatasetRecord {
  return {
    id: 'XAUUSD|M1|2024',
    symbol: 'XAUUSD',
    timeframe: 'M1',
    year: '2024',
    size: 0,
    etag: '',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...p,
  };
}

function card(p: Partial<SessionCard> = {}): SessionCard {
  return {
    id: 's1',
    symbol: 'XAUUSD',
    name: 'Sesión',
    trades: 0,
    balance: 10000,
    initialBalance: 10000,
    pnl: 0,
    createdAt: 1,
    cursor: 0,
    active: false,
    folderId: null,
    equity: [10000],
    ...p,
  };
}

function folder(p: Partial<SessionFolder> = {}): SessionFolder {
  return { id: 'f1', name: 'Estrategia A', order: 0, ...p };
}

function summary(p: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: 'cloud-1',
    name: 'Sesión nube',
    symbol: 'XAUUSD',
    folderId: null,
    schemaVersion: 1,
    updatedAt: '2024-01-01T00:00:00.000Z',
    lastOpenedAt: null,
    requiredDatasets: [],
    tradeCount: 3,
    initialBalance: 10000,
    balance: 10500,
    cursor: 100,
    sparkline: [10000, 10200, 10500],
    ...p,
  };
}

describe('SesionesPageComponent', () => {
  let store: MockStore;
  let dispatch: ReturnType<typeof vi.spyOn>;
  let dbStub: ReturnType<typeof workspaceDbStub>;
  let routerStub: { navigateByUrl: ReturnType<typeof vi.fn> };
  let dialogsStub: {
    prompt: ReturnType<typeof vi.fn>;
    confirm: ReturnType<typeof vi.fn>;
    deleteSession: ReturnType<typeof vi.fn>;
  };
  let repoStub: { getCandles: ReturnType<typeof vi.fn> };
  let onboardingStub: { runJobs: ReturnType<typeof vi.fn> };
  let manifestStub: { fetchManifest: ReturnType<typeof vi.fn> };
  let syncStub: { listSummaries: ReturnType<typeof vi.fn>; fetchPayload: ReturnType<typeof vi.fn> };
  let component: SesionesPageComponent;

  function create(
    opts: {
      db?: Partial<ReturnType<typeof workspaceDbStub>>;
      currentAsset?: string | null;
      currentTime?: number;
      liveTrading?: TradingData;
      liveSessions?: ReturnType<typeof savedSession>[];
      repo?: Partial<{ getCandles: ReturnType<typeof vi.fn> }>;
      onboarding?: Partial<{ runJobs: ReturnType<typeof vi.fn> }>;
      manifest?: Partial<{ fetchManifest: ReturnType<typeof vi.fn> }>;
      sync?: Partial<{
        listSummaries: ReturnType<typeof vi.fn>;
        fetchPayload: ReturnType<typeof vi.fn>;
      }>;
      authStatus?: 'unknown' | 'authenticated' | 'anonymous' | 'offline' | 'guest';
    } = {},
  ) {
    dbStub = workspaceDbStub();
    if (opts.db) Object.assign(dbStub, opts.db);
    routerStub = { navigateByUrl: vi.fn().mockResolvedValue(undefined) };
    // Default: every dialog resolves to "cancelled" — tests opt in per case.
    dialogsStub = {
      prompt: vi.fn().mockResolvedValue(null),
      confirm: vi.fn().mockResolvedValue(false),
      deleteSession: vi.fn().mockResolvedValue(false),
    };
    repoStub = { getCandles: vi.fn().mockResolvedValue([]), ...opts.repo };
    onboardingStub = { runJobs: vi.fn().mockResolvedValue(undefined), ...opts.onboarding };
    manifestStub = {
      fetchManifest: vi.fn().mockResolvedValue({ version: 1, symbols: {} }),
      ...opts.manifest,
    };
    syncStub = {
      listSummaries: vi.fn().mockResolvedValue([]),
      fetchPayload: vi.fn().mockResolvedValue(undefined),
      ...opts.sync,
    };

    TestBed.configureTestingModule({
      providers: [
        SesionesPageComponent,
        provideMockStore(),
        { provide: WorkspaceDbService, useValue: dbStub },
        { provide: Router, useValue: routerStub },
        { provide: DialogService, useValue: dialogsStub },
        { provide: MarketDataRepository, useValue: repoStub },
        { provide: DataOnboardingService, useValue: onboardingStub },
        { provide: ManifestService, useValue: manifestStub },
        { provide: SessionSyncService, useValue: syncStub },
      ],
    });

    store = TestBed.inject(MockStore);
    store.overrideSelector(selectCurrentAsset, opts.currentAsset ?? null);
    store.overrideSelector(selectCurrentTime, opts.currentTime ?? 0);
    store.overrideSelector(selectTradingData, opts.liveTrading ?? defaultTradingData());
    store.overrideSelector(selectSavedSessions, opts.liveSessions ?? []);
    store.overrideSelector(authFeature.selectStatus, opts.authStatus ?? 'anonymous');
    store.refreshState();

    dispatch = vi.spyOn(store, 'dispatch');
    component = TestBed.inject(SesionesPageComponent);
  }

  /** Lets the constructor's async reload() settle. */
  async function settle() {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  }

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  // ---- reload ----

  it('reload populates metas + folders and sets state ok', async () => {
    const meta = workspaceMeta({ symbol: 'XAUUSD' });
    create({
      db: {
        listMetas: vi.fn().mockResolvedValue([meta]),
        listFolders: vi.fn().mockResolvedValue([folder()]),
      },
    });
    await settle();
    expect(component.state()).toBe('ok');
    expect(component.folders()).toHaveLength(1);
    expect(component.total()).toBe(1); // one active session card
  });

  it('reload tolerates a db error (empty lists, still ok)', async () => {
    create({ db: { listMetas: vi.fn().mockRejectedValue(new Error('boom')) } });
    await settle();
    expect(component.state()).toBe('ok');
    expect(component.total()).toBe(0);
  });

  // ---- cloud sync (Task 11) ----

  it('authenticated + a cloud-only summary -> appends a cloud card (sparkline equity, cloudOnly)', async () => {
    const cloudSummary = summary({ id: 'cloud-1', requiredDatasets: [] });
    create({
      authStatus: 'authenticated',
      sync: { listSummaries: vi.fn().mockResolvedValue([cloudSummary]) },
    });
    await settle();

    expect(component.syncState()).toBe('synced');
    const cloudCard = component
      .groups()
      .flatMap((g) => g.cards)
      .find((c) => c.id === 'cloud-1');
    expect(cloudCard).toBeTruthy();
    expect(cloudCard!.cloudOnly).toBe(true);
    expect(cloudCard!.equity).toEqual(cloudSummary.sparkline);
  });

  it('a cloud summary whose id matches a local session does not duplicate the card', async () => {
    const local = savedSession({ id: 'dup-1', name: 'Local' });
    const meta = workspaceMeta({ symbol: 'XAUUSD', sessions: [local] });
    const cloudSummary = summary({ id: 'dup-1', name: 'Nube' });
    create({
      authStatus: 'authenticated',
      db: { listMetas: vi.fn().mockResolvedValue([meta]) },
      sync: { listSummaries: vi.fn().mockResolvedValue([cloudSummary]) },
    });
    await settle();

    const matches = component
      .groups()
      .flatMap((g) => g.cards)
      .filter((c) => c.id === 'dup-1');
    expect(matches).toHaveLength(1);
    expect(matches[0].name).toBe('Local'); // local wins
  });

  it('needsDownload is false when the required dataset is present locally', async () => {
    const hasIt = summary({
      id: 'has-1',
      requiredDatasets: [{ symbol: 'XAUUSD', timeframe: 'H1' }],
    });
    create({
      authStatus: 'authenticated',
      db: {
        listDatasets: vi.fn().mockResolvedValue([
          {
            id: 'XAUUSD|H1|all',
            symbol: 'XAUUSD',
            timeframe: 'H1',
            year: 'all',
            size: 0,
            etag: '',
            updatedAt: '',
          },
        ]),
      },
      sync: { listSummaries: vi.fn().mockResolvedValue([hasIt]) },
    });
    await settle();

    const cards = component.groups().flatMap((g) => g.cards);
    expect(cards.find((c) => c.id === 'has-1')!.needsDownload).toBe(false);
  });

  it('needsDownload is true when the required dataset is absent from the local cache', async () => {
    const needsIt = summary({
      id: 'needs-2',
      requiredDatasets: [{ symbol: 'XAUUSD', timeframe: 'M1', year: 2024 }],
    });
    create({
      authStatus: 'authenticated',
      db: { listDatasets: vi.fn().mockResolvedValue([]) },
      sync: { listSummaries: vi.fn().mockResolvedValue([needsIt]) },
    });
    await settle();

    const cards = component.groups().flatMap((g) => g.cards);
    expect(cards.find((c) => c.id === 'needs-2')!.needsDownload).toBe(true);
  });

  it('not authenticated -> listSummaries is not called, syncState is local, no cloud cards', async () => {
    const listSummaries = vi.fn().mockResolvedValue([summary()]);
    create({ authStatus: 'anonymous', sync: { listSummaries } });
    await settle();

    expect(listSummaries).not.toHaveBeenCalled();
    expect(component.syncState()).toBe('local');
    expect(
      component
        .groups()
        .flatMap((g) => g.cards)
        .some((c) => c.cloudOnly),
    ).toBe(false);
  });

  it('listSummaries rejects -> syncState is offline and the local list still renders', async () => {
    const meta = workspaceMeta({ symbol: 'XAUUSD' });
    create({
      authStatus: 'authenticated',
      db: { listMetas: vi.fn().mockResolvedValue([meta]) },
      sync: { listSummaries: vi.fn().mockRejectedValue(new Error('offline')) },
    });
    await settle();

    expect(component.syncState()).toBe('offline');
    expect(component.total()).toBe(1); // local active card still rendered
  });

  // ---- grouping ----

  it('groups by folder by default; unknown/none folders fall to "Sin carpeta"', async () => {
    const inFolder = savedSession({
      id: 's1',
      name: 'En carpeta',
      createdAt: 200,
      trading: { ...defaultTradingData(), folderId: 'f1' },
    });
    const orphan = savedSession({
      id: 's2',
      name: 'Huérfana',
      createdAt: 100,
      trading: { ...defaultTradingData(), folderId: 'ghost' },
    });
    const meta = workspaceMeta({
      symbol: 'EURUSD',
      sessions: [inFolder, orphan],
      lastModified: 300,
    });
    create({
      db: {
        listMetas: vi.fn().mockResolvedValue([meta]),
        listFolders: vi.fn().mockResolvedValue([folder()]),
      },
    });
    await settle();

    const groups = component.groups();
    expect(groups.map((g) => g.label)).toEqual(['Estrategia A', 'Sin carpeta']);
    expect(groups[0].cards.map((c) => c.name)).toEqual(['En carpeta']);
    // the active card + the orphan (ghost folder) land in "Sin carpeta"
    expect(groups[1].cards.map((c) => c.name).sort()).toEqual(['Huérfana', 'Sesión en curso']);
  });

  it('active card sorts before archived within a group', async () => {
    const arch = savedSession({ id: 's1', name: 'Vieja', createdAt: 100 });
    const meta = workspaceMeta({ symbol: 'EURUSD', sessions: [arch], lastModified: 50 });
    create({ db: { listMetas: vi.fn().mockResolvedValue([meta]) } });
    await settle();
    const none = component.groups().find((g) => g.label === 'Sin carpeta')!;
    expect(none.cards[0].active).toBe(true);
  });

  it('groups by asset when groupBy = activo', async () => {
    const mXau = workspaceMeta({ symbol: 'XAUUSD' });
    const mUs = workspaceMeta({ symbol: 'US30' });
    create({ db: { listMetas: vi.fn().mockResolvedValue([mXau, mUs]) } });
    await settle();
    component.setGroupBy('activo');
    expect(component.groups().map((g) => g.label)).toEqual(['US30', 'XAUUSD']);
  });

  it('uses LIVE NgRx state for the current asset, DB meta for others', async () => {
    const liveTrading: TradingData = {
      ...defaultTradingData(),
      sessionName: 'Vivo',
      balance: 12345,
    };
    const mXau = workspaceMeta({ symbol: 'XAUUSD' });
    create({
      currentAsset: 'XAUUSD',
      currentTime: 999,
      liveTrading,
      db: { listMetas: vi.fn().mockResolvedValue([mXau]) },
    });
    await settle();
    const activeCard = component.groups()[0].cards[0];
    expect(activeCard.name).toBe('Vivo');
    expect(activeCard.balance).toBe(12345);
    expect(activeCard.cursor).toBe(999);
  });

  // ---- search ----

  it('search filters by session name or symbol', async () => {
    const meta = workspaceMeta({
      symbol: 'US30',
      sessions: [savedSession({ id: 's1', name: 'Breakout' })],
      lastModified: 10,
    });
    create({ db: { listMetas: vi.fn().mockResolvedValue([meta]) } });
    await settle();
    component.search.set('breakout');
    expect(component.total()).toBe(2); // total ignores search
    const shown = component.groups().flatMap((g) => g.cards);
    expect(shown.map((c) => c.name)).toEqual(['Breakout']);
    component.search.set('us30');
    expect(component.groups().flatMap((g) => g.cards).length).toBe(2);
  });

  // ---- equity preview ----

  it('sparkPoints returns "" for <2 points and a polyline otherwise', () => {
    create();
    expect(component.sparkPoints([10000])).toBe('');
    const pts = component.sparkPoints([10000, 10100, 9900]);
    expect(pts.split(' ')).toHaveLength(3);
  });

  it('builds an equity curve from the closed-trade history', async () => {
    const t: TradingData = {
      ...defaultTradingData(),
      history: [
        closed({ id: 'a', closeTime: 2, profit: 100 }),
        closed({ id: 'b', closeTime: 1, profit: -50 }),
      ],
      balance: 10050,
    };
    const meta = workspaceMeta({ symbol: 'EURUSD', trading: t });
    create({ db: { listMetas: vi.fn().mockResolvedValue([meta]) } });
    await settle();
    const c = component.groups()[0].cards[0];
    // chronological: 10000 -> 9950 (-50) -> 10050 (+100)
    expect(c.equity).toEqual([10000, 9950, 10050]);
    expect(c.pnl).toBe(50);
  });

  // ---- open ----

  it('open: current asset + archived → switchSession + goToTime, navigates', async () => {
    create({ currentAsset: 'XAUUSD' });
    await settle();
    component.open(card({ symbol: 'XAUUSD', id: 's1', cursor: 500 }));
    expect(dispatch).toHaveBeenCalledWith(
      TradingActions.switchSession({ id: 's1', currentCursor: 0 }),
    );
    expect(dispatch).toHaveBeenCalledWith(ReplayActions.goToTime({ time: 500 }));
    expect(routerStub.navigateByUrl).toHaveBeenCalledWith('/');
  });

  it('open: current asset + active card just navigates', async () => {
    create({ currentAsset: 'XAUUSD' });
    await settle();
    component.open(card({ symbol: 'XAUUSD', id: null }));
    expect(dispatch).not.toHaveBeenCalled();
    expect(routerStub.navigateByUrl).toHaveBeenCalledWith('/');
  });

  it('open: other asset → switchAsset({thenOpenSession})', async () => {
    create({ currentAsset: 'US30' });
    await settle();
    component.open(card({ symbol: 'XAUUSD', id: 's1' }));
    expect(dispatch).toHaveBeenCalledWith(
      WorkspacesActions.switchAsset({ symbol: 'XAUUSD', thenOpenSession: 's1' }),
    );
  });

  it('open: a cloud-only card fetches the payload before running the restore flow', async () => {
    const payload = {
      schemaVersion: 1,
      trading: defaultTradingData(),
      currentTime: 250,
      activeTf: null,
      customTfMinutes: null,
      playbackSpeed: 1,
      drawings: [],
      notes: [],
      selectedTfs: [],
      startRange: 0,
      endRange: 0,
      requiredDatasets: [],
    };
    const fetchPayload = vi.fn().mockResolvedValue(payload);
    const putMeta = vi.fn().mockResolvedValue(undefined);
    create({
      currentAsset: 'US30',
      db: { getMeta: vi.fn().mockResolvedValue(undefined), putMeta },
      sync: { fetchPayload },
    });
    await settle();

    await component.open(card({ symbol: 'XAUUSD', id: 'cloud-1', cloudOnly: true }));

    expect(fetchPayload).toHaveBeenCalledWith('cloud-1');
    expect(putMeta).toHaveBeenCalled();
    // once locally materialized, the existing other-asset open flow runs
    expect(dispatch).toHaveBeenCalledWith(
      WorkspacesActions.switchAsset({ symbol: 'XAUUSD', thenOpenSession: 'cloud-1' }),
    );
  });

  it('open: a cloud-only card surfaces a Spanish error when the fetch fails (no restore dispatch)', async () => {
    const fetchPayload = vi.fn().mockRejectedValue(new Error('Network down'));
    create({ currentAsset: 'US30', sync: { fetchPayload } });
    await settle();

    await component.open(card({ symbol: 'XAUUSD', id: 'cloud-1', cloudOnly: true }));

    expect(component.importError()).toBe('Network down');
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: WorkspacesActions.switchAsset.type }),
    );
  });

  it('open: a cloud-only card with missing datasets opens the download modal instead of materializing immediately', async () => {
    const payload = {
      schemaVersion: 1,
      trading: defaultTradingData(),
      currentTime: 250,
      activeTf: null,
      customTfMinutes: null,
      playbackSpeed: 1,
      drawings: [],
      notes: [],
      selectedTfs: [],
      startRange: 0,
      endRange: 0,
      requiredDatasets: [{ symbol: 'XAUUSD', timeframe: 'M1', year: 2024 }],
    };
    const fetchPayload = vi.fn().mockResolvedValue(payload);
    const putMeta = vi.fn().mockResolvedValue(undefined);
    create({
      currentAsset: 'US30',
      db: {
        getMeta: vi.fn().mockResolvedValue(undefined),
        putMeta,
        listDatasets: vi.fn().mockResolvedValue([]), // nothing cached locally
      },
      sync: { fetchPayload },
    });
    await settle();

    await component.open(card({ symbol: 'XAUUSD', id: 'cloud-1', cloudOnly: true }));

    expect(fetchPayload).toHaveBeenCalledWith('cloud-1');
    expect(component.missing()).toEqual([{ symbol: 'XAUUSD', timeframe: 'M1', year: 2024 }]);
    // nothing materialized or opened yet — waiting on confirmDownload()
    expect(putMeta).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: WorkspacesActions.switchAsset.type }),
    );
  });

  it('open: confirming the download for a cloud-only card runs the R2 jobs, then materializes + opens', async () => {
    const payload = {
      schemaVersion: 1,
      trading: defaultTradingData(),
      currentTime: 250,
      activeTf: null,
      customTfMinutes: null,
      playbackSpeed: 1,
      drawings: [],
      notes: [],
      selectedTfs: [],
      startRange: 0,
      endRange: 0,
      requiredDatasets: [{ symbol: 'XAUUSD', timeframe: 'H1' }],
    };
    const fetchPayload = vi.fn().mockResolvedValue(payload);
    const putMeta = vi.fn().mockResolvedValue(undefined);
    create({
      currentAsset: 'US30',
      db: {
        getMeta: vi.fn().mockResolvedValue(undefined),
        putMeta,
        listDatasets: vi.fn().mockResolvedValue([]),
      },
      sync: { fetchPayload },
    });
    await settle();

    await component.open(card({ symbol: 'XAUUSD', id: 'cloud-1', cloudOnly: true }));
    expect(component.missing()).toHaveLength(1);

    await component.confirmDownload();

    expect(manifestStub.fetchManifest).toHaveBeenCalled();
    const [, jobs] = onboardingStub.runJobs.mock.calls[0];
    expect(jobs).toEqual([{ symbol: 'XAUUSD', tf: 'h1', year: 'all' }]);
    expect(component.missing()).toHaveLength(0); // modal closed
    expect(putMeta).toHaveBeenCalled(); // materialized after download
    expect(dispatch).toHaveBeenCalledWith(
      WorkspacesActions.switchAsset({ symbol: 'XAUUSD', thenOpenSession: 'cloud-1' }),
    );
  });

  it('open: a cloud-only card whose datasets are already cached opens directly, no modal', async () => {
    const payload = {
      schemaVersion: 1,
      trading: defaultTradingData(),
      currentTime: 250,
      activeTf: null,
      customTfMinutes: null,
      playbackSpeed: 1,
      drawings: [],
      notes: [],
      selectedTfs: [],
      startRange: 0,
      endRange: 0,
      requiredDatasets: [{ symbol: 'XAUUSD', timeframe: 'H1' }],
    };
    const fetchPayload = vi.fn().mockResolvedValue(payload);
    const putMeta = vi.fn().mockResolvedValue(undefined);
    create({
      currentAsset: 'US30',
      db: {
        getMeta: vi.fn().mockResolvedValue(undefined),
        putMeta,
        listDatasets: vi.fn().mockResolvedValue([
          {
            id: 'XAUUSD|H1|all',
            symbol: 'XAUUSD',
            timeframe: 'H1',
            year: 'all',
            size: 0,
            etag: '',
            updatedAt: '',
          },
        ]),
      },
      sync: { fetchPayload },
    });
    await settle();

    await component.open(card({ symbol: 'XAUUSD', id: 'cloud-1', cloudOnly: true }));

    expect(component.missing()).toHaveLength(0);
    expect(putMeta).toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(
      WorkspacesActions.switchAsset({ symbol: 'XAUUSD', thenOpenSession: 'cloud-1' }),
    );
  });

  // ---- rename ----

  it('rename current-asset active → setSessionName', async () => {
    create({ currentAsset: 'XAUUSD' });
    dialogsStub.prompt.mockResolvedValue('Nuevo');
    await settle();
    await component.rename(card({ symbol: 'XAUUSD', id: null }));
    expect(dispatch).toHaveBeenCalledWith(TradingActions.setSessionName({ name: 'Nuevo' }));
  });

  it('rename current-asset archived → renameSession', async () => {
    create({ currentAsset: 'XAUUSD' });
    dialogsStub.prompt.mockResolvedValue('Nuevo');
    await settle();
    await component.rename(card({ symbol: 'XAUUSD', id: 's1' }));
    expect(dispatch).toHaveBeenCalledWith(
      TradingActions.renameSession({ id: 's1', name: 'Nuevo' }),
    );
  });

  it('rename other-asset writes the meta directly', async () => {
    const meta = workspaceMeta({ symbol: 'EURUSD', sessions: [savedSession({ id: 's1' })] });
    const getMeta = vi.fn().mockResolvedValue(meta);
    const putMeta = vi.fn().mockResolvedValue(undefined);
    create({
      currentAsset: 'US30',
      db: { getMeta, putMeta, listMetas: vi.fn().mockResolvedValue([]) },
    });
    dialogsStub.prompt.mockResolvedValue('Nuevo');
    await settle();
    await component.rename(card({ symbol: 'EURUSD', id: 's1' }));
    expect(putMeta).toHaveBeenCalled();
  });

  it('rename cancelled (empty prompt) is a no-op', async () => {
    create({ currentAsset: 'XAUUSD' });
    dialogsStub.prompt.mockResolvedValue(null);
    await settle();
    await component.rename(card({ symbol: 'XAUUSD', id: null }));
    expect(dispatch).not.toHaveBeenCalled();
  });

  // ---- remove ----

  it('remove active card is a no-op', async () => {
    create({ currentAsset: 'XAUUSD' });
    await settle();
    await component.remove(card({ symbol: 'XAUUSD', id: null }));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('remove confirmed current-asset → deleteSession', async () => {
    create({ currentAsset: 'XAUUSD' });
    dialogsStub.deleteSession.mockResolvedValue(true);
    await settle();
    await component.remove(card({ symbol: 'XAUUSD', id: 's1' }));
    expect(dispatch).toHaveBeenCalledWith(TradingActions.deleteSession({ id: 's1' }));
  });

  it('remove cancelled is a no-op', async () => {
    create({ currentAsset: 'XAUUSD' });
    dialogsStub.deleteSession.mockResolvedValue(false);
    await settle();
    await component.remove(card({ symbol: 'XAUUSD', id: 's1' }));
    expect(dispatch).not.toHaveBeenCalled();
  });

  // ---- exportSession (archived card) ----

  it("exportSession (archived) derives anchorTimeframes + years from the symbol's local datasets, keeping M1 refs consistent", async () => {
    const session = savedSession({ id: 's1', name: 'Vieja' });
    const meta = workspaceMeta({ symbol: 'XAUUSD', sessions: [session] });
    create({
      currentAsset: 'US30', // not the live asset → archived/stored path
      db: {
        listMetas: vi.fn().mockResolvedValue([meta]),
        getMeta: vi.fn().mockResolvedValue(meta),
        listDatasets: vi.fn().mockResolvedValue([
          dataset({ id: 'XAUUSD|M1|2023', symbol: 'XAUUSD', timeframe: 'M1', year: '2023' }),
          dataset({ id: 'XAUUSD|M1|2024', symbol: 'XAUUSD', timeframe: 'M1', year: '2024' }),
          dataset({ id: 'XAUUSD|H1|all', symbol: 'XAUUSD', timeframe: 'H1', year: 'all' }),
          // a different symbol's M1 must not leak into XAUUSD's years
          dataset({ id: 'US30|M1|2099', symbol: 'US30', timeframe: 'M1', year: '2099' }),
        ]),
      },
    });
    await settle();

    const exportSpy = vi
      .spyOn(SessionService.prototype, 'exportSession')
      .mockReturnValue({} as ReturnType<SessionService['exportSession']>);

    await component.exportSession(card({ symbol: 'XAUUSD', id: 's1', name: 'Vieja' }));

    expect(exportSpy).toHaveBeenCalledTimes(1);
    const snapshot = exportSpy.mock.calls[0][0];
    expect(snapshot.anchorTimeframes).toEqual(['M1', 'H1']);
    expect(snapshot.years).toEqual([2023, 2024]);
    exportSpy.mockRestore();
  });

  it('exportSession (archived) claims no M1 anchor when the symbol has no local M1 datasets', async () => {
    const session = savedSession({ id: 's1', name: 'Vieja' });
    const meta = workspaceMeta({ symbol: 'XAUUSD', sessions: [session] });
    create({
      currentAsset: 'US30',
      db: {
        listMetas: vi.fn().mockResolvedValue([meta]),
        getMeta: vi.fn().mockResolvedValue(meta),
        listDatasets: vi
          .fn()
          .mockResolvedValue([
            dataset({ id: 'XAUUSD|H1|all', symbol: 'XAUUSD', timeframe: 'H1', year: 'all' }),
          ]),
      },
    });
    await settle();

    const exportSpy = vi
      .spyOn(SessionService.prototype, 'exportSession')
      .mockReturnValue({} as ReturnType<SessionService['exportSession']>);

    await component.exportSession(card({ symbol: 'XAUUSD', id: 's1', name: 'Vieja' }));

    const snapshot = exportSpy.mock.calls[0][0];
    expect(snapshot.anchorTimeframes).toEqual(['H1']);
    expect(snapshot.years).toEqual([]);
    exportSpy.mockRestore();
  });

  // ---- folders CRUD ----

  it('createFolder persists a new folder with the next order', async () => {
    const putFolder = vi.fn().mockResolvedValue(undefined);
    create({ db: { putFolder, listFolders: vi.fn().mockResolvedValue([folder({ order: 2 })]) } });
    dialogsStub.prompt.mockResolvedValue('Scalping');
    await settle();
    await component.createFolder();
    expect(putFolder).toHaveBeenCalledWith(expect.objectContaining({ name: 'Scalping', order: 3 }));
  });

  it('createFolder cancelled is a no-op', async () => {
    const putFolder = vi.fn().mockResolvedValue(undefined);
    create({ db: { putFolder } });
    dialogsStub.prompt.mockResolvedValue(null);
    await settle();
    await component.createFolder();
    expect(putFolder).not.toHaveBeenCalled();
  });

  it('renameFolder persists the new name', async () => {
    const putFolder = vi.fn().mockResolvedValue(undefined);
    create({ db: { putFolder } });
    dialogsStub.prompt.mockResolvedValue('Renombrada');
    await settle();
    await component.renameFolder(folder({ id: 'f1', name: 'Vieja' }));
    expect(putFolder).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'f1', name: 'Renombrada' }),
    );
  });

  it('deleteFolder (confirmed) removes it', async () => {
    const deleteFolder = vi.fn().mockResolvedValue(undefined);
    create({ db: { deleteFolder } });
    dialogsStub.confirm.mockResolvedValue(true);
    await settle();
    await component.deleteFolder(folder({ id: 'f1' }));
    expect(deleteFolder).toHaveBeenCalledWith('f1');
  });

  // ---- moveToFolder ----

  it('moveToFolder no-op when already in that folder', async () => {
    create({ currentAsset: 'XAUUSD' });
    await settle();
    await component.moveToFolder(card({ symbol: 'XAUUSD', folderId: 'f1' }), 'f1');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('moveToFolder current-asset → setSessionFolder', async () => {
    create({ currentAsset: 'XAUUSD' });
    await settle();
    await component.moveToFolder(card({ symbol: 'XAUUSD', id: 's1', folderId: null }), 'f1');
    expect(dispatch).toHaveBeenCalledWith(
      TradingActions.setSessionFolder({ id: 's1', folderId: 'f1' }),
    );
  });

  it('moveToFolder other-asset writes the meta directly', async () => {
    const meta = workspaceMeta({ symbol: 'EURUSD', sessions: [savedSession({ id: 's1' })] });
    const getMeta = vi.fn().mockResolvedValue(meta);
    const putMeta = vi.fn().mockResolvedValue(undefined);
    create({
      currentAsset: 'US30',
      db: { getMeta, putMeta, listMetas: vi.fn().mockResolvedValue([]) },
    });
    await settle();
    await component.moveToFolder(card({ symbol: 'EURUSD', id: 's1', folderId: null }), 'f1');
    expect(putMeta).toHaveBeenCalled();
  });

  // ---- drag & drop ----

  it('drag start/end track the dragging card', async () => {
    create();
    await settle();
    const c = card();
    const ev = { dataTransfer: { setData: vi.fn(), effectAllowed: '' } } as unknown as DragEvent;
    component.onDragStart(c, ev);
    expect(component.dragging()).toBe(c);
    component.onDragEnd();
    expect(component.dragging()).toBeNull();
  });

  it('drop on a folder group moves the dragged card there', async () => {
    create({ currentAsset: 'XAUUSD' });
    await settle();
    const c = card({ symbol: 'XAUUSD', id: 's1', folderId: null });
    component.onDragStart(c, { dataTransfer: { setData: vi.fn() } } as unknown as DragEvent);
    const ev = { preventDefault: vi.fn() } as unknown as DragEvent;
    component.onGroupDrop({ key: 'f1', label: 'A', folderId: 'f1', cards: [] }, ev);
    expect(dispatch).toHaveBeenCalledWith(
      TradingActions.setSessionFolder({ id: 's1', folderId: 'f1' }),
    );
    expect(component.dragging()).toBeNull();
  });

  it('dragover on a folder sets the highlight key (carpeta mode only)', async () => {
    create();
    await settle();
    component.onDragStart(card(), { dataTransfer: { setData: vi.fn() } } as unknown as DragEvent);
    const ev = { preventDefault: vi.fn(), dataTransfer: {} } as unknown as DragEvent;
    component.onGroupDragOver({ key: 'f1', label: 'A', folderId: 'f1', cards: [] }, ev);
    expect(component.dragOverKey()).toBe('f1');
    component.setGroupBy('activo');
    component.dragOverKey.set(null);
    component.onGroupDragOver({ key: 'US30', label: 'US30', folderId: null, cards: [] }, ev);
    expect(component.dragOverKey()).toBeNull(); // no folder drops in activo mode
  });

  // ---- onImportSession ----

  const SESSION_CSV = [
    'bar_time,evento,p1,p2,detalle',
    '2024-01-01 00:00,ORDEN_COLOCADA,4000,3990,BUY_MARKET lotes=0.10 tp=4020 id=t1',
    '2024-01-01 01:00,CIERRE_TP,4020,200,r=2.00 id=t1',
  ].join('\n');

  function sessionFileEvent(name: string, text: string): Event {
    return { target: { files: [{ name, text: async () => text }], value: '' } } as unknown as Event;
  }

  it('onImportSession parses a session CSV and dispatches into the matching asset', async () => {
    create({ currentAsset: 'XAUUSD' });
    await settle();
    await component.onImportSession(sessionFileEvent('xauusd_sesion.csv', SESSION_CSV));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: TradingActions.sessionImported.type }),
    );
  });

  // ---- onImportSessionJson (.session.json import — R2) ----

  function sessionFileV1(over: Record<string, unknown> = {}) {
    return {
      version: 1,
      exportedWith: 'Trading Emulator v2.0.0',
      id: 'sess-json-1',
      requiredDatasets: [{ symbol: 'XAUUSD', timeframe: 'H1' }],
      context: { symbol: 'XAUUSD', initialBalance: 10000, startRange: 0, endRange: 0 },
      state: { replayTime: 1700000000000, currentTimeframe: 60, playbackSpeed: 250 },
      trading: {
        trades: [closed({ id: 't1', profit: 500, closeTime: 1700000000 })],
        pendingOrders: [],
      },
      annotations: { drawings: [], notes: [] },
      ...over,
    };
  }

  it('onImportSessionJson on a future version shows the update message (no dispatch)', async () => {
    create();
    await settle();
    vi.spyOn(SessionService.prototype, 'parse').mockReturnValue({ status: 'future', version: 99 });
    await component.onImportSessionJson(sessionFileEvent('x.session.json', '{}'));
    expect(component.importError()).toMatch(/Actualiza el emulador/);
    expect(component.importError()).toContain('99');
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: WorkspacesActions.switchAsset.type }),
    );
  });

  it('onImportSessionJson on an invalid file shows the reason', async () => {
    create();
    await settle();
    vi.spyOn(SessionService.prototype, 'parse').mockReturnValue({
      status: 'invalid',
      reason: 'roto',
    });
    await component.onImportSessionJson(sessionFileEvent('x.session.json', 'nope'));
    expect(component.importError()).toBe('roto');
  });

  it('onImportSessionJson with no missing datasets restores via switchAsset(thenRestore) and navigates', async () => {
    const session = sessionFileV1();
    create({
      repo: {
        getCandles: vi.fn().mockResolvedValue([{ time: 1, open: 1, high: 1, low: 1, close: 1 }]),
      },
    });
    await settle();
    vi.spyOn(SessionService.prototype, 'parse').mockReturnValue({ status: 'ok', session } as any);
    vi.spyOn(SessionService.prototype, 'findMissingDatasets').mockResolvedValue([]);

    await component.onImportSessionJson(sessionFileEvent('x.session.json', '{}'));

    expect(component.missing()).toHaveLength(0); // modal not opened
    expect(repoStub.getCandles).toHaveBeenCalledWith('XAUUSD', 'H1');
    const call = dispatch.mock.calls
      .map((c: unknown[]) => c[0])
      .find((a: any) => a.type === WorkspacesActions.switchAsset.type) as any;
    expect(call).toBeTruthy();
    expect(call.symbol).toBe('XAUUSD');
    expect(call.thenGoTo).toBe(1700000000); // ms → sec
    expect(call.thenRestore.intervalMinutes).toBe(60);
    expect(call.thenRestore.playbackSpeed).toBe(250);
    // realized-balance convention: initial + Σ profits
    expect(call.thenRestore.trading.balance).toBe(10500);
    expect(call.thenRestore.trading.initialBalance).toBe(10000);
    expect(call.thenRestore.trading.history).toHaveLength(1);
    expect(routerStub.navigateByUrl).toHaveBeenCalledWith('/');
  });

  it('onImportSessionJson with missing datasets opens the modal (no restore yet)', async () => {
    const session = sessionFileV1();
    create();
    await settle();
    vi.spyOn(SessionService.prototype, 'parse').mockReturnValue({ status: 'ok', session } as any);
    vi.spyOn(SessionService.prototype, 'findMissingDatasets').mockResolvedValue([
      { symbol: 'XAUUSD', timeframe: 'M1', year: 2024 },
    ]);

    await component.onImportSessionJson(sessionFileEvent('x.session.json', '{}'));

    expect(component.missing()).toHaveLength(1);
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: WorkspacesActions.switchAsset.type }),
    );
  });

  it('confirmDownload runs onboarding jobs for the missing partitions then restores', async () => {
    const session = sessionFileV1();
    create({
      repo: {
        getCandles: vi.fn().mockResolvedValue([{ time: 1, open: 1, high: 1, low: 1, close: 1 }]),
      },
    });
    await settle();
    vi.spyOn(SessionService.prototype, 'parse').mockReturnValue({ status: 'ok', session } as any);
    vi.spyOn(SessionService.prototype, 'findMissingDatasets').mockResolvedValue([
      { symbol: 'XAUUSD', timeframe: 'M1', year: 2024 },
      { symbol: 'XAUUSD', timeframe: 'H1' },
    ]);

    await component.onImportSessionJson(sessionFileEvent('x.session.json', '{}'));
    await component.confirmDownload();

    expect(manifestStub.fetchManifest).toHaveBeenCalled();
    const [, jobs] = onboardingStub.runJobs.mock.calls[0];
    expect(jobs).toEqual([
      { symbol: 'XAUUSD', tf: 'm1', year: '2024' },
      { symbol: 'XAUUSD', tf: 'h1', year: 'all' },
    ]);
    expect(component.missing()).toHaveLength(0); // modal closed
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: WorkspacesActions.switchAsset.type }),
    );
    expect(routerStub.navigateByUrl).toHaveBeenCalledWith('/');
  });

  it('confirmDownload surfaces a download error and keeps the modal open', async () => {
    const session = sessionFileV1();
    create({ onboarding: { runJobs: vi.fn().mockRejectedValue(new Error('R2 caído')) } });
    await settle();
    vi.spyOn(SessionService.prototype, 'parse').mockReturnValue({ status: 'ok', session } as any);
    vi.spyOn(SessionService.prototype, 'findMissingDatasets').mockResolvedValue([
      { symbol: 'XAUUSD', timeframe: 'H1' },
    ]);

    await component.onImportSessionJson(sessionFileEvent('x.session.json', '{}'));
    await component.confirmDownload();

    expect(component.downloadError()).toBe('R2 caído');
    expect(component.missing()).toHaveLength(1); // still open
    expect(component.downloading()).toBe(false);
  });

  it('cancelDownload closes the modal without restoring', async () => {
    const session = sessionFileV1();
    create();
    await settle();
    vi.spyOn(SessionService.prototype, 'parse').mockReturnValue({ status: 'ok', session } as any);
    vi.spyOn(SessionService.prototype, 'findMissingDatasets').mockResolvedValue([
      { symbol: 'XAUUSD', timeframe: 'H1' },
    ]);

    await component.onImportSessionJson(sessionFileEvent('x.session.json', '{}'));
    component.cancelDownload();

    expect(component.missing()).toHaveLength(0);
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: WorkspacesActions.switchAsset.type }),
    );
  });

  // ---- helpers ----

  it('folderName resolves names and falls back to "Sin carpeta"', async () => {
    create({ db: { listFolders: vi.fn().mockResolvedValue([folder({ id: 'f1', name: 'A' })]) } });
    await settle();
    expect(component.folderName('f1')).toBe('A');
    expect(component.folderName(null)).toBe('Sin carpeta');
    expect(component.folderName('ghost')).toBe('Sin carpeta');
  });

  beforeEach(() => {
    vi.useRealTimers();
  });
});
