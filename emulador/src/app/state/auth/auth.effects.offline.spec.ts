// offlineOnly build: the session check must NOT touch the backend.
// We mutate environment.offlineOnly before injecting the effect so that
// check$'s exhaustMap callback reads the flag at dispatch time.
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideMockActions } from '@ngrx/effects/testing';
import { provideMockStore } from '@ngrx/store/testing';
import { Subject, firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthEffects } from './auth.effects';
import { AuthActions } from './auth.actions';
import { BackendApiService } from '../../services/backend-api.service';
import { environment } from '../../../environments/environment';

describe('AuthEffects (offlineOnly build)', () => {
  let actions$: Subject<any>;
  let api: { me: ReturnType<typeof vi.fn> };
  let effects: AuthEffects;

  beforeEach(() => {
    environment.offlineOnly = true;

    actions$ = new Subject();
    api = { me: vi.fn() } as any;
    TestBed.configureTestingModule({
      providers: [
        AuthEffects,
        provideMockActions(() => actions$),
        provideMockStore(),
        { provide: BackendApiService, useValue: api },
        { provide: Router, useValue: { navigateByUrl: vi.fn() } },
      ],
    });
    effects = TestBed.inject(AuthEffects);
  });

  afterEach(() => {
    environment.offlineOnly = false;
  });

  it('check$ resolves to continueAsGuest without calling api.me', async () => {
    const p = firstValueFrom(effects.check$);
    actions$.next(AuthActions.checkSession());
    expect(await p).toEqual(AuthActions.continueAsGuest());
    expect(api.me).not.toHaveBeenCalled();
  });
});
