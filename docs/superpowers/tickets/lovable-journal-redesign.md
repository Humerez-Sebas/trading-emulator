# Redesign Ticket: Premium Journal Page Redesign (via Lovable)

| Campo | Valor |
| :--- | :--- |
| **ID** | TICKET-016-J-REDESIGN |
| **Componente** | `pages/journal/` (Journal Page) |
| **Objetivo** | Diseñar una interfaz visual premium con Lovable e integrarla al sistema |
| **Referencia Visual** | `DESIGN_SYSTEM.md` §1 (Rango 4: Superficie de Análisis) |

---

## 1. Problemas Identificados con el Diseño Actual
El diseño inicial del Journal es demasiado plano, carece de jerarquía visual marcada y se siente como una aplicación CRUD genérica. No transmite la sensación de ser una herramienta premium de análisis de flujo de órdenes o práctica deliberada de trading.

---

## 2. Requerimientos Estéticos para Lovable

### 2.1 Esquema de Color y Ambientación
*   **Fondo y Superficies:** Diseñar bajo una estética "Glassmorphism" con gradientes oscuros muy sutiles (`#000000` base, con tarjetas `#0a0a0a` y bordes finos `#222222`).
*   **Color de Acento:** Utilizar el color de acento de la marca (`#2962ff` Blue) con brillos sutiles (low-opacity glow).
*   **Métricas de Rendimiento:** Usar verde esmeralda (`#26a69a`) y rojo coral (`#ef5350`) con opacidad controlada para evitar fatiga cognitiva.

### 2.2 Estructura y Distribución del Layout (Análisis Rango 4)
El Journal debe dividirse en 4 secciones visuales:

1.  **Header HUD (Resumen Rápido):**
    *   Métricas clave (Net P/L, R-Multiple total, Win Rate, Expectancy, Profit Factor) mostradas en tarjetas grandes con tipografía de alta fidelidad (`Inter` u `Outfit` de Google Fonts).
    *   Micro-gráficos de tendencia (Sparklines) incrustados dentro de las tarjetas de métricas.
2.  **Visualizaciones de Comportamiento (Scatter / Bubble Chart):**
    *   Rediseñar el gráfico de dispersión MAE/MFE. Los puntos deben ser burbujas semi-transparentes y poseer estados `hover` animados que revelen el número de trade y el resultado.
    *   Agregar un mapa de calor o cuadrícula de consistencia que muestre las horas y días operados con mayor rendimiento.
3.  **Playbook & Factores de Comportamiento:**
    *   Visualizar las reglas del Playbook aplicadas en forma de tarjetas de rendimiento interactivas.
    *   Detallar las métricas conductuales (cantidad de pausas, ReplayJumps) mediante un panel de control estilizado en lugar de filas de texto simple.
4.  **Tabla de Detalles de Trades:**
    *   Tabla compacta con cabeceras fijas y scrolling suave.
    *   Números formateados obligatoriamente con `font-variant-numeric: tabular-nums` para evitar saltos en la alineación.
    *   Iconos de edición (`✎`) y navegación suaves que al hacer hover revelen un borde acentuado.

---

## 3. Entregables Esperados para Lovable
1.  **Mockups React/HTML interactivos** del Journal Rediseñado.
2.  **Tokens CSS consolidados** para agregarse al `DESIGN_SYSTEM.md`.
3.  **Código fuente refactorizado** para `journal-page.component.{html,css}`.
