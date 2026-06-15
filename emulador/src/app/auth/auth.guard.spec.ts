import { TestBed } from '@angular/core/testing';
import { Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authGuard } from './auth.guard';
import { authFeature } from '../state/auth/auth.reducer';

describe('authGuard', () => {
  let store: MockStore;
  let router: { navigateByUrl: ReturnType<typeof vi.fn>; createUrlTree: ReturnType<typeof vi.fn> };
  const fakeRoute = {} as ActivatedRouteSnapshot;

  beforeEach(() => {
    router = {
      navigateByUrl: vi.fn(),
      createUrlTree: vi.fn().mockReturnValue('URLTREE'),
    };

    TestBed.configureTestingModule({
      providers: [provideMockStore(), { provide: Router, useValue: router }],
    });
    store = TestBed.inject(MockStore);
  });

  function runGuard(url: string) {
    return TestBed.runInInjectionContext(() =>
      authGuard(fakeRoute, { url } as RouterStateSnapshot),
    );
  }

  it('returns true when status is "authenticated"', async () => {
    store.overrideSelector(authFeature.selectStatus, 'authenticated');
    store.refreshState();

    const result = await firstValueFrom(runGuard('/protected') as any);
    expect(result).toBe(true);
  });

  it('returns true when status is "offline"', async () => {
    store.overrideSelector(authFeature.selectStatus, 'offline');
    store.refreshState();

    const result = await firstValueFrom(runGuard('/protected') as any);
    expect(result).toBe(true);
  });

  it('returns a UrlTree for /login with volver param when status is "anonymous"', async () => {
    store.overrideSelector(authFeature.selectStatus, 'anonymous');
    store.refreshState();

    const result = await firstValueFrom(runGuard('/secret') as any);
    expect(result).toBe('URLTREE');
    expect(router.createUrlTree).toHaveBeenCalledWith(['/login'], {
      queryParams: { volver: '/secret' },
    });
  });

  it('waits for non-unknown status: emits "unknown" first then "authenticated" → resolves true', async () => {
    // Use a BehaviorSubject to push two values through the selector
    const status$ = new BehaviorSubject<any>('unknown');
    store.overrideSelector(authFeature.selectStatus, 'unknown' as any);
    store.refreshState();

    // Override with a stream that transitions from unknown -> authenticated
    vi.spyOn(store, 'select').mockReturnValue(status$ as any);

    const resultP = firstValueFrom(runGuard('/guarded') as any);

    // Push the resolving value
    status$.next('authenticated');

    const result = await resultP;
    expect(result).toBe(true);
  });
});
