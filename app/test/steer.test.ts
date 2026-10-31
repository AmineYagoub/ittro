// Steering policy checks: one axis at a time with left/right first,
// small corrections under one box width, the almost ring a quarter
// of the box's short side wide, covering inside it, and the
// proximity behind the ticks. Margins come from the box, not the
// hand: a hand near the lens is wider than the whole product.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cueIdFor, continueIdFor, meterSegments, positionFor, proximityFor, steerFor, tickGapMs } from '../src/guide/steer';
import type { ShelfBox } from '../src/relay';

function box(x1: number, y1: number, x2: number, y2: number): ShelfBox {
  return { x1, y1, x2, y2, w: 1280, h: 960, confidence: null };
}

const TARGET = box(600, 400, 760, 640);

test('a hand far left of the target moves right', () => {
  assert.deepEqual(steerFor({ x: 300, y: 520 }, TARGET), { kind: 'move', dir: 'right', small: false });
});

test('a hand far right of the target moves left', () => {
  assert.deepEqual(steerFor({ x: 1100, y: 520 }, TARGET), { kind: 'move', dir: 'left', small: false });
});

test('left and right win over up and down', () => {
  assert.deepEqual(steerFor({ x: 300, y: 100 }, TARGET), { kind: 'move', dir: 'right', small: false });
  assert.deepEqual(steerFor({ x: 680, y: 100 }, TARGET), { kind: 'move', dir: 'down', small: false });
  assert.deepEqual(steerFor({ x: 680, y: 900 }, TARGET), { kind: 'move', dir: 'up', small: false });
});

test('a gap under one hand width is a small correction', () => {
  assert.deepEqual(steerFor({ x: 540, y: 520 }, TARGET), { kind: 'move', dir: 'right', small: true });
  assert.deepEqual(steerFor({ x: 680, y: 700 }, TARGET), { kind: 'move', dir: 'up', small: true });
});

test('the fingertip at the outline is almost there', () => {
  assert.deepEqual(steerFor({ x: 595, y: 520 }, TARGET), { kind: 'almost' });
  assert.deepEqual(steerFor({ x: 680, y: 645 }, TARGET), { kind: 'almost' });
});

test('the fingertip inside the outline covers the target', () => {
  assert.deepEqual(steerFor({ x: 680, y: 520 }, TARGET), { kind: 'covering' });
});

test('a reach from the left walks right, small, almost, covering', () => {
  const path = [200, 350, 500, 555, 590, 640, 700].map((x) => steerFor({ x, y: 520 }, TARGET));
  assert.deepEqual(path, [
    { kind: 'move', dir: 'right', small: false },
    { kind: 'move', dir: 'right', small: false },
    { kind: 'move', dir: 'right', small: true },
    { kind: 'move', dir: 'right', small: true },
    { kind: 'almost' },
    { kind: 'covering' },
    { kind: 'covering' },
  ]);
});

test('a reach from the right mirrors the left', () => {
  const path = [1150, 950, 820, 810, 780, 720].map((x) => steerFor({ x, y: 520 }, TARGET));
  assert.deepEqual(path, [
    { kind: 'move', dir: 'left', small: false },
    { kind: 'move', dir: 'left', small: false },
    { kind: 'move', dir: 'left', small: true },
    { kind: 'move', dir: 'left', small: true },
    { kind: 'almost' },
    { kind: 'covering' },
  ]);
});

test('cue ids follow SCRIPT.md, continuations keep the axis', () => {
  assert.equal(cueIdFor('right', false, false), 'hand_right');
  assert.equal(cueIdFor('right', true, false), 'hand_right_small');
  assert.equal(cueIdFor('right', false, true), 'hand_right_continue');
  assert.equal(continueIdFor('hand_up_small'), 'hand_up_continue');
  assert.equal(continueIdFor('hand_down'), 'hand_down_continue');
});

test('proximity rises toward the target and drives the tick gap', () => {
  const diag = Math.hypot(1280, 960);
  const far = proximityFor({ x: 100, y: 100 }, TARGET, diag);
  const near = proximityFor({ x: 640, y: 520 }, TARGET, diag);
  assert.ok(far < 0.4 && near > 0.9);
  assert.equal(tickGapMs(0), 600);
  assert.equal(tickGapMs(1), 120);
  assert.ok(tickGapMs(near) < tickGapMs(far));
});

test('the meter fills from one segment to five', () => {
  assert.equal(meterSegments(0), 1);
  assert.equal(meterSegments(0.5), 3);
  assert.equal(meterSegments(1), 5);
});

test('the position names the third of the photo', () => {
  assert.equal(positionFor(box(100, 400, 200, 640), 1280), 'left');
  assert.equal(positionFor(box(600, 400, 760, 640), 1280), 'middle');
  assert.equal(positionFor(box(1000, 400, 1150, 640), 1280), 'right');
});

test('a hand wider than the product still gets a small move, not an almost', () => {
  const tall: ShelfBox = { x1: 300, y1: 500, x2: 420, y2: 900, w: 960, h: 1280, confidence: null };
  assert.deepEqual(steerFor({ x: 250, y: 700 }, tall), { kind: 'move', dir: 'right', small: true });
  assert.deepEqual(steerFor({ x: 290, y: 700 }, tall), { kind: 'almost' });
  assert.deepEqual(steerFor({ x: 100, y: 700 }, tall), { kind: 'move', dir: 'right', small: false });
});
