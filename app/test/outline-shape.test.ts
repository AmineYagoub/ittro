// The target's SAM outline on screen: the mask's points mapped like
// its box, no shape (so the box is drawn) without enough points, and
// the name pill centred over the cap as ~/ittro/native drew it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { shapeCap, shapePoints } from '../src/shelf/outlines';
import { capPill } from '../src/guide/lines';
import type { ShelfOutline } from '../src/relay';

const box = { x1: 161, y1: 335, x2: 396, y2: 1180, w: 960, h: 1280, confidence: 0.9 };

test('the outline is drawn on screen as the mask, scaled like the box', () => {
  const outline: ShelfOutline = { id: 1, frame: 3, box, mask: { points: [200, 335, 360, 335, 396, 1180, 161, 1180] } };
  // A 480x640 view is the 960x1280 photo at half size.
  assert.equal(shapePoints(outline, 480, 640), '100,168,180,168,198,590,81,590');
});

test('no mask, or too few points, draws the box instead', () => {
  assert.equal(shapePoints({ id: 1, frame: 3, box }, 480, 640), null);
  assert.equal(shapePoints({ id: 1, frame: 3, box, mask: { points: [1, 2, 3, 4] } }, 480, 640), null);
});

test('the pill sits centred over the bottle cap', () => {
  // A bottle: cap 280-320 wide at the top, body 200-400 below.
  const bottle: ShelfOutline = { id: 1, frame: 3, box, mask: { points: [280, 340, 200, 600, 200, 1180, 400, 1180, 400, 600, 320, 340] } };
  const cap = shapeCap(bottle, 480, 640);
  assert.deepEqual(cap, { x: 150, y: 170 });
  const view = { left: 100, top: 170, width: 100, height: 420 };
  // "Masaad water" guesses 12 * 9 + 28 = 136 dp: left 150 - 68.
  assert.deepEqual(capPill(cap as { x: number; y: number }, view, 'Masaad water', 480, 640), { left: 82, top: 126 });
  // Near the right edge the pill stays on screen.
  assert.deepEqual(capPill({ x: 470, y: 170 }, view, 'Masaad water', 480, 640), { left: 336, top: 126 });
});
