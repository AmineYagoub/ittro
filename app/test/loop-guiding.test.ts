// While the hand is being guided, the shelf loop keeps the outlines
// fresh but reads no more labels: the product is found, and every
// read would cost seconds and budget against the confirm.
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

function photo(): LoopPhoto {
  return { image: 'frame', mime: 'image/jpeg', w: 112, h: 96, grey: { data: new Uint8Array(0), w: 0, h: 0 } };
}

function rig(guiding: boolean, handCovering = false): { loop: ShelfLoop; sent: ConversationEvent[]; logs: string[]; reads: () => number } {
  const sent: ConversationEvent[] = [];
  const logs: string[] = [];
  let reads = 0;
  const outlines = [outline(1, box(0, 0, 10, 10)), outline(2, box(20, 0, 30, 10))];
  const deps: LoopDeps = {
    now: () => 0,
    outline: async () => ({ outlines, samMs: 5, maskMs: 1 }),
    fetchPhrase: async () => 'rice bag',
    read: async (_request, crops) => {
      reads += 1;
      const batch: ShelfRead[] = crops.map((crop) => ({ id: crop.id, brand_text: 'Taaounia', size_text: null, verdict: 'yes', spoken: 'rice' }));
      return { reads: batch, readMs: 7 };
    },
    classify: async () => ({ scene: 'shelf', kinds: ['bags'], aisle_hint: null }),
    cutCrops: async (_image, tracks) => tracks.map((entry) => ({ id: `shelf-${entry.track}`, image: 'crop', mime: 'image/jpeg' })),
    readContext: () => ({ lang: 'en', alternative: null, checkedCount: 2, guiding, handCovering }),
    send: (event) => {
      sent.push(event);
    },
    log: (line) => {
      logs.push(line);
    },
  };
  const loop = createShelfLoop(deps);
  loop.setTarget('rice', 1);
  return { loop, sent, logs, reads: () => reads };
}

test('a pass while guiding outlines but reads nothing', async () => {
  const rigged = rig(true);
  await rigged.loop.cloudPass([photo()]);
  assert.ok(rigged.sent.some((event) => event.type === 'SHELF_OUTLINED'));
  assert.equal(rigged.reads(), 0);
  assert.ok(rigged.sent.some((event) => event.type === 'LINK_OK'));
  assert.ok(rigged.logs.includes('shelf reads paused while guiding'));
});

test('a pass while searching still reads', async () => {
  const rigged = rig(false);
  await rigged.loop.cloudPass([photo()]);
  assert.ok(rigged.reads() >= 1);
});

test('a pass with the hand on the product holds without reading', async () => {
  const rigged = rig(true, true);
  await rigged.loop.cloudPass([photo()]);
  assert.ok(rigged.sent.some((event) => event.type === 'SHELF_OUTLINED'));
  assert.equal(rigged.reads(), 0);
  assert.ok(rigged.logs.includes('shelf target held under hand'));
});

function scriptedRig(): {
  loop: ShelfLoop;
  sent: ConversationEvent[];
  logs: string[];
  reads: () => number;
  setOutlines: (outlines: ShelfOutline[]) => void;
  setGuiding: (guiding: boolean, lost: boolean, recheck: boolean) => void;
} {
  const sent: ConversationEvent[] = [];
  const logs: string[] = [];
  let reads = 0;
  let outlines = [outline(1, box(0, 0, 10, 10)), outline(2, box(20, 0, 30, 10))];
  let guiding = false;
  let lost = false;
  let recheck = false;
  const deps: LoopDeps = {
    now: () => 0,
    outline: async () => ({ outlines, samMs: 5, maskMs: 1 }),
    fetchPhrase: async () => 'rice bag',
    read: async (_request, crops) => {
      reads += 1;
      const batch: ShelfRead[] = crops.map((crop, at) => ({
        id: crop.id,
        brand_text: at === 0 ? 'Other' : 'Taaounia',
        size_text: null,
        verdict: at === 0 ? 'no' : 'yes',
        spoken: at === 0 ? 'other' : 'rice',
      }));
      return { reads: batch, readMs: 7 };
    },
    classify: async () => ({ scene: 'shelf', kinds: ['bags'], aisle_hint: null }),
    cutCrops: async (_image, tracks) => tracks.map((entry) => ({ id: `shelf-${entry.track}`, image: 'crop', mime: 'image/jpeg' })),
    readContext: () => ({ lang: 'en', alternative: null, checkedCount: 2, guiding, guideLost: lost, guideRecheck: recheck }),
    send: (event) => {
      sent.push(event);
    },
    log: (line) => {
      logs.push(line);
    },
  };
  const loop = createShelfLoop(deps);
  loop.setTarget('rice', 1);
  return {
    loop,
    sent,
    logs,
    reads: () => reads,
    setOutlines: (next) => {
      outlines = next;
    },
    setGuiding: (next, nextLost, nextRecheck) => {
      guiding = next;
      lost = nextLost;
      recheck = nextRecheck;
    },
  };
}

function foundOutlines(sent: ConversationEvent[]): ShelfOutline[] {
  return sent.filter((event) => event.type === 'SHELF_FOUND').map((event) => (event as { outline: ShelfOutline }).outline);
}

test('a jumped target while guiding is re-read and re-found by its label', async () => {
  const rigged = scriptedRig();
  await rigged.loop.cloudPass([photo()]);
  assert.equal(foundOutlines(rigged.sent).length, 1);
  const before = rigged.reads();
  rigged.setGuiding(true, false, false);
  rigged.setOutlines([outline(3, box(60, 0, 70, 10)), outline(4, box(80, 0, 90, 10))]);
  await rigged.loop.cloudPass([photo()]);
  assert.ok(rigged.reads() > before);
  assert.ok(rigged.logs.includes('shelf target recheck, reading to confirm'));
  const found = foundOutlines(rigged.sent);
  assert.equal(found.length, 2);
  assert.equal((found[1] as ShelfOutline).box.x1, 80);
});

test('a lost target while guiding is re-read even from settled tracks', async () => {
  const rigged = scriptedRig();
  await rigged.loop.cloudPass([photo()]);
  assert.equal(foundOutlines(rigged.sent).length, 1);
  const before = rigged.reads();
  rigged.setGuiding(true, true, false);
  await rigged.loop.cloudPass([photo()]);
  assert.ok(rigged.reads() > before);
  assert.equal(foundOutlines(rigged.sent).length, 2);
});

test('a steady target while guiding reads nothing', async () => {
  const rigged = scriptedRig();
  await rigged.loop.cloudPass([photo()]);
  const before = rigged.reads();
  rigged.setGuiding(true, false, false);
  await rigged.loop.cloudPass([photo()]);
  assert.equal(rigged.reads(), before);
  assert.equal(foundOutlines(rigged.sent).length, 1);
});
