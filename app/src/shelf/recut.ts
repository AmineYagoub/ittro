// Cutting the guided outline again as the phone moves. The outline is
// SAM's cut of a still, carried to the live camera by the measured
// pan, one shift and one growth for the whole picture: it follows the
// phone turning and nearing, but not the bottles, nearer than the
// wall, moving and growing further (t31: half a bottle off the
// Guedila). Once the middle of the picture has moved more than 3% of
// the frame since the last cut's still, or the picture grew or shrank
// enough to move its edges as far, and that cut landed half a second
// ago, the next pass cuts a
// still taken since, moving or not: with SAM's own time, a cut about
// every 2 s while the phone moves (founder, 2 Nov: the outline left
// the product while the camera moved, held while it was fixed). A
// still from before the camera last opened is cut again too, as no
// motion since it is known (t32 reopened the camera when the search
// went on after a no). The last signature is forgotten, so the cut
// reaches the guide even when it rounds to the old one.
// When nothing in the cut lies where the outline is drawn, the pass
// reads it, and the yes nearest the drawn outline takes the target: in
// t33 the outline had slid a bottle off onto the wall during a turn,
// the re-cut read the Masaad yes, and the old rule kept the wall as the
// target because the yes was elsewhere. While guiding, labels waiting for a read
// call a pass only when it will read them, as the pass reads then only
// to confirm the target: a re-cut that saw bottles the find never read
// would otherwise start SAM back to back, every read paused (t29 ran
// one such pass at 10:47:11). While guiding, a pass cuts only a still
// from the last 2.5 s with no hand near the product (handClear.ts):
// t34 cut the hand in with the Guedila as one wide outline, and re-cut
// an 18 s old still of where the camera no longer pointed.
import { TARGET_CONFIRM_IOU } from '../conversation/searchTarget';
import type { ShelfOutline } from '../relay';
import { targetJumped } from './loopReads';
import type { ReadsContext } from './loopReads';
import type { CameraPan, LoopPhoto, LoopState } from './loopTypes';
import { boxOverlap } from './outlines';
import { placer } from './place';
import { handBlocks, handNearTarget } from './handClear';

/** How far the camera must have moved since the outline's still, as a share of the frame. */
export const RECUT_MOVE = 0.03;

/** The least time from the last cut landing to the next re-cut. */
export const RECUT_GAP_MS = 500;

const GUIDE_STILL_MS = 2500;

function sameOpening(a: CameraPan, b: CameraPan): boolean {
  return (a.session ?? 0) === (b.session ?? 0);
}

/** True when the guided outline should be cut again from a fresh still: the camera moved since the last cut's still, or opened again. */
export function recutDue(ctx: ReadsContext): boolean {
  const { deps, state } = ctx;
  const pan = deps.pan?.() ?? null;
  const from = state.outlinedPan;
  const now = deps.now();
  if (!pan || !from || state.outlinedAt === null || now - state.outlinedAt < RECUT_GAP_MS) {
    return false;
  }
  const reopened = !sameOpening(from, pan);
  const grew = (pan.s ?? 1) / (from.s ?? 1);
  const dx = pan.x - grew * from.x;
  const dy = pan.y - grew * from.y;
  if (!reopened && Math.abs(dx) <= RECUT_MOVE && Math.abs(dy) <= RECUT_MOVE && Math.abs(grew - 1) / 2 <= RECUT_MOVE) {
    return false;
  }
  if (state.cloudBusy || state.tracks.length === 0 || !deps.readContext().guiding || handBlocks(deps)) {
    return false;
  }
  if (state.recutAt === null || state.recutAt <= state.outlinedAt) {
    const grown = Math.abs(grew - 1) >= 0.005 ? ` and grew ${grew.toFixed(2)} times` : '';
    deps.log(reopened ? "shelf recut, the camera reopened since the outline's photo" : `shelf recut, camera moved ${dx.toFixed(3)},${dy.toFixed(3)}${grown} since the outline's photo`);
  }
  state.recutAt = now;
  state.recutPending = true;
  state.lastSignature = '';
  return true;
}

/** Whether a pass must read its cut to place the target again: a re-cut was asked and nothing cut overlaps the drawn outline as the guide would snap to. Each pass that cuts answers once. */
export function reanchorDue(ctx: ReadsContext, outlines: ShelfOutline[]): boolean {
  const asked = ctx.state.recutPending;
  ctx.state.recutPending = false;
  const held = ctx.deps.readContext().guideBox ?? null;
  const place = placer(ctx.deps);
  return asked && held !== null && !outlines.some((outline) => boxOverlap(place(outline), held) >= TARGET_CONFIRM_IOU);
}

/** Labels waiting to be read call a pass, but while guiding only one that will read them: to confirm a lost, doubtful or moved target, never under the hand. */
export function readsDue(ctx: ReadsContext, waiting: boolean): boolean {
  const context = ctx.deps.readContext();
  if (!waiting || !context.guiding) {
    return waiting;
  }
  return !context.handCovering && Boolean(context.guideLost || context.guideRecheck || targetJumped(ctx.state, placer(ctx.deps)));
}

/** While guiding, the stills a pass may cut: taken in the last 2.5 s, with no hand near the product. */
export function guideStills(ctx: ReadsContext, photos: LoopPhoto[]): LoopPhoto[] {
  const context = ctx.deps.readContext();
  if (!context.guiding) {
    return photos;
  }
  const now = ctx.deps.now();
  const near = (photo: LoopPhoto): boolean => Boolean(photo.hand) && handNearTarget(photo.handBox ?? null, context.guideBox ?? null);
  return photos.filter((photo) => !near(photo) && now - (photo.at ?? now) <= GUIDE_STILL_MS);
}

/** The stills a pass may cut once a re-cut was asked: those taken since, never one from before the move. */
export function recutPhotos(state: LoopState, photos: LoopPhoto[]): LoopPhoto[] {
  const since = state.recutAt;
  return since === null ? photos : photos.filter((photo) => (photo.at ?? since) >= since);
}
