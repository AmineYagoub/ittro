// Which way to point the phone at a product out of the picture: left
// or right by its side, higher or lower when it lies further above or
// below than to a side (t37: the Guedila was above the picture, and
// the cue said left).
import test from 'node:test';
import assert from 'node:assert/strict';
import { lostCue } from '../src/guide/loopMath';
import type { ShelfBox } from '../src/relay';

function box(x1: number, y1: number, x2: number, y2: number): ShelfBox {
  return { x1, y1, x2, y2, w: 960, h: 1280, confidence: null };
}

test('t37: a product above the picture asks for the phone higher, below for lower', () => {
  assert.equal(lostCue(box(424, -905, 602, -279)), 'phone_up_small');
  assert.equal(lostCue(box(617, -679, 800, -23)), 'phone_up_small');
  assert.equal(lostCue(box(300, 1500, 480, 2100)), 'phone_down_small');
});

test('a product to a side asks to turn that way', () => {
  assert.equal(lostCue(box(1134, 176, 1335, 873)), 'phone_right_small');
  assert.equal(lostCue(box(-400, 300, -100, 900)), 'phone_left_small');
  assert.equal(lostCue(box(100, 300, 300, 900)), 'phone_left_small');
});

test('above and to a side, the further way wins', () => {
  assert.equal(lostCue(box(1737, -581, 1898, -113)), 'phone_right_small');
});
