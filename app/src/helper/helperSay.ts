// What one helper sentence does: the assigns behind the helper
// rows of the routing table, plus the pairing and sending outcomes.
// Guards choose the row; these do the work.
import { assignConversation as assign } from '../conversation/actors';
import type { ContextArgs, EventArgs } from '../conversation/actions';
import { loadPrefs, savePrefs } from '../store';
import { cancelHelper, relayConfig } from '../relay';
import { CANCEL_CHIP, NO_CHIP, YES_CHIP } from '../chips';
import { stamp } from '../stamp';
import type { ConversationContext } from '../conversation/types';
import type { UnderstandAnswer } from '../relay';
import {
  askConfirmLine,
  askNameLine,
  askQuestionLine,
  cancelledPairLine,
  cancelledWaitingLine,
  helpersWord,
  noHelpersLine,
  nothingToAskLine,
  nothingToCancelLine,
  okayLine,
  pairFailedLine,
  pairLine,
  sendFailedLine,
  sendNoLine,
  sentLine,
  unknownHelperLine,
} from './lines';
import type { PairHelperOutput, SendHelpOutput } from './actors';

type Effect = (args: { context: ConversationContext }) => void;

function relayHost(): string {
  return relayConfig().url.replace(/^https?:\/\//, '');
}

function askRequest(context: ConversationContext): string {
  return context.pendingRequest ?? context.request ?? context.confirmLabel;
}

function namedToken(context: ConversationContext): string | null {
  const wanted = (context.routeAnswer?.helper_name ?? '').trim().toLowerCase();
  return context.helpers.find((helper) => helper.name.toLowerCase() === wanted)?.token ?? null;
}

function targetWord(context: ConversationContext): string {
  const wanted = context.routeAnswer?.helper_name;
  if (wanted) {
    const known = context.helpers.find((helper) => helper.name.toLowerCase() === wanted.trim().toLowerCase());
    return known?.name ?? wanted;
  }
  return helpersWord(context.lang);
}

export const askHelperName = assign({
  step: 'helperName',
  pendingQuestion: 'helper_name',
  pendingSay: ({ context }: ContextArgs) => [{ text: askNameLine[context.lang], chips: [] }],
});

export const stashHelperName = assign({
  routeAnswer: ({ context }: ContextArgs) => ({
    ...(context.routeAnswer as UnderstandAnswer),
    helper_name: (context.routeAnswer?.product_text ?? '').trim(),
  }),
});

export const setAsk = assign({
  step: 'helperSend',
  pendingQuestion: 'helper_send',
  askTarget: ({ context }: ContextArgs) => {
    const token = namedToken(context);
    return token ? [token] : null;
  },
  askQuestion: ({ context }: ContextArgs) => askQuestionLine(askRequest(context), context.lang),
  pendingSay: ({ context }: ContextArgs) => [
    {
      text: askConfirmLine(targetWord(context), askQuestionLine(askRequest(context), context.lang), context.lang),
      chips: [YES_CHIP[context.lang], NO_CHIP[context.lang]],
    },
  ],
});

export const setAskFromOffer = assign({
  step: 'helperSend',
  pendingQuestion: 'helper_send',
  askTarget: ({ context }: ContextArgs) => (context.helpers[0] ? [context.helpers[0].token] : null),
  askQuestion: ({ context }: ContextArgs) => askQuestionLine(askRequest(context), context.lang),
  routeAnswer: ({ context }: ContextArgs) => ({
    ...(context.routeAnswer as UnderstandAnswer),
    helper_name: context.helpers[0]?.name ?? null,
  }),
  pendingSay: ({ context }: ContextArgs) => [
    {
      text: askConfirmLine(context.helpers[0]?.name ?? helpersWord(context.lang), askQuestionLine(askRequest(context), context.lang), context.lang),
      chips: [YES_CHIP[context.lang], NO_CHIP[context.lang]],
    },
  ],
});

export const dismissSend = assign({
  step: 'welcome',
  pendingQuestion: null,
  askTarget: null,
  askQuestion: '',
  pendingSay: ({ context }: ContextArgs) => [{ text: sendNoLine[context.lang], chips: [] }],
});

export const dismissOffer = assign({
  step: 'welcome',
  pendingQuestion: null,
  pendingSay: ({ context }: ContextArgs) => [{ text: okayLine[context.lang], chips: [] }],
});

export const sayNothingToAsk = assign({
  pendingSay: ({ context }: ContextArgs) => [{ text: nothingToAskLine[context.lang], chips: [] }],
});

export const sayUnknownHelper = assign({
  pendingSay: ({ context }: ContextArgs) => [
    { text: unknownHelperLine(context.routeAnswer?.helper_name ?? '', context.lang), chips: [] },
  ],
});

export const sayNoHelpers = assign({
  pendingSay: ({ context }: ContextArgs) => [{ text: noHelpersLine[context.lang], chips: [] }],
});

export const sayNothingToCancel = assign({
  pendingSay: ({ context }: ContextArgs) => [{ text: nothingToCancelLine[context.lang], chips: [] }],
});

export const storePairing = assign({
  pairing: ({ event }: EventArgs) =>
    'output' in event
      ? {
          name: (event.output as PairHelperOutput).name,
          code: (event.output as PairHelperOutput).code,
          expiresAt: (event.output as PairHelperOutput).expiresAt,
        }
      : null,
  helperVerdict: null,
  helperAnswer: null,
  helperLabel: '',
  step: 'welcome',
  pendingQuestion: null,
  pendingSay: ({ event, context }: EventArgs) =>
    'output' in event
      ? [
          {
            text: pairLine((event.output as PairHelperOutput).name, (event.output as PairHelperOutput).code, relayHost(), context.lang),
            chips: [],
          },
        ]
      : [],
});

export const storePairFailed = assign({
  step: 'welcome',
  pendingQuestion: null,
  pendingSay: ({ context }: ContextArgs) => [{ text: pairFailedLine[context.lang], chips: [] }],
});

export const storeSent = assign({
  waiting: ({ context, event }: EventArgs) =>
    'output' in event
      ? {
          id: (event.output as SendHelpOutput).id,
          helpers: (event.output as SendHelpOutput).helpers,
          label: context.pendingRequest ?? context.request ?? context.confirmLabel,
        }
      : null,
  nudgeCount: 0,
  sentPhoto: ({ event }: EventArgs) => ('output' in event ? (event.output as SendHelpOutput).photo : null),
  step: 'welcome',
  pendingQuestion: null,
  askTarget: null,
  askQuestion: '',
  pendingSay: ({ event, context }: EventArgs) =>
    'output' in event
      ? [{ text: sentLine((event.output as SendHelpOutput).helpers, context.lang), chips: [CANCEL_CHIP[context.lang]] }]
      : [],
});

export const storeSendFailed = assign({
  step: 'welcome',
  pendingQuestion: null,
  askTarget: null,
  askQuestion: '',
  pendingSay: ({ context }: ContextArgs) => [{ text: sendFailedLine[context.lang], chips: [] }],
});

export const cancelWait = assign({
  waiting: null,
  nudgeCount: 0,
  sentPhoto: null,
  pendingSay: ({ context }: ContextArgs) => [
    { text: cancelledWaitingLine(context.waiting?.helpers ?? [], context.lang), chips: [] },
  ],
});

export const cancelPair = assign({
  pairing: null,
  pendingSay: ({ context }: ContextArgs) => [
    { text: cancelledPairLine(context.pairing?.name ?? '', context.lang), chips: [] },
  ],
});

export const fireCancel: Effect = ({ context }) => {
  const id = context.waiting?.id;
  if (id) {
    void cancelHelper(id).catch((err: unknown) => {
      if (__DEV__) console.log(`[ittro] ${stamp()} helper cancel failed: ${String((err as Error)?.message ?? err)}`);
    });
  }
};

export const noteHelpersStored: Effect = ({ context }) => {
  const helpers = context.helpers;
  void loadPrefs().then((prefs) => savePrefs({ ...prefs, helpers }));
};
