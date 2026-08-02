/**
 * Cálculo de riesgo puro y parametrizado (CFD/Forex). No importa nada de
 * `state/`: por la Dependency Rule las dependencias apuntan hacia el
 * dominio, nunca al revés. `contractSize` siempre llega como parámetro —
 * quien conoce `contractSizeFor` es la página que compone estas funciones.
 *
 * Fuera de alcance (v1): modo Futuros — bloqueado hasta disponer de los
 * multiplicadores y tamaños de tick del bróker del propietario.
 */

/**
 * Tamaño de pip. Evaluado EN ESTE ORDEN, el mismo que usa `contractSizeFor`
 * (`state/trading/trading.models.ts`): el orden es el contrato, no un
 * detalle de implementación.
 *
 *  1) metales (`XAU*`, `XAG*`) -> null   (se miden en puntos, aunque son de
 *     6 letras — una regla ingenua "6 letras ⇒ forex" les daría pips
 *     inexistentes)
 *  2) 6 letras con JPY          -> 0.01  (aplicar 0.0001 aquí inflaría la
 *     distancia en pips ×100)
 *  3) resto de 6 letras         -> 0.0001
 *  4) cualquier otro símbolo    -> null  (índices y CFDs: puntos, no pips)
 */
export function pipSizeFor(symbol: string): number | null {
  const s = symbol.toUpperCase();
  if (s.startsWith('XAU') || s.startsWith('XAG')) return null;
  if (/^[A-Z]{6}$/.test(s)) return s.includes('JPY') ? 0.01 : 0.0001;
  return null;
}

/** Distancia entrada↔SL en unidades de precio. Siempre >= 0. */
export function priceDistance(entry: number, sl: number): number {
  return Math.abs(entry - sl);
}

/** Riesgo en divisa de cuenta para un porcentaje dado. */
export function riskUsdFor(balance: number, riskPct: number): number {
  return (balance * riskPct) / 100;
}

/** Inverso de lotsForRisk: riesgo real en divisa al operar `lots`. */
export function riskForLots(lots: number, entry: number, sl: number, contractSize: number): number {
  return priceDistance(entry, sl) * lots * contractSize;
}
