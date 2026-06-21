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
