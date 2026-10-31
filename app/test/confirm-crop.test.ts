// The confirm crop around the hand and the product it holds: three
// hand widths a side, at least 360 px, clamped to the photo, the
// whole frame when the hand fills the lens, full frame with no fix.
import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmCropBox } from '../src/confirm/useConfirm';

test('a crop centers on the tip at three hand widths', () => {
  assert.deepEqual(confirmCropBox({ x: 480, y: 640, confidence: 0.9, handWidth: 130, atMs: 1 }, 960, 1280), {
    x1: 285,
    y1: 445,
    x2: 675,
    y2: 835,
  });
});

test('a crop never drops below 360 px a side', () => {
  const cut = confirmCropBox({ x: 480, y: 640, confidence: 0.9, handWidth: 40, atMs: 1 }, 960, 1280);
  assert.deepEqual(cut, { x1: 300, y1: 460, x2: 660, y2: 820 });
});

test('a crop clamps to the photo edges', () => {
  const cut = confirmCropBox({ x: 60, y: 1200, confidence: 0.9, handWidth: 130, atMs: 1 }, 960, 1280);
  assert.deepEqual(cut, { x1: 0, y1: 890, x2: 390, y2: 1280 });
});

test('a hand filling the lens keeps the whole frame', () => {
  const cut = confirmCropBox({ x: 480, y: 640, confidence: 0.9, handWidth: 500, atMs: 1 }, 960, 1280);
  assert.deepEqual(cut, { x1: 0, y1: 160, x2: 960, y2: 1120 });
});

test('no fix means no crop', () => {
  assert.equal(confirmCropBox(null, 960, 1280), null);
  assert.equal(confirmCropBox({ x: 480, y: 640, confidence: 0.9, handWidth: 130, atMs: 1 }, 0, 1280), null);
});

test('a hand on the cap still sends the label: the crop takes the held box too (t6)', () => {
  const held = { x1: 217, y1: 382, x2: 466, y2: 1044, w: 960, h: 1280, confidence: null };
  const cut = confirmCropBox({ x: 337, y: 418, confidence: 0.9, handWidth: 134, atMs: 1 }, 960, 1280, held);
  assert.deepEqual(cut, { x1: 136, y1: 217, x2: 538, y2: 1097 });
});

test('the held box scales from its own photo size', () => {
  const held = { x1: 100, y1: 100, x2: 200, y2: 500, w: 480, h: 640, confidence: null };
  const cut = confirmCropBox({ x: 300, y: 300, confidence: 0.9, handWidth: 100, atMs: 1 }, 960, 1280, held);
  assert.deepEqual(cut, { x1: 120, y1: 120, x2: 480, y2: 1064 });
});
