import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { Subject } from 'rxjs';
import { take, toArray } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROOT_EFFECTS_INIT } from '@ngrx/effects';

import { WorkspacesEffects } from './workspaces.effects';
import { WorkspacesActions } from './workspaces.actions';
import { selectCurrentAsset, selectWorkspaceMetaSnapshot } from '../selectors';
import { WorkspaceDbService } from '../../services/workspace-db.service';
import { MarketActions } from '../market/market.actions';
import { ReplayActions } from '../replay/replay.actions';
import { TradingActions } from '../trading/trading.actions';
import { DrawingsActions } from '../drawings/drawings.actions';
import { workspaceDbStub } from '../../testing/workspace-db.stub';
import { series, closed, workspace } from '../../testing/fixtures';
import { emptyWorkspace } from './workspaces.models';
import { defaultTradingData } from '../trading/trading.models';

const CURRENT_KEY = 'emulador.currentAsset';

describe('WorkspacesEffects', () => {
  let actions$: Subject<any>;
  let store: MockStore;
  let db: ReturnType<typeof workspaceDbStub>;
  let effects: WorkspacesEffects;

  const SYMBOL = 'XAUUSD';
  const OTHER = 'EURUSD';

  const assetMeta = { symbol: SYMBOL, lastModified: 1 };
  const metaSnap = {
    files: {},
    activeTf: null,
    selectedTfs: undefined,
    currentTime: 0,
    drawings: [],
    trading: defaultTradingData(),
    sessions: [],
    activeSessionId: null,
  };

  function setupTestBed(overrideDb?: Partial<ReturnType<typeof workspaceDbStub>>) {
    db = { ...workspaceDbStub(), ...overrideDb };
    TestBed.configureTestingModule({
      providers: [
        WorkspacesEffects,
        provideMockActions(() => actions$),
        provideMockStore(),
        { provide: WorkspaceDbService, useValue: db },
      ],
    });
    store = TestBed.inject(MockStore);
    effects = TestBed.inject(WorkspacesEffects);
    store.overrideSelector(selectCurrentAsset, null);
    store.overrideSelector(selectWorkspaceMetaSnapshot, metaSnap);
    store.refreshState();
  }

  beforeEach(() => {
    actions$ = new Subject();
    // emptyWorkspace() embeds Date.now() in lastModified; pin it so the
    // workspaceRestored(emptyWorkspace(...)) deep-equality assertions are
    // deterministic (the effect and the test build the object independently)
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
  });

  afterEach(() => {
    localStorage.removeItem(CURRENT_KEY);
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  // ─── init$ / loadInitial ───────────────────────────────────────────────────

  describe('init$ / loadInitial', () => {
    it('emits only assetsLoaded when no stored current asset', async () => {
      setupTestBed();
      db.list!.mockResolvedValue([assetMeta]);
      // No localStorage key set

      const p = effects.init$.pipe(take(1), toArray()).toPromise();
      actions$.next({ type: ROOT_EFFECTS_INIT });

      const result = await p;
      expect(result).toEqual([
        WorkspacesActions.assetsLoaded({ assets: [assetMeta], current: null }),
      ]);
    });

    it('emits assetsLoaded then workspaceRestored when stored current exists in assets', async () => {
      setupTestBed();
      const ws = workspace({ symbol: SYMBOL });
      db.list!.mockResolvedValue([assetMeta]);
      db.getWorkspace!.mockResolvedValue(ws);
      localStorage.setItem(CURRENT_KEY, SYMBOL);

      const p = effects.init$.pipe(take(2), toArray()).toPromise();
      actions$.next({ type: ROOT_EFFECTS_INIT });

      const result = await p;
      expect(result).toEqual([
        WorkspacesActions.assetsLoaded({ assets: [assetMeta], current: SYMBOL }),
        WorkspacesActions.workspaceRestored({ workspace: ws }),
      ]);
    });

    it('coerces current to null when stored key is not in the assets list', async () => {
      setupTestBed();
      db.list!.mockResolvedValue([assetMeta]); // only XAUUSD
      localStorage.setItem(CURRENT_KEY, 'BTCUSD'); // not in list

      const p = effects.init$.pipe(take(1), toArray()).toPromise();
      actions$.next({ type: ROOT_EFFECTS_INIT });

      const result = await p;
      expect(result).toEqual([
        WorkspacesActions.assetsLoaded({ assets: [assetMeta], current: null }),
      ]);
    });

    it('emits assetsLoaded with empty assets on db.list() throw', async () => {
      setupTestBed();
      db.list!.mockRejectedValue(new Error('IndexedDB unavailable'));

      const p = effects.init$.pipe(take(1), toArray()).toPromise();
      actions$.next({ type: ROOT_EFFECTS_INIT });

      const result = await p;
      expect(result).toEqual([WorkspacesActions.assetsLoaded({ assets: [], current: null })]);
    });

    it('coerces current to null when localStorage.getItem throws', async () => {
      setupTestBed();
      db.list!.mockResolvedValue([assetMeta]);
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('storage denied');
      });

      const p = effects.init$.pipe(take(1), toArray()).toPromise();
      actions$.next({ type: ROOT_EFFECTS_INIT });

      const result = await p;
      expect(result![0]).toEqual(
        WorkspacesActions.assetsLoaded({ assets: [assetMeta], current: null }),
      );

      vi.restoreAllMocks();
    });
  });

  // ─── switch$ / doSwitch ───────────────────────────────────────────────────

  describe('switch$ / doSwitch — REGRESSION #4: exact action order', () => {
    it('1. base: getWorkspace undefined → [workspaceRestored(emptyWorkspace)]', async () => {
      setupTestBed();
      store.overrideSelector(selectCurrentAsset, null);
      store.refreshState();
      db.getWorkspace!.mockResolvedValue(undefined);

      const p = effects.switch$.pipe(take(1), toArray()).toPromise();
      actions$.next(WorkspacesActions.switchAsset({ symbol: SYMBOL }));

      const result = await p;
      expect(result).toEqual([
        WorkspacesActions.workspaceRestored({ workspace: emptyWorkspace(SYMBOL) }),
      ]);
      // localStorage updated
      expect(localStorage.getItem(CURRENT_KEY)).toBe(SYMBOL);
    });

    it('1b. putMeta called for the outgoing asset when current is set', async () => {
      setupTestBed();
      store.overrideSelector(selectCurrentAsset, OTHER);
      store.overrideSelector(selectWorkspaceMetaSnapshot, metaSnap);
      store.refreshState();
      db.getWorkspace!.mockResolvedValue(undefined);

      const p = effects.switch$.pipe(take(1), toArray()).toPromise();
      actions$.next(WorkspacesActions.switchAsset({ symbol: SYMBOL }));
      await p;

      expect(db.putMeta).toHaveBeenCalledWith(expect.objectContaining({ symbol: OTHER }));
    });

    it('2. thenLoad csvs → [workspaceRestored, csvLoaded(A), csvLoaded(B)]', async () => {
      setupTestBed();
      db.getWorkspace!.mockResolvedValue(undefined);

      const csvA = { tf: 'H1' as const, candles: series(3), fileName: 'a.csv' };
      const csvB = { tf: 'M15' as const, candles: series(2), fileName: 'b.csv' };

      const p = effects.switch$.pipe(take(3), toArray()).toPromise();
      actions$.next(WorkspacesActions.switchAsset({ symbol: SYMBOL, thenLoad: [csvA, csvB] }));

      const result = await p;
      expect(result).toEqual([
        WorkspacesActions.workspaceRestored({ workspace: emptyWorkspace(SYMBOL) }),
        MarketActions.csvLoaded(csvA),
        MarketActions.csvLoaded(csvB),
      ]);
    });

    it('2r. thenRestore with a matching loaded TF → restoreSession, restoreDrawings, changeTimeframe, changeSpeed (in order, after csvLoaded)', async () => {
      setupTestBed();
      db.getWorkspace!.mockResolvedValue(undefined);

      const csvH1 = { tf: 'H1' as const, candles: series(3), fileName: 'h1.csv' };
      const trading = { ...defaultTradingData(), balance: 12345, sessionName: 'Restaurada' };
      const drawings = [
        { id: 'd1', kind: 'line' as const, p1: { time: 0, price: 1 }, p2: { time: 1, price: 2 } },
      ];

      const p = effects.switch$.pipe(take(7), toArray()).toPromise();
      actions$.next(
        WorkspacesActions.switchAsset({
          symbol: SYMBOL,
          selectedTfs: ['H1'],
          thenLoad: [csvH1],
          thenRestore: {
            trading,
            drawings,
            intervalMinutes: 60,
            playbackSpeed: 250,
            replayResolution: 5,
          },
          thenGoTo: 1234,
        }),
      );

      const result = await p;
      expect(result).toEqual([
        WorkspacesActions.workspaceRestored({
          workspace: { ...emptyWorkspace(SYMBOL), selectedTfs: ['H1'] },
        }),
        MarketActions.csvLoaded(csvH1),
        TradingActions.restoreSession({ trading }),
        DrawingsActions.restoreDrawings({ drawings }),
        MarketActions.changeTimeframe({ tf: 'H1' }),
        ReplayActions.changeSpeed({ msPerCandle: 250 }),
        ReplayActions.setReplayResolution({ minutes: 5 }),
        // thenGoTo(1234) follows as an 8th action (not taken here)
      ]);
    });

    it('2r2. thenRestore with a non-matching interval → changeCustomTimeframe(minutes)', async () => {
      setupTestBed();
      db.getWorkspace!.mockResolvedValue(undefined);

      const csvH1 = { tf: 'H1' as const, candles: series(3), fileName: 'h1.csv' };
      const trading = defaultTradingData();

      const p = effects.switch$.pipe(take(7), toArray()).toPromise();
      actions$.next(
        WorkspacesActions.switchAsset({
          symbol: SYMBOL,
          selectedTfs: ['H1'],
          thenLoad: [csvH1],
          thenRestore: {
            trading,
            drawings: [],
            intervalMinutes: 45,
            playbackSpeed: 100,
            replayResolution: null,
          },
        }),
      );

      const result = await p;
      expect(result).toEqual([
        WorkspacesActions.workspaceRestored({
          workspace: { ...emptyWorkspace(SYMBOL), selectedTfs: ['H1'] },
        }),
        MarketActions.csvLoaded(csvH1),
        TradingActions.restoreSession({ trading }),
        DrawingsActions.restoreDrawings({ drawings: [] }),
        MarketActions.changeCustomTimeframe({ minutes: 45 }),
        ReplayActions.changeSpeed({ msPerCandle: 100 }),
        ReplayActions.setReplayResolution({ minutes: null }),
      ]);
    });

    it('3. thenImport with trades → [workspaceRestored, sessionImported, goToTime(lastClose)]', async () => {
      setupTestBed();
      db.getWorkspace!.mockResolvedValue(undefined);

      const trades = [closed({ closeTime: 7200 }), closed({ id: 't2', closeTime: 3600 })];
      const lastClose = 7200;

      const p = effects.switch$.pipe(take(3), toArray()).toPromise();
      actions$.next(WorkspacesActions.switchAsset({ symbol: SYMBOL, thenImport: { trades } }));

      const result = await p;
      expect(result).toEqual([
        WorkspacesActions.workspaceRestored({ workspace: emptyWorkspace(SYMBOL) }),
        TradingActions.sessionImported({ trades, currentCursor: 0 }),
        ReplayActions.goToTime({ time: lastClose }),
      ]);
    });

    it('3b. thenImport with lastClose=0 → no goToTime', async () => {
      setupTestBed();
      db.getWorkspace!.mockResolvedValue(undefined);

      const trades = [closed({ closeTime: 0 })];

      const p = effects.switch$.pipe(take(2), toArray()).toPromise();
      actions$.next(WorkspacesActions.switchAsset({ symbol: SYMBOL, thenImport: { trades } }));

      const result = await p;
      expect(result).toEqual([
        WorkspacesActions.workspaceRestored({ workspace: emptyWorkspace(SYMBOL) }),
        TradingActions.sessionImported({ trades, currentCursor: 0 }),
      ]);
    });

    it('4. thenNewSession {name:"X"} → [workspaceRestored, newSession, setSessionName]', async () => {
      setupTestBed();
      db.getWorkspace!.mockResolvedValue(undefined);

      const p = effects.switch$.pipe(take(3), toArray()).toPromise();
      actions$.next(
        WorkspacesActions.switchAsset({ symbol: SYMBOL, thenNewSession: { name: 'X' } }),
      );

      const result = await p;
      expect(result).toEqual([
        WorkspacesActions.workspaceRestored({ workspace: emptyWorkspace(SYMBOL) }),
        TradingActions.newSession({ currentCursor: 0 }),
        TradingActions.setSessionName({ name: 'X' }),
      ]);
    });

    it('4b. thenNewSession {name:null} → [workspaceRestored, newSession] (no setSessionName)', async () => {
      setupTestBed();
      db.getWorkspace!.mockResolvedValue(undefined);

      const p = effects.switch$.pipe(take(2), toArray()).toPromise();
      actions$.next(
        WorkspacesActions.switchAsset({ symbol: SYMBOL, thenNewSession: { name: null } }),
      );

      const result = await p;
      expect(result).toEqual([
        WorkspacesActions.workspaceRestored({ workspace: emptyWorkspace(SYMBOL) }),
        TradingActions.newSession({ currentCursor: 0 }),
      ]);
    });

    it('5. thenOpenSession matching a session with currentTime>0 → [workspaceRestored, switchSession, goToTime]', async () => {
      setupTestBed();
      const savedSess = {
        id: 'sess-1',
        name: 'Old',
        createdAt: 1,
        currentTime: 3600,
        trading: defaultTradingData(),
      };
      const ws = workspace({ symbol: SYMBOL, sessions: [savedSess] });
      db.getWorkspace!.mockResolvedValue(ws);

      const p = effects.switch$.pipe(take(3), toArray()).toPromise();
      actions$.next(WorkspacesActions.switchAsset({ symbol: SYMBOL, thenOpenSession: 'sess-1' }));

      const result = await p;
      expect(result).toEqual([
        WorkspacesActions.workspaceRestored({ workspace: ws }),
        TradingActions.switchSession({ id: 'sess-1', currentCursor: ws.currentTime }),
        ReplayActions.goToTime({ time: savedSess.currentTime }),
      ]);
    });

    it('5b. thenOpenSession matching a session with currentTime=0 → no goToTime', async () => {
      setupTestBed();
      const savedSess = {
        id: 'sess-2',
        name: 'Flat',
        createdAt: 2,
        currentTime: 0,
        trading: defaultTradingData(),
      };
      const ws = workspace({ symbol: SYMBOL, sessions: [savedSess] });
      db.getWorkspace!.mockResolvedValue(ws);

      const p = effects.switch$.pipe(take(2), toArray()).toPromise();
      actions$.next(WorkspacesActions.switchAsset({ symbol: SYMBOL, thenOpenSession: 'sess-2' }));

      const result = await p;
      expect(result).toEqual([
        WorkspacesActions.workspaceRestored({ workspace: ws }),
        TradingActions.switchSession({ id: 'sess-2', currentCursor: ws.currentTime }),
      ]);
    });

    it('5c. thenOpenSession non-matching id → only workspaceRestored', async () => {
      setupTestBed();
      const ws = workspace({ symbol: SYMBOL, sessions: [] });
      db.getWorkspace!.mockResolvedValue(ws);

      const p = effects.switch$.pipe(take(1), toArray()).toPromise();
      actions$.next(
        WorkspacesActions.switchAsset({ symbol: SYMBOL, thenOpenSession: 'no-such-id' }),
      );

      const result = await p;
      expect(result).toEqual([WorkspacesActions.workspaceRestored({ workspace: ws })]);
    });

    it('6. thenGoTo → appends goToTime as the last action (before sessionEnd)', async () => {
      setupTestBed();
      db.getWorkspace!.mockResolvedValue(undefined);

      const p = effects.switch$.pipe(take(2), toArray()).toPromise();
      actions$.next(WorkspacesActions.switchAsset({ symbol: SYMBOL, thenGoTo: 5000 }));

      const result = await p;
      expect(result).toEqual([
        WorkspacesActions.workspaceRestored({ workspace: emptyWorkspace(SYMBOL) }),
        ReplayActions.goToTime({ time: 5000 }),
      ]);
    });

    it('7. thenSessionEnd → appends setSessionEnd as the FINAL action', async () => {
      setupTestBed();
      db.getWorkspace!.mockResolvedValue(undefined);

      const p = effects.switch$.pipe(take(2), toArray()).toPromise();
      actions$.next(WorkspacesActions.switchAsset({ symbol: SYMBOL, thenSessionEnd: 9999 }));

      const result = await p;
      const last = result![result!.length - 1];
      expect(last).toEqual(TradingActions.setSessionEnd({ time: 9999 }));
    });

    it('8. canonical wizard: [workspaceRestored, csvLoaded, newSession, setSessionName, goToTime, setSessionEnd]', async () => {
      setupTestBed();
      db.getWorkspace!.mockResolvedValue(undefined);

      const csv = { tf: 'H1' as const, candles: series(3), fileName: 'f.csv' };

      const p = effects.switch$.pipe(take(6), toArray()).toPromise();
      actions$.next(
        WorkspacesActions.switchAsset({
          symbol: SYMBOL,
          thenLoad: [csv],
          thenNewSession: { name: 'Wizard' },
          thenGoTo: 1234,
          thenSessionEnd: 9876,
        }),
      );

      const result = await p;
      expect(result).toEqual([
        WorkspacesActions.workspaceRestored({ workspace: emptyWorkspace(SYMBOL) }),
        MarketActions.csvLoaded(csv),
        TradingActions.newSession({ currentCursor: 0 }),
        TradingActions.setSessionName({ name: 'Wizard' }),
        ReplayActions.goToTime({ time: 1234 }),
        TradingActions.setSessionEnd({ time: 9876 }),
      ]);
    });

    it('9. getWorkspace throws → falls back to emptyWorkspace', async () => {
      setupTestBed();
      db.getWorkspace!.mockRejectedValue(new Error('DB read failed'));

      const p = effects.switch$.pipe(take(1), toArray()).toPromise();
      actions$.next(WorkspacesActions.switchAsset({ symbol: SYMBOL }));

      const result = await p;
      expect(result).toEqual([
        WorkspacesActions.workspaceRestored({ workspace: emptyWorkspace(SYMBOL) }),
      ]);
    });

    it('9b. putMeta rejection on the outgoing asset is swallowed (no throw)', async () => {
      setupTestBed();
      store.overrideSelector(selectCurrentAsset, OTHER);
      store.refreshState();
      db.putMeta!.mockRejectedValue(new Error('Write failed'));
      db.getWorkspace!.mockResolvedValue(undefined);

      const p = effects.switch$.pipe(take(1), toArray()).toPromise();

      // Must not throw
      await expect(
        (async () => {
          actions$.next(WorkspacesActions.switchAsset({ symbol: SYMBOL }));
          return await p;
        })(),
      ).resolves.toBeDefined();
    });
  });

  // ─── persistSeries$ ───────────────────────────────────────────────────────

  describe('persistSeries$', () => {
    it('calls db.putSeries when csvLoaded is dispatched and there is a current asset', async () => {
      setupTestBed();
      store.overrideSelector(selectCurrentAsset, SYMBOL);
      store.refreshState();

      const candles = series(3);
      const sub = effects.persistSeries$.subscribe();

      actions$.next(MarketActions.csvLoaded({ tf: 'H1', candles, fileName: 'f.csv' }));
      await Promise.resolve(); // microtask for the from(promise)

      sub.unsubscribe();
      // Give the from() promise time to resolve
      await new Promise((r) => setTimeout(r, 0));
      expect(db.putSeries).toHaveBeenCalledWith(SYMBOL, 'H1', candles);
    });

    it('is filtered when current asset is null', async () => {
      setupTestBed();
      store.overrideSelector(selectCurrentAsset, null);
      store.refreshState();

      const candles = series(3);
      const sub = effects.persistSeries$.subscribe();

      actions$.next(MarketActions.csvLoaded({ tf: 'H1', candles, fileName: 'f.csv' }));
      await new Promise((r) => setTimeout(r, 10));

      sub.unsubscribe();
      expect(db.putSeries).not.toHaveBeenCalled();
    });

    it('swallows db.putSeries rejection (no throw)', async () => {
      setupTestBed();
      store.overrideSelector(selectCurrentAsset, SYMBOL);
      store.refreshState();
      db.putSeries!.mockRejectedValue(new Error('Write error'));

      const candles = series(3);
      const sub = effects.persistSeries$.subscribe();

      actions$.next(MarketActions.csvLoaded({ tf: 'H1', candles, fileName: 'f.csv' }));
      await new Promise((r) => setTimeout(r, 20));

      sub.unsubscribe();
      // The effect continues without throwing (putSeries rejection swallowed)
      expect(db.putSeries).toHaveBeenCalled();
    });
  });

  // ─── persistMeta$ ─────────────────────────────────────────────────────────

  describe('persistMeta$', () => {
    it('calls db.putMeta after 300ms debounce when a current asset is set', async () => {
      vi.useFakeTimers();
      setupTestBed();
      store.overrideSelector(selectCurrentAsset, SYMBOL);
      store.overrideSelector(selectWorkspaceMetaSnapshot, metaSnap);
      store.refreshState();

      const sub = effects.persistMeta$.subscribe();

      // Trigger the selector emission by refreshing state
      store.refreshState();

      // Advance past the debounce
      vi.advanceTimersByTime(300);

      // Allow microtasks to resolve
      await Promise.resolve();
      await Promise.resolve();

      sub.unsubscribe();
      vi.useRealTimers();

      expect(db.putMeta).toHaveBeenCalledWith(expect.objectContaining({ symbol: SYMBOL }));
    });

    it('is filtered when current asset is null', async () => {
      vi.useFakeTimers();
      setupTestBed();
      store.overrideSelector(selectCurrentAsset, null);
      store.overrideSelector(selectWorkspaceMetaSnapshot, metaSnap);
      store.refreshState();

      const sub = effects.persistMeta$.subscribe();
      store.refreshState();
      vi.advanceTimersByTime(500);
      await Promise.resolve();

      sub.unsubscribe();
      vi.useRealTimers();

      expect(db.putMeta).not.toHaveBeenCalled();
    });

    it('activeSessionId flows from the snapshot; the two sync clocks are preserved from the existing record', async () => {
      vi.useFakeTimers();
      setupTestBed();
      // The stable activeSessionId now lives in NgRx state and is carried by
      // selectWorkspaceMetaSnapshot, so persistMeta$ writes it straight from
      // the snapshot. The LWW clocks (activeClientUpdatedAt/activeSyncedAt)
      // remain sync-only (NOT in the snapshot), so they must still be read
      // back from the existing record instead of being clobbered to undefined.
      db.getMeta!.mockResolvedValue({
        symbol: SYMBOL,
        activeSessionId: 'stale-existing-id',
        activeClientUpdatedAt: 555,
        activeSyncedAt: 555,
      });
      store.overrideSelector(selectCurrentAsset, SYMBOL);
      store.overrideSelector(selectWorkspaceMetaSnapshot, {
        ...metaSnap,
        activeSessionId: 'sess-from-snapshot',
      });
      store.refreshState();

      const sub = effects.persistMeta$.subscribe();
      store.refreshState();
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();

      sub.unsubscribe();
      vi.useRealTimers();

      expect(db.putMeta).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: SYMBOL,
          // snapshot wins for the stable id (state owns it now)
          activeSessionId: 'sess-from-snapshot',
          // clocks still preserved from the existing record
          activeClientUpdatedAt: 555,
          activeSyncedAt: 555,
        }),
      );
    });
  });
});
