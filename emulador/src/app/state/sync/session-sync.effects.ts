import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { EMPTY, from } from 'rxjs';
import {
  catchError,
  concatMap,
  debounceTime,
  filter,
  exhaustMap,
  withLatestFrom,
} from 'rxjs/operators';
import { AuthActions } from '../auth/auth.actions';
import { authFeature } from '../auth/auth.reducer';
import { SessionSyncService } from '../../services/session-sync.service';
import { WorkspaceDbService } from '../../services/workspace-db.service';
import { TradingActions } from '../trading/trading.actions';
import { selectCurrentAsset, selectWorkspaceMetaSnapshot } from '../selectors';

/**
 * Wires the session-sync engine (Task 9's `SessionSyncService`) to the rest
 * of the app: a login pull, a debounced push of the active session's edits,
 * and propagation of local session deletes to the cloud. All `{ dispatch:
 * false }` — this layer is pure side-effecting orchestration, no new actions.
 *
 * Each effect swallows its own errors (`catchError → EMPTY`) so a failed
 * sync attempt (offline, RLS, etc.) never kills the long-lived stream — the
 * service's own per-entity try/catch already makes individual pushes
 * best-effort; this is the outer guard for anything that slips past that.
 */
@Injectable()
export class SessionSyncEffects {
  private actions$ = inject(Actions);
  private store = inject(Store);
  private sync = inject(SessionSyncService);
  private db = inject(WorkspaceDbService);

  /**
   * Pulls + merges the cloud state on a non-null user, for BOTH:
   *  - app-start session resolution (`sessionResolved`), and
   *  - explicit form login (`authSuccess`).
   * Without the latter, a user who logs in mid-session would get no cloud
   * pull until the next full page reload re-ran `checkSession`. Anonymous
   * never reaches this (login is required to use the app, so there's no
   * guest work to adopt).
   */
  login$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AuthActions.sessionResolved, AuthActions.authSuccess),
        filter((action) => action.user != null),
        exhaustMap(() => from(this.sync.pullAndMerge()).pipe(catchError(() => EMPTY))),
      ),
    { dispatch: false },
  );

  /**
   * Continuous edits (replay cursor, drawings, trades, etc.) flow through
   * `selectWorkspaceMetaSnapshot`, same as `persistMeta$`. Debounced 2s so a
   * playback session ticking every frame doesn't hammer the edge function —
   * this coalesces into one flush ~2s after edits/playback stop. A slow
   * heartbeat flush while actively playing is intentionally deferred (not
   * built here).
   */
  flushOnEdit$ = createEffect(
    () =>
      this.store.select(selectWorkspaceMetaSnapshot).pipe(
        withLatestFrom(
          this.store.select(authFeature.selectStatus),
          this.store.select(selectCurrentAsset),
        ),
        filter(([, status, current]) => status === 'authenticated' && !!current),
        debounceTime(2000),
        concatMap(([, , current]) =>
          from(
            (async () => {
              await this.sync.markActiveDirty(current!);
              await this.sync.flushDirty();
            })(),
          ).pipe(catchError(() => EMPTY)),
        ),
      ),
    { dispatch: false },
  );

  /**
   * A locally-deleted ARCHIVED session is recorded as a pending delete and
   * immediately replayed against the cloud. Deleting a never-synced id is a
   * harmless no-op server-side.
   */
  propagateDelete$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(TradingActions.deleteSession),
        withLatestFrom(this.store.select(authFeature.selectStatus)),
        filter(([, status]) => status === 'authenticated'),
        concatMap(([{ id }]) =>
          from(
            (async () => {
              await this.db.addPendingDelete({ entity: 'session', id });
              await this.sync.flushPendingDeletes();
            })(),
          ).pipe(catchError(() => EMPTY)),
        ),
      ),
    { dispatch: false },
  );
}
