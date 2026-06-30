# RFC 003: Capabilities Foundation

## Objetivo
Transformar el `ChartEngine` de un objeto rígido a un sistema de plugins, introduciendo la interfaz `Capability` para que futuras lógicas visuales se inyecten sin modificar el motor principal.

## Motivación
Toda la lógica de dibujos, trades interactivos (Trade Boxes) y countdown está hardcodeada dentro de primitivas que el gráfico o el componente invocan. Si seguimos este camino, `ChartEngine` crecerá infinitamente. Aplicar el Open/Closed Principle requiere que el motor esté cerrado a modificaciones y abierto a extensión.

## Decisión Arquitectónica
1. Se crea la interfaz `Capability`:
   ```typescript
   export interface Capability {
     init(chart: IChartApi, eventBus: ChartEventBus): void;
     render(model: RenderModel): void;
     destroy(): void;
   }
   ```
2. `ChartEngine` se modifica para mantener un array de `Capabilities`.
3. Al llamar a `engine.render(model)`, el engine actualiza la serie principal y luego itera sobre las capabilities llamando a su método `render(model)`.
4. El `RenderModel` se divide en dominios: `model.trading`, `model.drawings`, etc., para que cada capability consuma solo su parte del estado.

## Impacto
- **Positivo:** Arquitectura altamente extensible. Nuevos features gráficos son simplemente una nueva clase que se registra al inicio.

## Riesgos
- Overhead de llamar `render()` en muchas capabilities si el modelo cambia muy frecuentemente.

## Mitigaciones
- Las capabilities deben implementar memoización básica o chequeos de igualdad superficial (shallow compare) sobre su sub-estado antes de forzar actualizaciones sobre la API de lightweight-charts.

## Estado Esperado
- El `ChartEngine` soporta registro de plugins mediante un método `registerCapability(cap: Capability)`.
