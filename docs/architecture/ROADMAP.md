# Architectural Roadmap: Capability-Based Trading Emulator

## Contexto y Visión (5 Años)
El objetivo de este proyecto es construir un **emulador profesional de trading para uso personal** enfocado en replay de mercado, backtesting manual y entrenamiento. No pretende ser una plataforma comercial (no live trading, no broker adapters).
Para asegurar que el proyecto mantenga fluidez, rendimiento y facilidad de mantenimiento durante los próximos cinco años, el monolito actual (`ChartComponent`) debe transformarse en un motor ligero (`ChartEngine`) extendido mediante *Capabilities*.

## Principios Arquitectónicos
1. **Framework Independence:** `ChartEngine` (Vanilla TS) nunca dependerá de Angular.
2. **Store Independence:** `ChartEngine` no conocerá NgRx. La comunicación fluye a través de un `RenderModel` inmutable.
3. **Capability-based Architecture:** El core de `ChartEngine` se mantiene cerrado a modificación. Nueva lógica = Nueva `Capability`.
4. **Local Event Bus:** Comunicación local interna y hacia el exterior mediante `ChartEventBus`.
5. **Domain Separation:** Market Data y User Workspace estrictamente separados.
6. **Dependency Rule:** Dependencias apuntan al dominio.
7. **Performance First:** Fluidez de replay y render por encima de todo.
8. **Incremental Evolution & Small PRs:** Cada paso debe ser compilable, testeable y funcional.

## Fases de Evolución (Ramas de Integración)

| Fase | RFC | Rama | Propósito |
|---|---|---|---|
| **0** | N/A | `feature/dock-redesign-angular` | Estado actual: Monolito de 1500+ líneas con fuerte acoplamiento a Angular y NgRx. |
| **1** | [RFC 001](./rfcs/001-vanilla-chart-engine.md) | `feature/rfc-001-core-chart-engine` | Extraer `lightweight-charts` a un motor Vanilla TS. |
| **2** | [RFC 002](./rfcs/002-local-event-bus-and-render-model.md) | `feature/rfc-002-event-bus-bridge` | Introducir `ChartEventBus` y asentar el puente Angular -> `RenderModel` -> `ChartEngine`. |
| **3** | [RFC 003](./rfcs/003-capabilities-foundation.md) | `feature/rfc-003-capabilities-foundation` | Crear la interfaz y registro de `Capability`. El motor se vuelve un host de plugins. |
| **4** | [RFC 004](./rfcs/004-trading-capability.md) | `feature/rfc-004-trading-capability` | Aislar lógica de trades (cajas, líneas, arrastre) en `TradingCapability`. |
| **5** | [RFC 005](./rfcs/005-drawings-capability.md) | `feature/rfc-005-drawings-capability` | Aislar dibujos geométricos en `DrawingsCapability`. |
| **6** | [RFC 006](./rfcs/006-auxiliary-capabilities.md) | `feature/rfc-006-auxiliary-capabilities` | Migrar features secundarias (Countdown, Sesiones) a capacidades independientes. |
| **7** | [RFC 007](./rfcs/007-domain-separation-enforcement.md) | `feature/rfc-007-domain-separation` | Garantizar separación de Market Data y Workspace Domains sin leaks en los DTOs. |
| **8** | [RFC 008](./rfcs/008-panel-system-and-layout-foundation.md) | `feature/rfc-008-panel-system` | Host de pestañas + grid de un solo nivel para N paneles; esqueleto de `ChartSyncBus` y `ChartModelMapper` local por panel. |
| **9** | [RFC 009](./rfcs/009-multichart-manager-and-lifecycle.md) | `feature/rfc-009-multichart-manager` | Creación/cierre dinámico de paneles; `PanelRegistry`/`ChartRegistry`; keep-alive con update-gating. |
| **10** | [RFC 010](./rfcs/010-synchronization.md) | `feature/rfc-010-synchronization` | Grupos de enlace; sync de crosshair y rango de tiempo; fan-out del reloj de replay unificado. |
| **11** | [RFC 011](./rfcs/011-workspace-layout-persistence.md) | `feature/rfc-011-layout-persistence` | `SessionPayloadV2` (layout, linkGroups, dibujos por símbolo) con migración V1 -> V2. |
| **12** | [RFC 012](./rfcs/012-performance.md) | `feature/rfc-012-performance` | Formalización del cache de velas compartido, render update-gated, creación lazy de charts. |

Las fases 8 a 12 se rigen por el documento indice
[RFC 008-012: Multi-Chart & Panel System Vision](./rfcs/008-012-multi-chart-panel-system-vision.md),
que funciona como resumen ejecutivo y mapa de decisiones arquitectónicas congeladas del bloque.

Cada una de estas fases cuenta con su respectivo Implementation Plan en `docs/superpowers/plans/`.
Cualquier agente inteligente puede (y debe) ejecutar cada plan de manera secuencial, haciendo un Pull Request a la rama respectiva.
