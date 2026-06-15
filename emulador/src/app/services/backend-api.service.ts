import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { Candle } from '../models';

/**
 * NOTE: the Spanish property names mirror the backend's wire format
 * (consistent with the MT5 helper contract) and must not be renamed.
 */
export interface AuthUser {
  id: number;
  username: string;
}

export interface TfCoverage {
  tf: string;
  /** UTC epoch seconds of the first/last candle stored. */
  desde: number;
  hasta: number;
  velas: number;
}

export interface BackendSymbol {
  name: string;
  descripcion: string;
  categoria: string;
  digits: number;
  cobertura: TfCoverage[];
}

export interface UserSymbolsResponse {
  symbols: string[];
  total: number;
}

interface CandlesChunk {
  symbol: string;
  tf: string;
  /** [time, open, high, low, close] */
  velas: [number, number, number, number, number][];
  siguiente: number | null;
}

const CHUNK = 50_000;

@Injectable({ providedIn: 'root' })
export class BackendApiService {
  private http = inject(HttpClient);
  private base = environment.backendUrl;

  // ---- auth ----

  register(username: string, password: string): Observable<AuthUser> {
    return this.http.post<AuthUser>(`${this.base}/auth/register`, { username, password });
  }

  login(username: string, password: string): Observable<AuthUser> {
    return this.http.post<AuthUser>(`${this.base}/auth/login`, { username, password });
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${this.base}/auth/logout`, {});
  }

  refresh(): Observable<AuthUser> {
    return this.http.post<AuthUser>(`${this.base}/auth/refresh`, {});
  }

  me(): Observable<AuthUser> {
    return this.http.get<AuthUser>(`${this.base}/auth/me`);
  }

  // ---- data ----

  symbols(q = ''): Observable<{ total: number; symbols: BackendSymbol[] }> {
    return this.http.get<{ total: number; symbols: BackendSymbol[] }>(`${this.base}/symbols`, {
      params: q ? { q } : {},
    });
  }

  /** The user's curated symbol selection (server-side, multi-device). */
  getUserSymbols(): Observable<UserSymbolsResponse> {
    return this.http.get<UserSymbolsResponse>(`${this.base}/user/symbols`);
  }

  /** Replaces the whole selection (the backend drops unknown symbols). */
  putUserSymbols(symbols: string[]): Observable<UserSymbolsResponse> {
    return this.http.put<UserSymbolsResponse>(`${this.base}/user/symbols`, { symbols });
  }

  /**
   * Streams the stored history of one symbol+TF chunk by chunk (M1 series
   * run into the millions of candles, so the CALLER decides where each
   * chunk goes — typically straight to IndexedDB — instead of this method
   * accumulating everything in memory). `desde` > 0 resumes an interrupted
   * download from the last persisted candle.
   */
  async downloadChunked(
    symbol: string,
    tf: string,
    desde: number | undefined,
    onChunk: (candles: Candle[]) => Promise<void>,
  ): Promise<void> {
    let cursor: number | null = desde ?? null;
    for (;;) {
      const params: Record<string, string | number> = { symbol, tf, limite: CHUNK };
      if (cursor !== null) params['desde'] = cursor;
      const chunk = await firstValueFrom(
        this.http.get<CandlesChunk>(`${this.base}/candles`, { params }),
      );
      const candles: Candle[] = chunk.velas.map(([time, open, high, low, close]) => ({
        time,
        open,
        high,
        low,
        close,
      }));
      await onChunk(candles);
      cursor = chunk.siguiente;
      if (cursor === null) return;
    }
  }
}
