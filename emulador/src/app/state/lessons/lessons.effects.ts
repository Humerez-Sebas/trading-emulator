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
import { isLessonDirty, mergeLessonsPull, SessionSyncService } from '../../services/session-sync.service';
import { AuthActions } from '../auth/auth.actions';
import { authFeature } from '../auth/auth.reducer';

@Injectable()
export class LessonsEffects {
  private actions$ = inject(Actions);
  private store = inject(Store);
  private db = inject(LessonsDbService);
  private sync = inject(SessionSyncService);

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
      switchMap(() =>
        from(this.db.loadAll()).pipe(
          map((lessons) => LessonsActions.hydrated({ lessons })),
          catchError(() => from([LessonsActions.hydrated({ lessons: [] })])),
        ),
      ),
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
          from(this.db.upsertMany(lessons)).pipe(catchError(() => EMPTY)),
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
        concatMap(([, lessons]) => from(this.pushDirtyLessons(lessons)).pipe(catchError(() => EMPTY))),
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
  private async pushDirtyLessons(lessons: Lesson[]): Promise<void> {
    const dirty = lessons.filter(isLessonDirty);
    if (!dirty.length) return;
    await this.sync.pushLessons(dirty);
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
        exhaustMap(() => from(this.pullAndMergeLessons()).pipe(catchError(() => EMPTY))),
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
  private async pullAndMergeLessons(): Promise<void> {
    const remote = await this.sync.pullLessons();
    const local = await this.db.loadAll();
    const { lessons, toUpsertLocally } = mergeLessonsPull(local, remote);
    if (toUpsertLocally.length) await this.db.upsertMany(toUpsertLocally);
    this.store.dispatch(LessonsActions.hydrated({ lessons }));
    await this.pushDirtyLessons(lessons);
  }
}
