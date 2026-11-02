// SAM and the reaching hand. A hand touching a product is cut in with
// it (t34: the hand and the Guedila came back as one wide outline), so
// while guiding no still is cut with a hand near the guided product,
// within half its size, and outlines a hand touches are dropped from a
// cut. A hand clear of the product leaves the cuts going: the phone
// moves most during the reach, and the cuts keep the outline on the
// product while it does.
import type { ShelfBox, ShelfOutline } from '../relay';
import type { HandBox } from '../guide/types';
import type { LoopDeps } from './loopTypes';
import { expandBox } from './outlines';

/** How close a hand may come to the guided product, as a share of its size, before cuts stop. */
export const HAND_CLEAR = 0.5;

/** How much a hand grows, as a share of its size, before outlines it touches are dropped: it moves while the still is taken. */
export const HAND_GROW = 0.25;

function touches(a: HandBox, b: HandBox): boolean {
  return Math.min(a.x2, b.x2) > Math.max(a.x1, b.x1) && Math.min(a.y2, b.y2) > Math.max(a.y1, b.y1);
}

/** A hand near the guided product; a hand or product whose box is unknown counts as near. */
export function handNearTarget(hand: HandBox | null, target: ShelfBox | null): boolean {
  return !hand || !target || touches(hand, expandBox(target, HAND_CLEAR));
}

/** A hand in view near the guided product: no pass may cut while guiding. */
export function handBlocks(deps: LoopDeps): boolean {
  return Boolean(deps.handInView?.()) && handNearTarget(deps.handBox?.() ?? null, deps.readContext().guideBox ?? null);
}

/** A cut's outlines clear of the hand in its still, saying how many were dropped; null when the hand touched them all. */
export function handFreeCut(deps: LoopDeps, outlines: ShelfOutline[], hand: HandBox | null | undefined): ShelfOutline[] | null {
  const clear = clearOfHand(outlines, hand);
  if (clear.length < outlines.length) {
    deps.log(`shelf cut dropped ${outlines.length - clear.length} of ${outlines.length} outlines under the hand`);
  }
  return clear.length > 0 || outlines.length === 0 ? clear : null;
}

/** The outlines of a cut that the hand in its still does not touch. */
export function clearOfHand(outlines: ShelfOutline[], hand: HandBox | null | undefined): ShelfOutline[] {
  if (!hand) {
    return outlines;
  }
  const growW = (hand.x2 - hand.x1) * HAND_GROW;
  const growH = (hand.y2 - hand.y1) * HAND_GROW;
  const grown = { x1: hand.x1 - growW, y1: hand.y1 - growH, x2: hand.x2 + growW, y2: hand.y2 + growH };
  return outlines.filter((outline) => !touches(outline.box, grown));
}
