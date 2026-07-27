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
import { createInitialLayoutState } from '../layout/layout.models';
import { LayoutActions } from '../layout/layout.actions';
import { LinkGroupsActions } from '../link-groups/link-groups.actions';
import { linkGroupsFeature } from '../link-groups/link-groups.reducer';
import { createLinkGroup } from '../link-groups/link-groups.models';
import { singlePanelLayoutFor } from '../../services/session-migration';

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
    layout: createInitialLayoutState().workspace,
    panels: createInitialLayoutState().panels,
    linkGroups: {},
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
    // Inert for production: the effect never resolves group-owned drawing
    // owners against the store — only against whichever workspace this
    // restore installs (`thenRestore.linkGroups` if present, else the
    // incoming workspace's own persisted `linkGroups`). Left at `{}` so
    // 2r7/2r7b/2r7c can each override it independently, which is what lets
    // 2r7b demonstrate that the store's contents never affect the outcome.
    store.overrideSelector(linkGroupsFeature.selectGroups, {});
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
    // isolate:false discipline (testing.md): overrideSelector forces a result
    // onto the module-level NgRx singleton selector, which otherwise poisons
    // later spec files that read the same selector for real.
    store.resetSelectors();
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

  // ─── workspaceRestored — legacy drawing lift (read-time, parse-don't-trust) ─

  describe('workspaceRestored — legacy drawing lift', () => {
    it('drawings missing `owner` (pre-RFC-017 IndexedDB records) hydrate owned by the REAL panel that matches the symbol, not the single-panel migration default', async () => {
      setupTestBed();
      // Two-panel layout where the panel matching SYMBOL is NOT the first one
      // overall: only a genuine `ws.layout`/`ws.panels` read (not a fallback
      // that ignores them) can land on 'panel-b' here. An implementation that
      // always used `singlePanelLayoutFor` would produce 'panel-migrated-1'
      // instead and this assertion would catch it.
      const layout = {
        tabs: [
          {
            id: 'tab-1',
            name: 'Principal',
            template: '2h' as const,
            cells: [
              { panelIds: ['panel-a'], activePanelId: 'panel-a' },
              { panelIds: ['panel-b'], activePanelId: 'panel-b' },
            ],
          },
        ],
        activeTabId: 'tab-1',
      };
      const panels = {
        'panel-a': { id: 'panel-a', symbol: OTHER, timeframe: 'M1' as const, linkGroupId: null },
        'panel-b': { id: 'panel-b', symbol: SYMBOL, timeframe: 'M1' as const, linkGroupId: null },
      };
      const legacyItem = {
        id: 'd1',
        kind: 'line' as const,
        p1: { time: 0, price: 1.1 },
        p2: { time: 10, price: 1.2 },
      };
      const ws = workspace({ symbol: SYMBOL, drawings: [legacyItem as never], layout, panels });
      db.list!.mockResolvedValue([assetMeta]);
      db.getWorkspace!.mockResolvedValue(ws);
      localStorage.setItem(CURRENT_KEY, SYMBOL);

      const p = effects.init$.pipe(take(2), toArray()).toPromise();
      actions$.next({ type: ROOT_EFFECTS_INIT });

      const result = await p;
      expect(result).toEqual([
        WorkspacesActions.assetsLoaded({ assets: [assetMeta], current: SYMBOL }),
        WorkspacesActions.workspaceRestored({
          workspace: {
            ...ws,
            drawings: [
              {
                id: 'd1',
                symbol: SYMBOL,
                owner: { type: 'panel', id: 'panel-b' },
                kind: 'line',
                p1: { time: 0, price: 1.1 },
                p2: { time: 10, price: 1.2 },
                zIndex: 0,
                locked: false,
                visible: true,
              },
            ],
          },
        }),
      ]);
    });

    it('a record already holding owner-tagged items passes through untouched', async () => {
      setupTestBed();
      const alreadyLifted = {
        id: 'd1',
        symbol: SYMBOL,
        owner: { type: 'panel' as const, id: 'panel-1' },
        kind: 'line' as const,
        p1: { time: 0, price: 1.1 },
        p2: { time: 10, price: 1.2 },
        zIndex: 0,
        locked: false,
        visible: true,
      };
      const ws = workspace({ symbol: SYMBOL, drawings: [alreadyLifted] });
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

    it('2r. thenRestore with an owner-tagged drawing whose owner does NOT resolve against the installed layout is re-homed to a panel that DOES exist in it (not passed through verbatim)', async () => {
      setupTestBed();
      db.getWorkspace!.mockResolvedValue(undefined); // no persisted workspace -> single-panel migration default installed

      const csvH1 = { tf: 'H1' as const, candles: series(3), fileName: 'h1.csv' };
      const trading = { ...defaultTradingData(), balance: 12345, sessionName: 'Restaurada' };
      // Owned by a panel id that cannot exist in the layout this restore
      // installs (the single-panel migration default only ever mints
      // 'panel-migrated-1') — exactly the shape of a `.session.json` exported
      // from a cold-start session (panel id 'panel-1') and re-imported on a
      // fresh profile / cleared IndexedDB / another machine.
      const drawings = [
        {
          id: 'd1',
          symbol: 'EURUSD',
          owner: { type: 'panel' as const, id: 'panel-1' },
          kind: 'line' as const,
          p1: { time: 0, price: 1 },
          p2: { time: 1, price: 2 },
          zIndex: 0,
          locked: false,
          visible: true,
        },
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
        DrawingsActions.restoreDrawings({
          drawings: [
            {
              ...drawings[0],
              // re-homed to the panel the installed layout actually has —
              // NOT the byte-for-byte 'panel-1' the file carried.
              owner: { type: 'panel', id: 'panel-migrated-1' },
            },
          ],
        }),
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

    it('2r3. thenRestore with layout/panels/linkGroups → restoreLayout, restoreGroups (after restoreDrawings, before the TF branch) (RFC-011 Task 5)', async () => {
      setupTestBed();
      db.getWorkspace!.mockResolvedValue(undefined);

      const csvH1 = { tf: 'H1' as const, candles: series(3), fileName: 'h1.csv' };
      const trading = defaultTradingData();
      const { layout, panels } = singlePanelLayoutFor('EURUSD', 'M1');
      const linkGroups = [
        {
          id: 'g1',
          color: '#f00',
          syncCrosshair: true,
          syncTimeRange: true,
          syncDrawings: true,
        },
      ];

      const p = effects.switch$.pipe(take(9), toArray()).toPromise();
      actions$.next(
        WorkspacesActions.switchAsset({
          symbol: SYMBOL,
          selectedTfs: ['H1'],
          thenLoad: [csvH1],
          thenRestore: {
            trading,
            drawings: [],
            intervalMinutes: 60,
            playbackSpeed: 250,
            replayResolution: 5,
            layout,
            panels,
            linkGroups,
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
        LayoutActions.restoreLayout({ layout, panels }),
        LinkGroupsActions.restoreGroups({ groups: linkGroups }),
        MarketActions.changeTimeframe({ tf: 'H1' }),
        ReplayActions.changeSpeed({ msPerCandle: 250 }),
        ReplayActions.setReplayResolution({ minutes: 5 }),
      ]);
    });

    it('2r4. thenRestore without layout/panels/linkGroups (legacy .session.json export) lifts owner-less drawings against the installed layout instead of dropping them, no restoreLayout/restoreGroups dispatched', async () => {
      setupTestBed();
      db.getWorkspace!.mockResolvedValue(undefined);

      const csvH1 = { tf: 'H1' as const, candles: series(3), fileName: 'h1.csv' };
      const trading = defaultTradingData();
      // A genuinely legacy `.session.json` export: a bare {id,kind,p1,p2}
      // item with no `owner` at all (never a Drawing at runtime, whatever
      // the `Drawing[]` cast at the call site claims).
      const legacyItem = {
        id: 'd1',
        kind: 'line' as const,
        p1: { time: 0, price: 1.1 },
        p2: { time: 10, price: 1.2 },
      };

      const p = effects.switch$.pipe(take(7), toArray()).toPromise();
      actions$.next(
        WorkspacesActions.switchAsset({
          symbol: SYMBOL,
          selectedTfs: ['H1'],
          thenLoad: [csvH1],
          thenRestore: {
            trading,
            drawings: [legacyItem as never],
            intervalMinutes: 60,
            playbackSpeed: 250,
            replayResolution: 5,
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
        // getWorkspace resolved undefined → no persisted layout for this
        // symbol → the installed layout is the single-panel migration
        // default, and that IS the panel this drawing must land on.
        DrawingsActions.restoreDrawings({
          drawings: [
            {
              id: 'd1',
              symbol: SYMBOL,
              owner: { type: 'panel', id: 'panel-migrated-1' },
              kind: 'line',
              p1: { time: 0, price: 1.1 },
              p2: { time: 10, price: 1.2 },
              zIndex: 0,
              locked: false,
              visible: true,
            },
          ],
        }),
        MarketActions.changeTimeframe({ tf: 'H1' }),
        ReplayActions.changeSpeed({ msPerCandle: 250 }),
        ReplayActions.setReplayResolution({ minutes: 5 }),
      ]);
      expect(result!.some((a) => a.type === LayoutActions.restoreLayout.type)).toBe(false);
      expect(result!.some((a) => a.type === LinkGroupsActions.restoreGroups.type)).toBe(false);
    });

    it('2r5. thenRestore without layout/panels, targeting a workspace with its OWN persisted multi-panel layout, resolves owner against THAT layout (not the single-panel fallback)', async () => {
      setupTestBed();
      const { layout: ownLayout, panels: ownPanels } = singlePanelLayoutFor(OTHER, 'M1');
      // Give the target workspace a real second panel matching SYMBOL, so a
      // naive `singlePanelLayoutFor(SYMBOL, ...)` fallback (which would mint
      // 'panel-migrated-1', a panel that does not exist here) is
      // distinguishable from correctly reading the target's own layout.
      const layout = {
        ...ownLayout,
        tabs: [
          {
            ...ownLayout.tabs[0],
            cells: [...ownLayout.tabs[0].cells, { panelIds: ['panel-b'], activePanelId: 'panel-b' }],
          },
        ],
      };
      const panels = {
        ...ownPanels,
        'panel-b': { id: 'panel-b', symbol: SYMBOL, timeframe: 'M1' as const, linkGroupId: null },
      };
      const ws = workspace({ symbol: SYMBOL, layout, panels });
      db.getWorkspace!.mockResolvedValue(ws);

      const csvH1 = { tf: 'H1' as const, candles: series(3), fileName: 'h1.csv' };
      const trading = defaultTradingData();
      const legacyItem = {
        id: 'd1',
        kind: 'line' as const,
        p1: { time: 0, price: 1.1 },
        p2: { time: 10, price: 1.2 },
      };

      const p = effects.switch$.pipe(take(7), toArray()).toPromise();
      actions$.next(
        WorkspacesActions.switchAsset({
          symbol: SYMBOL,
          selectedTfs: ['H1'],
          thenLoad: [csvH1],
          thenRestore: {
            trading,
            drawings: [legacyItem as never],
            intervalMinutes: 60,
            playbackSpeed: 250,
            replayResolution: 5,
          },
        }),
      );

      const result = await p;
      expect(result![3]).toEqual(
        DrawingsActions.restoreDrawings({
          drawings: [
            {
              id: 'd1',
              symbol: SYMBOL,
              owner: { type: 'panel', id: 'panel-b' },
              kind: 'line',
              p1: { time: 0, price: 1.1 },
              p2: { time: 10, price: 1.2 },
              zIndex: 0,
              locked: false,
              visible: true,
            },
          ],
        }),
      );
    });

    it('2r6. thenRestore with an owner-tagged drawing whose owner DOES resolve against the installed layout arrives untouched (same array reference — nothing needed re-homing)', async () => {
      setupTestBed();
      db.getWorkspace!.mockResolvedValue(undefined); // single-panel migration default: panel-migrated-1

      const csvH1 = { tf: 'H1' as const, candles: series(3), fileName: 'h1.csv' };
      const trading = defaultTradingData();
      const drawings = [
        {
          id: 'd1',
          symbol: SYMBOL,
          owner: { type: 'panel' as const, id: 'panel-migrated-1' }, // exists in the installed default layout
          kind: 'line' as const,
          p1: { time: 0, price: 1 },
          p2: { time: 1, price: 2 },
          zIndex: 0,
          locked: false,
          visible: true,
        },
      ];

      const p = effects.switch$.pipe(take(7), toArray()).toPromise();
      actions$.next(
        WorkspacesActions.switchAsset({
          symbol: SYMBOL,
          thenLoad: [csvH1],
          thenRestore: {
            trading,
            drawings,
            intervalMinutes: 60,
            playbackSpeed: 250,
            replayResolution: 5,
          },
        }),
      );

      const result = await p;
      expect(result![3]).toEqual(DrawingsActions.restoreDrawings({ drawings }));
      // identity, not merely equality: liftLegacyDrawings must return the same
      // array reference when every owner already resolves.
      expect((result![3] as ReturnType<typeof DrawingsActions.restoreDrawings>).drawings).toBe(
        drawings,
      );
    });

    it('2r7. same-workspace import: the workspace being restored already owns the group in its OWN persisted linkGroups (no thenRestore.linkGroups) — the group-owned drawing arrives untouched', async () => {
      setupTestBed();
      // Re-importing while already on this workspace: current === symbol, and
      // the live store reflects this same workspace's own groups.
      store.overrideSelector(selectCurrentAsset, SYMBOL);
      store.overrideSelector(linkGroupsFeature.selectGroups, { g1: createLinkGroup('g1', '#f00') });
      store.refreshState();
      const ws = workspace({ symbol: SYMBOL, linkGroups: [createLinkGroup('g1', '#f00')] });
      db.getWorkspace!.mockResolvedValue(ws);

      const csvH1 = { tf: 'H1' as const, candles: series(3), fileName: 'h1.csv' };
      const trading = defaultTradingData();
      const drawings = [
        {
          id: 'd1',
          symbol: SYMBOL,
          owner: { type: 'group' as const, id: 'g1' }, // exists in the target workspace's own persisted groups
          kind: 'line' as const,
          p1: { time: 0, price: 1 },
          p2: { time: 1, price: 2 },
          zIndex: 0,
          locked: false,
          visible: true,
        },
      ];

      const p = effects.switch$.pipe(take(7), toArray()).toPromise();
      actions$.next(
        WorkspacesActions.switchAsset({
          symbol: SYMBOL,
          thenLoad: [csvH1],
          thenRestore: {
            trading,
            drawings,
            intervalMinutes: 60,
            playbackSpeed: 250,
            replayResolution: 5,
          },
        }),
      );

      const result = await p;
      expect(result![3]).toEqual(DrawingsActions.restoreDrawings({ drawings }));
      expect((result![3] as ReturnType<typeof DrawingsActions.restoreDrawings>).drawings).toBe(
        drawings,
      );
    });

    it('2r7b. cross-workspace import: the CURRENT store holds a different (outgoing) workspace\'s groups, but the workspace being restored has the group in its OWN persisted linkGroups — the group-owned drawing must still arrive untouched', async () => {
      setupTestBed();
      // The user is currently on a different, unrelated workspace (OTHER) and
      // imports a `.session.json` for SYMBOL. Nothing has been dispatched yet
      // at this point in doSwitch, so the store still reflects OTHER's own
      // groups, not SYMBOL's — this is the realistic shape of the bug.
      store.overrideSelector(selectCurrentAsset, OTHER);
      store.overrideSelector(linkGroupsFeature.selectGroups, { g2: createLinkGroup('g2', '#0f0') });
      store.refreshState();
      const ws = workspace({ symbol: SYMBOL, linkGroups: [createLinkGroup('g1', '#f00')] });
      db.getWorkspace!.mockResolvedValue(ws);

      const csvH1 = { tf: 'H1' as const, candles: series(3), fileName: 'h1.csv' };
      const trading = defaultTradingData();
      const drawings = [
        {
          id: 'd1',
          symbol: SYMBOL,
          owner: { type: 'group' as const, id: 'g1' }, // exists in the target workspace's own persisted groups, NOT in the current store
          kind: 'line' as const,
          p1: { time: 0, price: 1 },
          p2: { time: 1, price: 2 },
          zIndex: 0,
          locked: false,
          visible: true,
        },
      ];

      const p = effects.switch$.pipe(take(7), toArray()).toPromise();
      actions$.next(
        WorkspacesActions.switchAsset({
          symbol: SYMBOL,
          thenLoad: [csvH1],
          thenRestore: {
            trading,
            drawings,
            intervalMinutes: 60,
            playbackSpeed: 250,
            replayResolution: 5,
          },
        }),
      );

      const result = await p;
      expect(result![3]).toEqual(DrawingsActions.restoreDrawings({ drawings }));
      expect((result![3] as ReturnType<typeof DrawingsActions.restoreDrawings>).drawings).toBe(
        drawings,
      );
    });

    it('2r7c. genuinely dead group: neither thenRestore.linkGroups nor the target workspace\'s own persisted linkGroups contain the id (even though the current store holds an unrelated group) — the drawing is re-homed to a panel that exists', async () => {
      setupTestBed();
      store.overrideSelector(selectCurrentAsset, OTHER);
      store.overrideSelector(linkGroupsFeature.selectGroups, { g2: createLinkGroup('g2', '#0f0') });
      store.refreshState();
      const ws = workspace({ symbol: SYMBOL, linkGroups: [] });
      db.getWorkspace!.mockResolvedValue(ws);

      const csvH1 = { tf: 'H1' as const, candles: series(3), fileName: 'h1.csv' };
      const trading = defaultTradingData();
      const drawings = [
        {
          id: 'd1',
          symbol: SYMBOL,
          owner: { type: 'group' as const, id: 'ghost-group' },
          kind: 'line' as const,
          p1: { time: 0, price: 1 },
          p2: { time: 1, price: 2 },
          zIndex: 0,
          locked: false,
          visible: true,
        },
      ];

      const p = effects.switch$.pipe(take(7), toArray()).toPromise();
      actions$.next(
        WorkspacesActions.switchAsset({
          symbol: SYMBOL,
          thenLoad: [csvH1],
          thenRestore: {
            trading,
            drawings,
            intervalMinutes: 60,
            playbackSpeed: 250,
            replayResolution: 5,
          },
        }),
      );

      const result = await p;
      expect(result![3]).toEqual(
        DrawingsActions.restoreDrawings({
          drawings: [{ ...drawings[0], owner: { type: 'panel', id: 'panel-migrated-1' } }],
        }),
      );
    });

    it('2r8. thenRestore with a group-owned drawing whose group exists nowhere (not in thenRestore, not in the current store) is re-homed to a panel — group namespaces are never auto-created', async () => {
      setupTestBed();
      db.getWorkspace!.mockResolvedValue(undefined); // single-panel migration default: panel-migrated-1
      // setupTestBed's default already overrides linkGroupsFeature.selectGroups to {}

      const csvH1 = { tf: 'H1' as const, candles: series(3), fileName: 'h1.csv' };
      const trading = defaultTradingData();
      const drawings = [
        {
          id: 'd1',
          symbol: SYMBOL,
          owner: { type: 'group' as const, id: 'ghost-group' },
          kind: 'line' as const,
          p1: { time: 0, price: 1 },
          p2: { time: 1, price: 2 },
          zIndex: 0,
          locked: false,
          visible: true,
        },
      ];

      const p = effects.switch$.pipe(take(7), toArray()).toPromise();
      actions$.next(
        WorkspacesActions.switchAsset({
          symbol: SYMBOL,
          thenLoad: [csvH1],
          thenRestore: {
            trading,
            drawings,
            intervalMinutes: 60,
            playbackSpeed: 250,
            replayResolution: 5,
          },
        }),
      );

      const result = await p;
      expect(result![3]).toEqual(
        DrawingsActions.restoreDrawings({
          drawings: [{ ...drawings[0], owner: { type: 'panel', id: 'panel-migrated-1' } }],
        }),
      );
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
