// Mask outlines: SAM's raster masks become small polygons the phone
// can shift and draw without decoding anything. The relay pays the
// base85 decode once per SAM pass; each outline ships as a few dozen
// frame pixels and moves with the same pan as its box.
import { decodeMaskToRaster } from '@meta-sam/parser';
import type { SegmentationMask, SegmentationMaskBounds } from '@meta-sam/parser';

export const MASK_ROWS = 32;

export const MASK_POINTS = 48;

function frameX(bounds: SegmentationMaskBounds, maskW: number, mx: number): number {
  const span = bounds.right - bounds.left;
  const x = bounds.left + ((mx + 0.5) / maskW) * span;
  return Math.min(bounds.right, Math.max(bounds.left, Math.round(x)));
}

function frameY(bounds: SegmentationMaskBounds, maskH: number, my: number): number {
  const span = bounds.bottom - bounds.top;
  const y = bounds.top + ((my + 0.5) / maskH) * span;
  return Math.min(bounds.bottom, Math.max(bounds.top, Math.round(y)));
}

function ringFrom(raster: Uint8Array, mask: SegmentationMask, bounds: SegmentationMaskBounds): number[] {
  const left: number[] = [];
  const right: number[] = [];
  const rows = Math.min(MASK_ROWS, mask.height);
  for (let row = 0; row < rows; row += 1) {
    const my = Math.min(mask.height - 1, Math.floor(((row + 0.5) * mask.height) / rows));
    const base = my * mask.width;
    let first = -1;
    let last = -1;
    for (let mx = 0; mx < mask.width; mx += 1) {
      if (raster[base + mx] === 1) {
        if (first < 0) {
          first = mx;
        }
        last = mx;
      }
    }
    if (first < 0) {
      continue;
    }
    left.push(frameX(bounds, mask.width, first), frameY(bounds, mask.height, my));
    right.push(frameX(bounds, mask.width, last), frameY(bounds, mask.height, my));
  }
  const ring = [...left];
  for (let at = right.length - 2; at >= 0; at -= 2) {
    ring.push(right[at] as number, right[at + 1] as number);
  }
  return ring;
}

function dedupe(ring: number[]): number[] {
  const out: number[] = [];
  for (let at = 0; at + 1 < ring.length; at += 2) {
    const x = ring[at] as number;
    const y = ring[at + 1] as number;
    const n = out.length;
    if (n === 0 || out[n - 2] !== x || out[n - 1] !== y) {
      out.push(x, y);
    }
  }
  return out;
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const span = dx * dx + dy * dy;
  if (span === 0) {
    return Math.hypot(px - ax, py - ay);
  }
  const along = Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / span));
  return Math.hypot(px - (ax + along * dx), py - (ay + along * dy));
}

function simplify(ring: number[], tolerance: number): number[] {
  const count = ring.length / 2;
  if (count < 3) {
    return [...ring];
  }
  const keep = new Array<boolean>(count).fill(false);
  keep[0] = true;
  keep[count - 1] = true;
  const stack: Array<[number, number]> = [[0, count - 1]];
  while (stack.length > 0) {
    const [from, to] = stack.pop() as [number, number];
    const ax = ring[from * 2] as number;
    const ay = ring[from * 2 + 1] as number;
    const bx = ring[to * 2] as number;
    const by = ring[to * 2 + 1] as number;
    let best = -1;
    let far = tolerance;
    for (let at = from + 1; at < to; at += 1) {
      const gap = distanceToSegment(ring[at * 2] as number, ring[at * 2 + 1] as number, ax, ay, bx, by);
      if (gap > far) {
        far = gap;
        best = at;
      }
    }
    if (best > 0) {
      keep[best] = true;
      stack.push([from, best], [best, to]);
    }
  }
  const out: number[] = [];
  for (let at = 0; at < count; at += 1) {
    if (keep[at]) {
      out.push(ring[at * 2] as number, ring[at * 2 + 1] as number);
    }
  }
  return out;
}

export function traceMaskOutline(mask: SegmentationMask, bounds: SegmentationMaskBounds): number[] | null {
  let raster: Uint8Array;
  try {
    raster = decodeMaskToRaster(mask);
  } catch {
    return null;
  }
  const ring = dedupe(ringFrom(raster, mask, bounds));
  if (ring.length < 6) {
    return null;
  }
  const across = bounds.right - bounds.left;
  const down = bounds.bottom - bounds.top;
  let tolerance = Math.max(2, Math.hypot(across, down) * 0.01);
  let points = simplify(ring, tolerance);
  while (points.length / 2 > MASK_POINTS) {
    tolerance *= 2;
    points = simplify(ring, tolerance);
  }
  return points.length >= 6 ? points : null;
}
