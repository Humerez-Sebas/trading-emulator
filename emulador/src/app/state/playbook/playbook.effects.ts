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
import { PlaybookDbService } from '../../services/playbook-db.service';
import {
  isPlaybookRuleDirty,
  mergePlaybookPull,
  SessionSyncService,
} from '../../services/session-sync.service';
import { PlaybookRule } from './playbook.models';
import { PlaybookActions } from './playbook.actions';
import { selectPlaybookRules } from './playbook.selectors';
import { AuthActions } from '../auth/auth.actions';
import { authFeature } from '../auth/auth.reducer';

@Injectable()
export class PlaybookEffects {
  private actions$ = inject(Actions);
  private store = inject(Store);
  private db = inject(PlaybookDbService);
  private sync = inject(SessionSyncService);

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

  /**
   * RFC-015 Task 4: debounced push of dirty rules to the cloud after any
   * mutation (`rulesSynced` itself excluded from the trigger list — it is
   * push's own result, not a new local edit, so including it would loop).
   * `auditTime(2000)` mirrors the folders/sessions cycle's `debounceTime`
   * coalescing (see `SessionSyncEffects.flushOnEdit$`), letting a burst of
   * edits settle into one push. Rules with no `clientUpdatedAt` yet (never
   * locally stamped — see PlaybookRule doc) or never synced are treated as
   * dirty and stamped with a fresh timestamp here, BEFORE push, so the same
   * value is written to the cloud row and back into local state — keeping
   * both sides of the LWW clock consistent. `{ dispatch: false }`: the
   * resulting `rulesSynced` is dispatched manually on success, not emitted
   * by this effect's own stream.
   */
  pushDirty$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(
          PlaybookActions.createRule,
          PlaybookActions.updateRule,
          PlaybookActions.setRuleStatus,
          PlaybookActions.assignSlot,
          PlaybookActions.reorderRule,
        ),
        auditTime(2000),
        withLatestFrom(
          this.store.select(selectPlaybookRules),
          this.store.select(authFeature.selectStatus),
        ),
        filter(([, , status]) => status === 'authenticated'),
        concatMap(([, rules]) =>
          from(this.pushDirtyRules(rules)).pipe(catchError(() => EMPTY)),
        ),
      ),
    { dispatch: false },
  );

  private async pushDirtyRules(rules: PlaybookRule[]): Promise<void> {
    const now = Date.now();
    const dirty = rules.filter((r) => isPlaybookRuleDirty(r) || r.syncedAt == null);
    if (!dirty.length) return;
    const stamped = dirty.map((r) => ({ ...r, clientUpdatedAt: r.clientUpdatedAt ?? now }));
    await this.sync.pushPlaybookRules(stamped);
    this.store.dispatch(
      PlaybookActions.rulesSynced({
        stamps: stamped.map((r) => ({ id: r.id, clientUpdatedAt: r.clientUpdatedAt!, syncedAt: now })),
      }),
    );
  }

  /**
   * RFC-015 Task 4: pull + LWW merge, chained to the SAME auth/bootstrap
   * trigger the folders/sessions pull uses (`SessionSyncEffects.login$`) —
   * both `sessionResolved` (app start) and `authSuccess` (mid-session
   * login), non-null user only. `exhaustMap` ignores a second trigger while
   * one pull is in flight (same rationale as `login$`). Of the two Task 4
   * effects, this is the merge dispatch (returns `hydrated`); `pushDirty$`
   * is `{ dispatch: false }` and dispatches `rulesSynced` manually instead.
   */
  pullOnAuth$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.sessionResolved, AuthActions.authSuccess),
      filter((action) => action.user != null),
      exhaustMap(() => from(this.pullAndMergeRules()).pipe(catchError(() => EMPTY))),
    ),
  );

  private async pullAndMergeRules() {
    const remote = await this.sync.pullPlaybookRules();
    const local = await this.db.loadAll();
    const { rules, toUpsertLocally } = mergePlaybookPull(local, remote);
    if (toUpsertLocally.length) await this.db.upsertMany(toUpsertLocally);
    return PlaybookActions.hydrated({ rules });
  }
}
