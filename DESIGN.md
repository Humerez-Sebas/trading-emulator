---
name: Trading Emulator
description: Emulador de trading (replay de velas) para practicar análisis y operativa manual.
colors:
  primary: "#2962ff"
  primary-hover: "#1e53e5"
  up: "#26a69a"
  down: "#ef5350"
  warning: "#f0b90b"
  bg: "#000000"
  surface: "#0a0a0a"
  surface-2: "#181818"
  surface-3: "#1f1f1f"
  border: "#222222"
  border-strong: "#333333"
  text: "#d1d4dc"
  text-muted: "#787b86"
typography:
  display:
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.25
  headline:
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.25
  title:
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: 1.5
  body:
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1
rounded:
  xs: "4px"
  sm: "6px"
  md: "10px"
  lg: "14px"
  pill: "999px"
  full: "50%"
spacing:
  space-1: "4px"
  space-2: "8px"
  space-3: "12px"
  space-4: "16px"
  space-5: "20px"
  space-6: "24px"
  space-8: "32px"
  space-10: "40px"
---

# Design System: Trading Emulator

## 1. Overview

**Creative North Star: "The Focused Terminal"**

This system represents a professional, technical, and objective space. It prioritizes data clarity above all else, ensuring that the chart and metrics remain the hero. The aesthetic is clean, dark, and precise, avoiding any unnecessary noise or cluttered "casino" layouts typical of retail trading platforms.

**Key Characteristics:**
- Absolute focus on data and metrics.
- High-contrast elements over deep black and dark gray surfaces.
- Strictly functional layout, removing decorative noise.

## 2. Colors

The palette is anchored in a native dark mode, leveraging pure black for maximum contrast and focus.

### Primary
- **Signal Blue** (`#2962ff`): Used for primary actions, focus rings, and active states. It signals interaction without overwhelming the data.

### Secondary
- **Bullish Mint** (`#26a69a`): Represents upward movement, profit, and success states.
- **Bearish Rose** (`#ef5350`): Represents downward movement, loss, and danger states.
- **Caution Gold** (`#f0b90b`): Used for warnings or pending statuses.

### Neutral
- **Black Void** (`#000000`): The absolute background for the application canvas.
- **Base Surface** (`#0a0a0a`): The default background for panels and cards.
- **Elevated Surface** (`#181818`): Used for modals and floating elements.
- **Highest Surface** (`#1f1f1f`): Used for popovers and tooltips.
- **Primary Text** (`#d1d4dc`): High contrast readability for main data and text.
- **Muted Text** (`#787b86`): De-emphasized labels and secondary data.
- **Subtle Border** (`#222222`): Structural dividers to separate regions quietly.

## 3. Typography

**Display Font:** Inter
**Body Font:** Inter
**Label Font:** Inter

**Character:** Technical, tabular, and highly legible even at small sizes to accommodate dense data.

### Hierarchy
- **Display** (Semi-Bold, 22px): Major page headers.
- **Headline** (Semi-Bold, 20px): Section titles.
- **Title** (Medium, 16px): Panel and card titles.
- **Body** (Regular, 13px): Standard text and tabular data. 
- **Label** (Medium, 11px): Tiny metadata and chart axis labels.

### Named Rules
**The Tabular Rule:** All dynamic numbers (prices, PnL) must use `tabular-nums` (`font-variant-numeric: tabular-nums`) to prevent layout jitter as digits change.

## 4. Elevation

The system is mostly flat, using tonal layering to distinguish hierarchy. Shadows are reserved for elements that physically sit "above" the main UI to break the z-index cleanly.

### Shadow Vocabulary
- **Resting Cards** (`0 1px 2px rgba(0, 0, 0, 0.4)`): Subtle lift for floating panels.
- **Dropdowns** (`0 2px 8px rgba(0, 0, 0, 0.45)`): Floating menus and popovers.
- **Modals** (`0 8px 28px rgba(0, 0, 0, 0.55)`): Dialogs that require focus.

### Named Rules
**The Flat-By-Default Rule:** Surfaces are flat at rest. Shadows appear only as a response to state (hover, elevation, focus) or when separating a modal from the canvas.

## 5. Components

### Buttons
- **Shape:** Soft edges (`6px` default radius).
- **Primary:** High-contrast background filled with Signal Blue, transitioning to a deeper hue on hover. Designed to be tactile but not distracting.

### Panels and Cards
- **Shape:** Rounded containers (`10px` to `14px`) depending on structural context.
- **Surface:** Uses `#0a0a0a` or `#181818` with subtle `#222222` borders to delineate space cleanly against the `#000000` canvas.

### Data Tables and Lists
- **Text:** Uses Primary Text for values, Muted Text for column headers.
- **Spacing:** Tight spacing but with enough breathing room to prevent density fatigue.

## 6. Do's and Don'ts

- **DO** use `tabular-nums` for all dynamic metrics to prevent layout jitter.
- **DON'T** use shadows on flat structural sidebars; use subtle borders instead.
- **DO** ensure the charting area takes maximum priority in visual weight.
- **DON'T** use the primary blue for decorative purposes. Reserve it for active interactions.
- **DON'T** use glowing text or excessive gradients that distract from the objective analysis.
