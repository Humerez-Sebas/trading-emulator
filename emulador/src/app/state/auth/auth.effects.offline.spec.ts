// offlineOnly build: the session check must NOT touch the backend.
// We provide a fake ENVIRONMENT token with offlineOnly:true instead of vi.mock
// (Angular's vitest integration blocks vi.mock for relative imports).
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideMockActions } from '@ngrx/effects/testing';
import { provideMockStore } from '@ngrx/store/testing';
import { Subject, firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthEffects } from './auth.effects';
import { AuthActions } from './auth.actions';
import { BackendApiService } from '../../services/backend-api.service';
import { ENVIRONMENT } from '../../../environments/environment.token';

describe('AuthEffects (offlineOnly build)', () => {
  let actions$: Subject<any>;
  let api: { me: ReturnType<typeof vi.fn> };
  let effects: AuthEffects;

  beforeEach(() => {
    actions$ = new Subject();
    api = { me: vi.fn() } as any;
    TestBed.configureTestingModule({
      providers: [
        AuthEffects,
        provideMockActions(() => actions$),
        provideMockStore(),
        { provide: BackendApiService, useValue: api },
        { provide: Router, useValue: { navigateByUrl: vi.fn() } },
        {
          provide: ENVIRONMENT,
          useValue: {
            backendUrl: '',
            registrationEnabled: false,
            offlineOnly: true,
            guestModeEnabled: true,
          },
        },
      ],
    });
    effects = TestBed.inject(AuthEffects);
  });

  it('check$ resolves to continueAsGuest without calling api.me', async () => {
    const p = firstValueFrom(effects.check$);
    actions$.next(AuthActions.checkSession());
    expect(await p).toEqual(AuthActions.continueAsGuest());
    expect(api.me).not.toHaveBeenCalled();
  });
});
