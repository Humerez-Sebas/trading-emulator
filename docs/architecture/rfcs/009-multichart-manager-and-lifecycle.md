# RFC 009: MultiChart Manager & Lifecycle

## Objetivo
Habilitar la creacion y cierre dinamico de paneles en caliente sobre el host establecido en
RFC-008, con keep-alive de instancias de `ChartEngine` fuera de vista y update-gating para
evitar trabajo de render desperdiciado en paneles no visibles. Introducir `PanelRegistry` y
`ChartRegistry` como los puntos unicos de verdad para "que paneles existen" y "que instancias
de engine estan vivas", respectivamente.

## Motivacion
RFC-008 fija un host de paneles funcional pero con un conjunto de paneles estatico. El uso
real del sistema multi-chart requiere abrir y cerrar paneles en caliente (nuevo simbolo,
nuevo timeframe, cerrar un panel de contexto que ya no se necesita) sin degradar el
rendimiento ni filtrar recursos. El motor `ChartEngine` ya fue auditado en el bloque
RFC-001..007 con garantias de seguridad en `destroy()` y en la coexistencia de multiples
instancias (mitigacion P1 A-3); RFC-009 se apoya integramente en esas garantias en lugar de
reabrir el nucleo del engine. El riesgo especifico de este RFC es la fuga de instancias de
`ChartEngine` cuando un panel se oculta (cambia de pestaña, cambia de celda activa dentro de
un tab-group) en vez de cerrarse explicitamente: el Documento de Vision exige keep-alive
(no destruir al ocultar) pero con gating de actualizaciones (no gastar CPU/render en paneles
no visibles), lo cual introduce una superficie de bugs de ciclo de vida que debe cubrirse con
tests explicitos.

## Decision Arquitectonica
1. **`PanelRegistry` (entity map de `PanelDescriptor`).**
   - Mapa de entidades (siguiendo el patron `EntityAdapter` de NgRx, consistente con el resto
     del state management del proyecto) indexado por `PanelDescriptor.id`.
   - Expone las operaciones de dominio: `createPanel(symbol, timeframe, linkGroupId)`,
     `closePanel(id)`, `movePanel(id, targetCellId)`. Estas operaciones actualizan tanto el
     registro de paneles como el `Layout` de RFC-008 (una celda no puede referenciar un
     `panelId` que no exista en `PanelRegistry`, y viceversa: invariante validado por tests).
   - `PanelRegistry` es el unico punto de verdad de "que paneles existen en la Sesion";
     `WorkspaceLayout` (RFC-008) solo referencia ids de panel, nunca duplica sus datos.

2. **`ChartRegistry` (instancias de engine).**
   - Mapa separado, indexado tambien por `panelId`, que mantiene la instancia viva de
     `ChartEngine`/`ChartComponent` asociada a cada panel.
   - Separar `PanelRegistry` (datos de dominio) de `ChartRegistry` (instancias runtime, no
     serializables) evita que el estado NgRx persistible contenga referencias a objetos de
     engine; solo `ChartRegistry` conoce instancias concretas, y vive fuera del store (servicio
     Angular singleton a nivel de Sesion, analogo en espiritu a como `ChartModelMapper` ya se
     resuelve por instancia).

3. **Keep-alive con update-gating via `PanelRuntime.visible` (D6).**
   - Al ocultar un panel (cambio de pestaña activa, cambio de `activePanelId` en su
     `GridCell`), la instancia de `ChartEngine` en `ChartRegistry` **no se destruye**: se
     marca `PanelRuntime.visible = false`. `ChartRegistry` solo destruye una instancia cuando
     `PanelRegistry.closePanel(id)` se invoca explicitamente (cierre real del panel).
   - `PanelRuntime` es estado runtime NgRx explicitamente NO persistido (vive en
     `SessionPayloadV2` unicamente en la medida en que `layout` referencia que panel esta
     activo por celda; `visible` en si es derivado, no guardado).
   - El gating de actualizaciones consume `PanelRuntime.visible`: cuando es `false`, el
     `ChartModelMapper` local del panel (RFC-008) sigue recibiendo emisiones de sus fuentes
     NgRx pero el `ChartPanelComponent` suprime la propagacion hacia `ChartEngine.update()`
     (no se llama `setData`/`update` sobre un engine oculto). Esto preserva el estado interno
     del engine (zoom, crosshair, cache de series ya cargadas) para una reaparicion instantanea
     sin recalculo, cumpliendo el objetivo de "keep-alive" sin gastar ciclos de render en un
     canvas no visible.
   - Al volver a `visible = true`, el panel debe re-sincronizarse con el estado actual antes de
     reanudar updates incrementales (aplicar el ultimo `RenderModel` calculado, no un delta
     acumulado que pudo perderse mientras estaba oculto).

4. **Lifecycle tests con la disciplina de la tarea P1 A-3.**
   - RFC-009 exige la misma rigurosidad de tests de ciclo de vida que se aplico a la auditoria
     P1 sobre `destroy()`/multi-instancia: tests que abran N paneles, cierren un subconjunto en
     orden arbitrario, oculten/muestren paneles repetidamente, y verifiquen (a) que
     `ChartRegistry` no retiene referencias a engines destruidos, (b) que ningun engine oculto
     recibe llamadas de update mientras `visible = false`, y (c) que no hay crecimiento de
     listeners/suscripciones no liberadas tras ciclos repetidos de crear/ocultar/mostrar/cerrar
     (deteccion de leaks via conteo de suscripciones activas en el test harness).
   - Estos tests se ubican junto a `ChartRegistry`/`PanelRegistry` y se ejecutan como parte de
     la suite estandar del proyecto, no como suite separada.

5. **Alcance explicitamente fuera de RFC-009:** logica de sincronizacion entre paneles
   enlazados (RFC-010, aunque `PanelDescriptor.linkGroupId` ya existe desde RFC-008 y
   `PanelRegistry` simplemente lo transporta); persistencia de `PanelRegistry`/layout en
   `SessionPayloadV2` (RFC-011, aunque el invariante panel-existe-en-registro-y-en-layout debe
   sostenerse para que la futura serializacion sea consistente); virtualizacion real basada en
   viewport fisico y lazy-creation en el primer `show` (RFC-012 construye sobre el gating de
   `visible` introducido aqui, pero la creacion lazy en si —no crear el engine hasta el primer
   render visible— es responsabilidad de RFC-012).

## Impacto
- **Positivo:** Habilita el flujo real de uso multi-panel (abrir/cerrar en caliente) sin
  reabrir el `ChartEngine` auditado; el costo de ocultar/mostrar un panel se reduce a togglear
  un flag en vez de destruir/recrear estado costoso.
- **Riesgo:** Fuga de instancias de engine si `closePanel` no se invoca en todos los caminos de
  cierre (p. ej. cerrar una pestaña entera debe cerrar todos sus paneles, no solo removerlos
  del layout). Mitigacion: `PanelRegistry.closePanel` es el unico camino de destruccion y debe
  invocarse desde cualquier operacion de mas alto nivel que remueva paneles (cierre de pestaña,
  cambio de `GridTemplate` que reduce celdas disponibles), verificado por los lifecycle tests.
- **Rendimiento:** El update-gating evita el costo de render de paneles no visibles sin
  penalizar la latencia de reaparicion, ya que el engine subyacente nunca se destruye.

## Estado Esperado
Al finalizar, el emulador compilara con `npx tsc -p tsconfig.app.json --noEmit` sin errores;
sera posible crear y cerrar paneles en caliente desde `PanelRegistry` con el `Layout` de
RFC-008 manteniendose consistente (ningun `panelId` huerfano en ninguna direccion); los tests
de ciclo de vida (crear N, ocultar/mostrar en orden arbitrario, cerrar en orden arbitrario)
pasaran en verde y demostraran explicitamente, via aserciones sobre `ChartRegistry`, que
ningun engine oculto recibe llamadas de update y que ningun engine cerrado permanece
referenciado tras su `closePanel`.
