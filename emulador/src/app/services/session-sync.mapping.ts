import type { TradingData, ClosedTrade, SavedSession } from '../state/trading/trading.models';
import { buildRequiredDatasets, yearsInRange, type AnchorTf } from './session.service';
import {
  SESSION_PAYLOAD_VERSION_3,
  type PayloadInput,
  type StoredSessionPayload,
  type SessionPayloadV3,
  type FlattenInput,
  type FlattenSession,
  type FlattenResult,
  type CloudSessionRow,
  type ReconstructedWorkspace,
  type SessionView,
  type DatasetRef,
  type LwwMergeResult,
} from './session-sync.models';
import { parseSessionPayload, singlePanelLayoutFor } from './session-migration';

export function toPayload(i: PayloadInput): SessionPayloadV3 {
  return {
    schemaVersion: SESSION_PAYLOAD_VERSION_3,
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
 * session-migration.ts). Delegates to `parseSessionPayload`, so a V1 or V2
 * input is migrated all the way to V3, and a structurally corrupt input gets
 * the same defensive single-panel fallback, in one call.
 */
export function fromPayload(p: StoredSessionPayload, primarySymbol: string) {
  const v3 = parseSessionPayload(p, primarySymbol);
  return {
    trading: v3.trading,
    cursor: v3.currentTime,
    activeTf: v3.activeTf,
    customTfMinutes: v3.customTfMinutes,
    playbackSpeed: v3.playbackSpeed,
    replayResolution: v3.replayResolution ?? null,
    drawings: v3.drawings,
    notes: v3.notes,
    selectedTfs: v3.selectedTfs,
    startRange: v3.startRange,
    endRange: v3.endRange,
    requiredDatasets: v3.requiredDatasets,
    layout: v3.layout,
    panels: v3.panels,
    linkGroups: v3.linkGroups,
  };
}

export const PAYLOAD_WARN_BYTES = 512 * 1024;
export const PAYLOAD_MAX_BYTES = 2 * 1024 * 1024;

const CANDLE_KEYS = new Set(['series', 'candles', 'ohlc', 'parquet']);

/** Defense-in-depth: reject any candle/series/OHLC/parquet field at any depth. */
export function assertNoCandles(payload: unknown): void {
  const seen = new WeakSet<object>();
  const walk = (v: unknown): void => {
    if (!v || typeof v !== 'object') return;
    if (seen.has(v as object)) return;
    seen.add(v as object);
    if (!Array.isArray(v)) {
      for (const k of Object.keys(v as Record<string, unknown>)) {
        if (CANDLE_KEYS.has(k.toLowerCase())) {
          throw new Error(`El payload no puede contener velas (campo prohibido: "${k}").`);
        }
        walk((v as Record<string, unknown>)[k]);
      }
    } else {
      for (const item of v) walk(item);
    }
  };
  walk(payload);
}

export function payloadSizeBytes(payload: unknown): number {
  return new Blob([JSON.stringify(payload)]).size;
}

export function assertPayloadSize(payload: unknown): { ok: boolean; bytes: number; warn: boolean } {
  const bytes = payloadSizeBytes(payload);
  if (bytes > PAYLOAD_MAX_BYTES) {
    throw new Error('Esta sesión es demasiado grande para sincronizarse.');
  }
  return { ok: true, bytes, warn: bytes >= PAYLOAD_WARN_BYTES };
}

export function isRealSession(t: TradingData): boolean {
  return (
    t.orders.length > 0 ||
    t.positions.length > 0 ||
    t.history.length > 0 ||
    t.sessionName != null ||
    t.sessionEnded
  );
}

export function computeSparkline(t: TradingData, maxPoints = 32): number[] {
  const closed = [...t.history].sort((a, b) => a.closeTime - b.closeTime);
  if (!closed.length) return [];
  // Start at the initial balance (same as the Sessions page's local equityCurve)
  // so a single closed trade yields TWO points and renders a line — otherwise a
  // 1-trade session shows the empty "Sin operaciones" placeholder on a cloud card.
  const curve: number[] = [t.initialBalance];
  let equity = t.initialBalance;
  for (const c of closed as ClosedTrade[]) {
    equity += c.profit;
    curve.push(equity);
  }
  if (curve.length <= maxPoints) return curve.map((v) => Math.round(v));
  const step = (curve.length - 1) / (maxPoints - 1);
  const out: number[] = [];
  for (let i = 0; i < maxPoints; i++) out.push(Math.round(curve[Math.round(i * step)]));
  return out;
}

export function winRateOf(t: TradingData): number | undefined {
  if (!t.history.length) return undefined;
  const wins = t.history.filter((c) => c.profit > 0).length;
  return wins / t.history.length;
}

/**
 * Default view for a session with no live `view` (archived sessions never
 * carry one — see `FlattenSession.view` doc). `layout`/`panels`/`linkGroups`
 * default to Task 1's own single-panel migration shape (reusing
 * `singlePanelLayoutFor`, already audited) rather than inventing a second
 * "empty layout" shape; `linkGroups: []` matches `migrateV1ToV2`'s default.
 */
function defaultView(symbol: string, cursor: number): SessionView {
  const { layout, panels } = singlePanelLayoutFor(symbol, 'M1');
  return {
    cursor,
    activeTf: null,
    customTfMinutes: null,
    playbackSpeed: 1,
    replayResolution: null,
    drawings: { version: 2, items: [] },
    notes: [],
    selectedTfs: [],
    startRange: 0,
    endRange: 0,
    layout,
    panels,
    linkGroups: [],
  };
}

function autoName(symbol: string, createdAt: number): string {
  return `${symbol} · ${new Date(createdAt).toISOString().slice(0, 10)}`;
}

function buildRow(
  session: FlattenSession,
  symbol: string,
  requiredDatasets: DatasetRef[],
  idOverride?: string,
): CloudSessionRow {
  const view: SessionView = session.view ?? defaultView(symbol, session.cursor);
  const payloadInput: PayloadInput = {
    trading: session.trading,
    currentTime: view.cursor,
    activeTf: view.activeTf,
    customTfMinutes: view.customTfMinutes,
    playbackSpeed: view.playbackSpeed,
    replayResolution: view.replayResolution ?? null,
    drawings: view.drawings,
    notes: view.notes,
    selectedTfs: view.selectedTfs,
    startRange: view.startRange,
    endRange: view.endRange,
    requiredDatasets,
    layout: view.layout,
    panels: view.panels,
    linkGroups: view.linkGroups,
  };
  const payload = toPayload(payloadInput);
  assertNoCandles(payload);
  assertPayloadSize(payload);

  const id = idOverride ?? session.id ?? crypto.randomUUID();

  return {
    id,
    symbol,
    name: session.name ?? autoName(symbol, session.createdAt),
    folderId: session.trading.folderId,
    // Stamp the row with the EMBEDDED payload's own version rather than a
    // hardcoded constant — toPayload's return version can change (D9), so the
    // `schema_version` column must track that reality. Nothing branches on
    // this column (mergeByLww ignores it; it's a display-only reader), so
    // this is metadata honesty, not a behavior change.
    schemaVersion: payload.schemaVersion,
    createdAt: session.createdAt,
    clientUpdatedAt: session.clientUpdatedAt,
    lastOpenedAt: session.lastOpenedAt ?? null,
    tradeCount: session.trading.history.length,
    initialBalance: session.trading.initialBalance,
    balance: session.trading.balance,
    cursor: session.cursor,
    requiredDatasets,
    winRate: winRateOf(session.trading),
    sparkline: computeSparkline(session.trading),
    payload,
  };
}

/**
 * Flattens one symbol's workspace (active live session + archived sessions)
 * into the cloud row shape. Pure: no DI/IO. The active session is included
 * only when `isRealSession` (D3); archived sessions are always included.
 */
export function flattenWorkspace(input: FlattenInput): FlattenResult {
  const { symbol, active, archived } = input;

  let requiredDatasets: DatasetRef[] = [];
  if (active?.view) {
    const anchors = active.view.selectedTfs.filter(
      (tf): tf is AnchorTf => tf === 'M1' || tf === 'H1' || tf === 'D1',
    );
    const years = yearsInRange(active.view.startRange, active.view.endRange);
    requiredDatasets = buildRequiredDatasets(symbol, anchors, years);
  }

  const rows: CloudSessionRow[] = [];
  let activeSessionId: string | null = null;

  if (active && isRealSession(active.trading)) {
    const mintedId = active.id ?? crypto.randomUUID();
    rows.push(buildRow(active, symbol, requiredDatasets, mintedId));
    activeSessionId = mintedId;
  }

  for (const session of archived) {
    rows.push(buildRow(session, symbol, requiredDatasets));
  }

  return { rows, activeSessionId };
}

/**
 * Groups cloud rows by symbol and reconstructs each symbol's workspace: the
 * active session (D4: row whose id ∈ knownActiveIds, else newest
 * clientUpdatedAt) plus the rest as archived SavedSessions. Pure: no DI/IO.
 */
export function reconstructWorkspaces(
  rows: CloudSessionRow[],
  knownActiveIds?: ReadonlySet<string>,
): Map<string, ReconstructedWorkspace> {
  const bySymbol = new Map<string, CloudSessionRow[]>();
  for (const row of rows) {
    const list = bySymbol.get(row.symbol);
    if (list) list.push(row);
    else bySymbol.set(row.symbol, [row]);
  }

  const result = new Map<string, ReconstructedWorkspace>();
  for (const [symbol, symbolRows] of bySymbol) {
    let activeRow = knownActiveIds ? symbolRows.find((r) => knownActiveIds.has(r.id)) : undefined;
    if (!activeRow) {
      activeRow = symbolRows.reduce((newest, r) =>
        r.clientUpdatedAt > newest.clientUpdatedAt ? r : newest,
      );
    }

    const restored = fromPayload(activeRow.payload, activeRow.symbol);
    const sessions: SavedSession[] = symbolRows
      .filter((r) => r.id !== activeRow!.id)
      .map((r) => ({
        id: r.id,
        name: r.name,
        createdAt: r.createdAt,
        currentTime: r.cursor,
        trading: fromPayload(r.payload, r.symbol).trading,
      }));

    result.set(symbol, {
      symbol,
      activeSessionId: activeRow.id,
      active: restored,
      sessions,
    });
  }

  return result;
}

/**
 * Pure LWW merge of a local set against a cloud set, with cloud-authoritative
 * membership (D1): a local entity previously synced (id ∈ syncedIds) but
 * absent from the cloud pull was deleted on another device and is removed
 * locally. A never-synced local-only entity (id ∉ syncedIds) is a local
 * creation, kept and queued for push. Generic over folders/sessions (T9).
 * Deterministic: `merged` keeps local order for kept-local items, then
 * appends cloud-only items in cloud order. No DI/IO, no input mutation.
 */
export function mergeByLww<T extends { id: string; clientUpdatedAt: number }>(
  local: T[],
  cloud: T[],
  syncedIds: ReadonlySet<string>,
): LwwMergeResult<T> {
  const cloudById = new Map(cloud.map((c) => [c.id, c]));
  const localIds = new Set(local.map((l) => l.id));

  const merged: T[] = [];
  const toPushIds: string[] = [];
  const toDeleteLocalIds: string[] = [];

  for (const localItem of local) {
    const cloudItem = cloudById.get(localItem.id);
    if (cloudItem) {
      if (cloudItem.clientUpdatedAt > localItem.clientUpdatedAt) {
        merged.push(cloudItem);
      } else if (localItem.clientUpdatedAt > cloudItem.clientUpdatedAt) {
        merged.push(localItem);
        toPushIds.push(localItem.id);
      } else {
        merged.push(localItem);
      }
    } else if (syncedIds.has(localItem.id)) {
      toDeleteLocalIds.push(localItem.id);
    } else {
      merged.push(localItem);
      toPushIds.push(localItem.id);
    }
  }

  for (const cloudItem of cloud) {
    if (!localIds.has(cloudItem.id)) {
      merged.push(cloudItem);
    }
  }

  return { merged, toPushIds, toDeleteLocalIds };
}
