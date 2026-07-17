import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType, ROOT_EFFECTS_INIT } from '@ngrx/effects';
import { Action, Store } from '@ngrx/store';
import { from } from 'rxjs';
import {
  concatMap,
  debounceTime,
  filter,
  mergeMap,
  switchMap,
  withLatestFrom,
} from 'rxjs/operators';
import { Timeframe } from '../../models';
import { WorkspaceDbService } from '../../services/workspace-db.service';
import { MarketActions } from '../market/market.actions';
import { loadedTfForMinutes } from '../market/custom-timeframe';
import { ReplayActions } from '../replay/replay.actions';
import { TradingActions } from '../trading/trading.actions';
import { ExecutionCosts } from '../trading/execution-costs';
import { DrawingsActions } from '../drawings/drawings.actions';
import { LayoutActions } from '../layout/layout.actions';
import { LinkGroupsActions } from '../link-groups/link-groups.actions';
import { normalizeLinkGroup } from '../link-groups/link-groups.models';
import { selectCurrentAsset, selectWorkspaceMetaSnapshot } from '../selectors';
import {
  PendingCsv,
  PendingSessionImport,
  PendingSessionRestore,
  WorkspacesActions,
} from './workspaces.actions';
import { emptyWorkspace, Workspace, WorkspaceMeta } from './workspaces.models';
import type { LinkGroup } from '../link-groups/link-groups.models';

// Key for remembering the last active asset across restarts.
const CURRENT_KEY = 'emulador.currentAsset';

/**
 * `selectWorkspaceMetaSnapshot`'s actual output shape. `linkGroups` here is
 * `linkGroupsFeature.selectGroups`'s RUNTIME Record<string, LinkGroup> (RFC-011
 * Task 4) — NOT `WorkspaceMeta.linkGroups`'s array (the persisted wire-shape
 * mirror) — so this type overrides that one field rather than reusing
 * `WorkspaceMeta` as-is; `doSwitch`/`persistMeta$` convert Record -> array
 * (`Object.values`) at the exact point they call `putMeta`.
 */
type MetaSnapshot = Omit<WorkspaceMeta, 'symbol' | 'lastModified' | 'linkGroups'> & {
  linkGroups: Record<string, LinkGroup>;
};

@Injectable()
export class WorkspacesEffects {
  private actions$ = inject(Actions);
  private store = inject(Store);
  private db = inject(WorkspaceDbService);

  /** On startup: load the asset registry and restore the last active asset. */
  init$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ROOT_EFFECTS_INIT),
      switchMap(() => from(this.loadInitial())),
      mergeMap((actions) => actions),
    ),
  );

  /**
   * Asset switch: persist the outgoing asset's meta, then restore the target
   * one (or create it empty) and finally load any pending CSVs into it.
   * Emitted in strict order so the CSVs land in the NEW workspace.
   */
  switch$ = createEffect(() =>
    this.actions$.pipe(
      ofType(WorkspacesActions.switchAsset),
      withLatestFrom(
        this.store.select(selectCurrentAsset),
        this.store.select(selectWorkspaceMetaSnapshot),
      ),
      concatMap(([action, current, meta]) =>
        from(this.doSwitch(action, current, meta)).pipe(mergeMap((actions) => actions)),
      ),
    ),
  );

  /**
   * Continuously persists the LIGHT part of the active workspace (replay
   * cursor, drawings, active TF). The candle series are intentionally
   * excluded: they only change on CSV load (see persistSeries$), and
   * re-serializing them here froze the UI with large datasets.
   */
  persistMeta$ = createEffect(
    () =>
      this.store.select(selectWorkspaceMetaSnapshot).pipe(
        debounceTime(300),
        withLatestFrom(this.store.select(selectCurrentAsset)),
        filter(([, current]) => !!current),
        concatMap(([meta, current]) =>
          from(
            (async () => {
              // The stable activeSessionId now lives in NgRx state and is
              // carried by selectWorkspaceMetaSnapshot (state owns it), so it
              // is written straight from `meta`. The LWW clocks
              // (activeClientUpdatedAt/activeSyncedAt) remain sync-only (NOT in
              // the snapshot) — read the existing record first and re-apply
              // them, otherwise every persist here would clobber them with
              // undefined, breaking the dirty check on the next sync.
              const existing = await this.db.getMeta(current!).catch(() => undefined);
              await this.db
                .putMeta({
                  symbol: current!,
                  ...meta,
                  // RFC-011 Task 4 (folded audit fix): selectWorkspaceMetaSnapshot's
                  // `linkGroups` is linkGroupsFeature's runtime Record<string,
                  // LinkGroup> (state), but WorkspaceMeta.linkGroups is declared as
                  // an ARRAY (the local mirror of the wire/SessionPayloadV2 shape).
                  // Converting explicitly here keeps the Record out of IndexedDB.
                  linkGroups: Object.values(meta.linkGroups),
                  lastModified: Date.now(),
                  activeClientUpdatedAt: existing?.activeClientUpdatedAt,
                  activeSyncedAt: existing?.activeSyncedAt,
                })
                .catch(() => undefined);
            })(),
          ),
        ),
      ),
    { dispatch: false },
  );

  /** Persists a candle series exactly when a CSV lands in the workspace. */
  persistSeries$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(MarketActions.csvLoaded),
        withLatestFrom(this.store.select(selectCurrentAsset)),
        filter(([, current]) => !!current),
        concatMap(([{ tf, candles }, current]) =>
          from(this.db.putSeries(current!, tf, candles).catch(() => undefined)),
        ),
      ),
    { dispatch: false },
  );

  private async loadInitial(): Promise<Action[]> {
    try {
      const assets = await this.db.list();
      let current: string | null = null;
      try {
        current = localStorage.getItem(CURRENT_KEY);
      } catch {
        current = null;
      }
      if (current && !assets.some((a) => a.symbol === current)) current = null;
      const actions: Action[] = [WorkspacesActions.assetsLoaded({ assets, current })];
      if (current) {
        const ws = await this.db.getWorkspace(current);
        if (ws) actions.push(WorkspacesActions.workspaceRestored({ workspace: ws }));
      }
      return actions;
    } catch {
      return [WorkspacesActions.assetsLoaded({ assets: [], current: null })];
    }
  }

  private async doSwitch(
    action: {
      symbol: string;
      selectedTfs?: Timeframe[];
      thenLoad?: PendingCsv[];
      thenImport?: PendingSessionImport;
      thenRestore?: PendingSessionRestore;
      thenNewSession?: { name: string | null };
      executionCosts?: ExecutionCosts | null;
      thenOpenSession?: string;
      thenGoTo?: number;
      thenSessionEnd?: number;
    },
    current: string | null,
    meta: MetaSnapshot,
  ): Promise<Action[]> {
    const {
      symbol,
      thenImport,
      thenRestore,
      thenNewSession,
      executionCosts,
      thenOpenSession,
      thenGoTo,
      thenSessionEnd,
    } = action;
    const thenLoad = action.thenLoad ?? [];
    const applySelectedTfs = (w: Workspace): Workspace =>
      action.selectedTfs ? { ...w, selectedTfs: action.selectedTfs } : w;
    // 1) persist the outgoing asset's meta (its series are already stored)
    if (current) {
      try {
        // RFC-011 Task 4 (folded audit fix): see persistMeta$'s comment — the
        // snapshot's linkGroups is a Record (runtime state); WorkspaceMeta
        // wants an array (wire-shape mirror).
        await this.db.putMeta({
          symbol: current,
          ...meta,
          linkGroups: Object.values(meta.linkGroups),
          lastModified: Date.now(),
        });
      } catch {
        /* persistence is best-effort */
      }
    }
    // 2) restore (or create) the incoming asset
    let ws: Workspace | undefined;
    try {
      ws = await this.db.getWorkspace(symbol);
    } catch {
      ws = undefined;
    }
    try {
      localStorage.setItem(CURRENT_KEY, symbol);
    } catch {
      /* ignore */
    }
    const actions: Action[] = [
      WorkspacesActions.workspaceRestored({
        workspace: applySelectedTfs(ws ?? emptyWorkspace(symbol)),
      }),
    ];
    // 3) then load freshly parsed CSVs (persistSeries$ stores each of them)
    for (const csv of thenLoad) {
      actions.push(MarketActions.csvLoaded(csv));
    }
    // 3r) `.session.json` restore: inject the full live state right AFTER the
    // candles land (so the chart has data) and BEFORE the legacy import/wizard
    // branches. Order matters: trading → drawings → layout/linkGroups (RFC-011,
    // only when present) → interval → speed; the cursor is handled by
    // `thenGoTo` below, exactly as in the wizard flow.
    if (thenRestore) {
      actions.push(TradingActions.restoreSession({ trading: thenRestore.trading }));
      actions.push(DrawingsActions.restoreDrawings({ drawings: thenRestore.drawings }));
      if (thenRestore.layout && thenRestore.panels) {
        actions.push(
          LayoutActions.restoreLayout({ layout: thenRestore.layout, panels: thenRestore.panels }),
        );
      }
      if (thenRestore.linkGroups) {
        // A group parsed from a payload that predates the composition flags
        // normalizes to the migration defaults, not `undefined`.
        actions.push(
          LinkGroupsActions.restoreGroups({
            groups: thenRestore.linkGroups.map(normalizeLinkGroup),
          }),
        );
      }
      const matchTf = loadedTfForMinutes(
        thenRestore.intervalMinutes,
        thenLoad.map((c) => c.tf),
      );
      actions.push(
        matchTf
          ? MarketActions.changeTimeframe({ tf: matchTf })
          : MarketActions.changeCustomTimeframe({ minutes: thenRestore.intervalMinutes }),
      );
      actions.push(ReplayActions.changeSpeed({ msPerCandle: thenRestore.playbackSpeed }));
      actions.push(ReplayActions.setReplayResolution({ minutes: thenRestore.replayResolution }));
    }
    // 4) then import a session CSV into the freshly restored workspace
    if (thenImport?.trades.length) {
      const restored = ws ?? emptyWorkspace(symbol);
      actions.push(
        TradingActions.sessionImported({
          trades: thenImport.trades,
          currentCursor: restored.currentTime,
        }),
      );
      const lastClose = thenImport.trades.reduce((max, t) => Math.max(max, t.closeTime), 0);
      if (lastClose > 0) actions.push(ReplayActions.goToTime({ time: lastClose }));
    }
    // 5) wizard flow: archive any previous activity into a fresh session…
    if (thenNewSession) {
      const restored = ws ?? emptyWorkspace(symbol);
      actions.push(
        TradingActions.newSession({ currentCursor: restored.currentTime, executionCosts }),
      );
      if (thenNewSession.name) {
        actions.push(TradingActions.setSessionName({ name: thenNewSession.name }));
      }
    }
    // 6) sessions page: reopen an archived session of the target workspace
    if (thenOpenSession) {
      const restored = ws ?? emptyWorkspace(symbol);
      const target = (restored.sessions ?? []).find((s) => s.id === thenOpenSession);
      if (target) {
        actions.push(
          TradingActions.switchSession({ id: target.id, currentCursor: restored.currentTime }),
        );
        if (target.currentTime > 0) {
          actions.push(ReplayActions.goToTime({ time: target.currentTime }));
        }
      }
    }
    // …and open the chart at the chosen start date, past candles behind
    if (thenGoTo !== undefined) {
      actions.push(ReplayActions.goToTime({ time: thenGoTo }));
    }
    // wizard flow: schedule the session end once everything is in place
    if (thenSessionEnd !== undefined) {
      actions.push(TradingActions.setSessionEnd({ time: thenSessionEnd }));
    }
    return actions;
  }
}
