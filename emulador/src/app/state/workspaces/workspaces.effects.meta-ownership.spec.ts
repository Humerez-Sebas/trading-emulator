import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { Subject, firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkspacesEffects } from './workspaces.effects';
import { WorkspacesActions } from './workspaces.actions';
import { selectCurrentAsset, selectWorkspaceMetaSnapshot } from '../selectors';
import { WorkspaceDbService } from '../../services/workspace-db.service';
import { SessionSyncService } from '../../services/session-sync.service';
import type { SupabaseService } from '../../auth/supabase.service';
import { fixedOwnerIdentity } from '../../services/owner-identity.service';
import { ownerWorkspaceDbName } from '../../services/owner-scope';
import { defaultTradingData } from '../trading/trading.models';
import { pickTradingData } from '../trading/trading.models';
import { TradingActions } from '../trading/trading.actions';
import { tradingFeature } from '../trading/trading.reducer';
import { createInitialLayoutState } from '../layout/layout.models';
import { position, savedSession, tradingState, workspaceMeta } from '../../testing/fixtures';

/**
 * A5 — who owns `WorkspaceMeta`'s sync clocks?
 *
 * `WorkspaceMeta` is written by several independent read-modify-write paths, and
 * IndexedDB `put` REPLACES the whole record, so "which writer forgets which
 * field" is a real question rather than a stylistic one. This file exists to
 * settle it with evidence instead of inspection:
 *
 *  - `persistMeta$` re-reads the stored record and re-applies
 *    `activeClientUpdatedAt`/`activeSyncedAt`, with a comment saying exactly why.
 *  - `doSwitch` step 1 (the outgoing asset's persist during `switchAsset`) must
 *    do the same re-read because `selectWorkspaceMetaSnapshot` never produces
 *    those keys — the spread cannot carry what the object does not have.
 *
 * The regression below pins the consequence: switching away from a real active
 * session must leave its outgoing snapshot dirty and therefore eligible for the
 * next `flushDirty`. The contrast keeps the known-good writer visible.
 */
const OWNER = 'owner-meta-ownership';
const SYMBOL = 'XAUUSD';
const OTHER = 'EURUSD';

const syncClient = {
  auth: { getSession: async () => ({ data: { session: { user: { id: OWNER } } } }) },
};

const metaSnap = {
  files: {},
  activeTf: null,
  selectedTfs: undefined,
  currentTime: 0,
  drawings: [],
  trading: { ...defaultTradingData(), positions: [position()] },
  sessions: [],
  activeSessionId: 'sess-A',
  layout: createInitialLayoutState().workspace,
  panels: createInitialLayoutState().panels,
  linkGroups: {},
};

describe('A5 — WorkspaceMeta sync-clock ownership across writers', () => {
  let actions$: Subject<unknown>;
  let store: MockStore;
  let db: WorkspaceDbService;
  let effects: WorkspacesEffects;

  beforeEach(async () => {
    await new Promise<void>((res) => {
      const req = indexedDB.deleteDatabase(ownerWorkspaceDbName(OWNER));
      req.onsuccess = () => res();
      req.onerror = () => res();
      req.onblocked = () => res();
    });
    db = new WorkspaceDbService(fixedOwnerIdentity(OWNER));
    actions$ = new Subject();
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
    store.overrideSelector(selectCurrentAsset, SYMBOL);
    store.overrideSelector(selectWorkspaceMetaSnapshot, metaSnap);

    await db.putMeta(
      workspaceMeta({
        symbol: SYMBOL,
        activeSessionId: 'sess-A',
        activeClientUpdatedAt: 111,
        activeSyncedAt: 110,
      }),
    );
  });

  afterEach(() => {
    store.resetSelectors();
    vi.restoreAllMocks();
  });

  it('switchAsset keeps the outgoing real session dirty and eligible for flush', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(112);
    const done = firstValueFrom(effects.switch$);
    actions$.next(WorkspacesActions.switchAsset({ symbol: OTHER }));
    await done;

    const outgoing = await db.getMeta(SYMBOL);
    expect(outgoing).toBeDefined();

    const sync = new SessionSyncService({ client: syncClient } as SupabaseService, db);
    const upsert = vi.spyOn(sync, 'upsertSession').mockResolvedValue();
    await sync.flushDirty();

    expect(upsert).toHaveBeenCalledOnce();
    expect(outgoing!.activeSessionId).toBe('sess-A');
    expect(outgoing!.activeSyncedAt).toBe(110);
    expect(outgoing!.activeClientUpdatedAt).toBe(112);
    expect(outgoing!.activeClientUpdatedAt).toBeGreaterThan(111);
    expect(outgoing!.activeClientUpdatedAt).toBeGreaterThan(outgoing!.activeSyncedAt!);
  });

  it('persistMeta$ atomically marks changed real active trading dirty', async () => {
    const sub = effects.persistMeta$.subscribe();
    // persistMeta$ is debounced 300 ms off the snapshot selector; MockStore
    // replays the overridden value on subscribe, so waiting is enough.
    await new Promise((r) => setTimeout(r, 400));
    sub.unsubscribe();

    const stored = await db.getMeta(SYMBOL);
    expect(stored!.activeClientUpdatedAt).toBeGreaterThan(111);
    expect(stored!.activeSyncedAt).toBe(110);
  });

  it('newSession then switchAsset keeps the archived session clocks and gives the new id fresh provenance', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(50);
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000002');
    const next = tradingFeature.reducer(
      tradingState({
        ...metaSnap.trading,
        activeSessionId: 'sess-A',
      }),
      TradingActions.newSession({ currentCursor: 10, executionCosts: null }),
    );
    const named = tradingFeature.reducer(next, TradingActions.setSessionName({ name: 'Nueva' }));
    store.overrideSelector(selectWorkspaceMetaSnapshot, {
      ...metaSnap,
      trading: pickTradingData(named),
      sessions: named.savedSessions,
      activeSessionId: named.activeSessionId,
    });
    store.refreshState();

    const done = firstValueFrom(effects.switch$);
    actions$.next(WorkspacesActions.switchAsset({ symbol: OTHER }));
    await done;

    const outgoing = await db.getMeta(SYMBOL);
    const archivedA = outgoing!.sessions!.find((session) => session.id === 'sess-A');
    expect(archivedA?.clientUpdatedAt).toBe(112);
    expect(archivedA?.syncedAt).toBe(110);
    expect(outgoing!.activeSessionId).toBe('00000000-0000-4000-8000-000000000002');
    expect(outgoing!.activeClientUpdatedAt).toBe(50);
    expect(outgoing!.activeSyncedAt).toBeUndefined();

    const sync = new SessionSyncService({ client: syncClient } as SupabaseService, db);
    const upsert = vi.spyOn(sync, 'upsertSession').mockResolvedValue();
    await sync.flushDirty();
    expect(upsert.mock.calls.map(([row]) => row.id).sort()).toEqual([
      '00000000-0000-4000-8000-000000000002',
      'sess-A',
    ]);
  });

  it('switchSession then switchAsset moves each session own clocks with its identity', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(50);
    const archivedB = savedSession({
      id: 'sess-B',
      name: 'B',
      trading: { ...defaultTradingData(), positions: [position({ id: 'p-B' })] },
      clientUpdatedAt: 201,
      syncedAt: 200,
    });
    await db.putMeta(
      workspaceMeta({
        symbol: SYMBOL,
        activeSessionId: 'sess-A',
        activeClientUpdatedAt: 111,
        activeSyncedAt: 110,
        trading: metaSnap.trading,
        sessions: [archivedB],
      }),
    );
    const next = tradingFeature.reducer(
      tradingState({
        ...metaSnap.trading,
        activeSessionId: 'sess-A',
        savedSessions: [archivedB],
      }),
      TradingActions.switchSession({ id: 'sess-B', currentCursor: 20 }),
    );
    store.overrideSelector(selectWorkspaceMetaSnapshot, {
      ...metaSnap,
      trading: pickTradingData(next),
      sessions: next.savedSessions,
      activeSessionId: next.activeSessionId,
    });
    store.refreshState();

    const done = firstValueFrom(effects.switch$);
    actions$.next(WorkspacesActions.switchAsset({ symbol: OTHER }));
    await done;

    const outgoing = await db.getMeta(SYMBOL);
    const archivedA = outgoing!.sessions!.find((session) => session.id === 'sess-A');
    expect(archivedA?.clientUpdatedAt).toBe(112);
    expect(archivedA?.syncedAt).toBe(110);
    expect(outgoing!.activeSessionId).toBe('sess-B');
    expect(outgoing!.activeClientUpdatedAt).toBe(202);
    expect(outgoing!.activeSyncedAt).toBe(200);

    const sync = new SessionSyncService({ client: syncClient } as SupabaseService, db);
    const upsert = vi.spyOn(sync, 'upsertSession').mockResolvedValue();
    await sync.flushDirty();
    expect(upsert.mock.calls.map(([row]) => row.id).sort()).toEqual(['sess-A', 'sess-B']);
  });

  it('persistMeta keeps clocks that doSwitch already reconciled onto an archived session', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(50);
    const archivedA = savedSession({
      id: 'sess-A',
      trading: metaSnap.trading,
    });
    const newSnapshot = {
      ...metaSnap,
      trading: { ...defaultTradingData(), sessionName: 'Nueva' },
      sessions: [archivedA],
      activeSessionId: 'sess-new',
    };
    store.overrideSelector(selectWorkspaceMetaSnapshot, newSnapshot);
    store.refreshState();

    const switched = firstValueFrom(effects.switch$);
    actions$.next(WorkspacesActions.switchAsset({ symbol: OTHER }));
    await switched;

    const sub = effects.persistMeta$.subscribe();
    await new Promise((resolve) => setTimeout(resolve, 400));
    sub.unsubscribe();

    const stored = await db.getMeta(SYMBOL);
    expect(stored!.sessions!.find((session) => session.id === 'sess-A')).toEqual(
      expect.objectContaining({ clientUpdatedAt: 112, syncedAt: 110 }),
    );
    expect(stored!.activeClientUpdatedAt).toBe(50);
    expect(stored!.activeSyncedAt).toBeUndefined();
  });

  it('a stale persistence attempt cannot erase a newer dirty stamp or trading eligibility', async () => {
    TestBed.resetTestingModule();
    actions$ = new Subject();
    const initial = workspaceMeta({
      symbol: SYMBOL,
      activeSessionId: 'sess-A',
      activeClientUpdatedAt: 111,
      activeSyncedAt: 110,
      trading: metaSnap.trading,
    });
    await db.putMeta(initial);
    const stale = structuredClone(initial);
    const raceDb = {
      getMeta: vi.fn().mockResolvedValue(stale),
      putMeta: db.putMeta.bind(db),
      updateMeta: db.updateMeta.bind(db),
    };
    TestBed.configureTestingModule({
      providers: [
        WorkspacesEffects,
        provideMockActions(() => actions$),
        provideMockStore(),
        { provide: WorkspaceDbService, useValue: raceDb },
      ],
    });
    store = TestBed.inject(MockStore);
    effects = TestBed.inject(WorkspacesEffects);
    store.overrideSelector(selectCurrentAsset, SYMBOL);
    store.overrideSelector(selectWorkspaceMetaSnapshot, metaSnap);
    store.refreshState();
    const sync = new SessionSyncService({ client: syncClient } as SupabaseService, raceDb as never);
    await sync.markActiveDirty(SYMBOL);
    const dirty = await db.getMeta(SYMBOL);

    const sub = effects.persistMeta$.subscribe();
    store.refreshState();
    await new Promise((resolve) => setTimeout(resolve, 400));
    sub.unsubscribe();

    const stored = await db.getMeta(SYMBOL);
    expect(raceDb.getMeta).not.toHaveBeenCalled();
    expect(stored?.activeClientUpdatedAt).toBe(dirty?.activeClientUpdatedAt);
    expect(stored!.activeClientUpdatedAt).toBeGreaterThan(stored!.activeSyncedAt!);
    expect(stored?.trading?.positions).toHaveLength(1);
  });
});
