import { Injectable } from '@angular/core';
import { Candle, detectTimeframe, Timeframe } from '../models';

export interface CsvResult {
  tf: Timeframe;
  candles: Candle[];
  fileName: string;
}

@Injectable({ providedIn: 'root' })
export class CsvLoaderService {
  /**
   * Parses a CSV with header `time,open,high,low,close`.
   * `time` in "YYYY-MM-DD HH:MM" format (UTC) or unix timestamp in seconds.
   *
   * Error messages are user-facing (shown in the UI), hence in Spanish.
   */
  async parse(file: File): Promise<CsvResult> {
    return this.parseText(await file.text(), file.name);
  }

  /** Parses already-read CSV content (local file or helper download). */
  parseText(text: string, fileName: string): CsvResult {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) throw new Error(`${fileName}: archivo vacio`);

    const header = lines[0]
      .toLowerCase()
      .split(',')
      .map((h) => h.trim());
    const col = (name: string) => {
      const i = header.indexOf(name);
      if (i < 0) throw new Error(`${fileName}: falta la columna "${name}"`);
      return i;
    };
    const iT = col('time'),
      iO = col('open'),
      iH = col('high'),
      iL = col('low'),
      iC = col('close');

    const candles: Candle[] = [];
    for (let n = 1; n < lines.length; n++) {
      const p = lines[n].split(',');
      const time = this.parseTime(p[iT]);
      const open = +p[iO],
        high = +p[iH],
        low = +p[iL],
        close = +p[iC];
      if (
        !isFinite(time) ||
        !isFinite(open) ||
        !isFinite(high) ||
        !isFinite(low) ||
        !isFinite(close)
      ) {
        throw new Error(`${fileName}: fila ${n + 1} invalida: "${lines[n]}"`);
      }
      candles.push({ time, open, high, low, close });
    }
    candles.sort((a, b) => a.time - b.time);

    const tf = detectTimeframe(candles);
    if (!tf) throw new Error(`${fileName}: no se pudo detectar la temporalidad`);
    return { tf, candles, fileName };
  }

  private parseTime(raw: string): number {
    const s = raw.trim();
    if (/^\d+$/.test(s)) return +s; // already a unix timestamp
    // "YYYY-MM-DD HH:MM[:SS]" interpreted as UTC
    const iso = s.replace(' ', 'T') + (s.length <= 16 ? ':00' : '') + 'Z';
    return Math.floor(new Date(iso).getTime() / 1000);
  }
}
