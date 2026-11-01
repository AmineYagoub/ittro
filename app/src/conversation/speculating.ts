// Speculative understanding: while the shopper is still speaking,
// partial transcripts start understanding early. When the final text
// matches what was speculated, its answer routes at once.
import { assignConversation as assign } from './actors';
import type { ContextArgs } from './actions';
import { consumedFinal, logConsumedFinal } from './consumed';
import { understandInput } from './askHints';
import { ackSpeculated } from './askView';
import {
  alertDue,
  assignHelp,
  assignReprompt,
  logEchoDrop,
  logHeard,
  logHeardStripped,
  logHelp,
  logReprompt,
  micDue,
  nonEmptyFinal,
  noteAlert,
  noteHeard,
  noteHeardStripped,
  noteMicComplaint,
  noteStreamDown,
  noteStreamOpen,
  playHeard,
  raiseHeard,
  repromptFree,
} from './actions';
import { echoFull, echoStripped } from './echo';
import { sendStart } from './streamCtl';
import { raiseLinkDown, raiseLinkOk } from './link';
import { logIttro } from '../log';
import type { UnderstandAnswer } from '../relay';
import type { ConversationContext, ExpressionEvent } from './types';

interface SpecArgs {
  context: ConversationContext;
  event: ExpressionEvent;
}

const YES_STABLE_MS = 800;

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
  lastPartialAt: () => Date.now(),
});

export const specYesReady = ({ context }: ContextArgs): boolean =>
  context.specAnswer !== null && context.specAnswer.intent === 'confirm_yes' && context.specEpoch === context.epoch;

export const specYesStale = ({ context }: SpecArgs): boolean =>
  specYesReady({ context }) && context.lastPartialAt !== null && Date.now() - context.lastPartialAt > YES_STABLE_MS;

// An early route remembers the text it routed: the final of that
// same sentence lands a moment later, and must not be understood a
// second time (it said "I didn't catch that" twice, 30 ms apart).
export const noteSpecEarly = assign({
  transcript: ({ context }: ContextArgs) => context.specText ?? '',
  routeAnswer: ({ context }: ContextArgs) => context.specAnswer,
  misses: 0,
  consumedText: ({ context }: ContextArgs) => context.specText,
  consumedAt: () => Date.now(),
  specText: null,
  specAnswer: null,
});

export const logSpecEarly = ({ context }: ContextArgs): void => {
  logIttro(`speculative early yes: ${JSON.stringify(context.specText)}`);
};

export const noteSpeculative = assign({
  specAnswer: ({ event }) =>
    'output' in event ? ((event.output as UnderstandAnswer | undefined) ?? null) : null,
});

export const noteSpecClear = assign({
  specAnswer: null,
});

export const noteSpecHit = assign({
  transcript: ({ event }: SpecArgs) => {
    if (event.type === 'FINAL_TEXT') {
      logIttro(`speculative hit: ${JSON.stringify(event.text)}`);
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
    input: ({ context }: ContextArgs) => understandInput(context, context.specText ?? ''),
    onDone: [
      { guard: specYesStale, actions: [logSpecEarly, noteSpecEarly, raiseLinkOk], target: 'routing' },
      { actions: [noteSpeculative, raiseLinkOk] },
    ],
    onError: { actions: [noteSpecClear] },
  },
  after: {
    [YES_STABLE_MS]: { guard: specYesReady, actions: [logSpecEarly, noteSpecEarly], target: 'routing' },
  },
  on: {
    FINAL_TEXT: [
      { guard: consumedFinal, actions: [logConsumedFinal] },
      { guard: finalMatch, actions: [noteSpecHit], target: 'routing' },
      { guard: echoFull, actions: [logEchoDrop] },
      { guard: echoStripped, actions: [noteHeardStripped, logHeardStripped, raiseHeard], target: 'understanding' },
      { guard: nonEmptyFinal, actions: [noteHeard, logHeard, raiseHeard], target: 'understanding' },
    ],
    PARTIAL_TEXT: [
      { guard: echoFull, actions: [logEchoDrop] },
      { guard: partialChanged, actions: [notePartial, raiseHeard], target: 'speculating' },
    ],
    SPEECH_ENDED: [
      { guard: specYesReady, actions: [playHeard, logSpecEarly, noteSpecEarly], target: 'routing' },
      { actions: [playHeard, ackSpeculated, raiseHeard] },
    ],
    STREAM_OPEN: { actions: [noteStreamOpen, raiseLinkOk] },
    STREAM_CLOSED: { actions: [noteStreamDown, sendStart] },
    STREAM_ERROR: { actions: [noteStreamDown, sendStart] },
    STREAM_FAILED: { actions: [noteStreamDown, raiseLinkDown, sendStart] },
    MIC_FAILED: { guard: micDue, actions: [noteMicComplaint], target: 'saying' },
    ALERT: { guard: alertDue, actions: [noteAlert], target: 'saying' },
    REPROMPT: { guard: repromptFree, actions: [assignReprompt, logReprompt], target: 'sayingReprompt' },
    HELP: { guard: repromptFree, actions: [assignHelp, logHelp], target: 'sayingHelp' },
  },
};
