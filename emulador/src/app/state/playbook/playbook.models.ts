export type PlaybookRuleStatus = 'active' | 'retired';

/** A trader-authored rule. `statement` is OPAQUE to the system (P-2). */
export interface PlaybookRule {
  id: string;
  title: string;
  statement: string;
  createdAt: number;
  status: PlaybookRuleStatus;
  /** Hotkey slot 1..9; null = none. Unique among ACTIVE rules. */
  shortcutSlot: number | null;
  sortOrder: number;
  /** RESERVED for RFC-016 (P-7): persisted empty, zero read sites. */
  amendments: string[];
  clientUpdatedAt?: number;
  syncedAt?: number;
}

export interface PlaybookState {
  rules: PlaybookRule[];
  loaded: boolean;
}
