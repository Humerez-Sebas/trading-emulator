import type { RequiredDataset } from './session.service';
import type { SavedSession, TradingData } from '../state/trading/trading.models';
import type { Drawing } from '../state/drawings/drawings.models';
import type { Timeframe } from '../models';

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
  drawings: Drawing[];
  notes: unknown[];
  selectedTfs: Timeframe[];
  startRange: number; // unix seconds
  endRange: number; // unix seconds
  requiredDatasets: DatasetRef[]; // self-contained copy; summary column is source of truth
}

/** What `toPayload` reads from a workspace/session (unix seconds throughout). */
export interface PayloadInput {
  trading: TradingData;
  currentTime: number;
  activeTf: Timeframe | null;
  customTfMinutes: number | null;
  playbackSpeed: number;
  drawings: Drawing[];
  notes: unknown[];
  selectedTfs: Timeframe[];
  startRange: number;
  endRange: number;
  requiredDatasets: DatasetRef[];
}

/** The live view state of the active session (the parts not inside TradingData). Unix seconds for times. */
export interface SessionView {
  cursor: number;
  activeTf: Timeframe | null;
  customTfMinutes: number | null;
  playbackSpeed: number;
  drawings: Drawing[];
  notes: unknown[];
  selectedTfs: Timeframe[];
  startRange: number;
  endRange: number;
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
  payload: SessionPayloadV1;
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
  drawings: Drawing[];
  notes: unknown[];
  selectedTfs: Timeframe[];
  startRange: number;
  endRange: number;
  requiredDatasets: DatasetRef[];
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
