/**
 * TDD specs for Task 6: ManifestService — fetches and parses the R2
 * `manifest.json`, exposing typed helpers used by the Data Wizard.
 *
 * `fetch` is mocked (no network); the manifest shape mirrors what
 * `pipeline/manifest.py` produces.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ManifestService, Manifest } from './manifest.service';

const SAMPLE: Manifest = {
  version: 1,
  symbols: {
    XAUUSD: {
      m1: {
        '2023': { size: 100, etag: 'e2023', updatedAt: '2026-01-01T00:00:00Z' },
        '2024': { size: 200, etag: 'e2024', updatedAt: '2026-01-02T00:00:00Z' },
      },
      h1: { all: { size: 50, etag: 'eh1', updatedAt: '2026-01-03T00:00:00Z' } },
      d1: { all: { size: 25, etag: 'ed1', updatedAt: '2026-01-04T00:00:00Z' } },
    },
    EURUSD: {
      m1: { '2024': { size: 300, etag: 'eu2024', updatedAt: '2026-01-05T00:00:00Z' } },
      h1: { all: { size: 60, etag: 'euh1', updatedAt: '2026-01-06T00:00:00Z' } },
      d1: { all: { size: 30, etag: 'eud1', updatedAt: '2026-01-07T00:00:00Z' } },
    },
  },
};

/** Builds a ManifestService whose `fetch` returns the given JSON body. */
function serviceReturning(body: unknown, ok = true, status = 200): ManifestService {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response);
  vi.stubGlobal('fetch', fetchMock);
  return new ManifestService('https://cdn.example.com/market-data');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ManifestService.fetchManifest', () => {
  it('fetches `${baseUrl}/manifest.json` and returns the parsed manifest', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(SAMPLE),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    const svc = new ManifestService('https://cdn.example.com/market-data');
    const manifest = await svc.fetchManifest();

    expect(fetchMock).toHaveBeenCalledWith('https://cdn.example.com/market-data/manifest.json');
    expect(manifest).toEqual(SAMPLE);
  });

  it('strips a trailing slash from the base URL before composing the manifest URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(SAMPLE),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    const svc = new ManifestService('https://cdn.example.com/market-data/');
    await svc.fetchManifest();

    expect(fetchMock).toHaveBeenCalledWith('https://cdn.example.com/market-data/manifest.json');
  });

  it('throws when the response is not ok', async () => {
    const svc = serviceReturning({}, false, 404);
    await expect(svc.fetchManifest()).rejects.toThrow(/manifest/i);
  });

  it('throws when no base URL is configured', async () => {
    const svc = new ManifestService('');
    await expect(svc.fetchManifest()).rejects.toThrow(/marketDataBaseUrl|URL/i);
  });
});

describe('ManifestService helpers (pure, no fetch)', () => {
  let svc: ManifestService;
  beforeEach(() => {
    svc = new ManifestService('https://cdn.example.com/market-data');
  });

  it('listSymbols returns the symbol names sorted', () => {
    expect(svc.listSymbols(SAMPLE)).toEqual(['EURUSD', 'XAUUSD']);
  });

  it('listM1Years returns the m1 year partitions sorted ascending', () => {
    expect(svc.listM1Years(SAMPLE, 'XAUUSD')).toEqual(['2023', '2024']);
  });

  it('listM1Years returns [] for an unknown symbol', () => {
    expect(svc.listM1Years(SAMPLE, 'NOPE')).toEqual([]);
  });

  it('hasH1 / hasD1 reflect the manifest', () => {
    expect(svc.hasTf(SAMPLE, 'XAUUSD', 'h1')).toBe(true);
    expect(svc.hasTf(SAMPLE, 'XAUUSD', 'd1')).toBe(true);
    expect(svc.hasTf(SAMPLE, 'NOPE', 'h1')).toBe(false);
  });

  it('getEntry returns the m1 partition entry for a given year', () => {
    expect(svc.getEntry(SAMPLE, 'XAUUSD', 'm1', '2024')).toEqual({
      size: 200,
      etag: 'e2024',
      updatedAt: '2026-01-02T00:00:00Z',
    });
  });

  it('getEntry returns the h1/d1 "all" partition entry', () => {
    expect(svc.getEntry(SAMPLE, 'XAUUSD', 'h1', 'all')).toEqual({
      size: 50,
      etag: 'eh1',
      updatedAt: '2026-01-03T00:00:00Z',
    });
  });

  it('getEntry returns undefined for a missing partition', () => {
    expect(svc.getEntry(SAMPLE, 'XAUUSD', 'm1', '1999')).toBeUndefined();
    expect(svc.getEntry(SAMPLE, 'NOPE', 'm1', '2024')).toBeUndefined();
  });
});
