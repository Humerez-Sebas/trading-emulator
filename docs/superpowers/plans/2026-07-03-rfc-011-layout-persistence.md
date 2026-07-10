# RFC-011 Workspace Layout Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing, audited `SessionPayloadV1` (Supabase JSONB + IndexedDB cache + LWW, `emulador/src/app/services/session-sync.models.ts` / `session-sync.mapping.ts` / `session-sync.service.ts`) to a versioned `SessionPayloadV2` that additionally carries `layout: WorkspaceLayout`, `panels: Record<string, PanelDescriptor>`, `linkGroups: LinkGroup[]`, and `drawings: Record<string, DrawingCollection>` (replacing V1's flat `Drawing[]`) — so that RFC-008/009/010's in-memory-only `layoutFeature`/`linkGroupsFeature`/`drawingsFeature` state survives an app close or device change. A pure, versioned `migrateV1ToV2` function upgrades any payload with `schemaVersion` absent or `1` at read time (lazy migration, no batch script), defaulting the migrated layout to a single tab/single cell/single panel of the session's one active symbol+timeframe, `linkGroups: []`, and reassigning every V1 drawing under that same symbol. Both the Supabase mapping (`toPayload`/`fromPayload`/`buildRow`/`reconstructWorkspaces`) and the restore dispatch path (currently `WorkspacesEffects.doSwitch`'s `thenRestore` → `TradingActions.restoreSession` + `DrawingsActions.restoreDrawings`) are extended in place to also carry/hydrate `layout`/`linkGroups`/`panels` — there is no second payload, no second LWW timestamp, no second sync cycle (D9). `layoutFeature`/`linkGroupsFeature`/`drawingsFeature` are currently NOT read by ANY persistence code (`session-sync.*`, `workspaces.effects.ts`, `workspace-db.service.ts`) — this RFC is the first wiring between RFC-008..010's runtime state and the persistence layer that has existed, unaltered, since before RFC-008.

**Architecture:** `SessionPayloadV1`'s exact field set (`schemaVersion, trading, currentTime, activeTf, customTfMinutes, playbackSpeed, replayResolution, drawings, notes, selectedTfs, startRange, endRange, requiredDatasets`) is preserved byte-for-byte in `SessionPayloadV2` except `drawings`, whose type changes from `Drawing[]` to `Record<string, DrawingCollection>`, and three additive fields: `layout: WorkspaceLayout`, `panels: Record<string, PanelDescriptor>`, `linkGroups: LinkGroup[]`. **Design decision — where do `PanelDescriptor`s live in V2:** the frozen vision interface (`docs/architecture/rfcs/008-012-multi-chart-panel-system-vision.md`) defines `WorkspaceLayout { tabs: TabLayout[]; activeTabId: string }` with `GridCell.panelIds: string[]` — cell entries are bare ids, not descriptors; the descriptors live in the **runtime** `LayoutState.panels: Record<string, PanelDescriptor>` map, a sibling of (not nested inside) `workspace: WorkspaceLayout`. Persistence must mirror that exact split rather than inventing a nested shape: `SessionPayloadV2.layout` is the serialized `WorkspaceLayout` (tabs/cells/ids only) and a **new sibling field `panels: Record<string, PanelDescriptor>`** carries the descriptor map — this is additive to the vision's frozen `SessionPayloadV2` sketch (which lists `layout` but does not enumerate `panels` explicitly), justified because: (1) it reuses `LayoutState`'s own two-part shape verbatim (`{ workspace, panels }`) so serialize/hydrate is a straight round-trip of the existing reducer state with zero reshaping, (2) a cell's `panelIds: string[]` would otherwise dangle with no descriptor to resolve `symbol`/`timeframe`/`linkGroupId` after restore, breaking `assertLayoutConsistent`'s bidirectional referenced-vs-registered invariant on the very first hydration, and (3) it stays stable for RFC-012 (which only reads panel descriptors to decide lazy chart creation, never mutates the persistence shape). `migrateV1ToV2` is a pure function (`emulador/src/app/services/session-migration.ts`, new file) with zero DI/IO, covered by round-trip tests asserting every V1 field is preserved field-for-field, plus an idempotence test (migrating an already-V2 payload is a no-op passthrough). The Supabase/IndexedDB mapping layer (`session-sync.mapping.ts`'s `toPayload`/`fromPayload`, `session-sync.service.ts`'s `fetchPayload`/`reconstructWorkspaces` call sites) is extended additively to read/write the new fields through the SAME single JSONB payload column and the SAME LWW `clientUpdatedAt` resolution already audited for V1 — no new Supabase column, no new IndexedDB store, no second sync effect. The restore dispatch path gains three new actions fed from the migrated/parsed `SessionPayloadV2` at the exact point `WorkspacesEffects.doSwitch`'s `thenRestore` branch currently dispatches `TradingActions.restoreSession`/`DrawingsActions.restoreDrawings`: `LayoutActions.restoreLayout`, `LinkGroupsActions.restoreGroups`, and `DrawingsActions.restoreDrawings` gains a second, additive per-symbol form. A payload whose `layout`/`panels` fail `assertLayoutConsistent`'s invariant (corrupt/foreign data) never reaches the reducer as-is — `parseSessionPayload` (new, in `session-migration.ts`) defensively re-synthesizes the migration-default single-panel layout instead of trusting an inconsistent persisted shape.

**Tech Stack:** Angular 21 standalone + signals, NgRx 21, RxJS 7.8, Vitest 4 via `ng test`, Supabase JS client (existing), native `indexedDB` (existing, no wrapper library).

## Global Constraints

- **No new dependencies.** Migration and parsing are hand-written pure functions; no schema-validation library, no deep-equal library (structural comparisons use `JSON.stringify`/manual field checks, consistent with RFC-010's `ChartSyncRouter` precedent).
- **FORBIDDEN: touching audited chart files.** `chart-engine.ts`, `chart.component.ts`, `chart-panel.component.ts`, `chart-registry.service.ts`, `chart-sync-router.ts`, `chart-model-mapper.service.ts` — none of these appear in any task's file list. This RFC is state/persistence only.
- **FORBIDDEN: factory selectors parametrized by id** (D8/RFC-009/010 discipline, inherited unchanged). No `createSelector` factory keyed by `panelId`/`symbol` is introduced by this RFC's tasks.
- **Atomic LWW: ONE payload, ONE sync cycle (D9), non-negotiable.** `layout`, `panels`, `linkGroups`, and `drawings` travel inside the SAME `SessionPayloadV2` resolved by the SAME `clientUpdatedAt`-based LWW logic (`mergeByLww` in `session-sync.mapping.ts`, unchanged) already audited for V1. No new timestamp field, no new Supabase column, no second effect subscribing to a second debounced snapshot. The one existing snapshot selector (`selectWorkspaceMetaSnapshot` in `state/selectors.ts`) is extended with `layout`/`panels`/`linkGroups` slices, not duplicated.
- **V1 read path must never break.** Every existing `SessionPayloadV1` (Supabase rows already in production, `.session.json` exports already on users' disks) must keep restoring correctly forever via `migrateV1ToV2`, applied lazily at read time — never a batch/background migration of stored rows.
- **NEVER lose user data during migration.** Every V1 field is mapped into V2 (verbatim for the 11 unchanged fields, transformed but content-preserving for `drawings`). Round-trip tests assert field-for-field equality, not just "no throw".
- **Migration is a pure function.** `migrateV1ToV2` and `parseSessionPayload` take a value and return a value — no `fetch`, no `indexedDB`, no Angular DI — so they are unit-testable in complete isolation, matching the discipline of `session-sync.mapping.ts`'s existing pure functions (`toPayload`, `flattenWorkspace`, `mergeByLww`).
- **Defensive parse, not defensive-by-convention.** A payload whose `layout`/`panels` do not satisfy `assertLayoutConsistent` (imported from `state/layout/layout-invariants.spec-util.ts` — see Task 1 note on promoting it out of `spec-util`) is NOT hydrated as-is; `parseSessionPayload` falls back to the same single-panel default the V1→V2 migration itself produces.
- **Drawings become per-symbol, not per-panel** (R2/D3, vision-frozen): `Record<string, DrawingCollection>` keyed by symbol. Two panels showing the same symbol share one `DrawingCollection`. `DrawingCollection { version: number; items: Drawing[] }` — `version` starts at `1`, scoped to a single symbol's drawing format, independent of `SessionPayloadV2.schemaVersion`.
- **Sanctioned additive changes to RFC-008/009/010 code (each additive-only):**
  1. `state/layout/layout.actions.ts` / `layout.reducer.ts` (Task 2): ADD `restoreLayout` action + handler — one new action, one new `on()`, no changes to any existing handler.
  2. `state/link-groups/link-groups.actions.ts` / `link-groups.reducer.ts` (Task 2): ADD `restoreGroups` action + handler, same pattern.
  3. `state/drawings/drawings.actions.ts` / `drawings.reducer.ts` (Task 2): ADD `restoreDrawingsForSymbol` as a second, additive restore action (the existing single-array `restoreDrawings` used by the `.session.json` flow is untouched — see Task 2 rationale for why a second action, not a signature change, is correct here).
  4. `state/layout/layout-invariants.spec-util.ts` (Task 1): promoted from a spec-only util (imported today only by `*.spec.ts` files) to also be imported by non-spec production code (`session-migration.ts`'s defensive parse) — file itself is unchanged, only its consumer set grows. If the project's lint/build config restricts `*.spec-util.ts` imports to test files, Task 1 Step 0 renames it to `layout-invariants.ts` (no `.spec-util` segment) and updates its two existing spec importers; this plan defaults to attempting the import as-is first and only renames if `tsc`/lint fails on it (see Task 1 Step 0).
  5. `state/selectors.ts`: `selectWorkspaceMetaSnapshot` (Task 3) gains `layout`/`panels`/`linkGroups` fields in its projection. The selector's existing 8 input selectors and 8 existing output fields are unchanged; three are added.
  6. `services/session-sync.models.ts` / `session-sync.mapping.ts` / `session-sync.service.ts` (Tasks 3-4): additive fields/params only — no existing exported function's signature loses a parameter or changes an existing field's meaning.
  7. `state/workspaces/workspaces.actions.ts` / `workspaces.effects.ts` (Task 5): `PendingSessionRestore` gains `layout`/`panels`/`linkGroups` fields; `doSwitch`'s `thenRestore` branch gains three dispatches alongside its existing two. No existing dispatch in that branch is removed or reordered relative to itself.
- Verification per task (from `emulador/`): `npx tsc -p tsconfig.app.json --noEmit`, `npx tsc -p tsconfig.spec.json --noEmit`, `npm test -- --watch=false`, and `npm run lint` → zero NEW lint problems (pre-existing baseline errors on this branch are tracked separately; do not fix them here).
- Known pre-existing suite flakiness in `trading-capability.spec.ts` / `selectors.spec.ts` (tracked separately): if a run fails there, re-run before concluding.
- Task-scoped conventional commits.

---

### Task 1: `SessionPayloadV2` model + pure `migrateV1ToV2` / `parseSessionPayload`

**Files:**
- Create: `emulador/src/app/services/session-migration.ts`
- Create: `emulador/src/app/services/session-migration.spec.ts`
- Modify: `emulador/src/app/services/session-sync.models.ts` (add `SessionPayloadV2`, `SESSION_PAYLOAD_VERSION_2`, `DrawingCollection` re-export point)
- Modify: `emulador/src/app/state/layout/layout-invariants.spec-util.ts` (Step 0: attempt import from production code; rename to `layout-invariants.ts` only if that fails — see Step 0)

**Interfaces:**
- Consumes: `SessionPayloadV1` (`session-sync.models.ts`, verbatim, unchanged), `WorkspaceLayout`/`PanelDescriptor`/`GridCell`/`TabLayout` (`state/layout/layout.models.ts`, unchanged), `LinkGroup` (`state/link-groups/link-groups.models.ts`, unchanged), `Drawing` (`state/drawings/drawings.models.ts`, unchanged), `createInitialLayoutState`/`assertLayoutConsistent` (unchanged).
- Produces:

```ts
// session-sync.models.ts — ADD (SessionPayloadV1 above is untouched)
export const SESSION_PAYLOAD_VERSION_2 = 2;

/** A symbol-scoped, versioned set of drawings (R2/D3). `version` scopes the Drawing[] item format, independent of schemaVersion. */
export interface DrawingCollection {
  version: number;
  items: Drawing[];
}

/**
 * V2 extends V1 in place (D9): every V1 field except `drawings` is preserved
 * verbatim (same name, same type, same meaning); `drawings` changes shape
 * (R2/D3); `layout`/`panels`/`linkGroups` are new, additive, RFC-008..010
 * runtime state made persistable for the first time.
 */
export interface SessionPayloadV2 {
  schemaVersion: 2;
  trading: TradingData;
  currentTime: number;
  activeTf: Timeframe | null;
  customTfMinutes: number | null;
  playbackSpeed: number;
  replayResolution?: number | null;
  /** (R2/D3) was Drawing[] in V1; now per-symbol. Session-scoped (non-goal: no cross-session sharing). */
  drawings: Record<string, DrawingCollection>;
  notes: unknown[];
  selectedTfs: Timeframe[];
  startRange: number;
  endRange: number;
  requiredDatasets: DatasetRef[];
  /** (D2) tabs/grid/activeTabId only — bare panelIds in cells, no descriptors (mirrors LayoutState.workspace verbatim). */
  layout: WorkspaceLayout;
  /** Sibling of `layout`, not nested inside it — mirrors LayoutState's own {workspace, panels} split so hydration is a direct assignment, no reshaping. */
  panels: Record<string, PanelDescriptor>;
  /** (D4) [] when no groups exist (V1 payloads and fresh sessions alike). */
  linkGroups: LinkGroup[];
}

/** Anything read from storage/Supabase that might be V1, V2, or malformed. */
export type StoredSessionPayload = SessionPayloadV1 | SessionPayloadV2 | Record<string, unknown>;
```

```ts
// session-migration.ts
import type { SessionPayloadV1, SessionPayloadV2, DrawingCollection, StoredSessionPayload } from './session-sync.models';
import { SESSION_PAYLOAD_VERSION_2 } from './session-sync.models';
import type { WorkspaceLayout, PanelDescriptor } from '../state/layout/layout.models';
import type { LinkGroup } from '../state/link-groups/link-groups.models';
import type { Timeframe } from '../models';

/** Builds the vision-mandated migration default: one tab, one cell, one panel = the session's own active symbol+timeframe. */
export function singlePanelLayoutFor(
  symbol: string,
  timeframe: Timeframe,
): { layout: WorkspaceLayout; panels: Record<string, PanelDescriptor> };

/** Pure. Upgrades a V1 payload to V2. `primarySymbol` is the caller's own active-asset symbol (V1 has no notion of it as a payload field — it is mono-symbol by construction, so the CALLER, which already knows which symbol this payload belongs to, supplies it; migrateV1ToV2 itself does not guess). */
export function migrateV1ToV2(v1: SessionPayloadV1, primarySymbol: string): SessionPayloadV2;

/** True iff `p.schemaVersion === 2` AND it has the minimum V2 shape (drawings is a Record, layout/panels present) — a v1 payload that happens to carry schemaVersion 2 by corruption is NOT trusted; see parseSessionPayload. */
export function isSessionPayloadV2(p: StoredSessionPayload): p is SessionPayloadV2;

/**
 * The single entry point every read site (Task 4) must call instead of
 * trusting a stored payload verbatim: migrates V1, defensively re-synthesizes
 * the migration-default layout for a V2 payload whose layout/panels fail
 * assertLayoutConsistent (corrupt/foreign data), and is a no-op passthrough
 * for an already-well-formed V2 payload (idempotence).
 */
export function parseSessionPayload(raw: StoredSessionPayload, primarySymbol: string): SessionPayloadV2;
```

- [ ] **Step 0: Try the production import first.** Add a throwaway import of `assertLayoutConsistent` from `../state/layout/layout-invariants.spec-util` at the top of a scratch file and run `npx tsc -p tsconfig.app.json --noEmit`. If `tsconfig.app.json`'s `include`/`exclude` excludes `*.spec-util.ts` from the app build (check `emulador/tsconfig.app.json`'s `exclude` array for a `**/*.spec-util.ts` or similar glob) OR lint flags a spec-only-file-imported-from-prod rule, rename `layout-invariants.spec-util.ts` → `layout-invariants.ts`, update its two existing importers (`layout.reducer.spec.ts` and any other spec file found via `grep -rl "layout-invariants.spec-util"`), and proceed with the new filename in every step below. Otherwise keep the existing filename. Delete the scratch file either way.

- [ ] **Step 1: Failing spec for `singlePanelLayoutFor` + `migrateV1ToV2` + `parseSessionPayload`** (`session-migration.spec.ts`):

```ts
import { describe, it, expect } from 'vitest';
import { migrateV1ToV2, parseSessionPayload, singlePanelLayoutFor, isSessionPayloadV2 } from './session-migration';
import { SESSION_PAYLOAD_VERSION, SESSION_PAYLOAD_VERSION_2, type SessionPayloadV1 } from './session-sync.models';
import { defaultTradingData } from '../state/trading/trading.models';
import type { Drawing } from '../state/drawings/drawings.models';

const drawing = (id: string): Drawing => ({
  id,
  kind: 'line',
  p1: { time: 100, price: 1.1 },
  p2: { time: 200, price: 1.2 },
});

function sampleV1(): SessionPayloadV1 {
  const trading = defaultTradingData(5000);
  trading.riskPct = 3;
  trading.sessionName = 'My Session';
  return {
    schemaVersion: SESSION_PAYLOAD_VERSION,
    trading,
    currentTime: 1700050000,
    activeTf: 'H1',
    customTfMinutes: null,
    playbackSpeed: 2,
    replayResolution: 5,
    drawings: [drawing('d1'), drawing('d2')],
    notes: ['a note'],
    selectedTfs: ['M1', 'H1'],
    startRange: 1699000000,
    endRange: 1700200000,
    requiredDatasets: [{ symbol: 'EURUSD', timeframe: 'H1' }],
  };
}

describe('singlePanelLayoutFor', () => {
  it('produces one tab, one cell, one panel for the given symbol+timeframe, unlinked', () => {
    const { layout, panels } = singlePanelLayoutFor('EURUSD', 'H1');
    expect(layout.tabs).toHaveLength(1);
    expect(layout.tabs[0].template).toBe('1');
    expect(layout.tabs[0].cells).toHaveLength(1);
    const panelId = layout.tabs[0].cells[0].panelIds[0];
    expect(layout.tabs[0].cells[0].activePanelId).toBe(panelId);
    expect(panels[panelId]).toEqual({ id: panelId, symbol: 'EURUSD', timeframe: 'H1', linkGroupId: null });
    expect(layout.activeTabId).toBe(layout.tabs[0].id);
  });
});

describe('migrateV1ToV2', () => {
  it('preserves every V1 field verbatim except drawings/schemaVersion', () => {
    const v1 = sampleV1();
    const v2 = migrateV1ToV2(v1, 'EURUSD');
    expect(v2.schemaVersion).toBe(SESSION_PAYLOAD_VERSION_2);
    expect(v2.trading).toEqual(v1.trading);
    expect(v2.currentTime).toBe(v1.currentTime);
    expect(v2.activeTf).toBe(v1.activeTf);
    expect(v2.customTfMinutes).toBe(v1.customTfMinutes);
    expect(v2.playbackSpeed).toBe(v1.playbackSpeed);
    expect(v2.replayResolution).toBe(v1.replayResolution);
    expect(v2.notes).toEqual(v1.notes);
    expect(v2.selectedTfs).toEqual(v1.selectedTfs);
    expect(v2.startRange).toBe(v1.startRange);
    expect(v2.endRange).toBe(v1.endRange);
    expect(v2.requiredDatasets).toEqual(v1.requiredDatasets);
  });

  it('assigns every V1 drawing to the primarySymbol under version 1, losing none', () => {
    const v1 = sampleV1();
    const v2 = migrateV1ToV2(v1, 'EURUSD');
    expect(v2.drawings).toEqual({ EURUSD: { version: 1, items: v1.drawings } });
  });

  it('synthesizes a single-panel layout of the primarySymbol + V1 activeTf, with empty linkGroups', () => {
    const v1 = sampleV1();
    const v2 = migrateV1ToV2(v1, 'EURUSD');
    const panelId = v2.layout.tabs[0].cells[0].panelIds[0];
    expect(v2.panels[panelId]).toEqual({ id: panelId, symbol: 'EURUSD', timeframe: 'H1', linkGroupId: null });
    expect(v2.linkGroups).toEqual([]);
  });

  it('a null V1 activeTf still produces a valid single panel (defaults to M1)', () => {
    const v1 = { ...sampleV1(), activeTf: null };
    const v2 = migrateV1ToV2(v1, 'EURUSD');
    const panelId = v2.layout.tabs[0].cells[0].panelIds[0];
    expect(v2.panels[panelId].timeframe).toBe('M1');
  });

  it('round-trip: migrating, JSON-serializing, and re-parsing produces a structurally identical V2', () => {
    const v1 = sampleV1();
    const migrated = migrateV1ToV2(v1, 'EURUSD');
    const reparsed = JSON.parse(JSON.stringify(migrated));
    expect(reparsed).toEqual(migrated);
  });

  it('is idempotent: migrating an already-V2 payload via parseSessionPayload is a no-op passthrough', () => {
    const v1 = sampleV1();
    const v2 = migrateV1ToV2(v1, 'EURUSD');
    const again = parseSessionPayload(v2, 'EURUSD');
    expect(again).toEqual(v2);
  });
});

describe('isSessionPayloadV2', () => {
  it('true for a migrated payload', () => {
    expect(isSessionPayloadV2(migrateV1ToV2(sampleV1(), 'EURUSD'))).toBe(true);
  });
  it('false for a raw V1 payload (schemaVersion 1)', () => {
    expect(isSessionPayloadV2(sampleV1())).toBe(false);
  });
  it('false for schemaVersion absent (pre-versioning legacy)', () => {
    const { schemaVersion: _drop, ...rest } = sampleV1();
    expect(isSessionPayloadV2(rest)).toBe(false);
  });
});

describe('parseSessionPayload defensive fallback', () => {
  it('migrates a V1 payload', () => {
    const v1 = sampleV1();
    const parsed = parseSessionPayload(v1, 'EURUSD');
    expect(parsed.schemaVersion).toBe(SESSION_PAYLOAD_VERSION_2);
    expect(parsed.drawings).toEqual({ EURUSD: { version: 1, items: v1.drawings } });
  });

  it('passes through a well-formed V2 payload unchanged', () => {
    const v2 = migrateV1ToV2(sampleV1(), 'EURUSD');
    expect(parseSessionPayload(v2, 'EURUSD')).toEqual(v2);
  });

  it('falls back to the single-panel default when layout/panels are inconsistent (orphan panelId)', () => {
    const v2 = migrateV1ToV2(sampleV1(), 'EURUSD');
    const corrupt = { ...v2, layout: { ...v2.layout, tabs: [{ ...v2.layout.tabs[0], cells: [{ panelIds: ['ghost-panel'], activePanelId: 'ghost-panel' }] }] } };
    const parsed = parseSessionPayload(corrupt, 'EURUSD');
    const panelId = parsed.layout.tabs[0].cells[0].panelIds[0];
    expect(parsed.panels[panelId]).toEqual({ id: panelId, symbol: 'EURUSD', timeframe: v2.activeTf ?? 'M1', linkGroupId: null });
  });

  it('falls back to the single-panel default when panels references a linkGroupId with no matching LinkGroup entry is NOT itself invalid (linkGroups only gate ChartSyncRouter behavior, not layout consistency) — sanity check this does NOT trigger a fallback', () => {
    const v2 = migrateV1ToV2(sampleV1(), 'EURUSD');
    const panelId = Object.keys(v2.panels)[0];
    const withDanglingGroup = { ...v2, panels: { ...v2.panels, [panelId]: { ...v2.panels[panelId], linkGroupId: 'nonexistent-group' } } };
    const parsed = parseSessionPayload(withDanglingGroup, 'EURUSD');
    expect(parsed.panels[panelId].linkGroupId).toBe('nonexistent-group'); // preserved: not layout's job to validate group refs
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm test -- --watch=false` fails: `./session-migration` module not found.

- [ ] **Step 3: Implement `session-migration.ts`.**

```ts
import type {
  SessionPayloadV1,
  SessionPayloadV2,
  StoredSessionPayload,
} from './session-sync.models';
import { SESSION_PAYLOAD_VERSION_2 } from './session-sync.models';
import type { WorkspaceLayout, PanelDescriptor, TabLayout, GridCell } from '../state/layout/layout.models';
import { assertLayoutConsistent } from '../state/layout/layout-invariants'; // renamed per Step 0, or '.spec-util' if unchanged
import type { Timeframe } from '../models';

/** Builds the vision-mandated migration default (single tab/cell/panel). Pure, deterministic id (no crypto.randomUUID — keeps round-trip tests reproducible; the id only needs to be internally unique within this one payload, which a fixed literal satisfies). */
export function singlePanelLayoutFor(
  symbol: string,
  timeframe: Timeframe,
): { layout: WorkspaceLayout; panels: Record<string, PanelDescriptor> } {
  const panelId = 'panel-migrated-1';
  const cell: GridCell = { panelIds: [panelId], activePanelId: panelId };
  const tab: TabLayout = { id: 'tab-migrated-1', name: 'Principal', template: '1', cells: [cell] };
  const layout: WorkspaceLayout = { tabs: [tab], activeTabId: tab.id };
  const panels: Record<string, PanelDescriptor> = {
    [panelId]: { id: panelId, symbol, timeframe, linkGroupId: null },
  };
  return { layout, panels };
}

export function migrateV1ToV2(v1: SessionPayloadV1, primarySymbol: string): SessionPayloadV2 {
  const { layout, panels } = singlePanelLayoutFor(primarySymbol, v1.activeTf ?? 'M1');
  return {
    schemaVersion: SESSION_PAYLOAD_VERSION_2,
    trading: v1.trading,
    currentTime: v1.currentTime,
    activeTf: v1.activeTf,
    customTfMinutes: v1.customTfMinutes,
    playbackSpeed: v1.playbackSpeed,
    replayResolution: v1.replayResolution ?? null,
    drawings: { [primarySymbol]: { version: 1, items: v1.drawings } },
    notes: v1.notes,
    selectedTfs: v1.selectedTfs,
    startRange: v1.startRange,
    endRange: v1.endRange,
    requiredDatasets: v1.requiredDatasets,
    layout,
    panels,
    linkGroups: [],
  };
}

/** Structural check only (schemaVersion + shape) — does NOT validate layout consistency; parseSessionPayload does that separately so a malformed-but-labeled-V2 payload still gets the defensive fallback rather than a thrown error. */
export function isSessionPayloadV2(p: StoredSessionPayload): p is SessionPayloadV2 {
  const rec = p as Record<string, unknown>;
  return (
    rec['schemaVersion'] === SESSION_PAYLOAD_VERSION_2 &&
    typeof rec['drawings'] === 'object' &&
    !Array.isArray(rec['drawings']) &&
    typeof rec['layout'] === 'object' &&
    typeof rec['panels'] === 'object'
  );
}

function isLayoutConsistent(layout: WorkspaceLayout, panels: Record<string, PanelDescriptor>): boolean {
  try {
    assertLayoutConsistent({ workspace: layout, panels });
    return true;
  } catch {
    return false;
  }
}

export function parseSessionPayload(raw: StoredSessionPayload, primarySymbol: string): SessionPayloadV2 {
  if (!isSessionPayloadV2(raw)) {
    return migrateV1ToV2(raw as SessionPayloadV1, primarySymbol);
  }
  const v2 = raw as SessionPayloadV2;
  if (isLayoutConsistent(v2.layout, v2.panels)) return v2;
  // Defensive parse: corrupt/foreign layout — never hydrate it as-is (Global Constraints).
  const { layout, panels } = singlePanelLayoutFor(primarySymbol, v2.activeTf ?? 'M1');
  return { ...v2, layout, panels };
}
```

Note: `assertLayoutConsistent` uses `expect(...)` (Vitest globals) internally, which throws a `vitest`-style assertion error on mismatch — this works identically whether called from a `.spec.ts` file or production code (Vitest's `expect` is available process-wide once imported; `session-migration.ts` gets it transitively via the same import), and `isLayoutConsistent`'s `try/catch` only cares that SOME error was thrown, not its shape. If `npx tsc -p tsconfig.app.json --noEmit` reports `vitest` as an unresolvable production dependency (i.e. `assertLayoutConsistent`'s own file imports `vitest`'s `expect`, and app-side `tsconfig.app.json` cannot resolve `vitest` as a type), extract a DI-free `isLayoutConsistentPure(layout, panels): boolean` (plain boolean checks, no `expect`) inside `layout-invariants.ts` itself, have `assertLayoutConsistent` call it and then `expect(...).toBe(true)`, and have `session-migration.ts` import ONLY `isLayoutConsistentPure` — verify which path is needed by running the app-tsc gate in Step 5 before committing either way.

- [ ] **Step 4: Add `SessionPayloadV2`/`DrawingCollection`/`StoredSessionPayload`/`SESSION_PAYLOAD_VERSION_2` to `session-sync.models.ts`** per the Interfaces block (import `WorkspaceLayout`/`PanelDescriptor` from `../state/layout/layout.models` and `LinkGroup` from `../state/link-groups/link-groups.models` at the top of the file, alongside the existing `Drawing`/`TradingData`/`Timeframe` imports).

- [ ] **Step 5: Verify** — `npx tsc -p tsconfig.app.json --noEmit`, `npx tsc -p tsconfig.spec.json --noEmit`, `npm test -- --watch=false`, `npm run lint` all clean. Resolve the `assertLayoutConsistent`/`vitest` import question from Step 3's note here if it surfaces.

- [ ] **Step 6: Commit** — `git add emulador/src/app/services/session-migration.ts emulador/src/app/services/session-migration.spec.ts emulador/src/app/services/session-sync.models.ts emulador/src/app/state/layout/layout-invariants.spec-util.ts` (add `layout-invariants.ts` and its updated spec importers instead, if Step 0 renamed it) ; `git commit -m "feat(services): add SessionPayloadV2 model and pure migrateV1ToV2/parseSessionPayload (RFC-011 Task 1)"`

---

### Task 2: Restore actions on `layout`, `linkGroups`, `drawings` features

**Files:**
- Modify: `emulador/src/app/state/layout/layout.actions.ts` (add `restoreLayout`)
- Modify: `emulador/src/app/state/layout/layout.reducer.ts` (add the handler)
- Test: append to `emulador/src/app/state/layout/layout.reducer.spec.ts`
- Modify: `emulador/src/app/state/link-groups/link-groups.actions.ts` (add `restoreGroups`)
- Modify: `emulador/src/app/state/link-groups/link-groups.reducer.ts` (add the handler)
- Test: append to `emulador/src/app/state/link-groups/link-groups.reducer.spec.ts`
- Modify: `emulador/src/app/state/drawings/drawings.actions.ts` (add `restoreDrawingsForSymbol`)
- Modify: `emulador/src/app/state/drawings/drawings.reducer.ts` (add the handler)
- Test: append to `emulador/src/app/state/drawings/drawings.reducer.spec.ts`

**Design decision — why `drawings` gets a SECOND restore action instead of changing `restoreDrawings`'s signature:** the existing `DrawingsActions.restoreDrawings({ drawings: Drawing[] })` is the `.session.json` import flow's contract (`workspaces.effects.ts`'s `thenRestore` branch, already shipped, already tested) and replaces the ENTIRE `items` array unconditionally — it has no notion of "for which symbol" because `DrawingsState` itself (`{ items, activeTool, selectedId }`) is single-symbol-at-a-time runtime state (drawings for whichever symbol is currently active), not a per-symbol record. RFC-011's persistence shape is per-symbol (`Record<string, DrawingCollection>`), but the RUNTIME `drawingsFeature` is NOT being restructured to a Record by this RFC (that would be a much larger, out-of-scope change to every drawing-tool component that reads `drawingsFeature.selectItems`) — instead, `restoreDrawingsForSymbol` accepts the FULL per-symbol record and the reducer keeps only the slice for whatever symbol is "current" at restore time, exactly mirroring how `WorkspacesActions.workspaceRestored` already narrows a whole-`Workspace` restore down to `workspace.drawings` (a single array) for the currently-becoming-active symbol. This keeps the runtime `DrawingsState` shape completely unchanged (no ripple into `drawing-toolbar.component.ts` or any consumer of `selectItems`) while still round-tripping the full per-symbol record through persistence, because Task 5's restore dispatch always has the `primarySymbol` in scope at the exact moment it dispatches.

**Interfaces:**
- Produces:

```ts
// layout.actions.ts — ADD
'Restore Layout': props<{ layout: WorkspaceLayout; panels: Record<string, PanelDescriptor> }>(),
```

```ts
// layout.reducer.ts — ADD (after setPanelLinkGroup's on())
on(LayoutActions.restoreLayout, (_state, { layout, panels }): LayoutState => ({
  workspace: layout,
  panels,
})),
```

```ts
// link-groups.actions.ts — ADD
'Restore Groups': props<{ groups: LinkGroup[] }>(),
```

```ts
// link-groups.reducer.ts — ADD
on(LinkGroupsActions.restoreGroups, (_state, { groups }): LinkGroupsState => ({
  groups: Object.fromEntries(groups.map((g) => [g.id, g])),
})),
```

```ts
// drawings.actions.ts — ADD (restoreDrawings is untouched)
'Restore Drawings For Symbol': props<{ drawings: Record<string, DrawingCollection>; symbol: string }>(),
```

```ts
// drawings.reducer.ts — ADD
on(DrawingsActions.restoreDrawingsForSymbol, (state, { drawings, symbol }): DrawingsState => ({
  ...state,
  items: drawings[symbol]?.items ?? [],
  selectedId: null,
  activeTool: 'none',
})),
```

- Consumes: `WorkspaceLayout`/`PanelDescriptor` (`layout.models.ts`), `LinkGroup` (`link-groups.models.ts`), `DrawingCollection` (`session-sync.models.ts`, Task 1).

- [ ] **Step 1: Failing spec for `restoreLayout`** (append to `layout.reducer.spec.ts`):

```ts
  describe('restoreLayout (RFC-011 Task 2)', () => {
    it('replaces both workspace and panels wholesale', () => {
      const layout: WorkspaceLayout = {
        tabs: [{ id: 't1', name: 'Restored', template: '1', cells: [{ panelIds: ['p9'], activePanelId: 'p9' }] }],
        activeTabId: 't1',
      };
      const panels = { p9: { id: 'p9', symbol: 'EURUSD', timeframe: 'H1' as const, linkGroupId: null } };
      const state = reducer(createInitialLayoutState(), LayoutActions.restoreLayout({ layout, panels }));
      expect(state.workspace).toEqual(layout);
      expect(state.panels).toEqual(panels);
    });

    it('a restored layout satisfies assertLayoutConsistent', () => {
      const layout: WorkspaceLayout = {
        tabs: [{ id: 't1', name: 'Restored', template: '2h', cells: [
          { panelIds: ['p1'], activePanelId: 'p1' },
          { panelIds: ['p2', 'p3'], activePanelId: 'p2' },
        ] }],
        activeTabId: 't1',
      };
      const panels = {
        p1: { id: 'p1', symbol: 'A', timeframe: 'M1' as const, linkGroupId: null },
        p2: { id: 'p2', symbol: 'B', timeframe: 'M1' as const, linkGroupId: null },
        p3: { id: 'p3', symbol: 'B', timeframe: 'M5' as const, linkGroupId: 'g1' },
      };
      const state = reducer(createInitialLayoutState(), LayoutActions.restoreLayout({ layout, panels }));
      expect(() => assertLayoutConsistent(state)).not.toThrow();
    });
  });
```

(Import `assertLayoutConsistent` from `./layout-invariants` (or `./layout-invariants.spec-util`, matching Task 1 Step 0's outcome) and `WorkspaceLayout` from `./layout.models` at the top of the spec file if not already imported.)

- [ ] **Step 2: Failing spec for `restoreGroups`** (append to `link-groups.reducer.spec.ts`):

```ts
  describe('restoreGroups (RFC-011 Task 2)', () => {
    it('replaces the entire groups map keyed by id', () => {
      const groups = [group('g1'), { ...group('g2'), syncCrosshair: false }];
      const state = reducer(createInitialLinkGroupsState(), LinkGroupsActions.restoreGroups({ groups }));
      expect(state.groups).toEqual({ g1: groups[0], g2: groups[1] });
    });

    it('an empty array (V1 migration default) clears any existing groups', () => {
      let state = reducer(createInitialLinkGroupsState(), LinkGroupsActions.createGroup({ group: group('g1') }));
      state = reducer(state, LinkGroupsActions.restoreGroups({ groups: [] }));
      expect(state.groups).toEqual({});
    });
  });
```

- [ ] **Step 3: Failing spec for `restoreDrawingsForSymbol`** (append to `drawings.reducer.spec.ts`):

```ts
  describe('restoreDrawingsForSymbol (RFC-011 Task 2)', () => {
    it('hydrates items from the record slice matching the given symbol', () => {
      const d = { id: 'd1', kind: 'line' as const, p1: { time: 1, price: 1 }, p2: { time: 2, price: 2 } };
      const drawings = { EURUSD: { version: 1, items: [d] }, GBPUSD: { version: 1, items: [] } };
      const state = reducer(initialState, DrawingsActions.restoreDrawingsForSymbol({ drawings, symbol: 'EURUSD' }));
      expect(state.items).toEqual([d]);
      expect(state.selectedId).toBeNull();
      expect(state.activeTool).toBe('none');
    });

    it('a symbol absent from the record restores an empty list (never throws)', () => {
      const state = reducer(initialState, DrawingsActions.restoreDrawingsForSymbol({ drawings: {}, symbol: 'EURUSD' }));
      expect(state.items).toEqual([]);
    });
  });
```

(`initialState` here refers to whatever fixture this spec file already uses for a blank `DrawingsState` — reuse it, do not redefine.)

- [ ] **Step 4: Run to verify failure** — all three fail: actions/handlers do not exist.

- [ ] **Step 5: Implement** the three action additions and three reducer handlers per the Interfaces block above.

- [ ] **Step 6: Verify** — `npx tsc -p tsconfig.app.json --noEmit`, `npx tsc -p tsconfig.spec.json --noEmit`, `npm test -- --watch=false`, `npm run lint` all clean.

- [ ] **Step 7: Commit** — `git add emulador/src/app/state/layout/layout.actions.ts emulador/src/app/state/layout/layout.reducer.ts emulador/src/app/state/layout/layout.reducer.spec.ts emulador/src/app/state/link-groups/link-groups.actions.ts emulador/src/app/state/link-groups/link-groups.reducer.ts emulador/src/app/state/link-groups/link-groups.reducer.spec.ts emulador/src/app/state/drawings/drawings.actions.ts emulador/src/app/state/drawings/drawings.reducer.ts emulador/src/app/state/drawings/drawings.reducer.spec.ts` ; `git commit -m "feat(state): add restoreLayout/restoreGroups/restoreDrawingsForSymbol hydration actions (RFC-011 Task 2)"`

---

### Task 3: Extend the persistence snapshot + Supabase mapping to V2

**Files:**
- Modify: `emulador/src/app/state/selectors.ts` (`selectWorkspaceMetaSnapshot` gains `layout`/`panels`/`linkGroups`)
- Modify: `emulador/src/app/services/session-sync.models.ts` (`PayloadInput`/`SessionView`/`RestoredView`/`FlattenSession` gain the three fields; `CloudSessionRow.payload` type becomes `SessionPayloadV1 | SessionPayloadV2` — see Step 3 note)
- Modify: `emulador/src/app/services/session-sync.mapping.ts` (`toPayload`/`fromPayload`/`buildRow`/`buildFlattenInput`-adjacent code extended; see Step 4)
- Test: append to `emulador/src/app/services/session-sync.mapping.spec.ts`

**Interfaces:**
- Consumes: `SessionPayloadV2`/`parseSessionPayload`/`migrateV1ToV2` (Task 1), `layoutFeature.selectWorkspace`/`.selectPanels` (existing `createFeature` auto-selectors), `linkGroupsFeature.selectGroups` (existing), `drawingsFeature.selectItems` (existing), `selectCurrentAsset` (existing).
- Produces:

```ts
// state/selectors.ts — selectWorkspaceMetaSnapshot's projection gains 3 fields (8 existing untouched)
export const selectWorkspaceMetaSnapshot = createSelector(
  marketFeature.selectFiles,
  marketFeature.selectActiveTf,
  marketFeature.selectSelectedTfs,
  replayFeature.selectCurrentTime,
  drawingsFeature.selectItems,
  selectTradingData,
  selectSavedSessions,
  tradingFeature.selectActiveSessionId,
  layoutFeature.selectWorkspace,   // NEW
  layoutFeature.selectPanels,      // NEW
  linkGroupsFeature.selectGroups,  // NEW
  (files, activeTf, selectedTfs, currentTime, drawings, trading, sessions, activeSessionId, layout, panels, linkGroups) => ({
    files, activeTf, selectedTfs: selectedTfs ?? undefined, currentTime, drawings, trading, sessions, activeSessionId,
    layout,     // NEW
    panels,     // NEW
    linkGroups, // NEW
  }),
);
```

```ts
// session-sync.models.ts — PayloadInput/SessionView/RestoredView/FlattenSession each gain:
  drawings: Record<string, DrawingCollection>; // was Drawing[] at this call site's V1-only usage; now the V2 shape flows through end-to-end (see Step 3 rationale — no separate V1 PayloadInput variant is kept)
  layout: WorkspaceLayout;
  panels: Record<string, PanelDescriptor>;
  linkGroups: LinkGroup[];
```

- [ ] **Step 1: Failing mapping spec — `toPayload`/`fromPayload` round-trip the new fields** (append to `session-sync.mapping.spec.ts`):

```ts
import { singlePanelLayoutFor } from './session-migration';
import type { LinkGroup } from '../state/link-groups/link-groups.models';

describe('toPayload / fromPayload — RFC-011 V2 fields', () => {
  function sampleV2Input(): PayloadInput {
    const { layout, panels } = singlePanelLayoutFor('EURUSD', 'H1');
    return {
      ...sampleInput(),
      drawings: { EURUSD: { version: 1, items: [] } },
      layout,
      panels,
      linkGroups: [{ id: 'g1', color: '#f00', syncCrosshair: true, syncTimeRange: false }] as LinkGroup[],
    };
  }

  it('toPayload stamps schemaVersion 2 and carries layout/panels/linkGroups verbatim', () => {
    const input = sampleV2Input();
    const payload = toPayload(input);
    expect(payload.schemaVersion).toBe(SESSION_PAYLOAD_VERSION_2);
    expect(payload.layout).toEqual(input.layout);
    expect(payload.panels).toEqual(input.panels);
    expect(payload.linkGroups).toEqual(input.linkGroups);
    expect(payload.drawings).toEqual(input.drawings);
  });

  it('fromPayload restores layout/panels/linkGroups/drawings unchanged', () => {
    const input = sampleV2Input();
    const payload = toPayload(input);
    const restored = fromPayload(payload);
    expect(restored.layout).toEqual(input.layout);
    expect(restored.panels).toEqual(input.panels);
    expect(restored.linkGroups).toEqual(input.linkGroups);
    expect(restored.drawings).toEqual(input.drawings);
  });

  it('a full round trip (toPayload -> JSON serialize -> parseSessionPayload -> fromPayload) is lossless', () => {
    const input = sampleV2Input();
    const payload = toPayload(input);
    const wireForm = JSON.parse(JSON.stringify(payload));
    const parsed = parseSessionPayload(wireForm, 'EURUSD');
    const restored = fromPayload(parsed);
    expect(restored.layout).toEqual(input.layout);
    expect(restored.panels).toEqual(input.panels);
    expect(restored.linkGroups).toEqual(input.linkGroups);
    expect(restored.drawings).toEqual(input.drawings);
    expect(restored.trading).toEqual(input.trading);
  });

  it('assertNoCandles still passes on a V2 payload (layout/panels/linkGroups contain no candle-shaped fields)', () => {
    expect(() => assertNoCandles(toPayload(sampleV2Input()))).not.toThrow();
  });
});
```

Add `import { parseSessionPayload } from './session-migration';` and `import { SESSION_PAYLOAD_VERSION_2 } from './session-sync.models';` to this spec file's existing import block.

- [ ] **Step 2: Run to verify failure** — `toPayload`'s existing implementation still stamps `SESSION_PAYLOAD_VERSION` (1) and drops `layout`/`panels`/`linkGroups`.

- [ ] **Step 3: Update `session-sync.models.ts`.** Add `drawings: Record<string, DrawingCollection>` (replacing `Drawing[]`), `layout: WorkspaceLayout`, `panels: Record<string, PanelDescriptor>`, `linkGroups: LinkGroup[]` to `PayloadInput`, `SessionView`, `RestoredView`, and `FlattenSession`'s nested `view?: SessionView`. **Rationale for changing these V1-era interfaces in place rather than introducing V2-only siblings:** `PayloadInput`/`SessionView`/`RestoredView` are internal plumbing types owned entirely by `session-sync.mapping.ts` and `session-sync.service.ts` (never part of the wire format itself — `SessionPayloadV1`/`V2` are the wire types, already separate and versioned) — every call site that builds one of these today (`buildRow`, `buildFlattenInput`, both modified in Step 4/Task 4) is updated in the same task, so there is no dangling V1-only caller left unconverted. `CloudSessionRow.payload`'s type becomes `SessionPayloadV1 | SessionPayloadV2` (a union, not a replacement) since existing cloud rows and `.emul`/`.session.json` exports on disk are genuinely still V1 until the next write.

- [ ] **Step 4: Update `toPayload`/`fromPayload` in `session-sync.mapping.ts`.**

```ts
export function toPayload(i: PayloadInput): SessionPayloadV2 {
  return {
    schemaVersion: SESSION_PAYLOAD_VERSION_2,
    trading: i.trading,
    currentTime: i.currentTime,
    activeTf: i.activeTf,
    customTfMinutes: i.customTfMinutes,
    playbackSpeed: i.playbackSpeed,
    replayResolution: i.replayResolution ?? null,
    drawings: i.drawings,
    notes: i.notes,
    selectedTfs: i.selectedTfs,
    startRange: i.startRange,
    endRange: i.endRange,
    requiredDatasets: i.requiredDatasets,
    layout: i.layout,
    panels: i.panels,
    linkGroups: i.linkGroups,
  };
}

/**
 * `primarySymbol` is required (no default) so every call site must supply the
 * symbol this row/session belongs to explicitly, rather than guessing it from
 * the payload itself (V1 payloads carry no symbol field of their own — see
 * session-migration.ts). Delegates to Task 1's `parseSessionPayload`, so a
 * V1 input is migrated AND a structurally corrupt V2 input gets the same
 * defensive single-panel fallback, in one call.
 */
export function fromPayload(p: SessionPayloadV1 | SessionPayloadV2, primarySymbol: string) {
  const v2 = parseSessionPayload(p, primarySymbol);
  return {
    trading: v2.trading,
    cursor: v2.currentTime,
    activeTf: v2.activeTf,
    customTfMinutes: v2.customTfMinutes,
    playbackSpeed: v2.playbackSpeed,
    replayResolution: v2.replayResolution ?? null,
    drawings: v2.drawings,
    notes: v2.notes,
    selectedTfs: v2.selectedTfs,
    startRange: v2.startRange,
    endRange: v2.endRange,
    requiredDatasets: v2.requiredDatasets,
    layout: v2.layout,
    panels: v2.panels,
    linkGroups: v2.linkGroups,
  };
}
```

Add `import { parseSessionPayload } from './session-migration';` to this file's existing import block (the `SESSION_PAYLOAD_VERSION`/`type SessionPayloadV1` import line stays; add `SESSION_PAYLOAD_VERSION_2`/`type SessionPayloadV2` to it).

- [ ] **Step 5: Update every existing call site of `fromPayload`** (`reconstructWorkspaces` in this same file — Task 4 handles its full signature change; for now, satisfy the compiler by passing `row.symbol` at both of this file's current call sites: `reconstructWorkspaces`'s `fromPayload(activeRow.payload)` → `fromPayload(activeRow.payload, activeRow.symbol)`, and its `.map((r) => ({ ... trading: fromPayload(r.payload).trading }))` → `fromPayload(r.payload, r.symbol).trading`).

- [ ] **Step 6: Update `state/selectors.ts`.** Add `layoutFeature`/`linkGroupsFeature` imports, extend `selectWorkspaceMetaSnapshot`'s `createSelector` call with the three new input selectors and three new output fields exactly per the Interfaces block. Add a companion spec assertion (append to `state/selectors.spec.ts` if one exists for this selector, else create the minimal check inline in this task):

```ts
  it('selectWorkspaceMetaSnapshot includes layout/panels/linkGroups (RFC-011 Task 3)', () => {
    const snapshot = selectWorkspaceMetaSnapshot.projector(
      {}, null, undefined, 0, [], defaultTradingData(), [], null,
      createInitialLayoutState().workspace,
      createInitialLayoutState().panels,
      {},
    );
    expect(snapshot.layout).toEqual(createInitialLayoutState().workspace);
    expect(snapshot.panels).toEqual(createInitialLayoutState().panels);
    expect(snapshot.linkGroups).toEqual({});
  });
```

(Adjust the projector's positional args to match this selector's ACTUAL final input-selector order once Step 6 is implemented — the snippet above assumes the 11-arg order listed in the Interfaces block; verify against the real file before relying on positional args, since `createSelector` projectors are positional by construction.)

- [ ] **Step 7: Verify** — `npx tsc -p tsconfig.app.json --noEmit`, `npx tsc -p tsconfig.spec.json --noEmit`, `npm test -- --watch=false`, `npm run lint` all clean. Expect and fix compile errors at every remaining `PayloadInput`/`SessionView`/`FlattenSession` literal construction site flagged by `tsc` (primarily `session-sync.service.ts`'s `buildFlattenInput` — deferred to Task 4 only if it also needs NgRx/IndexedDB wiring; if it's a pure type-completeness fix, do it here so Task 3 compiles standalone).

- [ ] **Step 8: Commit** — `git add emulador/src/app/state/selectors.ts emulador/src/app/services/session-sync.models.ts emulador/src/app/services/session-sync.mapping.ts emulador/src/app/services/session-sync.mapping.spec.ts` ; `git commit -m "feat(services,state): extend session-sync payload mapping and workspace snapshot to SessionPayloadV2 (RFC-011 Task 3)"`

---

### Task 4: Extend `workspace-db` (IndexedDB) meta + `SessionSyncService` orchestration for V2

**Files:**
- Modify: `emulador/src/app/state/workspaces/workspaces.models.ts` (`WorkspaceMeta`/`Workspace` gain `layout`/`panels`/`linkGroups`, `drawings` type changes call sites — see Step 1 note on what stays an array)
- Modify: `emulador/src/app/services/workspace-db.service.ts` (no IndexedDB store/version bump needed — `META_STORE` already stores whatever shape `WorkspaceMeta` is; see Step 2 rationale)
- Modify: `emulador/src/app/services/session-sync.service.ts` (`buildFlattenInput` supplies the new fields from the meta; `reconstructWorkspaces`'s `fromPayload` calls gain the `symbol` arg per Task 3 Step 5)
- Test: append to `emulador/src/app/services/workspace-db.service.spec.ts`
- Test: append to `emulador/src/app/services/session-sync.service.spec.ts`

**Design decision — no `DB_VERSION` bump, no new object store:** `WorkspaceDbService`'s `META_STORE` (`emulador/src/app/services/market-data-db.ts`, `DB_VERSION = 6`) stores whatever plain object shape `WorkspaceMeta` currently is — IndexedDB object stores are schemaless beyond their `keyPath`; adding new OPTIONAL fields to the `WorkspaceMeta` interface requires no `onupgradeneeded` migration, exactly as `activeSessionId`/`activeClientUpdatedAt`/`activeSyncedAt` were added in prior work without a version bump. RFC-011's spec point 5 ("El esquema de IndexedDB... extiende su store de Sesion para aceptar la forma V2 completa... via la migracion... aplicada en el momento de lectura (lazy migration), no mediante un script de migracion masiva") is satisfied because `getWorkspace`/`getMeta` (unchanged in this task) return whatever is stored, and it is the CALLER (Task 5's restore path) that runs it through `parseSessionPayload`-equivalent hydration — `WorkspaceMeta` itself is a local cache mirror of runtime state, not the LWW-versioned wire payload, so it does not need its own schemaVersion field; the wire payload's version lives in `SessionPayloadV2.schemaVersion` alone (D9: one payload, one version marker).

**Interfaces:**
- Produces:

```ts
// workspaces.models.ts — Workspace gains 3 new OPTIONAL fields; every existing
// field (symbol, series, files, activeTf, currentTime, drawings, selectedTfs,
// trading, sessions, lastModified, activeSessionId, activeClientUpdatedAt,
// activeSyncedAt) is untouched:
export interface Workspace {
  symbol: string;
  series: Partial<Record<Timeframe, Candle[]>>;
  files: Partial<Record<Timeframe, string>>;
  activeTf: Timeframe | null;
  currentTime: number;
  drawings: Drawing[];
  selectedTfs?: Timeframe[];
  trading?: TradingData;
  sessions?: SavedSession[];
  lastModified: number;
  activeSessionId?: string | null;
  activeClientUpdatedAt?: number;
  activeSyncedAt?: number;
  /** RFC-011: this asset's layout, mirrored from layoutFeature at persist time. Optional — absent = legacy pre-RFC-011 record, migration default applies on restore. */
  layout?: WorkspaceLayout;
  panels?: Record<string, PanelDescriptor>;
  /** RFC-011: mirrored from linkGroupsFeature (array form, matching SessionPayloadV2.linkGroups — NOT a Record here, since this is the local mirror of the wire shape, not runtime state). */
  linkGroups?: LinkGroup[];
}
```

(`Workspace.drawings: Drawing[]` is UNCHANGED — the IndexedDB `Workspace`/`WorkspaceMeta` local cache remains single-symbol per record (it is already keyed by `symbol`, one record per asset), so its `drawings` field stays the flat per-record array it always was; the `Record<string, DrawingCollection>` reshaping is a `SessionPayloadV2`-only (wire/Supabase) concern, reconciled at the Task 5 restore boundary, not inside `WorkspaceDbService`.)

- [ ] **Step 1: Failing spec — `WorkspaceDbService` round-trips the new optional fields** (append to `workspace-db.service.spec.ts`):

```ts
  it('putMeta/getMeta round-trip layout/panels/linkGroups when present (RFC-011 Task 4)', async () => {
    const { layout, panels } = singlePanelLayoutFor('EURUSD', 'H1');
    const linkGroups: LinkGroup[] = [{ id: 'g1', color: '#f00', syncCrosshair: true, syncTimeRange: true }];
    const meta: WorkspaceMeta = { ...emptyWorkspaceMeta('EURUSD'), layout, panels, linkGroups };
    await service.putMeta(meta);
    const read = await service.getMeta('EURUSD');
    expect(read?.layout).toEqual(layout);
    expect(read?.panels).toEqual(panels);
    expect(read?.linkGroups).toEqual(linkGroups);
  });

  it('getMeta on a legacy record (no layout/panels/linkGroups fields) returns them as undefined, not throwing (RFC-011 Task 4)', async () => {
    const legacy = emptyWorkspaceMeta('GBPUSD'); // no layout/panels/linkGroups keys at all
    await service.putMeta(legacy);
    const read = await service.getMeta('GBPUSD');
    expect(read?.layout).toBeUndefined();
    expect(read?.panels).toBeUndefined();
    expect(read?.linkGroups).toBeUndefined();
  });
```

(`emptyWorkspaceMeta` here is whatever this spec file's existing fixture helper for a bare `WorkspaceMeta` is called — reuse it; if the file constructs meta objects inline instead, follow that convention. This file (`workspace-db.service.spec.ts`) lives in `services/`, so import `singlePanelLayoutFor` from `./session-migration` and `LinkGroup` from `../state/link-groups/link-groups.models`.)

- [ ] **Step 2: Run to verify failure** — compiles today (fields are optional and absent), so this step's "failure" is the assertion `read?.layout` being compared against a value the CURRENT `WorkspaceMeta` type doesn't yet declare — confirm the spec fails to TYPE-CHECK (`npx tsc -p tsconfig.spec.json --noEmit` errors on `layout`/`panels`/`linkGroups` not existing on `WorkspaceMeta`) rather than fails at runtime, since IndexedDB itself is happy to store/return arbitrary extra properties.

- [ ] **Step 3: Add the three optional fields to `Workspace`** in `workspaces.models.ts` (import `WorkspaceLayout`/`PanelDescriptor` from `../layout/layout.models` and `LinkGroup` from `../link-groups/link-groups.models`). No changes needed to `workspace-db.service.ts` itself (per the Design decision above) — `putMeta`/`getMeta`/`getWorkspace` already pass the whole object through untyped IndexedDB puts/gets.

- [ ] **Step 4: Update `buildFlattenInput` in `session-sync.service.ts`** to read `layout`/`panels`/`linkGroups` off the `WorkspaceMeta` (defaulting via `singlePanelLayoutFor` + `[]` when absent — a legacy meta record predates this RFC) and thread them into `FlattenSession.view`:

```ts
// Add to this file's existing import block:
import { singlePanelLayoutFor } from './session-migration';

function buildFlattenInput(meta: WorkspaceMeta): FlattenInput {
  const trading = meta.trading ?? defaultTradingData();
  const [startRange, endRange] = inferRange(trading, meta.currentTime);
  const fallback = singlePanelLayoutFor(meta.symbol, meta.activeTf ?? 'M1');

  const active: FlattenSession | null = {
    id: meta.activeSessionId ?? null,
    name: trading.sessionName,
    createdAt: meta.activeClientUpdatedAt ?? Date.now(),
    cursor: meta.currentTime,
    trading,
    view: {
      cursor: meta.currentTime,
      activeTf: meta.activeTf,
      customTfMinutes: null,
      playbackSpeed: 1,
      drawings: { [meta.symbol]: { version: 1, items: meta.drawings ?? [] } },
      notes: [],
      selectedTfs: meta.selectedTfs ?? [],
      startRange,
      endRange,
      layout: meta.layout ?? fallback.layout,
      panels: meta.panels ?? fallback.panels,
      linkGroups: meta.linkGroups ?? [],
    },
    clientUpdatedAt: meta.activeClientUpdatedAt ?? Date.now(),
    lastOpenedAt: null,
  };

  // Archived sessions are UNCHANGED by this task: SavedSession has no
  // layout/linkGroups concept (archived = a snapshot of TRADING history only,
  // per its existing narrower shape) — do NOT add layout/panels/linkGroups
  // to this mapping. The vision's persistence model scopes layout to the
  // LIVE session, not to each archived trade-history snapshot.
  const archived: FlattenSession[] = (meta.sessions ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    createdAt: s.createdAt,
    cursor: s.currentTime,
    trading: s.trading,
    clientUpdatedAt: s.clientUpdatedAt ?? s.createdAt,
    lastOpenedAt: null,
  }));

  return { symbol: meta.symbol, active, archived };
}
```

- [ ] **Step 5: Update `reconstructWorkspaces`'s two `fromPayload` call sites** in `session-sync.mapping.ts` per Task 3 Step 5 (if not already done there — confirm, don't duplicate).

- [ ] **Step 6: Failing/passing spec — `SessionSyncService` orchestration carries V2 fields through a push+reconstruct cycle** (append to `session-sync.service.spec.ts`, following that file's existing fake-Supabase-client/fake-IndexedDB test doubles convention):

```ts
  it('flushDirtySessions pushes a row whose payload includes layout/panels/linkGroups sourced from the meta (RFC-011 Task 4)', async () => {
    const { layout, panels } = singlePanelLayoutFor('EURUSD', 'M1');
    const linkGroups: LinkGroup[] = [{ id: 'g1', color: '#0f0', syncCrosshair: true, syncTimeRange: false }];
    // ...seed the fake WorkspaceDbService's meta store with a dirty active session whose
    // WorkspaceMeta carries { layout, panels, linkGroups }, matching this spec's existing
    // seeding convention for `flushDirtySessions` tests...
    await service.flushDirty();
    const pushed = fakeSupabase.upsertedSessionRows.at(-1)!;
    expect(pushed.payload.layout).toEqual(layout);
    expect(pushed.payload.panels).toEqual(panels);
    expect(pushed.payload.linkGroups).toEqual(linkGroups);
    expect(pushed.payload.schemaVersion).toBe(2);
  });

  it('reconstructWorkspaces on a V1-only cloud row (no layout field at all) migrates it to a single-panel default (RFC-011 Task 4)', async () => {
    // ...seed a CloudSessionRow whose `payload` is a bare SessionPayloadV1 (schemaVersion 1,
    // no layout/panels/linkGroups keys) via this spec's existing pullAndMerge/reconstruct fixture...
    // assert the reconstructed active view's layout/panels resolve via migrateV1ToV2's default
    // (one tab, one panel of that row's own symbol) rather than throwing or leaving them undefined.
  });
```

Follow this spec file's own existing conventions for seeding the fake Supabase/IndexedDB doubles exactly (reuse its existing helper functions rather than inventing new fixture shapes) — the two tests above are behavioral contracts to satisfy, not literal drop-in code, since this file's test-double wiring is more elaborate than a plain `vi.fn()` stub and must be matched to what already exists.

- [ ] **Step 7: Implement** whatever `session-sync.service.ts` changes Step 6's spec requires (expected to be none beyond Step 4/5 — `flushDirtySessions`/`pullAndMerge` already call `flattenWorkspace`/`reconstructWorkspaces`, which now carry the new fields transitively once Task 3 + Steps 4-5 land; this step exists to catch any remaining compile/behavior gap Step 6 surfaces).

- [ ] **Step 8: Verify** — `npx tsc -p tsconfig.app.json --noEmit`, `npx tsc -p tsconfig.spec.json --noEmit`, `npm test -- --watch=false`, `npm run lint` all clean.

- [ ] **Step 9: Commit** — `git add emulador/src/app/state/workspaces/workspaces.models.ts emulador/src/app/services/session-sync.service.ts emulador/src/app/services/session-sync.service.spec.ts emulador/src/app/services/workspace-db.service.spec.ts` ; `git commit -m "feat(services): thread layout/panels/linkGroups through WorkspaceMeta and session-sync orchestration (RFC-011 Task 4)"`

---

### Task 5: Wire the restore dispatch path (`WorkspacesEffects`) + persist-on-edit

**Files:**
- Modify: `emulador/src/app/state/workspaces/workspaces.actions.ts` (`PendingSessionRestore` gains `layout`/`panels`/`linkGroups`; `Workspace Restored` payload already carries the whole `Workspace`, which now optionally has them per Task 4)
- Modify: `emulador/src/app/state/workspaces/workspaces.effects.ts` (`doSwitch`'s `thenRestore` branch dispatches the 3 new restore actions; `loadInitial`'s plain `workspaceRestored` path also needs coverage — see Step 3)
- Test: append to `emulador/src/app/state/workspaces/workspaces.effects.spec.ts`
- Modify: `emulador/src/app/state/layout/layout.reducer.ts` or a NEW small reactive glue point for hydrating on `workspaceRestored` (see Step 4 — mirrors how `drawings.reducer.ts` already listens to `WorkspacesActions.workspaceRestored` directly)

**Design decision — two restore entry points, not one:** this codebase already has TWO distinct places a workspace's state is hydrated into the store: (1) `WorkspacesActions.workspaceRestored` (asset switch / app-start load, dispatched by BOTH `loadInitial` and `doSwitch`'s step 2, unconditionally, for every asset switch — `drawings.reducer.ts` already listens to this directly, at the reducer level, NOT via an effect) and (2) `thenRestore`'s explicit action list (the `.session.json` IMPORT flow only, a rarer path). RFC-011's layout/panels/linkGroups must hydrate on path (1) — every ordinary asset switch, not just an explicit `.session.json` import — because layout is per-asset persisted state like `activeTf`/`drawings` already are, not an import-only feature. Therefore: **`layoutFeature` and `linkGroupsFeature` reducers gain their OWN `on(WorkspacesActions.workspaceRestored, ...)` handlers**, exactly mirroring `drawings.reducer.ts`'s existing precedent (Step 4), rather than routing through `thenRestore` (which stays reserved for the `.session.json` full-live-state-import case and is extended in Step 2 only for completeness/symmetry with `trading`/`drawings`, matching what that flow already does for those two).

**Interfaces:**
- Produces:

```ts
// workspaces.models.ts — Workspace already extended in Task 4 Step 3 with optional layout/panels/linkGroups; nothing new here.

// workspaces.actions.ts — PendingSessionRestore gains:
export interface PendingSessionRestore {
  trading: TradingData;
  drawings: Drawing[];
  intervalMinutes: number;
  playbackSpeed: number;
  replayResolution: number | null;
  /** RFC-011: optional — absent for a pre-RFC-011 `.session.json` export; the dispatch step defaults via singlePanelLayoutFor when absent. */
  layout?: WorkspaceLayout;
  panels?: Record<string, PanelDescriptor>;
  linkGroups?: LinkGroup[];
}
```

- Consumes: `LayoutActions.restoreLayout`, `LinkGroupsActions.restoreGroups`, `DrawingsActions.restoreDrawingsForSymbol` (Task 2), `singlePanelLayoutFor` (Task 1).

- [ ] **Step 1: Failing spec — `workspaceRestored` hydrates `layoutFeature`/`linkGroupsFeature` when the restored `Workspace` carries them** (append to `layout.reducer.spec.ts` and `link-groups.reducer.spec.ts` respectively, mirroring `drawings.reducer.spec.ts`'s existing `workspaceRestored` test if one exists — grep it first and match its exact fixture style):

```ts
  // layout.reducer.spec.ts
  describe('workspaceRestored (RFC-011 Task 5)', () => {
    it('hydrates workspace/panels from the restored Workspace when present', () => {
      const { layout, panels } = singlePanelLayoutFor('EURUSD', 'H1');
      const state = reducer(
        createInitialLayoutState(),
        WorkspacesActions.workspaceRestored({ workspace: { ...emptyWorkspace('EURUSD'), layout, panels } }),
      );
      expect(state.workspace).toEqual(layout);
      expect(state.panels).toEqual(panels);
    });

    it('falls back to a single-panel default of the restored symbol+activeTf when the workspace predates RFC-011 (no layout field)', () => {
      const state = reducer(
        createInitialLayoutState(),
        WorkspacesActions.workspaceRestored({ workspace: { ...emptyWorkspace('GBPUSD'), activeTf: 'M5' } }),
      );
      const panelId = state.workspace.tabs[0].cells[0].panelIds[0];
      expect(state.panels[panelId]).toEqual({ id: panelId, symbol: 'GBPUSD', timeframe: 'M5', linkGroupId: null });
    });
  });
```

```ts
  // link-groups.reducer.spec.ts
  describe('workspaceRestored (RFC-011 Task 5)', () => {
    it('hydrates groups from the restored Workspace.linkGroups when present', () => {
      const groups = [{ id: 'g1', color: '#f00', syncCrosshair: true, syncTimeRange: true }];
      const state = reducer(
        createInitialLinkGroupsState(),
        WorkspacesActions.workspaceRestored({ workspace: { ...emptyWorkspace('EURUSD'), linkGroups: groups } }),
      );
      expect(state.groups).toEqual({ g1: groups[0] });
    });

    it('defaults to empty groups when the workspace predates RFC-011', () => {
      const state = reducer(
        createInitialLinkGroupsState(),
        WorkspacesActions.workspaceRestored({ workspace: emptyWorkspace('GBPUSD') }),
      );
      expect(state.groups).toEqual({});
    });
  });
```

- [ ] **Step 2: Run to verify failure** — neither reducer currently imports/handles `WorkspacesActions.workspaceRestored`.

- [ ] **Step 3: Implement the two new reducer handlers.** In `layout.reducer.ts`, add `import { WorkspacesActions } from '../workspaces/workspaces.actions'; import { singlePanelLayoutFor } from '../../services/session-migration';` and:

```ts
    on(WorkspacesActions.workspaceRestored, (state, { workspace }): LayoutState => {
      if (workspace.layout && workspace.panels) {
        return { workspace: workspace.layout, panels: workspace.panels };
      }
      const fallback = singlePanelLayoutFor(workspace.symbol, workspace.activeTf ?? 'M1');
      return fallback;
    }),
```

In `link-groups.reducer.ts`, add the same `WorkspacesActions` import and:

```ts
    on(WorkspacesActions.workspaceRestored, (state, { workspace }): LinkGroupsState => ({
      groups: Object.fromEntries((workspace.linkGroups ?? []).map((g) => [g.id, g])),
    })),
```

Note the direction of the dependency: `state/layout/` and `state/link-groups/` importing FROM `state/workspaces/` (actions only, not the reducer/feature) mirrors `state/drawings/drawings.reducer.ts`'s existing precedent EXACTLY (it already imports `WorkspacesActions` from `../workspaces/workspaces.actions`) — this is not a new dependency direction, just the same one applied to two more features.

- [ ] **Step 4: Extend `PendingSessionRestore` and `doSwitch`'s `thenRestore` branch** in `workspaces.actions.ts`/`workspaces.effects.ts` for symmetry with the `.session.json` import flow (this is the RARER path — most restores go through Step 3's `workspaceRestored` handlers above, which fire unconditionally on every switch; `thenRestore` additionally carries an EXPLICIT layout/panels/linkGroups only when importing a full `.session.json` that predates the target workspace's own stored `Workspace` record, so the two do not conflict — `thenRestore`'s dispatches, per the existing code, run AFTER `workspaceRestored` in the action sequence, so they take precedence for the imported values specifically):

```ts
// workspaces.actions.ts — PendingSessionRestore, extend per the Interfaces block above.
```

```ts
// workspaces.effects.ts — doSwitch's thenRestore branch, extend the existing block:
    if (thenRestore) {
      actions.push(TradingActions.restoreSession({ trading: thenRestore.trading }));
      actions.push(DrawingsActions.restoreDrawings({ drawings: thenRestore.drawings }));
      if (thenRestore.layout && thenRestore.panels) {
        actions.push(LayoutActions.restoreLayout({ layout: thenRestore.layout, panels: thenRestore.panels }));
      }
      if (thenRestore.linkGroups) {
        actions.push(LinkGroupsActions.restoreGroups({ groups: thenRestore.linkGroups }));
      }
      const matchTf = loadedTfForMinutes(/* unchanged */ thenRestore.intervalMinutes, thenLoad.map((c) => c.tf));
      actions.push(matchTf ? MarketActions.changeTimeframe({ tf: matchTf }) : MarketActions.changeCustomTimeframe({ minutes: thenRestore.intervalMinutes }));
      actions.push(ReplayActions.changeSpeed({ msPerCandle: thenRestore.playbackSpeed }));
      actions.push(ReplayActions.setReplayResolution({ minutes: thenRestore.replayResolution }));
    }
```

Add `import { LayoutActions } from '../layout/layout.actions'; import { LinkGroupsActions } from '../link-groups/link-groups.actions';` to `workspaces.effects.ts`'s existing import block. Every existing dispatch in this branch (`restoreSession`, `restoreDrawings`, the TF branch, `changeSpeed`, `setReplayResolution`) keeps its exact original position relative to itself — the two new pushes are inserted between `restoreDrawings` and the TF branch, matching the plan's stated ordering rationale (trading → drawings → layout/linkGroups → interval → speed).

- [ ] **Step 5: Failing spec for `doSwitch`'s extended `thenRestore`** (append to `workspaces.effects.spec.ts`, following its existing `thenRestore` test's fixture style — grep for `thenRestore` in that file first to match conventions exactly):

```ts
  it('doSwitch dispatches restoreLayout/restoreGroups when thenRestore carries layout/panels/linkGroups (RFC-011 Task 5)', async () => {
    const { layout, panels } = singlePanelLayoutFor('EURUSD', 'M1');
    const linkGroups = [{ id: 'g1', color: '#f00', syncCrosshair: true, syncTimeRange: true }];
    // ...invoke doSwitch (or dispatch switchAsset through the effect, matching this spec's
    // existing thenRestore test's exact invocation style) with:
    // thenRestore: { trading: defaultTradingData(), drawings: [], intervalMinutes: 1,
    //   playbackSpeed: 1, replayResolution: null, layout, panels, linkGroups }
    // then assert the resulting actions array contains LayoutActions.restoreLayout({ layout, panels })
    // and LinkGroupsActions.restoreGroups({ groups: linkGroups }) in that relative order, AFTER
    // DrawingsActions.restoreDrawings and BEFORE the TF-branch action.
  });

  it('doSwitch omits restoreLayout/restoreGroups when thenRestore lacks layout/panels (legacy .session.json export) (RFC-011 Task 5)', async () => {
    // same invocation with layout/panels/linkGroups omitted from thenRestore — assert neither
    // LayoutActions.restoreLayout nor LinkGroupsActions.restoreGroups appears in the result.
  });
```

- [ ] **Step 6: Verify** — `npx tsc -p tsconfig.app.json --noEmit`, `npx tsc -p tsconfig.spec.json --noEmit`, `npm test -- --watch=false`, `npm run lint` all clean.

- [ ] **Step 7: Full-cycle integration check (no new production code — proof only).** Append one test to `workspaces.effects.spec.ts` (or a new small focused spec `session-persistence.e2e.spec.ts` under `emulador/src/app/state/workspaces/` if that reads more clearly) exercising: `singlePanelLayoutFor` → `toPayload` → JSON round-trip → `parseSessionPayload` → `fromPayload` → assert the RESULT, when fed through `LayoutActions.restoreLayout`/`LinkGroupsActions.restoreGroups`/`DrawingsActions.restoreDrawingsForSymbol` against fresh `layoutFeature`/`linkGroupsFeature`/`drawingsFeature` reducers, satisfies `assertLayoutConsistent` and preserves the original `LinkGroup[]`/drawing items — proving the full persist → wire → restore cycle end-to-end, matching this RFC's "Estado Esperado" requirement ("guardar y releer una Sesion... producira un SessionPayloadV2 estructuralmente identico").

- [ ] **Step 8: Commit** — `git add emulador/src/app/state/workspaces/workspaces.actions.ts emulador/src/app/state/workspaces/workspaces.effects.ts emulador/src/app/state/workspaces/workspaces.effects.spec.ts emulador/src/app/state/layout/layout.reducer.ts emulador/src/app/state/layout/layout.reducer.spec.ts emulador/src/app/state/link-groups/link-groups.reducer.ts emulador/src/app/state/link-groups/link-groups.reducer.spec.ts` ; `git commit -m "feat(state): hydrate layout/linkGroups on workspaceRestored and extend .session.json thenRestore (RFC-011 Task 5)"`

---

## Final verification (RFC-011 Estado Esperado)

- `npx tsc -p tsconfig.app.json --noEmit` → zero errors.
- `migrateV1ToV2` round-trip tests (Task 1) are green: every V1 field preserved field-for-field; drawings correctly reassigned under `primarySymbol`; layout synthesized as a single tab/cell/panel of the migrated session's own active symbol+timeframe; a migrated-then-JSON-round-tripped payload is byte-identical; migrating an already-V2 payload is a no-op.
- Saving and re-reading a Session with multiple tabs/panels/link groups (Task 3's `toPayload`/`fromPayload` round-trip spec, Task 5's end-to-end integration spec) produces a `SessionPayloadV2` structurally identical before and after the full IndexedDB + Supabase persistence cycle.
- A code inspection of `session-sync.mapping.ts`/`session-sync.service.ts` confirms ONE resolution point for LWW (`mergeByLww`, unchanged since V1, keyed by the single `clientUpdatedAt`) for the complete payload — no second timestamp field, no second sync effect, introduced anywhere for `layout`/`linkGroups`/`drawings`.
- A payload with a corrupt/inconsistent `layout`/`panels` (Task 1's defensive-parse tests) never reaches the store as-is — `parseSessionPayload` re-synthesizes the migration default, and the resulting state satisfies `assertLayoutConsistent` (reused, not reimplemented).
- Restoring an old V1 Supabase row or a pre-RFC-011 `.session.json` export (Tasks 4-5's legacy-fallback tests) still works indefinitely via lazy migration — no batch migration script exists or is required.
- Invariant greps: zero occurrences of `chart-engine.ts`/`chart.component.ts`/`chart-panel.component.ts`/`chart-registry.service.ts`/`chart-sync-router.ts`/`chart-model-mapper.service.ts` in any modified-files list across all 5 tasks; zero new `createSelector` factories parametrized by `panelId`/`symbol` in `state/layout/`, `state/link-groups/`, `state/drawings/`, or `services/session-*`; `package.json` has zero new dependencies added by this RFC.
