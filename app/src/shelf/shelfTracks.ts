// Tracked outlines: each SAM outline keeps a stable track across
// passes, and its reading stays with it. A fresh outline matching an
// old one by overlap reuses the track; only new or unsure tracks are
// read again, so settled products cost nothing. The overlap is taken
// where the camera has both now, each moved from its own still as the
// guided outline is drawn (t34), when the loop knows the stills.
import { boxArea, boxOverlap } from './outlines';
import type { ShelfBox, ShelfOutline, ShelfRead } from '../relay';

export interface Tracked {
  track: string;
  outline: ShelfOutline;
  read: ShelfRead | null;
}

export function reconcileTracks(
  prev: Tracked[],
  fresh: ShelfOutline[],
  makeId: () => string,
  where: (outline: ShelfOutline) => ShelfBox = (outline) => outline.box,
): Tracked[] {
  const taken = new Set<number>();
  const next: Tracked[] = [];
  for (const old of prev) {
    let best = -1;
    let bestOverlap = 0.5;
    for (let at = 0; at < fresh.length; at += 1) {
      if (taken.has(at)) {
        continue;
      }
      const overlap = boxOverlap(where(old.outline), where(fresh[at] as ShelfOutline));
      if (overlap >= bestOverlap) {
        bestOverlap = overlap;
        best = at;
      }
    }
    if (best >= 0) {
      taken.add(best);
      next.push({ track: old.track, outline: fresh[best] as ShelfOutline, read: old.read });
    }
  }
  for (let at = 0; at < fresh.length; at += 1) {
    if (!taken.has(at)) {
      next.push({ track: makeId(), outline: fresh[at] as ShelfOutline, read: null });
    }
  }
  return next;
}

export function needsRead(tracks: Tracked[]): Tracked[] {
  return tracks.filter((entry) => !entry.read || entry.read.verdict === 'unsure');
}

export function biggestFirst(tracks: Tracked[]): Tracked[] {
  return [...tracks].sort((a, b) => boxArea(b.outline.box) - boxArea(a.outline.box));
}
