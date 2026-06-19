/* eslint-disable @angular-eslint/prefer-inject -- constructor inject()-defaults keep this service unit-testable via direct construction (new Service(deps)) without TestBed; see services design note. */
import { Inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { MARKET_DATA_BASE_URL } from './market-data.config';

/**
 * One partition entry in the R2 `manifest.json` (see `backend/manifest.py`).
 * `size`/`etag`/`updatedAt` are used for cache invalidation in the datasets
 * store, so a downloaded partition is only re-ingested when its etag changes.
 */
export interface ManifestEntry {
  size: number;
  etag: string;
  /** ISO-8601 UTC timestamp, e.g. `2026-06-18T12:00:00Z`. */
  updatedAt: string;
}

/** Lowercase timeframe keys the manifest uses. */
export type ManifestTf = 'm1' | 'h1' | 'd1';

/**
 * Per-timeframe partition map. For `m1` the keys are calendar-year strings
 * (`"2024"`); for `h1`/`d1` the single key is the sentinel `"all"`.
 */
export type ManifestPartitions = Record<string, ManifestEntry>;

/** One symbol's per-timeframe partitions. */
export interface ManifestSymbol {
  m1?: ManifestPartitions;
  h1?: ManifestPartitions;
  d1?: ManifestPartitions;
}

/**
 * Top-level `manifest.json` shape produced by `backend/manifest.py`:
 * `{ version: 1, symbols: { XAUUSD: { m1: { "2024": {...} }, h1: { all: {...} } } } }`.
 */
export interface Manifest {
  version: number;
  symbols: Record<string, ManifestSymbol>;
}

/**
 * Fetches and parses the R2 `manifest.json` and exposes typed read helpers the
 * Data Wizard uses to drive symbol/year selection. Pure aside from the single
 * network call in {@link fetchManifest}; every helper is a synchronous lookup
 * over an already-fetched manifest, so they unit-test without `fetch`.
 *
 * The base URL comes from `environment.marketDataBaseUrl` (no hardcoded URLs);
 * it is injected via the constructor in tests for isolation.
 */
@Injectable({ providedIn: 'root' })
export class ManifestService {
  private readonly baseUrl: string;

  constructor(@Inject(MARKET_DATA_BASE_URL) baseUrl: string = environment.marketDataBaseUrl) {
    // Normalize: drop any trailing slash so URL composition is unambiguous.
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  /** Fetches `${baseUrl}/manifest.json` and returns the parsed manifest. */
  async fetchManifest(): Promise<Manifest> {
    if (!this.baseUrl) {
      throw new Error(
        'ManifestService: marketDataBaseUrl no configurado (define environment.marketDataBaseUrl para la fuente R2).',
      );
    }
    const res = await fetch(`${this.baseUrl}/manifest.json`);
    if (!res.ok) {
      throw new Error(`ManifestService: no se pudo descargar manifest.json (HTTP ${res.status}).`);
    }
    return (await res.json()) as Manifest;
  }

  /** Symbol names present in the manifest, sorted alphabetically. */
  listSymbols(manifest: Manifest): string[] {
    return Object.keys(manifest.symbols ?? {}).sort();
  }

  /** The m1 calendar-year partitions available for a symbol, sorted ascending. */
  listM1Years(manifest: Manifest, symbol: string): string[] {
    const m1 = manifest.symbols?.[symbol]?.m1;
    return m1 ? Object.keys(m1).sort() : [];
  }

  /** True when the symbol exposes the given timeframe in the manifest. */
  hasTf(manifest: Manifest, symbol: string, tf: ManifestTf): boolean {
    const partitions = manifest.symbols?.[symbol]?.[tf];
    return !!partitions && Object.keys(partitions).length > 0;
  }

  /**
   * The manifest entry for a single (symbol, tf, partition), or `undefined`.
   * `partition` is a year string for `m1` or `"all"` for `h1`/`d1`.
   */
  getEntry(
    manifest: Manifest,
    symbol: string,
    tf: ManifestTf,
    partition: string,
  ): ManifestEntry | undefined {
    return manifest.symbols?.[symbol]?.[tf]?.[partition];
  }
}
