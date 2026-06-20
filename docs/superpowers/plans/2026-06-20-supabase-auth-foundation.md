# Supabase Auth Foundation — Implementation Plan (Phase 1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the FastAPI cookie/JWT auth in the Angular frontend with **Supabase Auth** (email/password, invite-only), preserving guest mode — without touching session data, the old backend, or the R2 data path (those are Phases 2 and 3).

**Architecture:** A `SupabaseService` owns the `@supabase/supabase-js` client (from env). A `SupabaseAuthService` wraps `supabase.auth` (get session, sign in, sign out) and maps Supabase users to the app's `AuthUser`. The existing NgRx auth state machine (`checkSession`/`login`/`logout`/`continueAsGuest`) is rewired to call `SupabaseAuthService` instead of `BackendApiService`. The login page swaps username→email and drops registration (invite-only). The old `BackendApiService`, the cookie `authInterceptor`, and the `dataSource='csv'`/backend path stay in place untouched — they are removed in Phase 3.

**Tech Stack:** Angular 21 (standalone + signals), NgRx (store + effects), `@supabase/supabase-js` v2, Vitest via `@angular/build:unit-test` (`ng test`).

**Spec:** `docs/superpowers/specs/2026-06-20-supabase-auth-session-sync-design.md` (read §4 Authentication first).

## Prerequisite (manual, before Task 1 — not a code step)

Provision the Supabase project (dashboard or Supabase MCP), because Tasks 1/4 need a real URL + anon key and a user to log in with:
1. Create a Supabase project.
2. Authentication → Providers → **Email**: enabled. **Disable "Allow new users to sign up"** (invite-only).
3. Create the group's users (Authentication → Users → Add user → email + password, "Auto Confirm").
4. Copy the **Project URL** and the **anon public** key (Settings → API). These are public — the anon key is safe in the client (RLS, added in Phase 2, is the protection).

No tables are needed in Phase 1 (the `sessions`/`folders` tables come in Phase 2).

## Global Constraints

- **Stack/style:** Angular 21 standalone + signals + NgRx; Spanish user-facing text; match surrounding files. App state + candle `time` are unix **seconds**.
- **Local-first / additive auth:** logged-out = **guest** (local-only). Login must never become a wall in front of the tool. Preserve the `authGuard` behavior: `authenticated | offline | guest` pass; `anonymous` → `/login`.
- **Coexistence (Phase 1 only swaps AUTH):** do NOT delete `BackendApiService`, the `authInterceptor`, or the `dataSource='csv'`/backend data path — Phase 3 removes them. Only stop *using* `BackendApiService` for auth.
- **Invite-only:** public signup disabled (`registrationEnabled` stays `false`); the `/register` route and the register flow are removed in this phase.
- **Anon key is public** (committed in `environment*.ts`, like `marketDataBaseUrl`). The service-role key NEVER ships to the client.
- **CI gates (run before every commit that touches `emulador/`):** from `emulador/` run `npm run lint`, `npm run format:check` (or `npm run format`), `npx ng test --no-watch`, and `npm run build`. The IndexedDB test isolation in `src/test-setup.ts` stays.
- **Lockfile:** adding `@supabase/supabase-js` legitimately changes `package.json` + `package-lock.json` — commit BOTH in Task 1. After that, do NOT run `npm install` again (it would re-touch the lockfile); if `git status` shows an unexpected `package-lock.json` change in later tasks, restore it before committing.

## File Structure

- `emulador/package.json` / `package-lock.json` — add `@supabase/supabase-js` (Task 1).
- `emulador/src/environments/environment.ts` / `environment.prod.ts` / `environment.offline.ts` — add `supabaseUrl`, `supabaseAnonKey` (Task 1).
- `emulador/src/app/auth/supabase.service.ts` (new) — owns the `SupabaseClient` (Task 1).
- `emulador/src/app/state/auth/auth.models.ts` (new) — the relocated, reshaped `AuthUser` (Task 2).
- `emulador/src/app/auth/supabase-auth.service.ts` (new) + spec — `toAuthUser` + `getUser`/`signIn`/`signOut` (Task 2).
- `emulador/src/app/state/auth/auth.actions.ts` — `Login` props `email`; remove `Register` (Task 3).
- `emulador/src/app/state/auth/auth.effects.ts` + specs — use `SupabaseAuthService` (Task 3).
- `emulador/src/app/state/auth/auth.reducer.ts` — import `AuthUser` from `auth.models` (Task 2/3).
- `emulador/src/app/pages/auth/auth-page.component.ts` + `.html` + spec — email + invite-only (Task 4).
- `emulador/src/app/app.routes.ts` — remove `/register` (Task 4).

---

## Task 1: Supabase client + env config

**Files:**
- Modify: `emulador/package.json`, `emulador/package-lock.json`
- Modify: `emulador/src/environments/environment.ts`, `environment.prod.ts`, `environment.offline.ts`
- Create: `emulador/src/app/auth/supabase.service.ts`
- Test: `emulador/src/app/auth/supabase.service.spec.ts`

**Interfaces:**
- Produces: `SupabaseService` (`@Injectable({providedIn:'root'})`) with a readonly `client: SupabaseClient`. Consumed by `SupabaseAuthService` (Task 2) and later phases.
- Produces: `environment.supabaseUrl: string`, `environment.supabaseAnonKey: string` in all three env files.

- [ ] **Step 1: Install the dependency.** From `emulador/`:

```bash
npm install @supabase/supabase-js@^2
```

This updates `package.json` + `package-lock.json` (intentional — commit both in Step 7).

- [ ] **Step 2: Add Supabase config to all three env files.** In each of `environment.ts`, `environment.prod.ts`, `environment.offline.ts`, add the two fields to BOTH the type annotation and the object. Use the real Project URL + anon key from the Prerequisite (same values in all three — the anon key is public). Example for `environment.ts` (repeat the two lines in the other two files, keeping their existing `offlineOnly`/`backendUrl` values):

```ts
export const environment: {
  backendUrl: string;
  registrationEnabled: boolean;
  offlineOnly: boolean;
  guestModeEnabled: boolean;
  dataSource: 'csv' | 'r2';
  marketDataBaseUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
} = {
  backendUrl: 'http://localhost:8000',
  registrationEnabled: true,
  offlineOnly: false,
  guestModeEnabled: true,
  dataSource: 'r2',
  marketDataBaseUrl: 'https://pub-e67bee09f18745d49ba2ea16e15b537d.r2.dev',
  supabaseUrl: 'https://YOUR-PROJECT.supabase.co',
  supabaseAnonKey: 'YOUR-ANON-PUBLIC-KEY',
};
```

(Set `registrationEnabled` per file as it already is — `false` in prod/offline, `true` in dev is fine; the register flow is removed in Task 4 regardless.)

- [ ] **Step 3: Write the failing test** in `supabase.service.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { SupabaseService } from './supabase.service';

describe('SupabaseService', () => {
  it('exposes a Supabase client with an auth API', () => {
    const service = TestBed.configureTestingModule({}).inject(SupabaseService);
    expect(service.client).toBeTruthy();
    expect(typeof service.client.auth.signInWithPassword).toBe('function');
  });
});
```

- [ ] **Step 4: Run it, verify it fails.** `cd emulador && npx ng test --no-watch` → FAIL (`SupabaseService` not found).

- [ ] **Step 5: Implement** `supabase.service.ts`:

```ts
import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

/**
 * Owns the single Supabase client for the app (auth + Postgres). The anon key
 * is public by design; Row-Level Security (Phase 2) is the data protection.
 */
@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient = createClient(
    environment.supabaseUrl,
    environment.supabaseAnonKey,
    { auth: { persistSession: true, autoRefreshToken: true } },
  );
}
```

- [ ] **Step 6: Run it, verify it passes.** `cd emulador && npx ng test --no-watch` → the new test PASSES, suite stays green.

- [ ] **Step 7: Gate + commit.** From `emulador/`: `npm run lint && npm run format:check && npm run build`. Then:

```bash
git add emulador/package.json emulador/package-lock.json emulador/src/environments emulador/src/app/auth/supabase.service.ts emulador/src/app/auth/supabase.service.spec.ts
git commit -m "feat(auth): add @supabase/supabase-js client + env config"
```

---

## Task 2: `AuthUser` relocation + `SupabaseAuthService`

**Files:**
- Create: `emulador/src/app/state/auth/auth.models.ts`
- Create: `emulador/src/app/auth/supabase-auth.service.ts`
- Test: `emulador/src/app/auth/supabase-auth.service.spec.ts`
- Modify: `emulador/src/app/state/auth/auth.reducer.ts` (import `AuthUser` from the new location)

**Interfaces:**
- Consumes: `SupabaseService.client` (Task 1).
- Produces: `AuthUser { id: string; email: string }` in `auth.models.ts`.
- Produces: `toAuthUser(user: User | null): AuthUser | null` (pure) and `SupabaseAuthService` with `getUser(): Promise<AuthUser|null>`, `signIn(email, password): Promise<AuthUser>`, `signOut(): Promise<void>`. Consumed by `auth.effects` (Task 3).

- [ ] **Step 1: Create the relocated model** `auth.models.ts`:

```ts
/** The app's authenticated user, mapped from a Supabase auth user. */
export interface AuthUser {
  id: string;
  email: string;
}
```

- [ ] **Step 2: Repoint the reducer's import.** In `auth.reducer.ts`, change the import from `../../services/backend-api.service` to `./auth.models`:

```ts
import { AuthUser } from './auth.models';
```

(Leave `BackendApiService`'s own `AuthUser` type in place — it is now orphaned and removed in Phase 3. Do not delete it here.)

- [ ] **Step 3: Write the failing test** in `supabase-auth.service.spec.ts`:

```ts
import { toAuthUser } from './supabase-auth.service';
import type { User } from '@supabase/supabase-js';

describe('toAuthUser', () => {
  it('maps a Supabase user to AuthUser', () => {
    const user = { id: 'uuid-1', email: 'trader@example.com' } as User;
    expect(toAuthUser(user)).toEqual({ id: 'uuid-1', email: 'trader@example.com' });
  });
  it('returns null for no user or a user without email', () => {
    expect(toAuthUser(null)).toBeNull();
    expect(toAuthUser({ id: 'uuid-2' } as User)).toBeNull();
  });
});
```

- [ ] **Step 4: Run it, verify it fails.** `cd emulador && npx vitest run src/app/auth/supabase-auth.service.spec.ts` → FAIL (`toAuthUser` not exported).

- [ ] **Step 5: Implement** `supabase-auth.service.ts`:

```ts
import { inject, Injectable } from '@angular/core';
import type { User } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { AuthUser } from '../state/auth/auth.models';

/** Pure mapping from a Supabase auth user to the app's AuthUser. */
export function toAuthUser(user: User | null): AuthUser | null {
  if (!user?.email) return null;
  return { id: user.id, email: user.email };
}

/** Thin wrapper over `supabase.auth` exposing the auth ops the effects need. */
@Injectable({ providedIn: 'root' })
export class SupabaseAuthService {
  private readonly auth = inject(SupabaseService).client.auth;

  /** Current user from the locally-persisted session, or null. */
  async getUser(): Promise<AuthUser | null> {
    const { data, error } = await this.auth.getSession();
    if (error) throw error;
    return toAuthUser(data.session?.user ?? null);
  }

  async signIn(email: string, password: string): Promise<AuthUser> {
    const { data, error } = await this.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const user = toAuthUser(data.user);
    if (!user) throw new Error('Sesión inválida tras iniciar sesión.');
    return user;
  }

  async signOut(): Promise<void> {
    const { error } = await this.auth.signOut();
    if (error) throw error;
  }
}
```

- [ ] **Step 6: Run it, verify it passes.** `cd emulador && npx vitest run src/app/auth/supabase-auth.service.spec.ts` → PASS.

- [ ] **Step 7: Gate + commit.** From `emulador/`: `npm run lint && npm run format:check && npx ng test --no-watch && npm run build`. Then:

```bash
git commit -am "feat(auth): AuthUser model + SupabaseAuthService (getUser/signIn/signOut)"
```

---

## Task 3: Rewire the auth effects + actions to Supabase

**Files:**
- Modify: `emulador/src/app/state/auth/auth.actions.ts`
- Modify: `emulador/src/app/state/auth/auth.effects.ts`
- Modify (tests): `emulador/src/app/state/auth/auth.effects.spec.ts`, `auth.effects.offline.spec.ts`

**Interfaces:**
- Consumes: `SupabaseAuthService` (Task 2). Replaces `BackendApiService` in the effects.
- Produces: unchanged action surface except `Login` now carries `email` (was `username`) and `Register` is removed. `sessionResolved`/`authSuccess`/`authFailure`/`logout`/`loggedOut`/`continueAsGuest` keep their shapes.

**Note on `offline`:** Supabase `getSession()` reads the locally-persisted session (no network), so it will not throw when the network is down — the `offline` status becomes a rare edge (a thrown auth error), not the common "backend unreachable" case. Keep the `offline` branch for thrown errors (the `authGuard` already treats `offline` like `guest`), but the common resolution is `authenticated`/`anonymous`/`guest` from the local session.

- [ ] **Step 1: Update the actions.** In `auth.actions.ts`: remove the `Register` event and change `Login` to use `email`. Result:

```ts
import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { AuthUser } from './auth.models';

export const AuthActions = createActionGroup({
  source: 'Auth',
  events: {
    'Check Session': emptyProps(),
    'Session Resolved': props<{ user: AuthUser | null; offline: boolean }>(),
    Login: props<{ email: string; password: string; returnUrl: string | null }>(),
    'Auth Success': props<{ user: AuthUser; returnUrl: string | null }>(),
    'Auth Failure': props<{ error: string }>(),
    Logout: emptyProps(),
    'Logged Out': emptyProps(),
    'Continue As Guest': emptyProps(),
  },
});
```

- [ ] **Step 2: Update the failing effects test FIRST** (`auth.effects.spec.ts`): replace the `BackendApiService` fake with a `SupabaseAuthService` fake and assert the rewired flows. Mirror the existing spec's TestBed setup; the key cases:

```ts
// fake injected for SupabaseAuthService
const auth = {
  getUser: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
};
// provider: { provide: SupabaseAuthService, useValue: auth }

it('checkSession → authenticated when a session exists', async () => {
  auth.getUser.mockResolvedValue({ id: 'u1', email: 'a@b.com' });
  // dispatch checkSession; expect sessionResolved({ user: {id:'u1',email:'a@b.com'}, offline: false })
});

it('checkSession → anonymous when no session and no guest flag', async () => {
  auth.getUser.mockResolvedValue(null);
  // expect sessionResolved({ user: null, offline: false })
});

it('login → authSuccess on success', async () => {
  auth.signIn.mockResolvedValue({ id: 'u1', email: 'a@b.com' });
  // dispatch login({email,password,returnUrl}); expect authSuccess({ user, returnUrl })
});

it('login → authFailure on error', async () => {
  auth.signIn.mockRejectedValue(new Error('Invalid login credentials'));
  // expect authFailure({ error: 'Invalid login credentials' })
});

it('logout → loggedOut', async () => {
  auth.signOut.mockResolvedValue(undefined);
  // expect loggedOut()
});
```

Keep the offline spec (`auth.effects.offline.spec.ts`): `environment.offlineOnly = true` still resolves straight to `continueAsGuest()` (that branch is unchanged). Remove any `register` test.

- [ ] **Step 3: Run the tests, verify they fail.** `cd emulador && npx ng test --no-watch` → FAIL (effects still use `BackendApiService`; `Register`/`username` gone).

- [ ] **Step 4: Implement the rewired effects** in `auth.effects.ts`:

```ts
import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Actions, createEffect, ofType, ROOT_EFFECTS_INIT } from '@ngrx/effects';
import { from, of } from 'rxjs';
import { catchError, exhaustMap, map, tap } from 'rxjs/operators';
import { SupabaseAuthService } from '../../auth/supabase-auth.service';
import { AuthActions } from './auth.actions';
import { environment } from '../../../environments/environment';

/** User-facing message (Spanish) from a Supabase/auth error. */
function describeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : '';
  if (/invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos';
  if (/network|fetch/i.test(msg)) return 'No se pudo conectar con el servidor';
  return msg || 'Algo salió mal, inténtalo de nuevo';
}

const GUEST_KEY = 'emulador.guest';

function guestPersisted(): boolean {
  try {
    return localStorage.getItem(GUEST_KEY) === '1';
  } catch {
    return false;
  }
}

@Injectable()
export class AuthEffects {
  private actions$ = inject(Actions);
  private auth = inject(SupabaseAuthService);
  private router = inject(Router);

  init$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ROOT_EFFECTS_INIT),
      map(() => AuthActions.checkSession()),
    ),
  );

  check$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.checkSession),
      exhaustMap(() => {
        if (environment.offlineOnly) return of(AuthActions.continueAsGuest());
        return from(this.auth.getUser()).pipe(
          map((user) =>
            user
              ? AuthActions.sessionResolved({ user, offline: false })
              : guestPersisted()
                ? AuthActions.continueAsGuest()
                : AuthActions.sessionResolved({ user: null, offline: false }),
          ),
          catchError(() => of(AuthActions.sessionResolved({ user: null, offline: true }))),
        );
      }),
    ),
  );

  persistGuest$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AuthActions.continueAsGuest),
        tap(() => {
          try {
            localStorage.setItem(GUEST_KEY, '1');
          } catch {
            /* storage unavailable: ignore */
          }
        }),
      ),
    { dispatch: false },
  );

  login$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.login),
      exhaustMap(({ email, password, returnUrl }) =>
        from(this.auth.signIn(email, password)).pipe(
          map((user) => AuthActions.authSuccess({ user, returnUrl })),
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
          try {
            localStorage.removeItem(GUEST_KEY);
          } catch {
            /* ignore */
          }
          this.router.navigateByUrl('/login');
        }),
      ),
    { dispatch: false },
  );
}
```

- [ ] **Step 5: Run the tests, verify they pass.** `cd emulador && npx ng test --no-watch` → the auth specs PASS, suite stays green. Fix any other spec that referenced `AuthActions.register` or `username`.

- [ ] **Step 6: Gate + commit.** From `emulador/`: `npm run lint && npm run format:check && npm run build`. Then:

```bash
git commit -am "feat(auth): drive auth state from Supabase (signIn/getSession/signOut); drop register"
```

---

## Task 4: Login page → email + invite-only; remove the register route (browser-validated)

**Files:**
- Modify: `emulador/src/app/pages/auth/auth-page.component.ts`
- Modify: `emulador/src/app/pages/auth/auth-page.component.html`
- Modify (tests): `emulador/src/app/pages/auth/auth-page.component.spec.ts`
- Modify: `emulador/src/app/app.routes.ts`

**Interfaces:**
- Consumes: `AuthActions.login({ email, password, returnUrl })` (Task 3).

- [ ] **Step 1: Read** `auth-page.component.html` and `auth-page.component.spec.ts` to see the current username/register markup and what the spec asserts (so you update both consistently).

- [ ] **Step 2: Update the component** `auth-page.component.ts` — replace `username` with `email`, drop the register mode, keep guest:

```ts
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { AuthActions } from '../../state/auth/auth.actions';
import { authFeature } from '../../state/auth/auth.reducer';
import { ButtonDirective } from '../../components/ui/button.directive';
import { environment } from '../../../environments/environment';

/**
 * Login page (invite-only: no registration). Real labels + explicit submit
 * feedback (loading -> error). Guest mode entry preserved.
 */
@Component({
  selector: 'app-auth-page',
  standalone: true,
  imports: [FormsModule, ButtonDirective],
  templateUrl: './auth-page.component.html',
  styleUrl: './auth-page.component.css',
})
export class AuthPageComponent {
  private store = inject(Store);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  pending = this.store.selectSignal(authFeature.selectPending);
  error = this.store.selectSignal(authFeature.selectError);
  status = this.store.selectSignal(authFeature.selectStatus);

  email = signal('');
  password = signal('');

  offline = computed(() => this.status() === 'offline');
  guestModeEnabled = environment.guestModeEnabled;

  private static readonly EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  valid = computed(
    () => AuthPageComponent.EMAIL_RE.test(this.email().trim()) && this.password().length >= 6,
  );

  continueAsGuest(): void {
    this.store.dispatch(AuthActions.continueAsGuest());
    this.router.navigateByUrl('/');
  }

  submit(): void {
    if (!this.valid() || this.pending()) return;
    const returnUrl = this.route.snapshot.queryParamMap.get('volver');
    this.store.dispatch(
      AuthActions.login({ email: this.email().trim(), password: this.password(), returnUrl }),
    );
  }
}
```

- [ ] **Step 3: Update the template** `auth-page.component.html` — swap the username field for an email field, remove the register-link / mode-conditional markup, keep the guest button and error/pending feedback. Concretely: the text input becomes `type="email"` bound to `email()` (label "Correo"), the submit button label is always "Entrar" (no register branch), and any `@if (isLogin())` / register `routerLink` block is deleted. Match the existing CSS classes and the `[disabled]="!valid() || pending()"` / error-message structure already in the file.

- [ ] **Step 4: Remove the `/register` route** in `app.routes.ts` — delete the route object whose `path: 'register'` / `data: { mode: 'register' }`. Leave the `/login` route (drop its now-unused `data: { mode: 'login' }` only if the component no longer reads `mode`; the component above no longer has a `mode` input, so remove the `data` too). Verify no `routerLink="/register"` references remain (grep `src` for `register`).

- [ ] **Step 5: Update the component spec** `auth-page.component.spec.ts` — replace username/register assertions with email/login ones: a valid email + 6-char password enables submit and dispatches `AuthActions.login({ email, password, returnUrl })`; an invalid email keeps it disabled; the guest button dispatches `continueAsGuest`. Remove any register-mode test.

- [ ] **Step 6: Gate.** From `emulador/`: `npm run build && npx ng test --no-watch && npm run lint && npm run format:check` — all clean. Fix any remaining reference to `username`, `mode`, or `register`.

- [ ] **Step 7: Commit.**

```bash
git commit -am "feat(auth): login page uses email; invite-only (remove register route)"
```

- [ ] **Step 8 (browser-validate, the real gate):** with the dev server (`ng serve`, `dataSource='r2'`): visiting a guarded route while logged out redirects to `/login`; logging in with a provisioned Supabase user lands on `/mercados` and a reload stays authenticated (session persisted); wrong credentials show "Correo o contraseña incorrectos"; "Entrar como invitado" enters guest mode and the app is fully usable; `/register` no longer resolves. Confirm the console is free of Supabase errors.

---

## Self-review notes (coverage)

- Spec §4 (Auth) → Tasks 1–4: Supabase client (T1), auth service + AuthUser (T2), effects/actions rewired with guest/offline preserved (T3), email login + invite-only UI + route (T4).
- Coexistence honored: `BackendApiService`, `authInterceptor`, and the `dataSource='csv'`/backend path are untouched (Phase 3 removes them); only auth stops using `BackendApiService`. `AuthUser` is relocated to `auth.models` so Phase 3's deletion of `BackendApiService` won't break the auth state.
- Out of scope here (Phases 2–3): the `sessions`/`folders` tables + RLS, the session sync service, removing the old backend + CSV/backend data path. Phase 1 needs only a Supabase project with email auth + signups disabled.
- Every task is independently testable and ends with the CI gate before committing; Task 4 adds the browser gate.
- Open spec decision (CSV-upload removal) belongs to Phase 3, not this plan.
```
