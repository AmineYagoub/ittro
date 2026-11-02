// Cutting the guided outline again once the phone rests after a move.
// The outline is SAM's cut of a still, carried to the live camera by
// the measured pan, and in t31 the carry slid half a bottle off the
// Guedila: the shelf drifted while the find's still was 7 s old, and
// parallax under-read a pan (the bottles, nearer than the wall, moved
// further). Once the camera has moved more than 3% of the frame since
// the outline's still and held still for 0.4 s, with no hand in view,
// the next pass cuts a still taken after the move, and the guide
// adopts the cut where the product really is. A still from before the
// camera last opened is cut again too, as no motion since it is known
// (t32 reopened the camera when the search went on after a no). The
// last signature is forgotten, so the cut reaches the guide even when
// it rounds to the old one; the next re-cut waits for another move.
// When nothing in the cut lies where the outline is drawn, the pass
// reads it, and the yes nearest the drawn outline takes the target: in
// t33 the outline had slid a bottle off onto the wall during a turn,
// the re-cut read the Masaad yes, and the old rule kept the wall as the
// target because the yes was elsewhere. Pans older than 1.5 s say
// nothing about resting now. While guiding, labels waiting for a read
// call a pass only when it will read them, as the pass reads then only
// to confirm the target: a re-cut that saw bottles the find never read
// would otherwise start SAM back to back, every read paused (t29 ran
// one such pass at 10:47:11).
import { TARGET_CONFIRM_IOU } from '../conversation/searchTarget';
import type { ShelfOutline } from '../relay';
import { targetJumped } from './loopReads';
import type { ReadsContext } from './loopReads';
import type { CameraPan, LoopPhoto, LoopState } from './loopTypes';
import { boxOverlap } from './outlines';

/** How far the camera must have moved since the outline's still, as a share of the frame. */
export const RECUT_MOVE = 0.03;

/** How little the camera may move between two samples RECUT_STEADY_MS apart to be at rest. */
export const RECUT_STEADY = 0.005;

export const RECUT_STEADY_MS = 400;

/** The least time from the last outline to a re-cut. */
export const RECUT_GAP_MS = 2500;

const SAMPLE_KEEP_MS = 1500;

function sameOpening(a: CameraPan, b: CameraPan): boolean {
  return (a.session ?? 0) === (b.session ?? 0);
}

function resting(state: LoopState, pan: CameraPan, now: number): boolean {
  const recent = state.panSamples.filter((sample) => now - sample.at <= SAMPLE_KEEP_MS);
  const before = recent.filter((sample) => now - sample.at >= RECUT_STEADY_MS).pop() ?? null;
  state.panSamples = [...recent, { at: now, pan }];
  return (
    before !== null &&
    sameOpening(before.pan, pan) &&
    Math.abs(pan.x - before.pan.x) < RECUT_STEADY &&
    Math.abs(pan.y - before.pan.y) < RECUT_STEADY
  );
}

/** True when the guided outline should be cut again from a fresh still; each call notes where the camera points. */
export function recutDue(ctx: ReadsContext): boolean {
  const { deps, state } = ctx;
  const pan = deps.pan?.() ?? null;
  if (!pan) {
    return false;
  }
  const now = deps.now();
  const rested = resting(state, pan, now);
  const from = state.outlinedPan;
  if (!rested || !from || state.outlinedAt === null || now - state.outlinedAt < RECUT_GAP_MS) {
    return false;
  }
  const reopened = !sameOpening(from, pan);
  const dx = pan.x - from.x;
  const dy = pan.y - from.y;
  if (!reopened && Math.abs(dx) <= RECUT_MOVE && Math.abs(dy) <= RECUT_MOVE) {
    return false;
  }
  if (state.cloudBusy || state.tracks.length === 0 || !deps.readContext().guiding || deps.handInView?.()) {
    return false;
  }
  if (state.recutAt === null || state.recutAt <= state.outlinedAt) {
    deps.log(reopened ? "shelf recut, the camera reopened since the outline's photo" : `shelf recut, camera moved ${dx.toFixed(3)},${dy.toFixed(3)} since the outline's photo`);
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
  return asked && held !== null && !outlines.some((outline) => boxOverlap(outline.box, held) >= TARGET_CONFIRM_IOU);
}

/** Labels waiting to be read call a pass, but while guiding only one that will read them: to confirm a lost, doubtful or moved target, never under the hand. */
export function readsDue(ctx: ReadsContext, waiting: boolean): boolean {
  const context = ctx.deps.readContext();
  if (!waiting || !context.guiding) {
    return waiting;
  }
  return !context.handCovering && Boolean(context.guideLost || context.guideRecheck || targetJumped(ctx.state));
}

/** The stills a pass may cut once a re-cut was asked: those taken since, never one from before the move. */
export function recutPhotos(state: LoopState, photos: LoopPhoto[]): LoopPhoto[] {
  const since = state.recutAt;
  return since === null ? photos : photos.filter((photo) => (photo.at ?? since) >= since);
}
