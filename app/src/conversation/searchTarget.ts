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
  box?: { x1: number; y1: number; x2: number; y2: number };
}

// A hand whose box lies this much over the product covers it, even
// with the fingertip beside it: t13's fingers reached over the
// Masaad's neck from the right, SAM cut the neck away, and the cut
// replaced the whole outline.
export const HAND_OVER_SHARE = 0.2;

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
  if (inside(hand, box)) {
    return true;
  }
  const over = hand.box;
  if (!over) {
    return false;
  }
  const across = Math.max(0, Math.min(over.x2, box.x2) - Math.max(over.x1, box.x1));
  const down = Math.max(0, Math.min(over.y2, box.y2) - Math.max(over.y1, box.y1));
  const area = Math.max(1, (over.x2 - over.x1) * (over.y2 - over.y1));
  return (across * down) / area >= HAND_OVER_SHARE;
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
