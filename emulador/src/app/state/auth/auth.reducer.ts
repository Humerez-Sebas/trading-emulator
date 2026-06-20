import { createFeature, createReducer, on } from '@ngrx/store';
import { AuthUser } from './auth.models';
import { AuthActions } from './auth.actions';

/**
 * - `unknown`: still checking the session at startup.
 * - `authenticated`: a valid Supabase session.
 * - `anonymous`: no Supabase session -> guarded routes redirect to /login.
 * - `offline`: the auth check threw (rare, since the session is read locally) -> the app
 *   stays usable as guest.
 * - `guest`: deliberate no-account mode (static build or explicit choice).
 */
export type AuthStatus = 'unknown' | 'authenticated' | 'anonymous' | 'offline' | 'guest';

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  /** A login request is in flight (submit feedback). */
  pending: boolean;
  error: string | null;
}

const initialState: AuthState = {
  status: 'unknown',
  user: null,
  pending: false,
  error: null,
};

export const authFeature = createFeature({
  name: 'auth',
  reducer: createReducer(
    initialState,
    on(
      AuthActions.sessionResolved,
      (state, { user, offline }): AuthState => ({
        ...state,
        user,
        status: user ? 'authenticated' : offline ? 'offline' : 'anonymous',
      }),
    ),
    on(AuthActions.login, (state): AuthState => ({ ...state, pending: true, error: null })),
    on(
      AuthActions.authSuccess,
      (state, { user }): AuthState => ({
        ...state,
        user,
        status: 'authenticated',
        pending: false,
        error: null,
      }),
    ),
    on(
      AuthActions.authFailure,
      (state, { error }): AuthState => ({ ...state, pending: false, error }),
    ),
    on(
      AuthActions.loggedOut,
      (state): AuthState => ({ ...state, user: null, status: 'anonymous', pending: false }),
    ),
    on(
      AuthActions.continueAsGuest,
      (state): AuthState => ({
        ...state,
        user: null,
        status: 'guest',
        pending: false,
        error: null,
      }),
    ),
  ),
});
