import { Subscription } from 'rxjs';
import { PanelSyncEvent, PanelSyncEventMap, PanelSyncEventType, ChartSyncBus } from '../../domain/chart/chart-sync-bus';
import { PanelDescriptor } from '../../state/layout/layout.models';
import { LinkGroup } from '../../state/link-groups/link-groups.models';
import { ChartRegistry } from './chart-registry.service';

export interface ChartSyncRouterState {
  panels: Record<string, PanelDescriptor>;
  linkGroups: Record<string, LinkGroup>;
}

/** Which LinkGroup flag gates each event type. */
const GATE: Record<PanelSyncEventType, keyof LinkGroup> = {
  CrosshairMoved: 'syncCrosshair',
  VisibleRangeChanged: 'syncTimeRange',
};

/**
 * RFC-010: session-scoped fan-out router. Plain class (no Angular/NgRx import,
 * mirrors ChartSyncBus/ChartRegistry) provided per-Session via `useFactory` by
 * WorkspaceViewport. Cannot inject the Store: the viewport pushes state
 * snapshots via `setState` whenever `panels`/`linkGroups` change.
 *
 * Feedback-loop prevention (RFC-010 point 6) is TWO independent mechanisms:
 * (1) events are only ever routed to panels OTHER than the origin
 * (`panelId !== originId` filter below); (2) idempotent apply — the last
 * APPLIED value (not the raw payload) for each (panelId, eventType) pair is
 * tracked, and a value that resolves to the same applied result as last time
 * is a no-op. Neither mechanism alone closes the RFC's named A->B->A echo: the
 * echo's originator (A) is never itself an apply target (it's excluded by
 * mechanism 1, so idempotence never even runs for it), which means the
 * load-bearing loop-breaker for that specific echo lives in `ChartEngine`
 * (RFC-010 Task 3, fix loop). For CROSSHAIR, that guard is the private
 * `applyingSync` re-entrancy flag: lightweight-charts' `setCrosshairPosition`
 * passes `skipEvent=true` internally, so a programmatic crosshair apply never
 * even invokes `subscribeCrosshairMove`, and `applyingSync` is defense in
 * depth. For RANGE, `applyingSync` is NOT sufficient on its own: verified
 * against lightweight-charts v5.2 source, `setVisibleLogicalRange` fires
 * `subscribeVisibleLogicalRangeChange` on the NEXT animation frame (via
 * `requestAnimationFrame`), by which point the synchronous `applyingSync`
 * flag has already reset. The actual load-bearing mechanism for range is
 * `ChartEngine`'s one-shot `suppressNextRangeEvent` flag, which survives
 * across that RAF and consumes exactly the first range-changed callback after
 * a programmatic apply — value-independently, since the library can return a
 * fractionally adjusted {from,to} (clamping/rounding) rather than an exact
 * echo. Either way, a panel that receives and applies a sync event cannot
 * re-emit as a reaction to that application. This router's idempotence check
 * is the second, independent safety net for 3+-panel topologies (see Task 2's
 * tests), not a substitute for the engine-level guard.
 */
export class ChartSyncRouter {
  private state: ChartSyncRouterState = { panels: {}, linkGroups: {} };
  private readonly lastApplied = new Map<string, unknown>();
  private readonly sub: Subscription;

  constructor(
    private readonly bus: ChartSyncBus,
    private readonly registry: ChartRegistry,
  ) {
    this.sub = this.bus.events$.subscribe((event) => this.route(event));
  }

  setState(state: ChartSyncRouterState): void {
    this.state = state;
  }

  private route(event: PanelSyncEvent): void {
    const origin = this.state.panels[event.panelId];
    if (!origin?.linkGroupId) return; // unlinked panels never originate routing
    const group = this.state.linkGroups[origin.linkGroupId];
    if (!group?.[GATE[event.type]]) return; // group missing or flag off

    for (const siblingId of this.registry.ids()) {
      if (siblingId === event.panelId) continue; // never back to the origin
      const sibling = this.state.panels[siblingId];
      if (sibling?.linkGroupId !== origin.linkGroupId) continue; // same group only
      this.applyIfChanged(siblingId, event.type, event.payload);
    }
  }

  private applyIfChanged<K extends PanelSyncEventType>(
    panelId: string,
    type: K,
    payload: PanelSyncEventMap[K],
  ): void {
    const key = `${panelId}:${type}`;
    if (type === 'CrosshairMoved') {
      const p = payload as PanelSyncEventMap['CrosshairMoved'];
      // `lightweight-charts`' `Time` is `UTCTimestamp | BusinessDay | string`; this codebase's
      // chart is UTCTimestamp-only (`timeVisible: true`, no business-day mode anywhere in
      // chart.component.ts/chart-engine.ts), so a plain `Number(...)` cast is safe HERE and
      // matches the same assumption `chart.component.ts` already makes throughout. If a future
      // RFC introduces business-day mode, this cast must be revisited together with the rest of
      // the chart's Time handling — it is not a new assumption introduced by this router.
      const appliedTime = p.time != null ? Number(p.time) : null;
      // Idempotence is keyed on the APPLIED value (the resolved timestamp), not the raw
      // MouseEventParams payload: `point.{x,y}` differs on every mouse move even when `time`
      // (the only part that is actually applied) is unchanged, which would otherwise make this
      // short-circuit permanently inert for CrosshairMoved.
      const last = this.lastApplied.get(key);
      if (last !== undefined && last === appliedTime) return; // idempotent short-circuit
      this.lastApplied.set(key, appliedTime);
      const handle = this.registry.get(panelId);
      if (!handle) return;
      handle.applyCrosshair(appliedTime);
    } else {
      const range = payload as PanelSyncEventMap['VisibleRangeChanged'];
      const appliedRange = range ? { from: range.from, to: range.to } : null;
      const last = this.lastApplied.get(key) as { from: number; to: number } | null | undefined;
      const unchanged =
        last !== undefined &&
        ((last === null && appliedRange === null) ||
          (last !== null &&
            appliedRange !== null &&
            last.from === appliedRange.from &&
            last.to === appliedRange.to));
      if (unchanged) return; // idempotent short-circuit
      this.lastApplied.set(key, appliedRange);
      const handle = this.registry.get(panelId);
      if (!handle) return;
      handle.applyVisibleRange(range);
    }
  }

  destroy(): void {
    this.sub.unsubscribe();
  }
}
