// The guide loop, outside the statechart: every hand frame becomes
// at most one guide event. A new cue holds 0.4 s before it speaks,
// almost and covering are edges, a recent dropout is lost while a
// long absence is no hand, a rest on another product reads it, and
// contact needs covering announced with the target moving with the
// hand. The target box is
// the statechart's: syncTarget carries every move, so the loop and
// the green rectangle never steer toward two different boxes; the
// loop only tells in view from out of view. Out of view, lost and
// no hand repeat every two seconds, so a dropped event never leaves
// the shopper without the next one. Out of view mutes lost and no
// hand: t30 bounced between them and the out-of-view line every two
// seconds, where the line alone repeats every six. The clock, the
// photo and the cloud read are injected, so tests walk it with
// scripted frames and the phone drives it with live stills.
import type { ShelfBox, ShelfOutline } from '../relay';
import { boxOverlap } from '../shelf/outlines';
import { centerOf, cueIdFor, proximityFor, steerFor } from './steer';
import type { HandFix, TipPoint, HandBox } from './types';
import { handCoversTarget } from '../conversation/searchTarget';
import { IN_FRAME_SHARE, cosine, describeCue, describeLost, sameBox, shareInFrame } from './loopMath';
import { restRead } from './loopRest';
import { freshGuideState } from './loopTypes';
import type { GuideLoop, GuideLoopDeps, GuideLoopPhoto } from './loopTypes';

const CUE_HOLD_MS = 400;
const KIND_HOLD_MS = 500;
export const EDGE_HEARTBEAT_MS = 2000;
const LOST_WITHIN_MS = 2000;
const COVER_MS = 1000;
const TARGET_MATCH_IOU = 0.3;
const TARGET_GONE_FRAMES = 2;
const COVERED_LOST_MS = 2500;
const CONTACT_POINTS = 4;
const CONTACT_SHIFT_PX = 6;
const CONTACT_ALIGN = 0.7;
const MIN_CONFIDENCE = 0.3;

// The fingertip and, when the tracker sent it, the whole hand's box.
function handOf(tip: TipPoint, fix: HandFix): { x: number; y: number; box?: HandBox } {
  return fix.box ? { x: tip.x, y: tip.y, box: fix.box } : { x: tip.x, y: tip.y };
}

export function createGuideLoop(deps: GuideLoopDeps): GuideLoop {
  const state = freshGuideState();

  function due(sent: boolean, at: number): boolean {
    return !sent || deps.now() - at >= EDGE_HEARTBEAT_MS;
  }

  function logCue(id: string, tip: TipPoint, box: ShelfBox, handWidth: number, hand?: HandBox): void {
    if (state.loggedCue !== id) {
      state.loggedCue = id;
      deps.log(describeCue(id, tip, box, handWidth, hand));
    }
  }

  // In view or out of view, by overlap with the live outlines. The
  // box itself never changes here: it follows the statechart's. A
  // hand on the product holds the box, because SAM cuts the box
  // short under a hand and the cut must never read as a loss; the
  // hold lasts a patience, then a truly gone product still reports.
  // With the camera's own placement the box is where the product is,
  // so it is in view while most of it is inside the frame.
  function trackTarget(outlines: ShelfOutline[], photoW: number, covered: boolean, placed: boolean): void {
    const target = state.target;
    if (!target) {
      return;
    }
    let bestIoU = 0;
    if (placed) {
      bestIoU = shareInFrame(target) >= IN_FRAME_SHARE ? 1 : 0;
    } else {
      for (const outline of outlines) {
        bestIoU = Math.max(bestIoU, boxOverlap(target, outline.box));
      }
    }
    if (covered && bestIoU < TARGET_MATCH_IOU) {
      if (!state.heldUnderHand) {
        state.heldUnderHand = true;
        deps.log('guide target under hand, holding box');
      }
      if (state.coveredNoOverlapSince === null) {
        state.coveredNoOverlapSince = deps.now();
      }
      if (deps.now() - state.coveredNoOverlapSince < COVERED_LOST_MS) {
        state.targetGone = 0;
        return;
      }
    } else if (covered) {
      if (!state.heldUnderHand) {
        state.heldUnderHand = true;
        deps.log('guide target under hand, holding box');
      }
      state.coveredNoOverlapSince = null;
    } else {
      state.heldUnderHand = false;
      state.coveredNoOverlapSince = null;
    }
    if (bestIoU >= TARGET_MATCH_IOU) {
      if (state.sentTargetLost) {
        deps.log('guide target back in view');
        deps.send({ type: 'GUIDE_TARGET_BACK' });
        state.loggedCue = null;
      }
      state.targetGone = 0;
      state.sentTargetLost = false;
      return;
    }
    state.targetGone += 1;
    if (state.targetGone < TARGET_GONE_FRAMES || !due(state.sentTargetLost, state.sentTargetLostAt)) {
      return;
    }
    if (!state.sentTargetLost) {
      deps.log(describeLost(target, placed, bestIoU));
    }
    state.sentTargetLost = true;
    state.sentTargetLostAt = deps.now();
    const center = centerOf(target);
    const side = photoW > 0 && center.x < photoW / 2 ? 'left' : 'right';
    deps.send({ type: 'GUIDE_TARGET_LOST', cue: `phone_${side}_small` });
  }

  function clearApproach(): void {
    state.heldCue = null;
    state.sentAlmost = false;
    state.coverSince = null;
    state.sentCovering = false;
    state.sentContact = false;
    state.restAnchor = null;
    state.restRead = false;
    state.trail = [];
    state.inputKind = null;
  }

  function miss(): void {
    clearApproach();
    const last = state.lastSeenAt;
    if (last === null || deps.now() - last >= LOST_WITHIN_MS) {
      if (due(state.sentNoHand, state.sentNoHandAt)) {
        state.sentNoHand = true;
        state.sentNoHandAt = deps.now();
        state.sentLost = false;
        deps.send({ type: 'GUIDE_NOHAND' });
      }
      return;
    }
    if (due(state.sentLost, state.sentLostAt)) {
      state.sentLost = true;
      state.sentLostAt = deps.now();
      state.sentNoHand = false;
      deps.send({ type: 'GUIDE_LOST' });
    }
  }

  function contact(tip: TipPoint, target: ShelfBox): void {
    state.trail.push({ tip: { ...tip }, center: centerOf(target) });
    state.trail = state.trail.slice(-CONTACT_POINTS);
    if (!state.sentCovering || state.sentContact || state.trail.length < CONTACT_POINTS) {
      return;
    }
    const first = state.trail[0] as { tip: TipPoint; center: TipPoint };
    const last = state.trail[state.trail.length - 1] as { tip: TipPoint; center: TipPoint };
    const tipShift = { x: last.tip.x - first.tip.x, y: last.tip.y - first.tip.y };
    const boxShift = { x: last.center.x - first.center.x, y: last.center.y - first.center.y };
    if (
      Math.hypot(tipShift.x, tipShift.y) >= CONTACT_SHIFT_PX &&
      Math.hypot(boxShift.x, boxShift.y) >= CONTACT_SHIFT_PX &&
      cosine(tipShift, boxShift) >= CONTACT_ALIGN
    ) {
      state.sentContact = true;
      deps.send({ type: 'GUIDE_CONTACT' });
    }
  }

  return {
    setTarget(outline: ShelfOutline, label = ''): void {
      state.target = outline.box;
      state.label = label;
      state.targetGone = 0;
      state.sentTargetLost = false;
      state.sentTargetLostAt = 0;
      state.heldUnderHand = false;
      state.coveredNoOverlapSince = null;
      state.coverSince = null;
      state.sentCovering = false;
      state.sentContact = false;
      state.loggedCue = null;
    },

    syncTarget(box: ShelfBox): void {
      if (state.target && !sameBox(state.target, box)) {
        state.target = { ...box };
      }
    },

    setPhoto(photo: GuideLoopPhoto): void {
      state.photo = photo;
    },

    reset(): void {
      Object.assign(state, freshGuideState());
    },

    async handFrame(fix: HandFix | null, outlines: ShelfOutline[], photoW: number, photoH: number, placed = false): Promise<void> {
      const target = state.target;
      if (!target) {
        return;
      }
      const seen = fix && fix.confidence >= MIN_CONFIDENCE ? { x: fix.x, y: fix.y, ...(fix.box ? { box: fix.box } : {}) } : null;
      trackTarget(outlines, photoW, handCoversTarget(seen, target), placed);
      const tracked = state.target as ShelfBox;
      if (!fix || fix.confidence < MIN_CONFIDENCE) {
        if (state.sentTargetLost) {
          clearApproach();
          return;
        }
        miss();
        return;
      }
      state.lastSeenAt = deps.now();
      state.sentLost = false;
      state.sentNoHand = false;
      if (state.sentTargetLost) {
        // No hand cue against a box the camera cannot see: the
        // phone cue is the one that counts until the target is back.
        clearApproach();
        state.kind = null;
        return;
      }
      const tip = { x: fix.x, y: fix.y };
      const proximity = proximityFor(tip, tracked, Math.hypot(photoW, photoH));
      const steer = steerFor(tip, tracked, fix.box);
      await restRead(state, deps, tip, outlines, tracked, fix.handWidth);
      if (steer.kind !== state.inputKind) {
        state.inputKind = steer.kind;
        state.kindSince = deps.now();
      }
      if (steer.kind !== state.kind) {
        if (deps.now() - state.kindSince < KIND_HOLD_MS) {
          return;
        }
        state.kind = steer.kind;
        if (steer.kind === 'move') {
          state.heldCue = cueIdFor(steer.dir, steer.small, false);
          state.heldSince = state.kindSince;
        } else if (steer.kind === 'covering') {
          state.coverSince = state.kindSince;
        }
      }
      if (steer.kind === 'move') {
        state.sentAlmost = false;
        state.sentCovering = false;
        state.coverSince = null;
        state.sentContact = false;
        state.trail = [];
        const id = cueIdFor(steer.dir, steer.small, false);
        if (state.heldCue !== id) {
          state.heldCue = id;
          state.heldSince = deps.now();
        }
        if (deps.now() - state.heldSince >= CUE_HOLD_MS) {
          logCue(id, tip, tracked, fix.handWidth, fix.box);
          deps.send({ type: 'GUIDE_CUE', cue: id, proximity, hand: handOf(tip, fix) });
        }
      } else if (steer.kind === 'almost') {
        state.heldCue = null;
        state.coverSince = null;
        state.sentCovering = false;
        state.sentContact = false;
        state.trail = [];
        if (due(state.sentAlmost, state.sentAlmostAt)) {
          state.sentAlmost = true;
          state.sentAlmostAt = deps.now();
          logCue('almost', tip, tracked, fix.handWidth, fix.box);
          deps.send({ type: 'GUIDE_ALIGNED', proximity, hand: handOf(tip, fix) });
        }
      } else {
        state.heldCue = null;
        state.sentAlmost = false;
        if (state.coverSince === null) {
          state.coverSince = deps.now();
        }
        if (deps.now() - state.coverSince >= COVER_MS && due(state.sentCovering, state.sentCoveringAt)) {
          state.sentCovering = true;
          state.sentCoveringAt = deps.now();
          logCue('covering', tip, tracked, fix.handWidth, fix.box);
          deps.send({ type: 'GUIDE_COVERING', proximity, hand: handOf(tip, fix) });
        }
        contact(tip, tracked);
      }
    },
  };
}
