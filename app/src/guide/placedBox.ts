// Where the camera has the guided product now. The native outline is
// moved by the camera's own flow on every frame, clear of the hand,
// while the JavaScript copy of the box stands still whenever a hand is
// in view (t15: the phone panned a bag's width, the outline followed,
// and the cues still said "right" towards where the bag had been).
// Each hand frame reports the drawn outline's key, shift and growth;
// when the key is the guided target's, steering and rechecks use that
// box. An outline with no still is drawn from its own shape, so the
// shape moves and grows with the box: in t39 a carried Masaad's box
// followed the phone off the shelf while its shape stayed drawn where
// the bottle had been.
import type { ShelfBox, ShelfOutline } from '../relay';
import { cameraOutline, grownBox } from '../shelf/outlines';

const FRESH_MS = 1000;

let latest: { box: ShelfBox; at: number } | null = null;

export interface Placement {
  outlineKey?: string;
  outlineDx?: number;
  outlineDy?: number;
  outlineScale?: number;
}

export function placedBox(target: ShelfOutline | null, label: string, frame: Placement, now: number): ShelfBox | null {
  const drawn = cameraOutline(target, label);
  const dx = frame.outlineDx;
  const dy = frame.outlineDy;
  if (!target || !drawn || frame.outlineKey !== drawn.key || !Number.isFinite(dx) || !Number.isFinite(dy)) {
    return null;
  }
  const grew = Number.isFinite(frame.outlineScale) ? (frame.outlineScale as number) : 1;
  const box = grownBox({ ...target.box, x1: drawn.x1, y1: drawn.y1, x2: drawn.x2, y2: drawn.y2, w: drawn.w, h: drawn.h }, grew, dx as number, dy as number);
  latest = { box, at: now };
  return box;
}

/** The last placed box, while it is fresh. */
export function lastPlacedBox(now: number): ShelfBox | null {
  return latest && now - latest.at <= FRESH_MS ? latest.box : null;
}

/** The target where the camera has it now, for matching new SAM cuts against; one with no still moves and grows its shape too. */
export function placedTarget(target: ShelfOutline | null, now: number): ShelfOutline | null {
  const box = lastPlacedBox(now);
  if (!target || !box) {
    return target;
  }
  if (target.anchor) {
    return { ...target, box };
  }
  const sx = (box.x2 - box.x1) / Math.max(1e-6, target.box.x2 - target.box.x1);
  const sy = (box.y2 - box.y1) / Math.max(1e-6, target.box.y2 - target.box.y1);
  const points = target.mask?.points.map((value, at) =>
    at % 2 === 0 ? box.x1 + (value - target.box.x1) * sx : box.y1 + (value - target.box.y1) * sy,
  );
  return { ...target, box, ...(points ? { mask: { points } } : {}) };
}

export function forgetPlacedBox(): void {
  latest = null;
}
