// The guiding side of the conversation: each moment of bringing
// the hand to the product is a state with its timings. Aiming waits
// for the first hand frame, directing repeats its cue every 6 s,
// almost speaks once, reaching listens for contact, and the hand
// states stop directing until the hand is back. Out of view names the
// product once, then repeats only the turn line every 6 s while it is
// still out (t37). A target back in the picture shows the arrow and
// meter again, and out of view is not said again while it flickers at
// the edge (t35 said it every half second).
import type { ContextArgs } from '../conversation/actions';
import { noteVoice } from '../conversation/echo';
import { logIttro } from '../log';
import { raiseConfirmAuto, raiseConfirmTouched } from '../confirm/confirmSay';
import {
  AIM_TIMEOUT_MS,
  ARM_TIMEOUT_MS,
  REPEAT_MS,
  buzzNo,
  endGuide,
  lostSound,
  sameCue,
  sayAlmost,
  sayContinue,
  sayCue,
  sayFound,
  sayLost,
  sayNoHand,
  sayPick,
  sayReach,
  sayRestart,
  noteTurn,
  repeatTurn,
  sayTargetLost,
  sayWrong,
  showTarget,
  stillOutOfView,
  trackCue,
} from './guideSay';
import { adoptGuideTarget, adoptLostTarget, armFree, foundTarget, hasTarget, logAdopted, readyQuiet, readyToArm, storeGuideTarget } from './guideTarget';

function speakState() {
  return {
    invoke: {
      src: 'speakParts' as const,
      input: ({ context }: ContextArgs) => ({ parts: context.guideParts, lang: context.lang }),
    },
  };
}

function logHandOn({ context }: ContextArgs): void {
  logIttro(`guide hand on product epoch ${context.searchEpoch}`);
}

// The fingertip held on the confirmed product this long is a touch.
export const TOUCH_HOLD_MS = 600;

export const guideRegion = {
  id: 'guide',
  initial: 'idle',
  on: {
    GUIDE_END: { actions: [endGuide], target: '#guide.idle' },
    GUIDE_RESTART: { guard: hasTarget, actions: [sayRestart], target: '#guide.directing' },
    GUIDE_TARGET_BACK: { actions: [showTarget] },
  },
  states: {
    idle: {
      always: [
        { guard: readyQuiet, actions: [sayFound], target: 'announcing' },
        { guard: readyToArm, target: 'arming' },
      ],
      on: {
        SHELF_FOUND: { guard: foundTarget, actions: [storeGuideTarget] },
      },
    },
    arming: {
      after: {
        [ARM_TIMEOUT_MS]: [
          { guard: armFree, actions: [sayFound], target: 'announcing' },
          { target: 'arming', reenter: true },
        ],
      },
      on: {
        TALK_IDLE: { guard: armFree, actions: [sayFound], target: 'announcing' },
        GUIDE_CUE: { actions: [trackCue] },
        GUIDE_ALIGNED: { actions: [trackCue] },
        GUIDE_COVERING: { actions: [trackCue] },
      },
    },
    announcing: {
      entry: [noteVoice],
      invoke: {
        src: 'speakParts' as const,
        input: ({ context }: ContextArgs) => ({ parts: context.guideParts, lang: context.lang }),
        onDone: 'aiming',
        onError: 'aiming',
      },
      on: {
        GUIDE_CUE: { actions: [trackCue] },
        GUIDE_ALIGNED: { actions: [trackCue] },
        GUIDE_COVERING: { actions: [trackCue] },
      },
    },
    aiming: {
      after: { [AIM_TIMEOUT_MS]: { actions: [sayNoHand], target: 'noHand' } },
      on: {
        GUIDE_CUE: { actions: [sayCue], target: 'directing' },
        GUIDE_ALIGNED: { actions: [sayAlmost], target: 'almost' },
        GUIDE_COVERING: { actions: [sayReach], target: 'reaching' },
        GUIDE_NOHAND: { actions: [sayNoHand], target: 'noHand' },
        GUIDE_LOST: { actions: [sayLost], target: 'handLost' },
        GUIDE_TARGET_LOST: { actions: [sayTargetLost], target: 'targetLost' },
        SHELF_FOUND: { guard: foundTarget, actions: [adoptGuideTarget, logAdopted] },
      },
    },
    directing: {
      entry: [noteVoice],
      ...speakState(),
      on: {
        GUIDE_CUE: [{ guard: sameCue, actions: [trackCue] }, { actions: [sayCue], target: 'directing', reenter: true }],
        GUIDE_ALIGNED: { actions: [sayAlmost], target: 'almost' },
        GUIDE_COVERING: { actions: [sayReach], target: 'reaching' },
        GUIDE_NOHAND: { actions: [sayNoHand], target: 'noHand' },
        GUIDE_LOST: { actions: [sayLost], target: 'handLost' },
        GUIDE_WRONG: { actions: [sayWrong], target: 'wrongItem' },
        GUIDE_TARGET_LOST: { actions: [sayTargetLost], target: 'targetLost' },
        SHELF_FOUND: { guard: foundTarget, actions: [adoptGuideTarget, logAdopted] },
      },
      after: { [REPEAT_MS]: { actions: [sayContinue], target: 'directing', reenter: true } },
    },
    almost: {
      entry: [noteVoice],
      ...speakState(),
      on: {
        GUIDE_CUE: { actions: [sayCue], target: 'directing' },
        GUIDE_COVERING: { actions: [sayReach], target: 'reaching' },
        GUIDE_NOHAND: { actions: [sayNoHand], target: 'noHand' },
        GUIDE_LOST: { actions: [sayLost], target: 'handLost' },
        GUIDE_WRONG: { actions: [sayWrong], target: 'wrongItem' },
        GUIDE_TARGET_LOST: { actions: [sayTargetLost], target: 'targetLost' },
        SHELF_FOUND: { guard: foundTarget, actions: [adoptGuideTarget, logAdopted] },
      },
    },
    reaching: {
      entry: [logHandOn, noteVoice],
      ...speakState(),
      after: { [TOUCH_HOLD_MS]: { actions: [endGuide, raiseConfirmTouched], target: 'idle' } },
      on: {
        GUIDE_GOT_IT: { actions: [sayPick], target: 'picking' },
        GUIDE_CONTACT: { actions: [sayPick], target: 'picking' },
        GUIDE_CUE: { actions: [sayCue], target: 'directing' },
        GUIDE_ALIGNED: { actions: [sayAlmost], target: 'almost' },
        GUIDE_NOHAND: { actions: [sayNoHand], target: 'noHand' },
        GUIDE_LOST: { actions: [sayLost], target: 'handLost' },
        GUIDE_WRONG: { actions: [sayWrong], target: 'wrongItem' },
        GUIDE_TARGET_LOST: { actions: [sayTargetLost], target: 'targetLost' },
        SHELF_FOUND: { guard: foundTarget, actions: [adoptGuideTarget, logAdopted] },
      },
    },
    picking: {
      entry: [sayPick, noteVoice],
      invoke: {
        src: 'speakParts' as const,
        input: ({ context }: ContextArgs) => ({ parts: context.guideParts, lang: context.lang }),
        onDone: { actions: [endGuide, raiseConfirmAuto], target: 'idle' },
        onError: { actions: [endGuide, raiseConfirmAuto], target: 'idle' },
      },
    },
    noHand: {
      entry: [noteVoice],
      ...speakState(),
      after: { [REPEAT_MS]: { target: 'noHand', reenter: true } },
      on: {
        GUIDE_CUE: { actions: [sayCue], target: 'directing' },
        GUIDE_ALIGNED: { actions: [sayAlmost], target: 'almost' },
        GUIDE_COVERING: { actions: [sayReach], target: 'reaching' },
        GUIDE_LOST: { actions: [sayLost], target: 'handLost' },
        GUIDE_TARGET_LOST: { actions: [sayTargetLost], target: 'targetLost' },
        SHELF_FOUND: { guard: foundTarget, actions: [adoptGuideTarget, logAdopted] },
      },
    },
    handLost: {
      entry: [lostSound, noteVoice],
      invoke: {
        src: 'speakParts' as const,
        input: ({ context }: ContextArgs) => ({ parts: context.guideParts, lang: context.lang }),
      },
      on: {
        GUIDE_CUE: { actions: [sayCue], target: 'directing' },
        GUIDE_ALIGNED: { actions: [sayAlmost], target: 'almost' },
        GUIDE_COVERING: { actions: [sayReach], target: 'reaching' },
        GUIDE_NOHAND: { actions: [sayNoHand], target: 'noHand' },
        GUIDE_TARGET_LOST: { actions: [sayTargetLost], target: 'targetLost' },
        SHELF_FOUND: { guard: foundTarget, actions: [adoptGuideTarget, logAdopted] },
      },
    },
    wrongItem: {
      entry: [buzzNo, noteVoice],
      invoke: {
        src: 'speakParts' as const,
        input: ({ context }: ContextArgs) => ({ parts: context.guideParts, lang: context.lang }),
      },
      after: { [REPEAT_MS]: { target: 'wrongItem', reenter: true } },
      on: {
        GUIDE_CUE: { actions: [sayCue], target: 'directing' },
        GUIDE_ALIGNED: { actions: [sayAlmost], target: 'almost' },
        GUIDE_COVERING: { actions: [sayReach], target: 'reaching' },
        GUIDE_NOHAND: { actions: [sayNoHand], target: 'noHand' },
        GUIDE_LOST: { actions: [sayLost], target: 'handLost' },
        GUIDE_WRONG: { actions: [sayWrong], target: 'wrongItem', reenter: true },
        GUIDE_TARGET_LOST: { actions: [sayTargetLost], target: 'targetLost' },
        SHELF_FOUND: { guard: foundTarget, actions: [adoptGuideTarget, logAdopted] },
      },
    },
    targetLost: {
      entry: [noteVoice],
      ...speakState(),
      after: {
        [REPEAT_MS]: [{ guard: stillOutOfView, actions: [repeatTurn], target: 'targetLost', reenter: true }, { target: 'aiming' }],
      },
      on: {
        GUIDE_CUE: { actions: [sayCue], target: 'directing' },
        GUIDE_ALIGNED: { actions: [sayAlmost], target: 'almost' },
        GUIDE_COVERING: { actions: [sayReach], target: 'reaching' },
        GUIDE_NOHAND: { actions: [sayNoHand], target: 'noHand' },
        GUIDE_LOST: { actions: [sayLost], target: 'handLost' },
        GUIDE_TARGET_LOST: { actions: [noteTurn] },
        SHELF_FOUND: { guard: foundTarget, actions: [adoptLostTarget, logAdopted] },
      },
    },
  },
};
