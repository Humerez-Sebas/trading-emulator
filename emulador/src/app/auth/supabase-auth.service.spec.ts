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
