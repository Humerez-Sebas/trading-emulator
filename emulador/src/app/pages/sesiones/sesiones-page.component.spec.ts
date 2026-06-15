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
import { workspaceDbStub } from '../../testing/workspace-db.stub';
import { workspaceMeta, savedSession, closed } from '../../testing/fixtures';
import { defaultTradingData, SessionFolder, TradingData } from '../../state/trading/trading.models';
import { DialogService } from '../../components/ui/dialog.service';

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
  let component: SesionesPageComponent;

  function create(
    opts: {
      db?: Partial<ReturnType<typeof workspaceDbStub>>;
      currentAsset?: string | null;
      currentTime?: number;
      liveTrading?: TradingData;
      liveSessions?: ReturnType<typeof savedSession>[];
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

    TestBed.configureTestingModule({
      providers: [
        SesionesPageComponent,
        provideMockStore(),
        { provide: WorkspaceDbService, useValue: dbStub },
        { provide: Router, useValue: routerStub },
        { provide: DialogService, useValue: dialogsStub },
      ],
    });

    store = TestBed.inject(MockStore);
    store.overrideSelector(selectCurrentAsset, opts.currentAsset ?? null);
    store.overrideSelector(selectCurrentTime, opts.currentTime ?? 0);
    store.overrideSelector(selectTradingData, opts.liveTrading ?? defaultTradingData());
    store.overrideSelector(selectSavedSessions, opts.liveSessions ?? []);
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
