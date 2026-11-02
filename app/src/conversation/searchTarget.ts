// The found target across shelf passes: SAM numbers its objects per
// response, so an id says nothing across passes and the target
// follows the outline that overlaps it best. The overlap is taken
// where the camera has each cut now, when the loop sends that: in t34
// a cut of an old still was matched as if the camera had not moved,
// and the target went to the bottle beside it. A hand on the product
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

function bestMatch(target: ShelfOutline, outlines: ShelfOutline[], now: ShelfBox[] | undefined): { at: number; overlap: number } {
  let at = -1;
  let overlap = TARGET_FOLLOW_IOU;
  for (let i = 0; i < outlines.length; i += 1) {
    const score = boxOverlap(target.box, now?.[i] ?? (outlines[i] as ShelfOutline).box);
    if (score >= overlap) {
      overlap = score;
      at = i;
    }
  }
  return { at, overlap };
}

/** The outline that overlaps the target best, each at its box in `now` when given; the target when none overlaps enough. */
export function followTarget(target: ShelfOutline | null, outlines: ShelfOutline[], now?: ShelfBox[]): ShelfOutline | null {
  if (!target) {
    return null;
  }
  const best = bestMatch(target, outlines, now);
  return best.at >= 0 ? (outlines[best.at] as ShelfOutline) : target;
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

function sameBox(a: ShelfBox, b: ShelfBox): boolean {
  return a.x1 === b.x1 && a.y1 === b.y1 && a.x2 === b.x2 && a.y2 === b.y2;
}

/** The target after a pan moved the loop's outlines: the outline cut from the same still as the same box, since a move says nothing new about which product is which (t34: boxes held under a hand were matched against the drawn outline, which had moved on). Outlines without a still match by overlap. */
export function followMoved(target: ShelfOutline | null, outlines: ShelfOutline[], hand: Tip | null, recheck: boolean): FollowDecision {
  const anchor = target?.anchor;
  if (!target || !anchor) {
    return decideTarget(target, outlines, hand);
  }
  const same = outlines.find((outline) => outline.anchor?.shot === anchor.shot && sameBox(outline.anchor.box, anchor.box));
  return { outline: same ?? target, recheck };
}

/** Follows the target to the outline over it, holds it under a hand, and holds it with a recheck when the best overlap is weak; `now` places each outline where the camera has it. */
export function decideTarget(target: ShelfOutline | null, outlines: ShelfOutline[], hand: Tip | null, now?: ShelfBox[]): FollowDecision {
  if (!target) {
    return { outline: null, recheck: false };
  }
  if (handCoversTarget(hand, target.box)) {
    return { outline: target, recheck: false };
  }
  const best = bestMatch(target, outlines, now);
  if (best.at < 0) {
    return { outline: target, recheck: false };
  }
  if (best.overlap >= TARGET_CONFIRM_IOU) {
    return { outline: outlines[best.at] as ShelfOutline, recheck: false };
  }
  return { outline: target, recheck: true };
}
