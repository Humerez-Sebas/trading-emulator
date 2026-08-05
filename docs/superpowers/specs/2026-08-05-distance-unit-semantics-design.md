# Diseno de unidades de distancia para lotaje

**Estado:** D.20.5 revocada por el propietario el 2026-08-05; D.20.6 es la autoridad vigente.

## Contexto

F21-2 encontro que el modo Distancia trataba todos los simbolos sin `pipSize`
como si una unidad escrita equivaliera a `1.00` de precio. Esto conserva la
convencion operativa de los indices, pero es 100x incorrecto para XAUUSD: el
terminal MT5 cotiza el oro con `point = 0.01` y el trader escribe puntos MT5.

Las capturas del propietario fijan las dos convenciones que el producto debe
respetar:

- En US30, un stop de 66 puntos indice se escribe como `66` y representa
  `66.00` unidades de precio.
- En XAUUSD, un stop de 10 puntos MT5 se escribe como `10` y representa
  `0.10` unidades de precio.

## Decision D.20.6: los puntos no-FX son unidades de precio

D.20.6 revoca la regla de D.20.5 que trataba los puntos XAU/XAG escritos
como puntos tecnicos de MT5. `pointSize` sigue siendo un dato crudo del
registro MT5 y se muestra en la Ficha, pero no convierte el campo Distancia.

El campo Distancia sigue sin selector manual. La unidad se deriva del
instrumento y se convierte una sola vez antes de entrar en el kernel de
sizing:

| Instrumento | Sufijo | Unidades de precio por unidad escrita |
| --- | --- | --- |
| Forex (`pipSize` no nulo) | `pips` | `pipSize` |
| XAU/XAG, indice y demas no-FX | `pts` | `1` |

Ejemplos vinculantes:

| Simbolo | Entrada | Distancia que recibe el kernel |
| --- | --- | --- |
| US30 | `66 pts` | `66.00` |
| XAUUSD | `5 pts` | `5.00` |
| XAUUSD | `10 pts` | `10.00` |
| XAUUSD | `20 pts` | `20.00` |

Con XAUUSD, cuenta de `$10,000` y riesgo de `1%`, los casos vinculantes
son `5 pts -> 0.20` lotes, `10 pts -> 0.10` lotes y `20 pts -> 0.05`
lotes; los tres arriesgan `$100.00`.

La palabra `pips` que un trader pueda usar coloquialmente para un indice no
cambia el sufijo del producto: la interfaz usa `pts` para toda unidad no-FX.
Asi no confunde el punto indice de 1.00 con el punto tecnico de MT5 de 0.01.

## Fuente de datos y limite de responsabilidad

`pointSize` es un campo crudo de MT5. El pipeline lo extrae directamente de
`symbol_info().point`, lo guarda en el registro generado y la Ficha lo muestra
desde ese registro. No se deduce de `digits` y no se asume que coincide con
`tickSize`, aunque hoy ambos sean `0.01` para US30 y XAUUSD.

Un simbolo heuristico no tiene datos MT5 verificables. Si carece de
`pointSize`, la Ficha muestra su marca de procedencia heuristica; la unidad
operativa no-FX sigue siendo `1` y esta decision no inventa un punto tecnico
ni agrega copy o estados de error fuera del alcance aprobado.

## Arquitectura

El kernel `position-sizing.ts` permanece cerrado: recibe siempre una distancia
en unidades de precio. La adaptacion entre lo que escribe el trader y esas
unidades vive una sola vez en `sizing-view-model.ts`, como una funcion pura que
recibe el `AssetSpec` resuelto. La misma funcion debe alimentar:

- el calculo de lote;
- `actualRiskUsd` y su advertencia;
- conversion Distancia -> precios;
- conversion precios -> Distancia.

No se agrega un segundo algoritmo de sizing, dependencias, selector de unidad
ni una clasificacion nueva de activos. El prefijo XAU/XAG reutiliza la misma
convencion de metal que ya usa el fallback de `asset-registry.ts`.

## Alcance

| Ruta | Cambio |
| --- | --- |
| `pipeline/export_symbols.py` | Extraer y emitir `pointSize`. |
| `pipeline/tests/test_export_symbols.py` | Probar la extraccion y el render determinista. |
| `emulador/src/app/domain/sizing/asset-registry.generated.ts` | Regenerar desde MT5, nunca editar a mano. |
| `emulador/src/app/domain/sizing/asset-registry.ts` | Exponer `pointSize` en `AssetSpec`. |
| `emulador/src/app/domain/sizing/asset-registry.spec.ts` | Fijar el campo generado y los fallbacks. |
| `emulador/src/app/lotaje/sizing-view-model.ts` | Aplicar D.20.6 en ambos sentidos. |
| `emulador/src/app/lotaje/sizing-view-model.spec.ts` | Probar unidad, distancia, lote y riesgo juntos. |
| `emulador/src/app/lotaje/lotaje-view.ts` | Mostrar el punto exportado en la Ficha. |
| `emulador/src/app/lotaje/lotaje-view.spec.ts` | Probar que la Ficha usa el registro. |
| `emulador/src/app/pages/calculadora/calculadora-page.component.spec.ts` | Actualizar solo los pines XAUUSD contradichos por esta decision. |
| `.superpowers/rfc-020/dev-log.md` | Registrar D.20.5 revocada, D.20.6, la excepcion de rama y evidencia. |

## Especificaciones preexistentes y excepcion de rama

La autoridad del propietario permite cambiar exclusivamente los pines
preexistentes que afirmen que XAUUSD en modo Distancia usa puntos MT5
convertidos. Cada eliminacion debe tener un sucesor nombrado que pruebe la
nueva semantica completa. El caso de aceptacion US30 permanece sin cambios.

El brief F21-2 recomendaba una rama nueva despues del merge de RFC-020. El
propietario revoco esa recomendacion: el fix se integra en
`claude/lotaje-v2-core`, que ya tiene un PR hacia `main`. Esta desviacion es
`requires-attention`: la auditoria PASS de `d2838fd` no cubre los commits del
fix, por lo que se requiere una nueva auditoria de rama antes del merge.

## Definition of done

- El registro generado contiene el `pointSize` leido de MT5 para todos los
  simbolos cosechados.
- US30 y XAUUSD conservan `1.00` unidad de precio por `pt` escrito; FX usa pips.
- Lote, riesgo real y conversion entre metodos usan la misma distancia.
- La Ficha muestra el valor exportado.
- Los gates Angular, build y pipeline tienen salida fresca en verde.
- La evidencia y la desviacion estan registradas y un auditor independiente
  vuelve a evaluar la rama completa antes de aprobar el PR.
