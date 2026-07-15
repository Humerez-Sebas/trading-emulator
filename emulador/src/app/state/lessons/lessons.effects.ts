import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType, ROOT_EFFECTS_INIT } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { catchError, concatMap, EMPTY, from, map, switchMap, withLatestFrom } from 'rxjs';
import { LessonsActions } from './lessons.actions';
import { selectLessons } from './lessons.selectors';
import { LessonsDbService } from '../../services/lessons-db.service';

@Injectable()
export class LessonsEffects {
  private actions$ = inject(Actions);
  private store = inject(Store);
  private db = inject(LessonsDbService);

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
   *
   * Note: cloud sync (pushDirty$/pullOnAuth$) is Task 3; this effect handles
   * local persistence only.
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
}
