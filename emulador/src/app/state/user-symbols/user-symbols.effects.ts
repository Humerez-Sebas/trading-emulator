import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { of } from 'rxjs';
import { catchError, map, switchMap, withLatestFrom } from 'rxjs/operators';
import { BackendApiService } from '../../services/backend-api.service';
import { UserSymbolsActions } from './user-symbols.actions';
import { userSymbolsFeature } from './user-symbols.reducer';

@Injectable()
export class UserSymbolsEffects {
  private actions$ = inject(Actions);
  private store = inject(Store);
  private api = inject(BackendApiService);

  /** Loads the selection; offline/unauthenticated falls back to empty. */
  load$ = createEffect(() =>
    this.actions$.pipe(
      ofType(UserSymbolsActions.load),
      switchMap(() =>
        this.api.getUserSymbols().pipe(
          map((r) => UserSymbolsActions.loaded({ symbols: r.symbols })),
          catchError(() => of(UserSymbolsActions.loaded({ symbols: [] }))),
        ),
      ),
    ),
  );

  /**
   * Persists after every toggle (replace-all PUT with the full list). The
   * server response reconciles the optimistic state (it drops unknowns); a
   * failure re-fetches to revert. switchMap is intentional: each PUT carries
   * the complete list, so cancelling an in-flight save on a rapid second
   * toggle is safe — the latest PUT is authoritative.
   */
  persist$ = createEffect(() =>
    this.actions$.pipe(
      ofType(UserSymbolsActions.toggle),
      withLatestFrom(this.store.select(userSymbolsFeature.selectSymbols)),
      switchMap(([, symbols]) =>
        this.api.putUserSymbols(symbols).pipe(
          map((r) => UserSymbolsActions.loaded({ symbols: r.symbols })),
          catchError(() => of(UserSymbolsActions.load())),
        ),
      ),
    ),
  );
}
