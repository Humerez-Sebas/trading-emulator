---
name: architecture-diagrams
description: Standards and guidelines for producing professional, high-fidelity architectural diagrams using Mermaid in the Trading Emulator project.
---

# Architecture Diagram Standards & Guidelines

This skill defines the visual standards, naming conventions, and best practices for creating clear, industry-grade diagrams (C4, Sequence, State, Data Flow, Rendering Pipeline, and Entity Relationship) using Mermaid within this repository.

---

## 1. Visual Language and Palette

To maintain consistency with the application's design tokens and dark-mode aesthetic, all Mermaid diagrams should configure styling nodes with semantic styling.

### 1.1 Color Tokens (Hex Mapping)
Use these semantic colors in style classes:
*   **Primary Elements (Store, Kernel, Core Engine):** `#1e293b` (Slate-800) with border `#3b82f6` (Blue-500) and text `#f8fafc` (Slate-50).
*   **UI Components & Viewports (Panels, Pages):** `#0f172a` (Slate-900) with border `#64748b` (Slate-500) and text `#cbd5e1` (Slate-300).
*   **External/Cloud Systems (Supabase, API):** `#022c22` (Emerald-950) with border `#10b981` (Emerald-500) and text `#ecfdf5` (Emerald-50).
*   **Transient / Event Bus Nodes:** `#1c1917` (Stone-900) with border `#f59e0b` (Amber-500) and text `#fef3c7` (Amber-50).

### 1.2 Mermaid Styling Syntax Pattern
Define styles at the bottom of the flowchart:
```mermaid
%% Example configuration template %%
classDef core fill:#1e293b,stroke:#3b82f6,stroke-width:2px,color:#f8fafc;
classDef ui fill:#0f172a,stroke:#64748b,stroke-width:1px,color:#cbd5e1;
classDef event fill:#1c1917,stroke:#f59e0b,stroke-width:1px,color:#fef3c7;

class NodeA core;
class NodeB ui;
```

---

## 2. Naming Conventions & Layout Rules

*   **PascalCase for States and Actions:** State nodes and actions must use exact code representations (e.g., `ActiveSession`, `LessonsActions.createLesson`).
*   **Descriptive Labels:** Arrow labels must be active verbs indicating the action (e.g., `-->|1. Dispatches|` or `-->|2. Emits payload|`).
*   **Linear Event Flows:** Layout flows from top to bottom (`TD` or `TB`) for vertical data hierarchies (like the Render Pipeline) and left to right (`LR`) for state machines or routing events.
*   **Quotes for Special Characters:** To prevent Mermaid syntax parser errors, always quote labels containing parentheses, brackets, or dots: `Node["Selector: selectLessons()"]`.

---

## 3. Diagram Categories & Standards

### 3.1 C4 Model Diagrams (Context & Containers)
*   Used for: Defining system boundaries.
*   Standard: Distinctly separate User, Frontend (Angular/NgRx/ChartEngine), Local Storage (IndexedDB), and Backend (Supabase) boundaries.

### 3.2 Sequence & Event Flow Diagrams
*   Used for: Documenting asynchronous event propagation (like the `ChartSyncBus` routing flow).
*   Standard: Explicitly denote the timeline of events. Highlight loop-prevention or cancellation bounds.

### 3.3 State Machine & Transition Diagrams
*   Used for: Replay, session, and workspace layout states.
*   Standard: Use `stateDiagram-v2`. Clearly show initial (`[*]`) and terminal states, with transitions labeled by the triggering NgRx Action.

### 3.4 Data Flow and Render Pipeline Diagrams
*   Used for: Tracking data retrieval to screen render.
*   Standard: Must map layers from raw Entity storage, through selectors, filters, sorting, mapping, and down to the raw Canvas draw.

---

## 4. Diagram Review Checklist (Self-Review)

Before committing a diagram to any specification or RFC, run this checklist:
*   [ ] Does the diagram parse successfully (no syntax errors)?
*   [ ] Are node labels free of HTML tags that could crash the renderer?
*   [ ] Are special characters (brackets, parentheses) wrapped in quotes?
*   [ ] Does the diagram follow the LTR or TTB reading flow naturally?
*   [ ] Do color schemes reflect the hierarchy of core modules vs. secondary views?
*   [ ] Are code tokens (Action/Selector names) matching the actual codebase?
