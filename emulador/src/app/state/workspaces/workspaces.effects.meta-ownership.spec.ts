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
import { createInitialLayoutState } from '../layout/layout.models';
import { position, workspaceMeta } from '../../testing/fixtures';

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

    const sync = new SessionSyncService({} as SupabaseService, db);
    const upsert = vi.spyOn(sync, 'upsertSession').mockResolvedValue();
    await sync.flushDirty();

    expect(upsert).toHaveBeenCalledOnce();
    expect(outgoing!.activeSessionId).toBe('sess-A');
    expect(outgoing!.activeSyncedAt).toBe(110);
    expect(outgoing!.activeClientUpdatedAt).toBe(112);
    expect(outgoing!.activeClientUpdatedAt).toBeGreaterThan(111);
    expect(outgoing!.activeClientUpdatedAt).toBeGreaterThan(outgoing!.activeSyncedAt!);
  });

  it('CONTRAST: persistMeta$ preserves the very same clocks (so the asymmetry is real)', async () => {
    const sub = effects.persistMeta$.subscribe();
    // persistMeta$ is debounced 300 ms off the snapshot selector; MockStore
    // replays the overridden value on subscribe, so waiting is enough.
    await new Promise((r) => setTimeout(r, 400));
    sub.unsubscribe();

    const stored = await db.getMeta(SYMBOL);
    expect(stored!.activeClientUpdatedAt).toBe(111);
    expect(stored!.activeSyncedAt).toBe(110);
  });
});
