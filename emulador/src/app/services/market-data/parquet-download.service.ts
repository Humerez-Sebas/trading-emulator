/* eslint-disable @angular-eslint/prefer-inject -- constructor inject()-defaults keep this service unit-testable via direct construction (new Service(deps)) without TestBed; see services design note. */
import { Inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { MARKET_DATA_BASE_URL } from './market-data.config';

/** Base prefix every Parquet object lives under (see `backend/r2_uploader.py`). */
const MARKET_DATA_PREFIX = 'market-data/v1';

/**
 * Downloads a single `.parquet` file from the R2 bucket as an `ArrayBuffer`.
 *
 * The object key follows the uploader layout
 * `market-data/v1/<SYMBOL>/<tf>/<file>.parquet`, fetched under the public base
 * URL (`environment.marketDataBaseUrl`). The returned buffer is handed to the
 * Parquet ingestion worker; this service does no decoding.
 *
 * Error handling is intentionally simple: a non-2xx response or a missing base
 * URL throws. (Retry/backoff is out of scope for the wizard's first launch.)
 */
@Injectable({ providedIn: 'root' })
export class ParquetDownloadService {
  private readonly baseUrl: string;

  constructor(@Inject(MARKET_DATA_BASE_URL) baseUrl: string = environment.marketDataBaseUrl) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  /**
   * Fetches `market-data/v1/<symbol>/<tf>/<file>` and returns its raw bytes.
   *
   * @param symbol Symbol in uppercase (e.g. `XAUUSD`).
   * @param tf     Lowercase timeframe key (`m1`/`h1`/`d1`).
   * @param file   Parquet filename including extension (e.g. `2024.parquet`,
   *               `all.parquet`).
   */
  async downloadParquet(symbol: string, tf: string, file: string): Promise<ArrayBuffer> {
    if (!this.baseUrl) {
      throw new Error(
        'ParquetDownloadService: marketDataBaseUrl no configurado (define environment.marketDataBaseUrl para la fuente R2).',
      );
    }
    const url = `${this.baseUrl}/${MARKET_DATA_PREFIX}/${symbol}/${tf}/${file}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(
        `ParquetDownloadService: no se pudo descargar el parquet ${symbol}/${tf}/${file} (HTTP ${res.status}).`,
      );
    }
    return res.arrayBuffer();
  }
}
