import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { tap } from 'rxjs/operators';
import { AuthActions } from './auth.actions';

/** Where a logged-out user lands. Same target as `AuthEffects.redirectAfterLogout$`. */
export const LOGIN_URL = '/login';

/**
 * Session Sovereignty V2 — the in-memory half of owner isolation.
 *
 * Partitioning IndexedDB per owner protects everything already on disk, but not
 * what is still in the NgRx heap. `loggedOut` is otherwise handled only by
 * `auth.reducer` (the auth slice) and by an SPA navigation, so after a logout the
 * store still holds the previous user's `market`/`replay`/`drawings`/`trading`/
 * `layout`/`linkGroups`/`workspaces` state. The next account's first
 * `switchAsset` then runs `doSwitch` step 1, which persists the OUTGOING
 * snapshot — the previous user's trading data — and it does so while
 * authenticated as the new account, so it lands in the NEW owner's partition.
 * That is adoption and exposure in one write, and no storage-layer guard can see
 * it: the write is legitimately attributed to the account performing it.
 *
 * A hard DOCUMENT navigation discards the whole JS heap, which makes the leak
 * structurally impossible rather than enumerably prevented — no reducer needs to
 * remember to reset, and a feature added later cannot forget to. It also
 * underwrites `OwnerIdentityService`'s memo (a resolved owner id is fixed for the
 * document's lifetime), which is only sound if an account switch always crosses a
 * document boundary. The two are a pair; the spec for this effect is what pins it.
 *
 * `AuthEffects.redirectAfterLogout$` still runs its router navigation. That is
 * deliberate: it keeps the SPA behaviour intact if this navigation is ever
 * blocked, and a router navigation followed by a document navigation to the same
 * URL is idempotent.
 */
@Injectable()
export class SessionSovereigntyEffects {
  private actions$ = inject(Actions);
  private document = inject(DOCUMENT);

  hardReloadOnLogout$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AuthActions.loggedOut),
        tap(() => {
          // `assign` (not `replace`) so the logged-out page is a real history
          // entry; `location` is read off DOCUMENT so the effect is testable
          // without touching a real Location.
          this.document.location.assign(LOGIN_URL);
        }),
      ),
    { dispatch: false },
  );
}
