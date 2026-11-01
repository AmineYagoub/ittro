// The guided outline handed to the camera, which draws and moves it
// natively every frame: SAM's cut as it was in its still, with the
// still's number, so the camera places it by its motion since; an
// outline with no still is placed as it is now.
import test from 'node:test';
import assert from 'node:assert/strict';
import { anchorOutlines, cameraOutline, moveOutlines } from '../src/shelf/outlines';
import type { ShelfOutline } from '../src/relay';

const box = { x1: 161, y1: 335, x2: 396, y2: 1180, w: 960, h: 1280, confidence: 0.9 };
const masaad: ShelfOutline = { id: 1, frame: 3, box, mask: { points: [200, 335, 360, 335, 396, 1180, 161, 1180] } };

test('the camera gets SAM cut from its still, not the box JavaScript moved since', () => {
  const [anchored] = anchorOutlines([masaad], 12);
  const [moved] = moveOutlines([anchored as ShelfOutline], { dx: 4, dy: 0, scale: 6 });
  const outline = cameraOutline(moved as ShelfOutline, 'Masaad water');
  assert.equal(moved?.box.x1, 185);
  assert.deepEqual(
    { x1: outline?.x1, shot: outline?.shot, points: outline?.points, name: outline?.name },
    { x1: 161, shot: 12, points: [200, 335, 360, 335, 396, 1180, 161, 1180], name: 'Masaad water' },
  );
  // The same cut keeps its key while JavaScript moves it, so the camera never re-places it.
  assert.equal(outline?.key, cameraOutline(anchored as ShelfOutline, 'Masaad water')?.key);
});

test('an outline from an unknown still is placed as it is now', () => {
  assert.deepEqual(anchorOutlines([masaad], undefined), [masaad]);
  const outline = cameraOutline(masaad, 'Masaad water');
  assert.equal(outline?.shot, null);
  assert.equal(outline?.x1, 161);
  assert.deepEqual(outline?.points, masaad.mask?.points);
  assert.equal(cameraOutline(null, 'Masaad water'), null);
});
