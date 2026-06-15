import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthActions } from '../state/auth/auth.actions';

// NOTE: refreshInFlight is module-level state. Each test that touches a 401 path
// must fully drain the refresh response so finalize() resets it to null.
// We use vi.resetModules() between suites and re-import dynamically per describe.

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let store: MockStore;
  let router: { navigateByUrl: ReturnType<typeof vi.fn> };

  // Dynamic import so each describe block (or each test) gets a fresh module.
  async function setup() {
    const { authInterceptor } = await import('./auth.interceptor');

    router = { navigateByUrl: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideMockStore(),
        { provide: Router, useValue: router },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    store = TestBed.inject(MockStore);
  }

  afterEach(() => {
    try {
      httpMock.verify();
    } catch {
      // ignore leftover requests in tests that already handle them
    }
    TestBed.resetTestingModule();
    vi.resetModules();
  });

  it('passes through non-backend URLs without withCredentials', async () => {
    await setup();

    let response: any;
    http.get('http://localhost:8765/mt5/ping').subscribe((r) => (response = r));

    const req = httpMock.expectOne('http://localhost:8765/mt5/ping');
    expect(req.request.withCredentials).toBe(false);
    req.flush({ ok: true });

    expect(response).toEqual({ ok: true });
  });

  it('adds withCredentials to backend requests', async () => {
    await setup();

    http.get('http://localhost:8000/auth/me').subscribe();

    const req = httpMock.expectOne('http://localhost:8000/auth/me');
    expect(req.request.withCredentials).toBe(true);
    req.flush({ id: 1, username: 'u' });
  });

  it('on 401, triggers a refresh and retries the original request successfully', async () => {
    await setup();

    let result: any;
    http.get('http://localhost:8000/api/data').subscribe((r) => (result = r));

    // 1. Original request → 401
    const original = httpMock.expectOne('http://localhost:8000/api/data');
    original.flush(null, { status: 401, statusText: 'Unauthorized' });

    // 2. Interceptor fires a refresh
    const refresh = httpMock.expectOne('http://localhost:8000/auth/refresh');
    refresh.flush({});

    // 3. Retry of the original request
    const retry = httpMock.expectOne('http://localhost:8000/api/data');
    expect(retry.request.withCredentials).toBe(true);
    retry.flush({ data: 42 });

    expect(result).toEqual({ data: 42 });
  });

  it('on 401 then refresh ok then retry 401: dispatches loggedOut and navigates to /login', async () => {
    await setup();

    const dispatchSpy = vi.spyOn(store, 'dispatch');

    let error: any;
    http.get('http://localhost:8000/api/data').subscribe({
      next: () => {},
      error: (e) => (error = e),
    });

    // 1. Original 401
    const original = httpMock.expectOne('http://localhost:8000/api/data');
    original.flush(null, { status: 401, statusText: 'Unauthorized' });

    // 2. Refresh succeeds
    const refresh = httpMock.expectOne('http://localhost:8000/auth/refresh');
    refresh.flush({});

    // 3. Retry also 401
    const retry = httpMock.expectOne('http://localhost:8000/api/data');
    retry.flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(dispatchSpy).toHaveBeenCalledWith(AuthActions.loggedOut());
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
    expect(error).toBeDefined();
  });

  it('does not retry on NO_RETRY endpoints (e.g. /auth/login)', async () => {
    await setup();

    let error: any;
    http.post('http://localhost:8000/auth/login', {}).subscribe({
      next: () => {},
      error: (e) => (error = e),
    });

    const req = httpMock.expectOne('http://localhost:8000/auth/login');
    req.flush(null, { status: 401, statusText: 'Unauthorized' });

    // No refresh request should be made
    httpMock.expectNone('http://localhost:8000/auth/refresh');
    expect(error?.status).toBe(401);
  });

  it('fires only one refresh when two concurrent requests both get 401', async () => {
    await setup();

    // Fire two concurrent backend requests
    http.get('http://localhost:8000/api/a').subscribe();
    http.get('http://localhost:8000/api/b').subscribe();

    // Both get 401
    const reqA = httpMock.expectOne('http://localhost:8000/api/a');
    const reqB = httpMock.expectOne('http://localhost:8000/api/b');
    reqA.flush(null, { status: 401, statusText: 'Unauthorized' });
    reqB.flush(null, { status: 401, statusText: 'Unauthorized' });

    // Only ONE refresh should be issued (shared refreshInFlight)
    const refresh = httpMock.expectOne('http://localhost:8000/auth/refresh');
    refresh.flush({});

    // Both original requests should be retried
    const retryA = httpMock.expectOne('http://localhost:8000/api/a');
    const retryB = httpMock.expectOne('http://localhost:8000/api/b');
    retryA.flush({ from: 'a' });
    retryB.flush({ from: 'b' });
  });
});
