# RFC 004: Trading Capability

## Objetivo
Mover la visualización e interacción de los elementos de trading (órdenes, posiciones, TP, SL, risk boxes) a un plugin independiente: `TradingCapability`.

## Motivación
Actualmente `trade-boxes-primitive.ts` y `trade-buttons-primitive.ts` están fuertemente acoplados a NgRx o son llamados de forma imperativa desde el `ChartComponent`. Esto rompe el principio de Single Responsibility y la escalabilidad del sistema.

## Decisión Arquitectónica
1. Migrar lógicas de "primitivas" de trading a la clase `TradingCapability` (que implementa `Capability`).
2. Ampliar el `RenderModel` introduciendo una interfaz `TradingModel` que contenga el estado de posiciones, órdenes pendientes y risk bounds.
3. El `ChartEventBus` se amplía con eventos como `OrderLineDragged`, `TradeBoxClicked`.
4. El Angular `ChartComponent` inyectará la `TradingCapability` en el `ChartEngine` durante la configuración inicial y mapeará los selectores de NgRx al sub-árbol `model.trading`.

## Impacto
- **Positivo:** La lógica de dibujado de trades queda aislada, permitiendo desactivarla si es necesario y posibilitando tests unitarios estrictos.

## Riesgos
- Latencia en el arrastre de órdenes si el roundtrip `Arrastre -> EventBus -> NgRx -> RenderModel -> Capability` es lento.

## Mitigaciones
- Utilizar actualizaciones locales temporales en la UI (optimistic updates) dentro de la `TradingCapability` al arrastrar, o asegurar que la actualización de NgRx sea síncrona.

## Estado Esperado
- Las "Trade Boxes" e interacciones visuales de órdenes operan idénticamente al estado base, pero inyectadas como un plugin del engine principal.
