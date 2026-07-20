import { createFeature, createReducer, on } from '@ngrx/store';
import { ConversationActions } from './conversation.actions';
import { ConversationState, initialConversationState, sameAnchor } from './conversation.models';
import { WorkspacesActions } from '../workspaces/workspaces.actions';

export const conversationFeature = createFeature({
  name: 'conversation',
  reducer: createReducer(
    initialConversationState,
    on(ConversationActions.tradeHovered, (state, { anchor }): ConversationState =>
      sameAnchor(state.hovered, anchor) ? state : { ...state, hovered: anchor },
    ),
    on(ConversationActions.tradeHoverCleared, (state): ConversationState =>
      state.hovered === null ? state : { ...state, hovered: null },
    ),
    on(ConversationActions.tradeSelected, (state, { anchor }): ConversationState =>
      sameAnchor(state.selected, anchor) ? state : { ...state, selected: anchor },
    ),
    on(ConversationActions.selectionCleared, (state): ConversationState =>
      state.selected === null ? state : { ...state, selected: null },
    ),
    // Ephemeral by definition: a workspace switch/reload ends every conversation.
    on(WorkspacesActions.workspaceRestored, (): ConversationState => initialConversationState),
  ),
});
