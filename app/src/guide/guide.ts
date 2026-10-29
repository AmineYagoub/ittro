// The guiding side of the conversation: each moment of bringing
// the hand to the product is a state with its timings. Aiming waits
// for the first hand frame, directing repeats its cue every 6 s,
// almost speaks once, reaching listens for contact, and the hand
// states stop directing until the hand is back.
import type { ContextArgs } from '../conversation/actions';
import {
  AIM_TIMEOUT_MS,
  ARM_TIMEOUT_MS,
  REPEAT_MS,
  buzzNo,
  endGuide,
  foundTarget,
  hasTarget,
  lostSound,
  readyQuiet,
  readyToArm,
  sameCue,
  sayAlmost,
  sayContinue,
  sayCue,
  sayLost,
  sayNoHand,
  sayPick,
  sayReach,
  sayRestart,
  sayTargetLost,
  sayWrong,
  trackCue,
  wantsResume,
  consumeResume,
  storeGuideTarget,
} from './guideSay';

function speakState() {
  return {
    invoke: {
      src: 'speakParts' as const,
      input: ({ context }: ContextArgs) => ({ parts: context.guideParts, lang: context.lang }),
    },
  };
}

export const guideRegion = {
  id: 'guide',
  initial: 'idle',
  on: {
    GUIDE_END: { actions: [endGuide], target: '#guide.idle' },
    GUIDE_RESTART: { guard: hasTarget, actions: [sayRestart], target: '#guide.directing' },
  },
  states: {
    idle: {
      always: [
        { guard: readyQuiet, actions: [consumeResume], target: 'aiming' },
        { guard: readyToArm, target: 'arming' },
      ],
      on: {
        SHELF_FOUND: { guard: foundTarget, actions: [storeGuideTarget] },
        TALK_IDLE: { guard: wantsResume, actions: [consumeResume], target: 'aiming' },
      },
    },
    arming: {
      after: { [ARM_TIMEOUT_MS]: 'aiming' },
      on: { TALK_IDLE: 'aiming' },
    },
    aiming: {
      after: { [AIM_TIMEOUT_MS]: { actions: [sayNoHand], target: 'noHand' } },
      on: {
        GUIDE_CUE: { actions: [sayCue], target: 'directing' },
        GUIDE_ALIGNED: { actions: [sayAlmost], target: 'almost' },
        GUIDE_COVERING: { actions: [sayReach], target: 'reaching' },
        GUIDE_NOHAND: { actions: [sayNoHand], target: 'noHand' },
        GUIDE_LOST: { actions: [sayLost], target: 'handLost' },
      },
    },
    directing: {
      ...speakState(),
      on: {
        GUIDE_CUE: [{ guard: sameCue, actions: [trackCue] }, { actions: [sayCue], target: 'directing', reenter: true }],
        GUIDE_ALIGNED: { actions: [sayAlmost], target: 'almost' },
        GUIDE_COVERING: { actions: [sayReach], target: 'reaching' },
        GUIDE_NOHAND: { actions: [sayNoHand], target: 'noHand' },
        GUIDE_LOST: { actions: [sayLost], target: 'handLost' },
        GUIDE_WRONG: { actions: [sayWrong], target: 'wrongItem' },
        GUIDE_TARGET_LOST: { actions: [sayTargetLost], target: 'targetLost' },
      },
      after: { [REPEAT_MS]: { actions: [sayContinue], target: 'directing', reenter: true } },
    },
    almost: {
      ...speakState(),
      on: {
        GUIDE_CUE: { actions: [sayCue], target: 'directing' },
        GUIDE_COVERING: { actions: [sayReach], target: 'reaching' },
        GUIDE_NOHAND: { actions: [sayNoHand], target: 'noHand' },
        GUIDE_LOST: { actions: [sayLost], target: 'handLost' },
        GUIDE_WRONG: { actions: [sayWrong], target: 'wrongItem' },
        GUIDE_TARGET_LOST: { actions: [sayTargetLost], target: 'targetLost' },
      },
    },
    reaching: {
      ...speakState(),
      on: {
        GUIDE_GOT_IT: { actions: [sayPick], target: 'picking' },
        GUIDE_CONTACT: { actions: [sayPick], target: 'picking' },
        GUIDE_CUE: { actions: [sayCue], target: 'directing' },
        GUIDE_ALIGNED: { actions: [sayAlmost], target: 'almost' },
        GUIDE_NOHAND: { actions: [sayNoHand], target: 'noHand' },
        GUIDE_LOST: { actions: [sayLost], target: 'handLost' },
        GUIDE_WRONG: { actions: [sayWrong], target: 'wrongItem' },
        GUIDE_TARGET_LOST: { actions: [sayTargetLost], target: 'targetLost' },
      },
    },
    picking: {
      entry: [sayPick],
      invoke: {
        src: 'speakParts' as const,
        input: ({ context }: ContextArgs) => ({ parts: context.guideParts, lang: context.lang }),
        onDone: { actions: [endGuide], target: 'idle' },
        onError: { actions: [endGuide], target: 'idle' },
      },
    },
    noHand: {
      ...speakState(),
      after: { [REPEAT_MS]: { target: 'noHand', reenter: true } },
      on: {
        GUIDE_CUE: { actions: [sayCue], target: 'directing' },
        GUIDE_ALIGNED: { actions: [sayAlmost], target: 'almost' },
        GUIDE_COVERING: { actions: [sayReach], target: 'reaching' },
        GUIDE_LOST: { actions: [sayLost], target: 'handLost' },
      },
    },
    handLost: {
      entry: [lostSound],
      invoke: {
        src: 'speakParts' as const,
        input: ({ context }: ContextArgs) => ({ parts: context.guideParts, lang: context.lang }),
      },
      on: {
        GUIDE_CUE: { actions: [sayCue], target: 'directing' },
        GUIDE_ALIGNED: { actions: [sayAlmost], target: 'almost' },
        GUIDE_COVERING: { actions: [sayReach], target: 'reaching' },
        GUIDE_NOHAND: { actions: [sayNoHand], target: 'noHand' },
      },
    },
    wrongItem: {
      entry: [buzzNo],
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
      },
    },
    targetLost: {
      ...speakState(),
      after: { [REPEAT_MS]: { target: 'targetLost', reenter: true } },
      on: {
        GUIDE_CUE: { actions: [sayCue], target: 'directing' },
        GUIDE_ALIGNED: { actions: [sayAlmost], target: 'almost' },
        GUIDE_COVERING: { actions: [sayReach], target: 'reaching' },
        GUIDE_NOHAND: { actions: [sayNoHand], target: 'noHand' },
        GUIDE_LOST: { actions: [sayLost], target: 'handLost' },
      },
    },
  },
};
