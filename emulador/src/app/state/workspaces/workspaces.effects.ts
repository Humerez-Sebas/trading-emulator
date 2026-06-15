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
import { ReplayActions } from '../replay/replay.actions';
import { TradingActions } from '../trading/trading.actions';
import { selectCurrentAsset, selectWorkspaceMetaSnapshot } from '../selectors';
import { PendingCsv, PendingSessionImport, WorkspacesActions } from './workspaces.actions';
import { emptyWorkspace, Workspace, WorkspaceMeta } from './workspaces.models';

// Key for remembering the last active asset across restarts.
const CURRENT_KEY = 'emulador.currentAsset';

type MetaSnapshot = Omit<WorkspaceMeta, 'symbol' | 'lastModified'>;

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
            this.db
              .putMeta({ symbol: current!, ...meta, lastModified: Date.now() })
              .catch(() => undefined),
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
      thenNewSession?: { name: string | null };
      thenOpenSession?: string;
      thenGoTo?: number;
      thenSessionEnd?: number;
    },
    current: string | null,
    meta: MetaSnapshot,
  ): Promise<Action[]> {
    const { symbol, thenImport, thenNewSession, thenOpenSession, thenGoTo, thenSessionEnd } =
      action;
    const thenLoad = action.thenLoad ?? [];
    const applySelectedTfs = (w: Workspace): Workspace =>
      action.selectedTfs ? { ...w, selectedTfs: action.selectedTfs } : w;
    // 1) persist the outgoing asset's meta (its series are already stored)
    if (current) {
      try {
        await this.db.putMeta({ symbol: current, ...meta, lastModified: Date.now() });
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
      actions.push(TradingActions.newSession({ currentCursor: restored.currentTime }));
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
