# RFC 007: Domain Separation Enforcement

## Objetivo
Auditar y garantizar la estricta separación entre el Market Data Domain (e.g. velas, timeframes, precios absolutos) y el User Workspace Domain (e.g. configuraciones de UI, estado del dock, colores).

## Motivación
A lo largo de las extracciones anteriores, es posible que el `RenderModel` haya absorbido atributos mixtos. Para la mantenibilidad a 5 años del proyecto, es crítico que el `ChartEngine` no sepa nada de conceptos como "Dock", "Workspace", "Layouts", limitándose estrictamente a pintar entidades financieras y geométricas.

## Decisión Arquitectónica
1. Revisión formal de las interfaces `RenderModel`, `TradingModel`, `DrawingsModel`.
2. Se eliminan las referencias directas a modelos de NgRx dentro de `src/app/domain/chart`.
3. El mapper de `ChartComponent` (que transforma estado NgRx a `RenderModel`) se extrae a un servicio/selector dedicado `ChartModelMapper`, asegurando que actúe como una capa de Anti-Corruption (ACL).

## Impacto
- **Positivo:** Arquitectura limpia. El dominio del gráfico es totalmente portable y agnóstico del estado de la aplicación.

## Riesgos
- Complejidad en el mapping si las estructuras difieren sustancialmente.

## Estado Esperado
- Cierre formal del proceso arquitectónico. El emulador funciona con una UI en Angular extremadamente delgada, respaldada por un motor de visualización agnóstico y extensible por capacidades.
