// The conversation: one statechart for listening, understanding,
// pausing and the silence timers. The mic stays live while Ittro
// speaks, so the shopper can interrupt; a pause bumps the epoch so
// nothing heard before it is acted on after. Silence re-arms through
// a transient state, because a fired timer never reschedules on a
// self transition: every re-arm enters waiting fresh.
import { setup } from 'xstate';
import { speakMany, speakParts, ticking, tourSequence, understandAnswer } from './actors';
import { askViewActor } from './askView';
import { answerPoll, pairHelper, pairPoll, pulseTick, sendHelp } from '../helper/actors';
import { streamClient } from './streamActor';
import { speech } from '../theme';
import { noteOver, notePaused, quietVoice, raiseHelp, raiseReprompt } from './actions';
import { sendStop } from './streamCtl';
import { initialContext } from './context';
import { chimeWake } from './answers';
import { talkState } from './talk';
import { isVolumeHold, noteRepeatWake } from './buttons';
import { guideRegion } from '../guide/guide';
import { stopGuide } from '../guide/guideSay';
import { confirmRegion } from '../confirm/confirm';
import { endConfirm, stopConfirm } from '../confirm/confirmSay';
import { searchRegion, stopSearch } from './search';
import { linkRegion } from './link';
import { helperRegion } from '../helper/helper';
import type { ConversationContext, ConversationEvent, MachineInput } from './types';

export const conversationMachine = setup({
  types: { context: {} as ConversationContext, events: {} as ConversationEvent, input: {} as MachineInput },
  actors: { speakMany, speakParts, understandAnswer, askView: askViewActor, ticking, tourSequence, streamClient, pairHelper, sendHelp, pairPoll, answerPoll, pulseTick },
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
        talk: talkState,
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
              on: { QUESTION_ASKED: 'arming', HEARD: 'quiet' },
            },
            arming: {
              always: 'waiting',
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
        guide: guideRegion,
        confirm: confirmRegion,
        helper: helperRegion,
        link: linkRegion,
      },
    },
    paused: {
      entry: [sendStop, quietVoice, stopSearch, stopGuide, stopConfirm],
      on: { RESUME: 'live.talk.resuming' },
    },
    over: {
      entry: [sendStop, noteOver, stopGuide, endConfirm],
      on: {
        RESUME: { target: 'live.talk.resuming', actions: [chimeWake] },
        BUTTON_PRESS: [
          { guard: isVolumeHold, actions: [chimeWake, noteRepeatWake], target: 'live.talk.resuming' },
          { actions: [chimeWake], target: 'live.talk.resuming' },
        ],
      },
    },
  },
});
