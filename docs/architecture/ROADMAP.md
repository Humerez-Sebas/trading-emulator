# Architectural Roadmap: Capability-Based Trading Emulator

## Contexto y Visión (5 Años)
El objetivo de este proyecto es construir un **emulador profesional de trading para uso personal** enfocado en replay de mercado, backtesting manual y entrenamiento. No pretende ser una plataforma comercial (no live trading, no broker adapters).
Para asegurar que el proyecto mantenga fluidez, rendimiento y facilidad de mantenimiento durante los próximos cinco años, el monolito actual (`ChartComponent`) debe transformarse en un motor ligero (`ChartEngine`) extendido mediante *Capabilities*.

> **North Star Update (2026-07).** The final product of the emulator is not the
> accumulation of simulated transactions but the acquisition of mastery: the
> progressive amendment of the trader's Playbook, supported by conserved physical
> evidence. The system observes and conserves; the trader interprets. The
> foundational model is
> [TRADER_KNOWLEDGE_MODEL.md](file:///C:/Users/78701/Desktop/trading-emulator/docs/architecture/TRADER_KNOWLEDGE_MODEL.md);
> the development sequence that realizes it is the **Mastery Block** at the end of
> this document, which supersedes the RFC-014/015/016 numbering previously sketched
> in `strategic_audit.md` Part 8.

## Principios Arquitectónicos
1. **Framework Independence:** `ChartEngine` (Vanilla TS) nunca dependerá de Angular.
2. **Store Independence:** `ChartEngine` no conocerá NgRx. La comunicación fluye a través de un `RenderModel` inmutable.
3. **Capability-based Architecture:** El core de `ChartEngine` se mantiene cerrado a modificación. Nueva lógica = Nueva `Capability`.
4. **Local Event Bus:** Comunicación local interna y hacia el exterior mediante `ChartEventBus`.
5. **Domain Separation:** Market Data y User Workspace estrictamente separados.
6. **Dependency Rule:** Dependencias apuntan al dominio.
7. **Performance First:** Fluidez de replay y render por encima de todo.
8. **Incremental Evolution & Small PRs:** Cada paso debe ser compilable, testeable y funcional.

## Fases de Evolución (Ramas de Integración) — bloque RFC-001..013, COMPLETADO

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
| **13** | [RFC 013](./rfcs/013-workspace-ui-integration.md) | `feature/rfc-013-workspace-ui-integration` | Integración del workspace multi-chart en la página de producción: swap `<app-chart>` → `<app-workspace-viewport>`, gestión de tabs/plantillas y UI de LinkGroups. |

Las fases 8 a 12 se rigen por el documento indice
[RFC 008-012: Multi-Chart & Panel System Vision](./rfcs/008-012-multi-chart-panel-system-vision.md),
que funciona como resumen ejecutivo y mapa de decisiones arquitectónicas congeladas del bloque.

Cada una de estas fases cuenta con su respectivo Implementation Plan en `docs/superpowers/plans/`.
Cualquier agente inteligente puede (y debe) ejecutar cada plan de manera secuencial, haciendo un Pull Request a la rama respectiva.

---

## Post-Infrastructure Refinements (RFC-017..019)

Between the infrastructure block above and the Mastery Block below sits a short sequence of
corrective work: defects and rough edges that only became visible once the multi-chart platform
was actually used for backtesting. They are grouped here rather than as Mastery Block phases
because they are a different *kind* of work — repairs to what RFC-001..013 delivered, not steps
in the knowledge-conservation sequence.
(Section in English per the architecture-corpus language directive of 2026-07.)

| Block | RFCs | Purpose |
|---|---|---|
| **Post-Infrastructure Refinements** | [RFC-017](./rfcs/017-compositional-panel-sync.md) / [RFC-018](./rfcs/018-trade-visibility-refinement.md) / [RFC-019](./rfcs/019-pane-guard-cross-tf-forming.md) | Panel sync, trade visibility, pane-guard + cross-TF forming — bug fixes and UX refinement after the multi-panel infrastructure block. |

---

## Mastery Block: Phases 0-3 (the next development sequence)

The completed block above delivered the multi-chart replay platform. This block
reorients development around knowledge conservation
([TRADER_KNOWLEDGE_MODEL.md](file:///C:/Users/78701/Desktop/trading-emulator/docs/architecture/TRADER_KNOWLEDGE_MODEL.md)):
the emulator is a neutral flight recorder during practice and a reflection
instrument afterwards; the deliverable of training is the amended Playbook.
(Section in English per the architecture-corpus language directive of 2026-07.)

| Phase | Artifact / RFC | Purpose |
|---|---|---|
| **0** (current) | [TRADER_KNOWLEDGE_MODEL.md](file:///C:/Users/78701/Desktop/trading-emulator/docs/architecture/TRADER_KNOWLEDGE_MODEL.md) | Foundational definition of knowledge: the ontology (Trade Record, Session, Reflective Scene, Permanent Lesson), the black-box telemetry register, the Reflection Cabin, the permanent knowledge schema, and the excluded-metrics doctrine. |
| **1** | RFC-014: High-Fidelity Simulation & Behavioral Telemetry Engine | Base-resolution (M1) execution with bid/ask, spread and real costs, PLUS invisible physical telemetry (seeks, elapsed-time-before-order, intrabar MAE/MFE, dynamic mark-to-market). Merges the previously separate RFC-014 and RFC-015 drafts: execution physics and the black box are one clean mathematical refactor of the same engine loop. |
| **2** | RFC-015: Playbook & Rule Adherence Domain | The Playbook (the rules the trader decides to train) as a first-class permanent domain; optional single-keystroke declaration of the rule being executed when opening a trade. The system records the declaration as a fact; it never scores adherence. |
| **3** | RFC-016: The Playbook Amendment Journal | The training journal: reconstructs Reflective Scenes (Entry, Exit, Maximum Tension) from telemetry, presents uninterpreted physical facts, and lets the trader author cold self-critique and permanent Playbook amendments, offline-first. |

Drafts for the three RFCs:
[RFC-014_AND_BEYOND.md](file:///C:/Users/78701/Desktop/trading-emulator/docs/architecture/RFC-014_AND_BEYOND.md).
Each RFC graduates to `docs/architecture/rfcs/` on acceptance and follows the
`feature/rfc-XXX-*` -> `develop` workflow.
