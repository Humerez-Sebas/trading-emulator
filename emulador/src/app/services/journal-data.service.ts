import { inject, Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { TIMEFRAME_SECONDS, type Timeframe } from '../models';
import { computeSessionStats } from '../state/trading/fill-engine';
import type { ClosedTrade } from '../state/trading/trading.models';
import type { WorkspaceMeta } from '../state/workspaces/workspaces.models';
import type { DatasetRecord } from './market-data-db';
import type { JournalSessionModel, JournalRuleRef } from '../state/journal/journal-read.models';
import { selectCurrentAsset, selectSavedSessions, selectTradingData } from '../state/selectors';
import { tradingFeature } from '../state/trading/trading.reducer';
import { selectPlaybookRules } from '../state/playbook/playbook.selectors';
import { selectLessonByTradeRef } from '../state/lessons/lessons.selectors';
import { WorkspaceDbService } from './workspace-db.service';
import { TelemetryDbService } from './telemetry-db.service';

/**
 * Last-resort default when neither the session's `WorkspaceMeta.selectedTfs`
 * nor its symbol's locally-cached datasets can determine a base TF (see
 * {@link finestTimeframeSeconds}/{@link resolveBaseTfSeconds}). NOT a claim
 * that the execution base is "always M1" — review Finding 1 (task-5-review.md)
 * verified that is false: the fill engine's execution base is
 * `selectExecutionSeries` = the finest LOADED series (`selectors.ts`'s own
 * comment: "M1 ground truth **when loaded**"), and a session's anchors are a
 * per-session `M1 | H1 | D1` selection — a user can create an H1/D1-only
 * session (`crear-sesion-page.component.ts`'s `toggleTf` only guards
 * non-empty, not "M1 present"). M1 is only the FALLBACK when the session's
 * real anchor selection is undeterminable.
 */
const FALLBACK_BASE_TIMEFRAME_SECONDS = TIMEFRAME_SECONDS.M1;

/** The finest (smallest-duration) TF's seconds among `tfs`, or `null` when
 * `tfs` is empty/absent or none of its entries is a recognized {@link Timeframe}. */
function finestTimeframeSeconds(tfs: readonly string[] | undefined): number | null {
  if (!tfs?.length) return null;
  let best: number | null = null;
  for (const tf of tfs) {
    const seconds = TIMEFRAME_SECONDS[tf as Timeframe];
    if (seconds === undefined) continue;
    if (best === null || seconds < best) best = seconds;
  }
  return best;
}

/**
 * Derives the session's base execution TF, in seconds (RFC-016 review
 * Finding 1 fix). Priority, each strictly more accurate than the next:
 * 1. `meta.selectedTfs` — the session's OWN anchor selection (set once at
 *    creation/`switchAsset`, doesn't churn per-trade — safe to read from the
 *    persisted meta even for the live/current asset).
 * 2. The finest TF among the symbol's locally-cached `datasets` (already
 *    loaded by `load()` for `datasetRefs`) — used when `selectedTfs` is
 *    absent (legacy meta) or empty.
 * 3. {@link FALLBACK_BASE_TIMEFRAME_SECONDS} (M1) only when neither source
 *    yields a determinable TF.
 */
function resolveBaseTfSeconds(
  meta: WorkspaceMeta | undefined,
  symbol: string,
  datasets: readonly DatasetRecord[],
): number {
  const fromSelectedTfs = finestTimeframeSeconds(meta?.selectedTfs);
  if (fromSelectedTfs !== null) return fromSelectedTfs;
  const fromDatasets = finestTimeframeSeconds(
    datasets.filter((d) => d.symbol === symbol).map((d) => d.timeframe),
  );
  if (fromDatasets !== null) return fromDatasets;
  return FALLBACK_BASE_TIMEFRAME_SECONDS;
}

/** Thrown by {@link JournalDataService.loadSessionReadModel} when `sessionId`
 * resolves to no local session (deleted, never existed, or cloud-only —
 * see the service's class doc comment for the cloud-only decision). */
export class JournalSessionNotFoundError extends Error {
  constructor(readonly sessionId: string) {
    super(`Journal session not found: ${sessionId}`);
    this.name = 'JournalSessionNotFoundError';
  }
}

interface ResolvedSession {
  symbol: string;
  name: string;
  trades: ClosedTrade[];
  initialBalance: number;
  balance: number;
}

/**
 * Read-side data loader for the Journal (RFC-016 D16.E) and, per
 * component-architecture §3.1 ("one loader, two surfaces"), the Task-7
 * Reflection Cabin. Resolves a session BY ID, without opening the practice
 * workspace (no `WorkspacesActions`/`TradingActions` dispatch — the live
 * store is only READ, never written).
 *
 * J-6: this service dispatches NOTHING to trading/replay/telemetry/
 * workspaces. Every store access below is `Store.selectSignal` (a read);
 * `TelemetryDbService.listForSession` is a read API. Zero `store.dispatch`
 * calls anywhere in this file (grepped by the task's invariant check).
 *
 * Session resolution rule (documented decision, task-5-report.md):
 * 1. Search every local workspace (`WorkspaceDbService.listMetas()`) for a
 *    session matching `sessionId` — either that workspace's ACTIVE session
 *    (`activeSessionId`/`meta.activeSessionId`) or one of its archived
 *    `savedSessions`/`meta.sessions`. For the CURRENTLY open asset, the LIVE
 *    NgRx state wins over the (possibly stale) persisted IndexedDB meta —
 *    the same "live wins" rule `SesionesPageComponent.allCards` already
 *    applies, reused here rather than duplicated as a new idiom.
 * 2. No match ⇒ `JournalSessionNotFoundError`. This is ALSO what happens for
 *    a cloud-only session that has never been pulled locally (RFC-016 does
 *    not add a Journal-specific cloud-fetch path this phase — a materialize
 *    step belongs to the existing `SesionesPageComponent.openCloudOnlySession`
 *    flow, out of scope for a read-only surface) — the page renders the same
 *    "No se encontró la sesión" error state (design spec §1.8) for both
 *    causes; there is no Journal-specific copy for a genuine IO failure vs.
 *    "not found", so both collapse to the one error copy the design spec
 *    defines.
 */
@Injectable({ providedIn: 'root' })
export class JournalDataService {
  private store = inject(Store);
  private db = inject(WorkspaceDbService);
  private telemetryDb = inject(TelemetryDbService);

  private currentAsset = this.store.selectSignal(selectCurrentAsset);
  private liveTrading = this.store.selectSignal(selectTradingData);
  private liveSavedSessions = this.store.selectSignal(selectSavedSessions);
  private liveActiveSessionId = this.store.selectSignal(tradingFeature.selectActiveSessionId);
  private allRules = this.store.selectSignal(selectPlaybookRules);
  private lessonByTradeRef = this.store.selectSignal(selectLessonByTradeRef);

  /** sessionId → in-flight/resolved load. Simple Map (component-architecture
   * §3.1): entries persist for the service's lifetime (`providedIn: 'root'`,
   * app lifetime) so the Journal and the Cabin reuse the SAME read for a
   * session they're both looking at, without a second IndexedDB/telemetry
   * round trip. No automatic eviction on a different id — {@link clear} is
   * the explicit opt-in for a caller (or a test) that wants a fresh read. A
   * failed load is evicted immediately (see {@link loadSessionReadModel}) so
   * a transient failure never poisons the cache permanently. */
  private cache = new Map<string, Promise<JournalSessionModel>>();

  /** Resolves the session read-model, from cache when already loaded/loading. */
  async loadSessionReadModel(sessionId: string): Promise<JournalSessionModel> {
    const cached = this.cache.get(sessionId);
    if (cached) return cached;
    const promise = this.load(sessionId);
    this.cache.set(sessionId, promise);
    try {
      return await promise;
    } catch (e) {
      this.cache.delete(sessionId);
      throw e;
    }
  }

  /** Drops every cached entry — forces the next {@link loadSessionReadModel} call(s) to re-read. */
  clear(): void {
    this.cache.clear();
  }

  private async load(sessionId: string): Promise<JournalSessionModel> {
    const metas = await this.db.listMetas();
    const resolved = this.resolveSession(sessionId, metas);
    if (!resolved) throw new JournalSessionNotFoundError(sessionId);

    const [telemetry, datasets] = await Promise.all([
      this.telemetryDb.listForSession(sessionId),
      this.db.listDatasets(),
    ]);

    const rules: JournalRuleRef[] = this.allRules()
      .map((r) => ({
        id: r.id,
        title: r.title,
        shortcutSlot: r.shortcutSlot,
        sortOrder: r.sortOrder,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const tradeIds = new Set(resolved.trades.map((t) => t.id));
    const fullLessonMap = this.lessonByTradeRef();
    const lessonByTradeRef: JournalSessionModel['lessonByTradeRef'] = {};
    for (const tradeId of tradeIds) {
      const lesson = fullLessonMap[tradeId];
      if (lesson) lessonByTradeRef[tradeId] = lesson;
    }

    const datasetRefs = datasets.filter((d) => d.symbol === resolved.symbol).map((d) => d.id);
    const meta = metas.find((m) => m.symbol === resolved.symbol);

    return {
      sessionId,
      symbol: resolved.symbol,
      name: resolved.name,
      initialBalance: resolved.initialBalance,
      balance: resolved.balance,
      trades: resolved.trades,
      stats: computeSessionStats(resolved.trades, resolved.initialBalance),
      telemetry,
      rules,
      lessonByTradeRef,
      datasetRefs,
      baseTfSeconds: resolveBaseTfSeconds(meta, resolved.symbol, datasets),
    };
  }

  private resolveSession(
    sessionId: string,
    metas: readonly WorkspaceMeta[],
  ): ResolvedSession | null {
    const currentAsset = this.currentAsset();
    for (const meta of metas) {
      const live = meta.symbol === currentAsset;
      const trading = live ? this.liveTrading() : meta.trading;
      const activeId = live ? this.liveActiveSessionId() : (meta.activeSessionId ?? null);
      if (trading && activeId === sessionId) {
        return {
          symbol: meta.symbol,
          name: trading.sessionName ?? 'Sesión en curso',
          trades: trading.history,
          initialBalance: trading.initialBalance,
          balance: trading.balance,
        };
      }
      const savedSessions = live ? this.liveSavedSessions() : (meta.sessions ?? []);
      const found = savedSessions.find((s) => s.id === sessionId);
      if (found) {
        return {
          symbol: meta.symbol,
          name: found.name,
          trades: found.trading.history,
          initialBalance: found.trading.initialBalance,
          balance: found.trading.balance,
        };
      }
    }
    return null;
  }
}
