// The found target across shelf passes: SAM numbers its objects per
// response, so an id says nothing across passes and the target
// follows the outline that overlaps it best. A hand on the product
// freezes the box, because SAM cuts the box short under a hand; a
// box that jumps holds too and asks for a label recheck, because
// position alone cannot tell the product from its neighbour.
import { boxOverlap } from '../shelf/outlines';
import type { ShelfBox, ShelfOutline } from '../relay';
import { inside } from '../guide/loopMath';

export const TARGET_FOLLOW_IOU = 0.3;

export const TARGET_CONFIRM_IOU = 0.5;

export interface Tip {
  x: number;
  y: number;
}

export function followTarget(target: ShelfOutline | null, outlines: ShelfOutline[]): ShelfOutline | null {
  if (!target) {
    return null;
  }
  let best: ShelfOutline | null = null;
  let bestScore = TARGET_FOLLOW_IOU;
  for (const outline of outlines) {
    const score = boxOverlap(target.box, outline.box);
    if (score >= bestScore) {
      bestScore = score;
      best = outline;
    }
  }
  return best ?? target;
}

export function handCoversTarget(hand: Tip | null, box: ShelfBox | null): boolean {
  if (!hand || !box) {
    return false;
  }
  return inside(hand, box);
}

export interface FollowDecision {
  outline: ShelfOutline | null;
  recheck: boolean;
}

export function decideTarget(target: ShelfOutline | null, outlines: ShelfOutline[], hand: Tip | null): FollowDecision {
  if (!target) {
    return { outline: null, recheck: false };
  }
  if (handCoversTarget(hand, target.box)) {
    return { outline: target, recheck: false };
  }
  const best = followTarget(target, outlines) ?? target;
  if (best === target || boxOverlap(target.box, best.box) >= TARGET_CONFIRM_IOU) {
    return { outline: best, recheck: false };
  }
  return { outline: target, recheck: true };
}
