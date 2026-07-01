# RFC 012: Performance

## Objetivo
Endurecer el rendimiento del sistema multi-panel bajo carga realista (hasta
`MAX_PANELS_PER_TAB = 8` paneles simultaneos): formalizar y documentar el cache de velas
compartido por simbolo **ya existente**, introducir render update-gated/virtual apoyado en
`PanelRuntime.visible` (D6), creacion lazy de charts en el primer `show`, y actualizaciones
incrementales. Perfilar con 8 paneles activos y optimizar unicamente las brechas de
presupuesto que el perfilado confirme, no de forma especulativa.

## Motivacion
RFC-008 a RFC-011 completan la funcionalidad del sistema multi-panel: host, ciclo de vida,
sincronizacion y persistencia. Ninguno de ellos garantiza que el sistema sea fluido con el
numero maximo de paneles permitido. El riesgo central identificado en el Documento de Vision
para este RFC es la sobre-ingenieria: la tentacion de introducir infraestructura pesada
(Web Workers, un segundo sistema de cache) antes de confirmar con datos que existe una
brecha real de rendimiento. La suma de render ya auditada en el motor mono-core es muy
inferior al presupuesto de 16ms/frame, y el overhead de `postMessage` hacia un Web Worker no
se justifica a la escala de 8 paneles. Por eso este RFC se estructura alrededor de "formalizar
lo que ya funciona" y "perfilar antes de optimizar", en vez de diseñar nueva infraestructura
de rendimiento de forma preventiva.

## Decision Arquitectonica
1. **Formalizacion del cache de velas compartido por simbolo — SIN cache nuevo (R4).**
   - El sistema ya mantiene, por simbolo, una serie de velas compartida (IndexedDB como
     almacenamiento de origen para el dataset local, con la serie residente en memoria referenciada
     por identidad durante la sesion de uso). RFC-012 **no introduce ninguna estructura de
     cache nueva**: documenta formalmente el contrato existente — "N paneles que muestran el
     mismo simbolo referencian la misma serie por identidad, nunca una copia" — y lo convierte
     en un invariante verificado por tests, no solo en un comportamiento incidental del codigo
     actual.
   - Concretamente: si dos `PanelDescriptor` distintos tienen el mismo `symbol`, sus respectivos
     `ChartModelMapper` locales (RFC-008) deben resolver la misma referencia de array/estructura
     de velas subyacente al construir su `RenderModel`, verificable con un test de identidad de
     referencia (`===` sobre el array de velas fuente, no solo igualdad estructural profunda).
   - Esta formalizacion es la base que hace seguro escalar a 8 paneles sin multiplicar el uso
     de memoria por el numero de paneles que comparten simbolo.

2. **Render update-gated (D6), construido sobre `PanelRuntime.visible` de RFC-009.**
   - RFC-009 ya introduce el gating de `visible` como mecanismo de ciclo de vida (no destruir,
     pero no actualizar un engine oculto). RFC-012 formaliza ese mismo mecanismo como la
     estrategia de rendimiento primaria del bloque: un panel oculto consume cero ciclos de
     render/layout de `lightweight-charts`, independientemente de cuantas actualizaciones de
     datos ocurran mientras esta oculto (avance de replay, nuevas velas).
   - Al volver a `visible = true`, el panel aplica el `RenderModel` mas reciente de una sola vez
     (no repite cada actualizacion intermedia que ocurrio mientras estaba oculto), evitando
     gastar render en frames que el usuario nunca vio.
   - No se introduce virtualizacion de viewport fisico mas alla de esto (p. ej. no se recorta
     el render de un panel parcialmente visible dentro de una celda de grid); el gating es
     binario por `visible`, consistente con la topologia de grid+tabs de un solo nivel (RFC-008)
     donde un panel esta completamente visible o completamente oculto (pertenece a la pestaña
     activa/celda activa o no).

3. **Creacion lazy de charts en el primer `show`.**
   - `ChartRegistry` (RFC-009) no instancia un `ChartEngine` para un panel en el momento en que
     `PanelRegistry.createPanel` lo agrega al layout, si ese panel nace en una pestaña/celda no
     activa. La instancia de engine se crea la primera vez que el panel transiciona a
     `visible = true`.
   - Esto acota el costo de abrir multiples pestañas con paneles preconfigurados (p. ej. al
     restaurar un `WorkspaceLayout` completo desde `SessionPayloadV2`, RFC-011) al costo de
     crear solo los engines de la pestaña activa en el momento de la restauracion, no los 8
     paneles de las 3 pestañas que el usuario todavia no abrio.

4. **Actualizaciones incrementales.**
   - Sobre paneles visibles, las actualizaciones de datos (nueva vela de replay, tick de precio)
     se aplican como delta incremental al `ChartEngine` (API incremental que `lightweight-charts`
     ya expone y que el motor auditado ya usa en el caso mono-core), nunca como
     `setData()` completo salvo en la carga inicial o en la resincronizacion tras salir de
     `visible = false` (punto 2). Esto es una extension directa del patron ya auditado en el
     `ChartComponent` mono-core hacia el caso N-paneles, no un mecanismo nuevo.

5. **Explicitamente SIN Web Workers (D7).**
   - El bloque RFC-008..012 no introduce ningun pipeline de replay o de render off-main-thread.
     La decision se basa en que la suma de trabajo de render ya auditada es sustancialmente
     menor al presupuesto de 16ms/frame incluso proyectado a 8 paneles, y el overhead de
     serializacion/`postMessage` hacia un Worker no se justifica sin evidencia medida de una
     brecha real.
   - Esta es una decision de alcance, no una prohibicion permanente: si el perfilado del punto 6
     revela una brecha de presupuesto que las optimizaciones de este RFC no resuelven, la
     introduccion de Web Workers queda como un RFC futuro dedicado, fuera de este bloque.

6. **Perfilado con 8 paneles activos; optimizar solo brechas medidas.**
   - Metodologia: escenario de prueba con `MAX_PANELS_PER_TAB = 8` paneles simultaneamente
     visibles (peor caso dentro de una pestaña), avanzando el reloj de replay a velocidad
     sostenida, midiendo tiempo de frame end-to-end (desde tick del reloj hasta pintado de los
     8 canvases).
   - Solo se implementan optimizaciones adicionales a las de los puntos 1-4 si el perfilado
     documenta una brecha concreta contra el presupuesto de 16ms/frame, y la optimizacion se
     dirige especificamente a la brecha medida (p. ej. si el cuello de botella medido es
     recalculo de indicadores, se optimiza eso — no se agrega infraestructura generica no
     relacionada con el hallazgo).
   - El resultado del perfilado (metodologia, numeros, y brechas encontradas o su ausencia) se
     documenta como parte del Implementation Plan de este RFC, no queda como conocimiento
     tribal.

7. **Alcance explicitamente fuera de RFC-012:** cualquier cache nuevo o adicional al ya
   existente por simbolo (R4, prohibido explicitamente); Web Workers (D7, prohibido
   explicitamente salvo brecha medida y RFC futuro dedicado); virtualizacion de viewport fisico
   parcial dentro de una celda.

## Impacto
- **Positivo:** El sistema multi-panel escala al limite de `MAX_PANELS_PER_TAB = 8` sin
  multiplicar uso de memoria (cache por simbolo formalizado) ni gastar render en paneles no
  vistos (update-gating + lazy creation).
- **Riesgo:** Sobre-ingenieria — construir infraestructura de rendimiento (workers, caches
  adicionales) sin evidencia de que se necesite. Mitigacion: la secuencia de este RFC es
  explicitamente perfilar primero (punto 6), optimizar despues, y solo lo que el perfilado
  senale; los puntos 1-4 son formalizacion de patrones ya existentes, no nueva infraestructura
  especulativa.
- **Riesgo:** Que la formalizacion del cache compartido (punto 1) revele, al testear, que el
  codigo actual en realidad SI copia series en algun camino no auditado. Mitigacion: el test de
  identidad de referencia del punto 1 esta diseñado precisamente para detectar esto como parte
  del propio RFC, antes de escalar a 8 paneles en produccion.

## Estado Esperado
Al finalizar, el emulador compilara con `npx tsc -p tsconfig.app.json --noEmit` sin errores;
un test de identidad de referencia confirmara que paneles con el mismo simbolo comparten la
misma serie de velas en memoria; un test de gating confirmara que un panel con
`PanelRuntime.visible = false` no invoca ningun metodo de update/render de su `ChartEngine`
mientras el reloj de replay avanza, y que al volver a `visible = true` se resincroniza
correctamente a una sola aplicacion del `RenderModel` vigente; la creacion de un
`WorkspaceLayout` con paneles en pestañas no activas no instanciara `ChartEngine` para esos
paneles hasta su primer `show`; y el informe de perfilado con 8 paneles activos (documentado en
el Implementation Plan del RFC) mostrara el tiempo de frame medido contra el presupuesto de
16ms, con cualquier optimizacion adicional justificada explicitamente por una brecha ahi
documentada — sin introduccion de Web Workers ni de un segundo cache de velas.
