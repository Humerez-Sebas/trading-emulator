import { conversationFeature } from './conversation.reducer';
import { ConversationActions } from './conversation.actions';
import { initialConversationState, TradeAnchor } from './conversation.models';
import { WorkspacesActions } from '../workspaces/workspaces.actions';

const reducer = conversationFeature.reducer;
const anchorA: TradeAnchor = { tradeId: 'a', kind: 'stem' };
const anchorB: TradeAnchor = { tradeId: 'b', kind: 'filament' };

describe('conversation.reducer', () => {
  it('hover sets the hovered anchor', () => {
    const s = reducer(
      initialConversationState,
      ConversationActions.tradeHovered({ anchor: anchorA }),
    );
    expect(s.hovered).toEqual(anchorA);
    expect(s.selected).toBeNull();
  });

  it('hover with the identical anchor is a referential no-op (referential-stability discipline)', () => {
    const s1 = reducer(
      initialConversationState,
      ConversationActions.tradeHovered({ anchor: anchorA }),
    );
    const s2 = reducer(s1, ConversationActions.tradeHovered({ anchor: { ...anchorA } }));
    expect(s2).toBe(s1);
  });

  it('hover cleared nulls the anchor and is a no-op when already null', () => {
    const s1 = reducer(
      initialConversationState,
      ConversationActions.tradeHovered({ anchor: anchorA }),
    );
    const s2 = reducer(s1, ConversationActions.tradeHoverCleared());
    expect(s2.hovered).toBeNull();
    expect(reducer(s2, ConversationActions.tradeHoverCleared())).toBe(s2);
  });

  it('INV-11: selecting B while A is selected REPLACES A — cardinality one, structurally', () => {
    const s1 = reducer(
      initialConversationState,
      ConversationActions.tradeSelected({ anchor: anchorA }),
    );
    const s2 = reducer(s1, ConversationActions.tradeSelected({ anchor: anchorB }));
    expect(s2.selected).toEqual(anchorB);
    expect(Object.keys(s2)).toEqual(['selected', 'hovered']); // there is no slot for a second selection
  });

  it('selecting the already-selected anchor is a referential no-op', () => {
    const s1 = reducer(
      initialConversationState,
      ConversationActions.tradeSelected({ anchor: anchorA }),
    );
    expect(reducer(s1, ConversationActions.tradeSelected({ anchor: { ...anchorA } }))).toBe(s1);
  });

  it('selection cleared nulls and is a no-op when already null', () => {
    const s1 = reducer(
      initialConversationState,
      ConversationActions.tradeSelected({ anchor: anchorA }),
    );
    const s2 = reducer(s1, ConversationActions.selectionCleared());
    expect(s2.selected).toBeNull();
    expect(reducer(s2, ConversationActions.selectionCleared())).toBe(s2);
  });

  it('INV-12 guard: the feature state shape is exactly the two ephemeral fields (no persistence creep)', () => {
    expect(Object.keys(initialConversationState).sort()).toEqual(['hovered', 'selected']);
    for (const key of Object.keys(initialConversationState)) {
      expect(['hovered', 'selected']).toContain(key);
    }
  });

  it('workspace restore resets the whole conversation (ephemeral; never survives a reload)', () => {
    const s1 = reducer(
      initialConversationState,
      ConversationActions.tradeSelected({ anchor: anchorA }),
    );
    const restored = reducer(s1, WorkspacesActions.workspaceRestored({ workspace: null as never }));
    expect(restored).toEqual(initialConversationState);
  });
});
