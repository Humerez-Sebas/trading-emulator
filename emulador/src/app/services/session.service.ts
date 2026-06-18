import { inject, Injectable } from '@angular/core';
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
