# RFC 002: Local Event Bus & Render Model

## Objetivo
Establecer un mecanismo de comunicación unidireccional y reactivo entre el `ChartEngine` y el exterior (Angular/NgRx), introduciendo el `ChartEventBus` y expandiendo el `RenderModel`.

## Motivación
El `ChartComponent` actual escucha directamente eventos del DOM o de Lightweight Charts (e.g. clicks, cruces de ratón) y despacha acciones NgRx. Al desacoplar el engine en RFC 001, necesitamos una forma limpia de exportar estos eventos interactivos sin acoplar el engine a RxJS o NgRx.

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
