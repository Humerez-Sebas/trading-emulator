/**
 * RFC-009: session-scoped liveness registry of `ChartPanelComponent` instances.
 *
 * One `ChartRegistry` is provided per `WorkspaceViewport` (like `ChartSyncBus`)
 * — one registry per Session — via `useFactory`, outside the NgRx store, since
 * runtime instances (mapper handles) are not serializable state.
 *
 * Destruction path: a `removePanel` / `closeTab` state change drops the
 * panel's id from the derived template output, Angular's `@for (... track
 * pid)` removes the corresponding `<app-chart-panel>`, and the component's
 * own `ngOnDestroy` deregisters itself here. The registry never destroys
 * anything itself — it only OBSERVES liveness — and it is the source of
 * truth used by the lifecycle/leak test suite to assert that hiding a panel
 * (tab switch, cell-tab switch) never removes it, and that only the state
 * actions above ever do.
 */
export interface PanelChartHandle {
  /** Toggles update-gating on the panel's mapper (spied on by lifecycle tests). */
  setUpdatesEnabled(enabled: boolean): void;
}

export class ChartRegistry {
  private readonly handles = new Map<string, PanelChartHandle>();

  register(panelId: string, handle: PanelChartHandle): void {
    if (this.handles.has(panelId)) {
      throw new Error(`ChartRegistry: a handle for panelId "${panelId}" is already registered`);
    }
    this.handles.set(panelId, handle);
  }

  deregister(panelId: string): void {
    this.handles.delete(panelId);
  }

  get(panelId: string): PanelChartHandle | null {
    return this.handles.get(panelId) ?? null;
  }

  ids(): string[] {
    return [...this.handles.keys()];
  }

  count(): number {
    return this.handles.size;
  }
}
