// Mask outlines: SAM's raster masks become small polygons the phone
// can shift and draw without decoding anything. The relay pays the
// base85 decode once per SAM pass; each outline ships as a few dozen
// frame pixels and moves with the same pan as its box. Each traced row
// keeps the mask's first and last pixel, and a row that falls short of
// the rows a little above and below it on a side is mended to them: SAM
// left a clear bottle's far side out of some rows where the bottle
// beside it shows through, and in t43 the line zig-zagged into the
// Guedila for 9 s. A notch longer than the reach stays, and so does
// any shape that only widens or narrows, like the shoulders.
import { decodeMaskToRaster } from '@meta-sam/parser';
import type { SegmentationMask, SegmentationMaskBounds } from '@meta-sam/parser';

export const MASK_ROWS = 128;

export const MASK_POINTS = 160;

// How far, as a share of the box's diagonal, the drawn line may stray
// from SAM's mask: 1% straightened a bottle's shoulders into one line
// (9 points for a 1.5 L bottle, 1 Nov); 0.25% keeps the curve.
export const MASK_TOLERANCE = 0.0025;

// How far above and below a short row looks for the rows that mend it,
// as a share of the traced rows: 6 of 128 fills a notch of up to 11.
export const MASK_MEND = 0.05;

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

function mended(edge: number[], reach: number, outward: number): number[] {
  return edge.map((x, at) => {
    let above = -Infinity;
    let below = -Infinity;
    for (let near = Math.max(0, at - reach); near < at; near += 1) {
      above = Math.max(above, (edge[near] as number) * outward);
    }
    for (let near = at + 1; near <= Math.min(edge.length - 1, at + reach); near += 1) {
      below = Math.max(below, (edge[near] as number) * outward);
    }
    return Math.max(x * outward, Math.min(above, below)) * outward;
  });
}

function ringFrom(raster: Uint8Array, width: number, height: number, bounds: SegmentationMaskBounds): number[] {
  const ys: number[] = [];
  const firsts: number[] = [];
  const lasts: number[] = [];
  const rows = Math.min(MASK_ROWS, height);
  for (let row = 0; row < rows; row += 1) {
    const my = Math.min(height - 1, Math.floor(((row + 0.5) * height) / rows));
    const base = my * width;
    let first = -1;
    let last = -1;
    for (let mx = 0; mx < width; mx += 1) {
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
    ys.push(my);
    firsts.push(first);
    lasts.push(last);
  }
  const reach = Math.max(2, Math.round(ys.length * MASK_MEND));
  const left = mended(firsts, reach, -1);
  const right = mended(lasts, reach, 1);
  const ring: number[] = [];
  for (let at = 0; at < ys.length; at += 1) {
    ring.push(frameX(bounds, width, left[at] as number), frameY(bounds, height, ys[at] as number));
  }
  for (let at = ys.length - 1; at >= 0; at -= 1) {
    ring.push(frameX(bounds, width, right[at] as number), frameY(bounds, height, ys[at] as number));
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
  return traceRaster(raster, mask.width, mask.height, bounds);
}

/** The outline of a decoded mask, `width` by `height` cells of 0 and 1 covering `bounds`, as frame pixels x, y, x, y, ...; null when too little is set. */
export function traceRaster(raster: Uint8Array, width: number, height: number, bounds: SegmentationMaskBounds): number[] | null {
  const ring = dedupe(ringFrom(raster, width, height, bounds));
  if (ring.length < 6) {
    return null;
  }
  const across = bounds.right - bounds.left;
  const down = bounds.bottom - bounds.top;
  let tolerance = Math.max(1.5, Math.hypot(across, down) * MASK_TOLERANCE);
  let points = simplify(ring, tolerance);
  while (points.length / 2 > MASK_POINTS) {
    tolerance *= 2;
    points = simplify(ring, tolerance);
  }
  return points.length >= 6 ? points : null;
}
