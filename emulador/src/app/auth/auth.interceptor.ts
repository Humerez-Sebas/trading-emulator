import { HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { Observable, throwError } from 'rxjs';
import { catchError, finalize, shareReplay, switchMap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { AuthActions } from '../state/auth/auth.actions';

/** Endpoints where a 401 is a normal answer, never a token-expiry signal. */
const NO_RETRY = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

/** One refresh shared by all concurrent 401s (rotation revokes the old jti). */
let refreshInFlight: Observable<unknown> | null = null;

/**
 * Backend requests carry the session cookies (`withCredentials`); on a 401
 * the access token probably expired, so the interceptor refreshes once and
 * retries the request. If that fails too the session is over: log out
 * locally and land on /login. Requests to other hosts (the MT5 helper on
 * :8765) pass through untouched.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.backendUrl)) return next(req);

  const http = inject(HttpClient);
  const store = inject(Store);
  const router = inject(Router);
  const withCreds = req.clone({ withCredentials: true });

  return next(withCreds).pipe(
    catchError((error: HttpErrorResponse) => {
      const retryable = error.status === 401 && !NO_RETRY.some((p) => req.url.includes(p));
      if (!retryable) return throwError(() => error);

      // this POST re-enters the interceptor, but /auth/refresh never retries
      refreshInFlight ??= http.post(`${environment.backendUrl}/auth/refresh`, {}).pipe(
        finalize(() => (refreshInFlight = null)),
        shareReplay(1),
      );

      return refreshInFlight.pipe(
        switchMap(() => next(withCreds)),
        catchError((retryError: HttpErrorResponse) => {
          if (retryError.status === 401) {
            store.dispatch(AuthActions.loggedOut());
            router.navigateByUrl('/login');
          }
          return throwError(() => retryError);
        }),
      );
    }),
  );
};
