# RFC-016 Component Architecture — Journal & Reflection Cabin

| Field | Value |
| :--- | :--- |
| RFC | `docs/architecture/rfcs/016-diario-enmiendas-playbook.md` |
| Design spec | `docs/superpowers/specs/2026-07-13-rfc-016-journal-reflection-design.md` |
| Plan | `docs/superpowers/plans/2026-07-13-rfc-016-implementation-plan.md` |
| Date | 2026-07-13 |
| Status | Design for owner review — gates implementation (workflow step 4) |

Defines component trees, state management, data flow, and CSS architecture for the
two new surfaces BEFORE any code. All components are Angular standalone with
`ChangeDetectionStrategy.OnPush`; signal-based inputs/outputs (`input()`, `output()`);
`inject()` over constructor injection — the codebase's prevailing idiom.

---

## 1. Journal

### 1.1 Component tree

```
JournalPageComponent                      pages/journal/journal-page.component.ts
├── JournalHeaderComponent                (title, breadcrumb, session metadata)
├── PerformanceGridComponent              [input] stats: SessionStatsView
├── ExecutionSectionComponent
│   └── ScatterMaeMfeComponent            [input] points: ScatterPointView[]
│                                         [output] tradeSelected: string
├── BehaviorSectionComponent
│   ├── BubbleDurationRComponent          [input] bubbles: BubbleView[]
│   │                                     [output] tradeSelected: string
│   ├── HeatmapTradeCalendarComponent     [input] cells: HeatmapCellView[]
│   │                                     [output] tradeSelected: string
│   └── (navigation-facts row: plain template, no child component)
├── RulePerformanceTableComponent         [input] rows: RulePerformanceRow[]
│                                         [output] ruleFilterToggled: string | null
├── TimeOfDayTableComponent               [input] rows: TimeOfDayRow[]
└── TradesTableComponent                  [input] rows: TradeRowView[]
                                          [input] ruleFilter: string | null
                                          [output] tradeSelected: string
```

Leaf components are PURE PRESENTATION: view-model inputs in, selection events out.
No `Store` injection below `JournalPageComponent` — the page is the single smart
component (mirrors the side-dock/panel pattern; keeps J-5/J-6 auditable at ONE seam).

### 1.2 State management & data flow

- **No new NgRx feature for the Journal.** The Journal is a read side (J-6). It has
  no state worth conserving beyond the route param and local UI state (rule filter,
  selected row index) — Angular signals inside the page component.
- **Data acquisition:** `JournalDataService` (new, `providedIn: 'root'`) loads the
  session read-side by id WITHOUT dispatching into the live trading/replay slices:
  `loadSessionReadModel(sessionId): Promise<JournalSessionModel>` — resolves the
  session payload (existing session-load service path), the session's telemetry
  events (telemetry DB read API), and playbook rule titles (store selector — already
  hydrated). Everything downstream is pure computation.
- **Pure builders** (`state/journal/journal-read.models.ts`, no Angular imports):
  `buildSessionStatsView`, `buildScatterPoints`, `buildBubbles`, `buildHeatmapCells`,
  `buildRulePerformanceRows`, `buildTimeOfDayRows`, `buildTradeRows`,
  `buildBehaviorFacts`. Each takes `(JournalSessionModel)` → view rows. All
  session-scoped by construction (J-5 detector tests target these).
- **Flow:**

```
route :sessionId → JournalPageComponent (signal)
  → JournalDataService.loadSessionReadModel(id)      (async, once per id)
  → pure builders → view-model signals
  → leaf components render; (tradeSelected) → router.navigate(['reflect', tradeId])
```

- **Rule identity → color:** `--rule-{slot}` token chosen by the rule's
  `shortcutSlot`; slotless rules get a deterministic palette index by
  `sortOrder % 9` (documented in the builder); undeclared → `--text-muted`.
  Mapping computed ONCE in the builder (D8-safe: no per-point selector).

### 1.3 CSS architecture

- `journal-page.component.css` sets the density block on the root class
  `.journal-page` exactly per DESIGN_SYSTEM §2.3; every descendant uses
  `var(--density-*)` only — no hardcoded paddings/font sizes in leaf CSS.
- Zone accents: each section host element carries `data-zone` and a section-scoped
  rule maps it to the zone token for header/border/icon (`.section[data-zone=rules]
  .section-header { color: var(--zone-rules); border-inline-start-color: ... }`).
  Zone colors appear NOWHERE else.
- SVG visualizations style via CSS custom properties (`--viz-grid`, `--viz-axis`,
  point fill from `var(--rule-N)`) — no inline hex values.
- No new primitives; buttons/badges/tooltips from `ui-primitives.css` (§3.1, §6.2).

### 1.4 Testing seams

- Builders: pure unit specs (the J-5 isolation test seeds two sessions).
- Leaf components: TestBed with plain inputs; assert DOM (point counts, click emits,
  aria-labels, empty/insufficient states). No MockStore needed below the page.
- Page: TestBed + mocked `JournalDataService` + Router spy; keyboard map spec.

---

## 2. Reflection Cabin

### 2.1 Component tree

```
ReflectionCabinPageComponent              pages/reflection/reflection-cabin-page.component.ts
├── CabinBreadcrumbComponent              [input] index/total  [output] back, prev, next
├── CabinTradeListComponent               [input] trades: CabinTradeRow[] (incl. hasReflection)
│                                         [input] activeTradeId
│                                         [output] tradeSelected: string
├── WaypointTimelineComponent             [input] waypoints: Waypoint[]
│                                         [input] activeIndex: number
│                                         [output] waypointSelected: number
│                                         [output] managementExpanded: boolean
│   └── (management sub-timeline: internal template, not a separate component)
├── FrozenSceneHostComponent              [input] scene: SceneSpec | null
│                                         (owns the slim engine instance)
├── WaypointFactsComponent                [input] waypoint: Waypoint (facts panel)
└── LessonFormComponent                   [input] existing: Lesson | null
                                          [input] activeRules: PlaybookRule[]
                                          [output] save: LessonDraft
```

`ReflectionCabinPageComponent` is the only smart component: injects `Store` (lessons
slice + playbook selectors), `JournalDataService` (same read model as the Journal —
one loader, two surfaces), Router.

### 2.2 State management & data flow

- **Lessons slice (`state/lessons/`)** is the ONLY NgRx surface this page writes:
  `save` → `LessonsActions.createLesson({ lesson })` (id/`authoredAt`/
  `clientUpdatedAt` stamped in the PAGE component — purity) and, per linked rule,
  `PlaybookActions.amendRule({ ruleId, lessonId })`. Persistence/sync ride the
  lessons effects (plan Tasks 2–3).
- **Scene pipeline (all pure until the host):**

```
JournalSessionModel + tradeId
  → waypoints = computeWaypoints(trade, telemetryEvents)        domain/reflection
  → activeIndex (signal, default 0 = Entry; keys 1–5 set it)
  → scene = buildSceneSpec(trade, waypoints[activeIndex], SCENE_WINDOW_CANDLES)
  → FrozenSceneHostComponent renders it
```

- **FrozenSceneHostComponent — the one integration seam (plan Task 7 spike).** Owns
  a slim `ChartEngine` instance the way chart panels do, but: read-only (no trading
  capability interactions), fed by a hand-built `RenderModel` derived from the
  `SceneSpec` (candles loaded from IndexedDB via the existing dataset-loading
  service using `datasetRefs` + window), no replay wiring, no store subscription.
  Candle data NEVER enters the SceneSpec (N-5) — the host resolves refs → candles at
  render time. Crossfade = two-layer host swapping opacity over 180 ms
  (reduced-motion: instant). Destroys the engine on component destroy.
- **Evidence freezing:** on save, the page snapshots the CURRENT `SceneSpec[]` of
  the trade's existing waypoints (cap `MAX_EVIDENCE_SCENES`) into the draft — deep
  copies (`structuredClone`), so later state changes can't mutate them (J-3).
- **Keyboard:** one `@HostListener('window:keydown')` on the PAGE component,
  gated by focus context (textarea → only Escape/Tab semantics). Digits 1–5 map to
  waypoint indices FIXED by kind (absent kind = no-op), per the design spec §2.3.
  No listener collision with Playbook hotkeys: that directive lives only on the
  emulator page host; routes are disjoint.

### 2.3 CSS architecture

- Root class `.reflection-cabin-page` sets the `comfortable` density block (§2.3).
- Grid: `grid-template-columns: 3fr 7fr` (30/70) with a `<1100px` breakpoint
  collapsing to the drawer layout (design spec §2.1).
- Timeline styles own-file; active-ring uses the exact §4.5 recipe
  (`color-mix(in srgb, var(--accent) 40%, transparent)`); connector tokens
  `--timeline-connector` (defined in `styles.css` ONCE if not present — a base-token
  addition goes through DESIGN.md/DESIGN_SYSTEM §6.4, flagged in the task report).
- `--zone-reflection` accents restricted to header/panel borders (contrast §5.1).

### 2.4 Testing seams

- `computeWaypoints`/`buildSceneSpec`: pure specs (visibility matrix, merges,
  determinism) — plan Task 4.
- `WaypointTimelineComponent`: TestBed, inputs → node rendering matrix, keyboard
  events, expansion behavior, `role="tablist"` semantics.
- `FrozenSceneHostComponent`: spike first; spec asserts render-model derivation
  (pure part) + lifecycle (create/destroy) with the engine faked at its narrow
  interface — never a headless-canvas assertion.
- `LessonFormComponent`: enable/disable rules, three-field draft emission, rule
  chips toggle, existing-lesson prefill.
- Page: routing (`←`/`→`/Escape), save dispatch composition (createLesson +
  amendRule per linked rule), `✎` propagation.

---

## 3. Shared decisions

1. **One loader, two surfaces:** `JournalDataService` feeds both pages; the Cabin
   never re-derives stats, the Journal never computes waypoints. Cache per
   sessionId (simple Map, invalidated on navigation away) — read-side only.
2. **View-model boundary:** leaf components never receive domain objects
   (`ClosedTrade`, `Lesson`) — only view rows built by pure functions. Keeps N-1
   greps trivial (view models carry numbers/strings/tokens, no interpretive fields)
   and makes the D8 audit local.
3. **Routes are lazy:** both pages `loadComponent` (matching existing page idiom),
   keeping the practice-workspace bundle untouched (budget guard).
4. **No new primitives, no ad-hoc variants** (§6.2): any gap found during
   implementation goes through `ui-primitives.css` + DESIGN_SYSTEM §6.4, recorded
   in the task report.
5. **File placement:** pure domain in `domain/reflection/`; read-model builders in
   `state/journal/` (pure, no feature registration); lessons slice in
   `state/lessons/`; pages under `pages/journal/` and `pages/reflection/`;
   visualizations under `components/journal-viz/`.
