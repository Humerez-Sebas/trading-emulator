import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthActions } from './auth.actions';
import { LOGIN_URL, SessionSovereigntyEffects } from './session-sovereignty.effects';

/**
 * This spec is an EXECUTABLE INVARIANT, not coverage.
 *
 * `OwnerIdentityService` memoizes the resolved owner id for the lifetime of the
 * document. That is only sound because an account switch always crosses a
 * document boundary — which is exactly what this effect guarantees. If someone
 * later replaces the hard navigation with an SPA route change, the memo silently
 * becomes a cross-account leak and the in-memory NgRx state of the previous user
 * becomes persistable into the next user's partition. So the pairing gets a test.
 */
describe('SessionSovereigntyEffects', () => {
  let actions$: Subject<unknown>;
  let assign: ReturnType<typeof vi.fn>;
  let effects: SessionSovereigntyEffects;

  beforeEach(() => {
    actions$ = new Subject();
    assign = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        SessionSovereigntyEffects,
        provideMockActions(() => actions$),
        { provide: DOCUMENT, useValue: { location: { assign } } },
      ],
    });
    effects = TestBed.inject(SessionSovereigntyEffects);
  });

  it('performs a HARD document navigation on loggedOut (kills in-memory carry-over)', () => {
    const sub = effects.hardReloadOnLogout$.subscribe();
    actions$.next(AuthActions.loggedOut());
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith(LOGIN_URL);
    sub.unsubscribe();
  });

  it('does not navigate on any other auth action', () => {
    const sub = effects.hardReloadOnLogout$.subscribe();
    actions$.next(AuthActions.logout());
    actions$.next(AuthActions.checkSession());
    actions$.next(AuthActions.sessionResolved({ user: null }));
    expect(assign).not.toHaveBeenCalled();
    sub.unsubscribe();
  });
});
