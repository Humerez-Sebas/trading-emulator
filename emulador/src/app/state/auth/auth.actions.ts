import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { AuthUser } from '../../services/backend-api.service';

export const AuthActions = createActionGroup({
  source: 'Auth',
  events: {
    /** App start: ask the backend who we are (cookie travels alone). */
    'Check Session': emptyProps(),
    /**
     * Result of the session check. `offline` = the backend is unreachable;
     * the emulator stays usable with local CSVs (V2.4 flow).
     */
    'Session Resolved': props<{ user: AuthUser | null; offline: boolean }>(),
    Login: props<{ username: string; password: string; returnUrl: string | null }>(),
    Register: props<{ username: string; password: string; returnUrl: string | null }>(),
    'Auth Success': props<{ user: AuthUser; returnUrl: string | null }>(),
    'Auth Failure': props<{ error: string }>(),
    Logout: emptyProps(),
    'Logged Out': emptyProps(),
  },
});
