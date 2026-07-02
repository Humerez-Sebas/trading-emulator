import { LogicalRange, MouseEventParams, Time } from 'lightweight-charts';
import { Observable, Subject } from 'rxjs';

/**
 * RFC-008: payloads of the per-panel interaction events forwarded to the bus.
 * Mirrors `ChartEventMap` minus `ChartClicked` (clicks are panel-local; only
 * crosshair and visible-range participate in cross-panel sync, RFC-010).
 */
export interface PanelSyncEventMap {
  CrosshairMoved: MouseEventParams<Time>;
  VisibleRangeChanged: LogicalRange | null;
}

export type PanelSyncEventType = keyof PanelSyncEventMap;

/** One multiplexed bus event: the source panel, the kind, and its payload. */
export type PanelSyncEvent = {
  [K in PanelSyncEventType]: { panelId: string; type: K; payload: PanelSyncEventMap[K] };
}[PanelSyncEventType];

/**
 * RFC-008 skeleton of the per-Session multiplexed event hub (one instance per
 * Session, provided by the WorkspaceViewport — NOT one per panel). Panels emit
 * their interaction events tagged with their `panelId`; the bus only exposes
 * them as a multiplexed observable. NO synchronization logic lives here yet:
 * routing by link group is RFC-010; nobody subscribes in RFC-008 except the
 * bus's own smoke tests.
 *
 * Framework-agnostic on purpose (domain layer): plain class + RxJS, provided
 * via `useFactory` — never decorated with `@Injectable`.
 */
export class ChartSyncBus {
  private readonly subject = new Subject<PanelSyncEvent>();

  /** Multiplexed stream of every panel's interaction events. */
  readonly events$: Observable<PanelSyncEvent> = this.subject.asObservable();

  emit<K extends PanelSyncEventType>(
    panelId: string,
    type: K,
    payload: PanelSyncEventMap[K],
  ): void {
    this.subject.next({ panelId, type, payload } as PanelSyncEvent);
  }

  destroy(): void {
    this.subject.complete();
  }
}
