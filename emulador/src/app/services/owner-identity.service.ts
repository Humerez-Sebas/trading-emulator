/* eslint-disable @angular-eslint/prefer-inject -- constructor inject()-defaults keep this service unit-testable via direct construction (new Service(deps)) without TestBed; see services design note. */
import { inject, Injectable } from '@angular/core';
import { SupabaseService } from '../auth/supabase.service';

/**
 * The identity every local user-owned store is keyed by.
 *
 * An interface (not just the class) so specs can hand `WorkspaceDbService` a
 * two-line fake instead of a Supabase client, and so the DB layer's dependency
 * is "something that knows the owner", not "Supabase".
 */
export interface OwnerIdentity {
  /** The current owner's id, or `null` when no session can be resolved. */
  ownerId(): Promise<string | null>;
}

/**
 * Resolves the owner id from the locally-persisted Supabase session.
 *
 * WHY `auth.getSession()` AND NOT THE NgRx AUTH SLICE: `WorkspacesEffects.init$`
 * runs on `ROOT_EFFECTS_INIT`, strictly BEFORE `sessionResolved` — a DB layer
 * that waited for the auth slice would read an empty workspace at every cold
 * start. `getSession()` reads the session Supabase already persisted for this
 * origin (no network on the happy path), which is exactly what
 * `SupabaseAuthService.getUser()` does at bootstrap, so the identity is
 * available before the first store read.
 *
 * MEMOIZATION, AND THE INVARIANT IT DEPENDS ON: once a non-null owner id has
 * been observed it is fixed for the lifetime of the document. That is sound
 * ONLY because `SessionSovereigntyEffects` performs a HARD document navigation
 * on `loggedOut`, so an account switch cannot happen inside one page lifetime.
 * If that reload is ever removed, this memo becomes a cross-account leak — the
 * two are a pair, and a spec pins the reload for that reason.
 *
 * The memo also buys real availability: an access token that expires while the
 * user keeps working offline makes `getSession()` return `null`, and without
 * the memo every local persist would start failing mid-session.
 */
@Injectable({ providedIn: 'root' })
export class OwnerIdentityService implements OwnerIdentity {
  private resolved: string | null = null;

  constructor(private readonly supabase: SupabaseService = inject(SupabaseService)) {}

  async ownerId(): Promise<string | null> {
    if (this.resolved) return this.resolved;
    try {
      const { data } = await this.supabase.client.auth.getSession();
      this.resolved = data.session?.user?.id ?? null;
    } catch {
      // A refresh that fails offline resolves to "unknown owner"; the caller
      // fails closed rather than falling back to the un-owned legacy store.
      this.resolved = null;
    }
    return this.resolved;
  }
}

/** Fixed-identity `OwnerIdentity` for tests and for composition roots that already know the owner. */
export function fixedOwnerIdentity(ownerId: string | null): OwnerIdentity {
  return { ownerId: () => Promise.resolve(ownerId) };
}
