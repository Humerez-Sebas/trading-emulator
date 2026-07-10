# Dominio de Entrenamiento: Flujo de Trabajo del Trader (TRAINING_WORKFLOW.md)

Este documento define la filosofía, el modelo mental y la dinámica conceptual del entrenamiento discrecional del trader utilizando simulación histórica. Describe el comportamiento del usuario de forma agnóstica de la tecnología y de la estrategia técnica particular, asegurando que siga siendo válido incluso si cambian las metodologías de análisis, las interfaces de usuario o el stack de desarrollo.

---

## 1. El Modelo Mental del Entrenamiento (Ciclo Cognitivo)

El entrenamiento de un trader no es una secuencia de comandos, sino una transición entre estados cognitivos y toma de decisiones. Este proceso se define por el siguiente flujo de estados:

```
               [ Definición de Parámetros ]
                            |
                 [ Construcción del Contexto ]
                            |
            [ Espera Activa de Ventana Operativa ]
                            |
             [ Esperar Confirmación del Setup ]
                            |
                 [ Ejecución de la Orden ]
                            |
                 [ Gestión de la Posición ]
                            |
                  [ Registro y Reevaluación ]
```

### Detalle del Proceso Cognitivo:

1. **Definición de Parámetros de Práctica:**
   * **Objetivo:** Acotar el espacio de entrenamiento mediante la selección de un activo y un rango de tiempo histórico específico para aislar la variable bajo estudio (p. ej., practicar un patrón específico durante un mes de alta volatilidad).

2. **Construcción del Contexto Macro:**
   * **Objetivo:** Responder a la pregunta: *¿Dónde está situado el precio respecto al pasado y cuál es la estructura dominante?*
   * **Cognición:** El trader busca los límites de valor histórico y las tendencias estructurales de mediano/largo plazo. Esta fase se considera completa cuando el trader ha identificado y delimitado las **Zonas de Interés** donde espera una interacción relevante, estableciendo una hipótesis direccional antes de avanzar el tiempo.

3. **Espera Activa de la Ventana Operativa:**
   * **Objetivo:** Filtrar el tiempo de no-operación y enfocar la atención mental únicamente en períodos donde la volatilidad y la liquidez son coherentes con las reglas de la estrategia.
   * **Cognición:** El trader suspende la toma de decisiones comerciales y avanza el tiempo de forma rápida, evitando el cansancio mental de observar mercados planos o sin volumen relevante.

4. **Espera Activa de la Confirmación del Setup:**
   * **Objetivo:** Responder a la pregunta: *¿El precio se comporta de acuerdo a las reglas de activación de mi estrategia al interactuar con mi zona de interés?*
   * **Cognición:** Una vez que el precio entra en la Zona de Interés durante la ventana operativa, el trader reduce la velocidad de avance (o evalúa de manera intrabar) para observar el desarrollo detallado del precio en el Timeframe Operativo. Si el patrón esperado no se forma o se invalida, el trader no actúa y vuelve al estado de espera activa.

5. **Ejecución de la Orden:**
   * **Objetivo:** Posicionar la operación de forma que la exposición al riesgo esté perfectamente controlada.
   * **Cognición:** El trader traslada sus niveles mentales de Entrada, Salida en Pérdida (Stop Loss) y Salida en Ganancia (Take Profit) al mercado. El cálculo del tamaño de la operación (lotaje) es un invariante matemático derivado de la distancia entre la entrada y el Stop Loss, asegurando que la gestión del riesgo prevalezca sobre el sesgo emocional.

6. **Gestión de la Posición:**
   * **Objetivo:** Optimizar el beneficio de la operación en curso según la información revelada en tiempo real.
   * **Cognición:** El trader evalúa la fuerza del movimiento del precio. Puede decidir ajustar su objetivo de beneficio (Take Profit) dinámicamente, pero mantiene el límite de pérdida (Stop Loss) inicial de forma estricta para respetar las reglas de supervivencia de la cuenta.

7. **Registro y Reevaluación de Sesión:**
   * **Objetivo:** Almacenar los resultados financieros e interactivos de la sesión para alimentar el análisis estadístico a posteriori.

---

## 2. Jerarquía de Timeframes y Cambio de Contexto Cognitivo

El análisis multi-timeframe no es un simple cambio de escala visual, sino un **desplazamiento en el enfoque y carga cognitiva** del trader. Cada nivel temporal responde a una pregunta diferente del proceso decisional:

| Nivel Temporal | Pregunta Clave que Responde | Carga Cognitiva Activa | Carga Cognitiva Descartada |
| :--- | :--- | :--- | :--- |
| **Timeframe Macro** (Contexto) | *¿Dónde estamos situados e interactuando?* | Estructura general, tendencias históricas, zonas de soporte/resistencia mayores y sesgo direccional. | Detalle de las velas individuales, ruido de ticks y gatillos específicos de entrada. |
| **Timeframe Operativo** (Gatillo) | *¿Está ocurriendo la confirmación del patrón técnico aquí y ahora?* | Cierre de velas individuales en el timeframe de ejecución, formación de patrones menores, relación exacta Riesgo/Beneficio de la orden. | La estructura general a gran escala (asumida como ya validada en el análisis macro). |
| **Sub-timeframe de Simulación** (Resolución) | *¿Cómo se está construyendo internamente la vela del timeframe operativo?* | Movimiento dinámico e intrabar del precio, velocidad del mercado y micro-estructura en tiempo real. | Sesgo histórico macro y confirmaciones del timeframe operativo (las cuales solo se evalúan al cierre de sus velas). |

### La Dinámica de Sincronización y Separación de Canales:
* **Separación para Análisis Independiente:** El trader navega por los timeframes Macro y Operativo de forma desacoplada para evitar el ruido de escalas Y/X distorsionadas.
* **Sincronización para Verificación de Intersección:** La sincronización espacial (cursor) se utiliza de manera intermitente y a demanda como un puente de contexto para verificar la posición exacta de una vela del timeframe operativo dentro de los límites del timeframe macro.

---

## 3. Principios de Gestión del Riesgo y Ejecución Invariante

El dominio de entrenamiento establece reglas duras para el comportamiento financiero de la simulación:
* **Invarianza del Riesgo Inicial:** El riesgo porcentual o monetario por operación es constante y predeterminado. El tamaño de la posición es una variable dependiente de la distancia geométrica al nivel de salida por pérdida (SL).
* **Gestión Asimétrica del Comercio:** El límite de pérdida (SL) se considera inalterable una vez colocada la orden para evitar la manipulación emocional de la pérdida. El límite de ganancia (TP) es dinámico y adaptable según la estructura revelada por el mercado.

---

## 4. Clasificación y Archivo Conceptual

Las sesiones se almacenan de forma estructurada según criterios que definen el tipo de práctica:
1. **Identidad del Activo:** El mercado bajo prueba.
2. **Naturaleza de la Estrategia:** Órdenes pasivas de entrada (límite) frente a órdenes activas de ruptura (stop).
3. **Perfil de Tolerancia Geométrica:** La distancia y holgura permitida para la salida por pérdidas (tamaño de SL en pips/puntos), que determina la resiliencia del trade al ruido del mercado.

---

## 5. Referencias de Implementación y Fricciones
* **Limitaciones Técnicas del Sistema:** Ver [CURRENT_LIMITATIONS.md](file:///C:/Users/78701/.gemini/antigravity/brain/03df98d6-3118-4433-b135-ddcd7cd376a5/CURRENT_LIMITATIONS.md) *(ej. problemas de coordenadas al escalar el eje de precios vertical, y el retardo del llenado en la misma vela de placement)*.
* **Puntos de Fricción en el Flujo de Trabajo:** Ver [KNOWN_PAIN_POINTS.md](file:///C:/Users/78701/.gemini/antigravity/brain/03df98d6-3118-4433-b135-ddcd7cd376a5/KNOWN_PAIN_POINTS.md) *(ej. clicks manuales repetitivos para avanzar períodos inactivos de mercado y el overshoot debido a alta velocidad)*.
* **Evolución y Mejoras Futuras:** Ver [FUTURE_IDEAS.md](file:///C:/Users/78701/.gemini/antigravity/brain/03df98d6-3118-4433-b135-ddcd7cd376a5/FUTURE_IDEAS.md) *(ej. segmentación estadística semanal/mensual, mapas de trades históricos agregados y comentarios por sesión)*.

---

## Architectural Review

### 1. Conceptos Eliminados por Contaminación de Estrategia
* **BOS (Break of Structure), CHoCH (Change of Character) y Order Blocks:** Estos términos pertenecen exclusivamente a la metodología de Smart Money Concepts (SMC). Al eliminarlos, evitamos sesgar el dominio del emulador a una única forma de hacer trading. Se abstrajeron a **"Rupturas estructurales menores"** y **"Zonas de interés o valor"**.
* **Oferta y Demanda / Soporte y Resistencia:** Conceptos de acción del precio clásica. Se agruparon conceptualmente bajo el término abstracto **"Zonas de Interés"** o **"Límites de valor histórico"**.
* **Bias Alcista/Bajista:** Se abstrajo a **"Hipótesis direccional"**, permitiendo que cualquier estrategia (basada en tendencias, reversión a la media, volumen u osciladores) encaje en la descripción sin alterar el flujo mental del emulador.

### 2. Conceptos Abstraídos (De Preferencia de Usuario a Regla de Dominio)
* **Operativa de Nueva York por la mañana (US30/Nasdaq):** Esta es una preferencia específica del activo y del trader. Se abstrajo al concepto de **"Ventana Operativa"** y **"Filtro Temporal Operativo"**. La regla generalizada es: *El tiempo útil de la simulación está determinado por la ventana operativa que maximiza el volumen o las condiciones requeridas por la estrategia bajo prueba.*
* **Hacer clic en +1 o -1:** Gestos visuales de control de avance temporal. Se abstrajeron a **"Avanzar el cursor temporal"**, **"Alineación fina de la simulación"** y **"Retroceso para precisión cronológica"**.
* **Click derecho y arrastre de líneas:** Gestos de la interfaz de usuario. Se convirtieron en **"Posicionamiento visual del riesgo"** y **"Determinación geométrica del Stop Loss"**.

### 3. Conceptos Descubiertos e Invariantes del Dominio
* **Espera Activa:** Descubrimos que el estado mental mayoritario del trader durante la simulación no es la acción, sino la observación pasiva (a alta velocidad de reproducción) buscando que el precio satisfaga las reglas de la estrategia. La simulación debe admitir velocidades asimétricas (muy rápidas durante la espera, pausadas o controladas durante la evaluación).
* **Cambio de Contexto Cognitivo (Timeframe Shift):** El cambio entre gráficos de diferente resolución temporal no es solo estético, sino un mecanismo para enfocar o descargar atención. La información irrelevante macro se bloquea mentalmente al pasar al gráfico operativo para permitir un foco absoluto en el gatillo de la orden.
* **Invarianza del Riesgo Inicial:** El lotaje no es un dato de entrada libre para el usuario, sino un cálculo derivado obligatorio de la distancia geométrica del Stop Loss. El trader decide cuánto dinero/riesgo asume, y la geometría del Stop Loss decide el tamaño.

### 4. Justificación DDD de la Separación
El emulador es un Bounded Context de **Simulación de Aprendizaje Deliberado**, no un motor de recomendación de estrategias. Por ende, la lógica de *qué constituye un patrón válido* reside exclusivamente en el cerebro del trader (el operador humano) o en un futuro módulo separado de análisis de setups. 
Mantener el lenguaje del dominio libre de términos metodológicos (SMC, Retail, Armónicos, etc.) garantiza que el Aggregate Root `TradingBook` y la entidad `Position` dependan de invariantes matemáticos estables (tiempo, precio, tamaño de lote, dirección, SL, TP) y no de interpretaciones semánticas subjetivas del mercado.
