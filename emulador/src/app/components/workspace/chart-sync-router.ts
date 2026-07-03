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
 * Feedback-loop prevention (RFC-010 point 6): (1) events are only ever routed
 * to panels OTHER than the origin (`panelId !== originId` filter below); (2)
 * idempotent apply — the last value applied to each (panelId, eventType) pair
 * is tracked, and a structurally-identical incoming value is a no-op, so even
 * a 3+-panel topology where a receiving panel's handle might otherwise
 * re-trigger a downstream apply cannot cascade.
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
    const last = this.lastApplied.get(key);
    if (last !== undefined && JSON.stringify(last) === JSON.stringify(payload)) return; // idempotent short-circuit
    this.lastApplied.set(key, payload);
    const handle = this.registry.get(panelId);
    if (!handle) return;
    if (type === 'CrosshairMoved') {
      const p = payload as PanelSyncEventMap['CrosshairMoved'];
      // `lightweight-charts`' `Time` is `UTCTimestamp | BusinessDay | string`; this codebase's
      // chart is UTCTimestamp-only (`timeVisible: true`, no business-day mode anywhere in
      // chart.component.ts/chart-engine.ts), so a plain `Number(...)` cast is safe HERE and
      // matches the same assumption `chart.component.ts` already makes throughout. If a future
      // RFC introduces business-day mode, this cast must be revisited together with the rest of
      // the chart's Time handling — it is not a new assumption introduced by this router.
      handle.applyCrosshair(p.time != null ? Number(p.time) : null);
    } else {
      handle.applyVisibleRange(payload as PanelSyncEventMap['VisibleRangeChanged']);
    }
  }

  destroy(): void {
    this.sub.unsubscribe();
  }
}
