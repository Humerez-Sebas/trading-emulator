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

Cada una de estas fases cuenta con su respectivo Implementation Plan en `docs/superpowers/plans/`.
Cualquier agente inteligente puede (y debe) ejecutar cada plan de manera secuencial, haciendo un Pull Request a la rama respectiva.
