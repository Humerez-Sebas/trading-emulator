import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { filter, map, take } from 'rxjs/operators';
import { authFeature } from '../state/auth/auth.reducer';

/**
 * Waits for the startup session check, then:
 * - `authenticated` -> pass.
 * - `offline` (backend unreachable) -> pass too: the emulator must stay
 *   fully usable with local CSVs (V2.4 flow without backend).
 * - `guest` (deliberate no-account mode) -> pass too.
 * - `anonymous` -> redirect to /login keeping the intended URL.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const store = inject(Store);
  const router = inject(Router);
  return store.select(authFeature.selectStatus).pipe(
    filter((status) => status !== 'unknown'),
    take(1),
    map((status) =>
      status === 'authenticated' || status === 'offline' || status === 'guest'
        ? true
        : router.createUrlTree(['/login'], { queryParams: { volver: state.url } }),
    ),
  );
};
