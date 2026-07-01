# RFC 007: Domain Separation Enforcement

## Objetivo
Auditar y garantizar la estricta separación entre el Market Data Domain (velas, timeframes, precios, y primitivas geométricas) y el User Workspace Domain (configuraciones de UI, estado del dock, colores, y mappers/selectores NgRx).

## Motivación
Actualmente, el `RenderModel` y las capabilities en `src/app/domain/chart` importan interfaces de `src/app/state/*` (por ejemplo, `ChartColors`, `Drawing`, `DrawingTool`, `Position`, `PendingOrder`, `TradeBoxItem`, `TradeMarker`). Para garantizar la mantenibilidad y portabilidad del motor de visualización, `ChartEngine` y sus plugins en `domain/chart` deben ser agnósticos del framework de estado (NgRx) y de los modelos directos de persistencia/estado, comunicándose únicamente a través de DTOs puros.

## Decisión Arquitectónica
1. **Aislamiento de Tipados**:
   - Eliminar cualquier referencia o importación directa a `src/app/state/*` o `src/app/state/selectors` desde el dominio (`src/app/domain/chart`).
   - Redefinir e internalizar las interfaces DTO equivalentes necesarias en `render-model.ts` para Drawings, Trading, Countdown y Session.
2. **Capa de Anti-Corrupción (ACL)**:
   - Crear el servicio `ChartModelMapper` (`src/app/components/chart/chart-model-mapper.service.ts`) como inyectable de Angular.
   - Extraer la lógica de suscripción de selectores complejos de NgRx que pueblan el `RenderModel` (tales como la construcción de la lista de dibujos, órdenes pendientes, posiciones, etc.) desde `ChartComponent` a este servicio mapper.
   - `ChartComponent` inyectará `ChartModelMapper` y alimentará el `ChartEngine` usando los DTOs puros producidos por el mapper.

## Impacto
- **Positivo:** El dominio del gráfico es totalmente portátil y agnóstico de NgRx.
- **Mantenibilidad:** Menor acoplamiento. Cualquier cambio en las estructuras de la base de datos o NgRx no impactará el motor del gráfico siempre que el mapper traduzca las estructuras adecuadamente.

## Estado Esperado
Al finalizar, el emulador compilará con `npx tsc -p tsconfig.app.json --noEmit` sin errores y no existirá ningún import en la carpeta `domain/chart/` que apunte hacia la carpeta `state/`.
