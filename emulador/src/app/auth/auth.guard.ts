import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { filter, map, take } from 'rxjs/operators';
import { authFeature } from '../state/auth/auth.reducer';

/**
 * Waits for the startup session check, then:
 * - `authenticated` -> pass.
 * - anything else (`anonymous`) -> redirect to /login keeping the intended URL.
 * Login is required: there is no guest/offline fallback.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const store = inject(Store);
  const router = inject(Router);
  return store.select(authFeature.selectStatus).pipe(
    filter((status) => status !== 'unknown'),
    take(1),
    map((status) =>
      status === 'authenticated'
        ? true
        : router.createUrlTree(['/login'], { queryParams: { volver: state.url } }),
    ),
  );
};
