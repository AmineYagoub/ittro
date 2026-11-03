// t43: SAM left a clear bottle's far side out of some rows where the
// bottle beside it showed through, and the traced line zig-zagged into
// the Guedila. Rows that fall short of the rows a little above and
// below them are mended to them; the shoulders, the neck and a waist
// longer than the reach keep their shape. The bottle here is a 1.5 L
// one's half width down its rows (cap and neck, shoulders, body, base),
// torn as in t43 by leaving its far side out of every other band of
// rows; the traced ring runs down the left side and back up the right.
import test from 'node:test';
import assert from 'node:assert/strict';
import { traceRaster } from '../src/masks.ts';

const W = 100;
const H = 256;
const CENTRE = 50;
const BOUNDS = { left: 0, top: 0, right: W, bottom: H };

function bottleHalf(y: number): number {
  if (y < 30) return 9;
  if (y < 80) return 9 + ((40 - 9) * (y - 30)) / 50;
  if (y < 240) return 40;
  return 40 - ((40 - 30) * (y - 240)) / 16;
}

function raster(half: (y: number) => number): Uint8Array {
  const cells = new Uint8Array(W * H);
  for (let y = 0; y < H; y += 1) {
    for (let x = Math.ceil(CENTRE - half(y)); x <= Math.floor(CENTRE + half(y)); x += 1) {
      cells[y * W + x] = 1;
    }
  }
  return cells;
}

function notched(cells: Uint8Array, from: number, to: number, band: number): Uint8Array {
  const out = Uint8Array.from(cells);
  for (let y = from; y < to; y += 1) {
    if (Math.floor(y / band) % 2 === 0) {
      for (let x = CENTRE + 8; x < W; x += 1) {
        out[y * W + x] = 0;
      }
    }
  }
  return out;
}

function rightAt(points: number[], y: number): number {
  const bottom = points.reduce((best, value, at) => (at % 2 === 1 && value > (points[best] as number) ? at : best), 1);
  const right: Array<[number, number]> = [];
  for (let at = bottom - 1; at + 1 < points.length; at += 2) {
    right.push([points[at] as number, points[at + 1] as number]);
  }
  right.push([points[0] as number, points[1] as number]);
  for (let at = 0; at + 1 < right.length; at += 1) {
    const [x1, y1] = right[at] as [number, number];
    const [x2, y2] = right[at + 1] as [number, number];
    if ((y1 >= y && y2 <= y) || (y1 <= y && y2 >= y)) {
      return y1 === y2 ? Math.max(x1, x2) : x1 + ((x2 - x1) * (y - y1)) / (y2 - y1);
    }
  }
  return Number.NaN;
}

test('t43: a far side left out of every other band of rows is traced along the bottle, not into it', () => {
  const clean = traceRaster(raster(bottleHalf), W, H, BOUNDS);
  const torn = traceRaster(notched(raster(bottleHalf), 120, 220, 8), W, H, BOUNDS);
  assert.ok(clean && torn);
  for (let y = 120; y < 220; y += 2) {
    assert.ok(rightAt(torn, y) >= CENTRE + 38, `row ${y} traced at ${rightAt(torn, y)}`);
  }
  assert.ok(torn.length <= clean.length + 8, `${torn.length / 2} points against ${clean.length / 2}`);
});

test('t43: the neck and the shoulders keep their shape', () => {
  const clean = traceRaster(raster(bottleHalf), W, H, BOUNDS);
  assert.ok(clean);
  assert.ok(Math.abs(rightAt(clean, 20) - (CENTRE + 9)) <= 1.5);
  assert.ok(Math.abs(rightAt(clean, 55) - (CENTRE + 9 + (31 * 25) / 50)) <= 2);
  assert.ok(Math.abs(rightAt(clean, 150) - (CENTRE + 40)) <= 1.5);
});

test('t43: a waist longer than the mending reach is kept', () => {
  const waisted = (y: number): number => (y >= 120 && y < 200 ? 30 : bottleHalf(y));
  const traced = traceRaster(raster(waisted), W, H, BOUNDS);
  assert.ok(traced);
  assert.ok(Math.abs(rightAt(traced, 160) - (CENTRE + 30)) <= 1.5);
});
