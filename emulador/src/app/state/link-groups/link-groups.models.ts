export interface LinkGroup {
  id: string;
  color: string;
  syncCrosshair: boolean;
  syncTimeRange: boolean;
  /** (R3) RESERVED — accepted and stored, never read/applied by any RFC-010 code. */
  syncPriceScale?: boolean;
}

export interface LinkGroupsState {
  groups: Record<string, LinkGroup>;
}

export function createInitialLinkGroupsState(): LinkGroupsState {
  return { groups: {} };
}
