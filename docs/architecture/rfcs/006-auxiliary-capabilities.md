# RFC 006: Auxiliary Capabilities

## Objetivo
Extraer funcionalidades visuales secundarias, como el timer de vela actual (Countdown) y los marcadores de sesión, hacia capacidades aisladas.

## Motivación
Tener un motor limpio exige que las funcionalidades de conveniencia (helpers) no ensucien el código crítico. El temporizador de la vela y las líneas de sesión son excelentes ejemplos de lógicas que pueden activarse/desactivarse según la preferencia del usuario sin impactar el render principal.

## Decisión Arquitectónica
1. Se crean `CountdownCapability` y `SessionCapability`.
2. Se extiende el `RenderModel` con `model.session` y `model.countdown`.
3. El componente en Angular inyecta estas capacidades en el `ChartEngine`.

## Impacto
- **Positivo:** Demuestra el poder de la arquitectura. Cualquier desarrollador puede agregar un indicador o overlay simplemente creando una nueva capability y registrándola, sin tocar el core.

## Riesgos
- Mínimos. Es una refactorización de código existente (`countdown-primitive.ts`).

## Estado Esperado
- El reloj de la vela y las separaciones de sesión son plugins opcionales, completamente autónomos del engine.
