# RFC 008: Panel System & Layout Foundation

## Objetivo
Renderizar N instancias de grafico (`ChartPanel`) dentro de una unica Sesion, organizadas
en un host de pestañas (tabs) mas grid de un solo nivel, sin reintroducir el acoplamiento
"single-active-chart" que caracteriza al `ChartComponent` mono-core actual. Establecer el
esqueleto del `ChartSyncBus` (hub de eventos multiplexado, sin logica de sincronizacion
todavia) que RFC-010 completara.

## Motivacion
El modulo de graficos (RFC-001..007) fue auditado, optimizado y liberado de deuda tecnica
sobre la base de un unico `ChartComponent` activo por Sesion. El bloque RFC-008..012
evoluciona ese nucleo visual mono-core hacia una arquitectura multi-core visual: multiples
paneles coexistiendo simultaneamente. RFC-008 es la base de esa evolucion — el resto de
RFCs del bloque (009 ciclo de vida, 010 sync, 011 persistencia, 012 rendimiento) dependen
de que el host de paneles exista y de que cada panel derive su vista de forma aislada desde
el dia uno. Introducir el host sin resolver correctamente la reactividad por panel
obligaria a una reescritura posterior; por eso este RFC fija la disciplina de derivacion de
datos (D8) junto con el layout, en vez de tratarla como una optimizacion futura.

## Decision Arquitectonica
1. **`ChartPanelComponent` envuelve el `ChartComponent` auditado.**
   - No se reimplementa el motor de render. `ChartPanelComponent` es un wrapper delgado que
     instancia un `ChartComponent` (o su equivalente basado en `ChartEngine`) por panel,
     le inyecta un `PanelDescriptor` (`id`, `symbol`, `timeframe`, `linkGroupId`) y expone
     los eventos de interaccion (crosshair, cambio de rango visible) hacia el `ChartSyncBus`.
   - Cada `ChartPanelComponent` es responsable de un unico `PanelDescriptor.id`; no existe
     estado compartido implicito entre instancias.

2. **`WorkspaceViewport`: barra de pestañas + host de grid de un solo nivel.**
   - `WorkspaceViewport` renderiza `WorkspaceLayout.tabs`, resalta `activeTabId`, y dentro de
     la pestaña activa proyecta `TabLayout.cells` segun `TabLayout.template`.
   - `GridTemplate` es un enumerado cerrado y acotado: `'1' | '2h' | '2v' | '3' | '2x2' |
     '1+2' | '1+3'`. No hay arbol binario BSP ni anidamiento recursivo de splits (non-goal
     explicito del Documento de Vision); la topologia tiene profundidad maxima 1.
   - Cada `GridCell` es en si misma un tab-group (`panelIds: string[]`, `activePanelId`):
     dentro de una celda pueden coexistir varios paneles apilados, de los cuales solo uno es
     visible a la vez. Esto habilita "pestañas dentro de una celda de grid" sin necesidad de
     un segundo nivel de particionado espacial.
   - `MAX_PANELS_PER_TAB = 8` (R1) es un tope duro derivado de rendimiento, verificado por
     RFC-012 mediante perfilado; `WorkspaceViewport` debe rechazar (o desactivar en UI) la
     creacion de un noveno panel dentro de una misma pestaña.

3. **Modelo/reducer de `Layout` (feature NgRx `layout`).**
   - Estado runtime: `WorkspaceLayout { tabs: TabLayout[]; activeTabId: string }`, proyectado
     desde/hacia `SessionPayloadV2.layout` (persistencia formalizada en RFC-011; en RFC-008
     el reducer existe y es funcional en memoria, sin requerir aun el ciclo de sync completo).
   - Acciones minimas del reducer: crear/cerrar pestaña, cambiar `activeTabId`, aplicar
     `GridTemplate` a una pestaña, agregar/quitar panel de una `GridCell`, cambiar
     `activePanelId` de una celda. El reducer no conoce `linkGroupId` mas alla de
     transportarlo dentro de `PanelDescriptor`; la logica de sincronizacion es responsabilidad
     de RFC-010.

4. **Esqueleto de `ChartSyncBus`.**
   - Se introduce como hub de eventos multiplexado (uno por Sesion, no por panel), con la
     forma de API que usaran RFC-009 y RFC-010, pero SIN logica de sincronizacion de
     crosshair/rango/replay en este RFC. RFC-008 solo garantiza que los eventos de cada panel
     (crosshair move, range change) se emiten hacia el bus etiquetados con `panelId`, y que el
     bus los expone como observable multiplexado. Nadie escucha ese observable todavia salvo
     por tests de humo del propio bus.

5. **`ChartModelMapper` local por panel + `combineLatest` (D8) desde el dia uno.**
   - Cada panel obtiene su propia instancia de `ChartModelMapper` (proveedor a nivel de
     `ChartPanelComponent`, replicando el patron ya auditado y aislado en RFC-007), parametrizada
     por `{ symbol, timeframe, linkGroupId }` del `PanelDescriptor` correspondiente.
   - La composicion de slices crudos de NgRx hacia el `RenderModel` de cada panel se realiza
     con `combineLatest` sobre selectores parametrizados por los datos del propio panel, con
     memoizacion **por instancia** (una ranura de memo por `ChartModelMapper`, es decir, por
     panel).
   - **Se prohiben los factory selectors NgRx compartidos** de la forma
     `selectChartView(panelId)` invocados desde un unico punto compartido. La razon es el
     riesgo de "single-slot thrash": un factory selector memoizado con una sola ranura
     (`defaultMemoize` de NgRx, o cualquier `memoizeMap` de una ranura) que recibe invocaciones
     alternantes con distinto `panelId` en cada tick de Angular invalida su cache en cada
     llamada — 0% de aciertos con N paneles activos. Este es exactamente el defecto que la
     auditoria P1 corrigio en `memoizeMap` (memoizacion zero-allocation del `chartStyle$`); el
     bloque RFC-008..012 promueve esa correccion a disciplina de toda la capa reactiva: N
     paneles => N memoizadores independientes (uno por `ChartModelMapper` local), cada uno de
     una sola ranura pero sin thrash porque cada instancia solo observa su propio panel.
   - Referencia directa a las interfaces base del Documento de Vision:
     `PanelDescriptor`, `GridCell`, `TabLayout`, `WorkspaceLayout` (ver
     `008-012-multi-chart-panel-system-vision.md`, seccion "Interfaces base").

6. **Alcance explicitamente fuera de RFC-008** (delegado a RFCs posteriores del bloque):
   creacion/cierre dinamico de paneles en caliente y `PanelRegistry`/`ChartRegistry`
   (RFC-009); logica real de sincronizacion entre paneles enlazados (RFC-010); persistencia
   del layout en `SessionPayloadV2` (RFC-011); virtualizacion/lazy-render (RFC-012). RFC-008
   trabaja con un conjunto de paneles fijo definido en memoria para validar el host y la
   reactividad por panel.

## Impacto
- **Positivo:** Establece el fundamento sobre el que se apoyan RFC-009 a RFC-012; ninguno de
  ellos requiere retocar la forma del host de paneles ni el patron de derivacion reactiva.
- **Rendimiento:** La disciplina de `ChartModelMapper` local evita desde el dia uno el
  patron de invalidacion que ya se identifico y corrigio como problema P1 en el motor
  mono-core; se previene su reaparicion a escala N-paneles antes de que exista codigo que
  dependa del antipatron.
- **Riesgo:** Reintroducir acoplamiento single-active-chart si un desarrollador futuro cae
  en la tentacion de un selector compartido "mas simple". Mitigacion: la prohibicion de
  factory selectors compartidos se documenta aqui y debe reforzarse en code review; RFC-009
  y RFC-010 heredan y validan esta misma disciplina en sus propios tests.
- **Compatibilidad:** No se modifica el `ChartComponent` ni el `ChartEngine` auditados;
  `ChartPanelComponent` es aditivo (composicion, no herencia ni reescritura).

## Estado Esperado
Al finalizar, el emulador compilara con `npx tsc -p tsconfig.app.json --noEmit` sin errores;
`WorkspaceViewport` renderizara N paneles simultaneos (N <= `MAX_PANELS_PER_TAB`) segun un
`GridTemplate` del enumerado cerrado, cada uno con su propio `ChartPanelComponent` y su propio
`ChartModelMapper` local con memoizacion aislada (verificable con un test que cambie el estado
de un panel y confirme, via spy/contador de invocaciones del mapper, que los paneles restantes
no recalculan su `RenderModel`); el reducer de `Layout` tendra cobertura de tests para
creacion/cierre de pestañas y cambios de `GridTemplate`; y no existira ningun selector NgRx
factory compartido de la forma `selectChartView(panelId)` en el codigo del feature `layout`.
