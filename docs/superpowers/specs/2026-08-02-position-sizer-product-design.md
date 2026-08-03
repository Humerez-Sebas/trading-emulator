# Diseño de producto — Position Sizer («Lotaje»)

**Fecha:** 2026-08-02
**Alcance:** diseño de producto y UX. No arquitectura (congelada), no wireframes, no código.
**Destinatario:** el agente que implemente la interfaz. Este documento existe para que **no
vuelva a tomar ninguna decisión de UX**.
**Autoridad visual:** `DESIGN.md` (tokens) y `PRODUCT.md` (marca, anti-referencias). Este
documento no crea un sistema visual nuevo; lo aplica y propone **un solo token adicional**, con
justificación (§9.2).

---

## 0. La métrica de diseño

Todo lo que sigue se justifica contra un único número:

> **Estado estacionario: 1 campo + 1 tecla.** Para el caso canónico («ya sé mi cuenta, mi riesgo y
> mi símbolo; acabo de definir el stop en MT5»), la herramienta debe resolverse en **tres
> pulsaciones**: `4`, `5`, `Enter`.

Cualquier elemento que no sobreviva esa prueba es candidato a desaparecer. Una herramienta que se
abre cientos de veces al día no se optimiza por aprendizaje; se optimiza por **repetición**.

---

## 1. Qué enseñan las herramientas de referencia (y cuáles no enseñan nada)

Antes de extraer principios, una aclaración honesta: **de las trece herramientas citadas, solo
cinco son dimensionadores.** Agruparlas todas produciría conclusiones falsas.

| Grupo | Herramientas | Relevancia real |
|---|---|---|
| **Dimensionadores** | TradingView Long/Short Position, Position Sizer EA (earnforex), PositionCalculatorMT5, Babypips, FTMO | **Alta.** Son el objeto de estudio |
| **Plataformas de ejecución profesional** | NinjaTrader (SuperDOM), Sierra Chart, ATAS, Quantower | **Media.** Enseñan densidad, jerarquía y ejecución en un clic; no dimensionado |
| **Diarios / analítica post-trade** | Edgewonk, TraderSync, Tradervue, TradeZella, MyFxbook | **Baja.** Son herramientas de revisión, no de ejecución. No aportan al flujo de dimensionar |
| **Toolkits de indicadores** | LuxAlgo | **Baja.** El dimensionado es accesorio |

### 1.1 Los cinco principios extraídos

**P1 — El mejor número es el que no se teclea (TradingView).**
En TradingView el tamaño **no se introduce: emerge de arrastrar el stop**. La posición se
recalcula sola al mover la línea. Nuestro acompañante no tiene gráfico, así que no podemos heredar
el gesto — pero sí el principio: **reducir al mínimo irreducible lo que el usuario teclea.**
Nota: el emulador *ya tiene* este patrón (click derecho → marcar SL → lotaje en vivo). El
acompañante es la versión sin gráfico del mismo trabajo, y por eso su diseño es distinto por
necesidad, no por gusto.

**P2 — Un panel, una respuesta; lo demás en pestañas (Position Sizer EA).**
El sizer profesional más instalado organiza cinco pestañas (Main, Risk, Margin, Swaps, Trading) y
**la pestaña principal contiene el trabajo completo**. Todo lo demás es *progressive disclosure*
a nivel de pestaña. Nuestro alcance es una fracción del suyo — así que **no necesitamos pestañas
en absoluto**: necesitamos un panel principal y un desplegable.

**P3 — La herramienta llega precargada, no en blanco (Position Sizer EA).**
Al adjuntarse, el EA fija entrada = precio actual y SL = mínimo cercano, y **persiste su
configuración entre reinicios**. El usuario *edita* en vez de *redactar*. Es la diferencia entre
una herramienta y un formulario.

**P4 — El experto no usa el ratón para tareas repetitivas.**
La literatura de UX para expertos es tajante: la eficiencia importa mucho más que la
aprendibilidad, y los usuarios expertos evitan el ratón en tareas repetidas. El EA de referencia
lo confirma: minimizar con la tecla `` ` ``, `Tab` para dirección, `S`/`P` para fijar SL/TP,
`E` para entrada. **Teclado primero, ratón opcional.**

**P5 — Mostrar el trabajo es un patrón educativo, y es nuestra anti-referencia (Babypips/FTMO).**
Babypips pide *pip value* y devuelve *riesgo permitido, pips de stop, valor del pip, lotes,
unidades, riesgo real, margen*. Eso enseña a calcular. Un profesional no necesita ver el
intermedio: **necesita el lote.** Cada intermedio mostrado es ruido que compite con la única cifra
que se va a copiar.

> **Anti-referencia nueva, para `PRODUCT.md`:** «No parecer una calculadora de Babypips: enseña a
> calcular; nosotros ejecutamos.» Complementa la existente («no parecer MetaTrader 4»).

---

## 2. La observación central: los cuatro inputs no son iguales

Para producir un lote hacen falta cuatro valores: **cuenta**, **riesgo %**, **símbolo**,
**distancia al stop**. Presentarlos como cuatro campos equivalentes es el error que comete
cualquier calculadora genérica — y el que comete la página actual, con tres paneles del mismo peso
(«Datos de la operación» / «Dimensionado» / «Desde lotes»).

Porque **no cambian con la misma frecuencia**:

| Valor | Frecuencia de cambio | Naturaleza |
|---|---|---|
| Cuenta (balance) | Casi nunca (tamaño del challenge) | **Contexto** |
| Riesgo % | Casi nunca (constante del trader) | **Contexto** |
| Símbolo | Pocas veces al día | **Contexto** |
| **Distancia al stop** | **Cada operación** | **La pregunta** |
| Lote | Cada operación | **La respuesta** |

> **Principio rector de la arquitectura de información:**
> **Organizar por frecuencia de cambio, no por categoría semántica.**

Babypips organiza por categoría (cuenta / operación / resultado). Organizar por *cada cuánto
cambia cada cosa* es lo que hace rápida a una herramienta en su uso número quinientos: lo que no
cambia se aquieta, lo que cambia recibe el foco.

---

## 3. Arquitectura de información: tres zonas

Se descarta la lista de siete bloques propuesta (Riesgo, Instrumento, Stop, Resultado, Asset Card,
Copiar, Ayuda): siete contenedores para cuatro entradas y una salida es andamiaje. La estructura
correcta son **tres zonas**, en este orden vertical:

```
┌─ ZONA 1 · CONTEXTO ──────────────────────────────── (silenciosa, persistente)
│  US30 ▾        10 000 USD        1 %  ·  $100
├─ ZONA 2 · LA PREGUNTA ───────────────────────────── (el foco vive aquí)
│  Stop            [    45  ] pts                      ⇄ precios
├─ ZONA 3 · LA RESPUESTA ──────────────────────────── (el héroe)
│
│              2.22                          ⧉
│              lotes
└───────────────────────────────────────────────────
```

### 3.1 Zona 1 — Contexto

Una sola línea. Tres controles en línea, no un panel con etiquetas apiladas.

- **Símbolo**: un *chip* pulsable, no un desplegable siempre abierto. Muestra el símbolo y,
  cuando la procedencia es heurística, una marca (§8.1). Pulsarlo abre selección + texto libre.
- **Cuenta**: campo numérico con sufijo `USD` dentro del campo.
- **Riesgo %**: campo numérico con sufijo `%`, seguido **inmediatamente** del riesgo derivado en
  dólares (`· $100`). Esa cifra derivada es el ancla honesta de toda la herramienta: el riesgo es
  invariante por construcción (I-1), y verlo siempre es lo que hace que un error de tecleo en el
  stop sea un error de *lote*, nunca de *riesgo*.
- **Sin slider de riesgo.** Se descarta `app-risk-slider` en el acompañante (§7.3).

Tono visual: `--text-muted` para etiquetas, `--text` para valores, tipografía `--text-sm`.
La zona debe **leerse como un encabezado de estado**, no como un formulario.

### 3.2 Zona 2 — La pregunta

**Un solo campo.** El stop, expresado por defecto como **distancia** (§4.1), con la unidad
visible como sufijo dentro del campo (`45 pts`), nunca en un desplegable aparte que pueda
malinterpretarse.

A su derecha, un conmutador discreto a **método por precios** (entrada + SL), que sustituye el
campo único por dos campos. Es el único cambio estructural que la interfaz admite en caliente.

### 3.3 Zona 3 — La respuesta

- **La cifra de lotes**, el elemento más grande de la pantalla por un margen amplio.
- **La cifra es el botón de copiar.** No hay un botón «Copiar» compitiendo por atención; el
  número *es* la acción. Un glifo de copia discreto (⧉) en su esquina aporta el afordance.

> **D-21 (owner, 2026-08-03): la línea de contrato se elimina.** La tercera línea de esta zona
> (`US30 · 1 $/punto por lote · $2.22/punto`) queda fuera del producto, con ella el término
> `$/punto`. La Zona 3 contiene la cifra, su etiqueta y el afordance de copia — nada más.
> Autoridad: decisión del owner (PHILOSOPHY §3.1 nivel 1). Registro: `.superpowers/rfc-020/dev-log.md` §8.6.

### 3.4 Lo que NO es una zona

- **«Asset Card» / Ficha del activo** → no es un bloque; es *progressive disclosure* colgando del
  chip de símbolo (§5.2).
- **«Ayuda»** → no existe. Una herramienta profesional no tiene bloque de ayuda. La explicación
  vive en la Ficha, que es donde se puede verificar el supuesto.
- **«Copiar»** → no es un bloque; es la Zona 3.

---

## 4. Decisiones sobre las entradas

### 4.1 Método B (distancia) es el predeterminado — decisión con coste

Los símbolos núcleo son índices: US30 ≈ `40000`, NAS100 ≈ `18500`. Con método de precios, cada
operación exige teclear **dos números de cinco dígitos** (`40000` y `39950`) ≈ **10 pulsaciones**.
Con distancia: `50` ≈ **2 pulsaciones**. **Cinco veces menos tecleo, en la acción que se repite
cientos de veces al día.** Contra la métrica de §0, no hay competencia.

**El coste, declarado:** un error de magnitud en la distancia es menos autoevidente que en un par
entrada/SL, donde ambos precios están en la escala del instrumento y un dígito mal salta a la
vista. Y la dirección peligrosa es **una distancia demasiado pequeña** (`4.5` en vez de `45`
multiplica el lote por diez).

**Mitigaciones, en orden de fuerza (dos, tras D-21):**

1. **El riesgo en dólares es visible y constante** (Zona 1). El modelo garantiza que un error de
   distancia no cambia el riesgo nominal; cambia el lote.
2. **La unidad es un sufijo dentro del campo**, no un selector separado.

La tercera mitigación propuesta —el `$/punto` de la posición resultante en la Zona 3— **cae con
D-21** (§3.3): la línea de contrato se elimina y con ella ese guardarraíl. El coste declarado del
Método B se cubre por tanto con las dos mitigaciones de arriba, y el trade-off queda revisado
en §13 #1.

**Método A (entrada + SL) permanece a una tecla** (`Alt+M`) y es la vía natural cuando el
instrumento es de pocos dígitos o cuando el trader prefiere autoverificarse. Ambos métodos son
**dos vistas de un mismo objeto**: cambiar de método **convierte**, nunca reinicia. Al pasar de
precios a distancia, la distancia se conserva; al volver, la entrada previa se conserva y el SL se
recalcula. Nunca se pierde lo tecleado.

### 4.2 Unidad por símbolo, derivada, nunca preguntada

La unidad predeterminada la decide el registro: **puntos** cuando el símbolo no tiene pip
(índices, metales), **pips** cuando lo tiene (FX). El usuario puede cambiarla en la Ficha; nunca se
le pregunta al abrir. Recordatorio de precisión: en FX de 5 dígitos **1 pip = 10 puntos MT5**;
confundirlos es un error de ×10, y por eso el sufijo del campo dice siempre cuál está activa.

### 4.3 Qué NO se pregunta nunca — y por qué

| Dato | Motivo de la exclusión |
|---|---|
| **Dirección (compra/venta)** | **Matemáticamente irrelevante:** el dimensionado usa `\|entrada − SL\|`, que es simétrico. El EA de MT5 la pide porque *coloca la orden*; nosotros solo emitimos una cifra. Es la eliminación más valiosa del diseño: una decisión menos, un campo menos, un error menos |
| Divisa de la cuenta | Congelado: solo USD |
| Apalancamiento | No interviene en el tamaño; solo en el margen, que no es el trabajo |
| Valor del pip | Derivable del registro. Pedirlo es el patrón educativo de Babypips |
| Comisión / spread | Efecto de segundo orden sobre el riesgo realizado; dos campos por una corrección marginal |
| Take profit / R:R | Congelado: el gráfico está en MT5 |
| Margen, swaps, distribución de TP | Fuera de alcance |
| Tipo de cuenta / prop firm | Congelado: el cálculo **jamás** se ramifica por firma |
| Balance en vivo del bróker | Congelado: balance fijo tecleado (el trader dimensiona sobre el tamaño del challenge, no sobre el equity flotante) |

### 4.4 Qué se calcula solo

`contractSize`, `tickSize`, `pointSize`, `pipSize`, `volumeStep`, `volumeMin` (registro) ·
`riesgo $` = cuenta × riesgo % · distancia en unidades de precio · la unidad predeterminada ·
el lote · el riesgo real y su desviación.

---

## 5. Progressive disclosure — tres niveles

### 5.1 Siempre visible (nivel 0)

Símbolo · cuenta · riesgo % y su equivalente en $ · el campo de stop · el lote. Nada más.
**Cinco cosas** (eran seis; la línea de contrato cae con D-21, §3.3).

### 5.2 Se expande a petición (nivel 1)

- **Ficha del activo** — abre desde el chip de símbolo. Contiene: `contractSize`, `tickSize`,
  `pointSize`, `pipSize`, `volumeStep`, `volumeMin`, divisa, alias, y **la procedencia con su
  fecha** (`mt5:FivePercentOnline@2026-08-02` / `manual` / `heurística`). Es la válvula de
  seguridad del registro: se confía sin preguntar, pero se puede verificar en un segundo.
- **Conmutador de método** y **selector de unidad**.

### 5.3 Aparece solo cuando es cierto (nivel 2)

Los avisos **no son cromo permanente**: ocupan espacio solo cuando su condición se cumple.

- **Estados honestos** (SL = entrada; cuenta/riesgo/entrada no positivos): **sustituyen** la cifra
  de lotes. Nunca conviven con ella.
- **Aviso de redondeo / mínimo de 0.01**: aparece **junto** a la cifra, nunca en su lugar. Es un
  lote real con una advertencia, no un fallo.
- **Marca de procedencia heurística**: aparece en el chip de símbolo solo cuando el registro no
  reconoció el instrumento.

La distinción sustituye-vs-acompaña ya está resuelta en el código enviado y **se conserva
íntegra**: es la doctrina de honestidad del producto, no un detalle de implementación.

---

## 6. Jerarquía visual

### 6.1 El orden de atención, en firme

1. **La cifra de lotes.** Es el producto entero. Debe ser, por márgenes amplios, lo más grande y
   lo de mayor contraste de la pantalla.
2. **El riesgo en dólares** (`$100`). El ancla de confianza: confirma que el modelo hizo lo que se
   le pidió.
3. **El campo de stop.** Donde vive el foco; visualmente presente pero por debajo del resultado.
4. **El contexto** (símbolo, cuenta, riesgo %). Debe leerse como estado, no como formulario.

La jerarquía tiene **cuatro niveles**. El quinto —la línea de contrato— desaparece con D-21 (§3.3).

### 6.2 Qué debe desaparecer visualmente

- **Las etiquetas persistentes.** «Cuenta (USD)» junto a un campo que dice `10 000 USD` es
  redundante en el uso número quinientos. Las etiquetas visibles bajan al token **Label**
  (11 px, `--weight-medium`, `--text-muted`) y, en la superficie compacta, se reducen al sufijo de
  unidad dentro del campo. **Los nombres accesibles se conservan siempre** vía `aria-label` — la
  reducción es visual, nunca semántica.
- **Los bordes de panel entre zonas.** Un divisor `--border` de 1 px basta; tres tarjetas con
  borde y radio compiten con el número.
- **El botón «Calcular».** No existe. El cálculo es continuo.
- **El slider de riesgo.** Fuera del acompañante (§7.3).
- **Todo intermedio del cálculo** (valor del pip, unidades, margen).

### 6.3 La jerarquía es tipográfica, no de elevación

`DESIGN.md` §4 fija la **Regla Plana por Defecto**: las superficies son planas en reposo y las
sombras solo responden a estado. Por tanto **la jerarquía de esta pantalla se construye con tamaño
de letra y color de texto, no con capas ni sombras**. Ninguna zona lleva sombra. El acompañante en
ventana propia sí lleva `--elevation-2`, pero eso es la ventana, no la jerarquía interna.

---

## 7. Diseño de interacción

### 7.1 Foco: la decisión más importante después de la jerarquía

> **Al abrir, el foco va al campo de stop — no al primer campo del DOM.**

Porque el contexto ya está restaurado (P3) y lo único que cambia cada vez es el stop. El orden del
DOM sirve a la accesibilidad; el foco inicial sirve a la velocidad. Son cosas distintas y aquí
divergen deliberadamente.

**Excepción — arranque en frío:** si no hay contexto persistido (primera ejecución), el foco va a
**Cuenta**. Es todo el onboarding que la herramienta necesita: sin tour, sin modal, sin ayuda.
El orden de tabulación conduce naturalmente por cuenta → riesgo → símbolo → stop.

### 7.2 Teclado

| Tecla | Acción | Motivo |
|---|---|---|
| `Enter` (desde cualquier campo) | **Copiar el lote** | La acción terminal, alcanzable sin mover el foco |
| `Tab` / `Shift+Tab` | Orden natural: símbolo → cuenta → riesgo → stop → lote | Accesibilidad estándar |
| `↑` / `↓` en el stop | ± un paso de la unidad activa | Patrón de escalera profesional |
| `Shift + ↑/↓` | ± diez pasos | Magnitud gruesa |
| `Esc` | Vacía **solo** el campo de stop | El contexto nunca se destruye por accidente |
| `Alt+M` | Alterna método distancia ⇄ precios | Modificador obligatorio: una letra suelta se escribiría dentro del campo numérico |
| `Alt+A` | Abre/cierra la Ficha del activo | Ídem |
| `Alt+S` | Foco al chip de símbolo | Cambio de instrumento sin ratón |

**Selección automática:** todo campo numérico selecciona su contenido al recibir foco, de modo que
teclear sustituye. Es el patrón que hace que `Alt+S`, teclear y `Tab` sea más rápido que borrar.

### 7.3 Por qué se elimina el slider de riesgo del acompañante

`app-risk-slider` (0.1–5) tiene sentido en el dock del emulador, donde el riesgo se ajusta
explorando durante la práctica. En el acompañante el riesgo es una **constante de sesión** que se
teclea una vez cada varias semanas. Un control de arrastre para un valor que casi nunca cambia
ocupa espacio permanente y exige ratón — viola P4 y §6.2. Queda el campo numérico.

### 7.4 Validación y errores

Tres reglas, en firme:

1. **La entrada nunca se bloquea, nunca se limpia, nunca se reescribe mientras se teclea.**
   Vinculante: campos `type="text" inputmode="decimal"`, señales de texto crudo, coma decimal
   aceptada, sin escritura de vuelta al DOM en mitad de la edición. Estas son las correcciones F1 y
   F3 ya enviadas y **son requisitos de interacción, no detalles de implementación**.
2. **La validación se expresa como ausencia de respuesta, no como decoración de la entrada.**
   Sin bordes rojos, sin iconos de error en los campos. Si la entrada no permite una respuesta, la
   Zona 3 dice por qué en lugar de mostrar una cifra.
3. **Los estados honestos no son errores y no van en rojo.** Usan `--text-muted`. Ocurren
   constantemente durante el tecleo normal (un campo a medio escribir); pintarlos de `--danger`
   entrenaría al usuario a ignorar el rojo — justo el color que debe conservar su significado.

### 7.5 Copiar: semántica exacta

- **Contenido del portapapeles:** únicamente el número, con punto decimal y dos decimales:
  `2.22`. Sin unidad, sin etiqueta, sin espacios. Pegar «2.22 lotes» rompe el campo de volumen.
- **Confirmación:** la cifra destella brevemente con `--accent` y aparece «Copiado» al lado
  durante ~1.2 s. `--duration-fast`, `--ease-out`; el `prefers-reduced-motion` global ya lo
  neutraliza.
- **Sin auto-copiado al cambiar valores.** El portapapeles es del usuario; sobrescribirlo sin
  gesto es hostil (y la API lo exige de todos modos).
- **Si copiar falla**, se dice: «No se pudo copiar — selecciona y copia». La cifra queda
  seleccionable. Nunca un éxito silencioso falso.
- **Estado desactivado:** cuando hay estado honesto, el afordance de copia se **desactiva, no se
  oculta** — el layout no debe saltar.
- ⚠ **Pendiente de spike:** si el campo de volumen de MT5 bajo Windows en español exige coma
  decimal. Si así fuera, el separador pasa a ser un ajuste (reservado, sin implementar).

---

## 8. Empty states y casos límite

### 8.1 No hay información del activo

**No se bloquea nunca.** Se muestra el lote calculado con el fallback heurístico y se marca el
chip de símbolo con una insignia `--warning` («heurística»). La Ficha explica de dónde salió cada
número.

*Rationale:* negarse a dimensionar un símbolo desconocido es peor que dimensionarlo con el
supuesto declarado — el trader verifica en la Ficha en un segundo y sigue. Es la extensión directa
de la decisión ya enviada de mostrar siempre el `contractSize` aplicado.

### 8.2 Stop inválido

- **SL = entrada** (o distancia 0): la Zona 3 sustituye la cifra por «El SL coincide con la
  entrada.»
- **Campo vacío o texto no numérico**: mismo tratamiento, mensaje propio. Un campo vacío **nunca**
  se lee como cero.

### 8.3 Riesgo cero, cuenta cero o valores no positivos

Sustitución con mensaje propio: «La cuenta, el riesgo y la entrada deben ser valores positivos.»
Se conservan los mensajes ya enviados, verbatim: son decisiones tomadas, no texto de relleno.

### 8.4 El lote toca el mínimo o se redondea

Aparece **junto** a la cifra, en `--warning` sobre `--warning-subtle`, con causa y dirección
explícitas: «El mínimo de 0.01 lotes arriesga $X, por encima de los $Y solicitados.» Umbral de
materialidad: desviación > 1 %.

### 8.5 Arranque en frío

Contexto vacío → valores por defecto `10 000` / `1 %` / sin símbolo, foco en **Cuenta**. Sin tour,
sin modal de bienvenida, sin texto explicativo.

### 8.6 Almacenamiento no disponible

Degrada en silencio a valores por defecto en memoria. Sin aviso: el usuario no puede hacer nada al
respecto y la herramienta sigue siendo correcta.

---

## 9. Design tokens — mapeo completo

### 9.1 Uso de tokens existentes

| Elemento | Tokens |
|---|---|
| Lienzo del acompañante | `--bg` |
| Superficie del panel | `--surface`, borde `--border`, radio `--radius-lg` |
| Divisores entre zonas | `1px solid var(--border)` |
| Campos numéricos | clase `.ui-input`, radio `--radius-sm`, foco `--ring` |
| Etiquetas visibles | Label: 11 px `--text-2xs`, `--weight-medium`, `--text-muted` |
| Valores de contexto | `--text-sm`, `--text` |
| **Cifra de lotes** | `--font-mono` + `tabular-nums`, `--weight-semibold`, color `--text` |
| Riesgo en $ | `--text-md`, `--text`, `.font-mono` |
| Aviso de redondeo | `--warning` sobre `--warning-subtle`, radio `--radius-sm` |
| Insignia de procedencia heurística | patrón `[appBadge]`, `--warning` |
| Estados honestos | `--text-muted`, `--text-base` |
| Destello de copiado | `--accent`, `--duration-fast`, `--ease-out` |
| Ventana acompañante | `--elevation-2` |

**El azul `--accent` no colorea la cifra de lotes.** `DESIGN.md` §6 lo reserva para interacción;
usarlo como color de dato sería decorativo. La cifra va en `--text` (máximo contraste), y el
acento aparece solo en el anillo de foco y en el destello de copiado.

**La cifra usa `--font-mono`** porque `styles.css` ya fija esa regla: la pila monoespaciada es
«for numerical readouts (PnL, prices, **lots**, hex codes)». Se aplica una decisión existente, no
se inventa una.

### 9.2 El único token nuevo, con justificación

La escala tipográfica de `DESIGN.md` termina en **Display 22 px**, dimensionada para una aplicación
donde *«the chart and metrics are the hero»*. En esta herramienta **el número es el gráfico**: no
hay nada más en pantalla que deba ganarle.

> **Propuesta: `--text-hero` = 44 px, `--weight-semibold`, `--leading-none`.**
> Un único token, añadido a la escala de `DESIGN.md` §3 como nivel por encima de Display, con la
> nota de que **su uso está restringido a una cifra única y dominante por pantalla**. En la
> superficie compacta escala a 36 px; nunca por debajo de 32 px, o deja de ser el héroe.

Es la mínima extensión posible del sistema. Cualquier otra necesidad se resuelve con tokens
existentes.

---

## 10. Móvil sin sacrificar escritorio

El diseño ya es reutilizable porque es compacto por requisito, no por adaptación.

**Decisiones que lo habilitan (tomadas ya, sin coste en escritorio):**

- Las tres zonas **se apilan verticalmente**; ninguna depende de estar al lado de otra.
- `inputmode="decimal"` ya está presente por la corrección F1 y regala el teclado numérico.
- Unidades como sufijo dentro del campo: sobreviven a cualquier ancho.
- La cifra-botón es intrínsecamente un objetivo táctil grande.
- Los atajos de teclado degradan a nada; ninguna función depende exclusivamente de ellos.

**Único añadido específico de táctil:** los pasos `↑`/`↓` del stop no existen sin teclado físico,
así que bajo `@media (hover: none)` aparecen **steppers ± discretos** flanqueando el campo. En
escritorio permanecen ocultos.

**Lo que NO se hará para complacer al móvil:**

- **Nada de asistente por pasos.** Es cómodo en móvil y letal en escritorio: convierte tres
  pulsaciones en varias pantallas.
- **Nada de esconder el contexto tras un toque.** En escritorio debe leerse de un vistazo.
- **Nada de agrandar todo por defecto.** La densidad es un requisito profesional; la holgura táctil
  se aplica solo bajo `hover: none`.

---

## 11. Flujo final

### 11.1 Estado estacionario — el 99 % de los usos

```
abrir  →  [contexto restaurado, foco en Stop]  →  «45»  →  leer 2.22  →  Enter  →  pegar en MT5
```

**Un campo, una tecla.** Sin clics de ratón, sin cambios de pantalla, sin botón de calcular.

### 11.2 Cambio de instrumento — varias veces al día

```
Alt+S  →  teclear/elegir símbolo  →  Tab (el foco vuelve a Stop)  →  «45»  →  Enter
```

### 11.3 Cambio de contexto — cada varias semanas

```
Tab hasta Cuenta  →  teclear  →  Tab  →  riesgo %  →  verificar «$100»  →  Tab hasta Stop
```

### 11.4 Verificación de un instrumento — cuando hay duda

```
Alt+A  →  leer la Ficha (contractSize, tick, pip, paso, procedencia + fecha)  →  Alt+A
```

### 11.5 Arranque en frío — una sola vez

```
abrir  →  [foco en Cuenta]  →  10000  Tab  1  Tab  US30  Tab  45  →  Enter
```

---

## 12. Alternativas descartadas

| # | Alternativa | Motivo del descarte |
|---|---|---|
| 1 | **Pestañas** (Main/Risk/Margin/Swaps/Trading, como el Position Sizer EA) | Ese EA coloca órdenes y gestiona cartera. Nosotros tenemos **un** trabajo. Pestañas para una sola tarea son andamiaje |
| 2 | **Selector de dirección (compra/venta)** | Matemáticamente irrelevante (§4.3). El precedente profesional lo incluye solo porque ejecuta |
| 3 | **Lote editable / tarjeta inversa «Desde lotes»** | **Existe precedente profesional** — el EA de referencia permite modificar el tamaño y recalcula el riesgo. Se descarta igualmente: el acompañante **emite una cifra**; invertir el cálculo es otro trabajo, duplica la superficie y compite con el héroe. Descarte consciente, no por desconocimiento |
| 4 | **Intermedios de cálculo** (valor del pip, unidades, margen) al estilo Babypips/FTMO | Patrón educativo. Cada intermedio compite con la única cifra que se copia (P5) |
| 5 | **TP, R:R, comisión, spread, swaps, margen** | Congelados. El gráfico está en MT5; el riesgo realizado por costes es de segundo orden |
| 6 | **Stop por múltiplo de ATR** (lo ofrece el EA) | Exige feed de precios en vivo, que el acompañante no tiene por diseño |
| 7 | **Balance en vivo del bróker** | Congelado. El trader dimensiona sobre el tamaño del challenge, no sobre el equity flotante |
| 8 | **Asistente por pasos** | Óptimo para aprender, pésimo para repetir |
| 9 | **Botón «Calcular»** | El cálculo es continuo. Un submit añade una pulsación a un flujo de tres |
| 10 | **Auto-copiado al cambiar el valor** | Secuestra el portapapeles y la API exige gesto de usuario |
| 11 | **Validación en rojo sobre los campos** | Entrena ceguera al rojo; los estados honestos son frecuentes y normales (§7.4) |
| 12 | **Slider de riesgo en el acompañante** | Control de arrastre para una constante de sesión (§7.3) |
| 13 | **Perfiles/presets de cuenta** | Congelados: esquema reservado, cero sitios de lectura |
| 14 | **Siete bloques de IA** | Siete contenedores para cuatro entradas y una salida (§3) |

---

## 13. Trade-offs asumidos, en firme

1. **Velocidad por encima de autoverificación** (§4.1). La distancia por defecto ahorra ~80 % del
   tecleo y pierde algo de detección de errores de magnitud. Compensado con **dos** mitigaciones:
   el riesgo en dólares visible y constante en la Zona 1, y la unidad como sufijo dentro del campo.
   La tercera mitigación propuesta (el `$/punto` de la posición) **cae con D-21**, de modo que este
   trade-off se asume con menos cobertura de la que tenía el diseño original. **Si el owner detecta
   en uso real un solo error de magnitud, el predeterminado se invierte** — es reversible y no
   congelado.
2. **Densidad por encima de holgura.** `PRODUCT.md` §Design Principles pide «Clarity over
   Density». Aquí se tensiona deliberadamente: seis elementos visibles, mucho aire alrededor del
   héroe y ninguno alrededor del contexto. **No se viola el principio; se aplica priorizando qué
   respira.**
3. **Atajos por encima de descubribilidad.** `Alt+M`, `Alt+A`, `Alt+S` no son evidentes. Es
   aceptable con un único usuario experto que los aprende una vez; la Ficha los lista.
4. **La cifra-como-botón por encima de un botón explícito.** Gana espacio y jerarquía; pierde
   evidencia. Mitigado con el glifo ⧉ y el `title`.
5. **Etiquetas reducidas por encima de autoexplicación.** Correcto en el uso 500, hostil en el
   uso 1. Se acepta porque el uso 1 ocurre una sola vez y el arranque en frío lo cubre por foco.

---

## 14. Lo que el implementador NO debe decidir

Está todo fijado arriba: zonas y su orden (§3) · qué se pregunta y qué no (§4.3) · método y unidad
por defecto (§4.1, §4.2) · niveles de disclosure (§5) · orden de atención (§6.1) · qué desaparece
(§6.2) · foco inicial y su excepción (§7.1) · tabla de atajos (§7.2) · reglas de validación
(§7.4) · payload y confirmación de copiado (§7.5) · todos los empty states y sus mensajes verbatim
(§8) · mapeo de tokens y el único token nuevo (§9) · comportamiento táctil (§10).

**Queda abierto solo:** el separador decimal del portapapeles (§7.5, depende del spike de MT5) y
el valor exacto de `--text-hero` dentro del rango 36–44 px, que se ajusta al ancho real de la
ventana acompañante una vez medida.
