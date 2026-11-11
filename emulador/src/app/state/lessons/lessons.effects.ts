import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType, ROOT_EFFECTS_INIT } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import {
  auditTime,
  catchError,
  concatMap,
  exhaustMap,
  filter,
  from,
  map,
  switchMap,
  EMPTY,
  withLatestFrom,
} from 'rxjs';
import { LessonsActions } from './lessons.actions';
import { selectLessons } from './lessons.selectors';
import { LessonsDbService } from '../../services/lessons-db.service';
import { Lesson } from './lessons.models';
import {
  isLessonDirty,
  mergeLessonsPull,
  SessionSyncService,
} from '../../services/session-sync.service';
import { AuthActions } from '../auth/auth.actions';
import { authFeature } from '../auth/auth.reducer';
import { findRasterViolation } from '../../domain/reflection/lesson-raster-guard';
import { OwnerIdentityService } from '../../services/owner-identity.service';

/**
 * A failure of the storage layer itself (`QuotaExceededError`, `AbortError`, …:
 * IndexedDB reports these as `DOMException`s with a specific name) as opposed to
 * a guard refusal, which is a plain `Error` thrown synchronously by
 * `LessonsDbService` before any I/O. Any exception other than a plain guard
 * `Error` counts as a storage error and is kept in the store, on purpose: it
 * fails safe (the lesson is retried later, never dropped).
 */
function isStorageError(err: unknown): boolean {
  if (typeof DOMException !== 'undefined' && err instanceof DOMException) return true;
  const name = (err as { name?: unknown } | null)?.name;
  return typeof name === 'string' && name !== 'Error';
}

@Injectable()
export class LessonsEffects {
  private actions$ = inject(Actions);
  private store = inject(Store);
  private db = inject(LessonsDbService);
  private sync = inject(SessionSyncService);
  private owner = inject(OwnerIdentityService);

  /**
   * Bootstrap hydration: dispatch LessonsActions.hydrate on app initialization
   * (ROOT_EFFECTS_INIT), which then loads all persisted lessons from IndexedDB.
   */
  bootstrapHydrate$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ROOT_EFFECTS_INIT),
      map(() => LessonsActions.hydrate()),
    ),
  );

  /**
   * Load all lessons from the local database on hydrate action.
   * If the DB fails, emit hydrated with empty lessons to keep the app alive
   * (stream survives rejection).
   */
  hydrate$ = createEffect(() =>
    this.actions$.pipe(
      ofType(LessonsActions.hydrate),
      switchMap(() => from(this.loadLessons()).pipe(catchError(() => EMPTY))),
    ),
  );

  /**
   * Persist current lessons to the local database whenever they change.
   * Listens to all state-changing actions (create/update/sync) and always
   * persists the CURRENT lessons (via selectLessons), not the action payload.
   * Errors are swallowed (stream survives rejection) so other effects can run.
   */
  persist$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(
          LessonsActions.createLesson,
          LessonsActions.updateLesson,
          LessonsActions.lessonsSynced,
        ),
        withLatestFrom(this.store.select(selectLessons)),
        concatMap(([, lessons]) =>
          from(this.persistLessons(lessons)).pipe(catchError(() => EMPTY)),
        ),
      ),
    { dispatch: false },
  );

  /**
   * RFC-016 Task 3 (playbook parity, D15.F pattern): debounced push of dirty
   * rows to the cloud after any mutation (`lessonsSynced` itself excluded
   * from the trigger list — it is push's own result, not a new local edit,
   * so including it would loop). `auditTime(2000)` mirrors
   * `PlaybookEffects.pushDirty$`'s coalescing, letting a burst of edits
   * settle into one push. Dirtiness is the literal predicate alone
   * (`isLessonDirty`) — the reducer stamps `clientUpdatedAt` at every
   * mutation (createLesson/updateLesson), so this doesn't need to widen the
   * selection or mint a timestamp here; the value pushed is always whatever
   * the reducer already stamped. `{ dispatch: false }`: the resulting
   * `lessonsSynced` is dispatched manually on success (see
   * `pushDirtyLessons`), not emitted by this effect's own stream.
   */
  pushDirty$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(LessonsActions.createLesson, LessonsActions.updateLesson),
        auditTime(2000),
        withLatestFrom(
          this.store.select(selectLessons),
          this.store.select(authFeature.selectStatus),
        ),
        filter(([, , status]) => status === 'authenticated'),
        concatMap(([, lessons]) =>
          from(this.pushDirtyLessons(lessons)).pipe(catchError(() => EMPTY)),
        ),
      ),
    { dispatch: false },
  );

  /**
   * Pushes exactly the dirty subset of `lessons` and, on success, stamps
   * `syncedAt` (ONLY `syncedAt` — playbook parity) to the `clientUpdatedAt`
   * value that was actually pushed for each row, snapshotted here BEFORE the
   * network call. If an edit lands on a row after this snapshot but before
   * `lessonsSynced` is dispatched, the reducer's `lessonsSynced` handler
   * never touches `clientUpdatedAt`, so the row is still `clientUpdatedAt >
   * syncedAt` afterward — still dirty, picked up by the next push cycle
   * (mid-flight-edit safety, same idiom as playbook.effects.spec.ts).
   */
  private async pushDirtyLessons(lessons: Lesson[], expectedOwnerId?: string): Promise<void> {
    // A lesson the J-1 guard refuses is never pushed (and so never stamped synced).
    const dirty = lessons.filter(isLessonDirty).filter((l) => {
      const part = findRasterViolation(l);
      if (part) console.warn(`[lessons] push: skipping lesson ${l.id} (J-1 raster guard, ${part})`);
      return !part;
    });
    if (!dirty.length) return;
    expectedOwnerId ??= await this.sync.captureOwner();
    await this.sync.assertExpectedOwner(expectedOwnerId);
    await this.sync.pushLessons(dirty);
    await this.sync.assertExpectedOwner(expectedOwnerId);
    this.store.dispatch(
      LessonsActions.lessonsSynced({
        stamps: dirty.map((l) => ({ id: l.id, syncedAt: l.clientUpdatedAt! })),
      }),
    );
  }

  /**
   * RFC-016 Task 3: pull + LWW merge, chained to the SAME auth/bootstrap
   * trigger the playbook/folders/sessions pull uses (both `sessionResolved`
   * — app start — and `authSuccess` — mid-session login), non-null user
   * only. `exhaustMap` ignores a second trigger while one pull is in flight
   * (playbook parity). `{ dispatch: false }`: `pullAndMergeLessons`
   * dispatches `hydrated` (the merge) and then `lessonsSynced` (the
   * post-merge push) manually, in that order, rather than relying on this
   * effect's own emission — the push step needs the already-merged
   * `lessons` array as its input, not a fresh store read.
   */
  pullOnAuth$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AuthActions.sessionResolved, AuthActions.authSuccess),
        filter((action) => action.user != null),
        exhaustMap((action) =>
          from(this.pullAndMergeLessons(action.user!.id)).pipe(catchError(() => EMPTY)),
        ),
      ),
    { dispatch: false },
  );

  /**
   * Pull, LWW-merge against local, persist the merge, hydrate the store,
   * THEN flush any local-newer survivors back to the cloud (playbook parity:
   * `PlaybookEffects.pullAndMergeRules` -> post-merge `pushDirtyRules`).
   * This matters most right after app start: a lesson edited last session
   * that never got pushed (closed before the debounce fired, or offline)
   * has no NEW mutation action to re-trigger `pushDirty$` — only this
   * post-merge flush notices it's still dirty and re-pushes it.
   */
  private async pullAndMergeLessons(expectedOwnerId: string): Promise<void> {
    const remote = await this.sync.pullLessons();
    await this.sync.assertExpectedOwner(expectedOwnerId);
    const local = await this.db.loadAll(expectedOwnerId);
    await this.sync.assertExpectedOwner(expectedOwnerId);
    const merged = mergeLessonsPull(local, remote);
    let lessons = merged.lessons;
    if (merged.toUpsertLocally.length) {
      await this.sync.assertExpectedOwner(expectedOwnerId);
      const unwritable = await this.upsertSkippingUnwritable(
        merged.toUpsertLocally,
        expectedOwnerId,
      );
      // A lesson local storage refuses must stay out of the store too: `persist$`
      // writes lesson by lesson when its batch is refused (so it no longer
      // poisons later saves), but it would skip and log the refused lesson again
      // on every save.
      if (unwritable.size) lessons = lessons.filter((l) => !unwritable.has(l.id));
    }
    await this.sync.assertExpectedOwner(expectedOwnerId);
    this.store.dispatch(LessonsActions.hydrated({ lessons }));
    await this.pushDirtyLessons(lessons, expectedOwnerId);
  }

  /**
   * Writes the batch in one transaction; if the batch is refused, retries lesson by
   * lesson so ONE unwritable lesson cannot abort the whole write. Returns the ids
   * the synchronous guards REFUSED (callers drop those from the store); a lesson
   * that failed for storage reasons (`QuotaExceededError` and kin) is only logged,
   * because the lesson itself is fine and must not vanish from the store. Owner
   * drift still aborts. Every skipped lesson is logged.
   */
  private async upsertSkippingUnwritable(
    batch: Lesson[],
    expectedOwnerId: string,
    context: 'pull' | 'persist' = 'pull',
  ): Promise<Set<string>> {
    try {
      await this.db.upsertMany(batch, expectedOwnerId);
      return new Set();
    } catch {
      const refused = new Set<string>();
      for (const lesson of batch) {
        try {
          await this.sync.assertExpectedOwner(expectedOwnerId);
          await this.db.upsertMany([lesson], expectedOwnerId);
        } catch (err) {
          await this.sync.assertExpectedOwner(expectedOwnerId); // owner drift still aborts
          if (isStorageError(err)) {
            console.warn(
              `[lessons] ${context}: could not write lesson ${lesson.id} (storage error), keeping it`,
              err,
            );
          } else {
            refused.add(lesson.id);
            console.warn(`[lessons] ${context}: skipping unwritable lesson ${lesson.id}`, err);
          }
        }
      }
      return refused;
    }
  }

  private async loadLessons() {
    const expectedOwnerId = await this.sync.captureOwner();
    try {
      const lessons = await this.db.loadAll(expectedOwnerId);
      await this.sync.assertExpectedOwner(expectedOwnerId);
      return LessonsActions.hydrated({ lessons });
    } catch {
      await this.sync.assertExpectedOwner(expectedOwnerId);
      return LessonsActions.hydrated({ lessons: [] });
    }
  }

  private async persistLessons(lessons: Lesson[]): Promise<void> {
    const expectedOwnerId = await this.owner.ownerId();
    if (!expectedOwnerId) return;
    // Lesson by lesson if the batch is refused: one unwritable lesson must not
    // block every later local save.
    await this.upsertSkippingUnwritable(lessons, expectedOwnerId, 'persist');
  }
}
