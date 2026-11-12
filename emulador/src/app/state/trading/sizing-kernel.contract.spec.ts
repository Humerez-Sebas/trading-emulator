import { describe, expect, it } from 'vitest';
import {
  GENERATED_ASSETS,
  contractSizeFor as kernelContractSizeFor,
  lotsForRisk as kernelLotsForRisk,
  lotsForRiskDistance,
  pipSizeFor,
  priceDistance,
  resolveAsset,
  riskUsdFor,
} from '@humerez-sebas/sizing-kernel';
import { contractSizeFor, lotsForRisk } from './trading.models';

/**
 * Contrato del emulador con `@humerez-sebas/sizing-kernel` (RFC-021).
 *
 * El kernel de dimensionado ya no vive en este repo: sus specs propios y sus
 * vectores dorados corren en el repo del kernel. Lo que este archivo fija es
 * lo que el EMULADOR necesita del paquete, para que un cambio de versión que
 * lo rompa falle aquí y no en una operación del replay.
 *
 * Regla STOP (PHILOSOPHY §5.7): si un test de este archivo se pone rojo tras
 * subir la versión del paquete, es un cambio real de comportamiento o de
 * datos. Se escala; no se edita el literal esperado para acomodarlo.
 *
 * ---- Las dos listas de símbolos no pueden divergir (RFC-020 C2, RFC-021 §4) ----
 * El registro debe ser el conjunto exacto de instrumentos con velas en R2. La
 * línea marcada de abajo es el eslabón entre los dos lados:
 *   - `pipeline/tests/test_harvest_registry_contract.py` exige que el valor por
 *     defecto de `HARVEST_SYMBOLS` en `fill_r2.py` / `update_r2.py` sea igual a
 *     esta línea;
 *   - el primer test de este archivo exige que esta línea sea igual a las
 *     claves de `GENERATED_ASSETS` del paquete.
 * Cambiar una lista sin la otra rompe CI. No reformatear la línea marcada.
 */
// HARVEST_SYMBOLS_CONTRACT: US30,NAS100,SP500,XAUUSD
const HARVEST_SYMBOLS_CONTRACT = 'US30,NAS100,SP500,XAUUSD';

const CURADOS = HARVEST_SYMBOLS_CONTRACT.split(',');

describe('sizing-kernel — el registro es el conjunto de instrumentos cosechados', () => {
  it('las claves de GENERATED_ASSETS son exactamente HARVEST_SYMBOLS_CONTRACT', () => {
    expect(Object.keys(GENERATED_ASSETS).sort()).toEqual([...CURADOS].sort());
  });

  it('los símbolos cosechados resuelven desde el registro MT5, nunca desde la heurística', () => {
    for (const symbol of CURADOS) {
      const spec = resolveAsset(symbol);
      expect(spec.source).not.toBe('heuristic');
      expect(spec.source).not.toBe('manual');
      expect(spec.currency).toBe('USD');
    }
  });
});

describe('sizing-kernel — trading.models es un re-export puro del paquete (RFC-020 §4.1)', () => {
  it('contractSizeFor y lotsForRisk son las mismas funciones, no copias', () => {
    expect(contractSizeFor).toBe(kernelContractSizeFor);
    expect(lotsForRisk).toBe(kernelLotsForRisk);
  });
});

describe('sizing-kernel — pines de valor literal que el replay da por hechos', () => {
  it('contractSize de los cuatro curados', () => {
    expect(contractSizeFor('US30')).toBe(1);
    expect(contractSizeFor('NAS100')).toBe(1);
    expect(contractSizeFor('SP500')).toBe(1);
    expect(contractSizeFor('XAUUSD')).toBe(100);
  });

  it('los cuatro curados se miden en puntos (pipSize null, D.20.3)', () => {
    for (const symbol of CURADOS) {
      expect(pipSizeFor(symbol)).toBeNull();
    }
  });

  it('lotsForRisk: caso de aceptación, piso de 0.01 y guardas propias', () => {
    expect(lotsForRisk(10000, 1, 4000, 3990, 100)).toBe(0.1);
    expect(lotsForRisk(10000, 1, 4000, 1, 100)).toBe(0.01);
    expect(lotsForRisk(-10000, -1, 4000, 3990, 100)).toBe(0);
    expect(lotsForRisk(5000, 1, 40000, 39950, 1)).toBe(1);
  });

  // La calculadora (`lotaje/`) usa estas tres directamente. Sus specs comparan
  // contra las funciones del propio paquete, así que solo un literal aquí
  // detecta que una versión nueva del kernel las cambie (auditoría RFC-021, L1).
  // Los valores son los del spec anterior a la extracción.
  it('lotsForRiskDistance, riskUsdFor y priceDistance: literales de la calculadora', () => {
    expect(lotsForRiskDistance(100, 10, 100)).toBe(0.1);
    expect(lotsForRiskDistance(100, 3999, 100)).toBe(0.01);
    expect(lotsForRiskDistance(100, 0, 100)).toBe(0);
    expect(lotsForRiskDistance(0, 10, 100)).toBe(0);
    expect(lotsForRiskDistance(-50, 10, 100)).toBe(0);
    expect(riskUsdFor(5000, 1)).toBe(50);
    expect(riskUsdFor(-10000, -1)).toBe(100);
    expect(priceDistance(40000, 39950)).toBe(50);
    expect(priceDistance(39950, 40000)).toBe(50);
    expect(priceDistance(40000, 40000)).toBe(0);
  });

  it('heurística fuera del registro: forex de 6 letras y metales', () => {
    expect(contractSizeFor('EURUSD')).toBe(100000);
    expect(contractSizeFor('XAGUSD')).toBe(5000);
    expect(pipSizeFor('GBPJPY')).toBe(0.01);
    expect(pipSizeFor('EURUSD')).toBe(0.0001);
  });
});
