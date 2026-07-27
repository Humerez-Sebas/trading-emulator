# RFC-017 Compositional Panel Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking. Repo protocol:
> `docs/engineering/sdd-orchestration.md`.

> **STATUS & SCOPE (updated 2026-07-24).**
> - **Task 1 — COMPLETADA** (`syncDrawings`/`syncTrades` composition channels):
>   implemented in the prior run, preserved by cherry-pick onto `develop` `af3d8ca`,
>   re-verified green (tsc app+spec clean, lint 0, `ng test` 1798/1798). **This run
>   RESUMES at Task 2.**
> - **Tasks 7 & 8 — OUT OF SCOPE (superseded by TEDS).** The trade-visualization layer
>   (Ghost Rails geometry, corner Position HUD) was absorbed by the TEDS grammar
>   (`TEDS_GRAMMAR.md` §10; normative render in `docs/architecture/TEDS_INTERACTION.md`
>   / `TEDS_MOTION.md`) and re-planned into
>   `docs/superpowers/specs/2026-07-TEDS-implementation-plan.md`. Only the RFC §5.1
>   *gating predicate* (where trades render) survives — implemented with the TEDS trade
>   layer, not here.
> - **This run's scope = Tasks 2, 3, 4, 5, 6, 9.**
> - **Secondary observation panels:** a secondary panel may show any downloaded asset
>   (e.g. NASDAQ) for observation + drawing; trades render only where
>   `panel.symbol === primarySymbol`. Multi-symbol = observation, not tradeable (D1).

**Goal:** Owner-tagged compositional drawings (local + shared layers resolved per
panel through LinkGroups), two new composition-sync channels (`syncDrawings`,
`syncTrades`), panel-scoped undo/redo and clipboard, and `SessionPayloadV3`. *(The Ghost Rails
trade-visualization layer originally scoped here — Tasks 7–8 — is superseded by
TEDS and out of scope; see the STATUS & SCOPE banner above.)*

**Architecture:** `Drawing` gains `{symbol, owner, zIndex, locked, visible}`; the
drawings slice becomes an entity map + incremental owner index holding the WHOLE
session's drawings (symbol is a filter, not a slice); per-panel composition lives
inside each panel's own `ChartModelMapper` instance (D8 ban intact); LinkGroups
stay pure resolvers. Trades/drawings sync by composition from the store — they
NEVER ride `ChartSyncBus` (D17.K). Persistence moves to `SessionPayloadV3` with a
fidelity-preserving V2→V3 migration.

**Tech Stack:** Angular 21 standalone + NgRx, lightweight-charts v5 primitives
(vanilla TS capabilities), raw IndexedDB, Vitest via `ng test` ONLY.

**Spec of record:** `docs/architecture/rfcs/017-compositional-panel-sync.md`
(D17.A–L). Technical spec:
`docs/superpowers/specs/2026-07-16-rfc-017-compositional-panel-sync-design.md`
(the §4 Mermaid diagram is the pipeline contract — every rendering task references
it). Visual authority: `DESIGN_SYSTEM.md` +
`docs/superpowers/specs/2026-07-16-rfc-017-trade-visualization-concepts.md`
(Ghost Rails §5–6). On conflict: RFC > technical spec > visual spec > this plan.

## Global Constraints

- **Branch:** `feature/rfc-017-compositional-panel-sync` (re-cut 2026-07-24 from
  `origin/develop` @ `af3d8ca`, post TEDS-consolidation PR #43; Task 1 carried over);
  PR to `develop` only.
- **Gates per task**, from `emulador/` (all four, fresh output only):
  `npx tsc -p tsconfig.app.json --noEmit` · `npx tsc -p tsconfig.spec.json --noEmit` ·
  `npx ng test --watch=false` (NEVER bare `npx vitest run`) · `npm run lint` (0
  problems). `npm run build` additionally at finalization (watch NEW chunk types,
  not the known ~609 kB warning).
- **STOP rule with ONE declared exception class:** pre-existing spec files are
  authority and are NEVER touched — EXCEPT specs that assert the superseded V2
  drawings shape/API (`items[]` slice, `restoreDrawingsForSymbol`, global
  `selectedId`, per-symbol `DrawingCollection` payload internals). This RFC
  replaces that model by design; each such spec edit MUST preserve the spec's
  intent (adapt fixtures/API, never weaken assertions) and be enumerated in the
  ledger (D14.E precedent). Any OTHER failing pre-existing spec → STOP/BLOCKED.
- **D8:** no shared parameterized factory selectors, ever. Store selectors stay
  parameterless; per-panel derivation lives in the panel's mapper instance.
- **Zero-allocation contract:** composition memoizes on input REFERENCES; the
  no-change path returns the previous array by reference (technical spec §4.1).
- **Ownership immutability:** no action mutates `owner` of an existing drawing
  (invariant grep + reducer spec).
- **Engine boundary:** `ChartEngine` core untouched; capabilities/primitives under
  `domain/chart/**` may evolve but import NOTHING from Angular/NgRx and receive
  data only via `RenderModel` DTOs.
- **Purity:** `Date.now()`/`crypto.randomUUID()` only in components/effects;
  reducers receive stamps via action props.
- **Candle-free:** existing `assertNoCandles` guards every payload write path —
  import, never duplicate.
- **No new runtime dependencies.** No web workers. `syncPriceScale` keeps ZERO
  read sites (grep at finalization).
- **Comments:** explain domain logic only — no task/RFC names in NEW comments.
- **UI copy Spanish; identifiers/comments English.**
- **Commits:** conventional, task-scoped, pathspec only, trailer
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: LinkGroup composition channels (`syncDrawings`, `syncTrades`)

**Files:**
- Modify: `state/link-groups/link-groups.models.ts` (flags), `link-groups.actions.ts`
  (+`setSyncDrawings`, `setSyncTrades`), `link-groups.reducer.ts` (toggle handlers,
  same no-op idiom as `setSyncCrosshair`).
- Modify: the LinkGroups creation call site (locate via grep
  `LinkGroupsActions.createGroup(` outside specs — workspace viewport UI): new
  groups default `syncDrawings: true, syncTrades: true`.
- Modify: LinkGroups panel UI (same component): two new toggles mirroring the
  existing crosshair/range toggles; labels `Dibujos` / `Trades`.
- Modify: V2 group hydration normalization — where `restoreGroups` payload is
  assembled from a parsed payload (locate via grep `restoreGroups(`): missing
  flags normalize to `syncDrawings: false, syncTrades: true` (D17.I).
- Test: NEW specs `link-groups.channels.spec.ts` (reducer toggles, defaults
  normalization); extend UI spec only if a NEW spec file can cover it.

**Interfaces:**
- Produces: `LinkGroup.syncDrawings: boolean`, `LinkGroup.syncTrades: boolean`
  (required fields on the model; hydration supplies defaults),
  `LinkGroupsActions.setSyncDrawings({ groupId, enabled })`,
  `setSyncTrades({ groupId, enabled })`. Tasks 3 and 7 read these flags.
- First step: record the fresh baseline test count in the ledger.

- [ ] Step 1 (TDD): failing specs — toggles flip independently and no-op on
  unknown ids; V2 payload groups without flags hydrate as `false`/`true`; freshly
  created groups carry `true`/`true`.
- [ ] Step 2: implement model + actions + reducer + normalization + UI toggles.
- [ ] Step 3: `syncPriceScale` grep still zero read sites; gates; pathspec commit.

---

### Task 2: Drawing schema expansion + target resolution + pure migration functions

**Files:**
- Modify: `state/drawings/drawings.models.ts` — `DrawingOwner`, expanded `Drawing`
  (`symbol`, `owner`, `zIndex`, `locked`, `visible` all REQUIRED), keep
  `DrawingTool`/`DrawingType`/`DrawingPoint`/`FIB_LEVELS`.
- Create: `state/drawings/drawing-ownership.ts` — pure module:
  `ownerKeyOf(owner: DrawingOwner): string` (`'panel:'+id` / `'group:'+id`),
  `resolveDrawingTarget(panel: PanelDescriptor, groups: Record<string, LinkGroup>): DrawingOwner`
  (group iff `panel.linkGroupId` resolves AND `groups[id].syncDrawings`; panel
  otherwise — dangling ids fall back to panel).
- Create: `services/drawings-migration.ts` — pure lifting:
  `liftLegacyDrawing(item: {id;kind;p1;p2}, symbol: string, ownerPanelId: string, zIndex: number): Drawing`
  (`locked:false, visible:true`);
  `ownerPanelFor(symbol: string, layout: WorkspaceLayout, panels: Record<string, PanelDescriptor>): string`
  (first panel in tab/cell order whose `descriptor.symbol === symbol`; fallback
  first panel in layout order — deterministic, D17.J).
- Modify: every `Drawing` construction site to populate the new fields —
  `chart.component.ts` (draft + `addDrawing`: `symbol` from the mapper's
  descriptor, `owner` via `resolveDrawingTarget`, `zIndex: 0` placeholder until
  Task 3's reducer assigns, `locked:false`, `visible:true`) and spec fixtures
  covered by the STOP exception class.
- Modify: `chart-model-mapper.service.ts` — expose the configured descriptor as
  a readonly signal (`descriptor()`) so `ChartComponent` can read panel identity
  for dispatches (every live `<app-chart>` sits inside a panel; a null descriptor
  makes drawing interactions no-op defensively).
- Test: NEW `drawing-ownership.spec.ts`, `drawings-migration.spec.ts`.

**Interfaces:**
- Consumes: `LinkGroup.syncDrawings` (Task 1), `PanelDescriptor`,
  `WorkspaceLayout`.
- Produces: the final `Drawing`/`DrawingOwner` types, `ownerKeyOf`,
  `resolveDrawingTarget`, `liftLegacyDrawing`, `ownerPanelFor` — consumed by
  Tasks 3, 5, 6. The render-model DTO (`domain/chart/render-model.ts` `Drawing`)
  is NOT changed — the mapper keeps projecting `{id, kind, p1, p2}`.

- [ ] Step 1 (TDD): failing specs — target resolution truth table (linked+flag →
  group; linked+flag-off / unlinked / dangling → panel); `ownerPanelFor` layout
  order + fallback; lift preserves geometry/ids and stamps defaults.
- [ ] Step 2: implement; update construction sites; keep the store shape
  UNTOUCHED this task (items stay `Drawing[]` — richer items flow through the
  existing V2 record paths unchanged: additive fields, tolerated by shape guards).
- [ ] Step 3: gates; enumerate in the ledger every pre-existing spec fixture
  adapted to the widened type; pathspec commits.

---

### Task 3: Entity store + owner index + per-panel selection + mapper composition + chart cutover

The atomic cutover (type-coupled — PHILOSOPHY §5.3). Pipeline contract: technical
spec §4 diagram.

**Files:**
- Modify: `state/drawings/drawings.models.ts` — new `DrawingsState`:
  `{ entities: Record<string, Drawing>; ownerIndex: Record<string, readonly string[]>;
  selection: Record<string, string | null>; activeTool: DrawingTool; nextZ: number }`
  (history/revisions/clipboard arrive in Tasks 4–5).
- Modify: `state/drawings/drawings.actions.ts` — new surface (technical spec
  §2.3): `addDrawing{panelId, drawing}`, `moveDrawing{panelId, id, p1, p2}`,
  `deleteSelected{panelId}`, `selectDrawing{panelId, id: string | null}`,
  `setDrawingLocked{id, locked}`, `setDrawingVisible{id, visible}`,
  `restoreDrawings{drawings: Drawing[]}`, `pickTool` unchanged. RETIRED:
  `clearDrawings`, `restoreDrawingsForSymbol`.
- Modify: `state/drawings/drawings.reducer.ts` — entity map + incremental
  `ownerIndex` (append on add; splice on delete; owner NEVER reassigned); reducer
  assigns `zIndex: nextZ++` on add; lock guards return state by identity
  (I-14 idiom); selection steal (selecting id X in panel A nulls X in any other
  panel's slot); `deleteSelected` re-validates the id is still composable for
  that panel (entity exists, not locked); group-deletion cascade (D17.L):
  `on(LinkGroupsActions.removeGroup)` purges `ownerIndex['group:'+id]` and its
  entities atomically (the pre-existing panel-unlink cascade is untouched) and
  the LinkGroups panel's delete control copy discloses it
  (`"Eliminar grupo y sus dibujos compartidos"`); `restoreDrawings` rebuilds
  entities/index and seeds `nextZ = max(zIndex)+1`; `workspaceRestored` hydrates
  through the same rebuild using `workspace.drawings` (lifted in Task 6 — until
  then workspace records already carry full `Drawing` items from Task 2's
  construction sites; legacy records lift at read in Task 6).
- Modify: `components/chart/chart-model-mapper.service.ts` — new composed stream
  `panelDrawings$: Observable<PanelDrawingsView>`;
  `PanelDrawingsView = { items: readonly Drawing[]; selectedId: string | null }`.
  Internal `composePanelDrawings(entities, ownerIndex, selection, groups,
  descriptor)`: ids = `ownerIndex[ownerKeyOf({type:'panel',id})]` ∪ (descriptor's
  group with `syncDrawings` ? `ownerIndex['group:'+gid]` : []) → map to entities →
  filter `symbol === descriptor.symbol && visible` → sort zIndex asc (tiebreak
  id) → memoized on the 5-tuple of input refs (single private slot per instance,
  `memoizeMap` precedent). Gated by `this.gated()` like every other stream.
- Modify: `components/chart/chart.component.ts` — cutover: subscribe
  `panelDrawings$` (replaces `drawingsFeature.selectItems`/`selectSelectedId`/
  `drawingsState$`); `pushDrawings` maps composed items → render DTOs (id, kind,
  p1, p2) with the panel's `selectedId`; ALL drawing dispatches carry
  `panelId` from `mapper.descriptor()`; hit-tests operate on the composed array
  (already zIndex-ordered; primitive walks top-down as today); dragging a
  `locked` drawing is suppressed at the interaction layer too (cursor stays
  default — reducer guard remains the authority).
- Modify: persistence assembly (locate via grep `toPayload(` / `SessionView`
  construction in `services/session-sync.service.ts` + `state/workspaces/**`
  effects): the per-symbol `Record<symbol, DrawingCollection>` V2 record is now
  DERIVED by grouping `entities` by `drawing.symbol` (pure helper
  `groupDrawingsBySymbol(entities): Record<string, DrawingCollection>` in
  `services/drawings-migration.ts`); hydration (`fromPayload` consumers)
  flattens record values → `restoreDrawings`. Payload stays schemaVersion 2
  until Task 6 (expansion before cutover).
- Test: NEW `drawings.reducer.entity.spec.ts` (index maintenance, zIndex
  assignment, lock guards, selection steal, ownership immutability, hydration
  rebuild), NEW `chart-model-mapper.composition.spec.ts` (composition truth
  table: local-only, shared via group, flag off, dangling group, symbol filter,
  visible filter, zIndex order, reference-stability on unrelated store emissions,
  8-panel profile sibling), superseded-shape spec adaptations (ledger-enumerated).

**Interfaces:**
- Consumes: Task 1 flags, Task 2 types + `ownerKeyOf`/`resolveDrawingTarget`.
- Produces: `drawingsFeature` selectors `selectEntities`, `selectOwnerIndex`,
  `selectSelection`, `selectActiveTool`; `ChartModelMapper.panelDrawings$` +
  `PanelDrawingsView`; `groupDrawingsBySymbol`. Tasks 4–6 build on the reducer;
  Task 6 replaces the V2 grouping at the payload boundary.

- [ ] Step 1 (TDD): failing reducer + composition specs (list above — every row
  of the truth table).
- [ ] Step 2: implement reducer/state/actions.
- [ ] Step 3: implement mapper composition; verify reference-stability spec
  (unchanged inputs → SAME array instance).
- [ ] Step 4: chart.component + persistence-assembly cutover; run the full suite;
  adapt ONLY superseded-shape specs (ledger).
- [ ] Step 5: gates; grep invariant: no `selectItems` consumers remain, no
  factory selectors introduced; pathspec commits (state / mapper / component).

---

### Task 4: Panel-scoped undo/redo with revision guard (D17.F)

**Files:**
- Modify: `state/drawings/drawings.models.ts` — add
  `revisions: Record<string, number>`, `history: Record<string, PanelHistory>`;
  `DrawingCommand = { kind: 'add'|'move'|'delete'; drawingId: string;
  before: Drawing | null; after: Drawing | null; resultRev: number }`;
  `PanelHistory = { undo: DrawingCommand[]; redo: DrawingCommand[] }`;
  `HISTORY_LIMIT = 50` (named constant with rationale).
- Modify: `state/drawings/drawings.reducer.ts` — every applied add/move/delete
  bumps `revisions[id]` and pushes a command (capped) onto the acting panel's
  undo stack, clearing its redo stack; `undo{panelId}` / `redo{panelId}` pop with
  the guard: apply iff entity's current rev === `resultRev` AND not `locked`;
  stale commands are DROPPED and the pop continues within the same action;
  applying pushes the mirrored command to the opposite stack with the new
  `resultRev`. `restoreDrawings` resets `history`/`revisions`.
- Modify: `components/chart/chart.component.ts` (or the panel host if key events
  already live there — inspect first): Ctrl+Z / Ctrl+Y (+Ctrl+Shift+Z) dispatch
  `undo`/`redo` with the FOCUSED panel's id (`layoutFeature` focused panel — the
  existing focus selector), only when no input element has focus.
- Test: NEW `drawings.history.spec.ts` — EVERY row of the technical spec §5
  rulings table: stale-drop after foreign move; undo-move after foreign delete
  (stale); undo-delete recreates verbatim (same id, rev continues); locked blocks
  but retains; undo after leaving the group applies; redo cleared by fresh
  command; cap at 50; determinism (same dispatch sequence → same state, asserted
  by replaying the sequence twice).

**Interfaces:**
- Consumes: Task 3 reducer/entities.
- Produces: `DrawingsActions.undo({panelId})`, `redo({panelId})`. Task 5's
  paste participates in history as a normal `add` command.

- [ ] Step 1 (TDD): failing history specs (full table).
- [ ] Step 2: implement reducer mechanics; keyboard wiring.
- [ ] Step 3: gates; pathspec commits.

---

### Task 5: Clipboard (D17.G) + per-panel shared-layer toggle (D17.H)

**Files:**
- Modify: `state/drawings/drawings.models.ts` — `clipboard: ClipboardEntry | null`;
  `ClipboardEntry = { kind: DrawingType; p1: DrawingPoint; p2: DrawingPoint }`.
- Modify: `state/drawings/drawings.actions.ts` + reducer —
  `copySelected{panelId}` (captures geometry of that panel's selection; no-op
  when none), `pasteClipboard{panelId, drawing}` — the DISPATCHING component
  builds the new `Drawing` (fresh uuid — purity: id minted component-side) with
  `symbol` + `owner` resolved exactly like drawing by hand
  (`resolveDrawingTarget`), `locked:false, visible:true`; reducer treats it as
  `addDrawing` (zIndex assignment, history command, selection set to the paste).
- Modify: `state/layout/layout.models.ts` — `PanelDescriptor.hideSharedDrawings?: boolean`
  (additive, absent = false); `layout.actions.ts` + `layout.reducer.ts` —
  `setPanelHideSharedDrawings({panelId, hidden})` (same idiom as
  `setPanelTimeframe`).
- Modify: `components/chart/chart-model-mapper.service.ts` — composition drops
  the shared layer when `descriptor.hideSharedDrawings` (visibility-filter stage
  of the §4 diagram).
- Modify: `components/workspace/chart-panel.component.ts` — header eye-toggle
  for the shared layer (visible only when the panel is linked), Spanish
  aria-label (`"Ocultar capa compartida"`), keyboard: Ctrl+C / Ctrl+V on the
  focused panel (same guard as Task 4's keys).
- Test: NEW `drawings.clipboard.spec.ts` (copy captures geometry only; paste
  mints new identity under destination symbol+target; paste of a locked shared
  shape yields an unlocked local/shared copy per destination resolution; paste
  participates in undo), NEW `layout.hide-shared.spec.ts`, composition spec
  extension for the toggle (new file or Task 3's NEW spec file).

**Interfaces:**
- Consumes: Tasks 2–4 (`resolveDrawingTarget`, reducer, history).
- Produces: `copySelected`, `pasteClipboard`,
  `LayoutActions.setPanelHideSharedDrawings`, descriptor flag consumed by
  composition and persisted verbatim inside the existing `panels` record (no
  payload version work here — V2/V3 both carry descriptors verbatim).

- [ ] Step 1 (TDD): failing clipboard + toggle specs.
- [ ] Step 2: implement state + UI + keyboard.
- [ ] Step 3: gates; pathspec commits.

---

### Task 6: `SessionPayloadV3` + migration chain + IndexedDB lift (D17.J)

**Files:**
- Modify: `services/session-sync.models.ts` — `SESSION_PAYLOAD_VERSION_3 = 3`;
  `SessionPayloadV3` (V2 verbatim except
  `drawings: { version: 2; items: Drawing[] }`); `StoredSessionPayload` union +=
  V3; `PayloadInput`/`SessionView`/`RestoredView.drawings` become the V3 shape.
- Modify: `services/session-migration.ts` — `isSessionPayloadV3` shape guard;
  `migrateV2ToV3(v2: SessionPayloadV2): SessionPayloadV3` (per-symbol record →
  flat lifted items via `liftLegacyDrawing` + `ownerPanelFor` against the V2
  payload's OWN layout/panels; zIndex = running position; paint order preserved);
  `parseSessionPayload` returns V3, chaining V1→V2→V3; malformed fallback keeps
  the defensive single-panel shape (now V3).
- Modify: `services/session-sync.mapping.ts` — `toPayload` writes V3 (flat items
  straight from store entities — Task 3's `groupDrawingsBySymbol` V2 bridge is
  deleted); `fromPayload` hydrates `restoreDrawings` from `drawings.items`;
  `assertNoCandles` unchanged on every write.
- Modify: workspace hydration read path (`state/workspaces/**` effects or
  `services/workspace-db.service.ts` read — locate the single point where
  `Workspace.drawings` enters the store): shape-guard lift — items missing
  `owner` are legacy `{id,kind,p1,p2}` and lift via `liftLegacyDrawing` with the
  workspace's symbol + `ownerPanelFor` over the CURRENT layout state. No
  `DB_VERSION` bump, no new object store (STOP-protected store-count spec stays
  green).
- Modify: `.session.json` import/export path (locate via grep `restoreDrawings(`
  + existing import service): same `parseSessionPayload` chain — no parallel
  parser.
- Test: NEW `session-migration.v3.spec.ts` — V2→V3 fidelity table (symbol from
  record key; owner = first symbol-matching panel; fallback first panel;
  single-panel V2 reduces to `panel-1`; zIndex order preserved; V1→V3 chain;
  malformed → defensive fallback; V3 round-trip lossless through
  `toPayload`/`fromPayload`); workspace legacy-lift spec.

**Interfaces:**
- Consumes: Task 2 migration pures, Task 3 store hydration.
- Produces: `SessionPayloadV3`, `migrateV2ToV3`, `isSessionPayloadV3` — the wire
  shape everything downstream (cloud LWW, `.emul`/`.session.json`, IDB) now
  speaks.

- [ ] Step 1 (TDD): failing migration/round-trip specs (full fidelity table).
- [ ] Step 2: implement models + migration + mapping cutover + workspace lift.
- [ ] Step 3: full suite; adapt ONLY superseded-shape persistence specs
  (ledger-enumerated); gates; pathspec commits.

---

### ~~Task 7: Trade layer gating + Ghost Rails primitives~~ — SUPERSEDED BY TEDS · OUT OF SCOPE

Pipeline contract: technical spec §4 (V3 gate node). Visual contract: visual
spec §5–6 (Ghost Rails + adopted HUD chip and MAE/MFE ticks).

**Files:**
- Create: `components/chart/trade-layer-gate.ts` — pure predicate
  `tradeLayerEnabledFor(descriptor: PanelDescriptor | null, groups:
  Record<string, LinkGroup>, primarySymbol: string | null): boolean` — the ONE
  rule both the mapper gate (this task) and the HUD chip (Task 8) evaluate.
- Modify: `components/chart/chart-model-mapper.service.ts` —
  `tradeChartView$` gains the gate: emit the real view iff
  `descriptor.symbol === primarySymbol` (locate the primary-symbol selector —
  the session's trading symbol, grep `primarySymbol` in `state/`) AND
  (`descriptor.linkGroupId === null` OR the resolved group's `syncTrades`);
  otherwise emit the EMPTY_TRADE_VIEW constant (module-level frozen
  `{positions:[], orders:[], markers:[], boxes:[]}` — reference-stable so the
  capability's memo short-circuits). Descriptor-less legacy fallback keeps
  today's behavior.
- Modify: `domain/chart/render-model.ts` — `TradingModel` gains
  `paths?: TradePathItem[]` where
  `TradePathItem = { id: string; from: {time, price}; to: {time, price};
  outcome: 'up' | 'down'; mae?: {time, price} | null; mfe?: {time, price} | null }`
  (additive DTO data — allowed engine-side).
- Modify: `domain/chart/capabilities/trade-boxes-primitive.ts` — Ghost Rails
  geometry: zone fills at visual-spec opacities (8% fill / 32% border via
  existing `hexToRgba`), span-scoped entry/SL/TP rail segments drawn INSIDE the
  primitive (entry solid 1px side color, SL/TP dotted 1px at 55%), hover
  brightening handled by a `hoveredId` field on the source (set from the
  component's crosshair move, same pattern as `selectedId` in drawings).
- Create: `domain/chart/capabilities/trade-path-primitive.ts` — dashed
  entry→exit polyline per closed trade (4-3 dash, outcome color) + 4px MAE/MFE
  ticks (`--zone-risk` amber constant for MAE, up-color for MFE). Same
  `ISeriesPrimitive` idiom as `DrawingsPrimitive` (pane view resolves
  time/price → screen; renderer culls off-pane, mirrors the defensive cull).
- Modify: `domain/chart/capabilities/trading-capability.ts` — attach the path
  primitive; RETIRE full-width `createPriceLine` usage for SL/TP (rail drag
  hit-testing moves to the primitive's `hitTestEdge`, which already exists for
  box edges); keep ONE price line per focused live position entry with
  `lineVisible: false, axisLabelVisible: true` (axis label only — verify the
  lightweight-charts v5 option name at implementation; if unsupported, keep the
  entry line at 35% opacity as the fallback and record the deviation);
  `hitTestTradeLine` reimplemented over rail segments (same 4px grab).
- Modify: `components/chart/chart.component.ts` — pass `paths` (built from
  closed trades' MAE/MFE fields already on `ClosedTrade`, RFC-014 §3 — locate
  exact field names in `trading.models.ts` at implementation) through
  `buildTradingModel`; drag interactions keep dispatching the SAME trading
  actions (`modifyOrder`/`modifyPosition`) — the money path is untouched.
- Test: NEW `trade-path-primitive.spec.ts` (geometry, culling, outcome
  coloring), NEW `chart-model-mapper.trade-gating.spec.ts` (gate truth table:
  primary+unlinked → on; primary+linked+flag → on; primary+linked+flag-off →
  EMPTY ref; non-primary → EMPTY ref; reference-stability of the empty view),
  trade-boxes rails spec (NEW file).

**Interfaces:**
- Consumes: Task 1 `syncTrades`; existing `selectTradeChartView`,
  `ClosedTrade` MAE/MFE facts.
- Produces: `TradePathItem`, gated `tradeChartView$`. Task 8 styles the HUD chip
  against the same gate.

- [ ] Step 1 (TDD): failing gating + primitive specs.
- [ ] Step 2: implement mapper gate; verify EMPTY view reference-stability.
- [ ] Step 3: implement primitives + capability rewiring; manual smoke via
  `ng test` specs only (no dev-server requirement in this repo's gates).
- [ ] Step 4: gates; pathspec commits (mapper / primitives / component).

---

### ~~Task 8: Position HUD chip + Design System token registration~~ — SUPERSEDED BY TEDS · OUT OF SCOPE

**Files:**
- Create: `components/workspace/position-hud-chip.component.ts` — standalone,
  OnPush; renders ONLY when its panel passes Task 7's gate AND a live position
  exists: side glyph (`C`/`V` per existing convention), lots, floating P/L in R
  and currency (`selectFloatingEquity` / position excursion selectors — locate
  in `state/trading/`), `tabular-nums` + `.font-mono`, `--surface-2` bg,
  `--radius-sm`, `--elevation-1`, `aria-live="polite"`, Spanish aria-label
  (`"Posición: compra 0.20 lotes, P/L flotante..."`). Positioned top-right
  inside the panel over the chart.
- Modify: `components/workspace/chart-panel.component.ts` — mount the chip
  (input: descriptor; the chip injects Store itself for trading selectors).
- Modify: `DESIGN_SYSTEM.md` — register the `--trade-*` token table + interactive
  states from the visual spec §6 as a new §4 subsection ("Trade Visualization
  Layer"), and note the canvas-mirror rule (tokens are authority; the ACL mirrors
  them). Update `styles.css` ONLY if the chip needs new custom properties
  (`--trade-hud-bg` maps to existing `--surface-2` — prefer var() references,
  no new primitives).
- Test: NEW `position-hud-chip.component.spec.ts` (renders on gate, hides
  without position, tabular-nums class, aria attributes, P/L formatting for
  win/loss signs).

**Interfaces:**
- Consumes: Task 7's gate logic (extract the pure predicate
  `tradeLayerEnabledFor(descriptor, groups, primarySymbol): boolean` into
  `state/selectors`-adjacent pure module so mapper and chip share ONE rule —
  define it in Task 7, file `components/chart/trade-layer-gate.ts`).
- Produces: the visible HUD; DESIGN_SYSTEM §4 subsection other surfaces cite.

- [ ] Step 1 (TDD): failing chip specs.
- [ ] Step 2: implement chip + mount; DESIGN_SYSTEM.md §6.5 checklist pass
  (8 states where applicable, contrast, reduced-motion inherited).
- [ ] Step 3: gates; pathspec commits.

---

### Task 9: Finalization — invariant greps, build, docs closure

**Files:**
- Modify: `docs/architecture/rfcs/017-compositional-panel-sync.md` (Estado →
  Implementado + deviations section if any accumulated),
  `docs/engineering/domain/workspace-panels.md` (composition model + two sync
  families paragraph), `docs/architecture/DOMAIN_MODEL.md` (I-18 drawings
  ownership invariants row-set with detectors, mirroring I-16/I-17 style).
- Verify: whole-branch.

- [ ] Step 1: full gates + `npm run build` (no NEW chunk types).
- [ ] Step 2: invariant greps, all must hold —
  `grep -rn "selectChartView(" emulador/src/app --include="*.ts" | grep -v spec`
  (no panel-parameterized factory selectors added);
  `syncPriceScale` zero read sites outside model/spec fixtures;
  no `owner` reassignment action in reducers (manual review + the reducer spec);
  `assertNoCandles` present on every payload write path;
  zero imports of `*.spec-util` in app code; `package.json` diff empty.
- [ ] Step 3: docs updates; ledger closure with test-count arithmetic
  (baseline → final), deviation classification, FINAL-AUDIT ATTENTION flags
  (largest diffs: Task 3 and Task 7).
- [ ] Step 4: commit; hand off to final audit per
  `docs/engineering/sdd-orchestration.md` (PR only on PASS).
