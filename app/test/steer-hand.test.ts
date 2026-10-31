// A hand wrapped round the product touches it even when the fingertip
// points past the outline (t8: fingers round the Masaad's label, tip
// above the box's top edge, "almost" for ever).
import test from 'node:test';
import assert from 'node:assert/strict';
import { handOnBox, steerFor } from '../src/guide/steer';

const MASAAD = { x1: 314, y1: 359, x2: 576, y2: 1041, w: 960, h: 1280, confidence: null };

test('t8: the tip above the box with the hand round the label is covering', () => {
  const tip = { x: 441, y: 317 };
  assert.equal(steerFor(tip, MASAAD).kind, 'almost');
  assert.equal(steerFor(tip, MASAAD, { x1: 300, y1: 280, x2: 480, y2: 560 }).kind, 'covering');
});

test('a hand beside the product is not on it', () => {
  assert.equal(handOnBox({ x1: 600, y1: 400, x2: 760, y2: 640 }, MASAAD), false);
});

test('a hand close to the lens, far wider than the product, is not on it', () => {
  assert.equal(handOnBox({ x1: 100, y1: 300, x2: 800, y2: 900 }, MASAAD), false);
});

test('a hand with only a sliver on the product is not on it', () => {
  assert.equal(handOnBox({ x1: 540, y1: 400, x2: 740, y2: 640 }, MASAAD), false);
});
