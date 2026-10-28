// Walks the shelf pass loop with simulated time: outlines move
// between passes, finished reads are reused, and a stale pass never
// reaches the shopper. The clock and the cloud are both stubbed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createShelfLoop } from '../src/shelf/loop';
import type { LoopDeps, LoopPhoto, ShelfLoop } from '../src/shelf/loop';
import { ingestGrey } from '../src/shelf/tracker';
import type { GreyFrame } from '../src/shelf/tracker';
import type { ShelfBox, ShelfOutline, ShelfRead } from '../src/relay';
import type { SceneView } from '../src/relay';
import type { ConversationEvent } from '../src/conversation/types';

function box(x1: number, y1: number, x2: number, y2: number): ShelfBox {
  return { x1, y1, x2, y2, w: 112, h: 96, confidence: null };
}

function outline(id: number, pack: ShelfBox): ShelfOutline {
  return { id, frame: 0, box: pack };
}

function read(id: string, verdict: ShelfRead['verdict']): ShelfRead {
  return { id, brand_text: 'Taaounia', size_text: null, verdict, spoken: 'rice' };
}

function photo(): LoopPhoto {
  return { image: 'frame', mime: 'image/jpeg', grey: { data: new Uint8Array(0), w: 0, h: 0 } };
}

function paint(w: number, h: number, dx: number, dy: number): GreyFrame {
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const sx = x - dx;
      const sy = y - dy;
      data[y * w + x] = sx >= 0 && sy >= 0 && sx < w && sy < h ? (sx * 7 + sy * 13) % 251 : 0;
    }
  }
  return ingestGrey(data, w, h);
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function flush(rounds = 30): Promise<void> {
  for (let row = 0; row < rounds; row += 1) {
    await Promise.resolve();
  }
}

interface Script {
  outlines: ShelfOutline[][];
  reads: ShelfRead[][];
}

function harness(script: Script): {
  loop: ShelfLoop;
  sent: ConversationEvent[];
  calls: { outline: string[]; read: string[][]; phrase: number; classify: number };
  tick: (ms: number) => void;
} {
  let now = 0;
  const sent: ConversationEvent[] = [];
  const calls = { outline: [] as string[], read: [] as string[][], phrase: 0, classify: 0 };
  let outlined = 0;
  let batches = 0;
  const deps: LoopDeps = {
    now: () => now,
    outline: async (_image, _mime, phrase) => {
      calls.outline.push(phrase);
      const fresh = script.outlines[Math.min(outlined, script.outlines.length - 1)] ?? [];
      outlined += 1;
      return { outlines: fresh, samMs: 5 };
    },
    fetchPhrase: async () => {
      calls.phrase += 1;
      return 'rice bag';
    },
    read: async (_request, crops) => {
      calls.read.push(crops.map((crop) => crop.id));
      const batch = script.reads[Math.min(batches, script.reads.length - 1)] ?? [];
      batches += 1;
      return { reads: batch.filter((entry) => crops.some((crop) => crop.id === entry.id)), readMs: 7 };
    },
    classify: async () => {
      calls.classify += 1;
      const scene: SceneView = { scene: 'shelf', kinds: ['bags'], aisle_hint: null };
      return scene;
    },
    cutCrops: async (_image, tracks) => tracks.map((entry) => ({ id: `shelf-${entry.track}`, image: 'crop', mime: 'image/jpeg' })),
    readContext: () => ({ lang: 'en', alternative: null, checkedCount: 2 }),
    send: (event) => {
      sent.push(event);
    },
    log: () => undefined,
  };
  return {
    loop: createShelfLoop(deps),
    sent,
    calls,
    tick: (ms: number) => {
      now += ms;
    },
  };
}

const BAGS = [outline(0, box(8, 8, 40, 40)), outline(1, box(56, 8, 88, 40))];

test('outlines move between passes without a new SAM call', async () => {
  const rig = harness({ outlines: [BAGS], reads: [[read('shelf-t1', 'yes'), read('shelf-t2', 'no')]] });
  rig.loop.setTarget('rice', 1);
  await rig.loop.cloudPass([photo()]);
  assert.equal(rig.calls.outline.length, 1);
  rig.loop.trackFrame(paint(28, 24, 0, 0), 112);
  rig.loop.trackFrame(paint(28, 24, 3, 1), 112);
  const moved = rig.sent.filter((event) => event.type === 'OUTLINES_MOVED');
  assert.equal(moved.length, 1);
  const first = moved[0];
  assert.equal(first.type === 'OUTLINES_MOVED' && first.outlines[0]?.box.x1, 8 + 3 * 4);
  assert.equal(rig.calls.outline.length, 1);
});

test('finished reads are reused and only new tracks are read', async () => {
  const third = outline(2, box(8, 56, 40, 88));
  const rig = harness({
    outlines: [BAGS, [...BAGS, third]],
    reads: [[read('shelf-t1', 'yes'), read('shelf-t2', 'no')], [read('shelf-t3', 'no')]],
  });
  rig.loop.setTarget('rice', 1);
  await rig.loop.cloudPass([photo()]);
  await rig.loop.cloudPass([photo()]);
  assert.deepEqual(rig.calls.read, [
    ['shelf-t1', 'shelf-t2'],
    ['shelf-t3'],
  ]);
  assert.deepEqual(rig.loop.stats(), { samCalls: 2, readCalls: 2, readCrops: 3, classifyCalls: 0 });
});

test('an unsure read is tried again while yes and no stand', async () => {
  const rig = harness({
    outlines: [BAGS, BAGS],
    reads: [
      [read('shelf-t1', 'unsure'), read('shelf-t2', 'no')],
      [read('shelf-t1', 'yes')],
    ],
  });
  rig.loop.setTarget('rice', 1);
  await rig.loop.cloudPass([photo()]);
  await rig.loop.cloudPass([photo()]);
  assert.deepEqual(rig.calls.read, [
    ['shelf-t1', 'shelf-t2'],
    ['shelf-t1'],
  ]);
});

test('a stale pass after a new epoch never reaches the shopper', async () => {
  const gated = deferred<{ outlines: ShelfOutline[]; samMs: number }>();
  const sent: ConversationEvent[] = [];
  const deps: LoopDeps = {
    now: () => 0,
    outline: () => gated.promise,
    fetchPhrase: async () => 'bag',
    read: async () => ({ reads: [], readMs: 1 }),
    classify: async () => ({ scene: 'shelf', kinds: ['bags'], aisle_hint: null }),
    cutCrops: async () => [],
    readContext: () => ({ lang: 'en', alternative: null, checkedCount: 0 }),
    send: (event) => {
      sent.push(event);
    },
    log: () => undefined,
  };
  const loop = createShelfLoop(deps);
  loop.setTarget('rice', 1);
  const pass = loop.cloudPass([photo()]);
  await flush();
  loop.setTarget('rice', 2);
  gated.resolve({ outlines: BAGS, samMs: 5 });
  await pass;
  await flush();
  assert.deepEqual(sent, []);
});

test('the found line goes out with the priority batch, not the rest', async () => {
  const three = [...BAGS, outline(2, box(8, 56, 24, 72))];
  const first = deferred<{ reads: ShelfRead[]; readMs: number }>();
  const rest = deferred<{ reads: ShelfRead[]; readMs: number }>();
  const sent: ConversationEvent[] = [];
  let reads = 0;
  const loop = createShelfLoop({
    now: () => 0,
    outline: async () => ({ outlines: three, samMs: 5 }),
    fetchPhrase: async () => 'bag',
    read: async () => {
      reads += 1;
      return reads === 1 ? first.promise : rest.promise;
    },
    classify: async () => ({ scene: 'shelf', kinds: ['bags'], aisle_hint: null }),
    cutCrops: async (_image, tracks) => tracks.map((entry) => ({ id: `shelf-${entry.track}`, image: 'c', mime: 'image/jpeg' })),
    readContext: () => ({ lang: 'en', alternative: null, checkedCount: 3 }),
    send: (event) => {
      sent.push(event);
    },
    log: () => undefined,
  });
  loop.setTarget('rice', 1);
  const pass = loop.cloudPass([photo()]);
  await flush();
  first.resolve({ reads: [read('shelf-t1', 'yes'), read('shelf-t2', 'no')], readMs: 5 });
  await flush();
  assert.ok(sent.some((event) => event.type === 'SHELF_FOUND'));
  assert.equal(reads, 2);
  rest.resolve({ reads: [read('shelf-t3', 'no')], readMs: 5 });
  await pass;
});

test('the cloud runs first, on change, and on refresh, never twice', async () => {
  const rig = harness({ outlines: [BAGS], reads: [[read('shelf-t1', 'yes'), read('shelf-t2', 'no')]] });
  rig.loop.setTarget('rice', 1);
  assert.equal(rig.loop.cloudDue(), true);
  const pass = rig.loop.cloudPass([photo()]);
  assert.equal(rig.loop.cloudDue(), false);
  await pass;
  assert.equal(rig.loop.cloudDue(), false);
  rig.tick(16000);
  assert.equal(rig.loop.cloudDue(), true);
});

test('a changed scene asks for a fresh outline', async () => {
  const rig = harness({ outlines: [BAGS], reads: [[read('shelf-t1', 'yes'), read('shelf-t2', 'no')]] });
  rig.loop.setTarget('rice', 1);
  await rig.loop.cloudPass([photo()]);
  assert.equal(rig.loop.cloudDue(), false);
  const flat = new Uint8Array(28 * 24).fill(128);
  rig.loop.trackFrame(paint(28, 24, 0, 0), 112);
  rig.loop.trackFrame(ingestGrey(flat, 28, 24), 112);
  assert.equal(rig.loop.cloudDue(), true);
});

test('without tracks a frame moves nothing, and reset clears', async () => {
  const rig = harness({ outlines: [BAGS], reads: [[read('shelf-t1', 'yes'), read('shelf-t2', 'no')]] });
  rig.loop.setTarget('rice', 1);
  rig.loop.trackFrame(paint(28, 24, 0, 0), 112);
  rig.loop.trackFrame(paint(28, 24, 3, 1), 112);
  assert.equal(rig.sent.length, 0);
  await rig.loop.cloudPass([photo()]);
  rig.loop.reset();
  rig.loop.trackFrame(paint(28, 24, 6, 2), 112);
  assert.ok(rig.sent.every((event) => event.type !== 'OUTLINES_MOVED'));
  assert.equal(rig.loop.cloudDue(), false);
  rig.loop.setTarget('rice', 2);
  assert.equal(rig.loop.cloudDue(), true);
});

test('failures speak at most once every eight seconds', () => {
  const rig = harness({ outlines: [[]], reads: [[]] });
  rig.loop.setTarget('rice', 1);
  rig.loop.fail(new Error('net down'));
  rig.loop.fail(new Error('net down'));
  rig.tick(9000);
  rig.loop.fail(new Error('net down'));
  assert.equal(rig.sent.filter((event) => event.type === 'SEARCH_FAILED').length, 2);
});

test('a cloud pass without frames is a programmer error', async () => {
  const rig = harness({ outlines: [[]], reads: [[]] });
  rig.loop.setTarget('rice', 1);
  await assert.rejects(rig.loop.cloudPass([]), /at least one frame/);
});

test('the phrase is picked once and shortened on retry', async () => {
  const rig = harness({ outlines: [[], BAGS], reads: [[read('shelf-t1', 'yes'), read('shelf-t2', 'no')]] });
  rig.loop.setTarget('rice', 1);
  await rig.loop.cloudPass([photo()]);
  await rig.loop.cloudPass([photo()]);
  assert.deepEqual(rig.calls.outline, ['rice bag', 'bag', 'rice bag']);
  assert.equal(rig.calls.phrase, 1);
});
