import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import type { Action } from '@ngrx/store';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LessonsEffects } from './lessons.effects';
import { LessonsActions } from './lessons.actions';
import { LessonsDbService } from '../../services/lessons-db.service';
import { SessionSyncService } from '../../services/session-sync.service';
import { Lesson } from './lessons.models';
import { selectLessons } from './lessons.selectors';
import { AuthActions } from '../auth/auth.actions';
import { authFeature } from '../auth/auth.reducer';
import { OwnerIdentityService } from '../../services/owner-identity.service';

/**
 * RFC-015/016 audit L-2 (defense in depth) and L-3: one unwritable lesson must
 * not block the others, a transient storage error must not drop a row from the
 * store, and a refused lesson must never be stamped as synced.
 */
function lesson(id: string, over: Partial<Lesson> = {}): Lesson {
  return {
    id,
    authoredAt: 1,
    whatHappened: 't',
    repeat: 't',
    avoid: 't',
    linkedRuleIds: [],
    evidence: [],
    tradeRefs: [],
    sessionRef: 's',
    ...over,
  };
}

const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

describe('LessonsEffects resilience (L-2 defense in depth, L-3)', () => {
  let actions$: Subject<Action>;
  let store: MockStore;
  let effects: LessonsEffects;
  let ownerId: string;
  let db: { loadAll: ReturnType<typeof vi.fn>; upsertMany: ReturnType<typeof vi.fn> };
  let sync: {
    captureOwner: ReturnType<typeof vi.fn>;
    assertExpectedOwner: ReturnType<typeof vi.fn>;
    pushLessons: ReturnType<typeof vi.fn>;
    pullLessons: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    actions$ = new Subject();
    ownerId = 'owner-a';
    db = { loadAll: vi.fn(async () => []), upsertMany: vi.fn(async () => undefined) };
    sync = {
      captureOwner: vi.fn(async () => ownerId),
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
        { provide: LessonsDbService, useValue: db },
        { provide: SessionSyncService, useValue: sync },
        { provide: OwnerIdentityService, useValue: { ownerId: vi.fn(async () => ownerId) } },
      ],
    });
    store = TestBed.inject(MockStore);
    effects = TestBed.inject(LessonsEffects);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    store.resetSelectors();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('persist$ (L-2)', () => {
    it('writes lesson by lesson when the batch fails, so one bad lesson does not block the rest', async () => {
      const bad = lesson('bad');
      const good = lesson('good');
      store.overrideSelector(selectLessons, [bad, good]);
      db.upsertMany.mockImplementation(async (ls: Lesson[]) => {
        if (ls.some((l) => l.id === 'bad')) throw new Error('J-1 raster guard');
      });
      const sub = effects.persist$.subscribe();

      actions$.next(LessonsActions.updateLesson({ id: 'good', clientUpdatedAt: 9 }));
      await settle();
      sub.unsubscribe();

      expect(db.upsertMany).toHaveBeenCalledWith([good], 'owner-a');
    });
  });

  describe('pullOnAuth$ (L-3)', () => {
    async function pull(): Promise<ReturnType<typeof vi.spyOn>> {
      const dispatchSpy = vi.spyOn(store, 'dispatch');
      const sub = effects.pullOnAuth$.subscribe();
      actions$.next(AuthActions.sessionResolved({ user: { id: 'owner-a', email: 'a@b.c' } }));
      await settle();
      await settle();
      sub.unsubscribe();
      return dispatchSpy as never;
    }

    const hydratedIds = (spy: { mock: { calls: unknown[][] } }): string[] | undefined => {
      const call = spy.mock.calls.find(
        (c) => (c[0] as unknown as Action).type === LessonsActions.hydrated.type,
      );
      return call
        ? (call[0] as ReturnType<typeof LessonsActions.hydrated>).lessons.map((l) => l.id)
        : undefined;
    };

    it('keeps in the store a row whose write failed for storage reasons (QuotaExceededError), and logs it', async () => {
      const cloudOnly = lesson('quota-row', { clientUpdatedAt: 5, syncedAt: 5 });
      sync.pullLessons.mockResolvedValue([cloudOnly]);
      db.upsertMany.mockImplementation(async () => {
        throw new DOMException('disk full', 'QuotaExceededError');
      });

      const spy = await pull();

      expect(hydratedIds(spy)).toEqual(['quota-row']);
      expect(console.warn).toHaveBeenCalled();
    });

    it('still drops a row the synchronous guards refuse', async () => {
      const bad = lesson('bad', { clientUpdatedAt: 5, syncedAt: 5 });
      const good = lesson('good', { clientUpdatedAt: 5, syncedAt: 5 });
      sync.pullLessons.mockResolvedValue([bad, good]);
      db.upsertMany.mockImplementation(async (ls: Lesson[]) => {
        if (ls.some((l) => l.id === 'bad')) throw new Error('J-1 raster guard: pixels');
      });

      const spy = await pull();

      expect(hydratedIds(spy)).toEqual(['good']);
    });

    it('aborts the pull on owner drift during the per-lesson retry', async () => {
      sync.pullLessons.mockResolvedValue([lesson('x', { clientUpdatedAt: 5, syncedAt: 5 })]);
      db.upsertMany.mockImplementation(async () => {
        ownerId = 'owner-b';
        throw new DOMException('disk full', 'QuotaExceededError');
      });

      const spy = await pull();

      expect(hydratedIds(spy)).toBeUndefined();
    });
  });

  describe('pushDirty$ (L-2)', () => {
    it('never stamps as synced a lesson the J-1 guard refuses, and still pushes and stamps the rest', async () => {
      vi.useFakeTimers();
      const pixels = lesson('pixels', {
        whatHappened: 'data:image/png;base64,AAA',
        clientUpdatedAt: 7,
      });
      const ok = lesson('ok', { clientUpdatedAt: 8 });
      store.overrideSelector(selectLessons, [pixels, ok]);
      store.overrideSelector(authFeature.selectStatus, 'authenticated');
      store.refreshState();
      const dispatchSpy = vi.spyOn(store, 'dispatch');
      const sub = effects.pushDirty$.subscribe();

      actions$.next(LessonsActions.createLesson({ lesson: lesson('x') }));
      vi.advanceTimersByTime(2000);
      await settle();
      sub.unsubscribe();

      expect(sync.pushLessons).toHaveBeenCalledWith([ok]);
      const synced = dispatchSpy.mock.calls.find(
        (c) => (c[0] as unknown as Action).type === LessonsActions.lessonsSynced.type,
      );
      expect(synced![0]).toEqual(
        LessonsActions.lessonsSynced({ stamps: [{ id: 'ok', syncedAt: 8 }] }),
      );
    });
  });
});
