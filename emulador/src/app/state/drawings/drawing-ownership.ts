import { PanelDescriptor } from '../layout/layout.models';
import { LinkGroup } from '../link-groups/link-groups.models';
import { DrawingOwner } from './drawings.models';

/** Stable string key for an owner, usable as a map/index key. */
export function ownerKeyOf(owner: DrawingOwner): string {
  return `${owner.type}:${owner.id}`;
}

/**
 * The single rule every drawing-creation path uses to decide where a new
 * drawing lands: the panel's own link group, iff that group exists and has
 * drawing composition enabled; the panel itself otherwise. A link pointing at
 * a group that no longer exists falls back to the panel rather than throwing.
 */
export function resolveDrawingTarget(
  panel: PanelDescriptor,
  groups: Record<string, LinkGroup>,
): DrawingOwner {
  if (panel.linkGroupId != null) {
    const group = groups[panel.linkGroupId];
    if (group && group.syncDrawings) {
      return { type: 'group', id: panel.linkGroupId };
    }
  }
  return { type: 'panel', id: panel.id };
}
