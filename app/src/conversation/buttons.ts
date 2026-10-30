// Physical buttons: the earbud button (wired or Bluetooth, through
// the native media session) and a volume-down hold. Each press does
// exactly what the matching spoken word does: the mapping below
// builds the same understood answer the voice would have, so every
// state answers a press like the word. While stopped, any press
// wakes, like saying "Ittro".
import { assignConversation as assign } from './actors';
import type { ContextArgs, EventArgs } from './actions';
import { stopVoice } from '../speech';
import type { UnderstandAnswer } from '../relay';
import { earbudLine, noHoldLine } from '../lines';
import { logIttro } from '../log';
import type { ButtonGesture, ConversationContext, ConversationStep } from './types';

function yesNoOpen(step: ConversationStep): boolean {
  return step === 'confirm' || step === 'offer' || step === 'alternative' || step === 'tour' || step === 'helperSend' || step === 'helperOffer';
}

function gestureIntent(gesture: ButtonGesture, context: ConversationContext): string {
  if (context.step === 'sleep') {
    return 'wake';
  }
  if (gesture === 'double') {
    return 'confirm_no';
  }
  if (gesture === 'triple') {
    return 'help';
  }
  if (gesture === 'hold' || gesture === 'volumeHold') {
    return 'stop';
  }
  if (yesNoOpen(context.step)) {
    return 'confirm_yes';
  }
  if (context.guiding && context.guideReaching) {
    return 'got_it';
  }
  return 'repeat';
}

export function buttonAnswer(gesture: ButtonGesture, context: ConversationContext): UnderstandAnswer {
  return {
    intent: gestureIntent(gesture, context),
    language_spoken: context.lang,
    product_text: null,
    items: null,
    detail: null,
    target_language: null,
    helper_name: null,
  };
}

function pressCount(context: ConversationContext): number {
  return context.buttonPresses + 1;
}

function holdHintDue(context: ConversationContext, gesture: ButtonGesture): boolean {
  if (context.holdHintDone || !context.earbuds || gesture === 'hold' || gesture === 'volumeHold') {
    return false;
  }
  return !context.holdSeen && pressCount(context) >= 5;
}

export const noteButton = assign({
  routeAnswer: ({ context, event }: EventArgs) =>
    event.type === 'BUTTON_PRESS' ? buttonAnswer(event.gesture, context) : context.routeAnswer,
  misses: 0,
  pendingSay: [],
  buttonPresses: ({ context }: ContextArgs) => pressCount(context),
  holdSeen: ({ context, event }: EventArgs) =>
    context.holdSeen || (event.type === 'BUTTON_PRESS' && (event.gesture === 'hold' || event.gesture === 'volumeHold')),
  holdHintDone: ({ context, event }: EventArgs) =>
    context.holdHintDone || (event.type === 'BUTTON_PRESS' && holdHintDue(context, event.gesture)),
  pendingSearch: ({ context, event }: EventArgs) =>
    event.type === 'BUTTON_PRESS' && holdHintDue(context, event.gesture)
      ? [...context.pendingSearch, { text: noHoldLine[context.lang], chips: [], kind: 'status' as const }].slice(-3)
      : context.pendingSearch,
});

export const logButton = ({ context, event }: EventArgs): void => {
  if (event.type === 'BUTTON_PRESS') {
    logIttro(`button ${event.gesture} -> ${gestureIntent(event.gesture, context)}`);
  }
};

export const stopSpokenVoice = (): void => {
  stopVoice();
};

export const markReaching = assign({ guideReaching: true });

export const clearReaching = assign({ guideReaching: false });

export const guideTalkOn = {
  GUIDE_COVERING: { actions: [markReaching] },
  GUIDE_CUE: { actions: [clearReaching] },
  GUIDE_ALIGNED: { actions: [clearReaching] },
  GUIDE_NOHAND: { actions: [clearReaching] },
  GUIDE_LOST: { actions: [clearReaching] },
  GUIDE_GOT_IT: { actions: [clearReaching] },
  GUIDE_CONTACT: { actions: [clearReaching] },
  GUIDE_WRONG: { actions: [clearReaching] },
  GUIDE_TARGET_LOST: { actions: [clearReaching] },
  GUIDE_RESTART: { actions: [clearReaching] },
  GUIDE_END: { actions: [clearReaching] },
};

export const storeEarbuds = assign({
  earbuds: ({ event }: EventArgs) => (event.type === 'EARBUD_STATE' ? event.connected : false),
  earbudHintDone: ({ context, event }: EventArgs) =>
    event.type === 'EARBUD_STATE' ? (event.connected ? true : false) : context.earbudHintDone,
  pendingSearch: ({ context, event }: EventArgs) =>
    event.type === 'EARBUD_STATE' && event.connected && !context.earbudHintDone
      ? [...context.pendingSearch, { text: earbudLine[context.lang], chips: [], kind: 'status' as const }].slice(-3)
      : context.pendingSearch,
});

export const logEarbuds = ({ event }: EventArgs): void => {
  if (event.type === 'EARBUD_STATE') {
    logIttro(`earbuds ${event.connected ? 'connected' : 'disconnected'}`);
  }
};

export const earbudTalkOn = {
  EARBUD_STATE: { actions: [storeEarbuds, logEarbuds] },
};

export const isVolumeHold = ({ event }: EventArgs): boolean =>
  event.type === 'BUTTON_PRESS' && event.gesture === 'volumeHold';

export const noteRepeatWake = assign({
  pausedNote: ({ context }: ContextArgs) =>
    context.lastLine ? [...context.pausedNote, { text: context.lastLine, chips: context.lastChips }] : context.pausedNote,
});
