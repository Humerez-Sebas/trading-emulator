# Especificación de diseño UX — RFC-016: Journal y Cabina de Reflexión

| Campo | Valor |
| :--- | :--- |
| RFC normativo | `docs/architecture/rfcs/016-diario-enmiendas-playbook.md` (D16.A–H) |
| Autoridad visual | `DESIGN_SYSTEM.md` (raíz) — este documento lo aplica por sección, jamás lo duplica (§6.3) |
| Plan derivado | `docs/superpowers/plans/2026-07-13-rfc-016-implementation-plan.md` |
| Arquitectura de componentes | `docs/superpowers/specs/2026-07-13-rfc-016-component-architecture.md` |
| Fecha | 2026-07-13 |
| Estado | Diseño para revisión del owner |

Este documento fija el **cómo** visual/interactivo de las dos superficies nuevas.
Idiomas: copy de UI en español; identificadores en inglés.

---

## 1. Journal (`/journal/:sessionId`)

### 1.1 Perfil y estructura

- **Densidad:** `compact` (DESIGN_SYSTEM §2.3) — clase raíz `.journal-page` con el
  bloque de variables `--density-*` exacto del patrón de implementación de §2.3.
- **Jerarquía (§1):** el Journal es superficie de ANÁLISIS (rango 4). Sus
  visualizaciones son el artefacto dominante de cada sección; las tarjetas de métricas
  nunca compiten en peso visual con ellas.
- **Orden de secciones (D16.E, inviolable):**
  1. Performance · 2. Execution · 3. Behavior · 4. Rule Performance ·
  5. Time of Day · 6. Trades
- **Zonas semánticas (§2.1):** cada sección tinta SOLO su header, icono y
  borde-izquierdo de acento: Performance → `--zone-performance`; Execution →
  `--zone-execution`; Behavior → `--zone-behavior`; Rule Performance →
  `--zone-rules`; Time of Day → `--zone-temporal`. La regla semántica de color
  aplica: `--up`/`--down` codifican EXCLUSIVAMENTE resultado; las zonas codifican
  dominio. Jamás texto de cuerpo en color de zona (§5.1: bordes/iconos/headers).
- **Header de página:** título "Journal — {nombre de sesión}" (`--text-xl`),
  breadcrumb "← Sesiones", metadata de sesión (símbolo, rango de fechas) en
  `--text-muted`. El foco aterriza en el `h1` al navegar (§5.3).

### 1.2 Sección Performance (grilla de métricas)

Grilla de 10 tarjetas (2 filas × 5, colapsa a 2 columnas <900 px), todas con
`tabular-nums` y valor en `--density-metric`:

| Tarjeta | Fuente | Formato |
| :--- | :--- | :--- |
| Profit factor | `computeSessionStats.profitFactor` | `1.85` (2 dec); `∞` cuando no hay pérdidas |
| Win rate | `computeSessionStats.winRate` | `62 %` (0 dec) |
| R acumulado | Σ `rMultiple` | `+4.20R` / `−1.30R`, color `--up`/`--down` |
| Balance | ledger | moneda, 2 dec |
| Drawdown | max drawdown del ledger de la sesión | `−8.4 %`, siempre `--down` si >0 |
| Sharpe | nuevo (RFC §5) | `0.42` (2 dec) + sublabel fijo "por-trade, sin anualizar"; `—` si n<2 |
| MAE_R media | media de `maeR` | `0.55R` |
| MFE_R media | media de `mfeR` | `1.32R` |
| Trades | conteo historial | entero |
| Costes | Σ costes | moneda, 2 dec |

Guardarraíl D16.C: ninguna tarjeta muestra comparación con otra sesión, tendencia,
flecha de progreso ni benchmark. Son hechos de ESTA sesión.

### 1.3 Sección Execution

- **Scatter MAE vs MFE** (DESIGN_SYSTEM §4.2 al pie de la letra: ejes en R, origen
  visible, línea identidad discontinua, puntos 6 px opacidad 0.85, paleta
  `--rule-1..9`, sin regla → `--text-muted`).
- Tooltip (§4.1): `#12 · 2024-03-05 · +1.8R · Ruptura de rango` — anclado al punto.
- Click en punto → Cabina de ese trade (D16.F).

### 1.4 Sección Behavior

- **Bubble Duración vs R** (§4.3): X = duración en velas base, Y = R, radio ∝ nº de
  eventos de gestión del trade (min 4 px, max 20 px, escala raíz-cuadrada para que
  el ÁREA sea proporcional), color = paleta de reglas.
- **Heatmap calendario de trades** (§4.4): X = secuencia del trade en la sesión,
  1 fila (sesión única); escala divergente: intensidad `--up` para R>0, `--down`
  para R<0, gris neutro (`--border-strong`) para |R|<0.05.
- Hechos físicos de navegación (conteos de `+1`, pausas, `ReplayJump`) como fila de
  datos secundaria en `--text-muted` — números, jamás adjetivos (N-1).

### 1.5 Sección Rule Performance

Tabla (`--zone-rules`): columnas **Regla · Trades · Win rate · R acumulado**. Una
fila por regla con ≥1 trade declarado (título de la regla — lectura de `title`,
jamás `statement`) + fila final "Sin declarar" en `--text-muted`. Fila clickeable →
filtra la tabla Trades (§1.7) a esa regla (estado de filtro visible y desactivable);
`rule-without-trades` no genera fila.

### 1.6 Sección Time of Day

Tabla (`--zone-temporal`): **Franja (UTC) · Trades · Win rate · R acumulado**.
Cubos de 1 h sobre `openTime`; solo franjas con ≥1 trade. Sublabel de header:
"hora UTC del mercado".

### 1.7 Sección Trades

Tabla simplificada: **# · Hora · Side · P/L · R · MAE_R · MFE_R · Regla**.
- `#` = secuencia en sesión; Hora = `openTime` UTC `HH:mm`; Side = "C"/"V" (paridad
  con los labels del gráfico); P/L y R en `--up`/`--down`; Regla = badge `R{slot}`
  o título corto; `✎` al final si existe reflexión (estado `trade-with-reflection`).
- Fila entera clickeable → Cabina (D16.F). Fila seleccionada por teclado con fondo
  `--surface-2` + borde `--accent` izquierdo.

### 1.8 Estados (§3.2 + superficie)

| Estado | Render |
| :--- | :--- |
| `session-without-trades` | Vacío de página: "Esta sesión no tiene trades cerrados. Los patrones aparecen aquí cuando cierras trades." + botón "← Sesiones" |
| `insufficient-data` (por visualización, <3 trades) | En el lienzo de la viz: "Se necesitan al menos 3 trades para esta visualización." (`--text-muted`) — las tablas SÍ se muestran desde 1 trade |
| `rule-without-trades` | Sin fila (§1.5) |
| `loading` | Skeletons por sección — jamás spinner en vacío |
| `error` (sesión no encontrada) | "No se encontró la sesión. Puede haber sido eliminada." + "← Sesiones" |

### 1.9 Teclado (§5.2, completo)

`Tab` secciones · `↑↓` filas · `Enter` abre Cabina del trade seleccionado ·
`Escape` vuelve al catálogo. El foco visible usa el anillo estándar (§5.3). Ningún
dígito `1-9` se escucha aquí (namespace del Playbook, solo página del emulador).

---

## 2. Cabina de Reflexión (`/journal/:sessionId/reflect/:tradeId`)

### 2.1 Perfil y layout

- **Densidad:** `comfortable` (§2.3), clase raíz `.reflection-cabin-page`.
- **Layout:** 30 % lista de trades (izq.) / 70 % escena + reflexión (der.).
  <1100 px: lista colapsa a un drawer superior con el trade activo visible.
- **Jerarquía (§1):** la escena congelada ES el chart-hero de esta superficie
  (rango 1); el formulario la SIGUE, nunca la precede visualmente.
- **Zona semántica:** `--zone-reflection` para el header y acentos del panel de
  reflexión (solo bordes/iconos/headers — §5.1 borderline).
- **Breadcrumb:** "← Journal" (vuelve, D16.F) + flechas `←`/`→` que navegan al
  trade anterior/siguiente SIN salir de la Cabina + "Trade #N de M".

### 2.2 Lista de trades (30 %)

Fila: `#`, hora, side, R (color resultado), badge de regla, `✎` si tiene reflexión.
Trade activo: fondo `--surface-2`, borde izquierdo `--accent` 2 px. `↑↓` navega
(sin wrap); la escena y el formulario cambian con el trade (crossfade 180 ms).

### 2.3 Línea de tiempo de waypoints (§4.5 al pie de la letra)

- Horizontal, centrada SOBRE la escena. Nodos: Entry · Management · MAE · MFE ·
  Exit, teclas `1`–`5` respectivamente (mapa FIJO: si un nodo no existe su tecla es
  no-op — las teclas no se recompactan).
- **Visibilidad dinámica:** nodo sin fact ⇒ AUSENTE (no gris). MAE/MFE fusionados
  con Exit cuando coinciden (RFC §4): el nodo fusionado muestra ambos paneles de
  hechos.
- **Nodo activo:** relleno `--accent`, anillo exterior
  `0 0 0 3px color-mix(in srgb, var(--accent) 40%, transparent)`, conector punteado
  vertical hacia la escena. Inactivos: `--timeline-connector`. Línea 2 px.
- **Management expandible:** con ≥2 eventos de gestión, click expande sub-línea con
  cada evento: `SL 1.0842 → 1.0851 · 14:32` — la dirección (tighten/widen) se
  muestra como GEOMETRÍA (from→to), jamás como etiqueta de juicio (N-1). Teclado
  dentro de la expansión: `←→` entre sub-nodos, `Escape` colapsa.
- **Panel de hechos por nodo** (bajo la línea, `tabular-nums`): Entry → precio de
  entrada, riesgo inicial (distancia SL en precio y R), tiempo transcurrido antes
  de la orden (ancla D16.B); Management → campo, from → to, hora; MAE → excursión
  adversa en R en `tMae`, hora; MFE → excursión favorable en R en `tMfe`, hora;
  Exit → resultado neto, R, costes, hora. Solo hechos visibles EN ese momento del
  trade (§4.5: nada de futuro en nodos tempranos — Entry no muestra el resultado).

### 2.4 Escena congelada

- Render vectorial slim read-only por `RenderModel → ChartEngine` (RFC §4); ventana
  `[t0, t1]` = waypoint ± 60 velas base (constante `SCENE_WINDOW_CANDLES = 60`).
- Overlays: geometría de la orden (entrada/SL/TP como price-lines), snapshot de
  dibujos si existe, marcador vertical del instante del waypoint.
- Transición entre nodos: crossfade 180 ms (§2.4 de DESIGN_SYSTEM; con
  `prefers-reduced-motion` el cambio es instantáneo).
- `scene-loading`: skeleton del área del mini-chart. Dataset ausente localmente:
  degradación con gracia — geometría + hechos + aviso "Dataset no disponible
  localmente; mostrando geometría del trade." (TKM §5.2), jamás un error bloqueante.

### 2.5 Formulario de reflexión (la pluma)

- 3 campos textarea con labels VISIBLES (§5.4, nunca placeholder):
  **"¿Qué ocurrió?"** (`whatHappened`) · **"¿Qué debería repetir?"** (`repeat`) ·
  **"¿Qué debería evitar?"** (`avoid`). Los tres opcionales; guardar con los tres
  vacíos y sin reglas vinculadas = botón deshabilitado (no hay nada que conservar);
  cualquier campo O regla vinculada lo habilita.
- **Widget de vinculación de reglas:** chips de las reglas ACTIVAS del Playbook
  (título + badge `R{slot}` si tiene); toggle por click; chip seleccionado en
  `--accent`. Cero reglas vinculadas es válido. El statement de la regla se muestra
  en tooltip (`--surface-3`) — display puro, P-2 intacto.
- **Evidencia:** al guardar se congelan las `SceneSpec` de los waypoints EXISTENTES
  del trade (cap `MAX_EVIDENCE_SCENES = 5`) — automático, sin UI de selección en
  esta fase.
- **Botón primario:** "Guardar y volver al Journal" (`.ui-btn`, `--accent`).
  `reflection-saving`: botón en loading. `reflection-saved`: toast breve
  "Reflexión guardada" + redirect al Journal.
- `reflection-existing`: campos pre-llenados + borde izquierdo sutil
  `--zone-performance` en el panel; el botón dice "Actualizar y volver al Journal".
- Copy sobria: sin emojis, sin exclamaciones, sin lenguaje de ánimo ("¡Bien
  hecho!") — N-6: el sistema no opina.

### 2.6 Teclado (§5.2, completo)

`↑↓` trades · `1`–`5` waypoints · `Tab` campos del formulario · `Enter` (en el
formulario) guarda · `Escape` → Journal · `←→` (fuera del formulario) trade
anterior/siguiente. Con el foco DENTRO de un textarea, solo `Escape` y `Tab`
tienen semántica de superficie (los dígitos escriben texto, obvio).

---

## 3. Catálogo de sesiones — botones nuevos

Cada tarjeta de sesión gana dos acciones (TKM §4.5): **"Journal"** y **"Reflect"**
(→ `/journal/:id` y `/journal/:id/reflect`). Estilo `.ui-btn` secundario, mismo
tamaño que las acciones existentes de la tarjeta; sin iconos nuevos ad-hoc (§6.2:
primitivas existentes). Sesión sin trades: botones visibles y habilitados — el
Journal enseña su estado vacío con contexto (§3.2), no se esconde.

---

## 4. Accesibilidad y verificación

- Contraste: usos de zona solo en headers/bordes/iconos (§5.1); `--zone-reflection`
  y `--zone-behavior` jamás como texto de cuerpo.
- `aria-label` por visualización (§5.4), patrón: "Gráfico de dispersión: MAE contra
  MFE de 12 trades. Cada punto es un trade. Selecciona un punto para abrir su
  repetición detallada."
- Timeline: `role="tablist"`/`role="tab"`/`aria-selected` (§5.4).
- Tablas: `<caption>` + `<th scope>`; métricas con nombre accesible completo
  ("Profit factor: 1.85").
- `prefers-reduced-motion`: crossfades instantáneos (§5.5).
- El checklist §6.5 de DESIGN_SYSTEM se ejecuta por tarea de UI y al cierre de rama
  (gate del plan).

## 5. Registro de reglas nuevas añadidas al sistema de diseño

Ninguna. Esta spec no introdujo tokens, estados ni patrones fuera de
`DESIGN_SYSTEM.md`; las únicas constantes nuevas son de dominio
(`SCENE_WINDOW_CANDLES`, `MAX_EVIDENCE_SCENES`) y viven en código, no en el
sistema visual. Si la implementación descubre un hueco del sistema de diseño, la
regla se define, se añade a `DESIGN_SYSTEM.md` (§6.4) y recién entonces se usa.
