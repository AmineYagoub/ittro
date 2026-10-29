// The confirm rows of the routing table: checking the held
// product, reading it again and reading one detail word for word.
// Kept beside the confirm region so the main table stays small.
import type { UnderstandAnswer } from '../relay';
import type { ConversationContext } from '../conversation/types';
import { raiseQuestion } from '../conversation/actions';
import { missLine } from '../conversation/answers';
import type { Route } from '../conversation/routing';
import { raiseConfirmBegin, raiseConfirmDetailAsk, setDetailKind } from './confirmSay';

function answerOf(context: ConversationContext): UnderstandAnswer | null {
  return context.routeAnswer;
}

function wantedOf(context: ConversationContext): string | null {
  return context.pendingRequest ?? context.request;
}

function validDetail(value: string | null): boolean {
  return value === 'date' || value === 'size' || value === 'price' || value === 'ingredients';
}

const checkInHand = ({ context }: { context: ConversationContext }): boolean =>
  answerOf(context)?.intent === 'is_this_right' && wantedOf(context) !== null;

const rereadInHand = ({ context }: { context: ConversationContext }): boolean =>
  answerOf(context)?.intent === 'read_again' && wantedOf(context) !== null;

const detailInHand = ({ context }: { context: ConversationContext }): boolean => {
  const answer = answerOf(context);
  return answer?.intent === 'read_detail' && wantedOf(context) !== null && !!answer && validDetail(answer.detail);
};

const checkLost = ({ context }: { context: ConversationContext }): boolean => {
  const intent = answerOf(context)?.intent;
  return intent === 'is_this_right' || intent === 'read_again';
};

const detailLost = ({ context }: { context: ConversationContext }): boolean =>
  answerOf(context)?.intent === 'read_detail';

export const confirmRoutes: Route[] = [
  { guard: checkInHand, actions: [raiseConfirmBegin, raiseQuestion], target: 'listening' },
  { guard: rereadInHand, actions: [raiseConfirmBegin, raiseQuestion], target: 'listening' },
  { guard: detailInHand, actions: [setDetailKind, raiseConfirmDetailAsk, raiseQuestion], target: 'listening' },
  { guard: checkLost, actions: [missLine], target: 'saying' },
  { guard: detailLost, actions: [missLine], target: 'saying' },
];
