// Starting and stopping the in-hand check: the assigns behind
// begin, detail and end, the chimes, and the guards that drop
// answers from a moment the statechart has already left. Verdicts
// live in verdicts.ts.
import { Vibration } from 'react-native';
import { assignConversation as assign, raiseConversation as raise } from '../conversation/actors';
import type { ContextArgs, EventArgs } from '../conversation/actions';
import { playSound } from '../speech';
import { haptics } from '../theme';
import { shown } from './verdicts';
import type { DetailKind } from '../relay';

export const raiseConfirmBegin = raise({ type: 'CONFIRM_BEGIN' });

export const raiseConfirmAuto = raise({ type: 'CONFIRM_AUTO' });

export const raiseConfirmEnd = raise({ type: 'CONFIRM_END' });

export const raiseConfirmDetailAsk = raise({ type: 'CONFIRM_DETAIL_ASK' });

export const NET_UPDATE_MS = 8000;

// The product's box when the check begins: the guided target, or the
// shelf find when guiding has already ended. The check crops around
// it, so a hand on the cap still sends the label.
const heldBox = ({ context }: ContextArgs) => (context.guideTarget ?? context.shelfTarget)?.box ?? null;

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

export const beginConfirm = assign({
  confirming: true,
  confirmBox: heldBox,
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
  confirmBox: heldBox,
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

export const clearConfirmSpeech = assign({
  confirmParts: [],
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

export const wantsDetail = ({ context }: ContextArgs): boolean => context.confirmDetailKind !== null;

export const wantsCheck = ({ context }: ContextArgs): boolean => context.confirming && !context.confirmFinal;
