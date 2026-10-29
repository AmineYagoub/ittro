// The talk side of the conversation: listening, understanding,
// saying and sleeping. A button press lands here like the spoken
// word, from any substate: the talk-level BUTTON_PRESS routes it,
// stopping whatever speech or understanding was running.
import { speech } from '../theme';
import { ensureStream, muteMic, sendStart, unmuteMic } from './streamCtl';
import {
  alertDue,
  applyInitialRate,
  assignHelp,
  assignReprompt,
  backLines,
  chimePausing,
  flLangLines,
  freshAnswer,
  freshLines,
  hasRequest,
  logHeard,
  logHelp,
  logReprompt,
  markTalkBusy,
  markTalkQuiet,
  micDue,
  needsFirstLaunch,
  nonEmptyFinal,
  noteAlert,
  noteHeard,
  noteMicComplaint,
  noteSaid,
  noteSnapshot,
  noteStreamDown,
  noteStreamOpen,
  noteUnderstood,
  pausingLines,
  playHeard,
  raiseHeard,
  raiseQuestion,
  raiseTalkIdle,
  returnSleeping,
  spawnStream,
  usePausedNote,
} from './actions';
import type { ContextArgs } from './actions';
import { buttonsLines } from './answers';
import { hasLinkLine, raiseLinkDown, raiseLinkForError, raiseLinkOk, sayLinkLine } from './link';
import { applyTranslated } from './translation';
import { notePartial, partialWorthy, speculatingState } from './speculating';
import { chainActions, routingTransitions } from './routing';
import { earbudTalkOn, guideTalkOn, logButton, noteButton, stopSpokenVoice } from './buttons';
import {
  hasQueuedHelper,
  hasQueuedHelperAnswer,
  helperTalkOn,
  raiseHelperSent,
  raisePairWaiting,
  sayQueuedHelper,
} from '../helper/helper';
import { storePairFailed, storePairing, storeSendFailed, storeSent } from '../helper/helperSay';
import {
  hasQueuedAlternative,
  hasQueuedSearch,
  resumeSearch,
  sayQueuedAlternative,
  sayQueuedStatus,
  searchTalkOn,
} from './search';

function sayTo(target: 'listening' | 'sleeping' | 'over' | 'resumed' | 'routing', raiseClock: boolean) {
  const resolved = target === 'over' ? '#conversation.over' : target;
  return {
    entry: [muteMic, markTalkBusy],
    invoke: {
      src: 'speakMany' as const,
      input: ({ context }: ContextArgs) => ({ lines: context.pendingSay, lang: context.lang }),
      onDone: { actions: raiseClock ? [noteSaid, raiseQuestion] : [noteSaid], target: resolved },
      onError: { actions: [noteSaid], target: resolved },
    },
    exit: [unmuteMic, markTalkQuiet],
  };
}

const listeningShared = {
  FINAL_TEXT: { guard: nonEmptyFinal, actions: [noteHeard, logHeard, raiseHeard], target: 'understanding' },
  SPEECH_ENDED: { actions: [playHeard, raiseHeard] },
  STREAM_OPEN: { actions: [noteStreamOpen, raiseLinkOk] },
};

const buttonRoute = { actions: [stopSpokenVoice, noteButton, logButton, raiseHeard], target: '.routing' };

export const talkState = {
  initial: 'boot',
  on: {
    ...searchTalkOn,
    ...guideTalkOn,
    ...earbudTalkOn,
    ...helperTalkOn,
    BUTTON_PRESS: buttonRoute,
    STREAM_CLOSED: { actions: [noteStreamDown, sendStart] },
    STREAM_ERROR: { actions: [noteStreamDown, sendStart] },
    STREAM_FAILED: { actions: [noteStreamDown, raiseLinkDown, sendStart] },
  },
  states: {
    boot: {
      entry: [spawnStream, applyInitialRate],
      always: [
        { guard: needsFirstLaunch, actions: [flLangLines], target: 'sayingFlLang' },
        { guard: hasRequest, actions: [backLines], target: 'saying' },
        { actions: [freshLines], target: 'saying' },
      ],
    },
    saying: sayTo('listening', true),
    sayingReprompt: sayTo('listening', false),
    sayingHelp: sayTo('listening', false),
    sayingKeep: sayTo('routing', false),
    sayingSleep: sayTo('sleeping', false),
    sayingOver: sayTo('over', false),
    sayingResume: sayTo('resumed', true),
    sayingFlLang: sayTo('listening', true),
    sayingFlPrivacy: {
      entry: [muteMic, markTalkBusy],
      invoke: {
        src: 'speakMany' as const,
        input: ({ context }: ContextArgs) => ({ lines: context.pendingSay, lang: context.lang }),
        onDone: { actions: [noteSaid, buttonsLines], target: 'sayingFlButtons' },
        onError: { actions: [noteSaid, buttonsLines], target: 'sayingFlButtons' },
      },
      exit: [unmuteMic, markTalkQuiet],
    },
    sayingFlButtons: {
      entry: [muteMic, markTalkBusy],
      invoke: {
        src: 'speakMany' as const,
        input: ({ context }: ContextArgs) => ({ lines: context.pendingSay, lang: context.lang }),
        onDone: { actions: [noteSaid, chainActions.tourOfferLines], target: 'sayingFlTourOffer' },
        onError: { actions: [noteSaid, chainActions.tourOfferLines], target: 'sayingFlTourOffer' },
      },
      exit: [unmuteMic, markTalkQuiet],
    },
    sayingFlTourOffer: sayTo('listening', true),
    listening: {
      entry: [ensureStream, noteSnapshot, raiseTalkIdle],
      always: [
        { guard: hasLinkLine, actions: [sayLinkLine], target: 'sayingReprompt' },
        { guard: hasQueuedHelperAnswer, actions: [sayQueuedHelper], target: 'saying' },
        { guard: hasQueuedAlternative, actions: [sayQueuedAlternative], target: 'saying' },
        { guard: hasQueuedSearch, actions: [sayQueuedStatus], target: 'sayingReprompt' },
        { guard: hasQueuedHelper, actions: [sayQueuedHelper], target: 'sayingReprompt' },
      ],
      on: {
        ...listeningShared,
        PARTIAL_TEXT: [
          { guard: partialWorthy, actions: [notePartial, raiseHeard], target: 'speculating' },
          { actions: [raiseHeard] },
        ],
        STREAM_CLOSED: { actions: [noteStreamDown, sendStart] },
        STREAM_ERROR: { actions: [noteStreamDown, sendStart] },
        STREAM_FAILED: { actions: [noteStreamDown, raiseLinkDown, sendStart] },
        MIC_FAILED: { guard: micDue, actions: [noteMicComplaint], target: 'saying' },
        ALERT: { guard: alertDue, actions: [noteAlert], target: 'saying' },
        REPROMPT: { actions: [assignReprompt, logReprompt], target: 'sayingReprompt' },
        HELP: { actions: [assignHelp, logHelp], target: 'sayingHelp' },
      },
    },
    translating: {
      entry: [markTalkBusy],
      exit: [markTalkQuiet],
      invoke: {
        src: 'understandAnswer' as const,
        input: ({ context }: ContextArgs) => ({
          transcript: context.translateSource ?? '',
          lang: context.lang,
          step: 'translate' as const,
          pendingQuestion: null,
          pendingRequest: context.translateSource,
          lastLine: '',
        }),
        onDone: { actions: [applyTranslated], target: 'saying' },
        onError: { target: 'saying' },
      },
    },
    speculating: { ...speculatingState, entry: [markTalkBusy], exit: [markTalkQuiet] },
    understanding: {
      entry: [markTalkBusy],
      exit: [markTalkQuiet],
      invoke: [
        {
          src: 'understandAnswer' as const,
          input: ({ context }: ContextArgs) => ({
            transcript: context.transcript,
            lang: context.lang,
            step: context.step,
            pendingQuestion: context.pendingQuestion,
            pendingRequest: context.pendingRequest ?? context.request,
            lastLine: context.lastLine,
          }),
          onDone: [
            { guard: freshAnswer, actions: [noteUnderstood, raiseLinkOk], target: 'routing' },
            { target: 'listening' },
          ],
          onError: { actions: [raiseLinkForError], target: 'listening' },
        },
        { src: 'ticking' as const, input: { everyMs: speech.workingTickEveryMs } },
      ],
    },
    routing: {
      always: routingTransitions,
    },
    pairingHelper: {
      entry: [markTalkBusy],
      exit: [markTalkQuiet],
      invoke: {
        src: 'pairHelper' as const,
        input: ({ context }: ContextArgs) => ({ name: context.routeAnswer?.helper_name ?? '' }),
        onDone: { actions: [storePairing, raisePairWaiting], target: 'sayingReprompt' },
        onError: { actions: [storePairFailed], target: 'saying' },
      },
    },
    sendingHelp: {
      entry: [markTalkBusy],
      exit: [markTalkQuiet],
      invoke: {
        src: 'sendHelp' as const,
        input: ({ context }: ContextArgs) => ({
          tokens: context.askTarget ?? context.helpers.map((helper) => helper.token),
          question: context.askQuestion,
          request: context.pendingRequest ?? context.request ?? context.confirmLabel,
          read: context.confirmLabel || context.pendingRequest || context.request || '',
          crop: context.confirmCrop,
        }),
        onDone: { actions: [storeSent, raiseHelperSent], target: 'sayingReprompt' },
        onError: { actions: [storeSendFailed], target: 'saying' },
      },
    },
    sleeping: {
      entry: [ensureStream, noteSnapshot, raiseTalkIdle],
      after: {
        [speech.idlePauseAfterMs]: { actions: [chimePausing, pausingLines], target: 'sayingOver' },
      },
      on: {
        ...listeningShared,
        STREAM_CLOSED: { actions: [noteStreamDown, sendStart] },
        STREAM_ERROR: { actions: [noteStreamDown, sendStart] },
        STREAM_FAILED: { actions: [noteStreamDown, raiseLinkDown, sendStart] },
        MIC_FAILED: { guard: micDue, actions: [noteMicComplaint], target: 'sayingSleep' },
        ALERT: { guard: alertDue, actions: [noteAlert], target: 'sayingSleep' },
      },
    },
    touring: {
      entry: [muteMic, markTalkBusy],
      invoke: {
        src: 'tourSequence' as const,
        input: ({ context }: ContextArgs) => ({ lang: context.lang }),
        onDone: { actions: [raiseQuestion], target: 'listening' },
        onError: { actions: [raiseQuestion], target: 'listening' },
      },
      exit: [unmuteMic, markTalkQuiet],
    },
    touringFl: {
      entry: [muteMic, markTalkBusy],
      invoke: {
        src: 'tourSequence' as const,
        input: ({ context }: ContextArgs) => ({ lang: context.lang }),
        onDone: { actions: [chainActions.welcomeAfterTour, chainActions.noteTourDone], target: 'saying' },
        onError: { actions: [chainActions.welcomeAfterTour, chainActions.noteTourDone], target: 'saying' },
      },
      exit: [unmuteMic, markTalkQuiet],
    },
    resuming: {
      entry: [sendStart],
      always: { actions: [usePausedNote, resumeSearch], target: 'sayingResume' },
    },
    resumed: {
      always: [{ guard: returnSleeping, target: 'sleeping' }, { target: 'listening' }],
    },
  },
};
