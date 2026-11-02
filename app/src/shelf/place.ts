// Placing the shelf's outlines where the camera has them now, the way
// native code draws the guided outline: SAM's box on its still, moved
// by the camera's motion since (outlines.ts boxNow). Every match
// against the drawn outline goes through here: in t34 a cut of an 18 s
// old still was matched as if the camera had not moved since, and the
// outline jumped from the Masaad to the Guedila beside it. The loop's
// own copies of the boxes still move with the older JavaScript pan,
// for the outlines drawn beside the guided one.
import type { ShelfBox, ShelfOutline } from '../relay';
import type { LoopDeps, LoopState } from './loopTypes';
import { boxNow, moveOutlines } from './outlines';
import type { PanShift } from './outlines';

/** Places outlines where the camera has them now; boxes stay as cut when the loop knows no stills (tests). */
export function placer(deps: LoopDeps): (outline: ShelfOutline) => ShelfBox {
  const now = deps.pan?.() ?? null;
  const stillPan = deps.stillPan ?? (() => null);
  return (outline) => boxNow(outline, now, stillPan);
}

/** The fast path: the loop's boxes move with each pan shift between cloud passes; a scene change asks for a fresh pass instead. */
export function shiftTracks(deps: LoopDeps, state: LoopState, shift: PanShift, changed: boolean): void {
  if (!Number.isFinite(shift.dx) || !Number.isFinite(shift.dy) || !(shift.scale > 0)) {
    return;
  }
  if (changed) {
    state.sceneChanged = true;
    return;
  }
  if (state.tracks.length === 0 || (shift.dx === 0 && shift.dy === 0)) {
    return;
  }
  const moved = moveOutlines(
    state.tracks.map((entry) => entry.outline),
    shift,
  );
  state.tracks = state.tracks.map((entry, at) => ({ ...entry, outline: moved[at] as ShelfOutline }));
  deps.send({ type: 'OUTLINES_MOVED', outlines: moved });
}
