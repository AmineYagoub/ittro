// The next request reads the last request's crops at once when the
// camera has barely moved: t13's Guedila request waited 3.6 s for a
// new photo and SAM on a shelf outlined seconds before. A camera that
// moved, an old carry, or the same request start from a photo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createShelfLoop } from '../src/shelf/loop';
import type { LoopDeps, LoopPhoto, ShelfCarry, ShelfLoop } from '../src/shelf/loopTypes';
import type { ShelfBox, ShelfOutline, ShelfRead } from '../src/relay';
import type { ConversationEvent } from '../src/conversation/types';

function box(x1: number, y1: number, x2: number, y2: number): ShelfBox {
  return { x1, y1, x2, y2, w: 960, h: 1280, confidence: null };
}

const MASAAD = box(333, 54, 544, 1279);
const GUEDILA = box(554, 5, 760, 1279);

function photo(): LoopPhoto {
  return { image: 'frame', mime: 'image/jpeg', w: 960, h: 1280, grey: { data: new Uint8Array(0), w: 0, h: 0 } };
}

interface Rig {
  loop: ShelfLoop;
  sent: ConversationEvent[];
  logs: string[];
  sam: () => number;
  clock: { now: number };
}

function rig(clock = { now: 0 }): Rig {
  const sent: ConversationEvent[] = [];
  const logs: string[] = [];
  let sam = 0;
  const deps: LoopDeps = {
    now: () => clock.now,
    outline: async () => {
      sam += 1;
      return { outlines: [MASAAD, GUEDILA].map((pack, at) => ({ id: at + 1, frame: 0, box: pack })), samMs: 5, maskMs: 1 };
    },
    fetchPhrase: async () => 'bottle',
    // Each crop carries its box's left edge, so a read knows which bottle it is.
    read: async (request, crops) => ({
      reads: crops.map((crop): ShelfRead => {
        const guedila = crop.image === `crop-${GUEDILA.x1}`;
        const wantsGuedila = request.includes('Guedila');
        return { id: crop.id, brand_text: guedila ? 'GUEDILA' : 'Masaad', size_text: null, verdict: guedila === wantsGuedila ? 'yes' : 'no', spoken: '' };
      }),
      readMs: 7,
    }),
    classify: async () => ({ scene: 'shelf', kinds: ['bottles'], aisle_hint: null }),
    cutCrops: async (_image, tracks) => tracks.map((entry) => ({ id: `shelf-${entry.track}`, image: `crop-${entry.outline.box.x1}`, mime: 'image/jpeg' })),
    readContext: () => ({ lang: 'en', alternative: null, checkedCount: 2 }),
    send: (event) => {
      sent.push(event);
    },
    log: (line) => {
      logs.push(line);
    },
  };
  return { loop: createShelfLoop(deps), sent, logs, sam: () => sam, clock };
}

function found(sent: ConversationEvent[]): ShelfOutline[] {
  return sent.filter((event) => event.type === 'SHELF_FOUND').map((event) => (event as { outline: ShelfOutline }).outline);
}

async function masaadCarry(clock: { now: number }): Promise<ShelfCarry> {
  const first = rig(clock);
  first.loop.setTarget('Masaad water', 1);
  await first.loop.cloudPass([photo()]);
  assert.equal(found(first.sent)[0]?.box.x1, MASAAD.x1);
  const carry = first.loop.carry({ x: 0.1, y: 0.2 });
  assert.ok(carry);
  return carry as ShelfCarry;
}

test('t13: the next request is found from the carried crops, with no photo and no SAM', async () => {
  const clock = { now: 0 };
  const carry = await masaadCarry(clock);
  clock.now = 21000;
  const next = rig(clock);
  next.loop.setTarget('Guedila water', 2);
  assert.equal(next.loop.seed(carry, { x: 0.11, y: 0.2 }), true);
  assert.equal(await next.loop.carriedPass(), true);
  assert.equal(next.sam(), 0);
  const [guedila] = found(next.sent);
  // Moved with the camera: 0.01 of 960 px.
  assert.equal(guedila?.box.x1, GUEDILA.x1 + 10);
  assert.equal(guedila?.anchor, undefined);
  assert.ok(next.logs.some((line) => line.startsWith('shelf read carried')));
});

test('a camera that moved, an old carry or the same request start from a photo', async () => {
  const clock = { now: 0 };
  const carry = await masaadCarry(clock);
  const moved = rig(clock);
  moved.loop.setTarget('Guedila water', 2);
  assert.equal(moved.loop.seed(carry, { x: 0.2, y: 0.2 }), false);
  assert.equal(await moved.loop.carriedPass(), false);
  const same = rig(clock);
  same.loop.setTarget('Masaad water', 2);
  assert.equal(same.loop.seed(carry, { x: 0.1, y: 0.2 }), false);
  clock.now = 31000;
  const old = rig(clock);
  old.loop.setTarget('Guedila water', 2);
  assert.equal(old.loop.seed(carry, { x: 0.1, y: 0.2 }), false);
  clock.now = 1000;
  const reopened = rig(clock);
  reopened.loop.setTarget('Guedila water', 2);
  assert.equal(reopened.loop.seed(carry, { x: 0.1, y: 0.2, session: 2 }), false);
});

test('no camera motion known, no carry', async () => {
  const clock = { now: 0 };
  const first = rig(clock);
  first.loop.setTarget('Masaad water', 1);
  await first.loop.cloudPass([photo()]);
  assert.equal(first.loop.carry(null), null);
});
