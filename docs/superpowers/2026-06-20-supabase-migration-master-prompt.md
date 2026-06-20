# Master prompt — Supabase migration (execute phase by phase)

Paste the block below into a **fresh** Claude Code session (in this repo) to run the
Supabase auth + session-sync migration. It is self-contained: it tells the agent what
to read, how to branch, the order of phases, and the guardrails.

> The three phases ship as **separate PRs**. Phase 1's plan already exists; Phases 2 and 3
> are brainstormed + planned (via the skills) only when their turn comes, informed by the
> prior phase. Do **not** try to do all three at once.

---

```
Ejecuta la migración a Supabase (auth + sincronización de sesiones) fase por fase.

## Qué es
Trading Emulator v2 — PWA Angular 21 + NgRx con datos en Cloudflare R2 (parquet → IndexedDB).
El deploy actual (Vercel estático + R2) cubre todo salvo que las sesiones NO son persistentes
(viven solo en IndexedDB del navegador). Vamos a adoptar Supabase (Auth + Postgres + RLS) para
dar sesiones durables y portables a un grupo pequeño invite-only, y retirar el backend
FastAPI/Postgres que quedó redundante. El pipeline MT5→R2 (harvester/parquet_builder/
r2_uploader/manifest/mt5_common) NO se toca.

## LEE PRIMERO (ya en main)
- SPEC (el porqué/diseño + modelo de dominio validado):
  docs/superpowers/specs/2026-06-20-supabase-auth-session-sync-design.md
- PLAN Fase 1 (ejecútalo tal cual): docs/superpowers/plans/2026-06-20-supabase-auth-foundation.md
Decisiones de modelo ya tomadas (NO re-litigar): modelo CLOUD session-centric; el IndexedDB
LOCAL se queda workspace-centric y la capa de sync mapea entre ambos; payload sin velas y
lossless (NO reusar el .session.json que es lossy); split metadata/payload; versioning =
schema_version en el payload + updated_at LWW (difiere rev/CAS); folders como tabla propia;
apariencia del chart se queda user-level (localStorage), NO en la sesión.

## Rama y estado (NO re-derivar)
- ⚠️ El `main` LOCAL está stale/divergido (46 commits detrás de origin, 1 commit huérfano).
  RAMIFICA SIEMPRE desde origin/main: `git fetch origin && git checkout -b <rama> origin/main`.
- Una rama (y un PR) POR FASE. Sugeridas: claude/supabase-auth (Fase 1),
  claude/supabase-session-sync (Fase 2), claude/retire-fastapi-backend (Fase 3).
- Plataforma: Windows. Shell: PowerShell + Bash. La cwd puede revertirse entre llamadas →
  usa rutas absolutas / cd explícito por comando. Comandos del emulador desde emulador/.

## Prerrequisito de Fase 1 (humano / Supabase MCP, antes de codear)
Provisiona el proyecto Supabase: Auth → Email habilitado, **deshabilita "Allow new users to
sign up"** (invite-only), crea los usuarios del grupo, copia Project URL + anon key (públicos)
a emulador/src/environments/environment*.ts. Sin tablas todavía (las tablas son Fase 2).
Si tienes el MCP de Supabase conectado, puedes crear proyecto/usuarios por ahí; si no, dashboard.

## Orden de ejecución
1) FASE 1 — Supabase Auth foundation. Ejecuta el plan ya escrito con
   superpowers:subagent-driven-development: pre-flight scan del plan, por tarea
   implementer→review-package→task reviewer→fix loop→commit, corre los GATES DE CI antes de
   cada commit, valida en navegador la Tarea 4 (login/guest/redirect), review whole-branch
   final, y superpowers:finishing-a-development-branch (push + PR a main). Pide merge al humano.
2) FASE 2 — Session sync (tras mergear Fase 1). PRIMERO crea las tablas Supabase
   (sessions, folders) + RLS por owner_id (vía Supabase MCP apply_migration), según el §6 del
   spec. Luego usa superpowers:brainstorming (solo para afinar los edge-cases de sync que el
   spec deja abiertos: flatten/reconstruct workspace↔sessions, cola offline, orden de
   merge-on-login) y superpowers:writing-plans para escribir
   docs/superpowers/plans/<fecha>-supabase-session-sync.md, y ejecútalo con
   subagent-driven-development. El núcleo de riesgo es el mapeo flatten/reconstruct → TDD duro.
3) FASE 3 — Retirar el backend viejo (tras mergear Fase 2). Borra backend/app FastAPI +
   alembic + tests muertos, los servicios docker de API+Postgres, y la ruta frontend
   dataSource='csv'/backend (BackendApiService, authInterceptor, csv-legacy.repository, series
   store legacy, el toggle source en crear-sesion). CONSERVA harvester/parquet_builder/
   r2_uploader/manifest/mt5_common. DECISIÓN ABIERTA: pregunta al humano si la feature de
   subir CSV propio se elimina con esa ruta (recomendado) o se conserva bajo R2. Planifica con
   writing-plans y ejecuta con subagent-driven-development.

## Constraints globales
- Angular 21 standalone + signals + NgRx; texto de usuario en español; imita archivos vecinos.
- Estado y candle.time en segundos UNIX.
- Local-first: IndexedDB sigue siendo el working copy; login es aditivo (logout = guest local,
  nunca un muro). Preserva el authGuard (authenticated|offline|guest pasan; anonymous → /login).
- Coexistencia en Fase 1: NO borres BackendApiService / authInterceptor / la ruta csv/backend
  (eso es Fase 3); en Fase 1 solo el AUTH deja de usar BackendApiService.
- Seguridad: el anon key es público (va en environment*.ts, como marketDataBaseUrl); RLS por
  owner_id = auth.uid() protege los datos. El service-role key NUNCA va al cliente. Payloads de
  sesión SIN velas (validador + guard de tamaño ~256 KB).
- Skills por tarea (si el plan los nombra): analogjs angular-component/angular-signals/
  angular-testing, superpowers test-driven-development / systematic-debugging. Si Claude Code no
  los lista, `npx skills check` los re-materializa; si igual faltan, imita los vecinos.

## Comandos canónicos (desde emulador/)
- Tests: `npx ng test --no-watch` (runner canónico). Specs puras: `npx vitest run <spec>`.
- Build: `npm run build` (prod) y `npm run build -- --configuration offline`.
- GATES DE CI antes de CADA commit que toque emulador/: `npm run lint`, `npm run format:check`
  (o `npm run format`), `npx ng test --no-watch`, `npm run build`. CI bloquea el deploy si fallan.
- NO corras `npm install` salvo para añadir una dependencia real (regenera el lockfile
  estabilizado). Al añadir @supabase/supabase-js (Fase 1, Tarea 1) commitea package.json +
  package-lock.json juntos; después, si git status muestra cambio espurio del lockfile, restáuralo.
- Browser-validation: herramientas preview_* (server "emulador", ng serve :4200 desde emulador/;
  crea .claude/launch.json si no existe).

Empieza ramificando desde origin/main, leyendo el spec y el plan de Fase 1, y corriendo el
pre-flight de subagent-driven-development. Detente y pídeme merge al terminar cada fase.
```

---

## Notes for the human (not part of the prompt)

- **Run one phase per session** for clean context. After each phase's PR merges, start a fresh
  session and paste the same prompt — it will pick up the next unmerged phase (the spec/plan on
  `main` are the source of truth).
- **Phase 1 needs the Supabase project first** (the prerequisite above). Phase 2 needs the
  `sessions`/`folders` tables + RLS created (the agent can do this via the Supabase MCP).
- **Phase 3** is mostly deletion; it carries the one open decision (CSV-upload removal) — the
  agent will ask you.
