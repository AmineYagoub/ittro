// The search side of the conversation: looking starts while Ittro asks
// "Is that right?", a "no" drops it at once, and a pause stops it.
// Shelf results queue their lines at the talk level, so nothing heard
// mid-sentence is lost; listening speaks them when it can.
import { assignConversation as assign, raiseConversation as raise } from './actors';
import type { ContextArgs, EventArgs } from './actions';
import { ASK_CHIP, LOOK_AGAIN_CHIP } from '../chips';
import { raiseLinkKind } from './link';
import { logIttro } from '../log';
import { lookingFor, shortProduct, stillLooking } from '../requestLines';
import {
  checkingLine,
  holdPhoneLine,
  readingLine,
  searchingLine,
  searchingStatusLine,
  shelfFoundLine,
  shelfSweptLine,
  wrongShelfLine,
} from '../shelf/searchLines';
import type { ConversationContext, GuidePosition, SearchAnnouncement } from './types';
import { decideTarget } from './searchTarget';
import { placedTarget } from '../guide/placedBox';

export const raiseSearchBegin = raise({ type: 'SEARCH_BEGIN' });

export const raiseSearchEnd = raise({ type: 'SEARCH_END' });

function queueLine(context: ConversationContext, line: SearchAnnouncement): SearchAnnouncement[] {
  return [...context.pendingSearch, line].slice(-3);
}

export const beginSearch = assign({
  searching: true,
  cameraOn: true,
  searchEpoch: ({ context }: ContextArgs) => context.searchEpoch + 1,
});

export const endSearch = assign({
  searching: false,
  cameraOn: false,
  outlines: [],
  checkedCount: 0,
  pendingSearch: [],
  alternative: null,
  shelfTarget: null,
  searchEpoch: ({ context }: ContextArgs) => context.searchEpoch + 1,
});

function shelfSide(context: ConversationContext): GuidePosition {
  const target = context.shelfTarget;
  if (!target) {
    return 'middle';
  }
  return (target.box.x1 + target.box.x2) / 2 < target.box.w / 2 ? 'left' : 'right';
}

export const resumeGuideShelf = assign({
  guiding: true,
  guideRestarting: true,
  guideTarget: ({ context }: ContextArgs) => context.shelfTarget,
  guideLabel: ({ context }: ContextArgs) => shortProduct(context.pendingRequest ?? context.request ?? ''),
  guidePosition: ({ context }: ContextArgs) => shelfSide(context),
});

export const stopSearch = assign({
  searching: false,
  cameraOn: false,
  outlines: [],
  pendingSearch: [],
  searchEpoch: ({ context }: ContextArgs) => context.searchEpoch + 1,
});

export const resumeSearch = assign({
  searching: ({ context }: ContextArgs) => (context.pendingRequest ?? context.request) !== null && !context.confirming,
  cameraOn: ({ context }: ContextArgs) => (context.pendingRequest ?? context.request) !== null,
});

export const storeOutlined = assign({
  outlines: ({ event }: EventArgs) => (event.type === 'SHELF_OUTLINED' ? event.outlines : []),
  guideTarget: ({ context, event }: EventArgs) =>
    event.type === 'SHELF_OUTLINED'
      ? decideTarget(placedTarget(context.guideTarget, Date.now()), event.outlines, context.guideHand).outline
      : context.guideTarget,
  guideRecheck: ({ context, event }: EventArgs) =>
    event.type === 'SHELF_OUTLINED'
      ? decideTarget(placedTarget(context.guideTarget, Date.now()), event.outlines, context.guideHand).recheck
      : context.guideRecheck,
  checkedCount: ({ context, event }: EventArgs) =>
    event.type === 'SHELF_OUTLINED' ? context.checkedCount + event.outlines.length : context.checkedCount,
  // "I see two products, reading their labels" once a search, not on
  // every pass (t9 said it twice in eight seconds).
  pendingSearch: ({ context, event }: EventArgs) =>
    event.type === 'SHELF_OUTLINED' && !(context.shelfTarget ?? context.guideTarget) && context.readingSaidEpoch !== context.searchEpoch
      ? queueLine(context, { text: readingLine(event.outlines.length, event.kind, context.lang), chips: [], kind: 'status' })
      : context.pendingSearch,
  readingSaidEpoch: ({ context, event }: EventArgs) =>
    event.type === 'SHELF_OUTLINED' && !(context.shelfTarget ?? context.guideTarget) ? context.searchEpoch : context.readingSaidEpoch,
});

export const storeSwept = assign({
  pendingSearch: ({ context, event }: EventArgs) =>
    event.type === 'SHELF_SWEPT'
      ? queueLine(context, {
          text: shelfSweptLine(event.checked, context.pendingRequest ?? context.request ?? '', context.lang),
          chips: [],
          kind: 'status',
        })
      : context.pendingSearch,
});

export const storeWrongShelf = assign({
  pendingSearch: ({ context, event }: EventArgs) =>
    event.type === 'WRONG_SHELF'
      ? queueLine(context, {
          text: wrongShelfLine(event.shelf, shortProduct(event.product), context.lang),
          chips: [LOOK_AGAIN_CHIP[context.lang], ASK_CHIP[context.lang]],
          kind: 'status',
        })
      : context.pendingSearch,
});

export const storeHandHold = assign({
  pendingSearch: ({ context }: ContextArgs) =>
    queueLine(context, { text: checkingLine(context.lang), chips: [], kind: 'status' }),
});

export const logSearchBegin = ({ context }: ContextArgs): void => {
  logIttro(`search begin ${JSON.stringify(context.pendingRequest ?? context.request)} epoch ${context.searchEpoch}`);
};

export const logOutlined = ({ context, event }: EventArgs): void => {
  if (event.type === 'SHELF_OUTLINED') {
    logIttro(`search outlined epoch ${context.searchEpoch} count ${event.outlines.length}`);
  }
};

export const foundWithoutOutline = ({ event }: EventArgs): boolean =>
  event.type === 'SHELF_FOUND' && event.outline === null;

export const storeFound = assign({
  pendingSearch: ({ context, event }: EventArgs) =>
    event.type === 'SHELF_FOUND'
      ? queueLine(context, { text: shelfFoundLine(event.product, event.position, context.lang), chips: [], kind: 'status' })
      : context.pendingSearch,
});

export const storeNoShelf = assign({
  pendingSearch: ({ context, event }: EventArgs) =>
    event.type === 'NO_SHELF'
      ? queueLine(context, { text: holdPhoneLine(context.lang, event.floor), chips: [], kind: 'status' })
      : context.pendingSearch,
});

export const storeMoved = assign({
  outlines: ({ event }: EventArgs) => (event.type === 'OUTLINES_MOVED' ? event.outlines : []),
  guideTarget: ({ context, event }: EventArgs) =>
    event.type === 'OUTLINES_MOVED'
      ? decideTarget(placedTarget(context.guideTarget, Date.now()), event.outlines, context.guideHand).outline
      : context.guideTarget,
  guideRecheck: ({ context, event }: EventArgs) =>
    event.type === 'OUTLINES_MOVED'
      ? decideTarget(placedTarget(context.guideTarget, Date.now()), event.outlines, context.guideHand).recheck
      : context.guideRecheck,
});

export const storeTurn = assign({
  pendingSearch: ({ context, event }: EventArgs) =>
    event.type === 'SHELF_TURN'
      ? queueLine(context, {
          text: searchingLine(context.pendingRequest ?? context.request ?? '', event.direction, context.lang),
          chips: [],
          kind: 'status',
        })
      : context.pendingSearch,
});

export const sayQueuedAlternative = assign({
  step: 'alternative',
  pendingQuestion: 'close_alternative',
  pendingSay: ({ context }: ContextArgs) => {
    const [head] = context.pendingSearch;
    return head ? [{ text: head.text, chips: head.chips }] : [];
  },
  pendingSearch: ({ context }: ContextArgs) => context.pendingSearch.slice(1),
});

export const sayQueuedStatus = assign({
  pendingSay: ({ context }: ContextArgs) => {
    const [head] = context.pendingSearch;
    return head ? [{ text: head.text, chips: head.chips }] : [];
  },
  pendingSearch: ({ context }: ContextArgs) => context.pendingSearch.slice(1),
});

export const speechFree = ({ context }: ContextArgs): boolean =>
  context.pendingQuestion === null && !context.confirming && !context.guiding;

export const hasQueuedSearch = ({ context }: ContextArgs): boolean =>
  context.pendingSearch.length > 0 && speechFree({ context });

export const hasQueuedAlternative = ({ context }: ContextArgs): boolean =>
  context.pendingSearch[0]?.kind === 'alternative' && speechFree({ context });

export const wantsSearch = ({ context }: ContextArgs): boolean => context.searching;

export const searchStopped = ({ context }: ContextArgs): boolean => !context.searching;

export const searchTalkOn = {
  SHELF_OUTLINED: { actions: [storeOutlined, logOutlined] },
  SHELF_SWEPT: { actions: [storeSwept] },
  WRONG_SHELF: { actions: [storeWrongShelf] },
  HAND_HOLD: { actions: [storeHandHold] },
  SEARCH_FAILED: { actions: [raiseLinkKind] },
  SHELF_FOUND: { guard: foundWithoutOutline, actions: [storeFound] },
  NO_SHELF: { actions: [storeNoShelf] },
  OUTLINES_MOVED: { actions: [storeMoved] },
  SHELF_TURN: { actions: [storeTurn] },
};

export const searchRegion = {
  initial: 'idle',
  states: {
    idle: {
      always: { guard: wantsSearch, target: 'active' },
      on: { SEARCH_BEGIN: { actions: [beginSearch, logSearchBegin], target: 'active' } },
    },
    active: {
      always: { guard: searchStopped, target: 'idle' },
      on: {
        SEARCH_BEGIN: { actions: [beginSearch, logSearchBegin] },
        SEARCH_END: { actions: [endSearch], target: 'idle' },
      },
    },
  },
};

export const adoptAlternative = assign({
  request: ({ context }: ContextArgs) => context.alternative ?? context.request,
  step: 'welcome',
  pendingQuestion: null,
  alternative: null,
  pendingSay: ({ context }: ContextArgs) => [{ text: lookingFor(context.alternative ?? context.request ?? '', context.lang), chips: [] }],
});

export const declineAlternative = assign({
  step: 'welcome',
  pendingQuestion: null,
  alternative: null,
  pendingSay: ({ context }: ContextArgs) => [{ text: stillLooking(context.request ?? '', context.lang), chips: [] }],
});

export const saySearchingStatus = assign({
  pendingSay: ({ context }: ContextArgs) => [
    {
      text: searchingStatusLine(context.pendingRequest ?? context.request ?? '', context.checkedCount, context.lang),
      chips: [],
    },
  ],
});
