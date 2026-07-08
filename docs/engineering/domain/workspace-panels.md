# Domain: Workspace, Panels, Layout & Synchronization

The multi-chart layer (RFC-008..013). Frozen decisions live in
`docs/architecture/rfcs/008-012-multi-chart-panel-system-vision.md` — read it before
changing anything here; its non-goals are binding.

## The shape of the system (and why)

- **Session is the aggregate root**: it owns layout (tabs + single-level grid), link
  groups, and per-symbol drawings. Candles sit BELOW the aggregate, shared by reference
  per symbol, never copied. Sovereignty is per-session: two sessions showing the same
  symbol have fully independent layouts/drawings.
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

Layout + linkGroups + per-symbol drawings travel inside the single `SessionPayloadV2`
(one LWW cycle, never two — D9). Details and migration rules: `session-sync.md`.
