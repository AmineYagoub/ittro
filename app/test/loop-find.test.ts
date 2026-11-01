// The grounding find on a fresh shelf: one /find call outlines the
// requested product and the found line follows without a phrase, a
// SAM call or a crop read. Nothing in view goes on the phrase path;
// guiding and the hand check never use the find.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createShelfLoop } from '../src/shelf/loop';
import type { LoopContext, LoopDeps, LoopPhoto } from '../src/shelf/loopTypes';
import type { FoundShelf, ShelfBox, ShelfOutline } from '../src/relay';
import type { ConversationEvent } from '../src/conversation/types';

function box(x1: number, x2: number): ShelfBox {
  return { x1, y1: 10, x2, y2: 90, w: 112, h: 96, confidence: 0.98 };
}

function photo(): LoopPhoto {
  return { image: 'frame', mime: 'image/jpeg', w: 112, h: 96, grey: { data: new Uint8Array(0), w: 0, h: 0 }, shot: 7 };
}

const BAG: ShelfOutline = { id: 0, frame: 0, box: box(10, 50) };

function rig(found: FoundShelf[], context: Partial<LoopContext> = {}) {
  const sent: ConversationEvent[] = [];
  const calls = { find: 0, phrase: 0, outline: 0, read: 0, crops: 0 };
  let finds = 0;
  const deps: LoopDeps = {
    now: () => 1000,
    find: async () => {
      calls.find += 1;
      const answer = found[Math.min(finds, found.length - 1)] as FoundShelf;
      finds += 1;
      return answer;
    },
    fetchPhrase: async () => {
      calls.phrase += 1;
      return 'rice bag';
    },
    outline: async () => {
      calls.outline += 1;
      return { outlines: [BAG], samMs: 5, maskMs: 1 };
    },
    read: async (_request, crops) => {
      calls.read += 1;
      return { reads: crops.map((crop) => ({ id: crop.id, brand_text: 'Taaounia', size_text: 'Riz blanc', verdict: 'no' as const, spoken: 'Riz blanc' })), readMs: 7 };
    },
    classify: async () => ({ scene: 'shelf', kinds: ['bags'], aisle_hint: null }),
    cutCrops: async (_image, tracks) => {
      calls.crops += tracks.length;
      return tracks.map((entry) => ({ id: `shelf-${entry.track}`, image: 'crop', mime: 'image/jpeg' }));
    },
    readContext: () => ({ lang: 'en', alternative: null, checkedCount: 0, ...context }),
    send: (event) => {
      sent.push(event);
    },
    log: () => undefined,
  };
  return { loop: createShelfLoop(deps), sent, calls };
}

const TWO: FoundShelf = {
  outlines: [
    { id: 1, frame: 0, box: box(10, 40), label: 'Riz Basmati' },
    { id: 2, frame: 0, box: box(50, 100), label: 'Riz Basmati' },
  ],
  groundMs: 2100,
  samMs: 700,
  maskMs: 3,
};

test('a fresh shelf is found by one /find call, nothing else asked', async () => {
  const { loop, sent, calls } = rig([TWO]);
  loop.setTarget('basmati', 1);
  await loop.cloudPass([photo()]);
  assert.deepEqual(calls, { find: 1, phrase: 0, outline: 0, read: 0, crops: 1 });
  assert.deepEqual(sent.map((event) => event.type), ['SHELF_FOUND', 'SHELF_OUTLINED', 'LINK_OK']);
  const found = sent[0];
  assert.ok(found?.type === 'SHELF_FOUND');
  assert.equal(found.outline?.box.x1, 50);
  assert.equal(found.matches, 2);
  assert.equal(found.crop, 'data:image/jpeg;base64,crop');
  assert.equal(found.outline?.anchor?.shot, 7);
  assert.equal(loop.stats().findCalls, 1);
  assert.equal(loop.cloudDue(), false);
});

test('nothing in view: the same pass goes on the phrase path', async () => {
  const { loop, sent, calls } = rig([{ outlines: [], groundMs: 2000, samMs: 0, maskMs: 0 }]);
  loop.setTarget('basmati', 1);
  await loop.cloudPass([photo()]);
  assert.deepEqual(calls, { find: 1, phrase: 1, outline: 1, read: 1, crops: 1 });
  assert.ok(!sent.some((event) => event.type === 'SHELF_FOUND'));
});

test('while guiding, passes keep the phrase path and its rechecks', async () => {
  const { loop, calls } = rig([TWO], { guiding: true });
  loop.setTarget('basmati', 1);
  await loop.cloudPass([photo()]);
  assert.equal(calls.find, 0);
  assert.equal(calls.outline, 1);
});

test('a pass with a hand crop keeps the phrase path', async () => {
  const { loop, calls } = rig([TWO]);
  loop.setTarget('basmati', 1);
  await loop.cloudPass([photo()], { id: 'hand', image: 'hand', mime: 'image/jpeg' });
  assert.equal(calls.find, 0);
});

test('a find that lands after the request changed says nothing', async () => {
  const { loop, sent } = rig([TWO]);
  loop.setTarget('basmati', 1);
  const pass = loop.cloudPass([photo()]);
  loop.setTarget('honey', 2);
  await pass;
  assert.deepEqual(sent, []);
});

test('the find takes a frame too soft for crop reads (t20: 724 read GUEDILA)', async () => {
  const { sharpness } = await import('../src/shelf/tracker');
  // A checker whose contrast lands between the find's bar and the reads'.
  let grey = { data: new Uint8Array(64), w: 8, h: 8 };
  for (let amp = 1; amp < 40 && sharpness(grey) === 0; amp += 1) {
    for (let cols = 2; cols <= 8; cols += 1) {
      const data = new Uint8Array(64).map((_, at) => (at % 8 < cols && ((at % 8) + Math.floor(at / 8)) % 2 === 0 ? 128 + amp : 128));
      const score = sharpness({ data, w: 8, h: 8 });
      if (score > 620 && score < 790) {
        grey = { data, w: 8, h: 8 };
        break;
      }
    }
  }
  assert.ok(sharpness(grey) > 600 && sharpness(grey) < 800);
  const soft = { ...photo(), grey };
  const { loop, calls } = rig([TWO]);
  loop.setTarget('basmati', 1);
  await loop.cloudPass([soft]);
  assert.equal(calls.find, 1);
  const guided = rig([TWO], { guiding: true });
  guided.loop.setTarget('basmati', 1);
  await guided.loop.cloudPass([soft]);
  assert.equal(guided.calls.outline, 0);
});

test('the shelf inventory keeps what finds and reads named, with the camera pan', async () => {
  const { forgetSeen, seenProducts } = await import('../src/shelf/inventory');
  forgetSeen();
  const found = rig([TWO]);
  found.loop.setTarget('basmati', 1);
  await found.loop.cloudPass([photo()]);
  const empty = rig([{ outlines: [], groundMs: 2000, samMs: 0, maskMs: 0 }]);
  empty.loop.setTarget('basmati', 1);
  await empty.loop.cloudPass([photo()]);
  const seen = seenProducts(1000, 60000);
  assert.deepEqual(
    seen.map((entry) => [entry.name, entry.count]),
    [
      ['Riz Basmati', 2],
      ['Riz blanc', 1],
    ],
  );
  forgetSeen();
});
