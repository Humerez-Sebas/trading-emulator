import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideMockActions } from '@ngrx/effects/testing';
import { provideMockStore } from '@ngrx/store/testing';
import { Subject, firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthEffects } from './auth.effects';
import { AuthActions } from './auth.actions';
import { SupabaseAuthService } from '../../auth/supabase-auth.service';
import { ROOT_EFFECTS_INIT } from '@ngrx/effects';

describe('AuthEffects', () => {
  let actions$: Subject<any>;
  let auth: {
    getUser: ReturnType<typeof vi.fn>;
    signIn: ReturnType<typeof vi.fn>;
    signOut: ReturnType<typeof vi.fn>;
  };
  let router: { navigateByUrl: ReturnType<typeof vi.fn> };
  let effects: AuthEffects;

  const mockUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(() => {
    actions$ = new Subject();
    auth = {
      getUser: vi.fn(),
      signIn: vi.fn(),
      signOut: vi.fn(),
    };

    router = { navigateByUrl: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        AuthEffects,
        provideMockActions(() => actions$),
        provideMockStore(),
        { provide: SupabaseAuthService, useValue: auth },
        { provide: Router, useValue: router },
      ],
    });
    effects = TestBed.inject(AuthEffects);
  });

  describe('init$', () => {
    it('dispatches checkSession on ROOT_EFFECTS_INIT', async () => {
      const p = firstValueFrom(effects.init$);
      actions$.next({ type: ROOT_EFFECTS_INIT });
      expect(await p).toEqual(AuthActions.checkSession());
    });
  });

  describe('check$', () => {
    it('checkSession → authenticated when a session exists', async () => {
      auth.getUser.mockResolvedValue(mockUser);

      const p = firstValueFrom(effects.check$);
      actions$.next(AuthActions.checkSession());

      expect(await p).toEqual(AuthActions.sessionResolved({ user: mockUser }));
    });

    it('checkSession → anonymous when no session', async () => {
      auth.getUser.mockResolvedValue(null);

      const p = firstValueFrom(effects.check$);
      actions$.next(AuthActions.checkSession());

      expect(await p).toEqual(AuthActions.sessionResolved({ user: null }));
    });

    it('checkSession → anonymous when getUser throws', async () => {
      auth.getUser.mockRejectedValue(new Error('boom'));

      const p = firstValueFrom(effects.check$);
      actions$.next(AuthActions.checkSession());

      expect(await p).toEqual(AuthActions.sessionResolved({ user: null }));
    });
  });

  describe('login$', () => {
    it('login → authSuccess on success', async () => {
      auth.signIn.mockResolvedValue(mockUser);

      const p = firstValueFrom(effects.login$);
      actions$.next(
        AuthActions.login({ email: 'a@b.com', password: 'pass12', returnUrl: '/home' }),
      );

      expect(await p).toEqual(AuthActions.authSuccess({ user: mockUser, returnUrl: '/home' }));
    });

    it('login → authFailure with the Spanish credentials message', async () => {
      auth.signIn.mockRejectedValue(new Error('Invalid login credentials'));

      const p = firstValueFrom(effects.login$);
      actions$.next(AuthActions.login({ email: 'a@b.com', password: 'pass12', returnUrl: null }));

      expect(await p).toEqual(
        AuthActions.authFailure({ error: 'Correo o contraseña incorrectos' }),
      );
    });

    it('login → authFailure with the network message', async () => {
      auth.signIn.mockRejectedValue(new Error('Failed to fetch'));

      const p = firstValueFrom(effects.login$);
      actions$.next(AuthActions.login({ email: 'a@b.com', password: 'pass12', returnUrl: null }));

      expect(await p).toEqual(
        AuthActions.authFailure({ error: 'No se pudo conectar con el servidor' }),
      );
    });

    it('login → authFailure with the unconfirmed-email message', async () => {
      auth.signIn.mockRejectedValue(new Error('Email not confirmed'));

      const p = firstValueFrom(effects.login$);
      actions$.next(AuthActions.login({ email: 'a@b.com', password: 'pass12', returnUrl: null }));

      expect(await p).toEqual(
        AuthActions.authFailure({ error: 'Tu cuenta aún no está confirmada' }),
      );
    });

    it('login → authFailure with a generic message for an unknown error', async () => {
      auth.signIn.mockRejectedValue(new Error(''));

      const p = firstValueFrom(effects.login$);
      actions$.next(AuthActions.login({ email: 'a@b.com', password: 'pass12', returnUrl: null }));

      expect(await p).toEqual(
        AuthActions.authFailure({ error: 'Algo salió mal, inténtalo de nuevo' }),
      );
    });
  });

  describe('navigateAfterAuth$', () => {
    it('navigates to returnUrl when provided', async () => {
      const sub = effects.navigateAfterAuth$.subscribe();
      actions$.next(AuthActions.authSuccess({ user: mockUser, returnUrl: '/dashboard' }));
      await Promise.resolve();

      expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard');
      sub.unsubscribe();
    });

    it('navigates to /mercados when returnUrl is null', async () => {
      const sub = effects.navigateAfterAuth$.subscribe();
      actions$.next(AuthActions.authSuccess({ user: mockUser, returnUrl: null }));
      await Promise.resolve();

      expect(router.navigateByUrl).toHaveBeenCalledWith('/mercados');
      sub.unsubscribe();
    });
  });

  describe('logout$', () => {
    it('logout → loggedOut after a successful signOut', async () => {
      auth.signOut.mockResolvedValue(undefined);

      const p = firstValueFrom(effects.logout$);
      actions$.next(AuthActions.logout());

      expect(await p).toEqual(AuthActions.loggedOut());
    });

    it('dispatches loggedOut even when signOut fails (catchError)', async () => {
      auth.signOut.mockRejectedValue(new Error('boom'));

      const p = firstValueFrom(effects.logout$);
      actions$.next(AuthActions.logout());

      expect(await p).toEqual(AuthActions.loggedOut());
    });
  });

  describe('redirectAfterLogout$', () => {
    it('navigates to /login after loggedOut', async () => {
      const sub = effects.redirectAfterLogout$.subscribe();
      actions$.next(AuthActions.loggedOut());
      await Promise.resolve();

      expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
      sub.unsubscribe();
    });
  });
});
