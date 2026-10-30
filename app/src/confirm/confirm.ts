// The confirm side of the conversation: checking the held product
// is a state with its moment. A verdict lands only while its moment
// is current, the same state and the same epoch. A late answer, or
// one about a hand that has since moved, finds the statechart
// already elsewhere and is never spoken.
import type { ContextArgs, EventArgs } from '../conversation/actions';
import { raiseQuestion } from '../conversation/actions';
import { raiseLinkKind } from '../conversation/link';
import { logIttro } from '../log';
import { REPEAT_MS } from '../guide/guideSay';
import {
  NET_UPDATE_MS,
  beginConfirm,
  beginDetail,
  beginQuiet,
  chimeNo,
  chimeUnsure,
  chimeYes,
  clearConfirmSpeech,
  endConfirm,
  freshConfirm,
  noteUnsure,
  storeDetail,
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

const VERDICT_OF: Record<string, string> = {
  CONFIRM_YES: 'yes',
  CONFIRM_NO: 'no',
  CONFIRM_UNSURE: 'unsure',
  CONFIRM_PICTURE: 'picture',
};

function logVerdict({ event }: EventArgs): void {
  const kind = VERDICT_OF[event.type];
  if (!kind) {
    return;
  }
  const epoch = 'epoch' in event && typeof event.epoch === 'number' ? event.epoch : '?';
  const label = 'label' in event && typeof event.label === 'string' ? ` label ${JSON.stringify(event.label)}` : '';
  logIttro(`confirm verdict ${kind} epoch ${epoch}${label}`);
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
      after: { [NET_UPDATE_MS]: { actions: [clearConfirmSpeech] } },
      on: {
        CONFIRM_YES: { guard: freshConfirm, actions: [logVerdict, storeYes, raiseQuestion], target: 'yes' },
        CONFIRM_NO: { guard: freshConfirm, actions: [logVerdict, storeNo, raiseQuestion], target: 'no' },
        CONFIRM_UNSURE: { guard: freshConfirm, actions: [logVerdict, storeUnsure], target: 'unsure' },
        CONFIRM_PICTURE: { guard: freshConfirm, actions: [logVerdict, storePicture, raiseQuestion], target: 'picture' },
        CONFIRM_MOVED: { guard: freshConfirm, actions: [storeMoved], target: 'checking', reenter: true },
        CONFIRM_FAILED: { actions: [raiseLinkKind] },
      },
    },
    unsure: {
      entry: [chimeUnsure],
      ...speakState(),
      on: {
        CONFIRM_YES: { guard: freshConfirm, actions: [logVerdict, storeYes, raiseQuestion], target: 'yes' },
        CONFIRM_NO: { guard: freshConfirm, actions: [logVerdict, storeNo, raiseQuestion], target: 'no' },
        CONFIRM_UNSURE: { guard: freshConfirm, actions: [noteUnsure] },
        CONFIRM_PICTURE: { guard: freshConfirm, actions: [logVerdict, storePicture, raiseQuestion], target: 'picture' },
        CONFIRM_MOVED: { guard: freshConfirm, actions: [storeMoved], target: 'checking' },
        CONFIRM_FAILED: { actions: [] },
        CONFIRM_GIVEUP: { actions: [storeGiveup, raiseQuestion], target: 'giveup' },
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
        CONFIRM_DETAIL: { guard: freshConfirm, actions: [storeDetail, raiseQuestion], target: 'detail' },
        CONFIRM_MOVED: { guard: freshConfirm, actions: [storeMoved], target: 'readingDetail', reenter: true },
        CONFIRM_FAILED: { actions: [raiseLinkKind] },
      },
    },
    detail: {
      ...speakState(),
    },
  },
};
