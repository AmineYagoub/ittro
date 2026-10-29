// The routing table: what one understood sentence does. Each row is a
// guard on the understood answer plus the assigns that follow it. The
// states own timing; this file owns meaning.
import type { Language } from '../theme';
import type { UnderstandAnswer } from '../relay';
import type { ConversationContext } from './types';
import { assignConversation as assign } from './actors';
import { raiseQuestion } from './actions';
import {
  acceptLanguage,
  acceptOffer,
  askOffer,
  changeRate,
  chimeWake,
  clearAsk,
  confirmRequestLine,
  declineOffer,
  declineSearch,
  freshAsk,
  incomingConfirm,
  missLine,
  noteCleared,
  noteLanguage,
  noteTourDone,
  noteVerbose,
  sayHelp,
  sayNotBuilt,
  sayRepeat,
  sayStopping,
  sayVerbose,
  switchKeepConfirm,
  switchPlain,
  tourOfferLines,
  wakeLines,
  welcomeAfterTour,
} from './answers';
import { switchCarry } from './translation';
import {
  adoptAlternative,
  declineAlternative,
  raiseSearchBegin,
  raiseSearchEnd,
  saySearchingStatus,
} from './search';
import { raiseGuideEnd, raiseGuideGotIt, raiseGuideRestart } from '../guide/guideSay';

type Guard = (args: { context: ConversationContext }) => boolean;

type Effect = (args: { context: ConversationContext }) => void;

interface Route {
  guard?: Guard;
  actions?: Array<ReturnType<typeof assign> | Effect>;
  target: string;
}

function answerOf(context: ConversationContext): UnderstandAnswer | null {
  return context.routeAnswer;
}

function validTarget(value: string | null): value is Language {
  return value === 'en' || value === 'ar' || value === 'fr';
}

function hasDetail(answer: UnderstandAnswer): boolean {
  return (answer.items !== null && answer.items.length > 1) || answer.product_text !== null;
}

const ignoreSleep: Guard = ({ context }) =>
  context.step === 'sleep' && answerOf(context)?.intent === 'ignore';

const ignoreAwake: Guard = ({ context }) =>
  context.step !== 'sleep' && answerOf(context)?.intent === 'ignore';

const flLangAccept: Guard = ({ context }) => {
  const answer = answerOf(context);
  return context.step === 'language' && answer?.intent === 'speak_language' && validTarget(answer.target_language);
};

const flLang: Guard = ({ context }) => context.step === 'language';

const flTourYes: Guard = ({ context }) =>
  context.step === 'tour' && answerOf(context)?.intent === 'confirm_yes';

const flTourNo: Guard = ({ context }) =>
  context.step === 'tour' && answerOf(context)?.intent === 'confirm_no';

const flTour: Guard = ({ context }) => context.step === 'tour';

const offerNeeded: Guard = ({ context }) => {
  const answer = answerOf(context);
  if (!answer || context.offered || (context.step !== 'welcome' && context.step !== 'confirm')) {
    return false;
  }
  if (answer.intent === 'speak_language' || answer.intent === 'not_understood') {
    return false;
  }
  return answer.language_spoken !== context.lang;
};

const offerYes: Guard = ({ context }) =>
  context.step === 'offer' && answerOf(context)?.intent === 'confirm_yes' && context.deferred !== null;

const offerNo: Guard = ({ context }) =>
  context.step === 'offer' && answerOf(context)?.intent === 'confirm_no';

const offerSwitch: Guard = ({ context }) => {
  const answer = answerOf(context);
  return context.step === 'offer' && answer?.intent === 'speak_language' && validTarget(answer.target_language);
};

const offerStep: Guard = ({ context }) => context.step === 'offer';

const incomingRequest: Guard = ({ context }) => {
  const answer = answerOf(context);
  return answer?.intent === 'request_product' && !!answer && hasDetail(answer);
};

const confirmDetail: Guard = ({ context }) => {
  const answer = answerOf(context);
  return context.step === 'confirm' && answer?.intent === 'confirm_no' && !!answer && hasDetail(answer);
};

const confirmYes: Guard = ({ context }) =>
  context.step === 'confirm' && answerOf(context)?.intent === 'confirm_yes' && context.pendingRequest !== null;

const confirmNo: Guard = ({ context }) =>
  context.step === 'confirm' && answerOf(context)?.intent === 'confirm_no';

const declineConfirmed: Guard = ({ context }) => {
  const answer = answerOf(context);
  return (
    context.step === 'welcome' &&
    context.pendingRequest === null &&
    context.request !== null &&
    answer?.intent === 'confirm_no' &&
    !!answer &&
    !hasDetail(answer)
  );
};

const correctConfirmed: Guard = ({ context }) => {
  const answer = answerOf(context);
  return (
    context.step === 'welcome' &&
    context.pendingRequest === null &&
    context.request !== null &&
    answer?.intent === 'confirm_no' &&
    !!answer &&
    hasDetail(answer)
  );
};

const confirmSwitch: Guard = ({ context }) => {
  const answer = answerOf(context);
  return context.step === 'confirm' && answer?.intent === 'speak_language' && validTarget(answer.target_language);
};

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

const guideMeLost: Guard = ({ context }) => answerOf(context)?.intent === 'guide_me';

const switchLangCarry: Guard = ({ context }) => {
  const answer = answerOf(context);
  return (
    answer?.intent === 'speak_language' &&
    !!answer &&
    validTarget(answer.target_language) &&
    (context.pendingRequest ?? context.request) !== null &&
    context.requestLang !== answer.target_language
  );
};

const sleepWake: Guard = ({ context }) =>
  context.step === 'sleep' && answerOf(context)?.intent === 'wake';

const sleepStep: Guard = ({ context }) => context.step === 'sleep';

const switchLang: Guard = ({ context }) => {
  const answer = answerOf(context);
  return answer?.intent === 'speak_language' && validTarget(answer.target_language);
};

const helpIntent: Guard = ({ context }) => answerOf(context)?.intent === 'help';

const repeatIntent: Guard = ({ context }) => {
  const intent = answerOf(context)?.intent;
  return intent === 'repeat' || intent === 'wake';
};

const stopIntent: Guard = ({ context }) => {
  const intent = answerOf(context)?.intent;
  return intent === 'stop' || intent === 'done';
};

const freshIntent: Guard = ({ context }) => {
  const intent = answerOf(context)?.intent;
  return intent === 'find_another' || intent === 'start_over';
};

const verboseIntent: Guard = ({ context }) => {
  const intent = answerOf(context)?.intent;
  return intent === 'shorter' || intent === 'more_detail';
};

const rateIntent: Guard = ({ context }) => {
  const intent = answerOf(context)?.intent;
  return intent === 'speak_faster' || intent === 'speak_slower';
};

const tourIntent: Guard = ({ context }) => answerOf(context)?.intent === 'sounds_tour';

const NOT_BUILT = [
  'is_this_right',
  'read_detail',
  'read_again',
  'next',
  'skip',
  'ask_someone',
  'add_helper',
  'cancel',
];

const notBuiltIntent: Guard = ({ context }) => NOT_BUILT.includes(answerOf(context)?.intent ?? '');


export const chainActions = { tourOfferLines, welcomeAfterTour, noteTourDone };

export const routingTransitions: Route[] = [
  { guard: ignoreSleep, target: 'sleeping' },
  { guard: ignoreAwake, actions: [raiseQuestion], target: 'listening' },
  { guard: flLangAccept, actions: [acceptLanguage, noteLanguage], target: 'sayingFlPrivacy' },
  { guard: flLang, actions: [missLine], target: 'sayingFlLang' },
  { guard: flTourYes, target: 'touringFl' },
  { guard: flTourNo, actions: [welcomeAfterTour, noteTourDone], target: 'saying' },
  { guard: flTour, actions: [missLine], target: 'sayingFlTourOffer' },
  { guard: offerNeeded, actions: [askOffer], target: 'saying' },
  { guard: offerYes, actions: [acceptOffer, noteLanguage], target: 'routing' },
  { guard: offerNo, actions: [declineOffer], target: 'sayingKeep' },
  { guard: offerSwitch, actions: [switchPlain, noteLanguage], target: 'saying' },
  { guard: offerStep, actions: [missLine], target: 'saying' },
  { guard: incomingRequest, actions: [incomingConfirm, raiseSearchBegin, raiseGuideEnd], target: 'saying' },
  { guard: confirmDetail, actions: [incomingConfirm, raiseSearchBegin, raiseGuideEnd], target: 'saying' },
  { guard: confirmYes, actions: [confirmRequestLine], target: 'saying' },
  { guard: confirmNo, actions: [clearAsk, raiseSearchEnd, raiseGuideEnd], target: 'saying' },
  { guard: correctConfirmed, actions: [incomingConfirm, raiseSearchBegin, raiseGuideEnd], target: 'saying' },
  { guard: declineConfirmed, actions: [declineSearch, noteCleared, raiseSearchEnd, raiseGuideEnd], target: 'saying' },
  { guard: alternativeYes, actions: [adoptAlternative, raiseSearchBegin], target: 'saying' },
  { guard: alternativeNo, actions: [declineAlternative], target: 'saying' },
  { guard: switchLangCarry, actions: [switchCarry, noteLanguage], target: 'translating' },
  { guard: confirmSwitch, actions: [switchKeepConfirm, noteLanguage], target: 'saying' },
  { guard: sleepWake, actions: [chimeWake, wakeLines], target: 'saying' },
  { guard: sleepStep, target: 'sleeping' },
  { guard: switchLang, actions: [switchPlain, noteLanguage], target: 'saying' },
  { guard: helpIntent, actions: [sayHelp], target: 'saying' },
  { guard: repeatIntent, actions: [sayRepeat], target: 'saying' },
  { guard: stopIntent, actions: [sayStopping, raiseSearchEnd, raiseGuideEnd], target: 'sayingSleep' },
  { guard: freshIntent, actions: [freshAsk, noteCleared, raiseSearchEnd, raiseGuideEnd], target: 'saying' },
  { guard: whereSearching, actions: [saySearchingStatus], target: 'saying' },
  { guard: keepLooking, actions: [saySearchingStatus, raiseSearchBegin], target: 'saying' },
  { guard: gotItGuide, actions: [raiseGuideGotIt, raiseQuestion], target: 'listening' },
  { guard: gotItLost, actions: [missLine], target: 'saying' },
  { guard: guideMeTarget, actions: [raiseGuideRestart, raiseQuestion], target: 'listening' },
  { guard: guideMeSearching, actions: [saySearchingStatus], target: 'saying' },
  { guard: guideMeLost, actions: [missLine], target: 'saying' },
  { guard: verboseIntent, actions: [sayVerbose, noteVerbose], target: 'saying' },
  { guard: rateIntent, actions: [changeRate], target: 'saying' },
  { guard: tourIntent, target: 'touring' },
  { guard: notBuiltIntent, actions: [sayNotBuilt], target: 'saying' },
  { actions: [missLine], target: 'saying' },
];
