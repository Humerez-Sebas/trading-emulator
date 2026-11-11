export interface LinkGroup {
  id: string;
  color: string;
  syncCrosshair: boolean;
  syncTimeRange: boolean;
  /** Composition channel (sole member, RFC-018 §5.1): group members compose the same drawing ownership namespace (`group:<id>`). */
  syncDrawings: boolean;
  /** (R3) RESERVED — accepted and stored, never read/applied by any code. */
  syncPriceScale?: boolean;
}

export interface LinkGroupsState {
  groups: Record<string, LinkGroup>;
}

export function createInitialLinkGroupsState(): LinkGroupsState {
  return { groups: {} };
}

/**
 * Wire/legacy shape of a hydrated link group. Payloads created before RFC-017
 * predate `syncDrawings`; payloads created between RFC-017 and RFC-018 additionally
 * carry `syncTrades`, retired by RFC-018 (D18.A). Both are tolerated on read and
 * neither is written back.
 */
export type LinkGroupWire = Omit<LinkGroup, 'syncDrawings'> &
  Partial<Pick<LinkGroup, 'syncDrawings'>> & {
    /** @deprecated RFC-018 D18.A — read-tolerated, never applied, never re-emitted. */
    syncTrades?: boolean;
  };

/**
 * Hydration normalization: a group missing `syncDrawings` defaults to `false`
 * (no pre-RFC-017 schema ever shared drawings across a group). Built field by
 * field — NOT by spread — so retired/unknown wire keys (`syncTrades`, RFC-018
 * D18.A) are dropped at the boundary and never re-enter a payload.
 */
export function normalizeLinkGroup(g: LinkGroupWire): LinkGroup {
  const normalized: LinkGroup = {
    id: g.id,
    color: g.color,
    syncCrosshair: g.syncCrosshair,
    syncTimeRange: g.syncTimeRange,
    syncDrawings: g.syncDrawings ?? false,
  };
  // `syncPriceScale` stays reserved: carried only when present, never defaulted.
  if (g.syncPriceScale !== undefined) normalized.syncPriceScale = g.syncPriceScale;
  return normalized;
}

/** Pure factory for a freshly created group: new groups start fully composed on every channel. */
export function createLinkGroup(id: string, color: string): LinkGroup {
  return {
    id,
    color,
    syncCrosshair: true,
    syncTimeRange: true,
    syncDrawings: true,
  };
}
