// What each in-hand verdict says and clears: the assigns behind
// the yes, no, unsure, picture, moved, giveup and detail moments.
// A no names the held product and the way back, then the no state
// guides to the shelf target or searches again on its own. Final
// verdicts clear a helper no, so it never guides twice.
import { assignConversation as assign, mergeBrands, storeConfirmedBrand } from '../conversation/actors';
import type { ContextArgs, EventArgs } from '../conversation/actions';
import { DONE_CHIP, FIND_ANOTHER_CHIP, GUIDE_CHIP, READ_AGAIN_CHIP } from '../chips';
import { shortProduct } from '../requestLines';
import { logIttro } from '../log';
import { partsText, thisIsLine, whereSentence } from '../guide/lines';
import type { GuideDir } from '../guide/types';
import {
  backToShelfLine,
  detailMiss,
  detailSays,
  giveupLine,
  movedLine,
  pictureLine,
  unsureBody,
  yesNext,
} from './lines';
import type { ConversationContext, SpeechPart } from '../conversation/types';

export function shown(parts: SpeechPart[], context: ConversationContext): string {
  return partsText(parts, context.lang);
}

function wayBack(context: ConversationContext): SpeechPart[] {
  const target = context.shelfTarget;
  const request = context.pendingRequest ?? context.request;
  if (!target || !request || target.box.w <= 0) {
    return [];
  }
  const center = (target.box.x1 + target.box.x2) / 2;
  const dir: GuideDir = center < target.box.w / 2 ? 'left' : 'right';
  return [{ text: whereSentence(shortProduct(request), dir, context.lang) }];
}

function yesParts(label: string, context: ConversationContext): SpeechPart[] {
  return [{ clip: 'yes' }, { text: thisIsLine(label, context.lang) }, { text: yesNext(context.lang) }];
}

function noParts(label: string, context: ConversationContext): SpeechPart[] {
  const back = wayBack(context);
  const tail = back.length > 0 ? back : [{ text: backToShelfLine(context.lang) }];
  return [{ clip: 'no' }, { text: thisIsLine(label, context.lang) }, { clip: 'put_back' }, ...tail];
}

export const hasShelfTarget = ({ context }: ContextArgs): boolean => context.shelfTarget !== null;

export const noteVerdictDone = assign({
  step: 'welcome',
  pendingQuestion: null,
});

export const logAutoGuideAfterNo = ({ context }: ContextArgs): void => {
  logIttro(`guide auto after no epoch ${context.searchEpoch}`);
};

export const logAutoSearchAfterNo = ({ context }: ContextArgs): void => {
  logIttro(`search auto after no epoch ${context.searchEpoch}`);
};

const clearHelperNo = { helperAnswer: null, helperVerdict: null };

export const storeYes = assign({
  confirming: false,
  confirmVerdict: 'yes',
  confirmFinal: true,
  step: 'verdict',
  pendingQuestion: 'verdict_done',
  ...clearHelperNo,
  brands: ({ context, event }: EventArgs) => {
    const label = event.type === 'CONFIRM_YES' ? event.label : null;
    storeConfirmedBrand(label);
    return mergeBrands(context.brands, label);
  },
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
  ...clearHelperNo,
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
  confirmLabel: ({ context, event }: EventArgs) => (event.type === 'CONFIRM_UNSURE' && event.label !== '' ? event.label : context.confirmLabel),
  confirmCrop: ({ context, event }: EventArgs) => (event.type === 'CONFIRM_UNSURE' && event.crop !== '' ? event.crop : context.confirmCrop),
  confirmRead: ({ context, event }: EventArgs) => (event.type === 'CONFIRM_UNSURE' && (event.read.length > 0 || event.missing.length > 0) ? event.read : context.confirmRead),
  confirmMissing: ({ context, event }: EventArgs) => (event.type === 'CONFIRM_UNSURE' && (event.read.length > 0 || event.missing.length > 0) ? event.missing : context.confirmMissing),
});

// A turned or blurry label asks for a phone action and keeps reading:
// the check is not over until a yes, a no or a give-up.
export const storePicture = assign({
  confirmVerdict: 'picture',
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
  ...clearHelperNo,
  confirmParts: ({ context }: ContextArgs) => [{ text: giveupLine(context.confirmMissing, context.lang) }],
  lastLine: ({ context }: ContextArgs) => giveupLine(context.confirmMissing, context.lang),
  lastChips: [],
});

export const storeDetail = assign({
  confirming: false,
  confirmFinal: true,
  step: 'verdict',
  pendingQuestion: 'verdict_done',
  ...clearHelperNo,
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
