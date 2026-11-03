// What one understood sentence does: the assigns behind the
// routing table. Guards choose the row; these do the work.
import { assignConversation as assign } from './actors';
import type { Language } from '../theme';
import type { UnderstandAnswer } from '../relay';
import { BACK_CHIP, HELP_CHIP, NO_CHIP, REPEAT_CHIP, STOP_CHIP, SWITCH_CHIP, YES_CHIP } from '../chips';
import {
  didntCatch,
  didntCatchHelp,
  doneLine,
  fasterAck,
  helpConfirm,
  helpEarbuds,
  helpSearching,
  helpWelcome,
  keepSpeaking,
  moreAck,
  notBuilt,
  offerLanguage,
  shorterAck,
  slowerAck,
  stopped,
  switchedTo,
  tourOffer,
  welcome,
  welcomeBack,
  whatToFind,
} from '../lines';
import { confirmList, confirmRequest, declinedRequest, lookingFor, searchingFor, welcomeBackLooking } from '../requestLines';
import { applyRate, mergeBrands, persistSnapshot, storeBrief, storeConfirmedBrand, storeFirstLaunchDone, storeLanguage } from './actors';
import { logIttro } from '../log';
import { spokenLang, switchedLines } from './translation';
import { playSound } from '../speech';
import type { ConversationContext } from './types';

type Effect = (args: { context: ConversationContext }) => void;

export function confirmLines(answer: UnderstandAnswer, lang: Language): { request: string; items: string[] | null; text: string } {
  if (answer.items && answer.items.length > 1) {
    return { request: answer.items.join(', '), items: answer.items, text: confirmList(answer.items, lang) };
  }
  const request = answer.product_text ?? '';
  return { request, items: null, text: confirmRequest(request, lang) };
}

export const acceptLanguage = assign({
  lang: ({ context }) => context.routeAnswer?.target_language as Language,
  step: 'welcome',
  pendingQuestion: null,
  pendingSay: ({ context }) => {
    const target = context.routeAnswer?.target_language as Language;
    return [{ text: switchedTo(target, context.lang), chips: [BACK_CHIP[context.lang]] }];
  },
});

export const welcomeAfterTour = assign({
  step: 'welcome',
  pendingQuestion: null,
  pendingSay: ({ context }) => [{ text: welcome[context.lang], chips: [HELP_CHIP[context.lang]] }],
});

export const noteTourDone: Effect = ({ context }) => storeFirstLaunchDone(context.lang);

export const wakeLines = assign({
  step: 'welcome',
  pendingQuestion: null,
  pendingSay: ({ context }) => [
    { text: context.request ? welcomeBackLooking(context.request, context.lang) : welcomeBack[context.lang], chips: [] },
  ],
});

export const tourOfferLines = assign({
  step: 'tour',
  pendingQuestion: 'tour_offer',
  pendingSay: ({ context }) => [{ text: tourOffer[context.lang], chips: [YES_CHIP[context.lang], NO_CHIP[context.lang]] }],
});

export const noteLanguage: Effect = ({ context }) => {
  const answer = context.routeAnswer;
  const target = answer?.target_language ?? answer?.language_spoken;
  if (target === 'en' || target === 'ar' || target === 'fr') {
    storeLanguage(target);
  }
};

export const missLine = assign({
  pendingSay: ({ context }) => [{ text: context.misses >= 2 ? didntCatchHelp[context.lang] : didntCatch[context.lang], chips: [] }],
});

export const acceptOffer = assign({
  lang: ({ context }) => (context.deferred?.language_spoken ?? context.lang) as Language,
  step: ({ context }) => context.offerReturn,
  pendingQuestion: ({ context }) => (context.offerReturn === 'confirm' ? 'confirm_request' : null),
  offerTarget: null,
  routeAnswer: ({ context }) => context.deferred,
  deferred: null,
});

export const declineOffer = assign({
  step: ({ context }) => context.offerReturn,
  pendingQuestion: ({ context }) => (context.offerReturn === 'confirm' ? 'confirm_request' : null),
  offerTarget: null,
  routeAnswer: ({ context }) => context.deferred,
  deferred: null,
  translateSource: ({ context }) => context.deferred?.product_text ?? null,
  translateItems: ({ context }) => context.deferred?.items ?? null,
  translatePending: true,
  translateNext: 'routing',
  pendingSay: ({ context }) => [{ text: keepSpeaking[context.lang], chips: [] }],
});

export const askOffer = assign({
  step: 'offer',
  pendingQuestion: 'language_offer',
  offerReturn: ({ context }) => (context.step === 'confirm' ? 'confirm' : 'welcome'),
  offerTarget: ({ context }) => context.routeAnswer?.language_spoken as Language,
  deferred: ({ context }) => context.routeAnswer,
  offered: true,
  pendingSay: ({ context }) => {
    const target = (context.routeAnswer?.language_spoken ?? 'en') as Language;
    return [{ text: offerLanguage(target), chips: [YES_CHIP[target], NO_CHIP[target]] }];
  },
});

export const incomingConfirm = assign({
  step: 'confirm',
  pendingQuestion: 'confirm_request',
  alternative: null,
  pendingRequest: ({ context }) => confirmLines(context.routeAnswer as UnderstandAnswer, context.lang).request,
  pendingItems: ({ context }) => confirmLines(context.routeAnswer as UnderstandAnswer, context.lang).items,
  requestLang: ({ context }) => spokenLang(context.routeAnswer, context.lang),
  pendingSay: ({ context }) => [
    { text: confirmLines(context.routeAnswer as UnderstandAnswer, context.lang).text, chips: [YES_CHIP[context.lang], NO_CHIP[context.lang]] },
  ],
});

export const startRequest = assign({
  step: 'welcome',
  pendingQuestion: null,
  alternative: null,
  pendingRequest: null,
  pendingItems: null,
  requestLang: ({ context }) => spokenLang(context.routeAnswer, context.lang),
  request: ({ context }) => {
    const product = context.routeAnswer?.product_text ?? '';
    persistSnapshot(product);
    return product;
  },
  brands: ({ context }) => {
    const product = context.routeAnswer?.product_text ?? '';
    storeConfirmedBrand(product);
    return mergeBrands(context.brands, product);
  },
  pendingSay: ({ context }) => [{ text: lookingFor(context.routeAnswer?.product_text ?? '', context.lang), chips: [] }],
});

export const logRequestStarted: Effect = ({ context }) => {
  logIttro(`search request started ${JSON.stringify(context.request)} without a confirm turn`);
};

export const confirmRequestLine = assign({
  request: ({ context }) => {
    persistSnapshot(context.pendingRequest);
    return context.pendingRequest;
  },
  brands: ({ context }) => {
    storeConfirmedBrand(context.pendingRequest);
    return mergeBrands(context.brands, context.pendingRequest);
  },
  pendingRequest: null,
  pendingItems: null,
  step: 'welcome',
  pendingQuestion: null,
  pendingSay: ({ context }) =>
    context.shelfTarget ?? context.guideTarget
      ? []
      : [{ text: searchingFor(context.pendingRequest ?? '', context.lang), chips: [] }],
});

export const logRequestConfirmed: Effect = ({ context }) => {
  const target = context.shelfTarget ?? context.guideTarget ? 'target known' : 'target pending';
  logIttro(`search request confirmed ${JSON.stringify(context.pendingRequest)} ${target}`);
};

export const clearAsk = assign({
  pendingRequest: null,
  pendingItems: null,
  step: 'welcome',
  pendingQuestion: null,
  pendingSay: ({ context }) => [{ text: declinedRequest(context.request, context.lang), chips: [] }],
});

export const declineSearch = assign({
  request: null,
  requestLang: null,
  pendingRequest: null,
  pendingItems: null,
  step: 'welcome',
  pendingQuestion: null,
  pendingSay: ({ context }) => [{ text: declinedRequest(null, context.lang), chips: [] }],
});


export const switchKeepConfirm = assign({
  lang: ({ context }) => context.routeAnswer?.target_language as Language,
  pendingSay: ({ context }) => {
    const target = context.routeAnswer?.target_language as Language;
    const lines = [switchedLines(target, context.lang)];
    if (context.pendingRequest) {
      const text = context.pendingItems
        ? confirmList(context.pendingItems, target)
        : confirmRequest(context.pendingRequest, target);
      lines.push({ text, chips: [YES_CHIP[target], NO_CHIP[target]] });
    }
    return lines;
  },
});

export const switchPlain = assign({
  lang: ({ context }) => context.routeAnswer?.target_language as Language,
  pendingSay: ({ context }) => {
    const target = context.routeAnswer?.target_language as Language;
    return [switchedLines(target, context.lang)];
  },
});


export const sayHelp = assign({
  pendingSay: ({ context }) => {
    const lang = context.lang;
    const suffix = context.earbuds ? ` ${helpEarbuds[lang]}` : '';
    if (context.step === 'confirm' || context.step === 'offer') {
      return [{ text: `${helpConfirm[lang]}${suffix}`, chips: [YES_CHIP[lang], NO_CHIP[lang], REPEAT_CHIP[lang], STOP_CHIP[lang]] }];
    }
    if (context.request) {
      return [{ text: `${helpSearching[lang]}${suffix}`, chips: [REPEAT_CHIP[lang], SWITCH_CHIP[lang], STOP_CHIP[lang]] }];
    }
    return [{ text: `${helpWelcome[lang]}${suffix}`, chips: [REPEAT_CHIP[lang], SWITCH_CHIP[lang], STOP_CHIP[lang]] }];
  },
});

export const sayRepeat = assign({
  pendingSay: ({ context }) => [{ text: context.lastLine, chips: context.lastChips }],
});

export const sayStopping = assign({
  step: 'sleep',
  pendingQuestion: null,
  pendingSay: ({ context }) => [
    { text: context.routeAnswer?.intent === 'stop' ? stopped[context.lang] : doneLine[context.lang], chips: [] },
  ],
});

export const freshAsk = assign({
  request: null,
  requestLang: null,
  pendingRequest: null,
  pendingItems: null,
  step: 'welcome',
  pendingQuestion: null,
  pendingSay: ({ context }) => [{ text: whatToFind[context.lang], chips: [] }],
});

export const noteCleared: Effect = () => persistSnapshot(null);

export const sayVerbose = assign({
  pendingSay: ({ context }) => [
    { text: context.routeAnswer?.intent === 'shorter' ? shorterAck[context.lang] : moreAck[context.lang], chips: [] },
  ],
});

export const noteVerbose: Effect = ({ context }) => storeBrief(context.routeAnswer?.intent === 'shorter');

export const changeRate = assign({
  rate: ({ context }) => {
    const next = context.routeAnswer?.intent === 'speak_faster' ? context.rate + 0.25 : context.rate - 0.25;
    const clamped = Math.min(2, Math.max(0.5, next));
    applyRate(clamped);
    return clamped;
  },
  pendingSay: ({ context }) => [
    { text: context.routeAnswer?.intent === 'speak_faster' ? fasterAck[context.lang] : slowerAck[context.lang], chips: [] },
  ],
});

export const sayNotBuilt = assign({
  pendingSay: ({ context }) => [{ text: notBuilt[context.lang], chips: [HELP_CHIP[context.lang]] }],
});

export const chimeWake: Effect = () => playSound('waking');
