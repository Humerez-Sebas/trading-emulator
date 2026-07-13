# RFC 015: Playbook y Dominio de Adherencia a Reglas

| Campo | Valor |
| :--- | :--- |
| Estado | Implementado (2026-07-13) |
| Fecha | 2026-07-12 |
| Bloque | Mastery Block — Fase 2 ([ROADMAP.md](../ROADMAP.md)) |
| Rama de implementación | `feature/rfc-015-playbook-adherencia` → PR a `develop` |
| Dependencias | RFC-014 (entregado — PR #37: hechos reificados recomendados, no estrictamente requeridos); [TRADER_KNOWLEDGE_MODEL.md](../TRADER_KNOWLEDGE_MODEL.md) §5.1 |
| Documentos rectores | [TRADER_KNOWLEDGE_MODEL.md](../TRADER_KNOWLEDGE_MODEL.md) (S1/S2, N-1..N-6, §2.2 asimetría de conservación), [DOMAIN_MODEL.md](../DOMAIN_MODEL.md) (cadena de identidad §3.1), [PRODUCT_PRINCIPLES.md](../PRODUCT_PRINCIPLES.md), [RFC-014_AND_BEYOND.md](../RFC-014_AND_BEYOND.md) (borrador abstracto, revisión 2) |
| Artefactos derivados | Spec de diseño: `docs/superpowers/specs/2026-07-12-rfc-015-playbook-rules-design.md` · Plan: `docs/superpowers/plans/2026-07-12-rfc-015-implementation-plan.md` |

## Objetivo

Dar al conjunto de reglas que el trader entrena un **hogar durable, opaco y de
máxima ceremonia de conservación** (el Playbook), y permitir atribuir cada trade a
la regla que estaba entrenando con **cero fricción y cero juicio del sistema**:
un atajo de teclado (`1`–`9`) etiqueta la orden o posición activa después de
colocarla. La declaración es un hecho registrado; la adherencia, su calidad y su
significado pertenecen exclusivamente a la revisión fría del trader (S1).

La práctica deliberada entrena *reglas declaradas*, no intuiciones: sin este
dominio, el bucle de enmienda (Fase 3, RFC-016) no tiene sobre qué enmendar.

## Motivación

1. **La estrategia vive fuera del sistema.** Hoy las reglas del trader existen solo
   en su cabeza o en notas externas; ningún trade es atribuible a la regla que
   entrenaba. El Playbook les da identidad durable sin capturar su semántica.
2. **Asimetría de conservación (TKM §2.2).** El Playbook es el único nivel cuya
   pérdida es catastrófica ("el producto de meses de práctica"): exige la ceremonia
   máxima — filas propias con LWW, aislamiento RLS por usuario, exportación, y
   supervivencia a cualquier borrado de sesiones o telemetría (N-4).
3. **Procedencia ya decidida.** La decisión G2 del Grill del 2026-07-10 (registrada
   en el RFC-014 por procedencia) fija el flujo de etiquetado post-colocación; este
   RFC la implementa.

## Decisiones de alineación

| Id | Decisión | Racional |
| :--- | :--- | :--- |
| G2 (heredada, RFC-014) | **Etiquetado post-colocación.** El trader ejecuta primero y coloca SL/TP; después, con una orden o posición ACTIVA, el atajo (`1`–`9`) etiqueta el trade con un `declaredRuleId` opaco. El tag (`[R1]`) se renderiza pegado al label de la posición/orden en el gráfico y desaparece al cierre (el hecho persiste en el registro por la cadena de identidad). Atajos sin trades activos no hacen nada. Opcional, jamás solicitado, corregible en revisión fría. | Cero fricción (S2): el etiquetado nunca precede ni bloquea la ejecución. |
| D15.A | **Objetivo del atajo = el trade activo más reciente.** Con varias órdenes/posiciones activas, el atajo etiqueta la de colocación más reciente (mayor `createdAt`/`openTime`); re-pulsar otro atajo re-etiqueta (sobrescribe); el mismo atajo dos veces des-etiqueta (toggle). | Regla determinista y predecible sin UI de selección (S2); la corrección fina pertenece a la revisión fría. |
| D15.B | **DB IndexedDB dedicada `emulador-playbook`.** No se toca el upgrade path de `emulador-workspaces`. | Lección pagada del RFC-014: unirse a la DB compartida rompe specs STOP-protegidos que fijan su conteo de stores; una DB dedicada aísla versionado y ciclo de vida. |
| D15.C | **Tabla Supabase `playbook_rules` con RLS por usuario y LWW por fila** (patrón `folders`, ya auditado: trigger `lww_guard` + aislamiento por `user_id`). | Reutilizar maquinaria auditada (PHILOSOPHY §2.5); la capa DB es la única que puede garantizar LWW (§4.3). |
| D15.D | **Atajos como slots del Playbook, no keybindings genéricos.** Cada regla puede ocupar un slot `1`–`9` (campo `shortcutSlot`, editable en el panel del Dock); el listener vive sobre el gráfico de velas y solo actúa con foco fuera de inputs. Verificado: los dígitos `1`–`9` no tienen hoy ningún binding en la app (namespace libre). | Resuelve el riesgo de colisiones del borrador con un namespace reservado; la asignación junto al gráfico evita un modal de settings (TKM §5.1). |
| D15.E | **El tag en el gráfico se compone en el mapper.** `[R{slot}]` se añade al texto del label existente de la orden/posición en `ChartModelMapper`; ninguna capability nueva, el motor no cambia. | Invariante 2 del kernel (núcleo cerrado); los labels ya cruzan la frontera como datos del `RenderModel`. |

## Especificación

### 1. El agregado Playbook

```
Playbook     := { rules: PlaybookRule[] }                  // uno por trader
PlaybookRule := { id, title, statement,                    // texto del trader, OPACO
                  createdAt, status: 'active' | 'retired',
                  shortcutSlot: 1..9 | null,               // slot de atajo (único por regla activa)
                  sortOrder,
                  amendments: LessonRef[],                 // RESERVADO Fase 3 (cero sitios de lectura)
                  clientUpdatedAt?, syncedAt? }            // LWW por fila (patrón SessionFolder)
```

- **Opacidad (P-2):** el sistema jamás parsea, valida ni evalúa `statement`; solo
  lo muestra y lo edita. Neutralidad de estrategia (UBIQUITOUS_LANGUAGE §1).
- **`amendments` es un punto de extensión reservado** (PHILOSOPHY §2.6): se
  persiste vacío y ningún código lo lee hasta el RFC-016; la auditoría verifica
  cero sitios de lectura.
- Retirar una regla (`status: 'retired'`) no borra nada ni rompe trades que la
  declararon (tolerancia a punteros colgantes).

### 2. Declaración sobre el trade

- `declaredRuleId?: string | null` — campo aditivo y retrocompatible en
  `PendingOrder`, `Position` y `ClosedTrade`; viaja por la cadena de identidad
  existente (orden → posición → trade cerrado) sin código nuevo de copia más allá
  del punto de fill y del sellado al cierre.
- La declaración es **un hecho, jamás un score**: se registra *que* se declaró una
  regla; ningún indicador de cumplimiento, porcentaje de adherencia ni racha.
- El trade sin declarar es ciudadano de primera clase (P-1): ningún camino de
  colocación exige declaración.

### 3. Etiquetado por atajo (flujo G2 + D15.A)

1. Listener de teclado sobre el gráfico de velas (página del emulador): dígitos
   `1`–`9`, sin modificadores, ignorado si el foco está en un input/textarea o si
   hay un diálogo abierto.
2. El dígito resuelve la regla activa con ese `shortcutSlot`; si no existe, no-op.
3. Si hay órdenes/posiciones activas: etiqueta la más reciente (D15.A); toggle si
   ya tenía esa misma regla. Si no hay trades activos: no-op absoluto (sin toast,
   sin feedback — S2).
4. El tag `[R{slot}]` aparece pegado al label del trade en el gráfico (D15.E) y
   desaparece al cierre; `ClosedTrade.declaredRuleId` conserva el hecho.

### 4. Persistencia y sincronización

- **Local:** DB IndexedDB dedicada `emulador-playbook`, store `rules` (clave `id`),
  candle-free por construcción (`assertNoCandles` reutilizado — N-5). El Playbook
  vive FUERA de `SessionPayloadV2` (D9 intacto) y fuera de los workspaces.
- **Nube:** tabla `playbook_rules` (una fila por regla, `user_id` = dueño), RLS de
  aislamiento por usuario y trigger `lww_guard` idéntico al de `folders`; ciclo
  push/pull por fila con `clientUpdatedAt`/`syncedAt` (patrón `SessionFolder`).
- **Exportación:** descarga `.playbook.json` desde el panel (formato versionado);
  la importación queda para la Fase 3 junto a los flujos de restauración.
- **Supervivencia (P-3/N-4):** borrar sesiones, workspaces o telemetría no toca el
  Playbook; test de ida y vuelta de borrado como detector.

### 5. UI (panel del Dock)

- El Dock lateral (`side-dock`) gana la sección **Playbook**: listar reglas
  (título + slot + estado), crear, editar `title`/`statement`, asignar/liberar
  slot `1`–`9` (conflicto de slot = liberar al anterior), retirar/reactivar,
  exportar. Copy en español, sobria (PRODUCT.md: terminal enfocada).
- Ningún número derivado de las declaraciones se muestra en esta fase (ver
  no-objetivos).

## Modelo de datos (cambios aditivos, sin migraciones destructivas)

- `PlaybookRule` (nuevo, dominio Playbook) + `PlaybookState` NgRx (detalle en la
  spec de diseño).
- `PendingOrder += declaredRuleId?` · `Position += declaredRuleId?` ·
  `ClosedTrade += declaredRuleId?` (opcionales; ausentes = sin declaración).
- Payload de sesión: sin cambios de forma (los campos opcionales viajan dentro de
  los objetos existentes; round-trip tests obligatorios).
- SQL nuevo: `playbook_rules` + RLS + `lww_guard` (archivo en `supabase/`).

## No-objetivos

1. **Sin motor de reglas:** el sistema jamás comprueba si el trade "siguió" la
   regla (P-2).
2. **Sin etiquetado obligatorio** ni prompts: el trade sin declarar es válido.
3. **Sin semántica de estrategia** en los esquemas: la regla es texto libre opaco.
4. **Sin UI de enmiendas** (Fase 3); `amendments` queda reservado sin lectores.
5. **Sin métricas de declaración en UI** (ni "Rule Adherence Rate" agregada): el
   borrador de Fase 2 excluye todo porcentaje/indicador; la eventual superficie de
   la tasa de declaración —listada como métrica física en TKM §6— pertenece a la
   Fase 3 y deberá reconciliarse allí con la doctrina "hecho, nunca score".
6. **Sin importación** de `.playbook.json` (Fase 3) y sin edición multi-dispositivo
   simultánea más allá de lo que LWW por fila ya garantiza.
7. **Sin teclas configurables globales:** los slots `1`–`9` son el único namespace
   de atajos del Playbook en esta fase.

## Invariantes y detectores

| Id | Invariante | Detector |
| :--- | :--- | :--- |
| P-1 | La declaración es opcional en TODO camino de colocación | Suite de tests de colocación sin `declaredRuleId` (openMarket/placeOrder/fills) intacta y verde |
| P-2 | El contenido de la regla es opaco: ningún código lee `statement` salvo mostrar/editar | Grep: cero parsers/matchers sobre el texto; sitios de lectura de `statement` enumerados y auditados |
| P-3 | El Playbook sobrevive a todo borrado de sesiones/telemetría | Test de ida y vuelta: purgar sesiones + telemetría → reglas intactas en `emulador-playbook` |
| P-4 | Cadena de identidad: el `declaredRuleId` sellado en orden viaja a posición y a trade cerrado sin pérdida | Round-trip por el motor real (fold → fill → cierre) |
| P-5 | N-1 sobre los esquemas nuevos: cero vocabulario interpretativo | Grep de vocabulario prohibido sobre `state/playbook/**` y SQL |
| P-6 | N-5: el store nuevo es candle-free | `assertNoCandles` en cada escritura del servicio de DB |
| P-7 | `amendments` reservado: cero sitios de lectura en producción | Grep en auditoría final (patrón `syncPriceScale`) |

## Plan de aterrizaje incremental (cada paso compila y testea en verde)

1. Dominio puro + estado: `PlaybookRule`, `PlaybookState`, reducer/selectors,
   `declaredRuleId` aditivo en los tres modelos de trading (P-1, P-4).
2. Persistencia local: DB `emulador-playbook` + servicio append/update candle-free
   (P-3, P-6).
3. Sincronización: SQL `playbook_rules` (RLS + lww_guard) + ciclo push/pull por
   fila (patrón folders) + round-trips LWW.
4. Etiquetado: acción de tag + listener de dígitos sobre el gráfico + composición
   del tag `[R{slot}]` en el mapper (G2, D15.A, D15.E).
5. UI del Dock: panel Playbook (CRUD + slots + exportación `.playbook.json`).
6. Cierre documental: DOMAIN_MODEL (§ nuevos P-invariantes), UBIQUITOUS_LANGUAGE,
   estado del RFC.

## Riesgos y mitigaciones

- **R1 — Colisión de atajos:** namespace `1`–`9` verificado libre hoy; el detector
  es un grep de bindings de dígitos en el plan y la exclusión por foco en inputs.
- **R2 — Deriva hacia semántica de reglas** (plantillas, categorías, validación):
  rechazada estructuralmente por P-2; cualquier evolución exige RFC propio.
- **R3 — Pérdida del Playbook:** ceremonia máxima (LWW + RLS + export + P-3);
  la fila es pequeña y append-mostly, el riesgo residual es bajo.
- **R4 — Ambigüedad de objetivo con varios trades activos:** resuelta por D15.A
  (determinista); si la práctica demuestra fricción, un selector visual es
  evolución de Fase 3, no de esta.
- **R5 — Tocar la ruta del dinero:** el único contacto es el campo opcional
  `declaredRuleId` y su sellado; el ancla es la suite del RFC-014 (1278 tests)
  intacta más los round-trips P-4.

## Criterios de aceptación (Definition of Done)

1. Los seis pasos aterrizados con los cuatro gates en verde (`tsc` app+spec,
   `ng test`, `lint`) y `npm run build` limpio al cierre de la rama.
2. P-1..P-7 implementados como tests o greps documentados con salida fresca.
3. Round-trip completo de identidad (P-4) y de LWW (local ⇄ nube) en verde;
   verificación RLS extendida a `playbook_rules` (patrón
   `supabase/verify_session_rls.sql`).
4. Ningún spec preexistente modificado (regla STOP; sin excepciones previstas).
5. Etiquetado extremo a extremo verificable en navegador: atajo → tag visible en
   el label → cierre → tag desaparece → `declaredRuleId` en el historial.
6. Documentación actualizada (DOMAIN_MODEL, UBIQUITOUS_LANGUAGE, este RFC a
   Implementado) + walkthrough de cierre.

## Desviaciones registradas

Sin desviaciones del spec original. Los seis pasos del plan de aterrizaje se
implementaron conforme a la especificación; P-1..P-7 tienen detectores ejecutables
o greps documentados en el informe de cierre (`.superpowers/sdd/task-7-report.md`).

## Referencias

- [TRADER_KNOWLEDGE_MODEL.md](../TRADER_KNOWLEDGE_MODEL.md) — §5.1 (Playbook), §2.2 (asimetría de conservación), S1/S2, N-1..N-6.
- [RFC-014_AND_BEYOND.md](../RFC-014_AND_BEYOND.md) — borrador RFC-015 (revisión 2), invariantes P-1..P-3 originales.
- [rfcs/014-simulacion-alta-fidelidad-telemetria.md](014-simulacion-alta-fidelidad-telemetria.md) — decisión G2 (procedencia) y lecciones D14.B/D14.F.
- [DOMAIN_MODEL.md](../DOMAIN_MODEL.md) — cadena de identidad §3.1, I-13 (persistencia).
- `docs/engineering/domain/session-sync.md` — patrón LWW por fila (`folders`).
- Spec de diseño y plan de implementación (ver cabecera).
