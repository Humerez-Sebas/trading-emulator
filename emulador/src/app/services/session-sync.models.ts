import type { RequiredDataset } from './session.service';
import type { SavedSession, TradingData } from '../state/trading/trading.models';
import type { Drawing } from '../state/drawings/drawings.models';
import type { Timeframe } from '../models';
import type { WorkspaceLayout, PanelDescriptor } from '../state/layout/layout.models';
import type { LinkGroup } from '../state/link-groups/link-groups.models';

export type DatasetRef = RequiredDataset; // { symbol, timeframe: 'M1'|'H1'|'D1', year? }

/** Lightweight projection for the Sessions list — never carries the payload (spec §5). */
export interface SessionSummary {
  id: string;
  name: string;
  symbol: string;
  folderId: string | null;
  schemaVersion: number;
  updatedAt: string; // client_updated_at (ISO) — LWW + display "last edited"
  lastOpenedAt: string | null;
  requiredDatasets: DatasetRef[];
  tradeCount: number; // sessions.trades_count
  initialBalance: number;
  balance: number;
  cursor: number; // replay cursor, unix seconds
  winRate?: number; // 0..1, in summary jsonb
  sparkline?: number[]; // ≤32 downsampled equity points, in summary jsonb
}

export const SESSION_PAYLOAD_VERSION = 1;

/** The lossless, candle-free session payload stored in sessions.payload (and .emul). */
export interface SessionPayloadV1 {
  schemaVersion: number; // = SESSION_PAYLOAD_VERSION
  trading: TradingData; // full state incl. open positions, riskPct, sessionEnd, balance
  currentTime: number; // replay cursor, unix seconds
  activeTf: Timeframe | null;
  customTfMinutes: number | null;
  playbackSpeed: number;
  /** Replay resolution in MINUTES; null/absent = full candle. */
  replayResolution?: number | null;
  drawings: Drawing[];
  notes: unknown[];
  selectedTfs: Timeframe[];
  startRange: number; // unix seconds
  endRange: number; // unix seconds
  requiredDatasets: DatasetRef[]; // self-contained copy; summary column is source of truth
}

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

export const SESSION_PAYLOAD_VERSION_3 = 3;

/**
 * V3's flat, owner-tagged drawing set on the wire — the per-symbol record
 * dissolves into `Drawing.symbol`. `version` scopes the `Drawing[]` item
 * format (independent of `schemaVersion`), same convention as
 * `DrawingCollection`; shared by `SessionPayloadV3` and every other view that
 * carries the same shape so it can't drift between them.
 */
export interface DrawingsV3 {
  version: 2;
  items: Drawing[];
}

/**
 * V3 extends V2 in place (D9), same as V2 extended V1: every V2 field except
 * `drawings` is preserved verbatim; `drawings` sheds the per-symbol record
 * for a flat, owner-tagged set (owner now lives on `Drawing` itself).
 */
export interface SessionPayloadV3 extends Omit<SessionPayloadV2, 'schemaVersion' | 'drawings'> {
  schemaVersion: 3;
  drawings: DrawingsV3;
}

/** Anything read from storage/Supabase that might be V1, V2, V3, or malformed. */
export type StoredSessionPayload =
  | SessionPayloadV1
  | SessionPayloadV2
  | SessionPayloadV3
  | Record<string, unknown>;

/** What `toPayload` reads from a workspace/session (unix seconds throughout). */
export interface PayloadInput {
  trading: TradingData;
  currentTime: number;
  activeTf: Timeframe | null;
  customTfMinutes: number | null;
  playbackSpeed: number;
  replayResolution?: number | null;
  drawings: DrawingsV3;
  notes: unknown[];
  selectedTfs: Timeframe[];
  startRange: number;
  endRange: number;
  requiredDatasets: DatasetRef[];
  layout: WorkspaceLayout;
  panels: Record<string, PanelDescriptor>;
  linkGroups: LinkGroup[];
}

/** The live view state of the active session (the parts not inside TradingData). Unix seconds for times. */
export interface SessionView {
  cursor: number;
  activeTf: Timeframe | null;
  customTfMinutes: number | null;
  playbackSpeed: number;
  replayResolution?: number | null;
  drawings: DrawingsV3;
  notes: unknown[];
  selectedTfs: Timeframe[];
  startRange: number;
  endRange: number;
  layout: WorkspaceLayout;
  panels: Record<string, PanelDescriptor>;
  linkGroups: LinkGroup[];
}

/** One session handed to flatten. `view` is present for the active/live session; archived sessions omit it. */
export interface FlattenSession {
  id: string | null; // null => mint a uuid (active session on first sync)
  name: string | null; // sessionName; null => auto-named
  createdAt: number; // epoch ms
  cursor: number; // unix seconds
  trading: TradingData;
  view?: SessionView; // active only
  clientUpdatedAt: number; // epoch ms (LWW key)
  lastOpenedAt?: number | null; // epoch ms
}

export interface FlattenInput {
  symbol: string;
  active: FlattenSession | null; // the live session for this symbol (may be null)
  archived: FlattenSession[]; // SavedSessions of this symbol
}

/** One session as it lives in the cloud (camelCase domain view; no is_active column — active is derived). */
export interface CloudSessionRow {
  id: string;
  symbol: string;
  name: string;
  folderId: string | null;
  schemaVersion: number;
  createdAt: number; // epoch ms
  clientUpdatedAt: number; // epoch ms (LWW key)
  lastOpenedAt: number | null; // epoch ms
  tradeCount: number; // = trading.history.length
  initialBalance: number;
  balance: number;
  cursor: number; // unix seconds
  requiredDatasets: DatasetRef[];
  winRate?: number;
  sparkline?: number[];
  payload: SessionPayloadV1 | SessionPayloadV2 | SessionPayloadV3;
}

export interface FlattenResult {
  rows: CloudSessionRow[];
  activeSessionId: string | null; // active row id (minted if input id was null) for the caller to persist
}

/** Restored shape of `fromPayload`'s return (kept in sync manually to avoid a models -> mapping import cycle). */
export interface RestoredView {
  trading: TradingData;
  cursor: number;
  activeTf: Timeframe | null;
  customTfMinutes: number | null;
  playbackSpeed: number;
  drawings: DrawingsV3;
  notes: unknown[];
  selectedTfs: Timeframe[];
  startRange: number;
  endRange: number;
  requiredDatasets: DatasetRef[];
  layout: WorkspaceLayout;
  panels: Record<string, PanelDescriptor>;
  linkGroups: LinkGroup[];
}

export interface ReconstructedWorkspace {
  symbol: string;
  activeSessionId: string;
  active: RestoredView; // full restored active view (trading, cursor, drawings, ranges, ...)
  sessions: SavedSession[]; // archived: { id, name, createdAt, currentTime, trading }
}

/** One folder as it lives in the cloud (camelCase domain view). owner_id is set at the Supabase boundary, not here. */
export interface CloudFolderRow {
  id: string;
  name: string;
  sort: number; // folders.sort — drag-drop order
  clientUpdatedAt: number; // epoch ms (LWW key)
}

/** Result of an LWW merge of a local set against a cloud set. */
export interface LwwMergeResult<T> {
  merged: T[]; // the reconciled set to store locally
  toPushIds: string[]; // local entities to upload (never-synced local-only + local-strictly-newer)
  toDeleteLocalIds: string[]; // previously-synced locals now absent from cloud (D1)
}
