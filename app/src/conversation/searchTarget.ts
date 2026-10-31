// The found target across shelf passes: SAM numbers its objects per
// response, so an id says nothing across passes and the target
// follows the outline that overlaps it best. When nothing overlaps,
// the last box holds until the product is back.
import { boxOverlap } from '../shelf/outlines';
import type { ShelfOutline } from '../relay';

export const TARGET_FOLLOW_IOU = 0.3;

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
