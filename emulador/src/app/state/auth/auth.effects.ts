import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Actions, createEffect, ofType, ROOT_EFFECTS_INIT } from '@ngrx/effects';
import { from, of } from 'rxjs';
import { catchError, exhaustMap, map, tap } from 'rxjs/operators';
import { SupabaseAuthService } from '../../auth/supabase-auth.service';
import { AuthActions } from './auth.actions';

/** User-facing message (Spanish) from a Supabase/auth error. */
function describeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : '';
  if (/invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos';
  if (/network|fetch/i.test(msg)) return 'No se pudo conectar con el servidor';
  if (/email not confirmed/i.test(msg)) return 'Tu cuenta aún no está confirmada';
  return 'Algo salió mal, inténtalo de nuevo';
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
      exhaustMap(() =>
        from(this.auth.getUser()).pipe(
          map((user) => AuthActions.sessionResolved({ user })),
          catchError(() => of(AuthActions.sessionResolved({ user: null }))),
        ),
      ),
    ),
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
          this.router.navigateByUrl('/login');
        }),
      ),
    { dispatch: false },
  );
}
