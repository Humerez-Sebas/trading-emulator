export interface LinkGroup {
  id: string;
  color: string;
  syncCrosshair: boolean;
  syncTimeRange: boolean;
  /** Composition channel: group members compose the same drawing ownership namespace (`group:<id>`). */
  syncDrawings: boolean;
  /** Composition channel: gates trade-overlay visibility across group members (visibility resolver, not a data channel). */
  syncTrades: boolean;
  /** (R3) RESERVED — accepted and stored, never read/applied by any RFC-010 code. */
  syncPriceScale?: boolean;
}

export interface LinkGroupsState {
  groups: Record<string, LinkGroup>;
}

export function createInitialLinkGroupsState(): LinkGroupsState {
  return { groups: {} };
}

/**
 * Wire/legacy shape of a hydrated link group: payloads and local records
 * created before the two composition flags existed carry every other field
 * but predate `syncDrawings`/`syncTrades`, so those two are optional here.
 */
export type LinkGroupWire = Omit<LinkGroup, 'syncDrawings' | 'syncTrades'> &
  Partial<Pick<LinkGroup, 'syncDrawings' | 'syncTrades'>>;

/**
 * Hydration normalization: a group missing the composition flags defaults to
 * `syncDrawings: false` (no prior schema ever shared drawings across a group)
 * and `syncTrades: true` (the trade overlay was always-visible before this
 * flag existed) — the behavior-preservation defaults for migrated data.
 * Groups that already carry explicit values pass through unchanged.
 */
export function normalizeLinkGroup(g: LinkGroupWire): LinkGroup {
  return {
    ...g,
    syncDrawings: g.syncDrawings ?? false,
    syncTrades: g.syncTrades ?? true,
  };
}

/** Pure factory for a freshly created group: new groups start fully composed on every channel. */
export function createLinkGroup(id: string, color: string): LinkGroup {
  return {
    id,
    color,
    syncCrosshair: true,
    syncTimeRange: true,
    syncDrawings: true,
    syncTrades: true,
  };
}
