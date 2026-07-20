/**
 * Conversation domain (EXPERIENCE_DOMAINS.md §3): ephemeral interaction state
 * that exists because the trader is currently asking. Derived, recomputable,
 * NEVER persisted (X-1 / TEDS INV-12): no effects, no storage adapter, no
 * payload field may ever reference this slice.
 */
import type { TradeAnchor } from '../../domain/chart/render-model';

export type { TradeAnchor, TradeAnchorKind } from '../../domain/chart/render-model';

export interface ConversationState {
  /** INV-11: exactly zero or one selected Trade Object per workspace. */
  selected: TradeAnchor | null;
  /** Pointer hover; null when the pointer is not over a Trade Object. */
  hovered: TradeAnchor | null;
}

export const initialConversationState: ConversationState = {
  selected: null,
  hovered: null,
};

/** Structural anchor equality — the no-op guard that keeps emissions referential. */
export function sameAnchor(a: TradeAnchor | null, b: TradeAnchor | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.tradeId === b.tradeId && a.kind === b.kind;
}
