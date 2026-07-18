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
          PlaybookActions.amendRule,
          PlaybookActions.rulesSynced,
        ),
        withLatestFrom(this.store.select(selectPlaybookRules)),
        concatMap(([, rules]) => from(this.db.upsertMany(rules)).pipe(catchError(() => EMPTY))),
      ),
    { dispatch: false },
  );

  /**
   * RFC-015 Task 4 (D15.F): debounced push of dirty rows to the cloud after
   * any mutation (`rulesSynced` itself excluded from the trigger list — it
   * is push's own result, not a new local edit, so including it would loop).
   * `auditTime(2000)` mirrors the folders/sessions cycle's `debounceTime`
   * coalescing (see `SessionSyncEffects.flushOnEdit$`), letting a burst of
   * edits settle into one push. Dirtiness is the literal predicate alone
   * (`isPlaybookRuleDirty`) — D15.F fixed the reducer to stamp
   * `clientUpdatedAt` at every mutation (including `createRule`), so this no
   * longer needs to widen the selection to "never synced" or mint a
   * timestamp here; the value pushed is always whatever the reducer already
   * stamped. `{ dispatch: false }`: the resulting `rulesSynced` is
   * dispatched manually on success (see `pushDirtyRules`), not emitted by
   * this effect's own stream.
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
          PlaybookActions.amendRule,
        ),
        auditTime(2000),
        withLatestFrom(
          this.store.select(selectPlaybookRules),
          this.store.select(authFeature.selectStatus),
        ),
        filter(([, , status]) => status === 'authenticated'),
        concatMap(([, rules]) => from(this.pushDirtyRules(rules)).pipe(catchError(() => EMPTY))),
      ),
    { dispatch: false },
  );

  /**
   * Pushes exactly the dirty subset of `rules` and, on success, stamps
   * `syncedAt` (ONLY `syncedAt` — D15.F/IMPORTANT 1) to the `clientUpdatedAt`
   * value that was actually pushed for each row, snapshotted here BEFORE the
   * network call. If an edit lands on a row after this snapshot but before
   * `rulesSynced` is dispatched, the reducer's `rulesSynced` handler never
   * touches `clientUpdatedAt`, so the row is still `clientUpdatedAt >
   * syncedAt` afterward — still dirty, picked up by the next push cycle
   * (mid-flight-edit safety, verified in playbook.effects.spec.ts).
   */
  private async pushDirtyRules(rules: PlaybookRule[]): Promise<void> {
    const dirty = rules.filter(isPlaybookRuleDirty);
    if (!dirty.length) return;
    await this.sync.pushPlaybookRules(dirty);
    this.store.dispatch(
      PlaybookActions.rulesSynced({
        stamps: dirty.map((r) => ({ id: r.id, syncedAt: r.clientUpdatedAt! })),
      }),
    );
  }

  /**
   * RFC-015 Task 4: pull + LWW merge, chained to the SAME auth/bootstrap
   * trigger the folders/sessions pull uses (`SessionSyncEffects.login$`) —
   * both `sessionResolved` (app start) and `authSuccess` (mid-session
   * login), non-null user only. `exhaustMap` ignores a second trigger while
   * one pull is in flight (same rationale as `login$`). `{ dispatch: false
   * }`: `pullAndMergeRules` dispatches `hydrated` (the merge) and then
   * `rulesSynced` (the post-merge push, IMPORTANT 2 below) manually, in
   * that order, rather than relying on this effect's own emission — the
   * push step needs the already-merged `rules` array as its input, not a
   * fresh store read.
   */
  pullOnAuth$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AuthActions.sessionResolved, AuthActions.authSuccess),
        filter((action) => action.user != null),
        exhaustMap(() => from(this.pullAndMergeRules()).pipe(catchError(() => EMPTY))),
      ),
    { dispatch: false },
  );

  /**
   * Pull, LWW-merge against local, persist the merge, hydrate the store,
   * THEN flush any local-newer survivors back to the cloud (folders parity:
   * `SessionSyncService.pullAndMerge` → `flushDirty()`, IMPORTANT 2). This
   * matters most right after app start: a rule edited last session that
   * never got pushed (closed before the debounce fired, or offline) has no
   * NEW mutation action to re-trigger `pushDirty$` — only this post-merge
   * flush notices it's still dirty and re-pushes it.
   */
  private async pullAndMergeRules(): Promise<void> {
    const remote = await this.sync.pullPlaybookRules();
    const local = await this.db.loadAll();
    const { rules, toUpsertLocally } = mergePlaybookPull(local, remote);
    if (toUpsertLocally.length) await this.db.upsertMany(toUpsertLocally);
    this.store.dispatch(PlaybookActions.hydrated({ rules }));
    await this.pushDirtyRules(rules);
  }
}
