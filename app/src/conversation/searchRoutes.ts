// The search rows of the routing table: answering an offered
// alternative, asking where the search is, and asking to be guided.
// routing.ts places them in its order; the rows mean the same there.
import type { UnderstandAnswer } from '../relay';
import type { ConversationContext } from './types';
import type { Route } from './routing';
import { raiseQuestion } from './actions';
import { missLine } from './answers';
import { adoptAlternative, declineAlternative, raiseSearchBegin, resumeGuideShelf, saySearchingStatus } from './search';
import { raiseGuideGotIt, raiseGuideRestart } from '../guide/guideSay';
import { raiseConfirmEnd } from '../confirm/confirmSay';

type Guard = (args: { context: ConversationContext }) => boolean;

function answerOf(context: ConversationContext): UnderstandAnswer | null {
  return context.routeAnswer;
}

const alternativeYes: Guard = ({ context }) =>
  context.step === 'alternative' && answerOf(context)?.intent === 'confirm_yes' && context.alternative !== null;

const alternativeNo: Guard = ({ context }) =>
  context.step === 'alternative' && answerOf(context)?.intent === 'confirm_no';

const whereSearching: Guard = ({ context }) => answerOf(context)?.intent === 'where_is_it' && context.searching;

const keepLooking: Guard = ({ context }) =>
  answerOf(context)?.intent === 'keep_looking' && (context.pendingRequest ?? context.request) !== null;

const gotItGuide: Guard = ({ context }) => answerOf(context)?.intent === 'got_it' && context.guiding;

const gotItLost: Guard = ({ context }) => answerOf(context)?.intent === 'got_it';

const guideMeTarget: Guard = ({ context }) => answerOf(context)?.intent === 'guide_me' && context.guideTarget !== null;

const guideMeSearching: Guard = ({ context }) => answerOf(context)?.intent === 'guide_me' && context.searching;

const guideMeShelf: Guard = ({ context }) =>
  answerOf(context)?.intent === 'guide_me' && context.guideTarget === null && context.shelfTarget !== null;

const guideMeLost: Guard = ({ context }) => answerOf(context)?.intent === 'guide_me';

export const alternativeRoutes: Route[] = [
  { guard: alternativeYes, actions: [adoptAlternative, raiseSearchBegin], target: 'saying' },
  { guard: alternativeNo, actions: [declineAlternative], target: 'saying' },
];

export const lookRoutes: Route[] = [
  { guard: whereSearching, actions: [saySearchingStatus], target: 'saying' },
  { guard: keepLooking, actions: [saySearchingStatus, raiseSearchBegin], target: 'saying' },
  { guard: gotItGuide, actions: [raiseGuideGotIt, raiseQuestion], target: 'listening' },
  { guard: gotItLost, actions: [missLine], target: 'saying' },
  { guard: guideMeTarget, actions: [raiseGuideRestart, raiseSearchBegin, raiseConfirmEnd, raiseQuestion], target: 'listening' },
  { guard: guideMeSearching, actions: [saySearchingStatus], target: 'saying' },
  { guard: guideMeShelf, actions: [resumeGuideShelf, raiseGuideRestart, raiseSearchBegin, raiseConfirmEnd, raiseQuestion], target: 'listening' },
  { guard: guideMeLost, actions: [missLine], target: 'saying' },
];
