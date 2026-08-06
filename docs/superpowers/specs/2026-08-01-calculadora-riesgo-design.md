# Diseño — Calculadora de riesgo (CFD/Forex)

**Fecha:** 2026-08-01
**Estado:** Aprobado (brainstorming) — listo para `writing-plans`
**Repo:** `Humerez-Sebas/trading-emulator` · front: `emulador/` (Angular 21 standalone + NgRx)
**Rama:** `claude/calculadora-riesgo` (desde `origin/main`) → PR a `main`
**Track:** producto (`docs/engineering/git-workflow.md` §Two-track flow)

---

## 1. Contexto y objetivo

El emulador ya sabe dimensionar posiciones: `lotsForRisk()` y `contractSizeFor()`
(`emulador/src/app/state/trading/trading.models.ts:259,271`) son las funciones puras que
el motor usa para convertir «arriesgo el 1 % de la cuenta» en un número de lotes. Esa
matemática hoy **solo existe dentro del bucle de simulación**: para operar fuera del
emulador el trader la recalcula a mano, y cualquier discrepancia rompe la premisa de
práctica deliberada (entrenar con las mismas cifras con las que se opera).

**Objetivo:** una página `/calculadora` que dimensione posiciones **exactamente igual que
el emulador**, reutilizando esas dos funciones sin duplicarlas.

**Caso de aceptación (del propietario):** cuenta 5 000, riesgo 1 %, US30 entrada 40 000 /
SL 39 950 → riesgo 50 USD, distancia 50 puntos, `contractSize` 1 → **1.00 lote**.

### No-objetivos de la v1

- **Modo Futuros** (contratos, minis y micros): diferido a un spec posterior. Los
  multiplicadores y tamaños de tick deben verificarse contra el bróker del propietario
  antes de codificarlos; encodearlos «a ojo» produciría un dimensionado incorrecto con
  apariencia de autoridad. Sin ese dato la v1 no lo incluye — tampoco como pestaña
  deshabilitada («próximamente» es una promesa que no controlamos).
- Persistencia (ni IndexedDB ni Supabase). La calculadora no guarda nada.
- NgRx de escritura. Solo lee `selectAssets` para poblar el desplegable de activos.
- Feed de precios en vivo, vínculo con el motor de trading, o creación de órdenes.

### Por qué no reutilizar el panel de operativa

`TradePanelComponent` dimensiona contra la sesión activa (balance simulado, cursor de
replay, `selectContractSize` del activo abierto). La calculadora debe funcionar **sin
sesión, sin datos descargados y sin activo abierto** — cualquier cuenta, cualquier
símbolo, incluso uno que no está en R2. Son dos usos distintos de la misma matemática,
no dos vistas del mismo estado.

---

## 2. Arquitectura

### 2.1 Regla de dependencias (la decisión estructural)

`lotsForRisk` y `contractSizeFor` viven en `state/trading/trading.models.ts`. El módulo
puro nuevo vive en `domain/risk/`. **El dominio no puede importar del estado** (ROADMAP
§Principios 6, «Dependency Rule: las dependencias apuntan al dominio»), así que:

- `domain/risk/risk-calculator.ts` es **totalmente parametrizado**: recibe `contractSize`
  como argumento y **nunca importa `state/`**.
- La **página** compone: importa `contractSizeFor`/`lotsForRisk` del estado y las funciones
  puras del dominio, y las conecta.

La alternativa (mover las dos funciones a `domain/`) se descarta: obligaría a tocar
`trading.models.ts` y su superficie de specs, poniendo en riesgo la paridad que este
trabajo existe para garantizar. El coste de la opción elegida es una línea de
composición en la página.

### 2.2 Superficie nueva

| Artefacto | Rol |
|---|---|
| `emulador/src/app/domain/risk/risk-calculator.ts` | Puro, parametrizado, sin DI ni I/O |
| `emulador/src/app/domain/risk/risk-calculator.spec.ts` | Unit tests del módulo puro |
| `emulador/src/app/pages/calculadora/calculadora-page.component.{ts,html,css}` | Página standalone, signals + computed |
| `emulador/src/app/pages/calculadora/calculadora-page.component.spec.ts` | Render + estados degradados |

Ediciones: `app.routes.ts` (ruta lazy) y `app.html` (enlace de navegación tras
«Nueva sesión»).

### 2.3 API del módulo puro

```ts
/** Tamaño de pip. Evaluado EN ESTE ORDEN, el mismo que usa `contractSizeFor`:
 *  1) metales (`XAU*`, `XAG*`) -> null    (se miden en puntos, y son de 6 letras)
 *  2) 6 letras con JPY          -> 0.01
 *  3) resto de 6 letras         -> 0.0001
 *  4) cualquier otro símbolo    -> null   (índices y CFDs: puntos, no pips) */
export function pipSizeFor(symbol: string): number | null;

/** Distancia entrada↔SL en unidades de precio. Siempre >= 0. */
export function priceDistance(entry: number, sl: number): number;

/** Riesgo en divisa de cuenta para un porcentaje dado. */
export function riskUsdFor(balance: number, riskPct: number): number;

/** Inverso de lotsForRisk: riesgo real en divisa al operar `lots`. */
export function riskForLots(lots: number, entry: number, sl: number, contractSize: number): number;
```

`pipSizeFor` tiene dos trampas que el orden de evaluación resuelve. Los pares con JPY
usan pip 0.01, no 0.0001: aplicar 0.0001 inflaría la distancia en pips ×100 sobre
cualquier par con JPY. Y los metales (`XAUUSD`, `XAGUSD`) **son símbolos de 6 letras**,
así que una regla ingenua de «6 letras ⇒ forex» los trataría como pares y les daría pips
inexistentes — por eso se descartan primero, exactamente como hace `contractSizeFor` al
comprobar `XAU*`/`XAG*` antes que `/^[A-Z]{6}$/`.

`riskUsdFor` reproduce `(balance * riskPct) / 100`, la misma expresión que `lotsForRisk`
usa internamente sin exportarla. Es una línea, pero es la línea que la UI muestra como
«Riesgo USD»: un test de paridad fija que el valor mostrado coincide con el que
`lotsForRisk` usó para calcular los lotes (§4).

### 2.4 Estado de la página

Signals de entrada: `balance`, `riskPct`, `symbol`, `entry`, `sl`, `manualLots`.
Todo lo demás es `computed`. Sin efectos, sin suscripciones, sin `dispatch`.

---

## 3. UI y comportamiento

**Layout:** `.page` / `.head` como el resto de páginas. Primitivas existentes:
`[appInput]`, `[appButton]`, `[appBadge]`, `ui-dropdown`, `app-risk-slider`.

**Entradas:** Cuenta (USD) · Riesgo % (`app-risk-slider` 0.1–5 **más** campo libre, que
acepta cualquier valor positivo — el slider es un atajo, no un límite) · Activo
(`ui-dropdown` poblado con `selectAssets`, más texto libre para símbolos que no están en
el registro) · Entrada · Stop Loss.

**Salidas:** **Lotes** como cifra principal · Riesgo USD · Distancia (en pips cuando
`pipSizeFor(symbol) !== null`, en puntos si no) · el `contractSize` aplicado, mostrado
explícitamente («US30 → 1 $/punto por lote») para que el número nunca sea una caja negra
· bloque inverso: dados N lotes manuales, cuánto se arriesga en USD y en % de la cuenta.

### 3.1 Estados honestos (no son casos borde, son el producto)

1. **SL igual a la entrada** → `priceDistance === 0`; `lotsForRisk` devuelve `0`. Mostrar
   «El SL coincide con la entrada» en lugar de «0.00 lotes», que se lee como un resultado
   válido.
2. **Cuenta o riesgo no positivos** → mismo tratamiento, mensaje propio.
3. **El mínimo de 0.01 lotes distorsiona el riesgo.** `lotsForRisk` hace
   `Math.max(0.01, …)`: cuando el tamaño calculado cae por debajo de 0.01, devuelve 0.01
   y el riesgo **real** supera al solicitado, en silencio. Con cuentas pequeñas o stops
   anchos esto es habitual y puede multiplicar el riesgo varias veces. La calculadora
   **debe** comparar `riskForLots(lotesDevueltos, …)` contra `riskUsdFor(…)` y avisar
   cuando difieran de forma material (> 1 %): «el mínimo de 0.01 lotes arriesga $X, por
   encima de los $Y solicitados». Sin este aviso la página sería exacta y engañosa a la
   vez. El mismo mecanismo cubre el redondeo a 0.01 hacia abajo.

---

## 4. Estrategia de test

**Paridad — el test que da sentido al trabajo.** El caso de aceptación (§1) se fija como
test explícito, resuelto **a través de `lotsForRisk`**, nunca con una copia local de la
fórmula. Un test de invariante afirma que la página no reimplementa el dimensionado: el
único origen de lotes es `lotsForRisk`.

**Módulo puro:** `pipSizeFor` (EURUSD → 0.0001, USDJPY → 0.01, XAUUSD → null, US30 →
null), `priceDistance` (simétrica, siempre positiva), `riskForLots`, y la consistencia
`riskUsdFor` ↔ el riesgo implícito en `lotsForRisk` salvo redondeo y mínimo.

**Componente:** cifra de lotes del caso de aceptación; los tres estados degradados de
§3.1, con foco en que el aviso del mínimo aparece cuando debe y **no** aparece cuando el
tamaño calculado supera 0.01.

**Puertas:** las cuatro, desde `emulador/`, en crudo y sin tuberías:
`npx tsc -p tsconfig.app.json --noEmit` · `npx tsc -p tsconfig.spec.json --noEmit` ·
`npx ng test --watch=false` · `npm run lint`. `npm run build` al finalizar la rama.

---

## 5. Riesgos

- **Deriva de paridad.** Si `lotsForRisk` cambia, la calculadora debe cambiar con ella.
  Mitigación: la página no tiene fórmula propia; el test de invariante lo fija.
- **Símbolo libre mal interpretado.** `contractSizeFor` cae a `1` para todo lo que no
  reconoce (`XAU*` 100, `XAG*` 5000, 6 letras 100 000, resto 1). Un símbolo mal escrito
  produce un número plausible pero incorrecto. Mitigación: mostrar siempre el
  `contractSize` aplicado (§3), para que el supuesto sea visible antes de operar.
- **Ruta sin `r2OnboardingGuard`.** Deliberado: la calculadora no necesita datasets. Mismo
  criterio que `/mercados` y `/sesiones`, que solo llevan `authGuard`.

## 6. Seguimiento

Modo Futuros (ES/MES, NQ/MNQ, YM/MYM, RTY/M2K, GC/MGC, SI/SIL, CL/MCL): tabla
`FUTURES_CONTRACTS` + `contractsForRisk()` (`floor`, nunca redondeo hacia arriba —
los futuros son contratos enteros) y comparativa mini/micro. Bloqueado hasta disponer de
los multiplicadores y tamaños de tick del bróker del propietario.
