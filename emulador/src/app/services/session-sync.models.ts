import type { RequiredDataset } from './session.service';
import type { TradingData } from '../state/trading/trading.models';
import type { Drawing } from '../state/drawings/drawings.models';
import type { Timeframe } from '../models';

export type DatasetRef = RequiredDataset; // { symbol, timeframe: 'M1'|'H1'|'D1', year? }

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
