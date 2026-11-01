// A saying state: speak the queued lines, then go where the caller
// says, with the barge-in rules live the whole time. The clock is
// raised after a question, so its reprompt timer starts as the
// voice ends.
import { bargeIn } from './bargeIn';
import { noteVoice } from './echo';
import { markTalkBusy, markTalkQuiet, noteSaid, noteSaying, raiseQuestion } from './actions';
import type { ContextArgs } from './actions';
import { markViewHeard } from './askView';

export function sayTo(target: 'listening' | 'sleeping' | 'over' | 'resumed' | 'routing' | 'translating', raiseClock: boolean) {
  const resolved = target === 'over' ? '#conversation.over' : target;
  return {
    entry: [markTalkBusy, noteVoice, noteSaying],
    invoke: {
      src: 'speakMany' as const,
      input: ({ context }: ContextArgs) => ({ lines: context.pendingSay, lang: context.lang }),
      onDone: { actions: raiseClock ? [markViewHeard, noteSaid, raiseQuestion] : [markViewHeard, noteSaid], target: resolved },
      onError: { actions: [noteSaid], target: resolved },
    },
    exit: [markTalkQuiet],
    on: bargeIn,
  };
}
