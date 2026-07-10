# RFC 002: Local Event Bus & Render Model

## Objetivo
Establecer un mecanismo de comunicación unidireccional y reactivo entre el `ChartEngine` y el exterior (Angular/NgRx), introduciendo el `ChartEventBus` y expandiendo el `RenderModel`.

## Motivación
El `ChartComponent` actual escucha directamente eventos del DOM o de Lightweight Charts (e.g. clicks, cruces de ratón) y despacha acciones NgRx. Al desacoplar el engine en RFC 001, necesitamos una forma limpia de exportar estos eventos interactivos sin acoplar el engine a RxJS o NgRx.

## Prerrequisitos (Estado entregado por RFC-001)
RFC-001 está **mergeado y endurecido**. Antes de empezar RFC-002, dar por hecho lo siguiente:
- Existe `emulador/src/app/domain/chart/chart-engine.ts` (clase Vanilla TS, sin Angular/NgRx) y `render-model.ts` (`RenderModel`, `ChartConfig`).
- `ChartEngine` ya gestiona init, `applyOptions`, `autoSize`, `setInteractivity()`, `resetPriceScale()` y `destroy()`. `ChartComponent.ngOnDestroy` llama a `engine.destroy()`.
- `ChartEngine` expone **getters puente** `chartApi` / `seriesApi` (con un `// TODO` que apunta a su eliminación en RFC-004/005). El componente sigue usándolos para coordenadas, primitives y price lines. **RFC-002 NO debe eliminar esos getters todavía** — solo añade el canal de eventos.
- **Workspace real: `emulador/`.** Todas las rutas viven bajo `emulador/src/app/...`. (En RFC-001 un subagente creó archivos en la raíz por error; no repetir.)

## Alcance Acotado (qué SÍ y qué NO en RFC-002)
- **SÍ:** crear `ChartEventBus`; mover al engine las 4 suscripciones de Lightweight Charts que hoy vive en el componente (`subscribeClick`, `subscribeDblClick`, `subscribeCrosshairMove`, `timeScale().subscribeVisibleLogicalRangeChange`) y reemitirlas como eventos tipados del bus; que el componente escuche el bus y mantenga sus handlers/dispatch NgRx existentes.
- **NO:** migrar lógica de trading/drawings (eso es RFC-004/005), eliminar los getters puente, ni cambiar el flujo de datos `Store → RenderModel → render()` (ya funciona).

## Decisión Arquitectónica
1. Se crea `ChartEventBus`, una clase simple agnóstica tipo Pub/Sub (o usando un event emitter ligero de Vanilla TS).
2. `ChartEngine` instancia este bus o lo recibe inyectado.
3. Eventos del gráfico (e.g. `CrosshairMoved`, `ChartClicked`) se emiten en este bus.
4. `ChartComponent` (en la capa Angular) se suscribe al `ChartEventBus` y traduce esos eventos locales a Acciones globales de NgRx (ej: `TradingActions.chartClicked`).
5. El `RenderModel` se consolida como la única fuente de verdad inyectada hacia el engine. Toda actualización visual debe venir obligatoriamente a través de un nuevo `RenderModel`.

## Impacto
- **Positivo:** Separación clara. El Engine emite eventos puros de UI/Domain, Angular decide qué hacer con ellos.

## Riesgos
- Pérdida de eventos o memory leaks si no se desuscriben correctamente en el ciclo de vida del componente.

## Mitigaciones
- Proveer un método `destroy()` en el bus y suscribirse usando patrones de limpieza (`takeUntilDestroyed` o `Subscription.add`).

## Estado Esperado
- Comunicación completamente reactiva y bidireccional indirecta: `Store -> RenderModel -> ChartEngine` y `ChartEngine -> ChartEventBus -> Store`.
