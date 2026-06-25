/**
 * TDD specs for Task 6: ParquetDownloadService — fetches a single `.parquet`
 * file from the R2 bucket as an ArrayBuffer.
 *
 * The R2 key layout (see `pipeline/r2_uploader.py`) is
 * `market-data/v1/<SYMBOL>/<tf>/<file>.parquet`, served under the public base
 * URL. `fetch` is mocked; no network.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ParquetDownloadService } from './parquet-download.service';

function bufferOf(bytes: number[]): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ParquetDownloadService.downloadParquet', () => {
  it('fetches the correct market-data/v1 key and returns the ArrayBuffer', async () => {
    const buf = bufferOf([1, 2, 3, 4]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(buf),
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    const svc = new ParquetDownloadService('https://cdn.example.com/market-data');
    const result = await svc.downloadParquet('XAUUSD', 'm1', '2024.parquet');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://cdn.example.com/market-data/market-data/v1/XAUUSD/m1/2024.parquet',
    );
    expect(new Uint8Array(result)).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it('strips a trailing slash from the base URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(bufferOf([9])),
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    const svc = new ParquetDownloadService('https://cdn.example.com/market-data/');
    await svc.downloadParquet('EURUSD', 'h1', 'all.parquet');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://cdn.example.com/market-data/market-data/v1/EURUSD/h1/all.parquet',
    );
  });

  it('throws when the response is not ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      arrayBuffer: () => Promise.resolve(bufferOf([])),
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    const svc = new ParquetDownloadService('https://cdn.example.com/market-data');
    await expect(svc.downloadParquet('XAUUSD', 'm1', '2024.parquet')).rejects.toThrow(/parquet/i);
  });

  it('throws when no base URL is configured', async () => {
    const svc = new ParquetDownloadService('');
    await expect(svc.downloadParquet('XAUUSD', 'm1', '2024.parquet')).rejects.toThrow(
      /marketDataBaseUrl|URL/i,
    );
  });
});
