import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import type { Action } from '@ngrx/store';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LessonsEffects } from './lessons.effects';
import { LessonsActions } from './lessons.actions';
import { lessonsFeature } from './lessons.reducer';
import { LessonsDbService } from '../../services/lessons-db.service';
import { SessionSyncService } from '../../services/session-sync.service';
import { Lesson } from './lessons.models';
import { selectLessons } from './lessons.selectors';
import { AuthActions } from '../auth/auth.actions';
import { authFeature } from '../auth/auth.reducer';
import { OwnerIdentityService } from '../../services/owner-identity.service';

// ---------------------------------------------------------------------------
// RFC-016 Task 3: LessonsEffects cloud sync (pushDirty$/pullOnAuth$). Mirrors
// playbook.effects.spec.ts's pushDirty$/pullOnAuth$ describe blocks line by
// line, adapted to Lesson's shape and LessonsDbService/SessionSyncService
// (mocked as plain objects here, same idiom as playbook.effects.spec.ts —
// NOT the real fake-indexeddb LessonsDbService used by lessons.effects.spec.ts,
// which is a separate, untouched Task 2 file covering hydrate$/persist$).
// ---------------------------------------------------------------------------

function lesson(id: string, over: Partial<Lesson> = {}): Lesson {
  return {
    id,
    authoredAt: 1,
    whatHappened: 'text',
    repeat: 'text',
    avoid: 'text',
    linkedRuleIds: [],
    evidence: [],
    tradeRefs: [],
    sessionRef: 'sess1',
    ...over,
  };
}

/**
 * `Store.dispatch` is overloaded (plain `Action` vs. a `() => Action` thunk
 * form), which makes `vi.spyOn(store, 'dispatch').mock.calls[n][0]` infer as
 * the thunk overload in some contexts. Every call site in this file only
 * ever dispatches plain `Action` objects, so this narrows that safely rather
 * than reading `.type` off a union that includes a bare function type.
 */
function dispatchedAction(call: unknown[]): Action {
  return call[0] as Action;
}

async function settleEffects(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe('LessonsEffects — cloud sync (RFC-016 Task 3)', () => {
  let actions$: Subject<any>;
  let store: MockStore;
  let effects: LessonsEffects;
  let ownerId: string | null;
  let ownerService: { ownerId: ReturnType<typeof vi.fn> };
  let dbService: {
    loadAll: ReturnType<typeof vi.fn>;
    upsertMany: ReturnType<typeof vi.fn>;
  };
  let syncService: {
    captureOwner: ReturnType<typeof vi.fn>;
    assertExpectedOwner: ReturnType<typeof vi.fn>;
    pushLessons: ReturnType<typeof vi.fn>;
    pullLessons: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    actions$ = new Subject();
    ownerId = 'owner-a';
    ownerService = { ownerId: vi.fn(async () => ownerId) };
    dbService = {
      loadAll: vi.fn(async (expected?: string) => {
        if (expected && ownerId !== expected) throw new Error('owner drift');
        return [];
      }),
      upsertMany: vi.fn(async (_lessons: Lesson[], expected?: string) => {
        if (expected && ownerId !== expected) throw new Error('owner drift');
      }),
    };
    syncService = {
      captureOwner: vi.fn(async () => {
        if (!ownerId) throw new Error('no owner');
        return ownerId;
      }),
      assertExpectedOwner: vi.fn(async (expected: string) => {
        if (ownerId !== expected) throw new Error('owner drift');
      }),
      pushLessons: vi.fn().mockResolvedValue(undefined),
      pullLessons: vi.fn().mockResolvedValue([]),
    };
    TestBed.configureTestingModule({
      providers: [
        LessonsEffects,
        provideMockActions(() => actions$),
        provideMockStore(),
        { provide: LessonsDbService, useValue: dbService },
        { provide: SessionSyncService, useValue: syncService },
        { provide: OwnerIdentityService, useValue: ownerService },
      ],
    });
    store = TestBed.inject(MockStore);
    effects = TestBed.inject(LessonsEffects);
  });

  afterEach(() => {
    store.resetSelectors();
    vi.useRealTimers();
  });

  describe('persist$', () => {
    it('persists to the memoized owner partition when the token expires offline', async () => {
      const currentLessons = [lesson('offline', { clientUpdatedAt: 100 })];
      store.overrideSelector(selectLessons, currentLessons);
      syncService.captureOwner.mockRejectedValue(new Error('token expired offline'));
      const sub = effects.persist$.subscribe();

      actions$.next(
        LessonsActions.updateLesson({
          id: 'offline',
          whatHappened: 'updated',
          clientUpdatedAt: 100,
        }),
      );
      await settleEffects();

      sub.unsubscribe();
      expect(ownerService.ownerId).toHaveBeenCalled();
      expect(syncService.captureOwner).not.toHaveBeenCalled();
      expect(dbService.upsertMany).toHaveBeenCalledWith(currentLessons, 'owner-a');
    });
  });

  describe('pushDirty$', () => {
    function setupAuthenticated(lessons: Lesson[]): void {
      store.overrideSelector(selectLessons, lessons);
      store.overrideSelector(authFeature.selectStatus, 'authenticated');
      store.refreshState();
    }

    it('pushes exactly the dirty subset (clientUpdatedAt > syncedAt), excluding clean rows', async () => {
      vi.useFakeTimers();
      const clean = lesson('clean', { clientUpdatedAt: 1000, syncedAt: 1000 });
      const dirty = lesson('dirty', { clientUpdatedAt: 2000, syncedAt: 1000 });
      setupAuthenticated([clean, dirty]);

      const sub = effects.pushDirty$.subscribe();
      actions$.next(LessonsActions.createLesson({ lesson: lesson('x') }));
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      sub.unsubscribe();

      expect(syncService.pushLessons).toHaveBeenCalledTimes(1);
      expect(syncService.pushLessons).toHaveBeenCalledWith([dirty]);
    });

    it('dispatches lessonsSynced stamping ONLY syncedAt (to the pushed clientUpdatedAt), no clientUpdatedAt in the payload', async () => {
      vi.useFakeTimers();
      const dispatchSpy = vi.spyOn(store, 'dispatch');
      const dirty = lesson('a', { clientUpdatedAt: 3000, syncedAt: 1000 });
      setupAuthenticated([dirty]);

      const sub = effects.pushDirty$.subscribe();
      actions$.next(LessonsActions.createLesson({ lesson: lesson('x') }));
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      sub.unsubscribe();

      await settleEffects();
      expect(dispatchSpy).toHaveBeenCalledWith(
        LessonsActions.lessonsSynced({ stamps: [{ id: 'a', syncedAt: 3000 }] }),
      );
    });

    it('does nothing when no lesson is dirty', async () => {
      vi.useFakeTimers();
      setupAuthenticated([lesson('clean', { clientUpdatedAt: 1000, syncedAt: 1000 })]);

      const sub = effects.pushDirty$.subscribe();
      actions$.next(LessonsActions.createLesson({ lesson: lesson('x') }));
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();

      sub.unsubscribe();

      expect(syncService.pushLessons).not.toHaveBeenCalled();
    });

    it('does not push when the auth status is not "authenticated"', async () => {
      vi.useFakeTimers();
      store.overrideSelector(selectLessons, [
        lesson('a', { clientUpdatedAt: 2000, syncedAt: 1000 }),
      ]);
      store.overrideSelector(authFeature.selectStatus, 'anonymous');
      store.refreshState();

      const sub = effects.pushDirty$.subscribe();
      actions$.next(LessonsActions.createLesson({ lesson: lesson('x') }));
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();

      sub.unsubscribe();

      expect(syncService.pushLessons).not.toHaveBeenCalled();
    });

    it('swallows a push rejection (no lessonsSynced dispatched, no throw)', async () => {
      vi.useFakeTimers();
      const dispatchSpy = vi.spyOn(store, 'dispatch');
      syncService.pushLessons.mockRejectedValue(new Error('offline'));
      setupAuthenticated([lesson('a', { clientUpdatedAt: 2000, syncedAt: 1000 })]);

      const sub = effects.pushDirty$.subscribe();
      await expect(
        (async () => {
          actions$.next(LessonsActions.createLesson({ lesson: lesson('x') }));
          vi.advanceTimersByTime(2000);
          await Promise.resolve();
          await Promise.resolve();
          await Promise.resolve();
        })(),
      ).resolves.toBeUndefined();

      sub.unsubscribe();

      expect(syncService.pushLessons).toHaveBeenCalledTimes(1);
      expect(
        dispatchSpy.mock.calls.some(
          (c) => dispatchedAction(c).type === LessonsActions.lessonsSynced.type,
        ),
      ).toBe(false);
    });

    it('mid-flight edit stays dirty: an edit landing after the push snapshot survives the resulting lessonsSynced (real reducer)', async () => {
      vi.useFakeTimers();
      const dispatchSpy = vi.spyOn(store, 'dispatch');
      const pushedSnapshot = lesson('a', { clientUpdatedAt: 500, syncedAt: undefined });
      setupAuthenticated([pushedSnapshot]);

      const sub = effects.pushDirty$.subscribe();
      actions$.next(
        LessonsActions.updateLesson({ id: 'a', whatHappened: 't2', clientUpdatedAt: 500 }),
      );
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      sub.unsubscribe();

      await settleEffects();
      const lessonsSyncedCall = dispatchSpy.mock.calls.find(
        (c) => dispatchedAction(c).type === LessonsActions.lessonsSynced.type,
      );
      expect(lessonsSyncedCall).toBeDefined();
      const lessonsSyncedAction = dispatchedAction(lessonsSyncedCall!);

      // Simulate, through the REAL reducer, an edit that bumps clientUpdatedAt
      // to 900 AFTER the push above snapshotted 500, but BEFORE lessonsSynced
      // (still carrying syncedAt: 500) is applied.
      const stateAfterMidFlightEdit = lessonsFeature.reducer(
        { lessons: [pushedSnapshot], loaded: true },
        LessonsActions.updateLesson({ id: 'a', whatHappened: 't3', clientUpdatedAt: 900 }),
      );
      const stateAfterSync = lessonsFeature.reducer(stateAfterMidFlightEdit, lessonsSyncedAction);

      const finalLesson = stateAfterSync.lessons[0];
      expect(finalLesson.clientUpdatedAt).toBe(900);
      expect(finalLesson.syncedAt).toBe(500);
      expect(finalLesson.clientUpdatedAt! > finalLesson.syncedAt!).toBe(true); // still dirty
    });

    it('does not stamp A lessons synced when the owner changes after the cloud push returns', async () => {
      vi.useFakeTimers();
      let resolvePush!: () => void;
      syncService.pushLessons.mockImplementation(
        () => new Promise<void>((resolve) => (resolvePush = resolve)),
      );
      const dispatchSpy = vi.spyOn(store, 'dispatch');
      setupAuthenticated([lesson('a', { clientUpdatedAt: 500, syncedAt: 100 })]);
      const sub = effects.pushDirty$.subscribe();

      actions$.next(
        LessonsActions.updateLesson({ id: 'a', whatHappened: 't2', clientUpdatedAt: 500 }),
      );
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
      resolvePush();
      ownerId = 'owner-b';
      await Promise.resolve();
      await Promise.resolve();

      sub.unsubscribe();
      expect(
        dispatchSpy.mock.calls.some(
          (call) => dispatchedAction(call).type === LessonsActions.lessonsSynced.type,
        ),
      ).toBe(false);
    });
  });

  describe('pullOnAuth$', () => {
    it('pull -> LWW merge -> local upsert -> hydrated dispatch -> post-merge dirty flush (push-after-pull)', async () => {
      const keptLocalNewer = lesson('kept-local-newer', { clientUpdatedAt: 3000, syncedAt: 1000 });
      const staleRemoteCounterpart = lesson('kept-local-newer', {
        clientUpdatedAt: 2000,
        syncedAt: 2000,
      });
      const cloudOnly = lesson('cloud-only', { clientUpdatedAt: 5000, syncedAt: 5000 });

      dbService.loadAll.mockResolvedValue([keptLocalNewer]);
      syncService.pullLessons.mockResolvedValue([staleRemoteCounterpart, cloudOnly]);
      const dispatchSpy = vi.spyOn(store, 'dispatch');

      const sub = effects.pullOnAuth$.subscribe();
      actions$.next(AuthActions.sessionResolved({ user: { id: 'owner-a', email: 'a@b.com' } }));

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      sub.unsubscribe();

      await settleEffects();
      // remote-missing local-newer row is NOT written locally (already there);
      // only the cloud-only insert is.
      expect(dbService.upsertMany).toHaveBeenCalledTimes(1);
      expect(dbService.upsertMany).toHaveBeenCalledWith([cloudOnly], 'owner-a');

      const hydratedCall = dispatchSpy.mock.calls.find(
        (c) => dispatchedAction(c).type === LessonsActions.hydrated.type,
      );
      expect(hydratedCall).toBeDefined();
      expect(dispatchedAction(hydratedCall!)).toEqual(
        LessonsActions.hydrated({ lessons: [keptLocalNewer, cloudOnly] }),
      );

      // post-merge flush pushes exactly the still-dirty local-newer survivor
      // (cloud-only is clientUpdatedAt === syncedAt, not dirty)
      expect(syncService.pushLessons).toHaveBeenCalledTimes(1);
      expect(syncService.pushLessons).toHaveBeenCalledWith([keptLocalNewer]);

      const lessonsSyncedCall = dispatchSpy.mock.calls.find(
        (c) => dispatchedAction(c).type === LessonsActions.lessonsSynced.type,
      );
      expect(dispatchedAction(lessonsSyncedCall!)).toEqual(
        LessonsActions.lessonsSynced({ stamps: [{ id: 'kept-local-newer', syncedAt: 3000 }] }),
      );
    });

    it('a null user (anonymous) does not pull', async () => {
      const sub = effects.pullOnAuth$.subscribe();

      actions$.next(AuthActions.sessionResolved({ user: null }));
      await Promise.resolve();
      await Promise.resolve();

      sub.unsubscribe();

      expect(syncService.pullLessons).not.toHaveBeenCalled();
    });

    it('swallows a pull rejection (no throw, nothing dispatched)', async () => {
      syncService.pullLessons.mockRejectedValue(new Error('offline'));
      const dispatchSpy = vi.spyOn(store, 'dispatch');

      const sub = effects.pullOnAuth$.subscribe();
      await expect(
        (async () => {
          actions$.next(AuthActions.sessionResolved({ user: { id: 'owner-a', email: 'a@b.com' } }));
          await Promise.resolve();
          await Promise.resolve();
          await Promise.resolve();
        })(),
      ).resolves.toBeUndefined();

      sub.unsubscribe();

      expect(dispatchSpy).not.toHaveBeenCalled();
    });

    it('does not load, persist, hydrate, or push A pull results after owner drift', async () => {
      let resolvePull!: (lessons: Lesson[]) => void;
      syncService.pullLessons.mockImplementation(
        () => new Promise((resolve) => (resolvePull = resolve)),
      );
      const dispatchSpy = vi.spyOn(store, 'dispatch');
      const sub = effects.pullOnAuth$.subscribe();

      actions$.next(AuthActions.sessionResolved({ user: { id: 'owner-a', email: 'a@b.com' } }));
      resolvePull([lesson('remote-a')]);
      ownerId = 'owner-b';
      await Promise.resolve();
      await Promise.resolve();

      sub.unsubscribe();
      expect(dbService.loadAll).not.toHaveBeenCalled();
      expect(dbService.upsertMany).not.toHaveBeenCalled();
      expect(syncService.pushLessons).not.toHaveBeenCalled();
      expect(
        dispatchSpy.mock.calls.some(
          (call) => dispatchedAction(call).type === LessonsActions.hydrated.type,
        ),
      ).toBe(false);
    });

    it('does not persist or hydrate A merge after owner drift during local load', async () => {
      let resolveLoad!: (lessons: Lesson[]) => void;
      dbService.loadAll.mockImplementation(() => new Promise((resolve) => (resolveLoad = resolve)));
      syncService.pullLessons.mockResolvedValue([lesson('remote-a')]);
      const dispatchSpy = vi.spyOn(store, 'dispatch');
      const sub = effects.pullOnAuth$.subscribe();

      actions$.next(AuthActions.sessionResolved({ user: { id: 'owner-a', email: 'a@b.com' } }));
      await Promise.resolve();
      await Promise.resolve();
      resolveLoad([]);
      ownerId = 'owner-b';
      await Promise.resolve();
      await Promise.resolve();

      sub.unsubscribe();
      expect(dbService.upsertMany).not.toHaveBeenCalled();
      expect(syncService.pushLessons).not.toHaveBeenCalled();
      expect(
        dispatchSpy.mock.calls.some(
          (call) => dispatchedAction(call).type === LessonsActions.hydrated.type,
        ),
      ).toBe(false);
    });
  });
});
