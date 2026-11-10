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
import { Timeframe, TIMEFRAME_ORDER } from '../../models';
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
import type { Drawing, DrawingOwner } from '../drawings/drawings.models';
import type { WorkspaceLayout, PanelDescriptor } from '../layout/layout.models';
import {
  liftLegacyDrawing,
  ownerPanelFor,
  type LegacyDrawingItem,
} from '../../services/drawings-migration';
import { singlePanelLayoutFor } from '../../services/session-migration';
import { isRealSession } from '../../services/session-sync.mapping';

function nextClock(now: number, clientUpdatedAt?: number, syncedAt?: number): number {
  return Math.max(now, (clientUpdatedAt ?? 0) + 1, (syncedAt ?? 0) + 1);
}

/** Rebinds the meta-level active clocks when reducer state changes session identity. */
function reconcileSessionClocks(
  meta: MetaSnapshot,
  existing: WorkspaceMeta | undefined,
  now: number,
  markActiveDirty: boolean,
): Pick<WorkspaceMeta, 'sessions' | 'activeClientUpdatedAt' | 'activeSyncedAt'> {
  const existingSessions = new Map(
    (existing?.sessions ?? []).map((session) => [session.id, session]),
  );
  let sessions = (meta.sessions ?? []).map((session) => {
    const stored = existingSessions.get(session.id);
    return stored
      ? {
          ...session,
          clientUpdatedAt: session.clientUpdatedAt ?? stored.clientUpdatedAt,
          syncedAt: session.syncedAt ?? stored.syncedAt,
        }
      : session;
  });
  const identityChanged = existing?.activeSessionId !== meta.activeSessionId;

  if (identityChanged && existing?.activeSessionId) {
    sessions = sessions.map((session) =>
      session.id === existing.activeSessionId
        ? {
            ...session,
            customTfMinutes:
              session.customTfMinutes === undefined
                ? existing.customTfMinutes
                : session.customTfMinutes,
            playbackSpeed: session.playbackSpeed ?? existing.playbackSpeed,
            replayResolution:
              session.replayResolution === undefined
                ? existing.replayResolution
                : session.replayResolution,
            clientUpdatedAt: isRealSession(session.trading)
              ? nextClock(now, existing.activeClientUpdatedAt, existing.activeSyncedAt)
              : existing.activeClientUpdatedAt,
            syncedAt: existing.activeSyncedAt,
          }
        : session,
    );
  }

  const previousActive = identityChanged
    ? existing?.sessions?.find((session) => session.id === meta.activeSessionId)
    : undefined;
  const activeClientUpdatedAt = identityChanged
    ? previousActive?.clientUpdatedAt
    : existing?.activeClientUpdatedAt;
  const activeSyncedAt = identityChanged ? previousActive?.syncedAt : existing?.activeSyncedAt;

  return {
    sessions,
    activeClientUpdatedAt:
      markActiveDirty && meta.trading && isRealSession(meta.trading)
        ? nextClock(now, activeClientUpdatedAt, activeSyncedAt)
        : activeClientUpdatedAt,
    activeSyncedAt,
  };
}

/**
 * All-or-nothing resolution of the (layout, panels) pair that should own a
 * symbol's drawings: both fields present -> those, verbatim; otherwise the
 * migration-default single-panel layout for the given symbol/timeframe. Pure
 * and total (never partially-defined), so every caller gets a real,
 * self-consistent layout to resolve an owner against.
 */
function resolveOwnerLayout(
  symbol: string,
  activeTf: Timeframe | null | undefined,
  layout: WorkspaceLayout | undefined,
  panels: Record<string, PanelDescriptor> | undefined,
): { layout: WorkspaceLayout; panels: Record<string, PanelDescriptor> } {
  if (layout && panels) return { layout, panels };
  return singlePanelLayoutFor(symbol, activeTf ?? 'M1');
}

/** True iff `owner` names something that actually exists in the layout/groups being installed. */
function isOwnerResolvable(
  owner: DrawingOwner,
  panels: Record<string, PanelDescriptor>,
  resolvableGroupIds: ReadonlySet<string>,
): boolean {
  return owner.type === 'panel' ? owner.id in panels : resolvableGroupIds.has(owner.id);
}

/**
 * Lifts every legacy (owner-less) item in `items` against a resolved
 * (layout, panels) pair: an item missing `owner` gets the symbol's matching
 * panel and the fields legacy records never carried. An already owner-tagged
 * item normally passes through untouched — UNLESS `resolvableGroupIds` is
 * given, in which case an owner that names a panel or group absent from
 * `panels`/`resolvableGroupIds` is re-homed the same way a legacy item is: to
 * the symbol's matching panel (falling back to the layout's first panel),
 * every other field carried over verbatim. This is a migration act at a
 * hydration boundary (re-anchoring a reference that no longer resolves), not
 * a runtime ownership mutation — exactly like lifting a legacy item itself.
 * Omitting `resolvableGroupIds` skips that check entirely: a workspace's own
 * persisted layout and its own drawings are consistent by construction, so
 * only an EXTERNAL restore (an imported `.session.json`, whose drawings may
 * carry owners from a different machine or a cleared profile) needs it.
 * `ownerPanelFor` is resolved at most once per distinct symbol that needs a
 * home, and identity is preserved when nothing needed lifting or re-homing.
 * Shared by every read site that can receive a pre-ownership or
 * unresolvable-ownership drawing, so they never drift apart.
 */
function liftLegacyDrawings(
  items: Drawing[],
  symbol: string,
  layout: WorkspaceLayout,
  panels: Record<string, PanelDescriptor>,
  resolvableGroupIds?: ReadonlySet<string>,
): Drawing[] {
  let changed = false;
  let legacyOwnerPanelId: string | null = null;
  const homePanelCache = new Map<string, string>();
  const homePanelFor = (itemSymbol: string): string => {
    let panelId = homePanelCache.get(itemSymbol);
    if (panelId === undefined) {
      panelId = ownerPanelFor(itemSymbol, layout, panels);
      homePanelCache.set(itemSymbol, panelId);
    }
    return panelId;
  };
  const lifted = items.map((item, index) => {
    const owner = (item as Partial<Drawing>).owner;
    if (owner == null) {
      changed = true;
      legacyOwnerPanelId ??= ownerPanelFor(symbol, layout, panels);
      return liftLegacyDrawing(
        item as unknown as LegacyDrawingItem,
        symbol,
        legacyOwnerPanelId,
        index,
      );
    }
    if (resolvableGroupIds && !isOwnerResolvable(owner, panels, resolvableGroupIds)) {
      changed = true;
      return { ...item, owner: { type: 'panel' as const, id: homePanelFor(item.symbol) } };
    }
    return item;
  });
  return changed ? lifted : items;
}

/**
 * Read-time shape-guard (parse, don't trust) for `Workspace.drawings`
 * records written before ownership existed: lifts against the workspace's
 * own symbol and its own persisted layout (falling back to
 * `singlePanelLayoutFor` for a workspace saved before layout/panels were
 * persisted).
 */
function liftWorkspaceDrawings(ws: Workspace): Drawing[] {
  const { layout, panels } = resolveOwnerLayout(ws.symbol, ws.activeTf, ws.layout, ws.panels);
  return liftLegacyDrawings(ws.drawings ?? [], ws.symbol, layout, panels);
}

/** Applies `liftWorkspaceDrawings`, returning the same reference when nothing needed lifting. */
function withLiftedDrawings(ws: Workspace): Workspace {
  const drawings = liftWorkspaceDrawings(ws);
  return drawings === ws.drawings ? ws : { ...ws, drawings };
}

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

/**
 * The timeframe a fresh wizard session opens on: the restored workspace's own
 * TF while the session still selects it, else the finest selected TF. null
 * when the switch declares no selection.
 */
function openingTimeframe(
  current: Timeframe | null,
  selected: Timeframe[] | undefined,
): Timeframe | null {
  if (!selected?.length) return null;
  if (current && selected.includes(current)) return current;
  return TIMEFRAME_ORDER.find((tf) => selected.includes(tf)) ?? null;
}

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
              .updateMeta(current!, (existing) => {
                // The stable activeSessionId now lives in NgRx state and is
                // carried by selectWorkspaceMetaSnapshot (state owns it), so it
                // is written straight from `meta`. The LWW clocks
                // (activeClientUpdatedAt/activeSyncedAt) remain sync-only (NOT in
                // the snapshot) — reconcile them against the latest stored value
                // inside the same transaction as this whole-record write.
                const now = Date.now();
                const activePayloadChanged =
                  existing?.activeSessionId === meta.activeSessionId &&
                  JSON.stringify({
                    files: existing?.files,
                    currentTime: existing?.currentTime,
                    activeTf: existing?.activeTf,
                    selectedTfs: existing?.selectedTfs,
                    customTfMinutes: existing?.customTfMinutes,
                    playbackSpeed: existing?.playbackSpeed,
                    replayResolution: existing?.replayResolution,
                    drawings: existing?.drawings,
                    trading: existing?.trading,
                    layout: existing?.layout,
                    panels: existing?.panels,
                    linkGroups: existing?.linkGroups,
                  }) !==
                    JSON.stringify({
                      files: meta.files,
                      currentTime: meta.currentTime,
                      activeTf: meta.activeTf,
                      selectedTfs: meta.selectedTfs,
                      customTfMinutes: meta.customTfMinutes,
                      playbackSpeed: meta.playbackSpeed,
                      replayResolution: meta.replayResolution,
                      drawings: meta.drawings,
                      trading: meta.trading,
                      layout: meta.layout,
                      panels: meta.panels,
                      linkGroups: Object.values(meta.linkGroups),
                    });
                const clocks = reconcileSessionClocks(meta, existing, now, activePayloadChanged);
                return {
                  symbol: current!,
                  ...meta,
                  // RFC-011 Task 4 (folded audit fix): selectWorkspaceMetaSnapshot's
                  // `linkGroups` is linkGroupsFeature's runtime Record<string,
                  // LinkGroup> (state), but WorkspaceMeta.linkGroups is declared as
                  // an ARRAY (the local mirror of the wire/SessionPayloadV2 shape).
                  // Converting explicitly here keeps the Record out of IndexedDB.
                  linkGroups: Object.values(meta.linkGroups),
                  lastModified: now,
                  ...clocks,
                };
              })
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
        if (ws)
          actions.push(WorkspacesActions.workspaceRestored({ workspace: withLiftedDrawings(ws) }));
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
        await this.db.updateMeta(current, (existing) => {
          const now = Date.now();
          const clocks = reconcileSessionClocks(meta, existing, now, true);
          // RFC-011 Task 4 (folded audit fix): see persistMeta$'s comment — the
          // snapshot's linkGroups is a Record (runtime state); WorkspaceMeta
          // wants an array (wire-shape mirror).
          return {
            symbol: current,
            ...meta,
            linkGroups: Object.values(meta.linkGroups),
            lastModified: now,
            ...clocks,
          };
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
        workspace: withLiftedDrawings(applySelectedTfs(ws ?? emptyWorkspace(symbol))),
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
      // A `.session.json` restore can carry drawings from before ownership
      // existed (a legacy export with bare {id,kind,p1,p2} items), possibly
      // with no layout/panels of its own — in that case nothing below
      // dispatches restoreLayout, so the owner must be resolved against
      // whichever layout the workspaceRestored action above actually
      // installed for this symbol (the target workspace's own persisted
      // layout, or its single-panel migration default), never a layout
      // minted fresh for an unrelated context.
      const { layout: ownerLayout, panels: ownerPanels } =
        thenRestore.layout && thenRestore.panels
          ? { layout: thenRestore.layout, panels: thenRestore.panels }
          : resolveOwnerLayout(symbol, ws?.activeTf, ws?.layout, ws?.panels);
      // A restore's drawings can also carry owners from BEFORE this moment:
      // a modern `.session.json` export whose panel/group ids don't exist in
      // whatever layout ends up installed here (a different machine, a
      // cleared profile, a fresh workspace). Resolving a group owner needs to
      // know which groups this restore actually leaves installed: the ones
      // the restore itself carries (which, when present, overwrite
      // everything else once dispatched below), or — when it carries none,
      // as every real `.session.json` export does today — the target
      // workspace's own persisted groups, which is exactly what the
      // `workspaceRestored` action already dispatched above installs,
      // whether the target is the workspace already open or a different one
      // entirely.
      const resolvableGroupIds = new Set(
        (thenRestore.linkGroups ?? ws?.linkGroups ?? []).map((g) => g.id),
      );
      actions.push(
        DrawingsActions.restoreDrawings({
          drawings: liftLegacyDrawings(
            thenRestore.drawings,
            symbol,
            ownerLayout,
            ownerPanels,
            resolvableGroupIds,
          ),
        }),
      );
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
      // …opened on a TF it selected. Otherwise a workspace with no activeTf gets
      // layout.reducer's 'M1' fallback panel while the market activates the first
      // loaded TF, so an H1/D1-only session painted an empty M1 chart.
      // changeTimeframe writes the market AND the focused panel (the global-TF
      // proxy): the same step the `.session.json` restore (3r) lands its TF with.
      const openTf = openingTimeframe(restored.activeTf, action.selectedTfs);
      if (openTf) actions.push(MarketActions.changeTimeframe({ tf: openTf }));
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
