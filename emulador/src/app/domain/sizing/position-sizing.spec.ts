import { describe, expect, it } from 'vitest';
import {
  contractSizeFor,
  lotsForRisk,
  lotsForRiskDistance,
  pipSizeFor,
  priceDistance,
  riskForLots,
  riskUsdFor,
} from './position-sizing';
import { resolveAsset } from './asset-registry';

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

describe('lotsForRiskDistance — primitivo (D.20.1)', () => {
  it('reproduce riskUsd / (distanceInPrice * contractSize), redondeado al paso de 0.01', () => {
    // riskUsd=100, distancia=10, contractSize=100 -> lossPerLot=1000 -> 0.1 lotes
    expect(lotsForRiskDistance(100, 10, 100)).toBe(0.1);
  });
  it('aplica el piso de 0.01 lote cuando el resultado redondeado cae por debajo', () => {
    // Mismo caso que "enforces minimum 0.01 floor" en trading.models.spec.ts:
    // lotsForRisk(10000, 1, 4000, 1, 100) -> riskUsd=100, distancia=3999.
    expect(lotsForRiskDistance(100, 3999, 100)).toBe(0.01);
  });
  it('retorna 0 cuando distanceInPrice no es positivo', () => {
    expect(lotsForRiskDistance(100, 0, 100)).toBe(0);
  });
  it('retorna 0 cuando riskUsd no es positivo', () => {
    expect(lotsForRiskDistance(0, 10, 100)).toBe(0);
    expect(lotsForRiskDistance(-50, 10, 100)).toBe(0);
  });
});

describe('lotsForRisk — guardas propias, no delegadas al primitivo (D.20.1)', () => {
  it('balance negativo + riskPct negativo: riskUsd resulta positivo, pero el resultado sigue siendo 0', () => {
    // Premisa del caso: el producto de dos negativos es positivo.
    expect(riskUsdFor(-10000, -1)).toBe(100);
    // Si lotsForRisk delegara en un chequeo `riskUsd > 0` sobre el primitivo,
    // este caso devolvería una cifra de lotes real — un bug de dinero. Las
    // guardas propias de lotsForRisk (`balance > 0`, `riskPct > 0`) lo evitan.
    expect(lotsForRisk(-10000, -1, 4000, 3990, 100)).toBe(0);
  });
});

describe('lotsForRisk ≡ lotsForRiskDistance para entradas positivas (D.20.1)', () => {
  it('coincide en el caso de aceptación', () => {
    const balance = 10000;
    const riskPct = 1;
    const entry = 4000;
    const sl = 3990;
    const contractSize = 100;
    expect(lotsForRisk(balance, riskPct, entry, sl, contractSize)).toBe(
      lotsForRiskDistance(riskUsdFor(balance, riskPct), Math.abs(entry - sl), contractSize),
    );
  });
  it('coincide en el caso de piso de 0.01', () => {
    const balance = 10000;
    const riskPct = 1;
    const entry = 4000;
    const sl = 1;
    const contractSize = 100;
    expect(lotsForRisk(balance, riskPct, entry, sl, contractSize)).toBe(
      lotsForRiskDistance(riskUsdFor(balance, riskPct), Math.abs(entry - sl), contractSize),
    );
  });
});

/**
 * Literal-value pins (RFC-020 Task C-1, §4): expected values are written as
 * literals, never derived by calling the code under test. These encode
 * TODAY's behaviour BEFORE the registry cutover, and must still be green
 * AFTER it — the cutover has zero measured deltas (RFC-020 ledger §8.4.1,
 * §10.5.3; Wave 1 audit confirmed on all four sub-claims). If any of these
 * ever goes red, that is either a real delta (stop and report) or a mistake
 * in the cutover — not an invitation to edit the expected literal.
 *
 * Two coverage gaps this table closes (Wave 1 audit findings):
 *  - SP500 is pinned by no other spec in the repo (row 1).
 *  - `asset-registry.spec.ts`'s equivalence test
 *    (`resolveAsset(s).contractSize === contractSizeFor(s)`) goes tautological
 *    the instant `contractSizeFor` becomes a thin wrapper over `resolveAsset`
 *    — it would compare a function to itself and could no longer catch
 *    heuristic drift. These literal pins take over that anti-drift role for
 *    `position-sizing.ts`'s public surface.
 */
describe('contractSizeFor/pipSizeFor — pines de valor literal (RFC-020 Task C-1, §4)', () => {
  it('SP500 -> contractSize 1, pipSize null (pinned nowhere else)', () => {
    expect(contractSizeFor('SP500')).toBe(1);
    expect(pipSizeFor('SP500')).toBeNull();
  });

  it('XAUEUR -> contractSize 100, pipSize null (rama XAU* de la heurística, fuera del registro generado)', () => {
    expect(contractSizeFor('XAUEUR')).toBe(100);
    expect(pipSizeFor('XAUEUR')).toBeNull();
  });

  it('XAGUSD -> contractSize 5000, pipSize null (metal antes del regex de 6 letras)', () => {
    expect(contractSizeFor('XAGUSD')).toBe(5000);
    expect(pipSizeFor('XAGUSD')).toBeNull();
  });

  it('EURUSD -> contractSize 100000, pipSize 0.0001 (forex de 6 letras)', () => {
    expect(contractSizeFor('EURUSD')).toBe(100000);
    expect(pipSizeFor('EURUSD')).toBe(0.0001);
  });

  it('GBPJPY -> contractSize 100000, pipSize 0.01 (pip JPY)', () => {
    expect(contractSizeFor('GBPJPY')).toBe(100000);
    expect(pipSizeFor('GBPJPY')).toBe(0.01);
  });

  it('ABC -> contractSize 1, pipSize null (fallback)', () => {
    expect(contractSizeFor('ABC')).toBe(1);
    expect(pipSizeFor('ABC')).toBeNull();
  });

  it('BTCUSD -> contractSize 100000, pipSize 0.0001 (defecto conocido, no corregido por esta tarea — RFC-020 §2.1)', () => {
    // Documenta el estado actual, no lo aprueba: BTCUSD coincide con
    // /^[A-Z]{6}$/ y no está en HARVEST_SYMBOLS, así que sigue cayendo a la
    // heurística sin corregirse tras el cutover de C-1 (por diseño).
    expect(contractSizeFor('BTCUSD')).toBe(100000);
    expect(pipSizeFor('BTCUSD')).toBe(0.0001);
  });

  it('los cuatro símbolos curados leen genuinamente el registro tras el cutover (source MT5, no heurística)', () => {
    // Prueba que contractSizeFor/pipSizeFor están respaldados por
    // resolveAsset() y no solo coinciden por casualidad con la heurística:
    // el `source` de los cuatro curados debe ser la cabecera de procedencia
    // MT5, nunca 'heuristic'.
    for (const symbol of ['US30', 'NAS100', 'SP500', 'XAUUSD']) {
      const spec = resolveAsset(symbol);
      expect(spec.source).not.toBe('heuristic');
      expect(contractSizeFor(symbol)).toBe(spec.contractSize);
    }
  });
});
