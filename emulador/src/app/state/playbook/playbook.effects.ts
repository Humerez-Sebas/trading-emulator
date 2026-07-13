import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType, ROOT_EFFECTS_INIT } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { catchError, concatMap, from, map, switchMap, EMPTY, withLatestFrom } from 'rxjs';
import { PlaybookDbService } from '../../services/playbook-db.service';
import { PlaybookActions } from './playbook.actions';
import { selectPlaybookRules } from './playbook.selectors';

@Injectable()
export class PlaybookEffects {
  private actions$ = inject(Actions);
  private store = inject(Store);
  private db = inject(PlaybookDbService);

  /**
   * Bootstrap hydration: dispatch PlaybookActions.hydrate on app initialization,
   * which then loads all persisted rules from IndexedDB and updates the store.
   */
  bootstrapHydrate$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ROOT_EFFECTS_INIT),
      map(() => PlaybookActions.hydrate()),
    ),
  );

  /**
   * Load all rules from the local database on hydrate action.
   * If the DB fails, emit hydrated with empty rules to keep the app alive.
   */
  hydrate$ = createEffect(() =>
    this.actions$.pipe(
      ofType(PlaybookActions.hydrate),
      switchMap(() =>
        from(this.db.loadAll()).pipe(
          map((rules) => PlaybookActions.hydrated({ rules })),
          catchError(() => from([PlaybookActions.hydrated({ rules: [] })])),
        ),
      ),
    ),
  );

  /**
   * Persist current rules to the local database whenever they change.
   * Listens to all state-changing actions and always persists the CURRENT
   * rules (via selectPlaybookRules), not the action payload. Errors are
   * swallowed (stream survives rejection) so other effects can run.
   */
  persist$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(
          PlaybookActions.createRule,
          PlaybookActions.updateRule,
          PlaybookActions.setRuleStatus,
          PlaybookActions.assignSlot,
          PlaybookActions.reorderRule,
          PlaybookActions.rulesSynced,
        ),
        withLatestFrom(this.store.select(selectPlaybookRules)),
        concatMap(([, rules]) =>
          from(this.db.upsertMany(rules)).pipe(catchError(() => EMPTY)),
        ),
      ),
    { dispatch: false },
  );
}
