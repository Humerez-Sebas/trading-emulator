import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { TradeAnchor } from './conversation.models';

export const ConversationActions = createActionGroup({
  source: 'Conversation',
  events: {
    'Trade Hovered': props<{ anchor: TradeAnchor }>(),
    'Trade Hover Cleared': emptyProps(),
    'Trade Selected': props<{ anchor: TradeAnchor }>(),
    'Selection Cleared': emptyProps(),
  },
});
