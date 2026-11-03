import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { LinkGroupsActions } from '../../state/link-groups/link-groups.actions';
import { linkGroupsFeature } from '../../state/link-groups/link-groups.reducer';
import { createLinkGroup } from '../../state/link-groups/link-groups.models';
import { LayoutActions } from '../../state/layout/layout.actions';
import { layoutFeature } from '../../state/layout/layout.reducer';

/** RFC-013 (D6): fixed palette "Nuevo grupo" cycles through (LinkGroup has no `name` — groups are identified by color). */
export const LINK_GROUP_PALETTE = [
  '#2962FF',
  '#F23645',
  '#089981',
  '#FF9800',
  '#9C27B0',
  '#00BCD4',
];

/**
 * RFC-013 (D6): LinkGroups manager popover — lists existing groups (color
 * swatch + Crosshair/Rango toggles + delete) and creates new ones. Deleting a
 * group ALSO unlinks every panel currently assigned to it
 * (`LayoutActions.setPanelLinkGroup(null)`), because `removeGroup` itself
 * intentionally does NOT touch `PanelDescriptor.linkGroupId` (RFC-010: the
 * router tolerates dangling ids) — without this, panel chips would keep
 * showing a color for a group that no longer exists.
 */
@Component({
  selector: 'app-link-groups-menu',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="link-groups-menu">
      @for (group of groupsList(); track group.id) {
        <div class="group-row">
          <span class="group-swatch" [style.background-color]="group.color"></span>
          <label class="group-toggle">
            <input
              type="checkbox"
              class="sync-crosshair"
              [checked]="group.syncCrosshair"
              (change)="toggleCrosshair(group.id, group.syncCrosshair)"
            />
            Crosshair
          </label>
          <label class="group-toggle">
            <input
              type="checkbox"
              class="sync-time-range"
              [checked]="group.syncTimeRange"
              (change)="toggleTimeRange(group.id, group.syncTimeRange)"
            />
            Rango
          </label>
          <label class="group-toggle">
            <input
              type="checkbox"
              class="sync-drawings"
              [checked]="group.syncDrawings"
              (change)="toggleDrawings(group.id, group.syncDrawings)"
            />
            Dibujos
          </label>
          <button
            class="group-delete"
            [attr.aria-label]="'Eliminar grupo y sus dibujos compartidos'"
            [attr.title]="'Eliminar grupo y sus dibujos compartidos'"
            (click)="deleteGroup(group.id)"
          >
            &times;
          </button>
        </div>
      }
      <button class="link-groups-add" (click)="createGroup()">Nuevo grupo</button>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .link-groups-menu {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 200px;
        padding: 6px;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius);
      }
      .group-row {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        color: var(--text-muted);
      }
      .group-swatch {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .group-toggle {
        display: flex;
        align-items: center;
        gap: 3px;
        font-size: 11px;
        cursor: pointer;
      }
      .group-delete {
        margin-left: auto;
        background: none;
        border: none;
        color: var(--text-muted);
        cursor: pointer;
        font-size: 13px;
        line-height: 1;
        padding: 2px 4px;
      }
      .link-groups-add {
        margin-top: 4px;
        padding: 4px 8px;
        background: none;
        border: 1px dashed var(--border);
        border-radius: var(--radius);
        color: var(--text-muted);
        font-size: 11px;
        cursor: pointer;
      }
    `,
  ],
})
export class LinkGroupsMenuComponent {
  private readonly store = inject(Store);

  readonly groups = this.store.selectSignal(linkGroupsFeature.selectGroups);
  private readonly panels = this.store.selectSignal(layoutFeature.selectPanels);

  /** Template-facing list; `@for` cannot iterate the raw `Record<string, LinkGroup>` map. */
  readonly groupsList = computed(() => Object.values(this.groups()));

  /** RFC-013 (D6): first palette color not already used by an existing group; wraps around if all are used. */
  createGroup(): void {
    const usedColors = new Set(this.groupsList().map((g) => g.color));
    const color = LINK_GROUP_PALETTE.find((c) => !usedColors.has(c)) ?? LINK_GROUP_PALETTE[0];
    this.store.dispatch(
      LinkGroupsActions.createGroup({ group: createLinkGroup(crypto.randomUUID(), color) }),
    );
  }

  toggleCrosshair(groupId: string, current: boolean): void {
    this.store.dispatch(LinkGroupsActions.setSyncCrosshair({ groupId, enabled: !current }));
  }

  toggleTimeRange(groupId: string, current: boolean): void {
    this.store.dispatch(LinkGroupsActions.setSyncTimeRange({ groupId, enabled: !current }));
  }

  toggleDrawings(groupId: string, current: boolean): void {
    this.store.dispatch(LinkGroupsActions.setSyncDrawings({ groupId, enabled: !current }));
  }

  /** RFC-013 (D6): also unlinks every panel currently in this group — the UI must never show a chip for a deleted group. */
  deleteGroup(groupId: string): void {
    this.store.dispatch(LinkGroupsActions.removeGroup({ groupId }));
    const members = Object.values(this.panels()).filter((p) => p.linkGroupId === groupId);
    for (const panel of members) {
      this.store.dispatch(
        LayoutActions.setPanelLinkGroup({ panelId: panel.id, linkGroupId: null }),
      );
    }
  }
}
