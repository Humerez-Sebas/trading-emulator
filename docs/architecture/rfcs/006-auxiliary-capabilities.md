# RFC 006: Auxiliary Capabilities

## Objetivo
Desacoplar y modularizar las funcionalidades visuales secundarias del gráfico: el temporizador de cierre de vela (`CountdownCapability`) y el marcador del fin de sesión (`SessionCapability`) en plugins independientes (`Capability`) bajo el nuevo `ChartEngine`.

## Motivación
El objetivo de mantener un motor de renderizado limpio y SOLID exige que las funcionalidades de conveniencia (helpers) y los overlays secundarios no estén incrustados directamente en el `ChartComponent`. Esto evita inflar el componente y simplifica el mantenimiento. Al migrar countdown y sesión a capabilities, el `ChartEngine` actúa como un orquestador ciego de plugins independientes.

## Decisión Arquitectónica

1. **Creación de Capabilities**:
   - `CountdownCapability`: Gestiona el tag del temporizador en el eje de precios.
   - `SessionCapability`: Gestiona el renderizado de una línea vertical discontinua en el gráfico que indica visualmente el final de la sesión de trading (`sessionEnd`).

2. **Ampliación del RenderModel**:
   ```typescript
   export interface CountdownModel {
     price: number | null;
     text: string | null;
     backColor?: string;
     textColor?: string;
   }

   export interface SessionModel {
     sessionEnd: number | null;
     shift: number;
     times: number[];
     barSpacing: number;
     color?: string;
   }

   export interface RenderModel {
     // ...
     countdown?: CountdownModel;
     session?: SessionModel;
   }
   ```

3. **Ciclo de Vida e Integración**:
   - Ambas capabilities se registran en `ChartEngine` durante la inicialización en `ChartComponent`.
   - `CountdownCapability` envuelve e interactúa con `CountdownPrimitive` (el cual es reubicado a la carpeta de capabilities).
   - `SessionCapability` crea y maneja un nuevo `SessionPrimitive` que utiliza la API de canvas 2D de `lightweight-charts` para dibujar una línea vertical en la coordenada X correspondiente al tiempo de fin de la sesión.
   - Ambas clases manejan el flag de idempotencia `isDestroyed` y se des-asocian del gráfico correctamente al destruirse.

## Impacto
- **Positivo**: El código de `ChartComponent` y `ChartEngine` permanece cerrado a modificación. Agregar nuevos indicadores visuales o líneas de separación consistirá únicamente en crear y registrar nuevas capabilities.
- **Rendimiento**: Se reduce la cantidad de responsabilidades del componente principal de Angular.

## Riesgos y Mitigaciones
- **Fugas de Memoria**: Al igual que en RFC-005, se mitiga obligando a remover las primitivas y desuscribir eventos en el método `destroy()` de las capabilities.
