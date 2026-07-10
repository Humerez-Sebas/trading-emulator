# Engineering Knowledge Roadmap: Ruta de Descubrimiento Arquitectónico

Este documento establece la hoja de ruta intelectual y la secuencia de diseño estratégico para consolidar el conocimiento arquitectónico del emulador de trading antes de reabrir el desarrollo de nuevos RFCs de código. Cada etapa depende lógica y técnicamente de la anterior.

---

## Secuencia General del Roadmap

```
  [ TRAINING_WORKFLOW.md ] (Existente)
             |
             v
  [ UBIQUITOUS_LANGUAGE.md ]
             |
             v
     [ DOMAIN_MODEL.md ]
             |
             v
    [ EVENT_STORMING.md ]
             |
             v
   [ PRODUCT_PRINCIPLES.md ]
             |
             v
  [ ARCHITECTURE_VISION.md ]
             |
             v
     [ RFC-014+ (Codes) ]
```

---

## Detalle de las Etapas del Roadmap

### Etapa 1: UBIQUITOUS_LANGUAGE.md (Glosario del Lenguaje Ubicuo)
* **Objetivo:** Establecer una única fuente de verdad terminológica compartida entre el negocio (trader) y la ingeniería (código) para evitar ambigüedades.
* **Preguntas que responde:** 
  * ¿Cómo llamamos formalmente a cada concepto del dominio (p. ej., "Espera Activa", "Ventana Operativa", "Desviación Temporal")?
  * ¿Qué términos técnicos o de interfaz estamos usando erróneamente para referirnos a conceptos del dominio?
* **Qué conocimiento captura:** Un glosario estructurado con términos en español e inglés, sinónimos prohibidos y definiciones conceptuales rigurosas.
* **Dependencias:** `TRAINING_WORKFLOW.md` (que contiene las descripciones de comportamiento iniciales).
* **Artefactos que habilita:** `DOMAIN_MODEL.md` (las entidades y tipos en TypeScript deben coincidir al 100% con este glosario).
* **Riesgos si se omite:** *Concept Drift* (desviación de significado). El código comenzará a usar clases con nombres ambiguos, lo que fragmentará el entendimiento entre programadores y analistas del dominio.
* **Prioridad:** **Crítica (1).**
* **Valor arquitectónico:** Muy alto. Define el espacio semántico de la base de código.

---

### Etapa 2: DOMAIN_MODEL.md (Modelo conceptual de Entidades, Agregados e Invariantes)
* **Objetivo:** Mapear los elementos estructurales y de datos que intervienen en la simulación y definir las reglas algebraicas y de consistencia lógica que nunca pueden romperse.
* **Preguntas que responde:**
  * ¿Cuáles son las entidades de nuestro dominio (p. ej., `Position`, `Order`, `Candle`, `Drawing`)?
  * ¿Qué elementos actúan como Agregados Raíz (`Aggregate Roots`)?
  * ¿Cuáles son los invariantes duros (p. ej., "El lotaje se calcula siempre a partir del riesgo y el Stop Loss", "No puede haber un SL superior al precio en un trade de compra")?
* **Qué conocimiento captura:** Diagramas de objetos conceptuales, estructuras de datos simplificadas y pseudocódigo/reglas matemáticas de validación de invariantes.
* **Dependencias:** `UBIQUITOUS_LANGUAGE.md` (aporta la nomenclatura de clases y propiedades).
* **Artefactos que habilita:** `EVENT_STORMING.md` (necesitamos saber qué entidades reaccionan a los eventos).
* **Riesgos si se omite:** Regresiones lógicas en el motor de ejecución. Las validaciones de riesgo y órdenes se esparcirán en la capa de presentación (Angular) en lugar de estar encapsuladas en el dominio.
* **Prioridad:** **Alta (2).**
* **Valor arquitectónico:** Crítico. Establece las fronteras de consistencia de datos de la aplicación.

---

### Etapa 3: EVENT_STORMING.md (Modelo Dinámico de Eventos de Dominio)
* **Objetivo:** Modelar cómo cambia el sistema a lo largo del tiempo, capturando las órdenes (comandos), eventos de dominio y lecturas reactivas.
* **Preguntas que responde:**
  * ¿Qué evento se dispara cuando avanza el tiempo (`ReplayClockAdvanced`)?
  * ¿Cómo reacciona el motor de simulación para llenar una orden y qué evento publica (`OrderFilled`)?
  * ¿Qué eventos visuales deben sincronizarse entre paneles y cuáles deben permanecer aislados?
* **Qué conocimiento captura:** Mapeo de la línea de tiempo temporal, comandos (acciones del usuario), eventos de dominio (hechos pasados) y modelos de lectura (proyecciones reactivas).
* **Dependencias:** `DOMAIN_MODEL.md` (aporta los agregados que despachan comandos y emiten eventos).
* **Artefactos que habilita:** `ARCHITECTURE_VISION.md` (las fronteras naturales de eventos delimitan los Bounded Contexts).
* **Riesgos si se omite:** Acoplamiento temporal e inconsistencias de estado reactivo (p. ej., que al retroceder el tiempo las órdenes queden en un limbo de estado).
* **Prioridad:** **Media-Alta (3).**
* **Valor arquitectónico:** Muy alto. Diseña la infraestructura de eventos locales (Local Event Bus) de la aplicación.

---

### Etapa 4: PRODUCT_PRINCIPLES.md (Principios de Diseño de Producto y Experiencia de Usuario)
* **Objetivo:** Definir las directrices que gobiernan la interacción, la visualización de datos y el comportamiento gráfico para evitar sobrecargar cognitivamente al trader.
* **Preguntas que responde:**
  * ¿Cómo debemos representar el flujo temporal para evitar la fatiga física por clicks consecutivos?
  * ¿Qué reglas rigen el renderizado gráfico para evitar desalineaciones en las escalas Y/X?
  * ¿Cómo se traduce el principio de "Higiene Visual" en la interfaz?
* **Qué conocimiento captura:** Directrices de diseño UX, reglas de interacción, tokens de diseño y principios de legibilidad técnica de datos financieros.
* **Dependencias:** `TRAINING_WORKFLOW.md` (aporta las fricciones y el modelo mental observado).
* **Artefactos que habilita:** El diseño visual e interactivo de los componentes de la interfaz en los futuros RFCs.
* **Riesgos si se omite:** Construir pantallas confusas o llenas de ruido ("efecto casino") que distraigan al trader de su objetivo de aprendizaje deliberado.
* **Prioridad:** **Media (4).**
* **Valor arquitectónico:** Medio. Asegura la coherencia visual e interactiva del sistema.

---

### Etapa 5: ARCHITECTURE_VISION.md (Fronteras del Sistema y Mapa de Contextos)
* **Objetivo:** Delimitar formalmente los Bounded Contexts y establecer cómo se comunican las distintas capas (Capa de Anti-Corrupción, Shared Kernel, etc.).
* **Preguntas que responde:**
  * ¿Qué contextos (p. ej., `SimulationContext`, `MarketDataContext`, `PresentationContext`) deben estar completamente aislados?
  * ¿Cómo interactúa el almacenamiento local (IndexedDB) con la base de datos cloud (Supabase) bajo el principio offline-first?
  * ¿Cómo se estructurará la capa de mapeo de estado (NgRx) para respetar la pureza del motor gráfico?
* **Qué conocimiento captura:** Diagrama de Context Mapping, mapa físico de directorios del proyecto y especificación de patrones arquitectónicos a implementar (CQRS local, repositorios y traductores ACL).
* **Dependencias:** `DOMAIN_MODEL.md` y `EVENT_STORMING.md` (aporta los límites funcionales y flujos de datos).
* **Artefactos que habilita:** Todos los futuros **RFCs técnicos** (RFC-014 en adelante) de código, sirviendo como el plano maestro que todo desarrollador debe respetar.
* **Riesgos si se omite:** Caos y desorden en el código. Los límites de los Bounded Contexts se desdibujarán, provocando que el código vuelva a acoplarse con librerías externas o frameworks en lugares inapropiados.
* **Prioridad:** **Alta (5).**
* **Valor arquitectónico:** Crítico. Establece el diseño estratégico y táctico del software a largo plazo.
