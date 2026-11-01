// The ask slice (shelf-awareness plan steps 3 and 4, decision record
// 0001): a question about what the camera sees is answered in Muse
// Spark's words. When understanding already answered it from the
// still, the answer is said at once; otherwise asking takes a fresh
// still (opening the camera if needed), asks /ask-view with the working
// tick and a 15 s limit, and says the answer or why there is none.
// Speech heard meanwhile is understood as usual. The camera opened for
// a question stays on 20 s for a follow-up. An answer that names a
// product offers to take the shopper to it, kept apart from the
// search's own offer; yes starts the normal find, guide and in-hand
// check, and drops the lines the old search had queued. The quick
// acknowledgement plays only while awake with a fresh shelf still in
// hand, when a view answer is likely, and after the heard earcon.
import { fromPromise } from 'xstate';
import { assignConversation as assign, cancelConversation as cancel, raiseConversation as raise } from './actors';
import { STILL_FRESH_MS as ATTACH_FRESH_MS, mergeBrands, persistSnapshot, storeConfirmedBrand } from './actors';
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
import { freshStill, takeViewStill } from '../shelf/stills';
import { NO_CHIP, YES_CHIP } from '../chips';
import { lookingFor } from '../requestLines';
import { say, sayAfterClip } from '../speech';
import { speech } from '../theme';
import type { Language } from '../theme';
import { logIttro } from '../log';
import type { ConversationContext } from './types';

export const ASK_TIMEOUT_MS = 15000;
const STILL_FRESH_MS = 4000;
const ACK_GAP_MS = 3000;
const HISTORY_KEEP = 6;
const VIEW_CAMERA_HOLD_MS = 20000;
const ACK_AFTER_EARCON_MS = 150;

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

function ackIfQuestion(context: ConversationContext, text: string): void {
  const now = Date.now();
  if (context.step === 'sleep' || !looksLikeQuestion(text) || now - lastAckAt < ACK_GAP_MS || !freshStill(now, ATTACH_FRESH_MS)) {
    return;
  }
  lastAckAt = now;
  const line = ackLine(context.lang, Math.random());
  logIttro(`ack: ${JSON.stringify(line)}`);
  sayAfterClip(line, context.lang, ACK_AFTER_EARCON_MS);
}

/** As a question ends: a short acknowledgement within half a second, before the answer. */
export const ackSpeculated = ({ context }: ContextArgs): void => ackIfQuestion(context, context.specText ?? '');

export const ackHeard = ({ context }: ContextArgs): void => ackIfQuestion(context, context.transcript);

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
    step: ({ context }: ContextArgs) => (reply?.offer ? 'viewOffer' : context.step === 'viewOffer' ? 'welcome' : context.step),
    pendingQuestion: ({ context }: ContextArgs) =>
      reply?.offer ? 'view_offer' : context.pendingQuestion === 'view_offer' ? null : context.pendingQuestion,
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
  viewCamera: ({ context }) => context.viewCamera || !context.cameraOn,
  cameraOn: true,
});

const closeViewCamera = assign({
  cameraOn: ({ context }) => (context.viewCamera && !context.searching && !context.confirming && !context.guiding ? false : context.cameraOn),
  viewCamera: false,
});

const holdViewCamera = raise({ type: 'VIEW_CAMERA_IDLE' }, { delay: VIEW_CAMERA_HOLD_MS, id: 'viewCameraIdle' });

const keepViewCamera = cancel('viewCameraIdle');

const pointIfOff = ({ context }: ContextArgs): void => {
  if (!context.cameraOn) {
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
  pendingSearch: [],
  request: ({ context }) => {
    const offer = context.viewReply?.offer ?? context.request;
    persistSnapshot(offer);
    return offer;
  },
  brands: ({ context }) => {
    const offer = context.viewReply?.offer ?? null;
    storeConfirmedBrand(offer);
    return mergeBrands(context.brands, offer);
  },
  pendingSay: ({ context }) => [{ text: lookingFor(context.viewReply?.offer ?? '', context.lang), chips: [] }],
});

const declineViewOffer = assign({
  step: 'welcome',
  pendingQuestion: null,
  pendingSay: ({ context }) => [{ text: viewDeclinedLine(context.lang), chips: [] }],
});

type Guard = (args: { context: ConversationContext }) => boolean;

const askAnswered: Guard = ({ context }) => context.routeAnswer?.intent === 'ask_view' && !!context.routeAnswer.view;

const askPending: Guard = ({ context }) => context.routeAnswer?.intent === 'ask_view';

const viewOfferYes: Guard = ({ context }) =>
  context.step === 'viewOffer' && context.routeAnswer?.intent === 'confirm_yes' && !!context.viewReply?.offer;

const viewOfferNo: Guard = ({ context }) => context.step === 'viewOffer' && context.routeAnswer?.intent === 'confirm_no';

export const askRoutes: Route[] = [
  { guard: askAnswered, actions: [storeRoutedView], target: 'saying' },
  { guard: askPending, actions: [noteViewQuestion], target: 'asking' },
  { guard: viewOfferYes, actions: [startViewOffer, raiseSearchBegin, raiseGuideEnd, raiseConfirmEnd, fireCancel, raiseHelperEnd], target: 'saying' },
  { guard: viewOfferNo, actions: [declineViewOffer], target: 'saying' },
];

/** The camera opened for questions closes a while after the last one, unless a search, the guide or the check needs it. */
export const askTalkOn = {
  VIEW_CAMERA_IDLE: { actions: [closeViewCamera] },
};

export const askingState = {
  entry: [markTalkBusy, keepViewCamera, pointIfOff, openViewCamera],
  exit: [markTalkQuiet, holdViewCamera],
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
