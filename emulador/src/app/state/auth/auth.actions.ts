import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { AuthUser } from './auth.models';

export const AuthActions = createActionGroup({
  source: 'Auth',
  events: {
    /** App start: ask Supabase who we are (local session is read first). */
    'Check Session': emptyProps(),
    /**
     * Result of the session check. `offline` = a thrown auth error (rare with a
     * locally-persisted session); the emulator stays usable as guest.
     */
    'Session Resolved': props<{ user: AuthUser | null; offline: boolean }>(),
    Login: props<{ email: string; password: string; returnUrl: string | null }>(),
    'Auth Success': props<{ user: AuthUser; returnUrl: string | null }>(),
    'Auth Failure': props<{ error: string }>(),
    Logout: emptyProps(),
    'Logged Out': emptyProps(),
    /** Enter guest mode (no account; data stays local in IndexedDB). */
    'Continue As Guest': emptyProps(),
  },
});
