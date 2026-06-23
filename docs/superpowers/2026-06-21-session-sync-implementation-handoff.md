# Phase 2 — Session Sync — Implementation Handoff

This file is a **paste-ready prompt** for a brand-new implementation session. The architecture
is **finalized**; there is **no further design work**. Copy the block below into a fresh Claude
Code session opened in this repo.

---

```
Implementa la Fase 2 (sincronización de sesiones) del Trading Emulator. La arquitectura está
FINALIZADA — esto es SOLO implementación, sin rediseño.

## Qué es
Trading Emulator v2 — PWA Angular 21 + NgRx. Fase 1 (auth Supabase, invite-only) ya está en
`main`. Fase 2 añade una capa de sync local-first que sube SESIONES y CARPETAS de backtest a
Supabase Postgres + RLS (datos de usuario únicamente). Los datasets/velas viven SOLO en R2 +
IndexedDB y NUNCA tocan Supabase. El pipeline MT5→R2 no se toca.

## Skill de ejecución
Usa superpowers:subagent-driven-development: pre-flight scan del plan, por tarea
implementer→review-package→task reviewer→fix loop→commit, GATES DE CI antes de cada commit,
browser-validation en las tareas marcadas, review whole-branch final, y
superpowers:finishing-a-development-branch (push + PR a main). Pide merge al humano al terminar.

## Rama (NO re-derivar)
- Usa la rama **`claude/supabase-session-sync`** (ya creada desde `origin/main` @ 7121f01; los 3
  documentos de planificación ya están commiteados en ella). Continúa en ESA rama; una PR por la
  fase al final.
- `git fetch origin && git checkout claude/supabase-session-sync`. Si la rama no existe en tu
  entorno, créala desde origin/main e incorpora los docs de planificación de abajo.
- Plataforma: Windows. Shell: PowerShell + Bash. La cwd puede revertirse entre llamadas → usa
  rutas absolutas / `cd` explícito por comando. Comandos del emulador desde `emulador/`.

## Documentos (LEE PRIMERO, en esta rama)
- SPEC / arquitectura (el porqué + decisiones D1–D4 + ajustes 1–10):
  `docs/superpowers/specs/2026-06-21-supabase-session-sync-design.md`
- PLAN (ejecútalo tarea por tarea, TDD): `docs/superpowers/plans/2026-06-21-supabase-session-sync.md`
- Referencia Fase-1 (auth, hecha) + decisiones de dominio validadas:
  `docs/superpowers/specs/2026-06-20-supabase-auth-session-sync-design.md`

## Supabase (proyecto ya provisionado)
- Proyecto `trading-emulator`, ref `nfcgfrsxvdvuasbgrxdy`, us-east-2, ACTIVE_HEALTHY. URL + anon
  key ya en `environment*.ts`.
- Las tablas base `sessions`/`folders` + RLS YA EXISTEN (migración `create_sessions_and_folders`).
  La **Tarea 1 del plan** las ALTERa (client_updated_at, last_opened_at, required_datasets,
  folders LWW + trigger) vía Supabase MCP `apply_migration`. Verifica con `list_tables` +
  `get_advisors` (security). El service-role key NUNCA va al cliente.

## Constraints globales (del plan §"Global Constraints")
- Angular 21 standalone + signals + NgRx; texto de usuario en español; imita archivos vecinos.
  Estado y candle.time en segundos UNIX.
- Local-first: IndexedDB es el working copy; cada mutación escribe IndexedDB primero, el sync es
  aditivo y nunca bloquea la UI. Logout = guest local, sin sync.
- Boundary duro (validado en código): Supabase NUNCA almacena velas/parquet/datasets/OHLC/series.
  `assertNoCandles` antes de cada upsert y export.
- LWW por `client_updated_at` (hora de edición del cliente), NO `updated_at` del servidor.
- Membership cloud-authoritative (D1); catch-up offline con dirty + pending-deletes (D2); solo
  sesiones reales sincronizan (D3); activa = última trabajada (D4).
- Guard de tamaño de payload: warn ≥ 512 KB, reject > 2 MB.
- Cursor: NUNCA pushear por tick — debounce + flush en pausa/switch/close.
- NO añadas dependencias npm. NO corras `npm install`. Si el lockfile cambia espuriamente,
  restáuralo (`git checkout -- emulador/package-lock.json`). Si alguna vez añades una dep real,
  verifica con `npm ci --dry-run` antes de commitear (npm 11.x poda entradas optional-dep del
  lock → CI `npm ci` falla aunque build/test locales pasen).

## Comandos canónicos (desde emulador/)
- Tests: `npx ng test --no-watch`. Specs puras: `npx vitest run <spec>`.
- GATES DE CI antes de CADA commit que toque emulador/: `npm run lint`, `npm run format:check`
  (o `npm run format`), `npx ng test --no-watch`, `npm run build`.
- Browser-validation: herramientas preview_* (server "emulador", `ng serve` :4200 desde emulador/;
  `.claude/launch.json` ya existe).

## Checkpoints de implementación (alto nivel; el SDD revisa por-tarea)
1. **Schema (Tarea 1):** ALTER aplicado + verificado (list_tables/get_advisors limpio).
2. **Núcleo puro (Tareas 2–6):** mapping flatten/reconstruct + validators + summary/sparkline +
   merge LWW, TODO con TDD verde. Este es el RIESGO central — round-trip lossless obligatorio.
3. **Motor de sync (Tareas 7–10):** sync IndexedDB store + SessionSyncService (CRUD + pull/merge
   + flushers) + SessionSyncEffects, con cliente Supabase mockeado en unit tests.
4. **UX (Tareas 11–12):** Sesiones summary list + sparkline + dataset recovery + offline status +
   folder drag-drop — browser-validated.
5. **Import/export (.emul, Tarea 13):** opcional/último; difiere a follow-up si el alcance crece.
6. **RLS (Tarea 14):** check scripted cross-user (no en la suite Angular).
7. **Final:** whole-branch review + browser-validation completa + finish-branch (push + PR).

## Criterios de aceptación
- Todas las tareas del plan completas y review-clean; `flatten↔reconstruct` round-trip lossless
  (posiciones abiertas + riskPct + sessionEnd + cursor + drawings + carpetas).
- Login → las sesiones del usuario aparecen; crear/editar → reload persiste; segundo navegador con
  la misma cuenta → mismas sesiones; borrar propaga (membership cloud-authoritative); guest →
  local-only, sin sync; las velas siguen cargando desde R2 al abrir; sparklines renderizan;
  drag-drop de carpetas persiste y sincroniza; edición offline → reconexión → pushea.
- Supabase no contiene NINGUNA vela/dataset (verificable: payloads pasan `assertNoCandles`).
- RLS: un usuario no puede leer/escribir filas de otro (Tarea 14 PASS).
- GATES DE CI verdes (lint, format, `ng test`, build) y CI de GitHub verde en la PR (incluida la
  validación `npm ci`).

## Estrategia de testing
- Unit (`ng test`): el mapping puro es el núcleo de riesgo → TDD duro (round-trip + D3 + D4).
  Validators (no-candles, size 512KB/2MB), merge LWW (D1), summary/sparkline — todo puro.
  Cliente Supabase mockeado, sin red en unit tests.
- RLS: script (Tarea 14) con dos usuarios, fuera de la suite Angular.
- Browser-validated (preview): el checklist de criterios de aceptación de arriba.

## Estrategia de rollback
- Código: la fase entera vive en `claude/supabase-session-sync` y se integra por UNA PR. Rollback
  = no mergear (o `git revert` del merge). Sin la PR, `main` queda intacto.
- Datos/esquema: la migración de la Tarea 1 es ADITIVA (solo `add column if not exists` + index +
  trigger en `folders`); no borra datos. Para revertir el esquema, un `drop column`/`drop trigger`
  inverso vía MCP (documéntalo en la PR). Las tablas `sessions`/`folders` pueden vaciarse
  (`truncate`) sin afectar R2/IndexedDB — los datasets/velas no están en Supabase.
- Runtime: el sync es aditivo y local-first; si se desactiva (logout/guest o feature off), el
  emulador funciona igual con IndexedDB. Ningún camino de datos de mercado depende de Supabase.

## Orden
Empieza por: checkout de la rama, leer spec + plan, pre-flight scan del plan
(subagent-driven-development), y ejecutar Tarea por Tarea. Detente y pídeme merge al terminar la
fase. NO construyas nada de la sección §13 "Future" (sharing/templates/teams/public links).
```

---

## Notes for the human (not part of the paste block)

- The three planning docs (this handoff, the spec, the plan) are committed on
  `claude/supabase-session-sync` (local). Push the branch if your implementation session runs in a
  fresh clone; otherwise a new session in this repo sees them directly.
- The base `sessions`/`folders` tables already exist; Phase-2 Task 1 only ALTERs them. The only
  human prerequisite is a **second Supabase user** for the Task-14 RLS check (create a throwaway in
  the dashboard, or reuse two group users).
- Phase 3 (retire FastAPI + the `dataSource='csv'` path) comes after Phase 2 merges, via its own
  branch/PR (`claude/retire-fastapi-backend`), and still carries the open CSV-upload-removal
  decision.
