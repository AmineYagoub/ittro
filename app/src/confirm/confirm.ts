// The confirm side of the conversation: checking the held product
// is a state with its moment. A verdict lands only while its moment
// is current, the same state and the same epoch. A late answer, or
// one about a hand that has since moved, finds the statechart
// already elsewhere and is never spoken.
import type { ContextArgs } from '../conversation/actions';
import { REPEAT_MS } from '../guide/guideSay';
import {
  NET_UPDATE_MS,
  beginConfirm,
  beginDetail,
  beginQuiet,
  chimeNo,
  chimeUnsure,
  chimeYes,
  endConfirm,
  failedNew,
  freshConfirm,
  noteUnsure,
  storeDetail,
  storeFailed,
  storeGiveup,
  storeMoved,
  storeNo,
  storePicture,
  storeUnsure,
  storeYes,
  wantsCheck,
  wantsDetail,
} from './confirmSay';

function speakState() {
  return {
    invoke: {
      src: 'speakParts' as const,
      input: ({ context }: ContextArgs) => ({ parts: context.confirmParts, lang: context.lang }),
    },
  };
}

export const confirmRegion = {
  id: 'confirm',
  initial: 'idle',
  on: {
    CONFIRM_BEGIN: { actions: [beginConfirm], target: '#confirm.checking' },
    CONFIRM_AUTO: { actions: [beginQuiet], target: '#confirm.checking' },
    CONFIRM_DETAIL_ASK: { guard: wantsDetail, actions: [beginDetail], target: '#confirm.readingDetail' },
    CONFIRM_END: { actions: [endConfirm], target: '#confirm.idle' },
  },
  states: {
    idle: {
      always: { guard: wantsCheck, target: 'checking' },
    },
    checking: {
      ...speakState(),
      after: { [NET_UPDATE_MS]: { target: 'checking', reenter: true } },
      on: {
        CONFIRM_YES: { guard: freshConfirm, actions: [storeYes], target: 'yes' },
        CONFIRM_NO: { guard: freshConfirm, actions: [storeNo], target: 'no' },
        CONFIRM_UNSURE: { guard: freshConfirm, actions: [storeUnsure], target: 'unsure' },
        CONFIRM_PICTURE: { guard: freshConfirm, actions: [storePicture], target: 'picture' },
        CONFIRM_MOVED: { guard: freshConfirm, actions: [storeMoved], target: 'checking', reenter: true },
        CONFIRM_FAILED: [
          { guard: failedNew, actions: [storeFailed], target: 'checking', reenter: true },
          { actions: [] },
        ],
      },
    },
    unsure: {
      entry: [chimeUnsure],
      ...speakState(),
      on: {
        CONFIRM_YES: { guard: freshConfirm, actions: [storeYes], target: 'yes' },
        CONFIRM_NO: { guard: freshConfirm, actions: [storeNo], target: 'no' },
        CONFIRM_UNSURE: { guard: freshConfirm, actions: [noteUnsure] },
        CONFIRM_PICTURE: { guard: freshConfirm, actions: [storePicture], target: 'picture' },
        CONFIRM_MOVED: { guard: freshConfirm, actions: [storeMoved], target: 'checking' },
        CONFIRM_FAILED: { actions: [] },
        CONFIRM_GIVEUP: { actions: [storeGiveup], target: 'giveup' },
      },
    },
    yes: {
      entry: [chimeYes],
      ...speakState(),
    },
    no: {
      entry: [chimeNo],
      ...speakState(),
      after: { [REPEAT_MS]: { target: 'no', reenter: true } },
    },
    picture: {
      ...speakState(),
    },
    giveup: {
      entry: [chimeUnsure],
      ...speakState(),
    },
    readingDetail: {
      ...speakState(),
      after: { [NET_UPDATE_MS]: { target: 'readingDetail', reenter: true } },
      on: {
        CONFIRM_DETAIL: { guard: freshConfirm, actions: [storeDetail], target: 'detail' },
        CONFIRM_MOVED: { guard: freshConfirm, actions: [storeMoved], target: 'readingDetail', reenter: true },
        CONFIRM_FAILED: [
          { guard: failedNew, actions: [storeFailed], target: 'readingDetail', reenter: true },
          { actions: [] },
        ],
      },
    },
    detail: {
      ...speakState(),
    },
  },
};
