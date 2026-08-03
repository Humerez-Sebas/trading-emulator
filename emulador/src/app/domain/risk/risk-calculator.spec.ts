import { describe, expect, it } from 'vitest';
import { pipSizeFor, priceDistance, riskForLots, riskUsdFor } from './risk-calculator';

describe('pipSizeFor — orden de evaluación', () => {
  it('los metales van primero: son de 6 letras pero se miden en puntos', () => {
    expect(pipSizeFor('XAUUSD')).toBeNull();
    expect(pipSizeFor('XAGUSD')).toBeNull();
  });
  it('pares con JPY usan pip 0.01, no 0.0001', () => {
    expect(pipSizeFor('USDJPY')).toBe(0.01);
    expect(pipSizeFor('EURJPY')).toBe(0.01);
  });
  it('resto de pares de 6 letras: 0.0001', () => {
    expect(pipSizeFor('EURUSD')).toBe(0.0001);
    expect(pipSizeFor('gbpusd')).toBe(0.0001); // insensible a mayúsculas, como contractSizeFor
  });
  it('índices y CFDs: null (puntos)', () => {
    expect(pipSizeFor('US30')).toBeNull();
    expect(pipSizeFor('NAS100')).toBeNull();
  });
});

describe('priceDistance', () => {
  it('es simétrica y siempre no negativa', () => {
    expect(priceDistance(40000, 39950)).toBe(50);
    expect(priceDistance(39950, 40000)).toBe(50);
    expect(priceDistance(40000, 40000)).toBe(0);
  });
});

describe('riskUsdFor', () => {
  it('reproduce (balance * riskPct) / 100', () => {
    expect(riskUsdFor(5000, 1)).toBe(50);
    expect(riskUsdFor(100, 0.1)).toBeCloseTo(0.1, 10);
  });
});

describe('riskForLots — inverso de lotsForRisk', () => {
  it('cierra el ciclo en el caso de aceptación', () => {
    expect(riskForLots(1, 40000, 39950, 1)).toBe(50);
  });
  it('escala con el contractSize', () => {
    expect(riskForLots(1, 2000, 1990, 100)).toBe(1000); // XAUUSD: 10 * 1 * 100
  });
});
