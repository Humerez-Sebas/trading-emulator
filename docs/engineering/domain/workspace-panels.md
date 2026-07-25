# Domain: Workspace, Panels, Layout & Synchronization

The multi-chart layer (RFC-008..013). Frozen decisions live in
`docs/architecture/rfcs/008-012-multi-chart-panel-system-vision.md` — read it before
changing anything here; its non-goals are binding.

## The shape of the system (and why)

- **Session is the aggregate root**: it owns layout (tabs + single-level grid), link
  groups, and owner-tagged drawings (per-panel or per-link-group; symbol is a
  composition-time filter, not a storage key — see "Drawing composition & ownership"
  below). Candles sit BELOW the aggregate, shared by reference per symbol, never
  copied. Sovereignty is per-session: two sessions showing the same symbol have fully
  independent layouts/drawings.
- **Mono-symbol trading (D1):** the session trades exactly one `primarySymbol`;
  other-symbol panels are strictly view-only context. Making panels tradeable
  multi-symbol is a future RFC (market multi-load), not a tweak.
- **Topology is deliberately bounded:** tabs + one-level `GridTemplate` enum
  (`'1'|'2h'|'2v'|'3'|'2x2'|'1+2'|'1+3'`), `MAX_PANELS_PER_TAB = 8`. Free docking/BSP
  trees and floating windows are explicit non-goals — bounded topology is what keeps
  layout state serializable, migratable, and testable.

## Reactivity: one mapper per panel (D8)

Each panel derives its view through its own local `ChartModelMapper` instance. N panels
⇒ N independent single-slot memoizers — no thrash, because each sees only its panel.
Never introduce a shared parameterized selector for panel views (anti-patterns #1).

## Lifecycle: keep-alive + gating + lazy creation

- Hidden panels stay mounted (`[hidden]`, stable track keys) so engine instances
  survive tab switches, but their mapper feeds are **update-gated** (D6): hidden = zero
  render work; on show, resync from the latest snapshot.
- Engines are created lazily on first visibility (sticky `hasBeenVisible` latch).
- Registry liveness is deliberately decoupled from chart mounting — tests count leaf
  mounts, never `registry.count()`.

## Synchronization (RFC-010)

- Link groups carry `syncCrosshair` / `syncTimeRange`; `syncPriceScale` is a **reserved
  field with zero read sites** — audits verify it stays that way.
- The `ChartSyncRouter` fans events out group-scoped with **origin exclusion** and
  **value-keyed idempotent application**. This — not re-entrancy flags — is the
  structural defense against A-moves-B-moves-A loops, because lightweight-charts echoes
  arrive on the next animation frame (see chart-engine.md).
- Replay is ONE global clock fanned out to panels; each panel projects
  at-or-before-T (`selectReplayIndex` binary search). Symbols with data gaps
  freeze-on-last rather than desync.

## Drawing composition & ownership (RFC-017)

Drawings live in one flat per-session entity store (`entities: Record<id, Drawing>`,
`ownerIndex: Record<'panel:<id>' | 'group:<id>', string[]>`), never a per-symbol
slice. A symbol change is a pure filter, not a data swap. Ownership is a single
required `DrawingOwner` field (`{type:'panel'|'group', id}`), immutable after
creation — no action reassigns it (invariant grep +
`drawings.reducer.entity.spec.ts`'s "ownership immutability" suite).

### Two sync families (D17.K)

- **Event-channel sync** (`syncCrosshair`, `syncTimeRange`): routed through
  `ChartSyncBus` → `ChartSyncRouter`, origin-excluded and idempotent (see
  Synchronization above — unchanged by this RFC).
- **Composition sync** (`syncDrawings`, `syncTrades`): shared state BY
  CONSTRUCTION. Two panels resolving the same link group compose the same layer
  from the same store snapshot — nothing travels the bus, there is no echo to
  suppress. This keeps Invariant 3 honest: a `LinkGroup` resolves a namespace
  (`group:<id>` in the owner index) but never stores or forwards drawing data — it
  has no drawings field at all.

### Per-panel composition (D8 intact)

Each panel's own `ChartModelMapper` instance composes its drawing layer:
`ownerIndex['panel:<id>'] ∪ ownerIndex['group:<id>']` (when linked with
`syncDrawings` true), filtered by symbol and `visible`, ordered by `zIndex`. This is
NOT a shared parameterized selector — the six-reference memo (`descriptor, entities,
ownerIndex, selection, groups, currentAsset`) lives inside the mapper instance, so N
panels stay N independent memoizers (same discipline as `panelChartView$` above).

### The `''` sentinel and the active asset

`PanelDescriptor.symbol === ''` means "track the active asset" — every hot-added
panel and the cold-start `panel-1` carry it. `effectivePanelSymbol(descriptor,
currentAsset)` resolves it before the symbol filter runs, so a freshly opened panel
composes drawings from its first emission rather than only once a symbol is
explicitly set. An explicit non-empty `descriptor.symbol` always wins over the
active asset.

### Per-panel selection, undo/redo, and the clipboard

- **Selection** is per-panel (`selection: Record<panelId, id|null>`), not global: N
  panels editing a shared layer under one global selection would let panel B delete
  what panel A has selected. Selecting a drawing in one panel steals it away from
  every other panel's slot (D17.E).
- **Undo/redo** (D17.F) is per-panel command stacks with a revision guard: a stale
  command (another panel mutated the same drawing since) is dropped, not applied; a
  locked drawing blocks and RETAINS the command. Determinism comes from the
  reducer's total mutation order, never from timing.
- **Clipboard** (D17.G) is runtime-only (one slot, reset on every hydration path,
  never persisted or synced). Copy captures geometry + kind only — never identity,
  owner, lock, or visibility. Paste creates a NEW drawing through the exact same
  target-resolution rule as hand-drawing (`resolveDrawingTarget`: group if
  `linkGroupId + syncDrawings`, panel otherwise) — one rule for every drawing
  creation path, so Invariant 1 (no implicit copying) holds by construction.
- **`hideSharedDrawings`** (D17.H, optional on `PanelDescriptor`, persisted): a
  per-panel toggle that hides the composed GROUP layer in that panel only — it never
  deletes or mutates the underlying shared drawings, and sibling panels in the same
  group keep composing them normally.

### Panel-close cascade

Closing a panel (or a tab, which closes each of its panels) cascade-deletes that
panel's OWN drawings — group-owned drawings survive. Both close controls disclose
this in the UI (`aria-label` and `title`). Auto-reassignment to another owner is
banned by Invariant 1: panel ids are UUIDs, so an orphaned `panel:<uuid>` owner key
could never be reclaimed, and the drawings would sit in every payload forever,
unrenderable and undeletable. This was a product decision RFC-017 itself never
made — see its §13 for the full rationale.

## UI integration (RFC-013)

The production page mounts `<app-workspace-viewport>`; the page-level mapper provider is
gone (panels provide their own). Per-panel timeframe selects reuse `selectSessionTfs`
(the same selector the global controls use — scoped to timeframes that actually have
series) rather than a static timeframe list. LinkGroups UI is plain DOM (no CDK), with
delete cascading `setPanelLinkGroup(null)` to member panels.

### Template = lens, not blender (RFC-013 follow-up)

`applyGridTemplate` is non-destructive: cells are a stable ordered list; the
template only decides how many are rendered. Shrinking parks (keeps mounted +
`[hidden]`, update-gated) the non-empty cells that no longer fit and trims only
trailing empty cells; growing reveals parked cells in their original slot. So
`cells.length` may exceed `GRID_TEMPLATE_CELLS[template]` — the layout invariant
permits this (it only enforces the panel↔cell bijection). `[hidden]` genuinely
hides only because each host declares a `[hidden]{display:none}` rule that
out-specifies its own `display` rule — the UA rule alone loses the cascade.

### Focused panel is the global-TF proxy

The focused panel and the global market timeframe are two-way bound:
focusing a panel syncs the global TF to it (`LayoutEffects.syncTimeframeOnFocus$`
→ `MarketActions.changeTimeframe`), and the global M1/H1/D1 controls write the
focused panel's TF (handled in `layout.reducer`). A panel's own `<select>`
(`setPanelTimeframe`) is intentionally panel-local and does NOT move the global
TF. `applyGridTemplate` re-focuses a rendered panel whenever the focused one is
parked, so the global controls never target an off-screen panel.

## Persistence

Layout + linkGroups + owner-tagged drawings travel inside the single
`SessionPayloadV3` (one LWW cycle, never two — D9); on the wire drawings are
`{version: 3, items: Drawing[]}`, a flat owner-tagged set rather than the V2
per-symbol collection. IndexedDB lifts pre-RFC-017 legacy shapes at read time.
Details and migration rules: `session-sync.md` (predates RFC-017 — its Payload
rules section still describes the V2 wire shape; updating it is documentation
debt not gated by RFC-017's own closure).
