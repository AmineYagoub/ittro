// SAM and the reaching hand (t34, t38): cuts stop only for a hand near
// the guided product, within half its size, or one whose place is
// unknown. Outlines a hand touches are dropped from a cut, and a cut
// the hand touches all over is no cut.
import test from 'node:test';
import assert from 'node:assert/strict';
import { clearOfHand, handFreeCut, handNearTarget } from '../src/shelf/handClear';
import type { LoopDeps } from '../src/shelf/loopTypes';
import type { ShelfBox, ShelfOutline } from '../src/relay';

function box(x1: number, x2: number): ShelfBox {
  return { x1, y1: 412, x2, y2: 982, w: 960, h: 1280, confidence: null };
}

function outline(id: number, x1: number, x2: number): ShelfOutline {
  return { id, frame: 0, box: box(x1, x2) };
}

const TARGET = box(274, 446);

test("a hand within half the product's size is near, one further off is clear, an unknown one is near", () => {
  assert.equal(handNearTarget({ x1: 480, y1: 600, x2: 600, y2: 800 }, TARGET), true);
  assert.equal(handNearTarget({ x1: 560, y1: 600, x2: 700, y2: 800 }, TARGET), false);
  assert.equal(handNearTarget(null, TARGET), true);
  assert.equal(handNearTarget({ x1: 560, y1: 600, x2: 700, y2: 800 }, null), true);
});

test('t34: outlines a hand touches are dropped from a cut', () => {
  const cut = [outline(1, 163, 335), outline(2, 345, 520)];
  assert.deepEqual(
    clearOfHand(cut, { x1: 540, y1: 500, x2: 700, y2: 700 }).map((kept) => kept.id),
    [1],
  );
  assert.deepEqual(clearOfHand(cut, null), cut);
});

test('a cut the hand touches all over is no cut, and says so', () => {
  const logs: string[] = [];
  const deps = {
    log: (line: string) => {
      logs.push(line);
    },
  } as unknown as LoopDeps;
  assert.equal(handFreeCut(deps, [outline(2, 345, 520)], { x1: 400, y1: 500, x2: 600, y2: 700 }), null);
  assert.deepEqual(logs, ['shelf cut dropped 1 of 1 outlines under the hand']);
  assert.deepEqual(handFreeCut(deps, [], { x1: 400, y1: 500, x2: 600, y2: 700 }), []);
});
