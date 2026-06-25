import { describe, expect, it } from 'vitest';
import { authFeature } from './auth.reducer';
import { AuthActions } from './auth.actions';

const reducer = authFeature.reducer;

function initial() {
  return reducer(undefined, { type: '@@init' } as any);
}

const user = { id: 'u1', email: 'alice@example.com' };

describe('auth reducer: sessionResolved', () => {
  it('user present → status authenticated', () => {
    const next = reducer(initial(), AuthActions.sessionResolved({ user }));
    expect(next.status).toBe('authenticated');
    expect(next.user).toEqual(user);
  });

  it('user null → status anonymous', () => {
    const next = reducer(initial(), AuthActions.sessionResolved({ user: null }));
    expect(next.status).toBe('anonymous');
    expect(next.user).toBeNull();
  });
});

describe('auth reducer: login', () => {
  it('login sets pending:true and clears error', () => {
    const s = { ...initial(), error: 'old error' };
    const next = reducer(
      s,
      AuthActions.login({ email: 'u@example.com', password: 'p', returnUrl: null }),
    );
    expect(next.pending).toBe(true);
    expect(next.error).toBeNull();
  });
});

describe('auth reducer: authSuccess', () => {
  it('sets user, status authenticated, pending false, error null', () => {
    const pending = { ...initial(), pending: true, error: 'bad' };
    const next = reducer(pending, AuthActions.authSuccess({ user, returnUrl: null }));
    expect(next.user).toEqual(user);
    expect(next.status).toBe('authenticated');
    expect(next.pending).toBe(false);
    expect(next.error).toBeNull();
  });
});

describe('auth reducer: authFailure', () => {
  it('sets pending false and keeps error message', () => {
    const pending = { ...initial(), pending: true };
    const next = reducer(pending, AuthActions.authFailure({ error: 'Bad credentials' }));
    expect(next.pending).toBe(false);
    expect(next.error).toBe('Bad credentials');
  });
});

describe('auth reducer: loggedOut', () => {
  it('sets user null, status anonymous, pending false', () => {
    const authed = {
      ...initial(),
      user,
      status: 'authenticated' as const,
      pending: true,
    };
    const next = reducer(authed, AuthActions.loggedOut());
    expect(next.user).toBeNull();
    expect(next.status).toBe('anonymous');
    expect(next.pending).toBe(false);
  });
});
