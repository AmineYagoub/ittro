// The talk side of the conversation: listening, understanding,
// saying and sleeping. A button press lands here like the spoken
// word, from any substate: the talk-level BUTTON_PRESS routes it,
// stopping whatever speech or understanding was running.
import { speech } from '../theme';
import { ensureStream, sendStart } from './streamCtl';
import { bargeIn } from './bargeIn';
import { echoFull, echoStripped, noteVoice } from './echo';
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
  logEchoDrop,
  logHeard,
  logHeardStripped,
  logHelp,
  logReprompt,
  markTalkBusy,
  markTalkQuiet,
  micDue,
  needsFirstLaunch,
  nonEmptyFinal,
  noteAlert,
  noteHeard,
  noteHeardStripped,
  noteMicComplaint,
  noteSaid,
  noteSaying,
  noteSnapshot,
  noteStreamDown,
  noteStreamOpen,
  noteUnderstood,
  pausingLines,
  playHeard,
  raiseHeard,
  raiseQuestion,
  raiseTalkIdle,
  repromptFree,
  returnSleeping,
  spawnStream,
  usePausedNote,
} from './actions';
import { consumedFinal, logConsumedFinal } from './consumed';
import { understandInput } from './askHints';
import type { ContextArgs } from './actions';
import { buttonsLines } from './answers';
import { UNDERSTAND_TIMEOUT_MS, hasLinkLine, raiseLinkDown, raiseLinkForError, raiseLinkOk, sayLinkLine, understandTimedOut } from './link';
import { sayTo } from './sayTo';
import { applyTranslated, skipKeep, skipSay, translateKeep } from './translation';
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

const listeningShared = {
  FINAL_TEXT: [
    { guard: consumedFinal, actions: [logConsumedFinal] },
    { guard: echoFull, actions: [logEchoDrop] },
    { guard: echoStripped, actions: [noteHeardStripped, logHeardStripped, raiseHeard], target: 'understanding' },
    { guard: nonEmptyFinal, actions: [noteHeard, logHeard, raiseHeard], target: 'understanding' },
  ],
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
    sayingKeep: sayTo('translating', false),
    sayingSleep: sayTo('sleeping', false),
    sayingOver: sayTo('over', false),
    sayingResume: sayTo('resumed', true),
    sayingFlLang: sayTo('listening', true),
    sayingFlPrivacy: {
      entry: [markTalkBusy, noteVoice, noteSaying],
      invoke: {
        src: 'speakMany' as const,
        input: ({ context }: ContextArgs) => ({ lines: context.pendingSay, lang: context.lang }),
        onDone: { actions: [noteSaid, buttonsLines], target: 'sayingFlButtons' },
        onError: { actions: [noteSaid, buttonsLines], target: 'sayingFlButtons' },
      },
      exit: [markTalkQuiet],
      on: bargeIn,
    },
    sayingFlButtons: {
      entry: [markTalkBusy, noteVoice, noteSaying],
      invoke: {
        src: 'speakMany' as const,
        input: ({ context }: ContextArgs) => ({ lines: context.pendingSay, lang: context.lang }),
        onDone: { actions: [noteSaid, chainActions.tourOfferLines], target: 'sayingFlTourOffer' },
        onError: { actions: [noteSaid, chainActions.tourOfferLines], target: 'sayingFlTourOffer' },
      },
      exit: [markTalkQuiet],
      on: bargeIn,
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
          { guard: echoFull, actions: [logEchoDrop] },
          { guard: partialWorthy, actions: [notePartial, raiseHeard], target: 'speculating' },
          { actions: [raiseHeard] },
        ],
        STREAM_CLOSED: { actions: [noteStreamDown, sendStart] },
        STREAM_ERROR: { actions: [noteStreamDown, sendStart] },
        STREAM_FAILED: { actions: [noteStreamDown, raiseLinkDown, sendStart] },
        MIC_FAILED: { guard: micDue, actions: [noteMicComplaint], target: 'saying' },
        ALERT: { guard: alertDue, actions: [noteAlert], target: 'saying' },
        REPROMPT: { guard: repromptFree, actions: [assignReprompt, logReprompt], target: 'sayingReprompt' },
        HELP: { guard: repromptFree, actions: [assignHelp, logHelp], target: 'sayingHelp' },
      },
    },
    translating: {
      entry: [markTalkBusy],
      exit: [markTalkQuiet],
      always: [
        { guard: skipKeep, target: 'routing' },
        { guard: skipSay, target: 'saying' },
      ],
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
        onDone: [
          { guard: translateKeep, actions: [applyTranslated], target: 'routing' },
          { actions: [applyTranslated], target: 'saying' },
        ],
        onError: [{ guard: translateKeep, target: 'routing' }, { target: 'saying' }],
      },
    },
    speculating: { ...speculatingState, entry: [markTalkBusy], exit: [markTalkQuiet] },
    understanding: {
      entry: [markTalkBusy],
      exit: [markTalkQuiet],
      invoke: [
        {
          src: 'understandAnswer' as const,
          input: ({ context }: ContextArgs) => understandInput(context, context.transcript),
          onDone: [
            { guard: freshAnswer, actions: [noteUnderstood, raiseLinkOk], target: 'routing' },
            { target: 'listening' },
          ],
          onError: { actions: [raiseLinkForError], target: 'listening' },
        },
        { src: 'ticking' as const, input: { everyMs: speech.workingTickEveryMs } },
      ],
      after: { [UNDERSTAND_TIMEOUT_MS]: { actions: understandTimedOut, target: 'listening' } },
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
      entry: [markTalkBusy, noteVoice],
      invoke: {
        src: 'tourSequence' as const,
        input: ({ context }: ContextArgs) => ({ lang: context.lang }),
        onDone: { actions: [raiseQuestion], target: 'listening' },
        onError: { actions: [raiseQuestion], target: 'listening' },
      },
      exit: [markTalkQuiet],
      on: bargeIn,
    },
    touringFl: {
      entry: [markTalkBusy, noteVoice],
      invoke: {
        src: 'tourSequence' as const,
        input: ({ context }: ContextArgs) => ({ lang: context.lang }),
        onDone: { actions: [chainActions.welcomeAfterTour, chainActions.noteTourDone], target: 'saying' },
        onError: { actions: [chainActions.welcomeAfterTour, chainActions.noteTourDone], target: 'saying' },
      },
      exit: [markTalkQuiet],
      on: bargeIn,
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
