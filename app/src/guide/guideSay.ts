// What each guiding moment says: the assigns that write the line to
// the screen the moment its clips start, the guards that route the
// hand frames, and the sounds that mark losing and refusal.
import { Vibration } from 'react-native';
import { assignConversation as assign, raiseConversation as raise } from '../conversation/actors';
import type { ContextArgs, EventArgs } from '../conversation/actions';
import { GUIDE_CHIP, READ_AGAIN_CHIP } from '../chips';
import { playSound } from '../speech';
import { haptics } from '../theme';
import { continueIdFor } from './steer';
import { firstSentence, foundToLine, outOfViewLine, partsText, severalPrefix, thisIsLine } from './lines';
import { shelfFoundLine } from '../shelf/searchLines';
import type { ShelfBox } from '../relay';
import type { GuideDir } from './types';
import type { ConversationContext, SpeechPart } from '../conversation/types';

export const raiseGuideEnd = raise({ type: 'GUIDE_END' });

export const raiseGuideGotIt = raise({ type: 'GUIDE_GOT_IT' });

export const raiseGuideRestart = raise({ type: 'GUIDE_RESTART' });

export const REPEAT_MS = 6000;
export const ARM_TIMEOUT_MS = 10000;
export const AIM_TIMEOUT_MS = 8000;

export const buzzNo = (): void => {
  Vibration.vibrate([...haptics.no]);
  playSound('no');
};

export const lostSound = (): void => {
  playSound('lost');
};

function shown(parts: SpeechPart[], context: ConversationContext): string {
  return partsText(parts, context.lang);
}

function firstParts(context: ConversationContext, cue: string): SpeechPart[] {
  const where = firstSentence(context.guideLabel, cue, context.lang);
  if (context.guideMatches > 1) {
    const several = severalPrefix(context.guideMatches, context.guideLabel, context.guideKind, context.lang);
    return [{ text: `${several} ${where}` }, { clip: cue }];
  }
  return [{ text: where }, { clip: cue }];
}

function directParts(context: ConversationContext, cue: string | null): SpeechPart[] {
  if (!cue) {
    return [];
  }
  if (context.guideFresh) {
    return firstParts(context, cue);
  }
  return [{ clip: cue }];
}

export const sayFound = assign({
  guideParts: ({ context }: ContextArgs) => [{ text: foundLine(context) }],
  lastLine: ({ context }: ContextArgs) => foundLine(context),
  lastChips: [],
});

function foundLine(context: ConversationContext): string {
  const hand = context.guideHand;
  const target = context.guideTarget;
  const dir = hand && target ? handDir(hand, target.box) : null;
  if (dir) {
    return foundToLine(context.guideLabel, dir, context.lang);
  }
  return shelfFoundLine(context.guideLabel, context.guidePosition, context.lang);
}

function handDir(hand: { x: number; y: number }, box: ShelfBox): GuideDir | null {
  if (hand.x >= box.x1 && hand.x <= box.x2 && hand.y >= box.y1 && hand.y <= box.y2) {
    return null;
  }
  const dx = (box.x1 + box.x2) / 2 - hand.x;
  const dy = (box.y1 + box.y2) / 2 - hand.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 'right' : 'left';
  }
  return dy >= 0 ? 'down' : 'up';
}

export const endGuide = assign({
  guiding: false,
  guideReaching: false,
  guideTarget: null,
  guideLabel: '',
  guideKind: '',
  guideMatches: 0,
  guideHand: null,
  guideProximity: 0,
  guideCue: null,
  guideFresh: false,
  guideWrong: null,
  guideRecheck: false,
  guideOutOfView: false,
  guideParts: [],
});

export const stopGuide = assign({
  guiding: false,
  guideReaching: false,
  guideTarget: null,
  shelfTarget: null,
});

export const sayCue = assign({
  guideCue: ({ event }: EventArgs) => (event.type === 'GUIDE_CUE' ? event.cue : null),
  guideProximity: ({ event }: EventArgs) => (event.type === 'GUIDE_CUE' ? event.proximity : 0),
  guideHand: ({ event }: EventArgs) => (event.type === 'GUIDE_CUE' ? event.hand : null),
  guideWrong: null,
  guideParts: ({ context, event }: EventArgs) => (event.type === 'GUIDE_CUE' ? directParts(context, event.cue) : []),
  lastLine: ({ context, event }: EventArgs) =>
    event.type === 'GUIDE_CUE' ? shown(directParts(context, event.cue), context) : context.lastLine,
  lastChips: [],
  guideFresh: false,
  guideOutOfView: false,
});

export const trackCue = assign({
  guideProximity: ({ event }: EventArgs) => (event.type === 'GUIDE_CUE' ? event.proximity : 0),
  guideHand: ({ event }: EventArgs) => (event.type === 'GUIDE_CUE' ? event.hand : null),
});

export const sayContinue = assign({
  guideCue: ({ context }: ContextArgs) => (context.guideCue ? continueIdFor(context.guideCue) : null),
  guideParts: ({ context }: ContextArgs) => (context.guideCue ? [{ clip: continueIdFor(context.guideCue) }] : []),
  lastLine: ({ context }: ContextArgs) =>
    context.guideCue ? shown([{ clip: continueIdFor(context.guideCue) }], context) : context.lastLine,
  lastChips: [],
});

export const sayAlmost = assign({
  guideProximity: ({ event }: EventArgs) =>
    event.type === 'GUIDE_ALIGNED' || event.type === 'GUIDE_COVERING' ? event.proximity : 0,
  guideHand: ({ event }: EventArgs) => (event.type === 'GUIDE_ALIGNED' || event.type === 'GUIDE_COVERING' ? event.hand : null),
  guideParts: ({ context }: EventArgs) =>
    context.guideFresh && context.guideCue ? [...firstParts(context, context.guideCue), { clip: 'almost' }] : [{ clip: 'almost' }],
  lastLine: ({ context }: EventArgs) =>
    context.guideFresh && context.guideCue
      ? shown([...firstParts(context, context.guideCue), { clip: 'almost' }], context)
      : shown([{ clip: 'almost' }], context),
  lastChips: [],
  guideFresh: false,
  guideOutOfView: false,
});

export const sayReach = assign({
  guideProximity: ({ event }: EventArgs) => (event.type === 'GUIDE_COVERING' ? event.proximity : 0),
  guideHand: ({ event }: EventArgs) => (event.type === 'GUIDE_COVERING' ? event.hand : null),
  guideParts: [{ clip: 'reach_forward' }],
  lastLine: ({ context }: ContextArgs) => shown([{ clip: 'reach_forward' }], context),
  lastChips: [],
  guideFresh: false,
  guideOutOfView: false,
});

export const sayPick = assign({
  guideParts: [{ clip: 'pick_up' }, { clip: 'checking' }],
  lastLine: ({ context }: ContextArgs) => shown([{ clip: 'pick_up' }, { clip: 'checking' }], context),
  lastChips: [],
});

export const sayNoHand = assign({
  guideHand: null,
  guideParts: [{ clip: 'hand_show' }],
  lastLine: ({ context }: ContextArgs) => shown([{ clip: 'hand_show' }], context),
  lastChips: [],
});

export const sayLost = assign({
  guideHand: null,
  guideParts: [{ clip: 'hand_lost' }],
  lastLine: ({ context }: ContextArgs) => shown([{ clip: 'hand_lost' }], context),
  lastChips: [],
});

export const sayWrong = assign({
  guideCue: ({ event }: EventArgs) => (event.type === 'GUIDE_WRONG' ? event.cue : null),
  guideWrong: ({ event }: EventArgs) => (event.type === 'GUIDE_WRONG' ? event.label : null),
  guideParts: ({ context, event }: EventArgs) => {
    if (event.type !== 'GUIDE_WRONG') {
      return [];
    }
    return [
      { clip: 'no' },
      { text: thisIsLine(event.label, context.lang) },
      { clip: 'put_back' },
      { text: firstSentence(context.guideLabel, event.cue, context.lang) },
      { clip: event.cue },
    ];
  },
  lastLine: ({ context, event }: EventArgs) => {
    if (event.type !== 'GUIDE_WRONG') {
      return context.lastLine;
    }
    return shown(
      [
        { clip: 'no' },
        { text: thisIsLine(event.label, context.lang) },
        { clip: 'put_back' },
        { text: firstSentence(context.guideLabel, event.cue, context.lang) },
        { clip: event.cue },
      ],
      context,
    );
  },
  lastChips: ({ context }: ContextArgs) => [GUIDE_CHIP[context.lang], READ_AGAIN_CHIP[context.lang]],
});

export const sayRestart = assign({
  guideWrong: null,
  guideRestarting: false,
  guideOutOfView: false,
  guideParts: ({ context }: ContextArgs) => directParts(context, context.guideCue),
  lastLine: ({ context }: ContextArgs) => {
    const parts = directParts(context, context.guideCue);
    return parts.length > 0 ? shown(parts, context) : context.lastLine;
  },
  lastChips: ({ context }: ContextArgs) => context.lastChips,
});

/** The target is back in the picture: its outline shows again (t34 hid it 9 s after it was back). */
export const showTarget = assign({ guideOutOfView: false });

export const sayTargetLost = assign({
  guideOutOfView: true,
  guideParts: ({ context, event }: EventArgs) =>
    event.type === 'GUIDE_TARGET_LOST'
      ? [{ text: outOfViewLine(context.guideLabel, context.lang) }, { clip: event.cue }]
      : [],
  lastLine: ({ context, event }: EventArgs) =>
    event.type === 'GUIDE_TARGET_LOST'
      ? shown([{ text: outOfViewLine(context.guideLabel, context.lang) }, { clip: event.cue }], context)
      : context.lastLine,
  lastChips: [],
});

function withoutContinue(cue: string): string {
  return cue.replace(/_continue$/, '');
}

export const sameCue = ({ context, event }: EventArgs): boolean =>
  event.type === 'GUIDE_CUE' && context.guideCue !== null && withoutContinue(event.cue) === withoutContinue(context.guideCue);

