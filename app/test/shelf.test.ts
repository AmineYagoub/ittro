// Walks the shelf core without a phone or Meta: grey frames copied
// on ingest, hand reads jumping the queue, outlines moving with a
// shift, and one shelf pass with stubbed cloud calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { boxOverlap, mapBox, mapPoints, moveOutlines } from '../src/shelf/outlines';
import { decodeBase64, ingestGrey, pickSharpest, sharpness } from '../src/shelf/tracker';
import type { GreyFrame } from '../src/shelf/tracker';
import { createReadQueue, dropEpoch, enqueueRead, nextRead, queueSize } from '../src/shelf/queue';
import { biggestFirst, needsRead, reconcileTracks } from '../src/shelf/shelfTracks';
import type { Tracked } from '../src/shelf/shelfTracks';
import { aisleFallback, findCloseMatch, outlineSignature, packageKind } from '../src/shelf/match';

function patternFrame(w: number, h: number, paint: (x: number, y: number) => number): GreyFrame {
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      data[y * w + x] = paint(x, y);
    }
  }
  return { data, w, h };
}

test('ingesting copies, so the reused buffer cannot corrupt the past', () => {
  const w = 16;
  const h = 16;
  const buffer = new Uint8Array(w * h).fill(200);
  const first = ingestGrey(buffer, w, h);
  buffer.fill(10);
  assert.equal(first.data[0], 200);
  const second = ingestGrey(buffer, w, h);
  assert.equal(second.data[0], 10);
  assert.throws(() => ingestGrey(buffer, w + 1, h), /smaller than its size/);
});

test('the sharpest frame wins the pick', () => {
  const blurred = patternFrame(12, 12, () => 100);
  const crisp = patternFrame(12, 12, (x, y) => ((x * 31 + y * 17) % 256 + 256) % 256);
  assert.ok(sharpness(crisp) > sharpness(blurred));
  assert.equal(pickSharpest([blurred, crisp]), 1);
  assert.equal(pickSharpest([crisp, blurred]), 0);
});

test('a hand read jumps ahead of every shelf read', () => {
  const queue = createReadQueue();
  enqueueRead(queue, { id: 'shelf-0', image: 'a', mime: 'image/jpeg', hand: false, epoch: 1 });
  enqueueRead(queue, { id: 'shelf-1', image: 'b', mime: 'image/jpeg', hand: false, epoch: 1 });
  enqueueRead(queue, { id: 'hand-0', image: 'c', mime: 'image/jpeg', hand: true, epoch: 1 });
  assert.equal(queueSize(queue), 3);
  assert.equal(nextRead(queue)?.id, 'hand-0');
  assert.equal(nextRead(queue)?.id, 'shelf-0');
  assert.equal(nextRead(queue)?.id, 'shelf-1');
  assert.equal(nextRead(queue), null);
});

test('dropping a search discards its queued reads', () => {
  const queue = createReadQueue();
  enqueueRead(queue, { id: 'shelf-0', image: 'a', mime: 'image/jpeg', hand: false, epoch: 1 });
  dropEpoch(queue, 2);
  assert.equal(queueSize(queue), 0);
});

test('outlines move with the pan and stay inside the frame', () => {
  const moved = moveOutlines(
    [{ id: 0, frame: 0, box: { x1: 10, y1: 10, x2: 95, y2: 40, w: 100, h: 100, confidence: null } }],
    { dx: 10, dy: -20, scale: 1 },
  );
  assert.deepEqual(moved[0]?.box, { x1: 20, y1: 0, x2: 100, y2: 20, w: 100, h: 100, confidence: null });
});

test('overlap is one for the same box and zero apart', () => {
  const box = { x1: 0, y1: 0, x2: 10, y2: 10, w: 20, h: 20, confidence: null };
  const far = { x1: 11, y1: 11, x2: 19, y2: 19, w: 20, h: 20, confidence: null };
  assert.equal(boxOverlap(box, box), 1);
  assert.equal(boxOverlap(box, far), 0);
});

test('boxes map onto the view with a cover fit', () => {
  const box = { x1: 0, y1: 0, x2: 100, y2: 100, w: 200, h: 400, confidence: null };
  assert.deepEqual(mapBox(box, 200, 400), { left: 0, top: 0, width: 100, height: 100 });
  const wide = mapBox(box, 400, 400);
  assert.deepEqual(wide, { left: 0, top: -200, width: 200, height: 200 });
});

test('base64 grey bytes decode without a library', () => {
  assert.deepEqual([...decodeBase64('AQID')], [1, 2, 3]);
  assert.deepEqual([...decodeBase64('AQIDBA==')], [1, 2, 3, 4]);
  assert.throws(() => decodeBase64('***'), /base64/);
});

test('a matching outline keeps its track and its reading', () => {
  const prev: Tracked[] = [
    { track: 't1', outline: { id: 0, frame: 0, box: { x1: 8, y1: 8, x2: 40, y2: 40, w: 112, h: 96, confidence: null } }, read: null },
  ];
  prev[0]!.read = { id: 'shelf-t1', brand_text: 'Taaounia', size_text: null, verdict: 'yes', spoken: 'rice' };
  const fresh = [{ id: 3, frame: 0, box: { x1: 10, y1: 9, x2: 42, y2: 41, w: 112, h: 96, confidence: null } }];
  let ids = 1;
  const next = reconcileTracks(prev, fresh, () => {
    ids += 1;
    return `t${ids}`;
  });
  assert.equal(next.length, 1);
  assert.equal(next[0]?.track, 't1');
  assert.equal(next[0]?.read?.verdict, 'yes');
  assert.equal(next[0]?.outline.box.x1, 10);
});

test('a new outline gets a new track and a vanished one drops', () => {
  const prev: Tracked[] = [
    { track: 't1', outline: { id: 0, frame: 0, box: { x1: 8, y1: 8, x2: 40, y2: 40, w: 112, h: 96, confidence: null } }, read: null },
  ];
  const fresh = [{ id: 0, frame: 0, box: { x1: 60, y1: 60, x2: 90, y2: 90, w: 112, h: 96, confidence: null } }];
  const next = reconcileTracks(prev, fresh, () => 't2');
  assert.equal(next.length, 1);
  assert.equal(next[0]?.track, 't2');
  assert.equal(next[0]?.read, null);
});

test('only new and unsure tracks need a read, biggest first', () => {
  const tracks: Tracked[] = [
    { track: 't1', outline: { id: 0, frame: 0, box: { x1: 0, y1: 0, x2: 8, y2: 8, w: 112, h: 96, confidence: null } }, read: { id: 'shelf-t1', brand_text: null, size_text: null, verdict: 'yes', spoken: '' } },
    { track: 't2', outline: { id: 1, frame: 0, box: { x1: 0, y1: 0, x2: 40, y2: 40, w: 112, h: 96, confidence: null } }, read: null },
    { track: 't3', outline: { id: 2, frame: 0, box: { x1: 0, y1: 0, x2: 20, y2: 20, w: 112, h: 96, confidence: null } }, read: { id: 'shelf-t3', brand_text: null, size_text: null, verdict: 'unsure', spoken: '' } },
  ];
  assert.deepEqual(
    biggestFirst(needsRead(tracks)).map((entry) => entry.track),
    ['t2', 't3'],
  );
});

test('a close match shares a real word, never just a size', () => {
  const reads = [
    { id: 'shelf-0', brand_text: 'Masaad', size_text: '0.5 litres', verdict: 'no' as const, spoken: 'Masaad 0.5 litres' },
    { id: 'shelf-1', brand_text: 'Guedila', size_text: '1.5 litres', verdict: 'no' as const, spoken: 'Guedila water' },
  ];
  assert.equal(findCloseMatch('Masaad 1.5 litres', reads), 'Masaad 0.5 litres');
  assert.equal(findCloseMatch('Elio oil', reads), null);
});

test('the package kind names the shelf aloud in every language', () => {
  assert.equal(packageKind('rice bag', 'en'), 'bags');
  assert.equal(packageKind('bottle', 'en'), 'bottles');
  assert.equal(packageKind('rice bag', 'ar'), 'منتجات');
  assert.equal(packageKind('rice bag', 'fr'), 'produits');
  assert.equal(aisleFallback('en'), 'the right aisle');
  assert.equal(aisleFallback('ar'), 'القسم المناسب');
  assert.equal(aisleFallback('fr'), 'le bon rayon');
});

test('masks move with the pan and stay inside the frame', () => {
  const moved = moveOutlines(
    [
      {
        id: 0,
        frame: 0,
        box: { x1: 10, y1: 10, x2: 50, y2: 40, w: 100, h: 100, confidence: null },
        mask: { points: [10, 10, 95, 10, 95, 40, 10, 40] },
      },
    ],
    { dx: 10, dy: -20, scale: 1 },
  );
  assert.deepEqual(moved[0]?.mask, { points: [20, 0, 100, 0, 100, 20, 20, 20] });
});

test('outlines without masks keep their shape when moved', () => {
  const moved = moveOutlines(
    [{ id: 0, frame: 0, box: { x1: 10, y1: 10, x2: 50, y2: 40, w: 100, h: 100, confidence: null } }],
    { dx: 5, dy: 5, scale: 1 },
  );
  assert.equal(moved[0]?.mask, undefined);
  assert.equal(moved[0]?.box.x1, 15);
});

test('mask points map onto the view with a cover fit', () => {
  assert.deepEqual(mapPoints([0, 0, 100, 100], 200, 400, 200, 400), [0, 0, 100, 100]);
  assert.deepEqual(mapPoints([0, 0, 200, 400], 200, 400, 400, 400), [0, -200, 400, 600]);
});

test('the outline signature ignores small jitters', () => {
  const box = { x1: 100, y1: 100, x2: 200, y2: 200, w: 400, h: 400, confidence: null };
  const boxJitter = { x1: 105, y1: 103, x2: 204, y2: 199, w: 400, h: 400, confidence: null };
  const boxMoved = { x1: 160, y1: 100, x2: 260, y2: 200, w: 400, h: 400, confidence: null };
  const one = [{ id: 0, frame: 0, box }];
  assert.equal(outlineSignature(one), outlineSignature([{ id: 0, frame: 0, box: boxJitter }]));
  assert.notEqual(outlineSignature(one), outlineSignature([{ id: 0, frame: 0, box: boxMoved }]));
});
