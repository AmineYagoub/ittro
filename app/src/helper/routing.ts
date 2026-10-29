// The helper rows of the routing table: pairing a helper by voice,
// asking with a photo, and cancelling the wait. Kept beside the
// helper region so the main table stays small.
import type { UnderstandAnswer } from '../relay';
import type { ConversationContext } from '../conversation/types';
import type { Route } from '../conversation/routing';
import { raiseConfirmEnd } from '../confirm/confirmSay';
import { raiseHelperEnd } from './helper';
import {
  askHelperName,
  cancelPair,
  cancelWait,
  dismissOffer,
  dismissSend,
  fireCancel,
  sayNoHelpers,
  sayNothingToAsk,
  sayNothingToCancel,
  sayUnknownHelper,
  setAsk,
  setAskFromOffer,
  stashHelperName,
} from './helperSay';

function answerOf(context: ConversationContext): UnderstandAnswer | null {
  return context.routeAnswer;
}

function namedKnown(context: ConversationContext): boolean {
  const wanted = (answerOf(context)?.helper_name ?? '').trim().toLowerCase();
  return wanted.length > 0 && context.helpers.some((helper) => helper.name.toLowerCase() === wanted);
}

function namedUnknown(context: ConversationContext): boolean {
  const wanted = (answerOf(context)?.helper_name ?? '').trim();
  return wanted.length > 0 && !namedKnown(context);
}

function askable(context: ConversationContext): boolean {
  return (context.pendingRequest ?? context.request ?? context.confirmLabel) !== '';
}

const addNamed = ({ context }: { context: ConversationContext }): boolean =>
  answerOf(context)?.intent === 'add_helper' && (answerOf(context)?.helper_name ?? '').trim().length > 0;

const addAnon = ({ context }: { context: ConversationContext }): boolean =>
  answerOf(context)?.intent === 'add_helper';

const nameGiven = ({ context }: { context: ConversationContext }): boolean => {
  const answer = answerOf(context);
  return (
    context.step === 'helperName' &&
    (answer?.intent === 'request_product' || answer?.intent === 'confirm_no') &&
    (answer?.product_text ?? '').trim().length > 0
  );
};

const askNothing = ({ context }: { context: ConversationContext }): boolean =>
  answerOf(context)?.intent === 'ask_someone' && !askable(context);

const askUnknown = ({ context }: { context: ConversationContext }): boolean =>
  answerOf(context)?.intent === 'ask_someone' && namedUnknown(context);

const askNone = ({ context }: { context: ConversationContext }): boolean =>
  answerOf(context)?.intent === 'ask_someone' &&
  (answerOf(context)?.helper_name ?? '').trim().length === 0 &&
  context.helpers.length === 0;

const askReady = ({ context }: { context: ConversationContext }): boolean =>
  answerOf(context)?.intent === 'ask_someone';

const sendYes = ({ context }: { context: ConversationContext }): boolean =>
  context.step === 'helperSend' && answerOf(context)?.intent === 'confirm_yes';

const sendNo = ({ context }: { context: ConversationContext }): boolean =>
  context.step === 'helperSend' && answerOf(context)?.intent === 'confirm_no';

const offerYes = ({ context }: { context: ConversationContext }): boolean =>
  context.step === 'helperOffer' && answerOf(context)?.intent === 'confirm_yes';

const offerNo = ({ context }: { context: ConversationContext }): boolean =>
  context.step === 'helperOffer' && answerOf(context)?.intent === 'confirm_no';

const cancelWaiting = ({ context }: { context: ConversationContext }): boolean =>
  answerOf(context)?.intent === 'cancel' && context.waiting !== null;

const cancelPairing = ({ context }: { context: ConversationContext }): boolean =>
  answerOf(context)?.intent === 'cancel' && context.pairing !== null;

const cancelIdle = ({ context }: { context: ConversationContext }): boolean =>
  answerOf(context)?.intent === 'cancel';

export const helperRoutes: Route[] = [
  { guard: addNamed, target: 'pairingHelper' },
  { guard: addAnon, actions: [askHelperName], target: 'saying' },
  { guard: nameGiven, actions: [stashHelperName], target: 'pairingHelper' },
  { guard: askNothing, actions: [sayNothingToAsk], target: 'saying' },
  { guard: askUnknown, actions: [sayUnknownHelper], target: 'saying' },
  { guard: askNone, actions: [sayNoHelpers], target: 'saying' },
  { guard: askReady, actions: [setAsk], target: 'saying' },
  { guard: sendYes, actions: [raiseConfirmEnd], target: 'sendingHelp' },
  { guard: sendNo, actions: [dismissSend], target: 'saying' },
  { guard: offerYes, actions: [setAskFromOffer, raiseConfirmEnd], target: 'saying' },
  { guard: offerNo, actions: [dismissOffer], target: 'saying' },
  { guard: cancelWaiting, actions: [fireCancel, cancelWait, raiseHelperEnd], target: 'saying' },
  { guard: cancelPairing, actions: [cancelPair, raiseHelperEnd], target: 'saying' },
  { guard: cancelIdle, actions: [sayNothingToCancel], target: 'saying' },
];
