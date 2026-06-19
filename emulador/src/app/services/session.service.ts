import { inject, Injectable } from '@angular/core';
import { TIMEFRAME_SECONDS, type Timeframe } from '../models';
import type { DatasetRecord } from './market-data-db';
import { WorkspaceDbService } from './workspace-db.service';

/**
 * Session import/export for the v2 architecture (Tasks 8 & 9).
 *
 * A session is a MUTABLE, user-generated `.session.json` that NEVER embeds
 * candle history — it only REFERENCES the immutable market datasets it needs
 * (`requiredDatasets`). On import the app checks those references against the
 * local `datasets` cache and, if any are missing, prompts to download them
 * before restoring (the "Missing Dataset" flow). Market data and session data
 * are separate bounded contexts.
 *
 * The pure builders/validators below carry the spec contract and are unit
 * tested; the live NgRx snapshot assembly, state restore, and the missing-
 * dataset modal are the thin UI wiring on top (browser-validated).
 */

export const SESSION_VERSION = 1;
export const EXPORTED_WITH = 'Trading Emulator v2.0.0';

/** The only timeframes a session may reference (anchors). */
export type AnchorTf = 'M1' | 'H1' | 'D1';

/** One market-data dependency. `year` is present only for M1 partitions. */
export interface RequiredDataset {
  symbol: string;
  timeframe: AnchorTf;
  year?: number;
}

/** The on-disk `.session.json` shape (v1). No candle data, ever. */
export interface SessionFileV1 {
  version: number;
  exportedWith: string;
  id: string;
  requiredDatasets: RequiredDataset[];
  context: {
    symbol: string;
    initialBalance: number;
    /** Data range start, epoch MILLISECONDS (UTC). */
    startRange: number;
    /** Data range end, epoch MILLISECONDS (UTC). */
    endRange: number;
  };
  state: {
    /** Replay cursor, epoch MILLISECONDS (UTC). */
    replayTime: number;
    /** Active timeframe in MINUTES (e.g. 60 = H1, 45 = custom M45). */
    currentTimeframe: number;
    playbackSpeed: number;
  };
  trading: {
    trades: unknown[];
    pendingOrders: unknown[];
  };
  annotations: {
    drawings: unknown[];
    notes: unknown[];
  };
}

/**
 * Everything the caller reads from live state to export a session. Times are
 * epoch MILLISECONDS; `currentTimeframe` is in minutes. The service turns this
 * into a {@link SessionFileV1} with no candle data.
 */
export interface SessionSnapshot {
  symbol: string;
  initialBalance: number;
  startRange: number;
  endRange: number;
  replayTime: number;
  currentTimeframe: number;
  playbackSpeed: number;
  trades: unknown[];
  pendingOrders: unknown[];
  drawings: unknown[];
  notes: unknown[];
  /** Which anchors the session needs (M1 expands to one ref per year). */
  anchorTimeframes: AnchorTf[];
  /** Calendar years the data range spans (used for M1 partition refs). */
  years: number[];
  /** Optional fixed id (tests); a uuid is generated otherwise. */
  id?: string;
}

/** Outcome of validating an imported session's version. */
export type ParseResult =
  | { status: 'ok'; session: SessionFileV1 }
  | { status: 'future'; version: number }
  | { status: 'invalid'; reason: string };

/**
 * UTC calendar years spanned by `[fromSec, toSec]`, inclusive. Used to expand
 * the M1 anchor into one dataset ref per year. Returns `[]` when the range is
 * empty or zero (no data loaded yet).
 */
export function yearsInRange(fromSec: number, toSec: number): number[] {
  if (!fromSec || !toSec || toSec < fromSec) return [];
  const fromYear = new Date(fromSec * 1000).getUTCFullYear();
  const toYear = new Date(toSec * 1000).getUTCFullYear();
  const out: number[] = [];
  for (let y = fromYear; y <= toYear; y++) out.push(y);
  return out;
}

/**
 * Expands a symbol + anchor selection into concrete dataset references: one M1
 * ref per (deduped, sorted) year; a single ref for H1/D1 (no year).
 */
export function buildRequiredDatasets(
  symbol: string,
  anchorTfs: AnchorTf[],
  years: number[],
): RequiredDataset[] {
  const out: RequiredDataset[] = [];
  const sortedYears = [...new Set(years)].sort((a, b) => a - b);
  for (const tf of anchorTfs) {
    if (tf === 'M1') {
      for (const year of sortedYears) out.push({ symbol, timeframe: 'M1', year });
    } else {
      out.push({ symbol, timeframe: tf });
    }
  }
  return out;
}

/** Assembles the spec-shaped session file from a snapshot. No candle data. */
export function buildSessionFile(s: SessionSnapshot): SessionFileV1 {
  return {
    version: SESSION_VERSION,
    exportedWith: EXPORTED_WITH,
    id: s.id ?? crypto.randomUUID(),
    requiredDatasets: buildRequiredDatasets(s.symbol, s.anchorTimeframes, s.years),
    context: {
      symbol: s.symbol,
      initialBalance: s.initialBalance,
      startRange: s.startRange,
      endRange: s.endRange,
    },
    state: {
      replayTime: s.replayTime,
      currentTimeframe: s.currentTimeframe,
      playbackSpeed: s.playbackSpeed,
    },
    trading: { trades: s.trades, pendingOrders: s.pendingOrders },
    annotations: { drawings: s.drawings, notes: s.notes },
  };
}

/**
 * Everything {@link snapshotFromState} reads from live NgRx state to build a
 * {@link SessionSnapshot}. Times here are unix SECONDS (as the app/state store
 * them); the active interval is expressed as either a standard {@link Timeframe}
 * or a custom minutes value — the custom value wins when both are present.
 */
export interface StateSnapshotInput {
  symbol: string;
  initialBalance: number;
  /** Data range start, unix SECONDS (UTC). */
  startRangeSec: number;
  /** Data range end, unix SECONDS (UTC). */
  endRangeSec: number;
  /** Replay cursor, unix SECONDS (UTC). */
  replayTimeSec: number;
  /** Active standard timeframe, or null when a custom interval is active. */
  activeTf: Timeframe | null;
  /** Active custom interval in minutes, or null when a standard TF is active. */
  customTfMinutes: number | null;
  playbackSpeed: number;
  trades: unknown[];
  pendingOrders: unknown[];
  drawings: unknown[];
  notes: unknown[];
  anchorTimeframes: AnchorTf[];
  years: number[];
  id?: string;
}

/**
 * Builds a {@link SessionSnapshot} (epoch MILLISECONDS, interval in MINUTES)
 * from live state expressed in unix SECONDS / {@link Timeframe}. Pure: no
 * Angular DI, no I/O — safe to unit test directly.
 */
export function snapshotFromState(input: StateSnapshotInput): SessionSnapshot {
  const currentTimeframe =
    input.customTfMinutes ?? (input.activeTf ? TIMEFRAME_SECONDS[input.activeTf] / 60 : 0);
  return {
    symbol: input.symbol,
    initialBalance: input.initialBalance,
    startRange: input.startRangeSec * 1000,
    endRange: input.endRangeSec * 1000,
    replayTime: input.replayTimeSec * 1000,
    currentTimeframe,
    playbackSpeed: input.playbackSpeed,
    trades: input.trades,
    pendingOrders: input.pendingOrders,
    drawings: input.drawings,
    notes: input.notes,
    anchorTimeframes: input.anchorTimeframes,
    years: input.years,
    id: input.id,
  };
}

/** Order in which {@link restorePlan} reports `selectedTfs` (anchors only). */
const ANCHOR_TF_ORDER: AnchorTf[] = ['M1', 'H1', 'D1'];

/**
 * Everything the import flow needs to restore live state from a parsed
 * {@link SessionFileV1}: times converted back to unix SECONDS, the interval
 * kept in MINUTES (the caller routes that to a {@link Timeframe} or a custom
 * interval), and the trading/annotation payloads passed through.
 */
export interface RestorePlan {
  symbol: string;
  /** Anchor timeframes to ensure are loaded, deduped, in M1/H1/D1 order. */
  selectedTfs: AnchorTf[];
  /** Replay cursor to seek to once data is loaded, unix SECONDS (UTC). */
  thenGoTo: number;
  /** Data range start, unix SECONDS (UTC). */
  startRangeSec: number;
  /** Data range end, unix SECONDS (UTC). */
  endRangeSec: number;
  currentTimeframeMinutes: number;
  playbackSpeed: number;
  trades: unknown[];
  pendingOrders: unknown[];
  drawings: unknown[];
  notes: unknown[];
}

/**
 * Maps a parsed {@link SessionFileV1} (epoch MILLISECONDS, interval in MINUTES)
 * back to the values the import flow dispatches into state (unix SECONDS).
 * Pure: no Angular DI, no I/O.
 */
export function restorePlan(file: SessionFileV1): RestorePlan {
  const requiredAnchors = new Set(file.requiredDatasets.map((d) => d.timeframe));
  const selectedTfs = ANCHOR_TF_ORDER.filter((tf) => requiredAnchors.has(tf));
  return {
    symbol: file.context.symbol,
    selectedTfs,
    thenGoTo: Math.round(file.state.replayTime / 1000),
    startRangeSec: Math.round(file.context.startRange / 1000),
    endRangeSec: Math.round(file.context.endRange / 1000),
    currentTimeframeMinutes: file.state.currentTimeframe,
    playbackSpeed: file.state.playbackSpeed,
    trades: file.trading.trades,
    pendingOrders: file.trading.pendingOrders,
    drawings: file.annotations.drawings,
    notes: file.annotations.notes,
  };
}

/**
 * Validates a parsed session object's version against the current schema:
 * - `=== SESSION_VERSION` → load normally.
 * - `> SESSION_VERSION`   → reject (prompt the user to update the emulator).
 * - older/missing/invalid → run the migration pipeline (see {@link migrateToCurrent}).
 */
export function classifySession(obj: unknown): ParseResult {
  if (!obj || typeof obj !== 'object') {
    return { status: 'invalid', reason: 'El archivo no es una sesión válida.' };
  }
  const record = obj as Record<string, unknown>;
  const version = record['version'];
  if (typeof version !== 'number' || !Number.isInteger(version)) {
    return { status: 'invalid', reason: 'Falta el campo "version" o no es válido.' };
  }
  if (version > SESSION_VERSION) {
    return { status: 'future', version };
  }
  if (version < SESSION_VERSION) {
    return migrateToCurrent(record, version);
  }
  if (!isWellFormedV1(record)) {
    return { status: 'invalid', reason: 'La sesión v1 está incompleta o corrupta.' };
  }
  return { status: 'ok', session: record as unknown as SessionFileV1 };
}

/**
 * Migration pipeline for sessions older than the current schema. v1 is the
 * first published version, so there is nothing below it yet; this is the seam
 * where `migrateV1toV2`, etc. will plug in. Until a real legacy format exists,
 * an older/zero version is rejected with a clear message rather than guessed.
 */
export function migrateToCurrent(_obj: Record<string, unknown>, version: number): ParseResult {
  return {
    status: 'invalid',
    reason: `No hay migración disponible para sesiones de versión ${version}.`,
  };
}

/** Minimal structural check that a v1 object has the fields the app restores. */
function isWellFormedV1(o: Record<string, unknown>): boolean {
  const ctx = o['context'] as Record<string, unknown> | undefined;
  return (
    Array.isArray(o['requiredDatasets']) &&
    !!ctx &&
    typeof ctx['symbol'] === 'string' &&
    typeof o['state'] === 'object' &&
    o['state'] !== null
  );
}

/** Parses raw text into a validated session (or a reason it can't be loaded). */
export function parseSessionText(text: string): ParseResult {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    return { status: 'invalid', reason: 'El archivo no es JSON válido.' };
  }
  return classifySession(obj);
}

/** Dataset refs the session needs that are NOT present in the local cache. */
export function missingDatasets(
  required: RequiredDataset[],
  local: DatasetRecord[],
): RequiredDataset[] {
  const have = new Set(local.map((d) => `${d.symbol}|${d.timeframe}|${d.year}`));
  return required.filter((r) => {
    const year = r.timeframe === 'M1' ? String(r.year) : 'all';
    return !have.has(`${r.symbol}|${r.timeframe}|${year}`);
  });
}

@Injectable({ providedIn: 'root' })
export class SessionService {
  // Constructor inject() default so this unit-tests by direct construction.
  constructor(private readonly db: WorkspaceDbService = inject(WorkspaceDbService)) {}

  /** Builds the spec-shaped session file (no I/O). */
  buildFile(snapshot: SessionSnapshot): SessionFileV1 {
    return buildSessionFile(snapshot);
  }

  /**
   * Serializes a session and triggers a `.session.json` download. Returns the
   * file object it wrote (handy for callers/tests). Browser-only side effect.
   */
  exportSession(snapshot: SessionSnapshot, filename?: string): SessionFileV1 {
    const file = buildSessionFile(snapshot);
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename ?? `${snapshot.symbol.toLowerCase()}-${file.id}.session.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    return file;
  }

  /** Validates imported text and reports the version verdict. */
  parse(text: string): ParseResult {
    return parseSessionText(text);
  }

  /**
   * The session's required datasets that are NOT in the local `datasets` cache.
   * A non-empty result is what triggers the "Missing Dataset. Download?" prompt;
   * an empty result means the import can proceed to restore.
   */
  async findMissingDatasets(session: SessionFileV1): Promise<RequiredDataset[]> {
    const local = await this.db.listDatasets();
    return missingDatasets(session.requiredDatasets, local);
  }
}
