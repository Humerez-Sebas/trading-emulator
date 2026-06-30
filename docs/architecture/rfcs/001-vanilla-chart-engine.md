# RFC 001: Vanilla Chart Engine

## Objetivo
Desacoplar la inicialización, configuración y ciclo de vida de `lightweight-charts` del componente de Angular (`chart.component.ts`), moviéndolo a una clase Vanilla TypeScript independiente (`ChartEngine`).

## Motivación
Actualmente, `ChartComponent` tiene más de 1500 líneas y mezcla el ciclo de vida de Angular (NgRx, RxJS, Change Detection) con la manipulación directa del DOM y la API imperativa de Lightweight Charts. Esto viola el principio de Single Responsibility y dificulta el testing, rendimiento y mantenimiento.

## Contexto
El emulador requiere pintar cientos de miles de velas a muy alta velocidad durante un replay o backtesting. La lógica de rendering debe ser lo más ligera posible. La dependencia directa de Angular sobre el chart genera problemas de Change Detection y dificulta reutilizar el gráfico.

## Decisión Arquitectónica
1. Se creará la clase `ChartEngine` en `src/app/domain/chart/chart-engine.ts`.
2. `ChartEngine` no tendrá ninguna dependencia de `@angular/core` o `@ngrx/store`.
3. `ChartEngine` recibirá un `HTMLElement` contenedor en su constructor.
4. Se define un modelo de estado inmutable (`RenderModel`), que inicialmente solo contendrá la información esencial (e.g., velas, configuración visual).
5. `ChartEngine` expondrá un método `render(model: RenderModel)` que actualizará el gráfico eficientemente comparando referencias o iterando sobre los datos.
6. `ChartComponent` instanciará el `ChartEngine` y llamará a `render()` cada vez que el selector de NgRx emita un nuevo estado.

## Impacto
- **Positivo:** Separación clara entre el framework de UI (Angular) y el motor de render. Facilita las pruebas unitarias del ChartEngine. Reducción masiva de líneas en `chart.component.ts`.
- **Negativo:** Requiere remapear cómo se actualizan los datos (vela actual del replay vs histórico).

## Riesgos
- Degradación de rendimiento si el `render()` no gestiona eficientemente la actualización parcial (e.g. llamar a `setData` en lugar de `update` para cada tick del replay).

## Mitigaciones
- `ChartEngine` mantendrá internamente el estado de la última vela o el rango renderizado para decidir si debe usar `setData` o `update`.

## Estado Esperado
- Un proyecto que compila.
- Un `ChartComponent` que delega la inicialización del gráfico a `ChartEngine`.
- El replay de mercado y renderizado de velas sigue funcionando exactamente igual, pero la arquitectura base está lista para la Fase 2.
