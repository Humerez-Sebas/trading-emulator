# Architecture Vision: Multi-Chart & Panel System (RFC-008 a RFC-012)

> Documento indice y resumen ejecutivo del bloque RFC-008..012. Congelado tras la
> sesion de brainstorming del 2026-07-01. Cada RFC individual expande su seccion
> correspondiente en el formato estandar (Objetivo / Motivacion / Decision /
> Impacto / Estado Esperado).

## [RESUMEN EJECUTIVO]

El modulo de graficos (RFC-001..007) fue auditado, optimizado y liberado de deuda
tecnica (mitigaciones P1: memoizacion zero-allocation del `chartStyle$`, pureza total
del dominio, y suite de regresion sobre el short-circuit referencial). Sobre esa base
estable, el sistema evoluciona de un nucleo visual **mono-core** (un `ChartComponent`,
un simbolo, un timeframe activo, un cursor de replay) a una arquitectura **multi-core
visual**: multiples paneles de grafico coexistiendo dentro de una unica Sesion, con
topologia dinamica (pestañas + grid), sincronizacion tactica por grupos de enlace, y un
unico reloj de replay global.

El principio rector es la **reutilizacion de maquinaria auditada, no la adicion de
sistemas paralelos**. Cada decision de este bloque se apoya en un componente que ya
existe y fue validado:

- El `ChartModelMapper` local (provider por instancia, ya verificado como aislado)
  se convierte en el punto de derivacion reactiva por panel.
- El cursor de replay existente y `selectReplayIndex` (busqueda binaria at-or-before-T)
  se convierten en el reloj global con proyeccion por panel.
- La serie de velas compartida por simbolo (ya en IndexedDB) se formaliza como el
  cache compartido sin introducir uno nuevo.
- El `SessionPayloadV1` candle-free (Supabase JSONB + IndexedDB + LWW) se extiende a
  V2, reutilizando integramente el ciclo de sincronizacion existente.

El resultado es un esfuerzo de **capa de presentacion, layout y sincronizacion** por
encima del motor de trading auditado, y no una reapertura del nucleo de trading.

## [NON-GOALS] (delimitacion explicita de alcance)

Para evitar expansiones no planificadas, el bloque RFC-008..012 NO incluye:

```
- [x] Trading multi-simbolo. La Sesion opera UN unico simbolo (primarySymbol). Los
      paneles de simbolo secundario son estrictamente view-only (referencia/contexto).
- [x] Docking libre / arbol binario BSP. La topologia es pestañas + grid de un solo
      nivel (profundidad maxima 1). No hay anidamiento recursivo de splits.
- [x] Paneles flotantes / ventanas desacopladas. Descartado por contradecir el grid
      acotado. Reservado como posible RFC futuro si surge demanda real.
- [x] Web Workers / pipeline de replay off-main-thread. La suma de render auditada es
      << 16ms/frame; el overhead de postMessage no se justifica. Se optimiza solo ante
      una brecha de presupuesto medida con perfilado.
- [x] Sincronizacion de escala de precios (syncPriceScale). La interfaz `LinkGroup`
      reserva el campo, pero RFC-010 NO lo implementa.
- [x] Comparticion de dibujos entre sesiones. Los dibujos son estrictamente
      session-scoped (soberania de sesion).
```

## [DISEÑO DE ESTADO Y SOBERANIA]

### El agregado Session como raiz

La Sesion se convierte en el agregado raiz que posee el layout, los grupos de enlace,
y los dibujos por simbolo. Las velas permanecen compartidas por simbolo por debajo del
agregado (referenciadas por identidad, nunca copiadas). El aislamiento de soberania es
por Sesion: dos sesiones distintas que muestren el mismo simbolo (p. ej. SP500) tienen
layouts y dibujos completamente independientes.

```
                        +---------------------------------------------------+
                        |                     SESSION                        |
                        |           (agregado raiz, LWW-sincronizado)        |
                        |     primarySymbol: string   schemaVersion: 2       |
                        +---------------------------------------------------+
                          |           |            |            |           |
                +---------+   +-------+     +------+      +------+     +-----+------+
                |             |             |             |            |            |
          +-----v-----+ +-----v------+ +----v-------+ +---v--------+ +-v----------+
          |TradingData| |   Layout   | |  Drawings  | | LinkGroups | | ReplayClock|
          |(1 simbolo)| | tabs+grids | | por simbolo| |  (sync)    | |  cursor T  |
          +-----+-----+ +-----+------+ +-----+------+ +-----+------+ +-----+------+
                |             |              |              |              |
         positions/     PanelDescriptor  DrawingCollection crosshair/  avanza via
         orders/fills   {symbol, tf,     {version, items}  timeRange   replayResolution;
         balance        linkGroupId}      por simbolo      (+reservado  cada panel proyecta
         (solo          activePanelId    (session-scoped)   priceScale)  at-or-before-T
          primarySymbol)     |                                           (selectReplayIndex)
                             |
                     MAX_PANELS_PER_TAB = 8
                             |
                    +--------v-----------+
                    | cache de velas      |  <- serie por simbolo, por referencia.
                    | compartido (por     |     RFC-012 FORMALIZA el existente;
                    | simbolo, por ref)   |     NO introduce un cache nuevo.
                    +---------------------+
```

### Interfaces base (NgRx + persistencia)

```ts
// ---- Constantes de dominio ----
const MAX_PANELS_PER_TAB = 8;                 // (R1) tope duro derivado de rendimiento

type GridTemplate = '1' | '2h' | '2v' | '3' | '2x2' | '1+2' | '1+3';  // enumerado, acotado

// ---- Layout (persistido en SessionPayloadV2; proyectado a un feature NgRx 'layout') ----
interface PanelDescriptor {
  id: string;                       // id estable de panel (uuid)
  symbol: string;
  timeframe: Timeframe;
  linkGroupId: string | null;       // null = sin enlazar
}
interface GridCell { panelIds: string[]; activePanelId: string; }   // tab-group dentro de una celda
interface TabLayout { id: string; name: string; template: GridTemplate; cells: GridCell[]; }
interface WorkspaceLayout { tabs: TabLayout[]; activeTabId: string; }

// ---- Sincronizacion ----
interface LinkGroup {
  id: string;
  color: string;
  syncCrosshair: boolean;
  syncTimeRange: boolean;
  syncPriceScale?: boolean;         // (R3) RESERVADO; NO implementado en RFC-010
}

// ---- Dibujos (R2): coleccion extensible en lugar de array plano ----
interface DrawingCollection {
  version: number;                  // permite evolucion futura sin romper el payload
  items: Drawing[];
}

// ---- Estado runtime NgRx (NO persistido): vista por panel ----
interface PanelRuntime {
  id: string;
  visible: boolean;                                    // (D6) gating de update para keep-alive
  visibleRange: { from: number; to: number } | null;  // fan-out de sync de rango (D4)
}

// ---- Persistencia: SessionPayloadV1 -> V2 (D9) ----
interface SessionPayloadV2 {
  schemaVersion: 2;
  primarySymbol: string;                          // unico simbolo operable (D1)
  // ...todos los campos V1: trading, currentTime, activeTf, replayResolution, ranges...
  drawings: Record<string /*symbol*/, DrawingCollection>;   // (R2)(D3) antes Drawing[]
  layout: WorkspaceLayout;                        // (D2)
  linkGroups: LinkGroup[];                         // (D4)
}
```

### Reactividad por panel (evitando el thrash de memoizacion)

Cada panel deriva su vista mediante su propio `ChartModelMapper` **local** parametrizado
por `{symbol, tf, linkGroupId}`, componiendo los slices crudos con `combineLatest` y
memoizando **por instancia**. Se descarta el uso de un factory selector NgRx compartido
`selectChartView(panelId)`: su memoizacion de una sola ranura produciria 0% de aciertos
con N paneles invocandolo con distintos `panelId` por tick, recreando el defecto
single-slot que la auditoria P1 corrigio en `memoizeMap`, ahora promovido a toda la capa
reactiva. N paneles => N memoizadores independientes, cada uno de una ranura pero sin
thrash porque cada uno solo ve su propio panel.

### Persistencia y soberania

El layout, los grupos de enlace y los dibujos por simbolo viajan dentro de un unico
`SessionPayloadV2`, sincronizado atomicamente con la maquinaria LWW existente (un unico
ciclo de sync, no dos). Una migracion versionada V1 -> V2 convierte `drawings: Drawing[]`
en `Record<symbol, DrawingCollection>` y añade `layout`/`linkGroups` con defaults
(layout de un solo panel = el simbolo activo actual). El origen de verdad sigue siendo
Supabase con IndexedDB como cache.

## [DESGLOSE DE RFCs]

### RFC-008: Panel System & Layout Foundation
- **Objetivo:** Renderizar N `ChartPanel` en un host de pestañas + grid de un solo nivel;
  esqueleto de `ChartSyncBus`.
- **Componentes clave:** `ChartPanelComponent` (envuelve el `ChartComponent` auditado),
  `WorkspaceViewport` (barra de pestañas + host de grid), modelo/reducer de `Layout`,
  `ChartSyncBus` (hub de eventos multiplexado, sin logica de sync aun).
- **Riesgo y mitigacion:** Reintroducir acoplamiento single-active-chart. Mitigacion:
  `ChartModelMapper` local por panel desde el dia uno (D8); prohibidos los factory
  selectors compartidos.

### RFC-009: MultiChart Manager & Lifecycle
- **Objetivo:** Creacion/cierre dinamico de paneles; keep-alive con update-gating;
  registros de panel y de chart.
- **Componentes clave:** `PanelRegistry` (entity map), `ChartRegistry` (instancias de
  engine), gating de visibilidad (`PanelRuntime.visible`).
- **Riesgo y mitigacion:** Fuga de engine al cerrar/ocultar. Mitigacion: se apoya en la
  seguridad de `destroy()`/multi-instancia ya auditada; añadir tests de ciclo de vida con
  la misma disciplina que la tarea P1 A-3.

### RFC-010: Synchronization
- **Objetivo:** Grupos de enlace; sync de crosshair y de escala de tiempo; fan-out del
  playback unificado; navegacion enlazada.
- **Componentes clave:** reducer de `LinkGroup`, enrutado de `ChartSyncBus` acotado por
  grupo, fan-out del reloj sobre `selectReplayIndex` (D5). `syncPriceScale` queda
  reservado, no implementado (R3).
- **Riesgo y mitigacion:** Bucles de retroalimentacion de sync (panel A mueve B mueve A).
  Mitigacion: eventos de sync con origen etiquetado + aplicacion idempotente de rango;
  freeze-on-last para simbolos con gap (D5).

### RFC-011: Workspace Layout Persistence
- **Objetivo:** Persistir/restaurar pestañas, grids, paneles, dibujos por simbolo y
  grupos de enlace.
- **Componentes clave:** `SessionPayloadV2` + migracion V1 -> V2; extension de
  `workspace-db` y del mapping de `session-sync`.
- **Riesgo y mitigacion:** Perdida de datos en migracion / desync layout-dibujos.
  Mitigacion: LWW atomico de un unico payload (D9) — un solo ciclo de sync, no dos;
  migracion versionada con tests de ida y vuelta (round-trip).

### RFC-012: Performance
- **Objetivo:** Formalizar el cache de velas compartido **existente**, render virtual/lazy,
  actualizaciones incrementales, creacion lazy de charts.
- **Componentes clave:** cache de series compartido por referencia (ya es por simbolo),
  render update-gated (D6), creacion de chart en el primer show.
- **Aclaracion (R4):** Este RFC **formaliza y documenta el cache por simbolo que ya
  existe** (series compartidas en IndexedDB/memoria); NO introduce un cache nuevo. Los
  paneles referencian la serie del simbolo por identidad.
- **Riesgo y mitigacion:** Sobre-ingenieria. Mitigacion: explicitamente SIN worker (D7);
  perfilar 8 paneles y optimizar solo brechas medidas.

## [SIGUIENTES PASOS]

1. **RFC-008 es el primero a redactar a nivel de codigo.** Es el fundamento del host de
   paneles; el resto depende de el.
2. Orden de construccion estricto: 008 (host) -> 009 (ciclo de vida) -> 010 (sync) ->
   011 (persistencia) -> 012 (endurecimiento de rendimiento).
3. Cada RFC obtiene su propio Implementation Plan en `docs/superpowers/plans/` (via
   `writing-plans`) y una rama `feature/rfc-00X-...`, con PRs incrementales hacia la rama
   de integracion.
4. Prerrequisito de fase: el bloque P1 pre-RFC-008 (A-1/A-2/A-3) debe estar mergeado
   antes de comenzar RFC-008.
