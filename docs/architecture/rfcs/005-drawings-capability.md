# RFC 005: Drawings Capability

## Objetivo
Desacoplar la interacción y renderizado de las herramientas de dibujo (líneas, fibonacci) en un plugin `DrawingsCapability`.

## Motivación
De manera similar al trading, `drawings-primitive.ts` reside en el mismo contexto e infla el motor principal. Se requiere que los dibujos sean independientes del estado de NgRx dentro del engine.

## Decisión Arquitectónica
1. Migrar la lógica a `DrawingsCapability`.
2. Añadir `model.drawings` al `RenderModel`.
3. Eventos de dibujo (inicio, arrastre, fin) se emiten vía `ChartEventBus`.
4. El componente Angular los procesa y emite `DrawingsActions`.

## Impacto
- **Positivo:** Código de dibujos totalmente independiente. Se podrían cargar dinámicamente nuevos tipos de dibujo como sub-capabilities en un futuro.

## Riesgos
- Coordinación entre clicks del gráfico (paneo vs dibujo). 

## Mitigaciones
- `DrawingsCapability` escuchará de `model.drawings.activeTool` para secuestrar los clicks.

## Estado Esperado
- El usuario puede dibujar igual que antes, pero `ChartEngine` ignora por completo la existencia de los dibujos.
