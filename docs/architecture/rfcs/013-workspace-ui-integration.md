# RFC 013 — Integración del Workspace Multi-Chart en la UI de Producción

- **Estado:** Propuesto
- **Rama:** `feature/rfc-013-workspace-ui-integration`
- **Depende de:** bloque RFC-008..012 completo (visión: `008-012-multi-chart-panel-system-vision.md`)
- **Plan de implementación:** `docs/superpowers/plans/2026-07-04-rfc-013-workspace-ui-integration.md`

## 1. Propósito y Contexto

El objetivo de este RFC es conectar la infraestructura reactiva y de persistencia de layouts desarrollada en el bloque RFC-008..012 con la interfaz de usuario en producción de la aplicación Angular (`emulador`).

Actualmente, la página principal (`EmuladorPageComponent`) renderiza un gráfico único a través de `<app-chart>`. Debemos reemplazarlo por el componente `<app-workspace-viewport>` para habilitar múltiples gráficos en cuadrícula (grid) y pestañas (tabs), y añadir los controles necesarios en la UI para cambiar layouts, gestionar pestañas y configurar los grupos de enlace (LinkGroups).

Todo el motor ya existe y está auditado: el viewport (RFC-008/009) renderiza tabs + grid con keep-alive y creación lazy (RFC-012), el `ChartSyncRouter` (RFC-010) sincroniza crosshair/rango por grupo, y el layout completo persiste y se restaura vía `SessionPayloadV2` (RFC-011). Lo ÚNICO que falta es (a) montarlo en la página real y (b) la capa de controles de usuario que dispara acciones NgRx que ya existen casi en su totalidad.

## 2. Decisiones

**D1 — El swap es quirúrgico y la página conserva sus overlays.** `<app-chart>` se reemplaza por `<app-workspace-viewport>` dentro de `main.chart-area`; `app-floating-pnl`, `app-playback-controller` y `app-floating-toolbar` permanecen como overlays absolutos de página sobre el área completa del viewport. El provider de página `ChartModelMapper` se ELIMINA de `EmuladorPageComponent` (su único consumidor era el `<app-chart>` desnudo; cada `ChartPanelComponent` provee el suyo — D8).

**D2 — El layout inicial vuelve a ser mono-panel.** `createInitialLayoutState()` conserva hoy el demo fijo de RFC-008 (`'2h'`, M1|M5). Para que el primer arranque tras el swap sea visualmente idéntico a la app actual (un solo gráfico), el default pasa a: un tab `'Principal'`, template `'1'`, un panel `{symbol: '', timeframe: 'M1', linkGroupId: null}`. El multi-panel es opt-in del usuario vía el selector de plantillas.

**D3 — Alcance de símbolos: mono-símbolo, multi-timeframe.** `marketFeature` mantiene UN activo cargado a la vez; `PanelDescriptor.symbol = ''` (centinela "activo actual") es el único valor que la UI de este RFC produce. Los paneles difieren por TIMEFRAME, no por símbolo. La selección de símbolo por panel queda explícitamente fuera de alcance (requeriría multi-carga en el dominio market — un RFC futuro).

**D4 — Gestión de tabs en la barra existente del viewport.** El tab-bar de `WorkspaceViewportComponent` (wrapper NO auditado) se extiende con: botón `+` (dispara `createTab`, id del caller), renombrado inline por doble clic (nueva acción aditiva `renameTab`), y botón `×` por tab (`closeTab`; cerrar el último tab es no-op del reducer, la UI lo deshabilita). En el extremo derecho de la misma fila: el selector de plantillas y el botón de grupos de enlace (D5/D6).

**D5 — Selector de plantillas = el enum cerrado `GridTemplate`.** Siete botones con glifos en miniatura (`'1' | '2h' | '2v' | '3' | '2x2' | '1+2' | '1+3'`), aplicados al tab activo vía la acción EXISTENTE `applyGridTemplate` (los paneles de celdas eliminadas se fusionan en la última celda conservada — semántica ya implementada y testeada por el reducer).

**D6 — LinkGroups identificados por COLOR (la interfaz congelada no tiene `name`).** Un popover de grupos accesible desde la barra: lista de grupos existentes (muestra de color + toggles Crosshair / Rango de tiempo + eliminar) y "Nuevo grupo" (id = uuid del caller, color siguiente de una paleta fija). La asignación panel→grupo vive en la cabecera de cada panel: un chip/punto de color que abre un mini-menú (grupos por color + "Sin grupo") y dispara la acción EXISTENTE `setPanelLinkGroup`. `syncPriceScale` sigue RESERVADO (R3): sin control de UI.

**D7 — Timeframe por panel en la cabecera del panel.** Nueva acción aditiva `setPanelTimeframe({panelId, timeframe})` (el descriptor es estado del layout feature). El selector compacto en `.panel-header` reutiliza la misma lista de timeframes que ofrece la UI global existente (una sola fuente de verdad). El cambio fluye automáticamente: descriptor → `panelChartView$` (mapper por panel) → render; y persiste vía el snapshot RFC-011 sin trabajo adicional.

**D8 — Cero cambios en archivos auditados.** `chart-engine.ts` y `chart.component.ts` PROHIBIDOS (herencia RFC-012). `chart-model-mapper.service.ts`, `chart-registry.service.ts` y `chart-sync-router.ts` tampoco se tocan (este RFC es UI + acciones aditivas de estado). Los archivos sancionados son: `workspace-viewport.component.ts`, `chart-panel.component.ts` (wrappers RFC-008), `emulador-page.component.ts`, los ficheros del `layout` feature (aditivo), y componentes NUEVOS de UI.

**D9 — Sin selectores factory por id (disciplina D8 del bloque, sin cambios).**

## 3. No-goals

- Selección de símbolo por panel (multi-carga de mercado) — RFC futuro.
- Drag & drop de paneles entre celdas (la acción `movePanel` existe; su UI se difiere).
- Reordenado de tabs; `syncPriceScale`; virtualización parcial del viewport.
- Cambios al motor de charts, al router de sincronización o al pipeline de persistencia.

## 4. Estado Esperado (DoD)

1. `npx tsc -p tsconfig.app.json --noEmit` compila con cero errores y `npm run lint` reporta 0 problemas.
2. La página del emulador monta `<app-workspace-viewport>`; el arranque en frío muestra UN gráfico (layout default mono-panel) visualmente equivalente al actual, con los overlays (PnL flotante, playback controller, toolbar flotante) operativos.
3. El usuario puede: crear/renombrar/cerrar tabs; cambiar la plantilla del tab activo entre las 7 del enum; añadir/cerrar paneles (UI ya existente del viewport); cambiar el timeframe de un panel desde su cabecera.
4. El usuario puede crear/eliminar grupos de enlace, alternar sus toggles de crosshair/rango, y asignar/desasignar paneles a grupos desde la cabecera del panel; dos paneles del mismo grupo sincronizan crosshair/rango (motor RFC-010, sin cambios).
5. Un layout multi-tab/multi-panel con grupos configurado desde la UI sobrevive cerrar y reabrir la sesión (persistencia RFC-011, sin cambios) — verificado por spec de integración.
6. Los tests de todo el árbol siguen verdes; las invariantes del layout (`assertLayoutConsistent`) se conservan tras cada interacción de UI cubierta por spec.
7. Greps de invariantes: cero cambios en `chart-engine.ts`/`chart.component.ts`; cero `createSelector` factory por `panelId`/`symbol`; cero dependencias nuevas.

## 5. Riesgos

- **Regresión visual/funcional del flujo mono-chart** (toolbars globales, replay, trading asumen "el gráfico"): mitigado por D2 (default mono-panel) y por specs de página que cubren el arranque en frío.
- **Doble fuente de verdad de timeframe** (TF global de `marketFeature.activeTf` vs TF por panel): el TF global sigue gobernando la carga de datasets/replay; el TF por panel solo elige la serie derivada a renderizar. El plan lo documenta y el selector por panel ofrece únicamente timeframes con serie disponible.
- **Descubrimiento de gaps de UX** al usar el grid real (tamaños mínimos de celda, headers apretados): se aceptan ajustes de CSS en los wrappers no auditados.
