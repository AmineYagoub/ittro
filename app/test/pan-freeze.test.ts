// The whole-frame pan is frozen while a hand is in view: a hand near
// the lens is most of the frame, and its motion read as the shelf
// moving, dragging every outline after the hand.
import test from 'node:test';
import assert from 'node:assert/strict';
import { HAND_PAN_FREEZE_MS, panFrozenByHand } from '../src/shelf/useShelfSearch';

test('a recent hand fix freezes the pan, an old one or none does not', () => {
  const hand = { x: 300, y: 520, confidence: 0.8, handWidth: 400, atMs: 10000 };
  assert.equal(panFrozenByHand(hand, 10000), true);
  assert.equal(panFrozenByHand(hand, 10000 + HAND_PAN_FREEZE_MS), true);
  assert.equal(panFrozenByHand(hand, 10001 + HAND_PAN_FREEZE_MS), false);
  assert.equal(panFrozenByHand(null, 10000), false);
});
