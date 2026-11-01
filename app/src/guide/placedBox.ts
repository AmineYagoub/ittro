// Where the camera has the guided product now. The native outline is
// moved by the camera's own flow on every frame, clear of the hand,
// while the JavaScript copy of the box stands still whenever a hand is
// in view (t15: the phone panned a bag's width, the outline followed,
// and the cues still said "right" towards where the bag had been).
// Each hand frame reports the drawn outline's key and shift; when the
// key is the guided target's, steering and rechecks use that box.
import type { ShelfBox, ShelfOutline } from '../relay';
import { cameraOutline } from '../shelf/outlines';

const FRESH_MS = 1000;

let latest: { box: ShelfBox; at: number } | null = null;

export interface Placement {
  outlineKey?: string;
  outlineDx?: number;
  outlineDy?: number;
}

export function placedBox(target: ShelfOutline | null, label: string, frame: Placement, now: number): ShelfBox | null {
  const drawn = cameraOutline(target, label);
  const dx = frame.outlineDx;
  const dy = frame.outlineDy;
  if (!target || !drawn || frame.outlineKey !== drawn.key || !Number.isFinite(dx) || !Number.isFinite(dy)) {
    return null;
  }
  const box = { ...target.box, x1: drawn.x1 + (dx as number), y1: drawn.y1 + (dy as number), x2: drawn.x2 + (dx as number), y2: drawn.y2 + (dy as number) };
  latest = { box, at: now };
  return box;
}

/** The last placed box, while it is fresh. */
export function lastPlacedBox(now: number): ShelfBox | null {
  return latest && now - latest.at <= FRESH_MS ? latest.box : null;
}

/** The target where the camera has it now, for matching new SAM cuts against. */
export function placedTarget(target: ShelfOutline | null, now: number): ShelfOutline | null {
  const box = lastPlacedBox(now);
  return target && box ? { ...target, box } : target;
}

export function forgetPlacedBox(): void {
  latest = null;
}
