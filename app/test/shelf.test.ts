// Walks the shelf core without a phone or Meta: exact pans written
// into one reused buffer, hand reads jumping the queue, outlines
// moving with the pan, and one shelf pass with stubbed cloud calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { boxOverlap, mapBox, moveOutlines } from '../src/shelf/outlines';
import { decodeBase64, estimatePan, ingestGrey, pickSharpest, sharpness, trackPan } from '../src/shelf/tracker';
import type { GreyFrame } from '../src/shelf/tracker';
import { createReadQueue, dropEpoch, enqueueRead, nextRead, queueSize } from '../src/shelf/queue';
import { runShelfPass } from '../src/shelf/runner';
import type { PassDeps } from '../src/shelf/runner';
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

function shiftedInto(buffer: Uint8Array, w: number, h: number, dx: number, dy: number): void {
  const paint = (x: number, y: number): number => (x * 7 + y * 13) % 251;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const sx = x - dx;
      const sy = y - dy;
      buffer[y * w + x] = sx >= 0 && sy >= 0 && sx < w && sy < h ? paint(sx, sy) : 0;
    }
  }
}

test('every synthetic pan in one reused buffer comes out exact', () => {
  const w = 28;
  const h = 24;
  const buffer = new Uint8Array(w * h);
  const pans: Array<[number, number]> = [
    [3, 1],
    [-2, 4],
    [5, -3],
    [0, 0],
  ];
  for (const [dx, dy] of pans) {
    shiftedInto(buffer, w, h, 0, 0);
    const before = ingestGrey(buffer, w, h);
    shiftedInto(buffer, w, h, dx, dy);
    const after = ingestGrey(buffer, w, h);
    const pan = estimatePan(before, after, 6);
    assert.equal(pan.dx, dx);
    assert.equal(pan.dy, dy);
    assert.equal(pan.changed, false);
  }
});

test('ingesting copies, so the reused buffer cannot corrupt the past', () => {
  const w = 16;
  const h = 16;
  const buffer = new Uint8Array(w * h).fill(200);
  const first = ingestGrey(buffer, w, h);
  buffer.fill(10);
  assert.equal(first.data[0], 200);
  const tracker = { previous: null as GreyFrame | null };
  assert.equal(trackPan(tracker, first, 4), null);
  buffer.fill(200);
  const same = ingestGrey(buffer, w, h);
  const pan = trackPan(tracker, same, 4);
  assert.equal(pan?.score, 0);
  assert.equal(pan?.changed, false);
});

test('a new scene reports changed instead of a pan', () => {
  const before = patternFrame(16, 16, (x, y) => (x + y) % 2 === 0 ? 240 : 16);
  const after = patternFrame(16, 16, () => 128);
  const pan = estimatePan(before, after, 4);
  assert.equal(pan.changed, true);
});

test('pan needs two frames of the same size', () => {
  const a = patternFrame(16, 16, () => 0);
  const b = patternFrame(12, 16, () => 0);
  assert.throws(() => estimatePan(a, b, 4), /same size/);
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

test('a shelf pass reads the hand before the shelf and logs timings', async () => {
  const calls: string[] = [];
  const logs: string[] = [];
  const deps: PassDeps = {
    outline: async () => ({
      outlines: [
        { id: 0, frame: 0, box: { x1: 0, y1: 0, x2: 4, y2: 4, w: 12, h: 12, confidence: null } },
        { id: 1, frame: 0, box: { x1: 6, y1: 6, x2: 10, y2: 10, w: 12, h: 12, confidence: null } },
      ],
      samMs: 1900,
    }),
    fetchPhrase: async () => {
      calls.push('phrase');
      return 'bag';
    },
    read: async (_request, crops) => {
      calls.push(`read:${crops.map((crop) => crop.id).join('+')}`);
      return {
        reads: crops.map((crop) => ({
          id: crop.id,
          brand_text: 'Taaounia',
          size_text: null,
          verdict: 'yes' as const,
          spoken: 'rice',
        })),
        readMs: 2100,
      };
    },
    cutCrops: async (_image, outlines) => outlines.map((outline) => ({ id: `shelf-${outline.id}`, image: 'crop', mime: 'image/jpeg' })),
    log: (line) => {
      logs.push(line);
    },
  };
  const crisp = patternFrame(12, 12, (x, y) => ((x * 31 + y * 17) % 256 + 256) % 256);
  const blurred = patternFrame(12, 12, () => 100);
  const pass = await runShelfPass(deps, {
    request: 'rice',
    frames: [
      { image: 'blurred', mime: 'image/jpeg', grey: blurred },
      { image: 'crisp', mime: 'image/jpeg', grey: crisp },
    ],
    hand: { id: 'hand-0', image: 'hand', mime: 'image/jpeg' },
    epoch: 1,
    phrases: new Map(),
  });
  assert.deepEqual(calls, ['phrase', 'read:hand-0', 'read:shelf-0+shelf-1']);
  assert.equal(pass.outlines.length, 2);
  assert.equal(pass.handRead?.id, 'hand-0');
  assert.equal(pass.shelfReads.length, 2);
  assert.equal(pass.timings.samMs, 1900);
  assert.match(logs.join('\n'), /sam 1900ms outlines 2 sharpness/);
});

test('an empty outline retries with the shorter phrase', async () => {
  const seen: string[] = [];
  const crisp = patternFrame(12, 12, (x, y) => ((x * 31 + y * 17) % 256 + 256) % 256);
  const box = { x1: 0, y1: 0, x2: 4, y2: 4, w: 12, h: 12, confidence: null };
  const deps: PassDeps = {
    outline: async (_image, _mime, phrase) => {
      seen.push(phrase);
      return phrase.includes(' ') ? { outlines: [], samMs: 5 } : { outlines: [{ id: 0, frame: 0, box }], samMs: 6 };
    },
    fetchPhrase: async () => 'rice bag',
    read: async (_request, crops) => ({
      reads: crops.map((crop) => ({ id: crop.id, brand_text: null, size_text: null, verdict: 'unsure' as const, spoken: '' })),
      readMs: 0,
    }),
    cutCrops: async (_image, outlines) => outlines.map((outline) => ({ id: `shelf-${outline.id}`, image: 'c', mime: 'image/jpeg' })),
    log: () => undefined,
  };
  const pass = await runShelfPass(deps, {
    request: 'rice',
    frames: [{ image: 'a', mime: 'image/jpeg', grey: crisp }],
    hand: null,
    epoch: 1,
    phrases: new Map(),
  });
  assert.deepEqual(seen, ['rice bag', 'bag']);
  assert.equal(pass.outlines.length, 1);
});

test('a shelf pass reuses the phrase it already picked', async () => {
  let phrases = 0;
  const crisp = patternFrame(12, 12, (x, y) => ((x * 31 + y * 17) % 256 + 256) % 256);
  const deps: PassDeps = {
    outline: async () => ({ outlines: [], samMs: 5 }),
    fetchPhrase: async () => {
      phrases += 1;
      return 'bag';
    },
    read: async () => ({ reads: [], readMs: 0 }),
    cutCrops: async () => [],
    log: () => undefined,
  };
  const input = {
    request: 'rice',
    frames: [{ image: 'a', mime: 'image/jpeg', grey: crisp }],
    hand: null,
    epoch: 1,
    phrases: new Map<string, string>(),
  };
  await runShelfPass(deps, input);
  await runShelfPass(deps, input);
  assert.equal(phrases, 1);
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

test('the outline signature ignores small jitters', () => {
  const box = { x1: 100, y1: 100, x2: 200, y2: 200, w: 400, h: 400, confidence: null };
  const boxJitter = { x1: 105, y1: 103, x2: 204, y2: 199, w: 400, h: 400, confidence: null };
  const boxMoved = { x1: 160, y1: 100, x2: 260, y2: 200, w: 400, h: 400, confidence: null };
  const one = [{ id: 0, frame: 0, box }];
  assert.equal(outlineSignature(one), outlineSignature([{ id: 0, frame: 0, box: boxJitter }]));
  assert.notEqual(outlineSignature(one), outlineSignature([{ id: 0, frame: 0, box: boxMoved }]));
});

test('a shelf pass needs at least one frame', async () => {
  const deps: PassDeps = {
    outline: async () => ({ outlines: [], samMs: 0 }),
    fetchPhrase: async () => 'bag',
    read: async () => ({ reads: [], readMs: 0 }),
    cutCrops: async () => [],
    log: () => undefined,
  };
  await assert.rejects(
    runShelfPass(deps, { request: 'rice', frames: [], hand: null, epoch: 1, phrases: new Map() }),
    /at least one frame/,
  );
});
