# RFC 016: El Diario de Enmiendas del Playbook

| Campo | Valor |
| :--- | :--- |
| Estado | Propuesto (pendiente de aprobación del owner) |
| Fecha | 2026-07-13 |
| Bloque | Mastery Block — Fase 3 ([ROADMAP.md](../ROADMAP.md)) |
| Rama de implementación | `feature/rfc-016-amendment-journal` → PR a `develop` |
| Dependencias | RFC-014 (entregado — telemetría + MAE/MFE con `tMae`/`tMfe`); RFC-015 (en rama — Playbook + `declaredRuleId`); fix previo D16.A (eliminación del código muerto del scrubber, rama propia) |
| Documentos rectores | [TRADER_KNOWLEDGE_MODEL.md](../TRADER_KNOWLEDGE_MODEL.md) (§2 ontología, §4 Cabina, §5 esquema permanente, §6 métricas excluidas, N-1..N-6); [DOMAIN_MODEL.md](../DOMAIN_MODEL.md); **`DESIGN_SYSTEM.md` (raíz del repo)** — autoridad única de decisiones visuales, de interacción y accesibilidad (§6.1); [RFC-014_AND_BEYOND.md](../RFC-014_AND_BEYOND.md) (borrador abstracto RFC-016, revisión 2) |
| Artefactos derivados | Spec de diseño UX: `docs/superpowers/specs/2026-07-13-rfc-016-journal-reflection-design.md` · Arquitectura de componentes: `docs/superpowers/specs/2026-07-13-rfc-016-component-architecture.md` · Plan: `docs/superpowers/plans/2026-07-13-rfc-016-implementation-plan.md` |

## Objetivo

Cerrar el ciclo cognitivo del entrenamiento (TRAINING_WORKFLOW paso 7, *Registro y
Reevaluación*): dar al trader **el espejo** (reconstrucción determinista de lo que
ocurrió) y **la pluma** (la lección que escribe lo que significó), manteniendo la
frontera S1 intacta: el espejo pertenece al sistema; la pluma, exclusivamente al
trader.

Tres superficies nuevas, conectadas en un bucle deliberado (DESIGN_SYSTEM §1):

```
Journal (patrones físicos de la sesión)
   → click en cualquier trade → Cabina de Reflexión (replay cognitivo de UN trade)
   → escribir lección → enmendar regla del Playbook → volver al Journal
```

El producto final del entrenamiento es el Playbook enmendado (TKM §1.3). El campo
`amendments` de `PlaybookRule` — reservado sin lectores desde el RFC-015 (P-7) —
gana aquí sus primeros y únicos lectores de producción.

## Motivación

1. **La última etapa no construida.** Facts (RFC-014) y declaración de reglas
   (RFC-015) existen; sin la Cabina y las lecciones, la telemetría es un archivo
   muerto y el Playbook no puede evolucionar con evidencia.
2. **Asimetría de conservación (TKM §2.2).** Las lecciones comparten con el
   Playbook el tier de pérdida catastrófica: exigen la ceremonia máxima (LWW por
   fila, RLS, exportación, supervivencia N-4).
3. **Dirección explícita del owner (sesión de diseño del 2026-07-13).** Las
   decisiones D16.A–D16.H (abajo) fijan el alcance UX de esta fase con
   `DESIGN_SYSTEM.md` como autoridad visual.

## Decisiones de alineación

> Nota de registro: en la sesión de diseño el owner etiquetó estas decisiones
> D1–D8. Se registran aquí como **D16.A–D16.H** porque D1–D9 ya nombran decisiones
> de arquitectura previas del repo (D1 mono-símbolo, D8 factory-selector ban, D9
> payload atómico). El mapeo es literal: D1→D16.A … D8→D16.H.

| Id | Decisión | Racional |
| :--- | :--- | :--- |
| D16.A | **Eliminación previa del scrubber.** `ReplayActions.seekTo` y toda la telemetría `ReplaySeek`/`lastSeek`/`withSeekAnchor` son código muerto (el scrubber nunca se construyó; la acción jamás se despacha en producción). Se eliminan en un fix separado ANTES de esta rama, con autorización expresa del owner para editar los specs preexistentes que testeaban ese código muerto. | Un RFC no se construye sobre vocabulario muerto; TKM §3.1/§3.2 se enmiendan en el cierre documental de este RFC. |
| D16.B | **Ancla de tiempo transcurrido con umbral de pausa en `+1` (≥3 s).** Al pulsar `+1` (`advanceDisplay`), si `pausedMs` desde el `+1` anterior supera 3000 ms, el ancla del `OrderClock` se resetea retroactivamente al instante del `+1` ANTERIOR (el tiempo de pausa queda DENTRO de la ventana medida). Pulsaciones rápidas (<3 s) no resetean. `TimeElapsedBeforeOrder.anchorKind` queda: `sessionStart \| lastOrderEvent \| lastJump`. | Captura "tiempo analizando antes de esta orden" sin pedirle nada al trader (S2); reemplaza el ancla `lastSeek` eliminada por D16.A con una señal física no interpretativa (N-1: se registra geometría temporal, no un juicio). |
| D16.C | **Métricas de sesión en el Journal** (grilla Performance): profit factor, win rate, R acumulado, medias de MAE_R/MFE_R, Sharpe (nuevo, por-trade), balance, drawdown %. Todas session-scoped; **jamás agregadas cross-session**. | Ver "Nota de supersesión TKM §6" abajo — decisión explícita del owner con guardarraíles. |
| D16.D | **Cabina de Reflexión.** Ruta `/journal/:sessionId/reflect/:tradeId`; layout 30 % lista de trades / 70 % escena + panel de reflexión; línea de tiempo de 5 waypoints — Entry · Management (expandible: sub-nodos por evento de gestión) · MAE · MFE · Exit — con hechos contextuales por nodo; escena congelada renderizada por la vía existente `RenderModel → ChartEngine` (instancia read-only y slim); crossfade 180 ms al cambiar de nodo; formulario guiado de 3 campos (D16.G); widget de vinculación a reglas; indicador `✎` en trades con reflexión; teclado `↑↓`/`1`–`5`/`Tab` (DESIGN_SYSTEM §4.5, §5.2). | Extiende las 3 escenas canónicas de TKM §2.1 (Entry/Exit/Máxima Tensión) a 5 waypoints: MAE ≡ Máxima Tensión, MFE y Management se derivan de los mismos facts ya capturados o capturables. Un nodo sin datos NO se renderiza (§3.2 del design system). |
| D16.E | **Journal.** Ruta `/journal/:sessionId`; secciones en orden: Performance, Execution, Behavior, Rule Performance, Time of Day, Trades; visualizaciones V1: scatter MAE vs MFE (§4.2), bubble Duración vs R (§4.3), heatmap calendario de trades (§4.4); tablas Rule Performance y Time of Day; tabla de trades simplificada; perfil de densidad `compact` (§2.3); colores de zona semántica (§2.1). | Vistas descriptivas físicas por sesión ("physical descriptive views may ride along Phase 3", RFC-014_AND_BEYOND §0); el Journal descubre patrones, la Cabina revive un trade — una superficie, un propósito (§1). |
| D16.F | **Flujo de integración circular.** Todo elemento del Journal que representa un trade (punto del scatter, burbuja, celda del heatmap, fila de tabla) navega a `/journal/:sessionId/reflect/:tradeId`. Breadcrumb "← Journal" para volver; flechas `←`/`→` navegan entre trades sin salir de la Cabina. | "Every visualization is actionable. No dead charts." (DESIGN_SYSTEM §1); el bucle de aprendizaje es la arquitectura, no una feature. |
| D16.G | **Modelo de Lesson con 3 campos separados:** `whatHappened` ("¿Qué ocurrió?"), `repeat` ("¿Qué debería repetir?"), `avoid` ("¿Qué debería evitar?") + `linkedRuleIds`, `evidence: SceneSpec[]` (congeladas al guardar), `tradeRefs`, `sessionRef`, `authoredAt`, LWW. | Los 3 campos son categorías ESTRUCTURALES que el trader llena; el sistema jamás los parsea, puntúa ni interpreta (refina J-2 de "un campo text" a "los campos autorados por el trader"; N-6 intacto). Habilita consultas futuras del propio trader ("todo lo que debo evitar") sin semántica del sistema. |
| D16.H | **Un solo lenguaje visual ("The Focused Terminal").** Cuatro perfiles de densidad, siete colores de zona semántica, estados interactivos completos, mapas de teclado por superficie. | `DESIGN_SYSTEM.md` es la fuente única (§6.1); este RFC lo referencia por sección y NO duplica decisiones de diseño (§6.3). |

### Nota de supersesión — TKM §6 vs D16.C (registrada, no silenciosa)

TKM §6 excluye del tier de conocimiento el win rate de ventana corta, el Sharpe
("pseudo-rigor" sobre tiempo de replay comprimido) y el profit factor, y programa
su de-énfasis de UI. La dirección del owner del 2026-07-13 (D16.C) los muestra en
la grilla Performance del Journal. TKM declara en su cabecera que **cede ante la
dirección explícita del owner**; esta es esa dirección, y se ejecuta con estos
guardarraíles que preservan la intención original:

1. **Session-scoped estricto:** ninguna métrica D16.C se agrega ni se compara
   entre sesiones (detector J-5).
2. **Transitorio, jamás conocimiento:** ninguna métrica D16.C se persiste en
   Lessons, Playbook ni en ningún store del tier permanente — son salida derivada
   de `computeSessionStats` en el read-side.
3. **Honestidad de etiqueta:** el Sharpe se calcula y rotula como razón por-trade
   (`media(R_i) / desviación(R_i)`, n≥2, sin anualización) — nunca se presenta
   como Sharpe de calendario.
4. El cierre documental de este RFC actualiza la nota de estado de TKM §6 para
   registrar esta supersesión con fecha y alcance.

## Especificación

### 1. Vocabulario: "eventos de gestión" (no "seeks")

`DESIGN_SYSTEM.md` §4.3/§4.5 usa "seeks" para los sub-eventos del nodo Management
(SL tighten, SL widen, TP move) y para el radio de las burbujas. Ese término
colisiona con el `ReplaySeek` eliminado (D16.A). Este RFC fija el término del
dominio: **evento de gestión** (`ManagementEvent`) = modificación física de SL/TP
sobre una orden o posición viva, capturada por la caja negra como fact neutro:

```
OrderModified    := { orderRef,    field: 'sl' | 'tp' | 'entry', from, to }
PositionModified := { positionRef, field: 'sl' | 'tp',           from, to }
```

Direccionalidad (tighten/widen) es GEOMETRÍA derivable en el read-side (comparar
`from`/`to` contra el lado de la posición), nunca un campo almacenado con juicio
(N-1). La telemetría gana estos dos kinds de evento (extensión aditiva del envelope
RFC-014); el detector N-1 se re-corre sobre los payloads nuevos.

### 2. El agregado Lesson (la pluma)

```
Lesson := { id, authoredAt,
            whatHappened, repeat, avoid,   // texto del trader, OPACO (D16.G)
            linkedRuleIds: string[],       // reglas que esta lección enmienda
            evidence: SceneSpec[],         // copias CONGELADAS al guardar (J-3)
            tradeRefs: string[],           // punteros best-effort, pueden colgar
            sessionRef: string,
            clientUpdatedAt?, syncedAt? }  // LWW por fila (patrón folders/playbook_rules)
```

- Guardar una lección con `linkedRuleIds` no vacío añade el id de la lección a
  `PlaybookRule.amendments` de cada regla vinculada (los primeros lectores/escritores
  de producción de `amendments` — P-7 queda cumplido y cerrado).
- `evidence` tiene tope por lección (guardarraíl de tamaño, patrón size-guard del
  payload); las escenas degradan con gracia si los datasets locales faltan (TKM §5.2).
- Los tres campos de texto pueden estar vacíos: una lección parcial es válida; una
  revisión vacía es una revisión válida (S2).

### 3. Persistencia y sincronización

- **Local:** DB IndexedDB dedicada **`emulador-lessons`**, store `lessons`
  (keyPath `id`), candle-free (`assertNoCandles` reutilizado — N-5). Dedicada por
  la lección D15.B: no se toca el upgrade path de `emulador-playbook` ni de
  ninguna DB existente.
- **Nube:** tabla **`lessons`** (una fila por lección, `user_id`), RLS de
  aislamiento por usuario + trigger `lww_guard()` (función auditada existente),
  ciclo push/pull por fila idéntico al de `playbook_rules` (RFC-015 T4).
  `evidence` viaja como `jsonb` candle-free.
- **Supervivencia (N-4):** borrar sesiones, workspaces o telemetría no toca
  lessons ni playbook; test de ida y vuelta como detector (J-4).
- **Exportación:** `.lessons.json` versionado desde el Journal (patrón
  `.playbook.json`); importación fuera de alcance (paridad con RFC-015).

### 4. Escenas y línea de tiempo (el espejo)

- `SceneSpec` per TKM §2.1 (candle-free, determinista). Cómputo puro:
  `(TradeRecord, TelemetryLog, ManagementEvents) → WaypointScene[]` donde los
  waypoints son Entry · Management(sub-escenas) · MAE(`tMae`) · MFE(`tMfe`) · Exit.
- **Visibilidad dinámica:** un waypoint sin fact correspondiente NO se renderiza
  (trade sin eventos de gestión ⇒ sin nodo Management; MAE que coincide con Exit ⇒
  nodos fusionados) — DESIGN_SYSTEM §4.5.
- **Render:** instancia slim read-only del camino `RenderModel → ChartEngine`
  existente (misma maquinaria del panel, replay desacoplado). El motor NO cambia;
  ninguna capability nueva; la escena entra como datos (invariantes 1-2 del kernel).
- **Nada rasterizado, jamás** (N-3/J-1): la escena se recomputa siempre; solo la
  `SceneSpec` (parámetros) se congela dentro de la lección.

### 5. Journal (read-side de la sesión)

- Read models puros sobre: historial de `ClosedTrade` de la sesión (incluye
  `declaredRuleId`, MAE/MFE, costes — RFC-014/015), telemetría de la sesión y
  reglas del Playbook (títulos para rotular — lectura de `title`, jamás de
  `statement`; P-2 intacto).
- `computeSessionStats` gana `sharpe` (por-trade, guardado bajo D16.C.3) — cambio
  aditivo con la misma disciplina TDD del motor; ninguna otra métrica nueva.
- Rule Performance: filas = reglas con ≥1 trade declarado en la sesión + fila
  "Sin declarar" (el trade sin declarar es ciudadano de primera clase — P-1).
- Time of Day: cubos por hora UTC (hora del `openTime`).
- Densidad `compact`, zonas semánticas §2.1, visualizaciones §4.2-§4.4, estados
  §3.2 (incl. `insufficient-data` con umbral de 3 trades), teclado §5.2.

### 6. Rutas y navegación

```
/journal/:sessionId                    → JournalPageComponent
/journal/:sessionId/reflect           → ReflectionCabinPageComponent (primer trade)
/journal/:sessionId/reflect/:tradeId  → ReflectionCabinPageComponent
```

- Tarjetas del catálogo `/sesiones`: botones **Reflect** y **Journal** (TKM §4.5
  ya los especifica; esta fase los construye).
- El Journal y la Cabina cargan la sesión por id SIN abrir el workspace interactivo
  completo (read-side; la sesión activa de práctica no se ve afectada).
- Flujo circular D16.F; `Escape` vuelve al nivel superior (§5.2).

## Modelo de datos (cambios aditivos)

- `Lesson` (nuevo, dominio Journal/Playbook write-side) + `LessonsState` NgRx.
- Telemetría: kinds nuevos `OrderModified`/`PositionModified` (aditivos al union).
- `TimeElapsedBeforeOrder.anchorKind`: `lastSeek` eliminado (D16.A, fix previo),
  `lastJump` añadido (D16.B).
- `computeSessionStats` += `sharpe` (aditivo).
- `PlaybookRule.amendments`: sin cambio de forma; gana lectores/escritores (P-7 → cumplido).
- SQL nuevo: `lessons` + RLS + `lww_guard` (archivo en `supabase/`, aplicación vía MCP).
- Payload de sesión: **sin cambios** (D9 intacto; nada de esta fase entra en
  `SessionPayloadV2`).

## No-objetivos

1. **Sin crítica generada por el sistema:** ni resúmenes, ni sugerencias, ni
   "insights" (N-6, S1). Cualquier lente de análisis futura exige RFC propio.
2. **Sin agregación cross-session** de métrica alguna (D16.C.1); sin trending.
3. **Sin revisión obligatoria:** cerrar sesión sin reflexionar es válido (S2).
4. **Sin procesamiento en la nube:** reconstrucción y review son locales.
5. **Sin importación** de `.lessons.json` (paridad con RFC-015 no-objetivo 6).
6. **Sin editor rico:** los 3 campos son texto plano; sin markdown renderizado,
   sin adjuntos, sin imágenes (N-3 los prohíbe de raíz).
7. **Sin edición de facts desde el Journal:** el read-side jamás escribe en
   trading/replay/telemetry (J-6).

## Invariantes y detectores

| Id | Invariante | Detector |
| :--- | :--- | :--- |
| J-1 | Las escenas son recomputables: ningún render se persiste jamás (N-3) | Test de forma de almacenamiento: cero blobs/Base64 en stores de lessons/telemetría |
| J-2 | Solo los campos autorados por el trader (`whatHappened`/`repeat`/`avoid`) portan significado; ningún camino los parsea, puntúa o transforma | Grep de sitios de lectura (solo display/edit/export/sync) + grep N-1 |
| J-3 | La evidencia se congela al autorar: cambios posteriores de sesión/telemetría jamás mutan una lección | Test de inmutabilidad sobre las copias de `evidence` |
| J-4 | Conservación (N-4): purgar sesiones+telemetría deja lessons y playbook intactos y legibles | Round-trip de borrado (patrón P-3) |
| J-5 | Session-scope: ningún read-model del Journal consume más de una sesión | Revisión de selectores + test de aislamiento (dos sesiones sembradas, stats de una no cambian con la otra) |
| J-6 | El Journal/Cabina es read-side puro sobre facts: cero dispatches a trading/replay/telemetry | Grep de dispatches en `journal/**` y `reflection/**` (solo acciones de lessons/navegación) |
| P-7 (cierre) | `amendments` gana sus lectores sancionados; fuera de lessons-linking sigue sin lectores | Grep actualizado del detector P-7 del RFC-015 |

## Plan de aterrizaje incremental (cada paso compila y testea en verde)

0. (Prerrequisito, rama separada) D16.A: eliminación del scrubber + gates verdes.
1. Telemetría: `ManagementEvent`s + ancla D16.B (`lastJump`) — con detectores N-1/N-2.
2. Dominio Lesson + `LessonsState` + DB `emulador-lessons` (J-1..J-4 como tests).
3. Nube: SQL `lessons` + ciclo LWW + extensión de `verify_session_rls.sql`.
4. Cómputo puro de escenas/waypoints + `sharpe` en `computeSessionStats`.
5. Journal: rutas, read models, secciones, visualizaciones V1, tablas (D16.E).
6. Cabina: timeline 5 nodos, escena congelada slim, formulario D16.G, enlace a
   reglas (escritura de `amendments`), flujo circular D16.F + botones del catálogo.
7. Cierre documental: TKM (§3.1/§3.2/§6 nota), DOMAIN_MODEL (J-invariantes),
   UBIQUITOUS_LANGUAGE (Lesson, evento de gestión, waypoint, Cabina, Journal),
   este RFC → Implementado; walkthrough.

## Riesgos y mitigaciones

- **R1 — Render de escena acoplado al workspace:** la instancia slim debe reusar
  mapper/engine sin arrastrar replay/effects; mitigación: paso 4 es puro y el paso
  6 monta el render tras un spike de integración documentado en el plan.
- **R2 — Bloat de evidencia:** tope por lección + size-guard; las escenas pesan
  parámetros, no píxeles (J-1).
- **R3 — Deriva interpretativa** (la tentación de "ayudar" con resúmenes):
  estructuralmente rechazada (N-6/J-2); el detector N-1 corre sobre todo esquema
  nuevo incluido SQL.
- **R4 — Colisión de teclado en la Cabina** (`1`–`5` waypoints vs `1`–`9` del
  Playbook): las superficies son rutas distintas — los hotkeys del Playbook viven
  en la página del emulador; la Cabina define su propio mapa (§5.2). Detector:
  grep de listeners por superficie en el plan.
- **R5 — Métricas D16.C malinterpretadas como conocimiento:** guardarraíles de la
  nota de supersesión + J-5; ninguna métrica cruza al tier permanente.

## Criterios de aceptación (Definition of Done)

1. Pasos 1-7 aterrizados con los cuatro gates en verde y `npm run build` limpio.
2. J-1..J-6 + cierre de P-7 implementados como tests o greps documentados.
3. Round-trips LWW de lessons (local ⇄ nube) + RLS verificada.
4. Ningún spec preexistente modificado (regla STOP; el fix D16.A va en rama propia
   con su propia autorización).
5. Flujo circular verificable en navegador: Journal → trade → Cabina → nodo MAE →
   escribir lección → vincular regla → Guardar y volver → `✎` visible → `amendments`
   poblado → purgar sesión → lección intacta y legible.
6. Checklist de verificación de `DESIGN_SYSTEM.md` §6.5 completo para Journal y
   Cabina (estados §3.2, `tabular-nums`, contraste §5.1, teclado §5.2,
   `prefers-reduced-motion`, jerarquía §1).
7. Documentación actualizada (TKM, DOMAIN_MODEL, UL, este RFC a Implementado).

## Referencias

- `DESIGN_SYSTEM.md` — §1 (bucle de aprendizaje, jerarquía), §2.1 (zonas), §2.3
  (densidades `compact`/`comfortable`), §3.2 (estados), §4.2-4.5 (visualizaciones y
  timeline), §5 (accesibilidad y teclado), §6 (gobernanza).
- [TRADER_KNOWLEDGE_MODEL.md](../TRADER_KNOWLEDGE_MODEL.md) — §2 (ontología, escenas), §4 (Cabina, botones del catálogo), §5 (Playbook/Lesson), §6 (métricas excluidas — ver nota de supersesión), §8 (N-1..N-6).
- [RFC-014_AND_BEYOND.md](../RFC-014_AND_BEYOND.md) — borrador RFC-016 (J-1..J-3 originales).
- [rfcs/015-playbook-adherencia-reglas.md](015-playbook-adherencia-reglas.md) — P-7 (`amendments` reservado), patrón LWW `playbook_rules`.
- [rfcs/014-simulacion-alta-fidelidad-telemetria.md](014-simulacion-alta-fidelidad-telemetria.md) — telemetría, MAE/MFE, `tMae`/`tMfe`.
- [DOMAIN_MODEL.md](../DOMAIN_MODEL.md) — cadena de identidad §3.1, I-11 (stats).
- `docs/engineering/domain/session-sync.md` — patrón LWW por fila.
