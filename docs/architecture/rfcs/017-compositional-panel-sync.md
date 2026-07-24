# RFC-017: Sincronización Composicional de Paneles y Composición de Capas

| Campo | Valor |
| :--- | :--- |
| **Estado** | Especificación formal — aprobada para implementación |
| **Fecha** | 2026-07-17 (diseño aprobado) · 2026-07-16 (formalización) |
| **Bloque** | Mastery Block — Fase 4 |
| **Documentos Rectores** | [TRADER_KNOWLEDGE_MODEL.md](../TRADER_KNOWLEDGE_MODEL.md), [DOMAIN_MODEL.md](../DOMAIN_MODEL.md), `DESIGN_SYSTEM.md` |
| **Especificaciones compañeras** | `docs/superpowers/specs/2026-07-16-rfc-017-compositional-panel-sync-design.md` (diseño técnico), `docs/superpowers/specs/2026-07-16-rfc-017-trade-visualization-concepts.md` (exploración visual) |
| **Decisiones** | D17.A – D17.L (registradas abajo) |

---

## 1. Filosofía de producto

> [!IMPORTANT]
> **Este emulador no es una plataforma de trading. Es un instrumento de práctica
> deliberada para desarrollar habilidad operativa. Toda decisión arquitectónica y
> de UI prioriza aprendizaje, claridad, fidelidad de replay y ergonomía cognitiva
> por encima de la paridad de features con software comercial.**

Los elementos visuales no son decorativos; son andamiaje cognitivo.

---

## 2. Invariantes arquitectónicos (Definition of Done)

1. **Cero copia implícita (No Merges):** los dibujos jamás se fusionan, clonan
   automáticamente ni cambian de propietario de forma implícita. No existe
   transición de estado que fusione dibujos.
2. **Renderizado composicional:** un panel renderiza superponiendo dinámicamente
   capas independientes que coinciden con su contexto local:
   `Render(panel) = DibujosLocales(panelId, symbol) + DibujosCompartidos(groupId, symbol)`.
3. **Resolución de contexto, no almacenamiento:** los LinkGroups no poseen,
   almacenan ni gestionan colecciones de dibujos. Un LinkGroup es estrictamente
   un resolutor de metadatos que mapea el enlace activo de un panel a un
   espacio de nombres compartido.
4. **Propiedad explícita de identidad:** cada dibujo tiene exactamente un
   propietario, modelado con la estructura de dominio `DrawingOwner`.

---

## 3. Modelo de dominio y propiedad

### 3.1 Esquema

```typescript
export interface DrawingOwner {
  type: 'panel' | 'group';
  id: string; // panelId o linkGroupId
}

export interface Drawing {
  id: string;
  symbol: string;
  owner: DrawingOwner;
  kind: DrawingType;
  p1: DrawingPoint;
  p2: DrawingPoint;
  zIndex: number;
  locked: boolean;
  visible: boolean;
}
```

### 3.2 Representación interna del store (D17.A, D17.B)

El agente implementador queda autorizado a optimizar la estructura interna del
store siempre que los campos de identidad de propiedad sigan siendo primarios.
La representación adoptada:

- **Mapa de entidades plano** (`entities: Record<id, Drawing>`) con TODOS los
  dibujos de la sesión (todos los símbolos, todos los propietarios). El cambio
  de símbolo pasa a ser un cambio de filtro puro, no un intercambio de slice.
- **Índice de propietario incremental** (`ownerIndex: Record<'panel:<id>' |
  'group:<id>', ids>`) mantenido por el reducer — la búsqueda O(1) exigida por
  §5 de rendimiento. La propiedad es inmutable tras la creación; no existe
  acción de transferencia.
- **Selección por panel** (`selection: Record<panelId, id | null>`): con N
  paneles editando una capa compartida, una selección global produce acción a
  distancia (borrar desde el panel B lo seleccionado en el panel A). D17.E.
- **Contadores runtime fuera de la entidad** (`revisions`, `history`,
  `clipboard`, `nextZ`): el esquema persistido queda exactamente como §3.1.

---

## 4. Pipeline de renderizado

Presupuesto: **16 ms/frame**. Ruta estricta de composición:

```
[Entity Store] ──► [Todos los dibujos]
        │
        ▼
[Selectores de slice crudos] ──► [ids = ownerIndex[panel] ∪ ownerIndex[grupo si syncDrawings]]
        │                         (composición DENTRO del ChartModelMapper por panel — D8)
        ▼
[Capa de composición] ──► [Filtro por símbolo + orden plano por zIndex]
        │
        ▼
[Filtro de visibilidad] ──► [visible global + toggle local de capa compartida]
        │
        ▼
[Filtro de viewport] ──► [poda render-side de elementos fuera de pantalla]
        │
        ▼
[Motor de render] ──► [Pintado en canvas]
```

El diagrama Mermaid normativo del pipeline (con los tokens de código reales)
vive en la especificación técnica compañera §4; los briefs de implementación
lo referencian como contrato.

### Restricciones de rendimiento

- **Cero asignaciones en el camino sin cambios:** la memoización por instancia
  de mapper se clava en las REFERENCIAS de entrada; referencias idénticas
  devuelven la lista compuesta previa por referencia. Solo un cambio real
  asigna memoria — nunca un tick de replay ni un frame.
- **Composición memoizada:** prohibido el factory-selector compartido
  parametrizado por panel (ban D8 del kernel); la derivación por panel vive en
  la instancia local de `ChartModelMapper`.
- **Búsquedas O(1) de propietario:** vía `ownerIndex`, nunca escaneando la
  colección.
- **La poda de viewport permanece render-side** (en la primitiva): pan/zoom
  cambia coordenadas sin emisión del store.

---

## 5. Canales de sincronización (D17.K: dos familias)

Los canales se dividen en dos familias mecánicamente distintas:

| Familia | Canales | Mecanismo |
| :--- | :--- | :--- |
| **Eventos** | `syncCrosshair`, `syncTimeRange` | `ChartSyncBus` → `ChartSyncRouter` (exclusión de origen + aplicación idempotente). Sin cambios en este RFC. |
| **Composición** | `syncDrawings`, `syncTrades` | Estado compartido por construcción: dos paneles que resuelven el mismo grupo componen la misma capa desde el mismo snapshot del store. Nada viaja por el bus; no existe eco que suprimir. |

Esto mantiene honesto el Invariante 3: el grupo resuelve un espacio de nombres
(`group:<id>` en el índice); jamás almacena ni reenvía datos de dibujo.

`LinkGroup` incorpora dos flags reales (`syncDrawings`, `syncTrades`);
`syncPriceScale` (R3) permanece reservado y sin sitios de lectura.

**Defaults (principio de preservación de comportamiento en migración):**

| Flag | Grupo migrado de V2 | Grupo nuevo |
| :--- | :--- | :--- |
| `syncDrawings` | `false` (en V2 ningún grupo compartía dibujos) | `true` |
| `syncTrades` | `true` (el overlay era siempre-visible) | `true` |

### 5.1 Gating de la capa de trades

La capa de trades se renderiza en un panel si y solo si
`panel.symbol === primarySymbol` (libro mono-símbolo, D1 — esto elimina el
overlay fantasma sobre paneles de otro símbolo, corrección declarada) **y**
(panel sin grupo **o** `syncTrades` del grupo activo). `syncTrades` es un
resolutor de visibilidad, no un canal de datos.

**Paneles secundarios de observación (multi-símbolo de solo-vista).** El libro
mono-símbolo (D1) restringe la *operación*, no la *observación*. En un layout de
varios paneles, un panel secundario puede seleccionar **cualquier activo ya
descargado** (p. ej. NASDAQ mientras `primarySymbol` = US30) para lectura de la
acción del precio y **trazado de dibujos** (locales o compartidos, filtrados por
`Drawing.symbol`, §3–§4). En esos paneles la capa de trades se **apaga
dinámicamente** por el predicado de arriba: son **charts de referencia read-only
respecto a trades**, pero 100 % funcionales para análisis técnico y herramientas
de dibujo. No existe colocación/gestión de órdenes en un panel cuyo símbolo ≠
`primarySymbol`; el trading **multi-símbolo operable** sigue siendo un no-goal
congelado (008-012), y esta cláusula no lo reabre.

---

## 6. Capa de Visualización de Trades (dirección visual)

> **Nota de supersesión (2026-07-22).** La *dirección visual* de esta sección
> (Concepto A «Ghost Rails», zonas rectangulares, marcadores triángulo/diamante,
> chip HUD en esquina, path coloreado por resultado) queda **superseded por TEDS**
> (`TEDS_GRAMMAR.md` §10; render normado en `docs/architecture/TEDS_INTERACTION.md`
> + `docs/architecture/TEDS_MOTION.md`). Lo único que **sobrevive** de aquí es el
> *predicado de gating* de §5.1 (`panel.symbol === primarySymbol` ∧ visibilidad
> `syncTrades`) — el contrato de *dónde* se pintan los trades. Su implementación
> migra al plan TEDS (`docs/superpowers/specs/2026-07-TEDS-implementation-plan.md`),
> no a este run de RFC-017; por eso las **Tasks 7–8 quedan fuera de alcance**. El
> texto de abajo se conserva como registro histórico de la exploración.

La exploración obligatoria de tres conceptos (A «Ghost Rails», B «Command
HUD», C «Path Narrative») con su evaluación contra legibilidad/carga
cognitiva, usabilidad en replay y jerarquía frente a velas está en la
especificación visual compañera. **Dirección seleccionada: Concepto A (Ghost
Rails)** — geometría acotada al span temporal del trade — con dos adopciones:
el label de posición como chip HUD acoplado (de B) y los ticks MAE/MFE sobre
el path del trade cerrado (de C, hechos ya de dominio por RFC-014 §3).

Elementos normativos (tokens completos e estados interactivos en la spec
visual §6, a registrar en `DESIGN_SYSTEM.md`):

- **Zonas riesgo/beneficio:** rectángulos del bar de entrada al cursor/salida;
  relleno `--up`/`--down` al 8 %, borde 1px al 32 %. Sin gradientes.
- **Raíles:** entrada/SL/TP como segmentos horizontales acotados al span del
  trade (se retiran las price-lines de ancho completo, anti-referencia MT).
- **Marcadores:** triángulos 8px en fills, diamante en salidas, contorno `--bg`.
- **Path del trade (cerrados):** línea discontinua entrada→salida coloreada por
  resultado R, con ticks MAE/MFE.
- **Chip HUD de posición:** widget DOM mínimo (lado, lotes, P/L flotante en R y
  divisa, `tabular-nums`) sobre `--surface-2`, esquina del panel.

---

## 7. Reglas operativas de dibujos

- **Borrado:** borrar un dibujo compartido lo elimina del contexto del grupo y
  actualiza todos los paneles miembro en la misma emisión. Borrar un dibujo
  local afecta solo al panel propietario.
- **Visibilidad:**
  - *Global (`Drawing.visible`):* un flag en la entidad, honrado por todos los
    paneles que componen.
  - *Local (toggle de capa del panel, D17.H):* `hideSharedDrawings` opcional en
    `PanelDescriptor` (persistido); oculta la capa compartida solo en ese panel.
- **Cambio de grupo:** solo cambia `panel.linkGroupId`; la composición
  re-resuelve. Cero movimiento de datos, cero copias.
- **Cambio de símbolo:** solo cambia el filtro; los dibujos del símbolo
  anterior permanecen almacenados y ocultos por composición.
- **Borrado de grupo (D17.L):** cascada explícita y atómica — `removeGroup`
  elimina también los dibujos poseídos por el grupo (su espacio de nombres
  muere con él) además del desenlace de paneles ya existente. La reasignación
  automática queda rechazada: sería exactamente la mutación implícita de
  propiedad que el Invariante 1 prohíbe. La UI debe declararlo («Eliminar
  grupo y sus dibujos compartidos»).

---

## 8. Reglas de interacción de usuario

### 8.1 Undo / Redo (D17.F)

Pilas de comandos **por panel** (add/move/delete de dibujos; los toggles de
metadatos, el trading y el layout no son deshacibles). Resolución de
conflictos determinista por **guardia de revisión con descarte de comandos
obsoletos**:

- Cada mutación aplicada incrementa `revisions[id]` y sella `resultRev` en su
  comando.
- `undo(panelId)` aplica el comando solo si `revisions[id] === resultRev` (el
  panel hizo el ÚLTIMO cambio a ese dibujo) y el dibujo no está `locked`; un
  comando obsoleto se DESCARTA y el pop continúa al siguiente.
- El resultado depende exclusivamente de la secuencia totalmente ordenada de
  mutaciones del reducer — nunca del timing. El panel que mutó último puede
  deshacer; el otro descarta sus entradas al tocarlas. Sin merge, sin
  clobber: es estructuralmente imposible que un undo pise la edición de otro
  contexto. Tabla completa de fallos-límite en la spec técnica §5.
- Teclado: Ctrl+Z / Ctrl+Y los captura el panel enfocado.

### 8.2 Portapapeles (D17.G)

- Copiar captura geometría y tipo — nunca identidad, propiedad, lock ni
  visibilidad.
- Pegar CREA un dibujo nuevo (id y zIndex frescos) bajo el símbolo del panel
  destino y **el owner que resuelve la capa objetivo activa del panel destino**
  (la misma regla de resolución que dibujar a mano: grupo si
  `linkGroupId + syncDrawings`, panel en caso contrario). Regla única para
  toda creación → predecible; y pegar una copia editable de una forma
  bloqueada es la vía de escape explícita del usuario (el Invariante 1
  prohíbe la copia IMPLÍCITA, no la iniciada por el trader).

### 8.3 Semántica de lock

`locked: true` hace el dibujo inmodificable desde TODOS los paneles del grupo
(rechazo en reducer con retorno por identidad, mismo idioma que I-14).
Cualquier panel puede desbloquearlo. El lock también congela la aplicación de
undo sobre ese dibujo.

### 8.4 zIndex

Orden plano ascendente a través de las capas compuestas, con contador único
`nextZ` (sembrado de `max(zIndex)+1` al hidratar). Sin offsets de apilado por
capa.

---

## 9. Auto-revisión arquitectónica (ejecutada, veredicto)

La validación obligatoria previa a implementación se ejecutó el 2026-07-16
(spec técnica §9): transiciones rápidas de grupo (ninguna emisión intermedia
puede pintarse — derivación pura post-reducer), grupo colgante (capa
compartida vacía, sin throw), deriva selección/composición (validación en
ambos lados), presupuesto de rendimiento re-verificado, ciclo de routing sin
superficie nueva de feedback.

**Veredicto de la regla de parada: ningún invariante arquitectónico requiere
cambio → PROCEDER.** El núcleo del motor no se modifica (evolucionan las
primitivas de capacidades existentes); D8 respetado; payload candle-free;
non-goals congelados de 008-012 intactos (`syncPriceScale` sigue reservado;
sesión mono-símbolo preservada; dibujos session-scoped).

---

## 10. Migración desde el RFC anterior (D17.J)

- **Versión de esquema:** `2` → `3`. `SessionPayloadV3` preserva V2 verbatim
  salvo `drawings`, que pasa de `Record<symbol, DrawingCollection>` a un
  conjunto plano etiquetado por owner: `{ version: 2, items: Drawing[] }`.
  Mismo ciclo LWW atómico (D9), mismo `assertNoCandles`.
- **Migración de payloads V2:** cada dibujo recibe su `symbol` de la clave del
  record, `zIndex` por posición (orden de pintado preservado),
  `locked: false`, `visible: true`, y
  `owner = { type: 'panel', id: primer panel en orden de layout cuyo símbolo
  coincide; fallback = primer panel del layout }`. Para sesiones V2 de panel
  único esto se reduce exactamente a la regla aprobada (`panel-1`); para
  multi-panel preserva lo que el trader veía (asignarlo todo literalmente al
  panel primario migraría a invisibilidad los dibujos de símbolos mostrados
  por otro panel). Limitación residual declarada: si varios paneles V2
  mostraban el mismo símbolo, tras migrar solo el primero los muestra — la
  duplicación la prohíbe el Invariante 1; compartir vía grupo es el camino
  hacia delante.
- **V1 encadena V1→V2→V3** dentro de `parseSessionPayload`; los payloads
  malformados conservan el fallback defensivo de panel único.
- **IndexedDB:** la misma migración de forma se aplica a
  `Workspace.drawings` en lectura (shape-guard, parse-don't-trust). Sin bump
  de `DB_VERSION` ni object store nuevo.

---

## 11. Decisiones registradas

| Id | Decisión |
| :--- | :--- |
| D17.A | Store de entidades plano con TODOS los dibujos de la sesión; el símbolo es filtro, no slice. |
| D17.B | `ownerIndex` incremental (`panel:<id>` / `group:<id>`) como búsqueda O(1); propiedad inmutable post-creación. |
| D17.C | Composición por panel dentro de la instancia local de `ChartModelMapper` (ban D8 intacto); selectores de store sin parámetros. |
| D17.D | Resolución de destino de creación única (`resolveDrawingTarget`): grupo si `linkGroupId + syncDrawings`, panel en caso contrario — para dibujar Y pegar. |
| D17.E | Selección por panel; seleccionar en un panel roba la selección de ese dibujo a los demás. |
| D17.F | Undo/redo por panel con guardia de revisión y descarte de obsoletos (determinismo por orden total del reducer). |
| D17.G | Portapapeles: copiar geometría; pegar es creación (id nuevo, owner por D17.D). Runtime-only, un slot. |
| D17.H | `hideSharedDrawings?: boolean` opcional en `PanelDescriptor` (persistido, aditivo). |
| D17.I | Defaults de flags: migración preserva comportamiento (`syncDrawings:false`, `syncTrades:true`); grupos nuevos comparten (`true`/`true`). |
| D17.J | `SessionPayloadV3` + migración V2→V3 con owner = primer panel cuyo símbolo coincide (fallback primer panel). |
| D17.K | Dos familias de sincronización: eventos (bus/router) y composición (store). Dibujos y trades JAMÁS viajan por el bus. |
| D17.L | Borrar un grupo borra en cascada sus dibujos poseídos (atómico, declarado en UI); reasignación automática prohibida. |

---

## 12. No-goals de este RFC

- Simulación de broker (cierres parciales, scale in/out, guías de breakeven).
- Sincronización remota multi-usuario.
- Rediseño del motor de replay o del fill engine.
- Reescritura del layout global del chart engine.
- Compartición de dibujos entre sesiones (siguen session-scoped, decisión
  congelada de 008-012).
- Operaciones de reordenado de zIndex (traer al frente / enviar al fondo).
