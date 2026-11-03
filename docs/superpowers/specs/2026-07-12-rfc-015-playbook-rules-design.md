# Especificación de diseño — RFC-015: Playbook y adherencia a reglas

| Campo | Valor |
| :--- | :--- |
| RFC normativo | `docs/architecture/rfcs/015-playbook-adherencia-reglas.md` |
| Fecha | 2026-07-12 |
| Plan derivado | `docs/superpowers/plans/2026-07-12-rfc-015-implementation-plan.md` |
| Estado | Diseño para revisión del owner |

Este documento fija el **cómo** técnico de las decisiones del RFC (G2, D15.A–E).
Idiomas: identificadores y comentarios de código en inglés; copy de UI en español.

---

## 1. Estado NgRx: `PlaybookState`

Nuevo feature slice `playbook` en `emulador/src/app/state/playbook/`:

```ts
// playbook.models.ts
export type PlaybookRuleStatus = 'active' | 'retired';

export interface PlaybookRule {
  id: string;                    // uuid (compatible con la pk de Supabase)
  title: string;
  /** Trader-authored free text. OPAQUE: no code path may parse or evaluate it (P-2). */
  statement: string;
  createdAt: number;             // epoch ms
  status: PlaybookRuleStatus;
  /** Hotkey slot 1..9; null = no shortcut. Unique among ACTIVE rules. */
  shortcutSlot: number | null;
  /** Manual order in the Dock list. */
  sortOrder: number;
  /** RESERVED for Fase 3 (RFC-016). Persisted empty; zero read sites (P-7). */
  amendments: string[];          // LessonRef ids
  /** Per-row LWW, SessionFolder pattern. Absent until first synced. */
  clientUpdatedAt?: number;
  syncedAt?: number;
}

export interface PlaybookState {
  rules: PlaybookRule[];
  /** Hydration finished from emulador-playbook (gate for hotkeys/UI). */
  loaded: boolean;
}
```

Notas de diseño:

- `createFeature` no admite propiedades opcionales en el estado del feature
  (restricción TS2769 verificada en RFC-014): todos los campos del estado son
  requeridos (`loaded: boolean`, `rules: []`). Los opcionales viven DENTRO de
  `PlaybookRule` (objetos planos, sin restricción).
- Acciones (`playbook.actions.ts`, `createActionGroup`):
  `hydrate` / `hydrated({ rules })` — carga inicial desde IndexedDB;
  `createRule({ title, statement })`, `updateRule({ id, title?, statement? })`,
  `setRuleStatus({ id, status })`, `assignSlot({ id, slot })` (slot tomado por otra
  regla activa ⇒ el reducer libera al anterior — un solo dueño por slot),
  `reorderRule({ id, sortOrder })`, `rulesSynced({ stamps })` (sella
  `clientUpdatedAt`/`syncedAt` tras push/pull).
- Selectores: `selectActiveRules` (status active, orden por `sortOrder`),
  `selectRuleBySlot` — mapa `slot → PlaybookRule` memoizado UNA vez sobre el array
  (prohibido el factory-selector por parámetro, D8).
- Reducer puro; ids con `crypto.randomUUID()` generados EN la acción-creadora del
  componente o en un effect (nunca en el reducer — pureza I-10 del patrón repo).

## 2. Persistencia local: DB dedicada `emulador-playbook`

Nuevo `emulador/src/app/services/playbook-db.service.ts` (patrón
`telemetry-db.service.ts`, decisión D15.B — no se toca el upgrade path de
`emulador-workspaces`):

- DB `emulador-playbook`, versión 1, un object store `rules` con `keyPath: 'id'`.
- API: `loadAll(): Promise<PlaybookRule[]>` · `upsert(rule)` · `upsertMany(rules)`
  · `remove(id)` (solo para reconciliación LWW pull; la UI NO borra reglas — las
  retira). Escrituras validadas con el `assertNoCandles` EXISTENTE (import real,
  jamás duplicado — P-6/N-5).
- Un effect `hydratePlaybook$` (en `playbook.effects.ts`) carga al arrancar la app
  (tras auth) y despacha `hydrated`; effects `persistRule$` (dispatch:false)
  escriben cada mutación del slice a IndexedDB (patrón sync-effects auditado).

## 3. Nube: tabla `playbook_rules` + RLS + LWW

SQL committeado en `supabase/playbook_rules.sql` (aplicación: MCP de Supabase o
dashboard del owner — se señala en el plan como paso de coordinación):

```sql
create table if not exists public.playbook_rules (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  statement text not null default '',
  status text not null default 'active' check (status in ('active', 'retired')),
  shortcut_slot smallint check (shortcut_slot between 1 and 9),
  sort_order integer not null default 0,
  amendments jsonb not null default '[]'::jsonb,   -- RESERVED (P-7)
  created_at timestamptz not null default now(),
  client_updated_at timestamptz not null
);

alter table public.playbook_rules enable row level security;

create policy "playbook_rules_owner_select" on public.playbook_rules
  for select using (auth.uid() = user_id);
create policy "playbook_rules_owner_insert" on public.playbook_rules
  for insert with check (auth.uid() = user_id);
create policy "playbook_rules_owner_update" on public.playbook_rules
  for update using (auth.uid() = user_id);
create policy "playbook_rules_owner_delete" on public.playbook_rules
  for delete using (auth.uid() = user_id);

-- Reuse the audited LWW guard (same trigger function as sessions/folders):
create trigger playbook_rules_lww before update on public.playbook_rules
  for each row execute function public.lww_guard();
```

- Ciclo push/pull por fila en `session-sync.service.ts` (o un
  `playbook-sync.service.ts` hermano si el tamaño lo justifica — decisión del
  implementador, documentada): `dirty ⇔ clientUpdatedAt > (syncedAt ?? 0)`,
  `upsert(..., { onConflict: 'id' })`, pull con merge LWW local — copiar el flujo
  de `folders` línea a línea funcional (PHILOSOPHY §2.5).
- Verificación RLS: extender el patrón `supabase/verify_session_rls.sql` con un
  bloque `playbook_rules` (dos `sub` simulados bajo rol `authenticated`).
- La pérdida de sync NO puede perder conocimiento: IndexedDB es la fuente local y
  el push es idempotente (P-3 protege el nivel local; LWW el remoto).

## 4. Declaración sobre el trade (`declaredRuleId`)

- `trading.models.ts`: `PendingOrder += declaredRuleId?: string | null`,
  `Position += declaredRuleId?`, `ClosedTrade += declaredRuleId?` — aditivos.
- `fill-engine.ts`: el fill copia `o.declaredRuleId ?? null` a la posición; los
  TRES constructores de cierre (`closeTrade` es el embudo único) sellan
  `declaredRuleId` en el `ClosedTrade`. Cambio mínimo: dos líneas de copia dentro
  de maquinaria existente; V-1 intacto (campo ausente = comportamiento idéntico).
- Nueva acción `TradingActions.tagTrade({ ruleId })` en el reducer:
  - Candidatos = órdenes pendientes + posiciones abiertas; objetivo = el de
    colocación más reciente (max `createdAt` / `openTime`; empate → posición).
  - Toggle: si el objetivo ya tiene `declaredRuleId === ruleId` ⇒ se limpia a null.
  - Sin candidatos ⇒ `return state` (identidad de referencia, no-op absoluto).
- Round-trip P-4: fold real (placeOrder → fill → SL) conserva el stamp de punta a
  punta; payload de sesión lo persiste dentro de los objetos existentes (test de
  ida y vuelta con `session-sync.mapping`).

## 5. Hotkeys sobre el gráfico (D15.D)

Nueva directiva standalone `emulador/src/app/state/playbook/playbook-hotkeys.directive.ts`
(o listener en la página del emulador — el plan fija la directiva, aplicada al host
del layout de gráficos):

```
@HostListener('window:keydown', ['$event'])
- ignora: event.repeat · modificadores (ctrl/meta/alt) · foco en
  input/textarea/select/[contenteditable] · diálogo abierto (document.querySelector('dialog[open]'))
- acepta: event.key ∈ '1'..'9'
- resuelve slot → regla activa (selectRuleBySlot); sin regla ⇒ no-op
- despacha TradingActions.tagTrade({ ruleId })
```

- Verificado en la exploración del RFC: los dígitos `1`–`9` no tienen hoy NINGÚN
  binding (grep de `key === '<d>'` / `Digit<d>` / `keydown.<d>` sin resultados y
  cero listeners de teclado a nivel de página) — namespace libre (riesgo R1 del
  RFC cerrado por evidencia).
- N-2 se hereda: el handler es un dispatch síncrono trivial; nada de trabajo
  pesado en el listener.

## 6. Tag en el gráfico (D15.E)

- El `ChartModelMapper` compone hoy los labels de órdenes/posiciones que cruzan la
  frontera como datos del `RenderModel`. Cambio: si la entidad tiene
  `declaredRuleId` y la regla existe con slot `s`, el texto del label se sufija
  con `[R{s}]` (si la regla no tiene slot: `[R]`; si el id cuelga —regla borrada
  por pull remoto—, sin sufijo: tolerancia a punteros colgantes).
- El mapper necesita el mapa `ruleId → slot`: entra como INPUT del mapeo por
  instancia (el mapper es per-panel con memoización local — D8 se respeta; nada de
  factory selectors compartidos).
- Al cerrar el trade la entidad desaparece del `RenderModel` ⇒ el tag desaparece
  solo (G2); el historial conserva `declaredRuleId`.
- El motor (`ChartEngine`) NO cambia: los labels ya son datos (invariante 1/2 del
  kernel).

## 7. Panel Playbook en el Dock lateral

Nuevo `emulador/src/app/components/playbook-panel/playbook-panel.component.{ts,html,css}`,
montado como sección del `side-dock` existente
(`components/side-dock/side-dock.component.*` — el plan incluye el paso de
integración exacto tras inspeccionar su API de secciones):

- Lista de reglas (título, slot como badge `R1`, estado); crear (título +
  statement en textarea); editar inline; asignar slot vía select `1`–`9` con
  liberación del dueño anterior; retirar/reactivar; exportar.
- Exportación: botón "Exportar playbook" descarga
  `playbook-YYYY-MM-DD.playbook.json`
  `{ version: 1, exportedAt, rules: PlaybookRule[] }` (patrón `.session.json`).
  Sin importación en esta fase (no-objetivo 6 del RFC).
- Copy en español, sobria; sin contadores ni porcentajes de declaración
  (no-objetivo 5). `tabular-nums` donde haya números.

## 8. Invariantes → detectores (mapa de tests)

| Invariante | Test/detector concreto |
| :--- | :--- |
| P-1 | Suite existente de colocación intacta + test nuevo: `placeOrder`/`openMarket` sin `declaredRuleId` producen entidades con el campo ausente/null y cero fricción |
| P-2 | Grep documentado: sitios de lectura de `.statement` = solo panel (display/edit) y export |
| P-3 | Test: sembrar reglas → purgar `emulador-workspaces` + `emulador-telemetry` (o sus stores) → `loadAll()` devuelve las reglas intactas |
| P-4 | Fold real orden→posición→cierre conserva el stamp; round-trip de payload |
| P-5 | Grep de vocabulario prohibido sobre `state/playbook/**`, `services/playbook-db*`, SQL |
| P-6 | Spec del servicio: batch con velas inyectadas ⇒ rechazo por `assertNoCandles` |
| P-7 | Grep: `amendments` sin sitios de lectura fuera de persistencia/export |
| D15.A | Specs del reducer: multi-activo → etiqueta el más reciente; toggle; no-op sin activos (identidad de referencia) |
| LWW | Round-trip push/pull con `client_updated_at` en conflicto (patrón folders) |
| RLS | Extensión de `verify_session_rls.sql` |

## 9. Riesgos técnicos residuales

- **Specs de mocks del fill context**: `declaredRuleId` es opcional en los tres
  modelos ⇒ los literales preexistentes siguen tipando (mismo razonamiento D14.A);
  verificar con `tsc` spec antes del primer commit.
- **`side-dock` API desconocida en detalle**: el plan abre con un paso de
  inspección; si el Dock no admite secciones nuevas de forma natural, el panel se
  monta como bloque adicional del propio dock (decisión documentada en el reporte
  de la tarea, jamás un refactor del dock de paso).
- **Orden de hidratación**: los hotkeys se gatean con `PlaybookState.loaded` para
  no despachar tags antes de conocer los slots.
