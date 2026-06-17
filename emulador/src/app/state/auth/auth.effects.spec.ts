import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideMockActions } from '@ngrx/effects/testing';
import { provideMockStore } from '@ngrx/store/testing';
import { of, throwError, Subject } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpErrorResponse } from '@angular/common/http';

import { AuthEffects } from './auth.effects';
import { AuthActions } from './auth.actions';
import { BackendApiService } from '../../services/backend-api.service';
import { ROOT_EFFECTS_INIT } from '@ngrx/effects';

describe('AuthEffects', () => {
  let actions$: Subject<any>;
  let api: Record<keyof BackendApiService, ReturnType<typeof vi.fn>>;
  let router: { navigateByUrl: ReturnType<typeof vi.fn> };
  let effects: AuthEffects;

  const mockUser = { id: 1, username: 'test' };

  function httpError(status: number, detail?: string): HttpErrorResponse {
    return new HttpErrorResponse({
      status,
      error: detail ? { detail } : null,
      url: 'http://localhost:8000/test',
    });
  }

  beforeEach(() => {
    actions$ = new Subject();
    api = {
      me: vi.fn(),
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refresh: vi.fn(),
      symbols: vi.fn(),
      downloadChunked: vi.fn(),
    } as any;

    router = { navigateByUrl: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        AuthEffects,
        provideMockActions(() => actions$),
        provideMockStore(),
        { provide: BackendApiService, useValue: api },
        { provide: Router, useValue: router },
      ],
    });
    effects = TestBed.inject(AuthEffects);
  });

  afterEach(() => {
    localStorage.removeItem('emulador.guest');
  });

  describe('init$', () => {
    it('dispatches checkSession on ROOT_EFFECTS_INIT', async () => {
      const p = firstValueFrom(effects.init$);
      actions$.next({ type: ROOT_EFFECTS_INIT });
      expect(await p).toEqual(AuthActions.checkSession());
    });
  });

  describe('check$', () => {
    it('dispatches sessionResolved with user and offline:false on success', async () => {
      api.me.mockReturnValue(of(mockUser));

      const p = firstValueFrom(effects.check$);
      actions$.next(AuthActions.checkSession());

      expect(await p).toEqual(AuthActions.sessionResolved({ user: mockUser, offline: false }));
    });

    it('dispatches sessionResolved with user:null and offline:true on status 0 error', async () => {
      api.me.mockReturnValue(throwError(() => httpError(0)));

      const p = firstValueFrom(effects.check$);
      actions$.next(AuthActions.checkSession());

      expect(await p).toEqual(AuthActions.sessionResolved({ user: null, offline: true }));
    });

    it('dispatches sessionResolved with user:null and offline:false on status 401', async () => {
      api.me.mockReturnValue(throwError(() => httpError(401)));

      const p = firstValueFrom(effects.check$);
      actions$.next(AuthActions.checkSession());

      expect(await p).toEqual(AuthActions.sessionResolved({ user: null, offline: false }));
    });

    it('honors a persisted guest flag on a 401 (anonymous) response', async () => {
      localStorage.setItem('emulador.guest', '1');
      api.me.mockReturnValue(throwError(() => httpError(401)));

      const p = firstValueFrom(effects.check$);
      actions$.next(AuthActions.checkSession());

      expect(await p).toEqual(AuthActions.continueAsGuest());
    });
  });

  describe('persistGuest$', () => {
    it('writes the guest flag to localStorage', async () => {
      localStorage.removeItem('emulador.guest');
      const sub = effects.persistGuest$.subscribe();
      actions$.next(AuthActions.continueAsGuest());
      await Promise.resolve();
      expect(localStorage.getItem('emulador.guest')).toBe('1');
      sub.unsubscribe();
    });
  });

  describe('login$', () => {
    it('dispatches authSuccess on successful login', async () => {
      api.login.mockReturnValue(of(mockUser));

      const p = firstValueFrom(effects.login$);
      actions$.next(AuthActions.login({ username: 'test', password: 'pass', returnUrl: '/home' }));

      expect(await p).toEqual(AuthActions.authSuccess({ user: mockUser, returnUrl: '/home' }));
    });

    it('dispatches authFailure with "No se pudo conectar" when status 0 (describeError branch)', async () => {
      api.login.mockReturnValue(throwError(() => httpError(0)));

      const p = firstValueFrom(effects.login$);
      actions$.next(AuthActions.login({ username: 'test', password: 'pass', returnUrl: null }));

      expect(await p).toEqual(
        AuthActions.authFailure({ error: 'No se pudo conectar con el servidor' }),
      );
    });

    it('dispatches authFailure with the detail string when error.detail is a string', async () => {
      api.login.mockReturnValue(throwError(() => httpError(400, 'Credenciales incorrectas')));

      const p = firstValueFrom(effects.login$);
      actions$.next(AuthActions.login({ username: 'x', password: 'y', returnUrl: null }));

      expect(await p).toEqual(AuthActions.authFailure({ error: 'Credenciales incorrectas' }));
    });

    it('dispatches authFailure with generic message when error.detail is not a string', async () => {
      api.login.mockReturnValue(throwError(() => httpError(500)));

      const p = firstValueFrom(effects.login$);
      actions$.next(AuthActions.login({ username: 'x', password: 'y', returnUrl: null }));

      expect(await p).toEqual(
        AuthActions.authFailure({ error: 'Algo salió mal, inténtalo de nuevo' }),
      );
    });
  });

  describe('register$', () => {
    it('dispatches authSuccess on successful registration', async () => {
      api.register.mockReturnValue(of(mockUser));

      const p = firstValueFrom(effects.register$);
      actions$.next(
        AuthActions.register({ username: 'newuser', password: 'pass123', returnUrl: null }),
      );

      expect(await p).toEqual(AuthActions.authSuccess({ user: mockUser, returnUrl: null }));
    });

    it('dispatches authFailure on registration error', async () => {
      api.register.mockReturnValue(throwError(() => httpError(409, 'Usuario ya existe')));

      const p = firstValueFrom(effects.register$);
      actions$.next(AuthActions.register({ username: 'taken', password: 'pass', returnUrl: null }));

      expect(await p).toEqual(AuthActions.authFailure({ error: 'Usuario ya existe' }));
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
    it('dispatches loggedOut after successful logout', async () => {
      api.logout.mockReturnValue(of(undefined));

      const p = firstValueFrom(effects.logout$);
      actions$.next(AuthActions.logout());

      expect(await p).toEqual(AuthActions.loggedOut());
    });

    it('dispatches loggedOut even when the server call fails (catchError)', async () => {
      api.logout.mockReturnValue(throwError(() => httpError(500)));

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
