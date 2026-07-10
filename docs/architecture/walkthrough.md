# Walkthrough: Corrección del Motor de Simulación (Stops Fantasmas)

Hemos implementado la solución para el bug crítico de ejecución intrabar en el motor de simulación, el cual provocaba activaciones erróneas de Stop Loss en órdenes recién ejecutadas.

## Cambios Realizados

### 1. Modificación de la lógica del motor
#### [MODIFY] [fill-engine.ts](file:///c:/Users/78701/Desktop/trading-emulator/emulador/src/app/state/trading/fill-engine.ts)
Reescribimos la función `resolveExit` para evitar que las comprobaciones de Stop Loss (SL) y Take Profit (TP) en la vela padre consoliden incorrectamente la acción del precio que ocurrió **antes** de que se ejecutara (fill) la orden pendiente.
* **Antes:** Si el precio tocaba el SL de la orden en algún sub-candle anterior al del llenado de la orden (p. ej., sub-candle 10 cuando la orden se llena en el sub-candle 30), el motor detectaba que la vela padre completa tocó el SL (`sl = true`). Si el TP no se tocaba en ningún momento del intervalo, la función retornaba de forma inmediata una salida por Stop Loss sin evaluar la secuencia temporal de las sub-velas.
* **Después:** Si existen sub-velas (`subCandles`) cargadas, el motor **siempre** recorre secuencialmente la serie de sub-velas desde el índice de llenado (`fromSubIdx`) en adelante. La envolvente del parent-candle solo se usa como fast-path cuando no se tocan ni el SL ni el TP, o como fallback cuando no hay datos de sub-velas disponibles.

### 2. Adición de pruebas de regresión
#### [MODIFY] [fill-engine.spec.ts](file:///c:/Users/78701/Desktop/trading-emulator/emulador/src/app/state/trading/fill-engine.spec.ts)
Añadimos una nueva prueba unitaria titulada `"a freshly filled order ignores SL hit before the fill index"` que simula exactamente el escenario del bug:
* Se coloca una orden de tipo *Sell Stop* a un precio de `4000`, con SL en `4010` y TP en `3980`.
* En la sub-vela 0, el precio sube a `4012` (tocando la zona de SL de la futura posición), pero la orden no se llena porque el precio mínimo queda por encima de `4000`.
* En la sub-vela 1, el precio baja a `3995` (llenando la orden Sell Stop a `4000`).
* La prueba verifica que la posición permanezca **abierta** al terminar de procesar la vela padre y no se detenga incorrectamente en Stop Loss.

---

## Verificación y Calidad

Ejecutamos la suite completa de pruebas unitarias de la aplicación Angular (`emulador`) usando Vitest:
* **Prueba específica del motor:**
  ```bash
  npx vitest run src/app/state/trading/fill-engine.spec.ts
  ```
  *Resultado:* **21 de 21 pruebas aprobadas** (incluyendo el nuevo caso de regresión).
* **Suite completa del proyecto:**
  ```bash
  npm run test -- --watch=false
  ```
  *Resultado:* **993 de 993 pruebas aprobadas** con cero regresiones.

El motor de simulación es ahora matemáticamente riguroso e impide falsas activaciones intrabar de stops, lo que restablece la confianza del trader al practicar en barras grandes utilizando datos detallados en segundo plano.
