// The ask slice (shelf-awareness plan steps 3 and 4, decision record
// 0001): a question about what the camera sees is answered in Muse
// Spark's words. When understanding already answered it from the
// still, the answer is said at once; otherwise asking takes a fresh
// still (opening the camera if needed), asks /ask-view with the working
// tick and a 15 s limit, and says the answer or why there is none. An
// answer that names a product offers to take the shopper to it; yes
// starts the normal find, guide and in-hand check.
import { fromPromise } from 'xstate';
import { assignConversation as assign } from './actors';
import { mergeBrands, persistSnapshot, storeConfirmedBrand } from './actors';
import { markTalkBusy, markTalkQuiet } from './actions';
import type { ContextArgs, EventArgs } from './actions';
import type { Route } from './routing';
import type { AskHints, ViewReply } from './askTypes';
import { askHints, looksLikeQuestion } from './askHints';
import { ackLine, noStillLine, pointAtShelfLine, viewDeclinedLine, viewOfferLine, viewTimeoutLine } from './askLines';
import { raiseLinkForError, raiseLinkOk } from './link';
import { raiseSearchBegin } from './search';
import { raiseGuideEnd } from '../guide/guideSay';
import { raiseConfirmEnd } from '../confirm/confirmSay';
import { fireCancel } from '../helper/helperSay';
import { raiseHelperEnd } from '../helper/helper';
import { askAboutView } from '../relay';
import { takeViewStill } from '../shelf/stills';
import { NO_CHIP, YES_CHIP } from '../chips';
import { lookingFor } from '../requestLines';
import { say } from '../speech';
import { speech } from '../theme';
import type { Language } from '../theme';
import { logIttro } from '../log';
import type { ConversationContext } from './types';

export const ASK_TIMEOUT_MS = 15000;
const STILL_FRESH_MS = 4000;
const ACK_GAP_MS = 3000;
const HISTORY_KEEP = 6;

let lastAckAt = 0;

export interface AskViewInput {
  question: string | null;
  wanted: string | null;
  lang: Language;
  hints: AskHints;
}

export class NoStillError extends Error {}

export const askViewActor = fromPromise<ViewReply, AskViewInput>(async ({ input }) => {
  const still = await takeViewStill(Date.now(), STILL_FRESH_MS);
  if (!still) {
    throw new NoStillError('no still of the shelf');
  }
  logIttro(`ask view sent ${JSON.stringify(input.question ?? `not here: ${input.wanted ?? ''}`)} still ${Date.now() - still.at}ms old`);
  const { view, askMs } = await askAboutView({ ...input.hints, question: input.question, wanted: input.wanted, language: input.lang, image: still.image, mime: still.mime });
  logIttro(`ask view ok ${askMs}ms ${JSON.stringify(view)}`);
  return view;
});

/** Starts the acknowledgement gap afresh, for a new conversation. */
export function forgetAck(): void {
  lastAckAt = 0;
}

function ackIfQuestion(text: string, lang: Language): void {
  const now = Date.now();
  if (!looksLikeQuestion(text) || now - lastAckAt < ACK_GAP_MS) {
    return;
  }
  lastAckAt = now;
  const line = ackLine(lang, Math.random());
  logIttro(`ack: ${JSON.stringify(line)}`);
  void say(line, lang);
}

/** As a question ends: a short acknowledgement within half a second, before the answer. */
export const ackSpeculated = ({ context }: ContextArgs): void => ackIfQuestion(context.specText ?? '', context.lang);

export const ackHeard = ({ context }: ContextArgs): void => ackIfQuestion(context.transcript, context.lang);

function replyLines(reply: ViewReply, lang: Language): ConversationContext['pendingSay'] {
  if (!reply.offer) {
    return [{ text: reply.answer, chips: [] }];
  }
  return [{ text: `${reply.answer} ${viewOfferLine(lang)}`, chips: [YES_CHIP[lang], NO_CHIP[lang]] }];
}

function replyAssigns(reply: ViewReply | null) {
  return {
    viewReply: () => reply,
    pendingSay: ({ context }: ContextArgs) => (reply ? replyLines(reply, context.lang) : context.pendingSay),
    alternative: ({ context }: ContextArgs) => reply?.offer ?? context.alternative,
    step: ({ context }: ContextArgs) => (reply?.offer ? 'viewOffer' : context.step === 'viewOffer' ? 'welcome' : context.step),
    pendingQuestion: ({ context }: ContextArgs) => (reply?.offer ? 'view_offer' : context.pendingQuestion),
    viewHistory: ({ context }: ContextArgs) =>
      reply ? [...context.viewHistory, { shopper: context.transcript, ittro: reply.answer, heard: false }].slice(-HISTORY_KEEP) : context.viewHistory,
  };
}

const storeRoutedView = assign(({ context }) => {
  const reply = context.routeAnswer?.view ?? null;
  return Object.fromEntries(Object.entries(replyAssigns(reply)).map(([key, value]) => [key, value({ context })])) as Partial<ConversationContext>;
});

const storeAskedView = assign(({ context, event }) => {
  const reply = 'output' in event ? ((event.output as ViewReply | undefined) ?? null) : null;
  return Object.fromEntries(Object.entries(replyAssigns(reply)).map(([key, value]) => [key, value({ context })])) as Partial<ConversationContext>;
});

const noteViewQuestion = assign({
  viewQuestion: ({ context }) => context.routeAnswer?.question ?? context.transcript,
  viewWanted: null,
});

const openViewCamera = assign({
  viewCamera: ({ context }) => !context.cameraOn,
  cameraOn: true,
});

const closeViewCamera = assign({
  cameraOn: ({ context }) => (context.viewCamera && !context.searching && !context.confirming && !context.guiding ? false : context.cameraOn),
  viewCamera: false,
});

const pointIfOpened = ({ context }: ContextArgs): void => {
  if (context.viewCamera) {
    lastAckAt = Date.now();
    void say(pointAtShelfLine(context.lang), context.lang);
  }
};

const sayNoStill = assign({ pendingSay: ({ context }) => [{ text: noStillLine(context.lang), chips: [] }] });

const sayTimedOut = assign({ pendingSay: ({ context }) => [{ text: viewTimeoutLine(context.lang), chips: [] }] });

const logAskFailed = ({ event }: EventArgs): void => {
  logIttro(`ask view failed: ${String(('error' in event ? (event.error as Error)?.message : null) ?? 'unknown')}`);
};

const noStill = ({ event }: EventArgs): boolean => 'error' in event && event.error instanceof NoStillError;

/** After the line is said: the turn's answer counts as heard in full. */
export const markViewHeard = assign({
  viewHistory: ({ context }) => {
    const last = context.viewHistory[context.viewHistory.length - 1];
    if (!last || last.heard || !context.pendingSay.some((line) => line.text.includes(last.ittro))) {
      return context.viewHistory;
    }
    return [...context.viewHistory.slice(0, -1), { ...last, heard: true }];
  },
});

export const noteViewBrief = assign({
  viewBrief: ({ context }) => (context.routeAnswer?.intent === 'shorter' ? true : context.routeAnswer?.intent === 'more_detail' ? false : context.viewBrief),
});

const startViewOffer = assign({
  step: 'welcome',
  pendingQuestion: null,
  pendingRequest: null,
  pendingItems: null,
  request: ({ context }) => {
    persistSnapshot(context.alternative);
    return context.alternative;
  },
  brands: ({ context }) => {
    storeConfirmedBrand(context.alternative);
    return mergeBrands(context.brands, context.alternative);
  },
  alternative: null,
  pendingSay: ({ context }) => [{ text: lookingFor(context.alternative ?? '', context.lang), chips: [] }],
});

const declineViewOffer = assign({
  step: 'welcome',
  pendingQuestion: null,
  alternative: null,
  pendingSay: ({ context }) => [{ text: viewDeclinedLine(context.lang), chips: [] }],
});

type Guard = (args: { context: ConversationContext }) => boolean;

const askAnswered: Guard = ({ context }) => context.routeAnswer?.intent === 'ask_view' && !!context.routeAnswer.view;

const askPending: Guard = ({ context }) => context.routeAnswer?.intent === 'ask_view';

const viewOfferYes: Guard = ({ context }) =>
  context.step === 'viewOffer' && context.routeAnswer?.intent === 'confirm_yes' && context.alternative !== null;

const viewOfferNo: Guard = ({ context }) => context.step === 'viewOffer' && context.routeAnswer?.intent === 'confirm_no';

export const askRoutes: Route[] = [
  { guard: askAnswered, actions: [storeRoutedView], target: 'saying' },
  { guard: askPending, actions: [noteViewQuestion], target: 'asking' },
  { guard: viewOfferYes, actions: [startViewOffer, raiseSearchBegin, raiseGuideEnd, raiseConfirmEnd, fireCancel, raiseHelperEnd], target: 'saying' },
  { guard: viewOfferNo, actions: [declineViewOffer], target: 'saying' },
];

export const askingState = {
  entry: [markTalkBusy, openViewCamera, pointIfOpened],
  exit: [markTalkQuiet, closeViewCamera],
  invoke: [
    {
      src: 'askView' as const,
      input: ({ context }: ContextArgs): AskViewInput => ({
        question: context.viewQuestion,
        wanted: null,
        lang: context.lang,
        hints: askHints(context, context.transcript, Date.now()),
      }),
      onDone: { actions: [storeAskedView, raiseLinkOk], target: 'saying' },
      onError: [
        { guard: noStill, actions: [logAskFailed, sayNoStill], target: 'saying' },
        { actions: [logAskFailed, raiseLinkForError], target: 'listening' },
      ],
    },
    { src: 'ticking' as const, input: { everyMs: speech.workingTickEveryMs } },
  ],
  after: { [ASK_TIMEOUT_MS]: { actions: [sayTimedOut], target: 'saying' } },
};
