// t34: a cut is placed where the camera has it now, moved from its own
// still as the native outline is drawn, and every match against the
// drawn outline uses that place: an old cut matched by its raw box
// sent the target to the bottle beside the Masaad. A product keeps its
// track and read across cuts of stills taken at different pans, and a
// pan move follows the target's own cut, never a neighbour moved over
// it, leaving any recheck as it was. A cut keeps where the camera
// pointed for its still, so it is placed after the camera has
// forgotten the still (t39).
import test from 'node:test';
import assert from 'node:assert/strict';
import { boxNow } from '../src/shelf/outlines';
import { decideTarget, followMoved } from '../src/conversation/searchTarget';
import { reconcileTracks } from '../src/shelf/shelfTracks';
import type { ShelfBox, ShelfOutline, ShelfRead } from '../src/relay';

const W = 960;

const NOW = { x: 0.125, y: 0, session: 1 };

const STILLS = new Map([
  [4, { x: 0, y: 0, session: 1 }],
  [9, { x: -0.125, y: 0, session: 1 }],
]);

function stillPan(shot: number): { x: number; y: number; session: number } | null {
  return STILLS.get(shot) ?? null;
}

function box(x1: number, x2: number): ShelfBox {
  return { x1, y1: 400, x2, y2: 980, w: W, h: 1280, confidence: null };
}

function cut(id: number, at: ShelfBox, shot: number): ShelfOutline {
  return { id, frame: 0, box: at, anchor: { shot, box: at, points: null } };
}

function place(outline: ShelfOutline): ShelfBox {
  return boxNow(outline, NOW, stillPan);
}

test('a cut is placed where the camera has it now, from its own still', () => {
  assert.deepEqual(place(cut(1, box(100, 200), 4)), box(220, 320));
  assert.deepEqual(place(cut(1, box(100, 200), 9)), box(340, 440));
});

test('a cut stays at its own box across a reopened camera or an unknown still', () => {
  assert.deepEqual(boxNow(cut(1, box(100, 200), 4), { ...NOW, session: 2 }, stillPan), box(100, 200));
  assert.deepEqual(place(cut(1, box(100, 200), 7)), box(100, 200));
  assert.deepEqual(boxNow(cut(1, box(100, 200), 4), null, stillPan), box(100, 200));
});

test('t39: a cut is placed from where the camera pointed for its still, after the camera forgot the still', () => {
  const old: ShelfOutline = { id: 1, frame: 0, box: box(100, 200), anchor: { shot: 7, box: box(100, 200), points: null, pan: { x: -0.25, y: 0, session: 1 } } };
  assert.deepEqual(place(old), box(460, 560));
  assert.deepEqual(boxNow(old, { ...NOW, session: 2 }, stillPan), box(100, 200));
});

test('t34: an old cut gives the target the product under the drawn outline, not the one at its raw box', () => {
  const target = { ...cut(1, box(380, 520), 4), box: box(500, 640) };
  const masaad = cut(2, box(260, 400), 9);
  const guedila = cut(3, box(500, 640), 9);
  const decided = decideTarget(target, [masaad, guedila], null, [masaad, guedila].map(place));
  assert.equal(decided.outline, masaad);
  assert.equal(decided.recheck, false);
});

test('t34: a product keeps its track and read across cuts of stills taken at different pans', () => {
  const read: ShelfRead = { id: 'shelf-t1', brand_text: 'MASAAD', size_text: null, verdict: 'yes', spoken: 'Masaad' };
  const before = [{ track: 't1', outline: cut(1, box(380, 520), 4), read }];
  const next = reconcileTracks(before, [cut(2, box(260, 400), 9), cut(3, box(500, 640), 9)], () => 'new', place);
  const kept = next.find((entry) => entry.track === 't1');
  assert.equal(kept?.outline.id, 2);
  assert.equal(kept?.read, read);
});

test("t34: a pan move follows the target's own cut, never a neighbour moved over it, and keeps the recheck", () => {
  const target = cut(1, box(380, 520), 4);
  const own = { ...target, box: box(100, 240) };
  const neighbour = { ...cut(2, box(520, 660), 4), box: box(380, 520) };
  assert.deepEqual(followMoved(target, [neighbour, own], null, false), { outline: own, recheck: false });
  assert.deepEqual(followMoved(target, [neighbour], null, true), { outline: target, recheck: true });
});
