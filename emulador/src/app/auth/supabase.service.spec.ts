import { TestBed } from '@angular/core/testing';
import { SupabaseService } from './supabase.service';

describe('SupabaseService', () => {
  it('exposes a Supabase client with an auth API', () => {
    const service = TestBed.configureTestingModule({}).inject(SupabaseService);
    expect(service.client).toBeTruthy();
    expect(typeof service.client.auth.signInWithPassword).toBe('function');
  });
});
