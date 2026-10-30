// Unsure tracks are re-read within seconds, not at the next
// refresh: a blurry first read gets another photo while the shopper
// steadies, and settled tracks cost nothing until the refresh.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createShelfLoop } from '../src/shelf/loop';
import type { LoopDeps, LoopPhoto, ShelfLoop } from '../src/shelf/loopTypes';
import type { ShelfBox, ShelfOutline, ShelfRead } from '../src/relay';
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
  return { image: 'frame', mime: 'image/jpeg', w: 112, h: 96, grey: { data: new Uint8Array(0), w: 0, h: 0 } };
}

function rig(outlines: ShelfOutline[], reads: ShelfRead[][]): {
  loop: ShelfLoop;
  sent: ConversationEvent[];
  tick: (ms: number) => void;
} {
  let now = 0;
  const sent: ConversationEvent[] = [];
  let batches = 0;
  const deps: LoopDeps = {
    now: () => now,
    outline: async () => ({ outlines, samMs: 5, maskMs: 1 }),
    fetchPhrase: async () => 'rice bag',
    read: async (_request, crops) => {
      const batch = reads[Math.min(batches, reads.length - 1)] ?? [];
      batches += 1;
      return { reads: batch.filter((entry) => crops.some((crop) => crop.id === entry.id)), readMs: 7 };
    },
    classify: async () => ({ scene: 'shelf', kinds: ['bags'], aisle_hint: null }),
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
    tick: (ms: number) => {
      now += ms;
    },
  };
}

test('unsure tracks are re-read without waiting for the refresh', async () => {
  const bags = [outline(1, box(0, 0, 10, 10)), outline(2, box(20, 0, 30, 10))];
  const rigged = rig(bags, [
    [read('shelf-t1', 'unsure'), read('shelf-t2', 'unsure')],
    [read('shelf-t1', 'yes'), read('shelf-t2', 'no')],
  ]);
  rigged.loop.setTarget('rice', 1);
  await rigged.loop.cloudPass([photo()]);
  assert.ok(!rigged.sent.some((event) => event.type === 'SHELF_FOUND'));
  rigged.tick(2500);
  assert.equal(rigged.loop.cloudDue(), true);
  await rigged.loop.cloudPass([photo()]);
  assert.ok(rigged.sent.some((event) => event.type === 'SHELF_FOUND'));
});

test('settled tracks wait for the refresh', async () => {
  const bags = [outline(1, box(0, 0, 10, 10)), outline(2, box(20, 0, 30, 10))];
  const rigged = rig(bags, [[read('shelf-t1', 'yes'), read('shelf-t2', 'no')]]);
  rigged.loop.setTarget('rice', 1);
  await rigged.loop.cloudPass([photo()]);
  rigged.tick(2500);
  assert.equal(rigged.loop.cloudDue(), false);
  rigged.tick(15000);
  assert.equal(rigged.loop.cloudDue(), true);
});
