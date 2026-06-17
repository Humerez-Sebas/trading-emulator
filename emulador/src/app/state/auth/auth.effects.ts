import { inject, Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { Actions, createEffect, ofType, ROOT_EFFECTS_INIT } from '@ngrx/effects';
import { of } from 'rxjs';
import { catchError, exhaustMap, map, tap } from 'rxjs/operators';
import { BackendApiService } from '../../services/backend-api.service';
import { AuthActions } from './auth.actions';
import { environment } from '../../../environments/environment';

/** User-facing message (Spanish) from a backend error. */
function describeError(e: unknown): string {
  const err = e as HttpErrorResponse;
  if (err.status === 0) return 'No se pudo conectar con el servidor';
  const detail = (err.error as { detail?: unknown } | null)?.detail;
  return typeof detail === 'string' ? detail : 'Algo salió mal, inténtalo de nuevo';
}

const GUEST_KEY = 'emulador.guest';

/** Whether the user previously chose guest mode (full-stack reload). */
function guestPersisted(): boolean {
  try {
    return localStorage.getItem(GUEST_KEY) === '1';
  } catch {
    return false;
  }
}

@Injectable()
export class AuthEffects {
  private actions$ = inject(Actions);
  private api = inject(BackendApiService);
  private router = inject(Router);

  init$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ROOT_EFFECTS_INIT),
      map(() => AuthActions.checkSession()),
    ),
  );

  /**
   * Who am I? In an offlineOnly (static) build we never reach for a backend and
   * resolve straight to guest. Otherwise: 401 = anonymous (unless a guest choice
   * was persisted), network failure = offline (CSV-only mode).
   */
  check$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.checkSession),
      exhaustMap(() => {
        if (environment.offlineOnly) return of(AuthActions.continueAsGuest());
        return this.api.me().pipe(
          map((user) => AuthActions.sessionResolved({ user, offline: false })),
          catchError((e: HttpErrorResponse) => {
            if (e.status === 0) {
              return of(AuthActions.sessionResolved({ user: null, offline: true }));
            }
            return of(
              guestPersisted()
                ? AuthActions.continueAsGuest()
                : AuthActions.sessionResolved({ user: null, offline: false }),
            );
          }),
        );
      }),
    ),
  );

  /** Remembers the guest choice so a reload stays in guest mode. */
  persistGuest$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AuthActions.continueAsGuest),
        tap(() => {
          try {
            localStorage.setItem(GUEST_KEY, '1');
          } catch {
            /* storage unavailable: ignore */
          }
        }),
      ),
    { dispatch: false },
  );

  login$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.login),
      exhaustMap(({ username, password, returnUrl }) =>
        this.api.login(username, password).pipe(
          map((user) => AuthActions.authSuccess({ user, returnUrl })),
          catchError((e) => of(AuthActions.authFailure({ error: describeError(e) }))),
        ),
      ),
    ),
  );

  register$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.register),
      exhaustMap(({ username, password, returnUrl }) =>
        this.api.register(username, password).pipe(
          map((user) => AuthActions.authSuccess({ user, returnUrl })),
          catchError((e) => of(AuthActions.authFailure({ error: describeError(e) }))),
        ),
      ),
    ),
  );

  navigateAfterAuth$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AuthActions.authSuccess),
        tap(({ returnUrl }) => this.router.navigateByUrl(returnUrl || '/mercados')),
      ),
    { dispatch: false },
  );

  logout$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.logout),
      exhaustMap(() =>
        this.api.logout().pipe(
          map(() => AuthActions.loggedOut()),
          // even if the server call fails, drop the local session
          catchError(() => of(AuthActions.loggedOut())),
        ),
      ),
    ),
  );

  redirectAfterLogout$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AuthActions.loggedOut),
        tap(() => {
          try {
            localStorage.removeItem(GUEST_KEY);
          } catch {
            /* ignore */
          }
          this.router.navigateByUrl('/login');
        }),
      ),
    { dispatch: false },
  );
}
