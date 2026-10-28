// The conversation: one statechart for listening, understanding,
// pausing and the silence timers. Speech mutes the mic; a pause bumps
// the epoch so nothing heard before it is acted on after.
import { setup } from 'xstate';
import { speakMany, ticking, tourSequence, understandAnswer } from './actors';
import { streamClient } from './streamActor';
import { speech } from '../theme';
import {
  alertDue,
  applyInitialRate,
  assignHelp,
  assignReprompt,
  backLines,
  chimePausing,
  ensureStream,
  flLangLines,
  freshAnswer,
  freshLines,
  hasRequest,
  logHeard,
  logHelp,
  logReprompt,
  micDue,
  muteMic,
  needsFirstLaunch,
  netDue,
  nonEmptyFinal,
  noteAlert,
  noteHeard,
  noteMicComplaint,
  noteNetComplaint,
  noteOver,
  notePaused,
  noteSaid,
  noteSnapshot,
  noteStreamDown,
  noteStreamOpen,
  noteUnderstood,
  pausingLines,
  playHeard,
  quietVoice,
  raiseHeard,
  raiseHelp,
  raiseQuestion,
  raiseReprompt,
  returnSleeping,
  sendStart,
  sendStop,
  spawnStream,
  unmuteMic,
  usePausedNote,
} from './actions';
import type { ContextArgs } from './actions';
import { initialContext } from './context';
import { chimeWake } from './answers';
import { applyTranslated } from './translation';
import { notePartial, partialWorthy, speculatingState } from './speculating';
import { chainActions, routingTransitions } from './routing';
import {
  hasQueuedAlternative,
  hasQueuedSearch,
  resumeSearch,
  sayQueuedAlternative,
  sayQueuedStatus,
  searchRegion,
  searchTalkOn,
  stopSearch,
} from './search';
import type { ConversationContext, ConversationEvent, MachineInput } from './types';


function sayTo(target: 'listening' | 'sleeping' | 'over' | 'resumed' | 'routing', raiseClock: boolean) {
  const resolved = target === 'over' ? '#conversation.over' : target;
  return {
    entry: muteMic,
    invoke: {
      src: 'speakMany' as const,
      input: ({ context }: ContextArgs) => ({ lines: context.pendingSay, lang: context.lang }),
      onDone: { actions: raiseClock ? [noteSaid, raiseQuestion] : [noteSaid], target: resolved },
      onError: { actions: [noteSaid], target: resolved },
    },
    exit: unmuteMic,
  };
}

const listeningShared = {
  FINAL_TEXT: { guard: nonEmptyFinal, actions: [noteHeard, logHeard, raiseHeard], target: 'understanding' },
  SPEECH_ENDED: { actions: [playHeard, raiseHeard] },
  STREAM_OPEN: { actions: [noteStreamOpen] },
};

export const conversationMachine = setup({
  types: { context: {} as ConversationContext, events: {} as ConversationEvent, input: {} as MachineInput },
  actors: { speakMany, understandAnswer, ticking, tourSequence, streamClient },
}).createMachine({
  id: 'conversation',
  context: initialContext,
  initial: 'live',
  states: {
    live: {
      type: 'parallel',
      on: {
        PAUSE: { target: 'paused', actions: [notePaused] },
      },
      states: {
        talk: {
          initial: 'boot',
          on: searchTalkOn,
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
              entry: muteMic,
              invoke: {
                src: 'speakMany',
                input: ({ context }: ContextArgs) => ({ lines: context.pendingSay, lang: context.lang }),
                onDone: { actions: [noteSaid, chainActions.tourOfferLines], target: 'sayingFlTourOffer' },
                onError: { actions: [noteSaid, chainActions.tourOfferLines], target: 'sayingFlTourOffer' },
              },
              exit: unmuteMic,
            },
            sayingFlTourOffer: sayTo('listening', true),
            listening: {
              entry: [ensureStream, noteSnapshot],
              always: [
                { guard: hasQueuedAlternative, actions: [sayQueuedAlternative], target: 'saying' },
                { guard: hasQueuedSearch, actions: [sayQueuedStatus], target: 'sayingReprompt' },
              ],
              on: {
                ...listeningShared,
                PARTIAL_TEXT: [
                  { guard: partialWorthy, actions: [notePartial, raiseHeard], target: 'speculating' },
                  { actions: [raiseHeard] },
                ],
                STREAM_CLOSED: { actions: [noteStreamDown, sendStart] },
                STREAM_ERROR: [
                  { guard: netDue, actions: [noteStreamDown, noteNetComplaint, sendStart], target: 'saying' },
                  { actions: [noteStreamDown, sendStart] },
                ],
                MIC_FAILED: { guard: micDue, actions: [noteMicComplaint], target: 'saying' },
                ALERT: { guard: alertDue, actions: [noteAlert], target: 'saying' },
                REPROMPT: { actions: [assignReprompt, logReprompt], target: 'sayingReprompt' },
                HELP: { actions: [assignHelp, logHelp], target: 'sayingHelp' },
              },
            },
            translating: {
              invoke: {
                src: 'understandAnswer',
                input: ({ context }: ContextArgs) => ({
                  transcript: context.translateSource ?? '',
                  lang: context.lang,
                  step: 'translate',
                  pendingQuestion: null,
                  pendingRequest: context.translateSource,
                  lastLine: '',
                }),
                onDone: { actions: [applyTranslated], target: 'saying' },
                onError: { target: 'saying' },
              },
            },
            speculating: speculatingState,
            understanding: {
              invoke: [
                {
                  src: 'understandAnswer',
                  input: ({ context }: ContextArgs) => ({
                    transcript: context.transcript,
                    lang: context.lang,
                    step: context.step,
                    pendingQuestion: context.pendingQuestion,
                    pendingRequest: context.pendingRequest ?? context.request,
                    lastLine: context.lastLine,
                  }),
                  onDone: [
                    { guard: freshAnswer, actions: [noteUnderstood], target: 'routing' },
                    { target: 'listening' },
                  ],
                  onError: { actions: [noteNetComplaint], target: 'saying' },
                },
                { src: 'ticking', input: { everyMs: speech.workingTickEveryMs } },
              ],
            },
            routing: {
              always: routingTransitions,
            },
            sleeping: {
              entry: [ensureStream, noteSnapshot],
              after: {
                [speech.idlePauseAfterMs]: { actions: [chimePausing, pausingLines], target: 'sayingOver' },
              },
              on: {
                ...listeningShared,
                STREAM_CLOSED: { actions: [noteStreamDown, sendStart] },
                STREAM_ERROR: [
                  { guard: netDue, actions: [noteStreamDown, noteNetComplaint, sendStart], target: 'sayingSleep' },
                  { actions: [noteStreamDown, sendStart] },
                ],
                MIC_FAILED: { guard: micDue, actions: [noteMicComplaint], target: 'sayingSleep' },
                ALERT: { guard: alertDue, actions: [noteAlert], target: 'sayingSleep' },
              },
            },
            touring: {
              entry: muteMic,
              invoke: {
                src: 'tourSequence',
                input: ({ context }: ContextArgs) => ({ lang: context.lang }),
                onDone: { actions: [raiseQuestion], target: 'listening' },
                onError: { actions: [raiseQuestion], target: 'listening' },
              },
              exit: unmuteMic,
            },
            touringFl: {
              entry: muteMic,
              invoke: {
                src: 'tourSequence',
                input: ({ context }: ContextArgs) => ({ lang: context.lang }),
                onDone: { actions: [chainActions.welcomeAfterTour, chainActions.noteTourDone], target: 'saying' },
                onError: { actions: [chainActions.welcomeAfterTour, chainActions.noteTourDone], target: 'saying' },
              },
              exit: unmuteMic,
            },
            resuming: {
              entry: [sendStart],
              always: { actions: [usePausedNote, resumeSearch], target: 'sayingResume' },
            },
            resumed: {
              always: [{ guard: returnSleeping, target: 'sleeping' }, { target: 'listening' }],
            },
          },
        },
        silence: {
          initial: 'quiet',
          states: {
            quiet: {
              on: { QUESTION_ASKED: 'waiting', HEARD: 'quiet' },
            },
            waiting: {
              after: {
                [speech.askAgainMs]: { actions: [raiseReprompt] },
                [speech.offerHelpMs]: { actions: [raiseHelp], target: 'reminding' },
              },
              on: { QUESTION_ASKED: 'waiting', HEARD: 'quiet' },
            },
            reminding: {
              after: {
                [speech.reminderEveryMs]: { actions: [raiseHelp], target: 'reminding' },
              },
              on: { QUESTION_ASKED: 'waiting', HEARD: 'quiet' },
            },
          },
        },
        search: searchRegion,
      },
    },
    paused: {
      entry: [sendStop, quietVoice, stopSearch],
      on: { RESUME: 'live.talk.resuming' },
    },
    over: {
      entry: [sendStop, noteOver],
      on: { RESUME: { target: 'live.talk.resuming', actions: [chimeWake] } },
    },
  },
});
