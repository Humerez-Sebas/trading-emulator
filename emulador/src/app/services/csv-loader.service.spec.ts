import { describe, expect, it } from 'vitest';
import { CsvLoaderService } from './csv-loader.service';

const svc = new CsvLoaderService();

/** Build a minimal valid H1 CSV with n rows. */
function h1Csv(n: number, startEpoch = 1700000000): string {
  const rows = ['time,open,high,low,close'];
  for (let i = 0; i < n; i++) {
    const t = startEpoch + i * 3600;
    rows.push(`${t},100,101,99,100`);
  }
  return rows.join('\n');
}

/** H1 CSV using YYYY-MM-DD HH:MM datetime format. */
function h1CsvDatetime(n: number): string {
  const rows = ['time,open,high,low,close'];
  // start 2023-11-15 00:00 UTC
  for (let i = 0; i < n; i++) {
    const d = new Date((1700006400 + i * 3600) * 1000);
    const iso = d.toISOString().slice(0, 16).replace('T', ' ');
    rows.push(`${iso},100,101,99,100`);
  }
  return rows.join('\n');
}

/** H1 CSV using YYYY-MM-DD HH:MM:SS datetime format. */
function h1CsvDatetimeSecs(n: number): string {
  const rows = ['time,open,high,low,close'];
  for (let i = 0; i < n; i++) {
    const d = new Date((1700006400 + i * 3600) * 1000);
    const iso = d.toISOString().slice(0, 19).replace('T', ' ');
    rows.push(`${iso},100,101,99,100`);
  }
  return rows.join('\n');
}

describe('CsvLoaderService.parseText', () => {
  it('parses unix-second timestamps into H1 candles', () => {
    const result = svc.parseText(h1Csv(5), 'test.csv');
    expect(result.tf).toBe('H1');
    expect(result.candles).toHaveLength(5);
    expect(result.candles[0]).toEqual({
      time: 1700000000,
      open: 100,
      high: 101,
      low: 99,
      close: 100,
    });
    expect(result.fileName).toBe('test.csv');
  });

  it('parses YYYY-MM-DD HH:MM timestamps as UTC seconds', () => {
    const result = svc.parseText(h1CsvDatetime(5), 'test.csv');
    expect(result.tf).toBe('H1');
    expect(result.candles).toHaveLength(5);
    // all times are multiples of 3600 (H1)
    for (let i = 1; i < result.candles.length; i++) {
      const gap = result.candles[i].time - result.candles[i - 1].time;
      expect(gap).toBe(3600);
    }
  });

  it('parses YYYY-MM-DD HH:MM:SS timestamps as UTC seconds', () => {
    const result = svc.parseText(h1CsvDatetimeSecs(5), 'test.csv');
    expect(result.tf).toBe('H1');
    expect(result.candles).toHaveLength(5);
  });

  it('sorts candles by time', () => {
    // rows out of order in the file (>=3 so the TF can be detected)
    const rows = [
      'time,open,high,low,close',
      '1700003600,101,102,100,101',
      '1700007200,102,103,101,102',
      '1700000000,100,101,99,100',
    ];
    const result = svc.parseText(rows.join('\n'), 'test.csv');
    expect(result.candles.map((c) => c.time)).toEqual([1700000000, 1700003600, 1700007200]);
  });

  it('throws "archivo vacio" when fewer than 2 lines', () => {
    expect(() => svc.parseText('time,open,high,low,close', 'f.csv')).toThrow('archivo vacio');
    expect(() => svc.parseText('', 'f.csv')).toThrow('archivo vacio');
  });

  it('throws "falta la columna" for a missing required column', () => {
    const csv = 'time,open,high,low\n1700000000,100,101,99';
    expect(() => svc.parseText(csv, 'f.csv')).toThrow('falta la columna "close"');
  });

  it('throws "fila N invalida" for a row with non-finite values', () => {
    const csv = 'time,open,high,low,close\n1700000000,abc,101,99,100';
    expect(() => svc.parseText(csv, 'f.csv')).toThrow('fila 2 invalida');
  });

  it('throws "no se pudo detectar la temporalidad" for an undetectable spacing', () => {
    // 5000s spacing sits between H1 (3600) and H2 (7200), >15% from both,
    // so detectTimeframe returns null
    const rows = [
      'time,open,high,low,close',
      '0,100,101,99,100',
      '5000,100,101,99,100',
      '10000,100,101,99,100',
      '15000,100,101,99,100',
      '20000,100,101,99,100',
    ];
    expect(() => svc.parseText(rows.join('\n'), 'f.csv')).toThrow(
      'no se pudo detectar la temporalidad',
    );
  });
});

describe('CsvLoaderService.parse', () => {
  it('delegates to parseText via File.text()', async () => {
    const csv = h1Csv(5);
    const file = new File([csv], 'xau_h1.csv', { type: 'text/csv' });
    const result = await svc.parse(file);
    expect(result.tf).toBe('H1');
    expect(result.fileName).toBe('xau_h1.csv');
    expect(result.candles).toHaveLength(5);
  });
});
