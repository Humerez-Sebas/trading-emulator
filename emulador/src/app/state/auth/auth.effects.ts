import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Actions, createEffect, ofType, ROOT_EFFECTS_INIT } from '@ngrx/effects';
import { from, of } from 'rxjs';
import { catchError, exhaustMap, map, tap } from 'rxjs/operators';
import { SupabaseAuthService } from '../../auth/supabase-auth.service';
import { AuthActions } from './auth.actions';
import { environment } from '../../../environments/environment';

/** User-facing message (Spanish) from a Supabase/auth error. */
function describeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : '';
  if (/invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos';
  if (/network|fetch/i.test(msg)) return 'No se pudo conectar con el servidor';
  return msg || 'Algo salió mal, inténtalo de nuevo';
}

const GUEST_KEY = 'emulador.guest';

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
  private auth = inject(SupabaseAuthService);
  private router = inject(Router);

  init$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ROOT_EFFECTS_INIT),
      map(() => AuthActions.checkSession()),
    ),
  );

  check$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.checkSession),
      exhaustMap(() => {
        if (environment.offlineOnly) return of(AuthActions.continueAsGuest());
        return from(this.auth.getUser()).pipe(
          map((user) =>
            user
              ? AuthActions.sessionResolved({ user, offline: false })
              : guestPersisted()
                ? AuthActions.continueAsGuest()
                : AuthActions.sessionResolved({ user: null, offline: false }),
          ),
          catchError(() => of(AuthActions.sessionResolved({ user: null, offline: true }))),
        );
      }),
    ),
  );

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
      exhaustMap(({ email, password, returnUrl }) =>
        from(this.auth.signIn(email, password)).pipe(
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
        from(this.auth.signOut()).pipe(
          map(() => AuthActions.loggedOut()),
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
