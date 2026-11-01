// A hand over the product holds its outline even with the fingertip
// beside it. t13: the fingers reached over the Masaad's neck from the
// right (tip 683,414, hand 205-683 x 265-496), SAM cut the neck away
// and the cut replaced the whole outline.
import test from 'node:test';
import assert from 'node:assert/strict';
import { decideTarget, handCoversTarget } from '../src/conversation/searchTarget';
import type { ShelfBox, ShelfOutline } from '../src/relay';

function box(x1: number, y1: number, x2: number, y2: number): ShelfBox {
  return { x1, y1, x2, y2, w: 960, h: 1280, confidence: null };
}

const MASAAD = box(287, 320, 520, 1067);
const HAND = { x: 683, y: 414, box: { x1: 205, y1: 265, x2: 683, y2: 496 } };

test('t13: a hand across the neck covers the product', () => {
  assert.equal(handCoversTarget(HAND, MASAAD), true);
  assert.equal(handCoversTarget({ x: 683, y: 414 }, MASAAD), false);
});

test('a hand off to the side does not', () => {
  assert.equal(handCoversTarget({ x: 900, y: 400, box: { x1: 700, y1: 300, x2: 950, y2: 520 } }, MASAAD), false);
});

test('the whole outline holds while the hand is over it', () => {
  const whole: ShelfOutline = { id: 1, frame: 0, box: MASAAD, mask: { points: [380, 320, 287, 600, 287, 1067, 520, 1067, 520, 600, 430, 320] } };
  const cut: ShelfOutline = { id: 4, frame: 0, box: box(233, 434, 462, 1013) };
  assert.equal(decideTarget(whole, [cut], HAND).outline, whole);
});
