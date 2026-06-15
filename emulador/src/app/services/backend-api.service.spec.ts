import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendApiService } from './backend-api.service';

const BASE = 'http://localhost:8000';

describe('BackendApiService', () => {
  let api: BackendApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [BackendApiService, provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(BackendApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  // ---- auth endpoints ----

  it('register POSTs credentials and returns user', () => {
    let result: unknown;
    api.register('alice', 'secret123').subscribe((u) => (result = u));
    const req = http.expectOne(`${BASE}/auth/register`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ username: 'alice', password: 'secret123' });
    req.flush({ id: 1, username: 'alice' });
    expect(result).toEqual({ id: 1, username: 'alice' });
  });

  it('login POSTs credentials and returns user', () => {
    let result: unknown;
    api.login('bob', 'pass456').subscribe((u) => (result = u));
    const req = http.expectOne(`${BASE}/auth/login`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ username: 'bob', password: 'pass456' });
    req.flush({ id: 2, username: 'bob' });
    expect(result).toEqual({ id: 2, username: 'bob' });
  });

  it('logout POSTs empty body', () => {
    let called = false;
    api.logout().subscribe(() => (called = true));
    const req = http.expectOne(`${BASE}/auth/logout`);
    expect(req.request.method).toBe('POST');
    req.flush(null);
    expect(called).toBe(true);
  });

  it('refresh POSTs and returns refreshed user', () => {
    let result: unknown;
    api.refresh().subscribe((u) => (result = u));
    const req = http.expectOne(`${BASE}/auth/refresh`);
    expect(req.request.method).toBe('POST');
    req.flush({ id: 1, username: 'alice' });
    expect(result).toEqual({ id: 1, username: 'alice' });
  });

  it('me GETs current user', () => {
    let result: unknown;
    api.me().subscribe((u) => (result = u));
    const req = http.expectOne(`${BASE}/auth/me`);
    expect(req.request.method).toBe('GET');
    req.flush({ id: 3, username: 'charlie' });
    expect(result).toEqual({ id: 3, username: 'charlie' });
  });

  // ---- symbols ----

  it('symbols GETs without q param when empty', () => {
    let result: unknown;
    api.symbols().subscribe((r) => (result = r));
    const req = http.expectOne(`${BASE}/symbols`);
    expect(req.request.params.has('q')).toBe(false);
    req.flush({ total: 0, symbols: [] });
    expect(result).toEqual({ total: 0, symbols: [] });
  });

  it('symbols puts q in params when non-empty', () => {
    api.symbols('gold').subscribe();
    const req = http.expectOne((r) => r.url === `${BASE}/symbols`);
    expect(req.request.params.get('q')).toBe('gold');
    req.flush({ total: 1, symbols: [] });
  });

  // ---- user symbols ----

  it('getUserSymbols GETs the selection', () => {
    let result: unknown;
    api.getUserSymbols().subscribe((r) => (result = r));
    const req = http.expectOne(`${BASE}/user/symbols`);
    expect(req.request.method).toBe('GET');
    req.flush({ symbols: ['US30'], total: 1 });
    expect(result).toEqual({ symbols: ['US30'], total: 1 });
  });

  it('putUserSymbols PUTs the full list', () => {
    api.putUserSymbols(['US30', 'XAUUSD']).subscribe();
    const req = http.expectOne(`${BASE}/user/symbols`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ symbols: ['US30', 'XAUUSD'] });
    req.flush({ symbols: ['US30', 'XAUUSD'], total: 2 });
  });

  // ---- downloadChunked ----

  it('downloadChunked calls onChunk twice and maps candles', async () => {
    const chunks: unknown[][] = [];
    const onChunk = vi.fn(async (c: unknown[]) => {
      chunks.push(c);
    });

    const p = api.downloadChunked('XAUUSD', 'H1', undefined, onChunk as any);

    // first request
    const req1 = http.expectOne((r) => r.url === `${BASE}/candles`);
    expect(req1.request.params.get('symbol')).toBe('XAUUSD');
    expect(req1.request.params.get('tf')).toBe('H1');
    expect(req1.request.params.get('limite')).toBe('50000');
    expect(req1.request.params.has('desde')).toBe(false);
    req1.flush({
      symbol: 'XAUUSD',
      tf: 'H1',
      velas: [
        [1700000000, 100, 101, 99, 100],
        [1700003600, 101, 102, 100, 101],
      ],
      siguiente: 12345,
    });

    // drain microtasks so the async loop (firstValueFrom + await onChunk)
    // issues the next HTTP request before we assert on it
    await new Promise((r) => setTimeout(r));

    // second request
    const req2 = http.expectOne((r) => r.url === `${BASE}/candles`);
    expect(req2.request.params.get('desde')).toBe('12345');
    expect(req2.request.params.get('limite')).toBe('50000');
    req2.flush({
      symbol: 'XAUUSD',
      tf: 'H1',
      velas: [[1700007200, 102, 103, 101, 102]],
      siguiente: null,
    });

    await p;

    expect(onChunk).toHaveBeenCalledTimes(2);
    expect(chunks[0]).toEqual([
      { time: 1700000000, open: 100, high: 101, low: 99, close: 100 },
      { time: 1700003600, open: 101, high: 102, low: 100, close: 101 },
    ]);
    expect(chunks[1]).toEqual([{ time: 1700007200, open: 102, high: 103, low: 101, close: 102 }]);
  });

  it('downloadChunked passes desde on first request when provided', async () => {
    const onChunk = vi.fn(async () => {});
    const p = api.downloadChunked('XAUUSD', 'H1', 1700000000, onChunk);

    const req = http.expectOne((r) => r.url === `${BASE}/candles`);
    expect(req.request.params.get('desde')).toBe('1700000000');
    req.flush({ symbol: 'XAUUSD', tf: 'H1', velas: [], siguiente: null });
    await p;
    expect(onChunk).toHaveBeenCalledTimes(1);
  });
});
