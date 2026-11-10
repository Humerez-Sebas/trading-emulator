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
  /** Lesson ids amending this rule (P-7): written by `amendRule`/`unamendRule` (RFC-016); no production reader yet. */
  amendments: string[];
  clientUpdatedAt?: number;
  syncedAt?: number;
}

export interface PlaybookState {
  rules: PlaybookRule[];
  loaded: boolean;
}
