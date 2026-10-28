// Speculative understanding: while the shopper is still speaking,
// partial transcripts start understanding early. When the final text
// matches what was speculated, its answer routes at once.
import { assignConversation as assign } from './actors';
import type { ContextArgs } from './actions';
import {
  alertDue,
  assignHelp,
  assignReprompt,
  logHeard,
  logHelp,
  logReprompt,
  micDue,
  nonEmptyFinal,
  noteAlert,
  noteHeard,
  noteMicComplaint,
  noteNetComplaint,
  noteStreamDown,
  playHeard,
  quietVoice,
  raiseHeard,
  sendStart,
} from './actions';
import { stamp } from '../stamp';
import type { UnderstandAnswer } from '../relay';
import type { ConversationContext, ExpressionEvent } from './types';

interface SpecArgs {
  context: ConversationContext;
  event: ExpressionEvent;
}

function heardText(event: ExpressionEvent): string | null {
  return event.type === 'PARTIAL_TEXT' || event.type === 'FINAL_TEXT' ? event.text : null;
}

export const partialWorthy = ({ event }: SpecArgs): boolean => {
  const text = heardText(event);
  return text !== null && text.trim().length >= 4;
};

export const partialChanged = ({ context, event }: SpecArgs): boolean => {
  const text = heardText(event);
  return text !== null && text.trim().length >= 4 && text !== context.specText;
};

export const finalMatch = ({ context, event }: SpecArgs): boolean =>
  event.type === 'FINAL_TEXT' &&
  event.text === context.specText &&
  context.specAnswer !== null &&
  context.specEpoch === context.epoch;

export const notePartial = assign({
  specText: ({ event }) => heardText(event),
  specAnswer: null,
  specEpoch: ({ context }) => context.epoch,
});

export const noteSpeculative = assign({
  specAnswer: ({ event }) =>
    'output' in event ? ((event.output as UnderstandAnswer | undefined) ?? null) : null,
});

export const noteSpecClear = assign({
  specAnswer: null,
});

export const noteSpecHit = assign({
  transcript: ({ event }: SpecArgs) => {
    if (__DEV__ && event.type === 'FINAL_TEXT') {
      console.log(`[ittro] ${stamp()} speculative hit: ${JSON.stringify(event.text)}`);
    }
    return event.type === 'FINAL_TEXT' ? event.text : '';
  },
  routeAnswer: ({ context }) => context.specAnswer,
  misses: 0,
  specText: null,
  specAnswer: null,
});

export const speculatingState = {
  invoke: {
    src: 'understandAnswer' as const,
    input: ({ context }: ContextArgs) => ({
      transcript: context.specText ?? '',
      lang: context.lang,
      step: context.step,
      pendingQuestion: context.pendingQuestion,
      pendingRequest: context.pendingRequest ?? context.request,
      lastLine: context.lastLine,
    }),
    onDone: { actions: [noteSpeculative] },
    onError: { actions: [noteSpecClear] },
  },
  on: {
    FINAL_TEXT: [
      { guard: finalMatch, actions: [noteSpecHit], target: 'routing' },
      { guard: nonEmptyFinal, actions: [noteHeard, logHeard, raiseHeard], target: 'understanding' },
    ],
    PARTIAL_TEXT: { guard: partialChanged, actions: [notePartial, raiseHeard], target: 'speculating' },
    SPEECH_ENDED: { actions: [playHeard, raiseHeard] },
    STREAM_OPEN: { actions: [sendStart] },
    STREAM_CLOSED: { actions: [quietVoice, noteStreamDown, noteNetComplaint] },
    STREAM_ERROR: { actions: [quietVoice, noteStreamDown, noteNetComplaint] },
    MIC_FAILED: { guard: micDue, actions: [noteMicComplaint], target: 'saying' },
    ALERT: { guard: alertDue, actions: [noteAlert], target: 'saying' },
    REPROMPT: { actions: [assignReprompt, logReprompt], target: 'sayingReprompt' },
    HELP: { actions: [assignHelp, logHelp], target: 'sayingHelp' },
  },
};
