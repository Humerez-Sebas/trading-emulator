# Diseño: Modo offline completo del emulador + branch protection

**Fecha:** 2026-06-16
**Estado:** Aprobado (brainstorming) — listo para `writing-plans`
**Repo:** `Humerez-Sebas/trading-emulator` · paquete front: `emulador/` (Angular standalone + NgRx)

---

## 1. Contexto y objetivo

El emulador ya funciona offline con CSV: el parser, la detección de TF, el
pipeline de workspace/sesión y la persistencia en IndexedDB existen. Faltan tres
cosas para desplegar el front **100% estático ($0, sin backend)** y usarlo sin
cuenta:

1. Una **entrada deliberada de invitado** (hoy, sin backend, el estado queda
   `offline`/`anonymous`).
2. Un **catálogo de símbolos offline** para que el wizard y la página de Mercados
   muestren los CSV ya subidos y permitan reusarlos en futuras sesiones.
3. **Centralizar la creación de sesiones en el wizard**, eliminando el botón de
   carga manual de CSV del emulador.

Además: **branch protection en `main`** para que ningún PR mergee con CI en rojo
ni haya push directo.

**Veredicto:** mejora considerable por valor/esfuerzo. ~80% de la maquinaria ya
existe y es offline; el trabajo es *wiring* + UI condicional + un store nuevo en
IndexedDB.

## 2. Decisiones tomadas (brainstorming)

| Decisión | Elección |
|---|---|
| Motor de almacenamiento del catálogo | **IndexedDB (extender)** — store nuevo `symbols`. No SQLite-WASM. |
| Botón "Cargar CSV" del emulador | **Quitar carga de velas**; mover import de sesión a la página **Sesiones**. |
| Qué conservar del CSV | **Velas parseadas + catálogo**. Re-exportar el CSV bajo demanda; sin texto crudo. |
| Alcance del plan | **Todo junto**: invitado + wizard CSV + catálogo + Mercados offline + branch protection. |
| Modo invitado | En **ambos** (full-stack + build estático), gobernado por **env flags** (no Flagsmith). |
| Branch protection | **PR + CI obligatorios, sin approvals** (dev solo). |

**Cambios respecto al plan previo:** antes se ocultaba `/mercados` en offline y se
mantenía el botón manual. Ahora **Mercados se muestra** (con los símbolos subidos)
y el botón manual **se elimina**, centralizando todo en el wizard.

## 3. Arquitectura

### 3.1 Modelo de datos offline — store `symbols` en IndexedDB

`WorkspaceDbService` (`emulador/src/app/services/workspace-db.service.ts`) sube
`DB_VERSION` 3 → 4 y agrega un store **`symbols`** (keyPath `symbol`), el análogo
navegador del catálogo del backend:

```ts
interface OfflineSymbol {
  symbol: string;            // 'XAUUSD' (uppercase, symbolFromFileName)
  descripcion: string;       // editable en el wizard; default ''
  categoria: string;         // default 'Mis CSV'
  digits?: number;           // derivePointSize(candles)
  coverage: TfCoverage[];    // [{ tf, desde, hasta, velas }] por TF
  createdAt: number;
  lastModified: number;
}
```

- `coverage` se **deriva de las velas parseadas al subir** (min `time`, max `time`,
  `length` por TF). Barato; no requiere recargar arrays luego.
- Métodos nuevos: `putSymbol`, `getSymbol`, `listSymbols`, `removeSymbol`.
  `removeSymbol` hace **cascada** con `series` (rango `symbol|`) + `meta`.
- El `onupgradeneeded` crea el store solo si falta (idempotente entre v3→v4 y
  fresh→v4), siguiendo el patrón ya usado para `folders`.
- Las **velas siguen en `series`** (sin cambios). No se guarda texto crudo: se
  re-exporta el CSV desde las velas cuando haga falta.

### 3.2 Wizard `/sesiones/crear` como única vía de creación

`CrearSesionPageComponent` añade `source: 'backend' | 'csv'`:

- **Offline/guest:** `source='csv'` forzado; **no** llama `api.symbols()`. Paso 1
  ofrece dos caminos:
  - (a) elegir un símbolo **ya subido** → `db.listSymbols()` (tarjetas estilo
    `.asset`),
  - (b) **subir CSV nuevo** (dropzone).
- **Rama "subir CSV":** parsea con `CsvLoaderService.parseText`, deriva símbolo con
  `symbolFromFileName`, **verifica que TODOS los archivos son del mismo activo**
  (si no, error claro y bloqueo), arma `coverage` desde las velas. Alimenta los
  **mismos computeds** existentes (`coverage`, `dateRange`, `dateValid`,
  `endValid`, `defaultDate`, `step2Valid`).
- **`confirm()` CSV:** omite `downloadChunked`; escribe/actualiza el registro en
  `symbols`; construye `PendingCsv[]` y despacha el
  `WorkspacesActions.switchAsset({ symbol, selectedTfs, thenLoad, thenNewSession,
  thenGoTo, thenSessionEnd })` que el wizard **ya usa** para datasets pequeños.
- **Símbolo existente offline:** sin subir; `coverage` del catálogo; `switchAsset`
  hidrata las series desde IndexedDB (igual que el path `hydrateFromDb` del
  backend) — sin `thenLoad`.
- **CSV duplicado** (símbolo ya en catálogo): `appendSeriesChunk` deduplica por
  tiempo y se actualiza `coverage` + `lastModified`.
- **Full-stack autenticado:** `source='backend'` por defecto + opción "Cargar CSV"
  para cambiar a la rama CSV.

### 3.3 Página Mercados en offline (un componente, fuente condicional)

`MercadosPageComponent` elige la fuente según `environment.offlineOnly` o estado
`guest`/`offline`:

- Offline: datos desde `db.listSymbols()` (mapeados a la forma `BackendSymbol`
  que ya consume la plantilla); reutiliza `coverageSummary`, `rangeLabel`,
  `tfTooltip`, agrupación por `categoria`.
- Se **ocultan** el segmented `todos/mis` y el checkbox de curación (`user-symbols`
  es backend). CTA "Crear sesión" por card → wizard con `?symbol=`.
- "Eliminar" por card (overflow `MenuComponent` + `DialogService` confirm) →
  `removeSymbol` (cascada).
- Estado vacío → `ui-empty-state` "Aún no subiste ningún CSV" + CTA "Subir tu
  primer CSV" → wizard.

### 3.4 Modo invitado + env flags

- `environment.ts` / `environment.prod.ts`: añadir `guestModeEnabled: boolean` y
  `offlineOnly: boolean`. Full-stack: `guestModeEnabled: true`, `offlineOnly:
  false`.
- **Nuevo** `environment.offline.ts`: `backendUrl: ''`, `offlineOnly: true`,
  `guestModeEnabled: true`, `registrationEnabled: false`.
- `angular.json`: configuración de build **`offline`** con `fileReplacements`
  (`environment.ts` → `environment.offline.ts`) y su target de `serve`. Despliegue
  estático = `ng build --configuration offline`.
- `auth.reducer.ts`: añadir `'guest'` a `AuthStatus`; reduce a
  `{ status:'guest', user:null }`.
- `auth.actions.ts`: acción `continueAsGuest`.
- `auth.effects.ts`: en `checkSession`, si `environment.offlineOnly` resolver
  directo a invitado **sin** llamar `/auth/me`; si no, flujo normal. Persistir la
  elección de invitado en `localStorage` para que el reload siga en invitado.
- `auth.guard.ts`: aceptar `'guest'` igual que `'offline'`/`'authenticated'`.
- `auth-page.component.*`: botón "Continuar como invitado" (visible si
  `guestModeEnabled`) → `continueAsGuest` + navegar a `/`.
- `app.html`: pill "Invitado"; ocultar "Iniciar sesión" en guest/offline;
  **Mercados queda visible** (ahora offline-capable).

### 3.5 Reubicar el import de sesión y quitar el botón del toolbar

- Quitar el `<label>Cargar CSV</label>` + el `onFiles` de velas de
  `controls.component.*`. El toolbar conserva dropdown de activo + TF + replay.
- Mover el path `isSessionCsv`/`importSession` a la página **Sesiones** como acción
  "Importar sesión (.csv)" (ya tiene `DialogService` + `WorkspaceDbService`).
- La ingesta de velas por CSV queda **solo** en el wizard.

### 3.6 Branch protection en `main`

`PUT /repos/Humerez-Sebas/trading-emulator/branches/main/protection` (REST API):

- `required_status_checks.strict = true`, `contexts = ["Backend (lint · tests ·
  audit)", "Frontend (lint · tests · build · audit)", "Docker (compose config ·
  image builds)"]` (coinciden EXACTO con los `name:` de los jobs en
  `.github/workflows/ci.yml`).
- `required_pull_request_reviews = { required_approving_review_count: 0 }` → exige
  PR, sin aprobaciones; bloquea push directo a `main`.
- `enforce_admins = false` (el dueño destraba en emergencia), `restrictions =
  null`.
- El PAT puede necesitar `Administration: write` (ampliar si 403).

## 4. Diseño UI/UX (esencia TradingView "Modern Dark Cinema")

Se conserva la paleta y tipografía actuales (Inter, `#2962ff`, superficies
`#0a0a0a`→`#1f1f1f`, escalas en `styles.css`). Validado con ui-ux-pro-max: Dark
Mode (OLED), data-dense pero escaneable, focus visible, transiciones 150–300ms,
reduced-motion. Se descarta la paleta/fuentes sugeridas por la skill (azul+ámbar,
Fira) para no romper la esencia.

Componentes reutilizables existentes: `ButtonDirective` (`primary | ghost |
subtle | danger | danger-solid`, `block`), `EmptyStateComponent` (`ui-empty-state`
con slot `[icon]`, `boxed`), `SegmentedControlComponent`, `MenuComponent`,
`DialogService`, `BadgeDirective`, `.tf-chips`/`.tf`, `.cov-summary`.

| Superficie | Especificación |
|---|---|
| **Entrada invitado** (auth-page) | Bajo el CTA primario: divisor "o" + `appButton variant="ghost" block` "Continuar como invitado" (icono usuario SVG stroke 2, 16px). Subtexto: "Sin cuenta · tus CSV se guardan solo en este navegador". Un único CTA primario. |
| **Pill "Invitado"** (app.html) | Reusa `.offline-pill`, label "Invitado", tooltip "Modo invitado — datos guardados solo en este navegador". |
| **Wizard rama CSV** | Paso 1: `SegmentedControlComponent` "Catálogo \| Subir CSV" (solo full-stack; offline = CSV directo). Dropzone con `ui-empty-state [boxed]` (dashed `--border`, icono upload existente); drag-over → `border-color:var(--accent)` + `background:var(--accent-subtle)`. Tras parsear: lista de revisión con símbolo detectado + `.tf-chips` + conteo. Error de símbolos mezclados inline (icono + texto, `--danger`, `aria-live`). Pasos 2/3 y validación de fechas intactos. Sin barra de progreso en CSV (instantáneo). |
| **Mercados offline** | Mismas `.cards`/`.card` desde catálogo; se ocultan segmented y checkbox de curación. Card: símbolo + `.cov-summary` + `.tf-chips` + `appButton` "Crear sesión" + "Eliminar" (`MenuComponent` + confirm). Vacío → `ui-empty-state` + CTA. Header CTA "Subir CSV / Nueva sesión". |
| **Import de sesión** (Sesiones) | Acción "Importar sesión (.csv)" en header, `appButton variant="subtle"`, subordinada a "Nueva sesión". Resultado vía `DialogService`. |

**Transversal:** focus `outline:2px solid var(--accent)`; transiciones
`--duration-base`/`--ease-out`; estados loading/empty/error por superficie;
`aria-live` en errores/resultados; `tabular-nums` y reduced-motion ya globales;
iconos SVG stroke (sin emoji); errores con icono+texto (no solo color).

## 5. Manejo de errores

- **Wizard CSV:** símbolos mezclados → error inline + bloqueo. CSV vacío/inválido →
  errores existentes del parser. Símbolo duplicado → merge (dedupe en
  `appendSeriesChunk`) + actualizar `coverage`.
- **Catálogo:** escritura best-effort; si falla, la sesión funciona igual (las
  series ya se guardaron). Catálogo vacío en Mercados → estado vacío con CTA.
- **Branch protection:** si la API responde 403, ampliar el PAT a `Administration:
  write` y reintentar; verificar con `GET .../protection`.

## 6. Pruebas (vitest, mantener verde)

- `WorkspaceDbService`: CRUD del store `symbols` + cascada de `removeSymbol`.
- Wizard rama CSV: parseo + verificación mismo símbolo + escritura de catálogo +
  dispatch de `switchAsset`; rama "símbolo existente" hidrata desde DB.
- Mercados offline: render desde catálogo; estado vacío; eliminar con confirm.
- Auth: guard y reducer aceptan `guest`; `checkSession` con `offlineOnly` no llama
  `/auth/me`; botón invitado en auth-page.
- Import de sesión movido a Sesiones (parseo + dispatch); el toolbar ya no tiene
  carga de velas.

## 7. Verificación

- **Branch protection:** `GET .../branches/main/protection` refleja las reglas; PR
  que rompe CI → sin "Merge"; en verde → mergeable.
- **Build estático:** `npm run build -- --configuration offline` compila; servir el
  `dist` → arranca sin login, pill Invitado, `/sesiones/crear` en modo CSV: subir
  `emulador/public/xauusd_h4.csv` (+ otro TF del mismo activo) → verifica mismo
  activo, valida fechas, genera sesión, abre el chart posicionado; Mercados muestra
  el símbolo subido; recargar conserva el catálogo.
- **Full-stack:** `docker compose -f infra/docker-compose.yml up`; "Continuar como
  invitado" → wizard CSV sin login; login normal sigue; Mercados con backend sigue.
- **Suites:** `cd backend && pytest -q` (sin cambios) · `cd emulador && npx ng test
  --watch=false` verde · `npm run build` (prod) y `--configuration offline`
  compilan.
- Verificar en navegador con las herramientas de preview (`preview_start` +
  snapshot).

## 8. Fuera de alcance / notas

- Flagsmith **no** gobierna esto (decisión: env flags). Si en el futuro se quiere
  togglear el modo invitado en runtime full-stack, se añadiría un `GET /config`
  público que lea `app/flags.py` — fuera de alcance ahora.
- No se guarda el texto crudo del CSV; la re-exportación se deriva de las velas.
- SQLite-WASM se descartó: IndexedDB cumple el rol sin dependencias nuevas.
