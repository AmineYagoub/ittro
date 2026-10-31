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
