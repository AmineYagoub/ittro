// The rest read behind the guide loop: a fingertip resting on a
// product that is not the target reads that product, and a no comes
// back with the way toward the target. Pure against the loop state,
// so the loop keeps its size and the read keeps its tests.
import type { ShelfBox, ShelfOutline } from '../relay';
import { linkKindFor } from '../metaCall';
import { linkEvent } from '../conversation/link';
import { boxOverlap } from '../shelf/outlines';
import { centerOf, cueIdFor, steerFor } from './steer';
import type { TipPoint } from './types';
import { inside } from './loopMath';
import type { GuideLoopDeps, GuideLoopState } from './loopTypes';

const REST_MS = 500;

const REST_RADIUS = 0.5;

function cueToward(tip: TipPoint, box: ShelfBox): string {
  const center = centerOf(box);
  if (Math.abs(tip.x - center.x) >= Math.abs(tip.y - center.y)) {
    return tip.x < center.x ? 'hand_right' : 'hand_left';
  }
  return tip.y < center.y ? 'hand_down' : 'hand_up';
}

export async function restRead(
  state: GuideLoopState,
  deps: GuideLoopDeps,
  tip: TipPoint,
  outlines: ShelfOutline[],
  target: ShelfBox,
  handWidth: number,
): Promise<void> {
  const anchor = state.restAnchor;
  if (!anchor || Math.hypot(tip.x - anchor.x, tip.y - anchor.y) > REST_RADIUS * handWidth) {
    state.restAnchor = { ...tip };
    state.restSince = deps.now();
    state.restRead = false;
    return;
  }
  if (state.restRead || deps.now() - state.restSince < REST_MS) {
    return;
  }
  state.restRead = true;
  const container = outlines.find((outline) => inside(tip, outline.box) && boxOverlap(outline.box, target) < 0.5) ?? null;
  const photo = state.photo;
  if (!container || !photo) {
    return;
  }
  const reading = state.restAnchor;
  try {
    const crop = await deps.cutCrop(photo.image, container.box);
    if (!crop) {
      return;
    }
    const answer = await deps.read(state.label, [crop]);
    deps.send({ type: 'LINK_OK' });
    const verdict = answer.reads[0];
    if (!verdict || verdict.verdict !== 'no') {
      return;
    }
    if (state.restAnchor !== reading || !state.restRead) {
      return;
    }
    const label = [verdict.brand_text, verdict.size_text].filter((part) => part && part.length > 0).join(' ') || verdict.spoken;
    const steer = steerFor(tip, target);
    const cue = steer.kind === 'move' ? cueIdFor(steer.dir, steer.small, false) : cueToward(tip, target);
    deps.log(`guide rest read ${answer.readMs}ms verdict no label ${label}`);
    deps.send({ type: 'GUIDE_WRONG', label, cue });
  } catch (error) {
    deps.log(`guide rest read failed: ${String((error as Error)?.message ?? error)}`);
    deps.send(linkEvent(linkKindFor(error)));
  }
}
