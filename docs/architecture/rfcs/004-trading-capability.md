# RFC 004: Trading Capability

## Objetivo
Mover la visualización e interacción de los elementos de trading (órdenes, posiciones, TP, SL, risk boxes) a un plugin independiente: `TradingCapability` que implemente la interfaz `Capability` definida en el RFC-003.

## Motivación
Actualmente, las lógicas de dibujado de cajas de trade (`trade-boxes-primitive.ts`) y botones de interacción (`trade-buttons-primitive.ts`) se invocan de forma imperativa desde el `ChartComponent` o están acopladas a dependencias externas. Consolidar esta lógica en un plugin modular e independiente mantiene al `ChartEngine` limpio y cumple con el principio Abierto/Cerrado (OCP).

## Decisión Arquitectónica
1. **Migración a Capability**: Crear `TradingCapability` en `emulador/src/app/domain/chart/capabilities/trading-capability.ts` implementando la interfaz `Capability` (`emulador/src/app/domain/chart/capability.ts`).
2. **Ciclo de Vida**:
   * Su método `init(chart: IChartApi, bus: ChartEventBus)` se invocará al registrar la capability con `engine.registerCapability(...)`. Usará el bus para emitir eventos de arrastre/click y el `chart` para registrar las líneas. Podrá interactuar con la serie principal mediante el getter puente `seriesApi` del `ChartEngine` mientras este siga expuesto.
   * Su método `render(model: Partial<RenderModel>)` recibirá las actualizaciones. La capability deberá evaluar si `model.trading` ha cambiado mediante una comparación superficial para evitar renders y updates redundantes de Lightweight Charts.
   * Su método `destroy()` removerá del gráfico las primitivas de líneas y limpiará cualquier suscripción.
3. **Expansión del RenderModel**: Ampliar `RenderModel` (`emulador/src/app/domain/chart/render-model.ts`) con una propiedad opcional `trading?: TradingModel` que agrupe las posiciones, órdenes pendientes y límites de riesgo.
4. **Integración en Componente**: El componente Angular `ChartComponent` (`emulador/src/app/components/chart/chart.component.ts`) instanciará y registrará `TradingCapability` en el `ChartEngine` al inicializar, mapeando los selectores de NgRx al sub-estado `model.trading`.

## Impacto
- **Positivo:** Aislamiento total de la capa de trading, posibilitando desactivarla dinámicamente y simplificando el testing unitario de la visualización y manipulación de órdenes.

## Riesgos
- Latencia percibida por el usuario durante el arrastre de órdenes (Drag) si el flujo de retroalimentación `Arrastre -> EventBus -> NgRx -> RenderModel -> Capability` es lento.

## Mitigaciones
- Realizar actualizaciones visuales optimistas locales dentro del plugin `TradingCapability` durante el gesto de arrastre, actualizando Lightweight Charts de inmediato antes de sincronizar el estado global mediante el bus de eventos.

## Estado Esperado
- El comportamiento visual y la interactividad de las órdenes permanecen idénticos, pero ejecutados de manera totalmente aislada como un plugin del gráfico principal.

