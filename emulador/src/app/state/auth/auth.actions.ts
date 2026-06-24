import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { AuthUser } from './auth.models';

export const AuthActions = createActionGroup({
  source: 'Auth',
  events: {
    /** App start: ask Supabase who we are (local session is read first). */
    'Check Session': emptyProps(),
    /** Result of the session check: a user means an authenticated session, null means anonymous. */
    'Session Resolved': props<{ user: AuthUser | null }>(),
    Login: props<{ email: string; password: string; returnUrl: string | null }>(),
    'Auth Success': props<{ user: AuthUser; returnUrl: string | null }>(),
    'Auth Failure': props<{ error: string }>(),
    Logout: emptyProps(),
    'Logged Out': emptyProps(),
  },
});
