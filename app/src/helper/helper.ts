// The helper side of the conversation: pairing a helper, asking
// with a photo, and waiting for the answer. Waiting is a state:
// ticks for 10 s, then a pulse every 5 s with a spoken update every
// 30 s, giving up after 5 minutes. Talk-level handlers own the data
// and the queued lines, so a join or answer is never lost while the
// region is busy; the region owns the state, the polls and the clock.
import { Vibration } from 'react-native';
import { assignConversation as assign, raiseConversation as raise } from '../conversation/actors';
import type { ContextArgs, EventArgs } from '../conversation/actions';
import { playSound } from '../speech';
import { haptics } from '../theme';
import { ASK_CHIP, DONE_CHIP, FIND_ANOTHER_CHIP, GUIDE_CHIP, READ_AGAIN_CHIP } from '../chips';
import type { ConversationContext, HelperQueued } from '../conversation/types';
import {
  answerLine,
  joinedLine,
  offerLine,
  pairExpiredLine,
  stillWaitingLine,
  timeoutLine,
} from './lines';
import { noteHelpersStored } from './helperSay';

const WAIT_LATE_MS = 10000;

const NUDGE_MS = 30000;

const NUDGES_UNTIL_TIMEOUT = 9;

function queueLine(context: ConversationContext, line: HelperQueued): HelperQueued[] {
  return [...context.pendingHelper, line].slice(-3);
}

function answerChips(verdict: 'yes' | 'no' | 'cant_tell', lang: ConversationContext['lang']): string[] {
  if (verdict === 'yes') {
    return [FIND_ANOTHER_CHIP[lang], DONE_CHIP[lang]];
  }
  if (verdict === 'no') {
    return [GUIDE_CHIP[lang], READ_AGAIN_CHIP[lang]];
  }
  return [READ_AGAIN_CHIP[lang], ASK_CHIP[lang]];
}

function answerLabel(context: ConversationContext): string {
  return context.waiting?.label ?? context.pendingRequest ?? context.request ?? context.confirmLabel;
}

export const queueJoin = assign({
  helpers: ({ context, event }: EventArgs) =>
    event.type === 'HELPER_JOINED'
      ? [...context.helpers.filter((helper) => helper.name !== event.name), { name: event.name, token: event.token }]
      : context.helpers,
  pairing: null,
  pendingHelper: ({ context, event }: EventArgs) =>
    event.type === 'HELPER_JOINED'
      ? queueLine(context, { text: joinedLine(event.name, context.lang), chips: [], kind: 'status' })
      : context.pendingHelper,
});

export const queueExpired = assign({
  pairing: null,
  pendingHelper: ({ context }: ContextArgs) =>
    queueLine(context, { text: pairExpiredLine[context.lang], chips: [], kind: 'status' }),
});

export const queueAnswer = assign({
  helperAnswer: ({ event }: EventArgs) =>
    event.type === 'HELPER_ANSWER' ? { verdict: event.verdict, note: event.note, helper: event.helper } : null,
  helperVerdict: ({ event }: EventArgs) =>
    event.type !== 'HELPER_ANSWER' ? null : event.verdict === 'cant_tell' ? 'unsure' : event.verdict,
  helperLabel: ({ context, event }: EventArgs) =>
    event.type === 'HELPER_ANSWER' ? `${event.helper}: ${answerLabel(context)}` : '',
  waiting: null,
  nudgeCount: 0,
  step: 'verdict',
  pendingQuestion: 'verdict_done',
  lastLine: ({ context, event }: EventArgs) =>
    event.type === 'HELPER_ANSWER'
      ? answerLine(event.verdict, event.helper, answerLabel(context), event.note, context.lang)
      : context.lastLine,
  lastChips: ({ context, event }: EventArgs) =>
    event.type === 'HELPER_ANSWER' ? answerChips(event.verdict, context.lang) : context.lastChips,
  pendingHelper: ({ context, event }: EventArgs) =>
    event.type === 'HELPER_ANSWER'
      ? queueLine(context, {
          text: answerLine(event.verdict, event.helper, answerLabel(context), event.note, context.lang),
          chips: answerChips(event.verdict, context.lang),
          kind: 'answer',
        })
      : context.pendingHelper,
});

export const queueNudge = assign({
  pendingHelper: ({ context }: ContextArgs) =>
    queueLine(context, {
      text: stillWaitingLine(context.waiting?.helpers ?? context.helpers.map((helper) => helper.name), context.lang),
      chips: [],
      kind: 'status',
    }),
});

export const queueTimeout = assign({
  waiting: null,
  nudgeCount: 0,
  sentPhoto: null,
  pendingHelper: ({ context, event }: EventArgs) => {
    const names =
      event.type === 'HELPER_TIMEOUT' && event.names.length > 0
        ? event.names
        : context.waiting?.helpers ?? context.helpers.map((helper) => helper.name);
    if (names.length === 0) {
      return context.pendingHelper;
    }
    return queueLine(context, { text: timeoutLine(names, context.lang), chips: [ASK_CHIP[context.lang], READ_AGAIN_CHIP[context.lang]], kind: 'status' });
  },
});

export const noteTimeoutClear = assign({ waiting: null, nudgeCount: 0, sentPhoto: null });

export const clearHelper = assign({
  pairing: null,
  waiting: null,
  nudgeCount: 0,
  helperAnswer: null,
  pendingHelper: [],
  helperVerdict: null,
  helperLabel: '',
  askTarget: null,
  askQuestion: '',
  sentPhoto: null,
});

export const resetStreak = assign({ unsureStreak: 0, helperOfferDone: false });

export const bumpStreak = assign({
  unsureStreak: ({ context }: ContextArgs) => context.unsureStreak + 1,
  helperOfferDone: ({ context }: ContextArgs) =>
    context.helperOfferDone || (context.unsureStreak + 1 >= 2 && context.helpers.length > 0 && context.confirming),
  step: ({ context }: ContextArgs) =>
    !context.helperOfferDone && context.unsureStreak + 1 >= 2 && context.helpers.length > 0 && context.confirming
      ? 'helperOffer'
      : context.step,
  pendingQuestion: ({ context }: ContextArgs) =>
    !context.helperOfferDone && context.unsureStreak + 1 >= 2 && context.helpers.length > 0 && context.confirming
      ? 'helper_offer'
      : context.pendingQuestion,
  pendingHelper: ({ context }: ContextArgs) =>
    !context.helperOfferDone && context.unsureStreak + 1 >= 2 && context.helpers.length > 0 && context.confirming && context.helpers[0]
      ? queueLine(context, { text: offerLine(context.helpers[0].name, context.lang), chips: [], kind: 'status' })
      : context.pendingHelper,
});

export const isWaiting = ({ context }: ContextArgs): boolean => context.waiting !== null;

export const wantsWaiting = ({ context }: ContextArgs): boolean => context.waiting !== null;

export const wantsPairing = ({ context }: ContextArgs): boolean => context.pairing !== null;

export const helperTalkOn = {
  HELPER_JOINED: { actions: [queueJoin, noteHelpersStored] },
  HELPER_PAIR_EXPIRED: { actions: [queueExpired] },
  HELPER_ANSWER: { guard: isWaiting, actions: [queueAnswer] },
  HELPER_NUDGE: { actions: [queueNudge] },
  HELPER_TIMEOUT: { actions: [queueTimeout] },
  CONFIRM_BEGIN: { actions: [resetStreak] },
  CONFIRM_YES: { actions: [resetStreak] },
  CONFIRM_NO: { actions: [resetStreak] },
  CONFIRM_END: { actions: [resetStreak] },
  CONFIRM_UNSURE: { actions: [bumpStreak] },
};

export const hasQueuedHelper = ({ context }: ContextArgs): boolean => context.pendingHelper.length > 0;

export const hasQueuedHelperAnswer = ({ context }: ContextArgs): boolean =>
  context.pendingHelper[0]?.kind === 'answer';

export const sayQueuedHelper = assign({
  pendingSay: ({ context }: ContextArgs) => {
    const [head] = context.pendingHelper;
    return head ? [{ text: head.text, chips: head.chips }] : [];
  },
  pendingHelper: ({ context }: ContextArgs) => context.pendingHelper.slice(1),
});

export const chimeHelper = ({ context }: ContextArgs): void => {
  const verdict = context.helperAnswer?.verdict;
  if (verdict === 'yes') {
    Vibration.vibrate([...haptics.yes]);
    playSound('yes');
  } else if (verdict === 'no') {
    Vibration.vibrate([...haptics.no]);
    playSound('no');
  } else {
    Vibration.vibrate([...haptics.notSure]);
    playSound('notSure');
  }
};

export const raiseHelperEnd = raise({ type: 'HELPER_END' });

export const raiseHelperSent = raise({ type: 'HELPER_SENT' });

export const raisePairWaiting = raise({ type: 'HELPER_CODE' });

const raiseNudge = raise({ type: 'HELPER_NUDGE' });

const raiseTimeout = raise(({ context }: ContextArgs) => ({
  type: 'HELPER_TIMEOUT' as const,
  names: context.waiting?.helpers ?? [],
}));

const bumpNudge = assign({ nudgeCount: ({ context }: ContextArgs) => context.nudgeCount + 1 });

const waitTimedOut = ({ context }: ContextArgs): boolean => context.nudgeCount >= NUDGES_UNTIL_TIMEOUT;

export const helperRegion = {
  id: 'helper',
  initial: 'idle',
  on: {
    HELPER_END: { actions: [clearHelper], target: '#helper.idle' },
  },
  states: {
    idle: {
      always: [{ guard: wantsWaiting, target: 'waiting' }, { guard: wantsPairing, target: 'pairing' }],
      on: {
        HELPER_CODE: { target: 'pairing' },
        HELPER_SENT: { target: 'waiting' },
      },
    },
    pairing: {
      invoke: {
        src: 'pairPoll' as const,
        input: ({ context }: ContextArgs) => ({ key: context.pairing?.code ?? '' }),
      },
      on: {
        HELPER_JOINED: { target: 'idle' },
        HELPER_PAIR_EXPIRED: { target: 'idle' },
        HELPER_SENT: { target: 'waiting' },
        HELPER_CODE: { target: 'pairing', reenter: true },
      },
    },
    waiting: {
      invoke: [
        {
          src: 'answerPoll' as const,
          input: ({ context }: ContextArgs) => ({ key: context.waiting?.id ?? '' }),
        },
        { src: 'ticking' as const, input: { everyMs: 2000 } },
      ],
      after: { [WAIT_LATE_MS]: 'waitingLate' },
      on: {
        HELPER_ANSWER: { guard: isWaiting, target: 'answered' },
        HELPER_SENT: { target: 'waiting', reenter: true },
        HELPER_CODE: { target: 'pairing' },
      },
    },
    waitingLate: {
      invoke: [
        {
          src: 'answerPoll' as const,
          input: ({ context }: ContextArgs) => ({ key: context.waiting?.id ?? '' }),
        },
        { src: 'pulseTick' as const, input: { everyMs: 5000 } },
      ],
      after: {
        [NUDGE_MS]: [
          { guard: waitTimedOut, actions: [noteTimeoutClear, raiseTimeout], target: 'idle' },
          { actions: [bumpNudge, raiseNudge], target: 'waitingLate', reenter: true },
        ],
      },
      on: {
        HELPER_ANSWER: { guard: isWaiting, target: 'answered' },
        HELPER_SENT: { target: 'waiting' },
        HELPER_CODE: { target: 'pairing' },
      },
    },
    answered: {
      entry: [chimeHelper],
      on: {
        HELPER_SENT: { target: 'waiting' },
        HELPER_CODE: { target: 'pairing' },
      },
    },
  },
};
