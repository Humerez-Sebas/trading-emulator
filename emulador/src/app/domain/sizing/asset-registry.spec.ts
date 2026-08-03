import { describe, expect, it } from 'vitest';
import { GENERATED_ASSETS, GENERATED_SOURCE } from './asset-registry.generated';
import { resolveAsset } from './asset-registry';
import { contractSizeFor, pipSizeFor } from './position-sizing';

const CURADOS = ['US30', 'NAS100', 'SP500', 'XAUUSD'];

describe('resolveAsset — los cuatro símbolos curados resuelven al registro generado', () => {
  it('source es la cabecera de procedencia MT5 para los cuatro', () => {
    for (const symbol of CURADOS) {
      expect(resolveAsset(symbol).source).toBe(GENERATED_SOURCE);
    }
  });

  it('contractSize/tickSize/volumeStep/volumeMin/digits/currency vienen del registro generado', () => {
    for (const symbol of CURADOS) {
      const spec = resolveAsset(symbol);
      const generated = GENERATED_ASSETS[symbol];
      expect(spec.contractSize).toBe(generated.contractSize);
      expect(spec.tickSize).toBe(generated.tickSize);
      expect(spec.volumeStep).toBe(generated.volumeStep);
      expect(spec.volumeMin).toBe(generated.volumeMin);
      expect(spec.digits).toBe(generated.digits);
      expect(spec.currency).toBe(generated.currency);
    }
  });

  it('es insensible a mayúsculas (mismo símbolo, minúsculas)', () => {
    const upper = resolveAsset('XAUUSD');
    const lower = resolveAsset('xauusd');
    expect(lower).toEqual(upper);
  });
});

describe('resolveAsset — pipSize === null para los cuatro curados (D.20.3)', () => {
  // Hecho verificado que hace correcta la decisión D.20.3 (sin toggle de
  // unidad): ninguno de los cuatro símbolos del catálogo tiene un segundo
  // estado válido "en pips" — todos son puntos. Si esto alguna vez deja de
  // sostenerse, la etiqueta de unidad de la UI queda silenciosamente mal.
  it('pipSize es null (puntos, no pips) para US30, NAS100, SP500 y XAUUSD', () => {
    for (const symbol of CURADOS) {
      expect(resolveAsset(symbol).pipSize).toBeNull();
    }
  });

  it('US30/NAS100/SP500 no son de seis letras; XAUUSD empieza por XAU', () => {
    expect(/^[A-Z]{6}$/.test('US30')).toBe(false);
    expect(/^[A-Z]{6}$/.test('NAS100')).toBe(false);
    expect(/^[A-Z]{6}$/.test('SP500')).toBe(false);
    expect('XAUUSD'.startsWith('XAU')).toBe(true);
  });
});

describe('resolveAsset — símbolo fuera del registro cae a la heurística', () => {
  it('source es "heuristic" y los campos solo-MT5 son null', () => {
    const spec = resolveAsset('EURUSD');
    expect(spec.source).toBe('heuristic');
    expect(spec.tickSize).toBeNull();
    expect(spec.volumeStep).toBeNull();
    expect(spec.volumeMin).toBeNull();
    expect(spec.digits).toBeNull();
    expect(spec.currency).toBeNull();
  });

  it('reproduce pipSizeFor/contractSizeFor EXACTAMENTE, orden de evaluación incluido', () => {
    // Equivalencia contra el propio position-sizing.ts (Tarea A-1): si algún
    // día las heurísticas divergen, esta prueba es el tripwire que lo detecta
    // — resolveAsset() NO importa position-sizing.ts en tiempo de ejecución
    // (evita el ciclo que crearía la Tarea C-1), así que ambas copias deben
    // mantenerse iguales a mano.
    for (const symbol of ['EURUSD', 'GBPJPY', 'USDJPY', 'BTCUSD', 'XAGUSD', 'ABC']) {
      const spec = resolveAsset(symbol);
      expect(spec.contractSize).toBe(contractSizeFor(symbol));
      expect(spec.pipSize).toBe(pipSizeFor(symbol));
    }
  });

  it('BTCUSD reproduce el bug conocido de contractSizeFor (100000) — la corrección es la Tarea C-1, no esta', () => {
    // contractSizeFor('BTCUSD') coincide con /^[A-Z]{6}$/ y devuelve 100000
    // (RFC-020 §2.1). BTCUSD no está en HARVEST_SYMBOLS, así que incluso tras
    // el cutover de C-1 seguiría cayendo a esta heurística sin corregirse —
    // esta prueba documenta el estado actual, no lo aprueba.
    expect(resolveAsset('BTCUSD').contractSize).toBe(100000);
  });

  it('pares con JPY: pip 0.01, no 0.0001', () => {
    expect(resolveAsset('USDJPY').pipSize).toBe(0.01);
    expect(resolveAsset('EURJPY').pipSize).toBe(0.01);
  });

  it('XAGUSD: heurística de metal, pipSize null, contractSize 5000', () => {
    const spec = resolveAsset('XAGUSD');
    expect(spec.pipSize).toBeNull();
    expect(spec.contractSize).toBe(5000);
    expect(spec.source).toBe('heuristic');
  });
});

describe('resolveAsset — siempre declara source, nunca lo omite', () => {
  it('source es un string no vacío para curados, heurísticos y cualquier entrada', () => {
    for (const symbol of [...CURADOS, 'EURUSD', 'CUALQUIERA']) {
      const source = resolveAsset(symbol).source;
      expect(typeof source).toBe('string');
      expect(source.length).toBeGreaterThan(0);
    }
  });
});
