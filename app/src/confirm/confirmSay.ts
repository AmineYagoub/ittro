// What each confirm moment says, shows and feels: the assigns that
// write the verdict line to the screen the moment its chime and
// vibration start, and the guards that drop answers from a moment
// the statechart has already left.
import { Vibration } from 'react-native';
import { assignConversation as assign, raiseConversation as raise } from '../conversation/actors';
import type { ContextArgs, EventArgs } from '../conversation/actions';
import { DONE_CHIP, FIND_ANOTHER_CHIP, GUIDE_CHIP, READ_AGAIN_CHIP } from '../chips';
import { playSound } from '../speech';
import { lostInternet } from '../lines';
import { haptics } from '../theme';
import { partsText, thisIsLine, whereSentence } from '../guide/lines';
import type { GuideDir } from '../guide/types';
import {
  detailMiss,
  detailSays,
  giveupLine,
  movedLine,
  noNext,
  pictureLine,
  unsureBody,
  yesNext,
} from './lines';
import type { ConversationContext, SpeechPart } from '../conversation/types';
import type { DetailKind } from '../relay';

export const raiseConfirmBegin = raise({ type: 'CONFIRM_BEGIN' });

export const raiseConfirmAuto = raise({ type: 'CONFIRM_AUTO' });

export const raiseConfirmEnd = raise({ type: 'CONFIRM_END' });

export const raiseConfirmDetailAsk = raise({ type: 'CONFIRM_DETAIL_ASK' });

export const NET_UPDATE_MS = 8000;

export const chimeYes = (): void => {
  Vibration.vibrate([...haptics.yes]);
  playSound('yes');
};

export const chimeNo = (): void => {
  Vibration.vibrate([...haptics.no]);
  playSound('no');
};

export const chimeUnsure = (): void => {
  Vibration.vibrate([...haptics.notSure]);
  playSound('notSure');
};

function shown(parts: SpeechPart[], context: ConversationContext): string {
  return partsText(parts, context.lang);
}

function wayBack(context: ConversationContext): SpeechPart[] {
  const target = context.guideTarget;
  const request = context.pendingRequest ?? context.request;
  if (!target || !request || target.box.w <= 0) {
    return [];
  }
  const center = (target.box.x1 + target.box.x2) / 2;
  const dir: GuideDir = center < target.box.w / 2 ? 'left' : 'right';
  return [{ text: whereSentence(request, dir, context.lang) }];
}

function yesParts(label: string, context: ConversationContext): SpeechPart[] {
  return [{ clip: 'yes' }, { text: thisIsLine(label, context.lang) }, { text: yesNext(context.lang) }];
}

function noParts(label: string, context: ConversationContext): SpeechPart[] {
  return [
    { clip: 'no' },
    { text: thisIsLine(label, context.lang) },
    { clip: 'put_back' },
    ...wayBack(context),
    { text: noNext(context.lang) },
  ];
}

export const beginConfirm = assign({
  confirming: true,
  searching: false,
  cameraOn: true,
  pendingSearch: [],
  confirmEpoch: ({ context }: ContextArgs) => context.confirmEpoch + 1,
  confirmAsked: true,
  confirmVerdict: null,
  confirmFinal: false,
  confirmLabel: '',
  confirmRead: [],
  confirmMissing: [],
  confirmProblem: null,
  confirmCrop: null,
  confirmDetailKind: null,
  confirmDetailText: null,
  confirmDetailReason: null,
  confirmParts: [{ clip: 'checking' }],
  lastLine: ({ context }: ContextArgs) => shown([{ clip: 'checking' }], context),
  lastChips: [],
});

export const beginQuiet = assign({
  confirming: true,
  searching: false,
  cameraOn: true,
  pendingSearch: [],
  confirmEpoch: ({ context }: ContextArgs) => context.confirmEpoch + 1,
  confirmAsked: false,
  confirmVerdict: null,
  confirmFinal: false,
  confirmLabel: '',
  confirmRead: [],
  confirmMissing: [],
  confirmProblem: null,
  confirmCrop: null,
  confirmDetailKind: null,
  confirmDetailText: null,
  confirmDetailReason: null,
  confirmParts: [],
});

export const setDetailKind = assign({
  confirmDetailKind: ({ context }: ContextArgs) => {
    const detail = context.routeAnswer?.detail;
    const kind: DetailKind | null =
      detail === 'date' || detail === 'size' || detail === 'price' || detail === 'ingredients' ? detail : null;
    return kind;
  },
});

export const beginDetail = assign({
  confirming: true,
  searching: false,
  cameraOn: true,
  pendingSearch: [],
  confirmEpoch: ({ context }: ContextArgs) => context.confirmEpoch + 1,
  confirmAsked: true,
  confirmVerdict: null,
  confirmFinal: false,
  confirmLabel: '',
  confirmRead: [],
  confirmMissing: [],
  confirmProblem: null,
  confirmCrop: null,
  confirmDetailText: null,
  confirmDetailReason: null,
  confirmParts: [{ clip: 'checking' }],
  lastLine: ({ context }: ContextArgs) => shown([{ clip: 'checking' }], context),
  lastChips: [],
});

export const storeYes = assign({
  confirming: false,
  confirmVerdict: 'yes',
  confirmFinal: true,
  step: 'verdict',
  pendingQuestion: 'verdict_done',
  confirmLabel: ({ event }: EventArgs) => (event.type === 'CONFIRM_YES' ? event.label : ''),
  confirmCrop: ({ event }: EventArgs) => (event.type === 'CONFIRM_YES' ? event.crop : null),
  confirmParts: ({ context, event }: EventArgs) => (event.type === 'CONFIRM_YES' ? yesParts(event.label, context) : []),
  lastLine: ({ context, event }: EventArgs) =>
    event.type === 'CONFIRM_YES' ? shown(yesParts(event.label, context), context) : context.lastLine,
  lastChips: ({ context }: ContextArgs) => [FIND_ANOTHER_CHIP[context.lang], DONE_CHIP[context.lang]],
});

export const storeNo = assign({
  confirming: false,
  confirmVerdict: 'no',
  confirmFinal: true,
  step: 'verdict',
  pendingQuestion: 'verdict_done',
  confirmLabel: ({ event }: EventArgs) => (event.type === 'CONFIRM_NO' ? event.label : ''),
  confirmCrop: ({ event }: EventArgs) => (event.type === 'CONFIRM_NO' ? event.crop : null),
  confirmParts: ({ context, event }: EventArgs) => (event.type === 'CONFIRM_NO' ? noParts(event.label, context) : []),
  lastLine: ({ context, event }: EventArgs) =>
    event.type === 'CONFIRM_NO' ? shown(noParts(event.label, context), context) : context.lastLine,
  lastChips: ({ context }: ContextArgs) => [GUIDE_CHIP[context.lang], READ_AGAIN_CHIP[context.lang]],
});

export const storeUnsure = assign({
  confirmVerdict: 'unsure',
  confirmLabel: ({ event }: EventArgs) => (event.type === 'CONFIRM_UNSURE' ? event.label : ''),
  confirmCrop: ({ event }: EventArgs) => (event.type === 'CONFIRM_UNSURE' ? event.crop : null),
  confirmRead: ({ event }: EventArgs) => (event.type === 'CONFIRM_UNSURE' ? event.read : []),
  confirmMissing: ({ event }: EventArgs) => (event.type === 'CONFIRM_UNSURE' ? event.missing : []),
  confirmParts: ({ context, event }: EventArgs) =>
    event.type === 'CONFIRM_UNSURE' ? [{ clip: 'cannot_confirm' }, { text: unsureBody(event.read, event.missing, context.lang) }] : [],
  lastLine: ({ context, event }: EventArgs) =>
    event.type === 'CONFIRM_UNSURE'
      ? shown([{ clip: 'cannot_confirm' }, { text: unsureBody(event.read, event.missing, context.lang) }], context)
      : context.lastLine,
  lastChips: [],
});

export const noteUnsure = assign({
  confirmLabel: ({ event }: EventArgs) => (event.type === 'CONFIRM_UNSURE' ? event.label : ''),
  confirmCrop: ({ event }: EventArgs) => (event.type === 'CONFIRM_UNSURE' ? event.crop : null),
  confirmRead: ({ event }: EventArgs) => (event.type === 'CONFIRM_UNSURE' ? event.read : []),
  confirmMissing: ({ event }: EventArgs) => (event.type === 'CONFIRM_UNSURE' ? event.missing : []),
});

export const storePicture = assign({
  confirming: false,
  confirmVerdict: 'picture',
  confirmFinal: true,
  step: 'verdict',
  pendingQuestion: 'verdict_done',
  confirmProblem: ({ event }: EventArgs) => (event.type === 'CONFIRM_PICTURE' ? event.problem : null),
  confirmParts: ({ context, event }: EventArgs) =>
    event.type === 'CONFIRM_PICTURE' ? [{ text: pictureLine(event.problem, context.lang) }] : [],
  lastLine: ({ context, event }: EventArgs) =>
    event.type === 'CONFIRM_PICTURE' ? pictureLine(event.problem, context.lang) : context.lastLine,
  lastChips: [],
});

export const storeMoved = assign({
  confirmEpoch: ({ context }: ContextArgs) => context.confirmEpoch + 1,
  confirmParts: ({ context }: ContextArgs) => (context.confirmAsked ? [{ text: movedLine(context.lang) }] : []),
  lastLine: ({ context }: ContextArgs) => (context.confirmAsked ? movedLine(context.lang) : context.lastLine),
  lastChips: [],
});

export const storeGiveup = assign({
  confirming: false,
  confirmFinal: true,
  step: 'verdict',
  pendingQuestion: 'verdict_done',
  confirmParts: ({ context }: ContextArgs) => [{ text: giveupLine(context.confirmMissing, context.lang) }],
  lastLine: ({ context }: ContextArgs) => giveupLine(context.confirmMissing, context.lang),
  lastChips: [],
});

export const storeDetail = assign({
  confirming: false,
  confirmFinal: true,
  step: 'verdict',
  pendingQuestion: 'verdict_done',
  confirmCrop: ({ event }: EventArgs) => (event.type === 'CONFIRM_DETAIL' ? event.crop : null),
  confirmDetailText: ({ event }: EventArgs) => (event.type === 'CONFIRM_DETAIL' ? event.text : null),
  confirmDetailReason: ({ event }: EventArgs) => (event.type === 'CONFIRM_DETAIL' ? event.reason : null),
  confirmParts: ({ context, event }: EventArgs) => {
    if (event.type !== 'CONFIRM_DETAIL' || !context.confirmDetailKind) {
      return [];
    }
    const text =
      event.text !== null
        ? detailSays(context.confirmDetailKind, event.text, context.lang)
        : detailMiss(context.confirmDetailKind, event.reason, context.lang);
    return [{ text }];
  },
  lastLine: ({ context, event }: EventArgs) => {
    if (event.type !== 'CONFIRM_DETAIL' || !context.confirmDetailKind) {
      return context.lastLine;
    }
    return event.text !== null
      ? detailSays(context.confirmDetailKind, event.text, context.lang)
      : detailMiss(context.confirmDetailKind, event.reason, context.lang);
  },
  lastChips: [],
});

export const storeFailed = assign({
  confirmParts: ({ context }: ContextArgs) => [{ text: lostInternet[context.lang] }],
  lastLine: ({ context }: ContextArgs) => lostInternet[context.lang],
  lastChips: [],
});

export const endConfirm = assign({
  confirming: false,
  confirmAsked: false,
  confirmVerdict: null,
  confirmFinal: false,
  confirmLabel: '',
  confirmRead: [],
  confirmMissing: [],
  confirmProblem: null,
  confirmCrop: null,
  confirmParts: [],
  confirmDetailKind: null,
  confirmDetailText: null,
  confirmDetailReason: null,
});

export const stopConfirm = assign({
  confirmEpoch: ({ context }: ContextArgs) => context.confirmEpoch + 1,
});

export const freshConfirm = ({ context, event }: EventArgs): boolean =>
  'epoch' in event && typeof event.epoch === 'number' ? event.epoch === context.confirmEpoch : false;

export const failedNew = ({ context }: ContextArgs): boolean => context.lastLine !== lostInternet[context.lang];

export const wantsDetail = ({ context }: ContextArgs): boolean => context.confirmDetailKind !== null;

export const wantsCheck = ({ context }: ContextArgs): boolean => context.confirming && !context.confirmFinal;
