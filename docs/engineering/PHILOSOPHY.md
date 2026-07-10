# Filosofía de Ingeniería

> **Qué es este documento.** No describe el repositorio: describe el *proceso mental* que lo
> construyó. Es la síntesis de segundo nivel del arquitecto que ejecutó la migración
> RFC-001→013, la transición a R2, la migración a Supabase y los ciclos SDD de este repo —
> extraída de la evidencia real (32 PRs, ledgers, auditorías, incidentes) antes de su retiro.
> Es la **base conceptual** de todos los demás activos (`CLAUDE.md`, knowledge base,
> comandos, agentes). Cuando un documento operativo contradiga a este, gana este; cuando
> este contradiga al usuario, gana el usuario.

---

## 0. La postura fundamental

**La confianza es el recurso central de la ingeniería con agentes: se construye con
evidencia, se acumula en código auditado, y se gasta cada vez que cambias algo.**

Todo lo demás en este documento deriva de esa frase:

- Se **mide** porque la opinión no genera confianza; la evidencia sí.
- Se **audita** porque la confianza no se autodeclara: la otorga un revisor que no escribió el código.
- Se **reutiliza maquinaria auditada** porque cada sistema nuevo nace con confianza cero,
  mientras que el existente ya pagó sus auditorías.
- Se exige **evidencia antes de afirmar "terminado"** porque una afirmación sin evidencia
  gasta confianza del sistema completo, no solo de esa tarea.

---

## 1. Epistemología: cómo se sabe algo aquí

### 1.1 La evidencia precede a la afirmación
Nunca se declara verde sin salida fresca de los gates (tsc, tests, lint, build). Un informe
de implementador es una *afirmación*, no evidencia: el auditor final re-ejecuta todos los
gates él mismo, siempre.
*Evidencia:* en cada auditoría final de RFC-008..013 el auditor re-corrió la suite completa
aunque el ledger ya reportaba verde.

### 1.2 Medir antes que opinar
Ante una pregunta de rendimiento, el primer acto es instrumentar; la decisión la toman los
órdenes de magnitud, no la intuición. Una optimización **rechazada con su número registrado**
vale tanto como una implementada: impide que el siguiente ingeniero la re-proponga.
*Evidencia:* la paralelización de descargas se rechazó al medir fetch ≈ 3.8 s vs ingest
IndexedDB ≈ 700 s (ahorro < 1 %); los Web Workers se rechazaron al medir la suma de render
≪ 16 ms/frame.

### 1.3 El código vivo es la única verdad
Los nombres mienten y el código muerto parece vivo. Antes de planificar alrededor de una
función, se buscan sus *call sites de producción*; una función solo referenciada por specs
no es una ruta viva.
*Evidencia:* el plan de RFC-011 asumió que `reconstructWorkspaces` era la ruta de
restauración; era código muerto solo usado por specs — la ruta viva era `materializeAndOpen`
en la página de sesiones. El gap costó un fix posterior.

### 1.4 Reproducir antes que arreglar
Un fallo que no puedes reproducir de forma determinista es un fallo que no entiendes
todavía. Si la reproducción no existe, se *ingenia*: se controla el orden, la caché, la
concurrencia hasta que el fallo sea una función y no una lotería.
*Evidencia:* los tests flakys de PR #23 solo cayeron tras construir una reproducción con
fork único + secuenciador custom + borrado de `node_modules/.vite` para forzar la carrera
de optimizeDeps.

### 1.5 Entender el mecanismo, no el síntoma
Los arreglos se derivan de un modelo causal de *cuándo y por qué* ocurre el fallo, no de
probar mitigaciones contra el síntoma. Si el arreglo funciona pero no sabes por qué, no
está terminado.
*Evidencia:* el eco de sincronización de rango no se resolvió con flags de re-entrada
(síntoma) sino al entender que lightweight-charts v5 difiere sus callbacks al siguiente
animation frame (mecanismo) — de ahí la supresión one-shot armada a través del RAF.

---

## 2. Filosofía arquitectónica

### 2.1 El dominio en el centro; los frameworks son periféricos
Las dependencias apuntan hacia el dominio. El motor no sabe qué framework lo hospeda ni qué
store lo alimenta; la comunicación cruza la frontera como datos inmutables
(`RenderModel`) y eventos (`ChartEventBus`), nunca como referencias al framework.

### 2.2 Núcleo cerrado, extensión abierta
El core se cierra a modificación una vez auditado; la funcionalidad nueva entra como
extensión (*Capability*), no como edición del núcleo. Reabrir el núcleo exige un RFC, no
una conveniencia.

### 2.3 Un dueño para cada dato
Cada pieza de estado tiene exactamente un soberano (el agregado Session posee layout,
dibujos y grupos de enlace; las velas viven *debajo* del agregado, compartidas por
referencia, jamás copiadas). La mayoría de los bugs de sincronización son disputas de
soberanía no resueltas.

### 2.4 Parse, don't trust
Todo dato que cruza una frontera (red, disco, versión antigua de un payload) se valida en
forma antes de usarse, con fallback seguro definido.
*Evidencia:* `typeof null === 'object'` dejó pasar un payload V2 malformado hasta que se
añadió el shape-guard con fallback a panel único.

### 2.5 Reutilizar maquinaria auditada, nunca duplicar sistemas
Ante una necesidad nueva, la primera pregunta es «¿qué componente ya auditado se extiende?»
y no «¿qué construyo?». Un sistema paralelo duplica los bugs y resetea la confianza a cero.
*Evidencia:* todo el bloque multi-chart (008–012) se construyó extendiendo el mapper local,
el cursor de replay y el caché de velas *existentes*; R4 dice literalmente «formaliza, NO
introduce».

### 2.6 Reservar sin implementar
Cuando el diseño anticipa una necesidad futura pero no hay demanda medida, se reserva el
punto de extensión (un campo, una interfaz) con **cero sitios de lectura**, y la auditoría
verifica que sigue sin usarse. Anticipar es barato; implementar por anticipado no.
*Evidencia:* `syncPriceScale` existe como campo reservado; las auditorías verifican «sin
control de UI» como invariante.

### 2.7 Los invariantes deben ser ejecutables
Una regla arquitectónica que no puede verificarse mecánicamente (un grep, un test, una
sonda de build) se erosionará en silencio. Cada invariante se formula junto a su detector.
*Evidencia:* las auditorías finales corren greps de invariantes (archivos prohibidos con
diff cero, ausencia de factory selectors, cero dependencias nuevas) además de leer el código.

### 2.8 La complejidad paga alquiler
Cada abstracción debe poder señalar el defecto concreto que previene o la auditoría que
pasó. Una abstracción que no puede justificarse así es un pasivo.
*Evidencia:* se prohibieron los factory selectors compartidos no por estilo, sino porque su
memoización de ranura única produce 0 % de aciertos con N paneles — un defecto ya corregido
una vez (P1, `memoizeMap`) que la regla impide reintroducir.

### 2.9 El rendimiento es un presupuesto, no una virtud
Existe un presupuesto explícito (16 ms/frame; topes duros como `MAX_PANELS_PER_TAB = 8`) y
se optimiza únicamente la brecha *medida* contra él. Optimizar sin brecha medida es
sobre-ingeniería con otro nombre.

---

## 3. Proceso de toma de decisiones

### 3.1 Jerarquía de autoridad
Los conflictos se resuelven hacia arriba, nunca lateralmente:

1. **Dirección explícita del usuario** (siempre gana).
2. **Decisiones congeladas y no-goals escritos** (revocables solo por decisión explícita, nunca de paso).
3. **Principios arquitectónicos** (ROADMAP / este documento).
4. **Convenciones del repositorio** (formatos, idiomas, flujos).
5. **Juicio local del agente** (todo lo demás).

Un agente que quiera hacer algo prohibido por el nivel 2–4 no lo negocia consigo mismo: lo
plantea al nivel 1.

### 3.2 Las decisiones tienen identidad
Las decisiones importantes reciben un identificador (D1…D9, R1…R4) y quedan escritas con su
racional. Eso las hace **citables** en planes y ledgers, **auditables** («¿se respetó D8?»)
y **revocables solo explícitamente**. Una decisión sin nombre se re-litiga cada sesión.

### 3.3 Los no-goals son artefactos de primera clase
El alcance se defiende por escrito *antes* de escribir código. Una lista de no-goals con
racional (no docking libre, no workers, no multi-símbolo) previno la expansión de alcance
durante cinco RFCs consecutivos. Decir qué NO se hará es más valioso que decir qué sí.

### 3.4 Preferir lo reversible; subir la ceremonia cuando no lo sea
Cambio reversible → se hace y se documenta. Cambio difícil de revertir (esquema de
persistencia, API pública de un dominio, borrado) → sube la ceremonia: spec, decisión con
identidad, migración versionada con tests de ida y vuelta.

### 3.5 Asimetría del coste del error
No todos los hallazgos pesan igual: el pragmatismo es aceptable en código de test
(aserciones sobre APIs privadas, idiomas de test), inaceptable en rutas de producción. Un
hallazgo puede quedar **«ruled no-fix» con su razón escrita**, para que no se re-litigue en
la siguiente auditoría.

### 3.6 Cuándo parar
El estado final se define **antes de empezar** (Definition of Done / «Estado Esperado»).
«Parece terminado» no es un estado; «gates verdes + DoD punto por punto» sí. Lo mismo
aplica a optimizar: se para cuando el presupuesto se cumple, no cuando se acaban las ideas.

---

## 4. Metodología de resolución de problemas

El bucle de debugging, en orden estricto:

1. **Reproducir de forma determinista.** Si no hay reproducción, se construye (control de
   orden, caché, concurrencia). Sin reproducción no hay diagnóstico, solo superstición.
2. **Hipótesis sobre el mecanismo.** Un modelo causal de *por qué* ocurre, formulado de modo
   que la reproducción pueda confirmarlo o refutarlo.
3. **Arreglar en la capa que puede garantizar el arreglo.** Si la capa cliente no puede
   expresar la garantía, el arreglo baja a la capa que sí puede.
   *Evidencia:* supabase-js no puede expresar el upsert condicional LWW → la guarda se movió
   a un trigger `BEFORE UPDATE` en la base de datos y el cliente quedó simple.
4. **Verificar bajo las condiciones originales del fallo** (la misma carrera, el mismo
   orden, la misma caché fría), no bajo condiciones cómodas.
5. **Convertir el incidente en regla nombrada** con detección y recuperación escritas. Un
   incidente sin regla es un incidente que se repetirá con otro agente.
   *Evidencia:* la poda de lockfile de npm 11 se convirtió en la regla «`npm ci --dry-run`
   antes de commitear el lock; restaurar entradas textualmente desde origin/main».

---

## 5. Organización del trabajo: patrones cognitivos

### 5.1 Escribir es decidir
El spec y el plan no documentan decisiones ya tomadas: son la *herramienta con la que se
toman*. El ciclo es brainstorm → spec → plan → ejecución, cada uno en su propia sesión,
conectados por artefactos committeados (el plan, el «master prompt», el handoff). El
trabajo se estructura para **sobrevivir a la pérdida de contexto**: cualquier sesión nueva
puede retomar desde los artefactos, sin la conversación original.

### 5.2 Ceremonia proporcional al riesgo — y el proceso también se adapta
Una corrección de UI no exige un RFC; una migración de esquema sí. El propio proceso es
adaptable bajo restricciones: cuando los recursos no permiten auditoría por tarea, se
degrada explícitamente a «dispatches agrupados + una única auditoría final de rama», y esa
degradación se **anota en el ledger como modo del run**, no se improvisa en silencio.
*Evidencia:* RFC-013 corrió en modo restringido y salió con 0 hallazgos Critical/High/Medium.

### 5.3 El paso más pequeño que compila en verde
Cada commit compila, testea y funciona. La expansión va primero (código nuevo inerte:
acciones, campos, componentes sin montar) y el cutover después, en un paso separado y
pequeño. Si dos cambios están acoplados por tipos y no pueden separarse en verde, se
fusionan en una tarea atómica — nunca se commitea un intermedio rojo.

### 5.4 Separación de roles: quien implementa no se audita a sí mismo
Aun dentro de una misma mente (o un mismo modelo), los roles se separan: el orquestador
planifica y coordina, el implementador ejecuta con alcance acotado, el auditor revisa la
rama completa **re-ejecutando la evidencia**. La regla de oro: *nunca aceptar tu propio
informe como prueba*.

### 5.5 Atención dirigida por riesgo
El esfuerzo de revisión no se reparte uniformemente: el ledger y los informes de tarea
**señalan** al auditor los diffs más grandes y los usos de API privada («FINAL-AUDIT
ATTENTION»), y ahí se lee línea a línea. La atención es un recurso finito; se presupuesta.

### 5.6 Honestidad de desviación
Cuando la realidad diverge del plan, la desviación se documenta y clasifica (inerte /
requiere atención), jamás se oculta ni se «reinterpreta» el plan. Un plan violado en
silencio invalida la auditoría que se apoya en él.

### 5.7 Los specs preexistentes son autoridad (regla STOP)
Un test que ya existía expresa una decisión de alguien más. No se modifica para acomodar el
cambio propio; si parece incorrecto, se escala como hallazgo, no se «arregla» de paso.
*Evidencia:* en RFC-013 se dejó `headerLabel()` redundante a propósito antes que tocar un
spec preexistente.

### 5.8 Los límites duros son constantes con nombre y motivo
`MAX_PANELS_PER_TAB = 8` («tope duro derivado de rendimiento») y no un parámetro
configurable. Un límite con nombre y racional es auditable; un parámetro abierto es una
invitación a la deriva.

---

## 6. Cultura de conocimiento

### 6.1 Nada valioso vive solo en una conversación
Toda lección que costó tiempo real (un incidente, una medición, una decisión de modelado)
se externaliza en un artefacto permanente antes de cerrar el run. La conversación es un
buffer, no un almacén.

### 6.2 Cada run termina con destilación
El final de un run no es el merge: es el post-mortem que convierte lo aprendido en reglas
nombradas (con *por qué* y *cómo aplicarlo*). Este documento existe porque esa disciplina
se aplicó a sí misma.

### 6.3 El repositorio debe enseñar a su próximo ingeniero
El criterio de éxito de toda la documentación es uno: **un agente competente que clone este
repo mañana, sin ninguna conversación histórica, debe poder trabajar al nivel del que se
fue.** Cada documento se juzga por cuánto contexto futuro elimina, no por cuánto describe.

---

## 7. Cómo usar este documento

- **Agentes:** leedlo antes de trabajar. Ante un conflicto entre vuestro juicio local y un
  principio de aquí, gana el principio — salvo que el usuario diga lo contrario (§3.1).
- **Extensión:** este documento evoluciona por PR, como el código. Un principio nuevo debe
  llegar con su evidencia; un principio que pierda vigencia se marca revocado con fecha y
  motivo (no se borra).
- **Jerarquía documental:** `PHILOSOPHY.md` (por qué) → `CLAUDE.md` (kernel operativo) →
  `docs/engineering/*.md` (playbooks) → `docs/engineering/domain/*.md` (dominio). Los
  playbooks aplican estos principios; no los repiten.
