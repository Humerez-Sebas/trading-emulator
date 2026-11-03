import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Actions, createEffect, ofType, ROOT_EFFECTS_INIT } from '@ngrx/effects';
import { EMPTY, from, of } from 'rxjs';
import { catchError, exhaustMap, map, mergeMap, tap } from 'rxjs/operators';
import { SupabaseAuthService } from '../../auth/supabase-auth.service';
import { OwnerIdentityService } from '../../services/owner-identity.service';
import { AuthActions } from './auth.actions';

/** User-facing message (Spanish) from a Supabase/auth error. */
function describeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : '';
  if (/invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos';
  if (/network|fetch/i.test(msg)) return 'No se pudo conectar con el servidor';
  if (/email not confirmed/i.test(msg)) return 'Tu cuenta aún no está confirmada';
  return 'Algo salió mal, inténtalo de nuevo';
}

function hardNavigationTarget(returnUrl: string | null, baseURI: string): string {
  if (!returnUrl?.startsWith('/')) return '/mercados';
  try {
    const base = new URL(baseURI);
    return new URL(returnUrl, baseURI).origin === base.origin ? returnUrl : '/mercados';
  } catch {
    return '/mercados';
  }
}

@Injectable()
export class AuthEffects {
  private actions$ = inject(Actions);
  private auth = inject(SupabaseAuthService);
  private router = inject(Router);
  private document = inject(DOCUMENT);
  private owner = inject(OwnerIdentityService);

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
        from(this.owner.ownerId()).pipe(
          mergeMap((currentOwnerId) =>
            from(this.auth.signIn(email, password)).pipe(
              mergeMap((user) => {
                if (currentOwnerId !== user.id) {
                  const target = hardNavigationTarget(returnUrl, this.document.baseURI);
                  this.document.location.assign(target);
                  return EMPTY;
                }
                return of(AuthActions.authSuccess({ user, returnUrl }));
              }),
            ),
          ),
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
