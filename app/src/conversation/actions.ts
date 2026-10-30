// Conversation actions: everything the states do that is not a
// state. Muting, spawning, notes, boot lines and pause lines.
import { assignConversation as assign, persistSnapshot, raiseConversation as raise, requestKeywords } from './actors';
import { wsUrl } from './streamCtl';
import type { Language } from '../theme';
import { playSound, setSpeechRate, stopVoice } from '../speech';
import type { UnderstandAnswer } from '../relay';
import {
  askAgain,
  chooseLanguage,
  offerHelp,
  offerLanguage,
  pausing,
  refusedMic,
  tourOffer,
  welcome,
  welcomeBack,
  whatToFind,
} from '../lines';
import { confirmList, confirmRequest, stillLooking, welcomeBackLooking } from '../requestLines';
import { closeMatchLine } from '../shelf/searchLines';
import { askConfirmLine, askNameLine, helpersWord, offerLine } from '../helper/lines';
import { HELP_CHIP, NO_CHIP, YES_CHIP } from '../chips';
import type { streamClient } from './streamActor';
import type { ConversationContext, ExpressionEvent, SpokenLine } from './types';
import { strippedText } from './echo';
import { logIttro } from '../log';

export type ContextArgs = { context: ConversationContext };

export const markTalkBusy = assign({ talkBusy: true });

export const markTalkQuiet = assign({ talkBusy: false });

export type EventArgs = { context: ConversationContext; event: ExpressionEvent };

export const raiseQuestion = raise({ type: 'QUESTION_ASKED' });

export const raiseTalkIdle = raise({ type: 'TALK_IDLE' });

export const raiseHeard = raise({ type: 'HEARD' });

export const raiseReprompt = raise({ type: 'REPROMPT' });

export const raiseHelp = raise({ type: 'HELP' });

export const noteSaid = assign({
  lastLine: ({ context }: ContextArgs) => context.pendingSay[context.pendingSay.length - 1]?.text ?? context.lastLine,
  lastChips: ({ context }: ContextArgs) => context.pendingSay[context.pendingSay.length - 1]?.chips ?? context.lastChips,
  pendingSay: [],
});

export const noteHeard = assign({
  transcript: ({ event }: EventArgs) => (event.type === 'FINAL_TEXT' ? event.text : ''),
  askedEpoch: ({ context }: ContextArgs) => context.epoch,
});

export const logHeard = ({ event }: EventArgs): void => {
  if (event.type === 'FINAL_TEXT') {
    logIttro(`heard: ${JSON.stringify(event.text)}`);
  }
};

export const noteHeardStripped = assign({
  transcript: ({ context, event }: EventArgs) => strippedText({ context, event }),
  askedEpoch: ({ context }: ContextArgs) => context.epoch,
});

export const logHeardStripped = ({ context, event }: EventArgs): void => {
  if (event.type === 'FINAL_TEXT') {
    logIttro(`heard after echo strip: ${JSON.stringify(strippedText({ context, event }))}`);
  }
};

export const logEchoDrop = ({ event }: EventArgs): void => {
  if (event.type === 'FINAL_TEXT' || event.type === 'PARTIAL_TEXT') {
    logIttro(`dropped own echo: ${JSON.stringify(event.text)}`);
  }
};

export const playHeard = (): void => {
  playSound('heard');
  logIttro('speech ended');
};

export interface DoneArgs {
  context: ConversationContext;
  event: ExpressionEvent;
}

export const noteUnderstood = assign({
  routeAnswer: ({ event }: DoneArgs) =>
    'output' in event ? ((event.output as UnderstandAnswer | undefined) ?? null) : null,
  misses: ({ context, event }: DoneArgs) =>
    'output' in event && (event.output as UnderstandAnswer | undefined)?.intent === 'not_understood'
      ? context.misses + 1
      : 0,
});

export const noteStreamOpen = assign({ streamUp: true });

export const noteStreamDown = assign({ streamUp: false });

export const noteSnapshot = ({ context }: ContextArgs): void => persistSnapshot(context.request);

export const spawnStream = assign({
  streamRef: ({ spawn, context }) =>
    spawn('streamClient' as unknown as typeof streamClient, {
      input: { url: wsUrl(context.relayUrl), code: context.relayCode, keywords: requestKeywords(context.request, context.brands) },
    }),
});

export const applyInitialRate = ({ context }: ContextArgs): void => setSpeechRate(context.rate);

export const freshAnswer: (args: ContextArgs) => boolean = ({ context }) => context.askedEpoch === context.epoch;

export const nonEmptyFinal: (args: EventArgs) => boolean = ({ event }) =>
  event.type === 'FINAL_TEXT' && event.text.trim().length > 0;

export const micDue: (args: ContextArgs) => boolean = ({ context }) => Date.now() - context.micSaidAt > 60000;

export const alertDue = ({ context, event }: EventArgs): boolean => {
  if (event.type !== 'ALERT') {
    return false;
  }
  return event.kind === 'battery' ? !context.warnedBattery : !context.warnedHeat;
};

export const noteAlert = assign({
  warnedBattery: ({ context, event }: EventArgs) =>
    context.warnedBattery || (event.type === 'ALERT' && event.kind === 'battery'),
  warnedHeat: ({ context, event }: EventArgs) =>
    context.warnedHeat || (event.type === 'ALERT' && event.kind === 'heat'),
  pendingSay: ({ event }: EventArgs) => (event.type === 'ALERT' ? [{ text: event.text, chips: [] as string[] }] : []),
});

export const noteMicComplaint = assign({
  micSaidAt: () => Date.now(),
  pendingSay: ({ context }: ContextArgs) => [{ text: refusedMic[context.lang], chips: [] as string[] }],
});

export function repromptLines(step: ConversationContext['step'], request: string | null, lang: Language): SpokenLine[] {
  if (step === 'confirm' || step === 'offer' || step === 'alternative' || step === 'helperSend' || step === 'helperOffer') {
    return [{ text: askAgain[lang], chips: [YES_CHIP[lang], NO_CHIP[lang]] }];
  }
  if (step === 'helperName') {
    return [{ text: askNameLine[lang], chips: [] }];
  }
  if (step === 'tour') {
    return [{ text: tourOffer[lang], chips: [YES_CHIP[lang], NO_CHIP[lang]] }];
  }
  if (step === 'language') {
    return [
      { text: chooseLanguage.en, chips: [] },
      { text: chooseLanguage.ar, chips: [] },
      { text: chooseLanguage.fr, chips: [] },
    ];
  }
  if (request) {
    return [{ text: stillLooking(request, lang), chips: [] }];
  }
  return [{ text: whatToFind[lang], chips: [] }];
}

export const assignReprompt = assign({
  pendingSay: ({ context }: ContextArgs) =>
    context.step === 'verdict' && context.lastLine
      ? [{ text: context.lastLine, chips: context.lastChips }]
      : repromptLines(context.step, context.request, context.lang),
});

export const logReprompt = (): void => {
  logIttro('silence 8s, asking again');
};

export const assignHelp = assign({
  pendingSay: ({ context }: ContextArgs) => [{ text: offerHelp[context.lang], chips: [HELP_CHIP[context.lang]] }],
});

export const logHelp = (): void => {
  logIttro('silence 20s, offering help');
};

export const flLangLines = assign({
  step: 'language',
  pendingQuestion: null,
  pendingSay: [
    { text: chooseLanguage.en, chips: [] },
    { text: chooseLanguage.ar, chips: [] },
    { text: chooseLanguage.fr, chips: [] },
  ],
});

export const freshLines = assign({
  step: 'welcome',
  pendingSay: ({ context }: ContextArgs) => [{ text: welcome[context.lang], chips: [HELP_CHIP[context.lang]] }],
});

export const backLines = assign({
  step: 'welcome',
  searching: ({ context }: ContextArgs) => context.request !== null,
  cameraOn: ({ context }: ContextArgs) => context.request !== null,
  pendingSay: ({ context }: ContextArgs) => [
    { text: context.request ? welcomeBackLooking(context.request, context.lang) : welcome[context.lang], chips: [] },
  ],
});

export function pausedLines(context: ConversationContext): SpokenLine[] {
  const lang = context.lang;
  if (context.step === 'sleep') {
    return [{ text: welcomeBack[lang], chips: [] }];
  }
  if (context.step === 'confirm' && context.pendingRequest) {
    const text = context.pendingItems
      ? confirmList(context.pendingItems, lang)
      : confirmRequest(context.pendingRequest, lang);
    return [{ text, chips: [YES_CHIP[lang], NO_CHIP[lang]] }];
  }
  if (context.step === 'offer' && context.offerTarget) {
    return [{ text: offerLanguage(context.offerTarget), chips: [YES_CHIP[context.offerTarget], NO_CHIP[context.offerTarget]] }];
  }
  if (context.step === 'tour') {
    return [{ text: tourOffer[lang], chips: [YES_CHIP[lang], NO_CHIP[lang]] }];
  }
  if (context.step === 'alternative' && context.alternative) {
    return [{ text: closeMatchLine(context.request ?? '', context.alternative, lang), chips: [YES_CHIP[lang], NO_CHIP[lang]] }];
  }
  if (context.step === 'helperName') {
    return [{ text: askNameLine[lang], chips: [] }];
  }
  if (context.step === 'helperSend' && context.askQuestion) {
    return [{ text: askConfirmLine(helpersWord(lang), context.askQuestion, lang), chips: [YES_CHIP[lang], NO_CHIP[lang]] }];
  }
  if (context.step === 'helperOffer' && context.helpers[0]) {
    return [{ text: offerLine(context.helpers[0].name, lang), chips: [YES_CHIP[lang], NO_CHIP[lang]] }];
  }
  if (context.step === 'language') {
    return [
      { text: chooseLanguage.en, chips: [] },
      { text: chooseLanguage.ar, chips: [] },
      { text: chooseLanguage.fr, chips: [] },
    ];
  }
  if (context.step === 'verdict' && context.lastLine) {
    return [{ text: context.lastLine, chips: context.lastChips }];
  }
  if (context.request) {
    return [{ text: welcomeBackLooking(context.request, lang), chips: [] }];
  }
  return [
    { text: welcomeBack[lang], chips: [] },
    { text: whatToFind[lang], chips: [] },
  ];
}

export const notePaused = assign({
  epoch: ({ context }: ContextArgs) => context.epoch + 1,
  pausedNote: ({ context }: ContextArgs) => pausedLines(context),
  pausedReturn: ({ context }: ContextArgs) => (context.step === 'sleep' ? 'sleeping' : 'listening'),
});

export const usePausedNote = assign({
  pendingSay: ({ context }: ContextArgs) => context.pausedNote,
});

export const noteOver = assign({
  epoch: ({ context }: ContextArgs) => context.epoch + 1,
  pausedNote: ({ context }: ContextArgs) =>
    context.request
      ? [{ text: welcomeBackLooking(context.request, context.lang), chips: [] as string[] }]
      : [
          { text: welcomeBack[context.lang], chips: [] as string[] },
          { text: whatToFind[context.lang], chips: [] as string[] },
        ],
  pausedReturn: 'listening',
});

export const returnSleeping: (args: ContextArgs) => boolean = ({ context }) => context.pausedReturn === 'sleeping';

export const needsFirstLaunch: (args: ContextArgs) => boolean = ({ context }) => !context.firstLaunchDone;

export const hasRequest: (args: ContextArgs) => boolean = ({ context }) => context.request !== null;

export const pausingLines = assign({
  pendingSay: ({ context }: ContextArgs) => [{ text: pausing[context.lang], chips: [] as string[] }],
});

export const chimePausing = (): void => playSound('pausing');

export const quietVoice = (): void => {
  stopVoice();
};
