// The target's SAM outline on screen: the mask's points mapped like
// its box, and no shape (so the box is drawn) without enough points.
import test from 'node:test';
import assert from 'node:assert/strict';
import { shapePoints } from '../src/shelf/outlines';
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
