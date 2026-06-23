import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionSyncEffects } from './session-sync.effects';
import { AuthActions } from '../auth/auth.actions';
import { authFeature } from '../auth/auth.reducer';
import { SessionSyncService } from '../../services/session-sync.service';
import { WorkspaceDbService } from '../../services/workspace-db.service';
import { DialogService } from '../../components/ui/dialog.service';
import { TradingActions } from '../trading/trading.actions';
import { selectCurrentAsset, selectWorkspaceMetaSnapshot } from '../selectors';
import { workspaceDbStub } from '../../testing/workspace-db.stub';
import { defaultTradingData } from '../trading/trading.models';

describe('SessionSyncEffects', () => {
  let actions$: Subject<any>;
  let store: MockStore;
  let db: ReturnType<typeof workspaceDbStub>;
  let sync: {
    pullAndMerge: ReturnType<typeof vi.fn>;
    flushDirty: ReturnType<typeof vi.fn>;
    flushPendingDeletes: ReturnType<typeof vi.fn>;
    markActiveDirty: ReturnType<typeof vi.fn>;
    countAdoptableSessions: ReturnType<typeof vi.fn>;
    markAllAdoptableDirty: ReturnType<typeof vi.fn>;
  };
  let dialogs: { confirm: ReturnType<typeof vi.fn> };
  let effects: SessionSyncEffects;

  const SYMBOL = 'XAUUSD';
  const mockUser = { id: 'u1', email: 'a@b.com' };

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

  function setupTestBed() {
    db = workspaceDbStub();
    sync = {
      pullAndMerge: vi.fn().mockResolvedValue(undefined),
      flushDirty: vi.fn().mockResolvedValue(undefined),
      flushPendingDeletes: vi.fn().mockResolvedValue(undefined),
      markActiveDirty: vi.fn().mockResolvedValue(undefined),
      countAdoptableSessions: vi.fn().mockResolvedValue(0),
      markAllAdoptableDirty: vi.fn().mockResolvedValue(undefined),
    };
    dialogs = { confirm: vi.fn().mockResolvedValue(false) };
    TestBed.configureTestingModule({
      providers: [
        SessionSyncEffects,
        provideMockActions(() => actions$),
        provideMockStore(),
        { provide: WorkspaceDbService, useValue: db },
        { provide: SessionSyncService, useValue: sync },
        { provide: DialogService, useValue: dialogs },
      ],
    });
    store = TestBed.inject(MockStore);
    effects = TestBed.inject(SessionSyncEffects);
    store.overrideSelector(selectCurrentAsset, SYMBOL);
    store.overrideSelector(selectWorkspaceMetaSnapshot, metaSnap);
    store.overrideSelector(authFeature.selectStatus, 'authenticated');
    store.refreshState();
  }

  beforeEach(() => {
    actions$ = new Subject();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  // ─── login$ ───────────────────────────────────────────────────────────────

  describe('login$', () => {
    it('authSuccess does NOT trigger login$ (adoptOnLogin$ owns the sign-in pull)', async () => {
      setupTestBed();
      const sub = effects.login$.subscribe();

      actions$.next(AuthActions.authSuccess({ user: mockUser, returnUrl: null }));
      await Promise.resolve();
      await Promise.resolve();

      sub.unsubscribe();
      expect(sync.pullAndMerge).not.toHaveBeenCalled();
    });

    it('sessionResolved with a user → pullAndMerge called', async () => {
      setupTestBed();
      const sub = effects.login$.subscribe();

      actions$.next(AuthActions.sessionResolved({ user: mockUser, offline: false }));
      await Promise.resolve();
      await Promise.resolve();

      sub.unsubscribe();
      expect(sync.pullAndMerge).toHaveBeenCalledTimes(1);
    });

    it('sessionResolved with user:null (anonymous) → pullAndMerge NOT called', async () => {
      setupTestBed();
      const sub = effects.login$.subscribe();

      actions$.next(AuthActions.sessionResolved({ user: null, offline: false }));
      await Promise.resolve();
      await Promise.resolve();

      sub.unsubscribe();
      expect(sync.pullAndMerge).not.toHaveBeenCalled();
    });

    it('sessionResolved offline (guest path, no user) → pullAndMerge NOT called', async () => {
      setupTestBed();
      const sub = effects.login$.subscribe();

      actions$.next(AuthActions.sessionResolved({ user: null, offline: true }));
      await Promise.resolve();
      await Promise.resolve();

      sub.unsubscribe();
      expect(sync.pullAndMerge).not.toHaveBeenCalled();
    });

    it('swallows a pullAndMerge rejection (no throw)', async () => {
      setupTestBed();
      sync.pullAndMerge.mockRejectedValue(new Error('offline'));
      const sub = effects.login$.subscribe();

      await expect(
        (async () => {
          actions$.next(AuthActions.sessionResolved({ user: mockUser, offline: false }));
          await Promise.resolve();
          await Promise.resolve();
        })(),
      ).resolves.toBeUndefined();

      sub.unsubscribe();
      expect(sync.pullAndMerge).toHaveBeenCalledTimes(1);
    });
  });

  // ─── adoptOnLogin$ ────────────────────────────────────────────────────────

  describe('adoptOnLogin$', () => {
    async function fireAuthSuccess() {
      const sub = effects.adoptOnLogin$.subscribe();
      actions$.next(AuthActions.authSuccess({ user: mockUser, returnUrl: null }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      sub.unsubscribe();
    }

    it('no adoptable sessions → no dialog, still pulls', async () => {
      setupTestBed();
      sync.countAdoptableSessions.mockResolvedValue(0);
      await fireAuthSuccess();
      expect(dialogs.confirm).not.toHaveBeenCalled();
      expect(sync.markAllAdoptableDirty).not.toHaveBeenCalled();
      expect(sync.pullAndMerge).toHaveBeenCalledTimes(1);
    });

    it('adoptable sessions + confirm → marks them dirty then pulls', async () => {
      setupTestBed();
      sync.countAdoptableSessions.mockResolvedValue(2);
      dialogs.confirm.mockResolvedValue(true);
      await fireAuthSuccess();
      expect(dialogs.confirm).toHaveBeenCalledTimes(1);
      expect(sync.markAllAdoptableDirty).toHaveBeenCalledTimes(1);
      expect(sync.pullAndMerge).toHaveBeenCalledTimes(1);
    });

    it('adoptable sessions + decline → does NOT adopt, still pulls', async () => {
      setupTestBed();
      sync.countAdoptableSessions.mockResolvedValue(2);
      dialogs.confirm.mockResolvedValue(false);
      await fireAuthSuccess();
      expect(dialogs.confirm).toHaveBeenCalledTimes(1);
      expect(sync.markAllAdoptableDirty).not.toHaveBeenCalled();
      expect(sync.pullAndMerge).toHaveBeenCalledTimes(1);
    });
  });

  // ─── flushOnEdit$ ─────────────────────────────────────────────────────────

  describe('flushOnEdit$', () => {
    it('authenticated meta-snapshot change → after 2s debounce, markActiveDirty then flushDirty', async () => {
      vi.useFakeTimers();
      setupTestBed();

      const sub = effects.flushOnEdit$.subscribe();
      store.refreshState();
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();

      sub.unsubscribe();
      vi.useRealTimers();

      expect(sync.markActiveDirty).toHaveBeenCalledWith(SYMBOL);
      expect(sync.flushDirty).toHaveBeenCalledTimes(1);
    });

    it('unauthenticated snapshot change → neither markActiveDirty nor flushDirty called', async () => {
      vi.useFakeTimers();
      setupTestBed();
      store.overrideSelector(authFeature.selectStatus, 'anonymous');
      store.refreshState();

      const sub = effects.flushOnEdit$.subscribe();
      store.refreshState();
      vi.advanceTimersByTime(2000);
      await Promise.resolve();

      sub.unsubscribe();
      vi.useRealTimers();

      expect(sync.markActiveDirty).not.toHaveBeenCalled();
      expect(sync.flushDirty).not.toHaveBeenCalled();
    });

    it('no current asset → neither called', async () => {
      vi.useFakeTimers();
      setupTestBed();
      store.overrideSelector(selectCurrentAsset, null);
      store.refreshState();

      const sub = effects.flushOnEdit$.subscribe();
      store.refreshState();
      vi.advanceTimersByTime(2000);
      await Promise.resolve();

      sub.unsubscribe();
      vi.useRealTimers();

      expect(sync.markActiveDirty).not.toHaveBeenCalled();
      expect(sync.flushDirty).not.toHaveBeenCalled();
    });

    it('swallows a flushDirty rejection (no throw)', async () => {
      vi.useFakeTimers();
      setupTestBed();
      sync.flushDirty.mockRejectedValue(new Error('offline'));

      const sub = effects.flushOnEdit$.subscribe();
      store.refreshState();
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();

      sub.unsubscribe();
      vi.useRealTimers();

      expect(sync.flushDirty).toHaveBeenCalledTimes(1);
    });
  });

  // ─── propagateDelete$ ─────────────────────────────────────────────────────

  describe('propagateDelete$', () => {
    it('deleteSession when authenticated → addPendingDelete then flushPendingDeletes', async () => {
      setupTestBed();
      const sub = effects.propagateDelete$.subscribe();

      actions$.next(TradingActions.deleteSession({ id: 'sess-1' }));
      await Promise.resolve();
      await Promise.resolve();

      sub.unsubscribe();
      expect(db.addPendingDelete).toHaveBeenCalledWith({ entity: 'session', id: 'sess-1' });
      expect(sync.flushPendingDeletes).toHaveBeenCalledTimes(1);
    });

    it('deleteSession when NOT authenticated → neither called', async () => {
      setupTestBed();
      store.overrideSelector(authFeature.selectStatus, 'guest');
      store.refreshState();

      const sub = effects.propagateDelete$.subscribe();

      actions$.next(TradingActions.deleteSession({ id: 'sess-1' }));
      await Promise.resolve();
      await Promise.resolve();

      sub.unsubscribe();
      expect(db.addPendingDelete).not.toHaveBeenCalled();
      expect(sync.flushPendingDeletes).not.toHaveBeenCalled();
    });

    it('swallows a flushPendingDeletes rejection (no throw)', async () => {
      setupTestBed();
      sync.flushPendingDeletes.mockRejectedValue(new Error('offline'));
      const sub = effects.propagateDelete$.subscribe();

      await expect(
        (async () => {
          actions$.next(TradingActions.deleteSession({ id: 'sess-1' }));
          await Promise.resolve();
          await Promise.resolve();
        })(),
      ).resolves.toBeUndefined();

      sub.unsubscribe();
      expect(db.addPendingDelete).toHaveBeenCalledWith({ entity: 'session', id: 'sess-1' });
    });
  });
});
