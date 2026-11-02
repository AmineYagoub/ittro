// Once the phone rests after a move, the guided outline is cut again
// from a still taken since. t31: the Guedila outline was placed from a
// 7 s-old still while the shelf drifted, and parallax under-read the
// pan that followed, so it ended half a bottle off. Not moved enough,
// still moving, a hand in view, too soon after the last cut or no
// guide: no re-cut. A still from before the camera reopened is cut
// again once the phone rests, moved or not (t32). SAM here cuts the
// same boxes as the find, the worst case: the cut still reaches the
// guide though it rounds to the old one, and the native outline gets
// the new still's key. A re-cut that sees a bottle the find never read
// starts no further pass while guiding, unless the target needs
// confirming.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createShelfLoop } from '../src/shelf/loop';
import type { CameraPan, LoopDeps, LoopPhoto, ShelfLoop } from '../src/shelf/loopTypes';
import type { FoundShelf, ShelfBox, ShelfOutline } from '../src/relay';
import type { ConversationEvent } from '../src/conversation/types';
import { decideTarget } from '../src/conversation/searchTarget';
import { cameraOutline } from '../src/shelf/outlines';

function box(x1: number, x2: number): ShelfBox {
  return { x1, y1: 412, x2, y2: 982, w: 960, h: 1280, confidence: null };
}

const GUEDILA = box(163, 335);
const NEIGHBOUR = box(345, 520);
const MASAAD = box(530, 700);
const START: CameraPan = { x: -0.041, y: -0.031, session: 1 };

function pan(x: number, y = START.y, session = 1): CameraPan {
  return { x, y, session };
}

function photo(image: string, at: number, where: CameraPan, shot: number): LoopPhoto {
  return { image, mime: 'image/jpeg', w: 960, h: 1280, grey: { data: new Uint8Array(0), w: 0, h: 0 }, at, pan: where, shot };
}

interface Rig {
  loop: ShelfLoop;
  sent: ConversationEvent[];
  logs: string[];
  cut: string[];
  reads: () => number;
  view: { now: number; pan: CameraPan; guiding: boolean; hand: boolean; third: boolean; lost: boolean };
}

function rig(): Rig {
  const sent: ConversationEvent[] = [];
  const logs: string[] = [];
  const cut: string[] = [];
  let reads = 0;
  const view = { now: 0, pan: START, guiding: false, hand: false, third: false, lost: false };
  const found: FoundShelf = {
    outlines: [
      { id: 1, frame: 0, box: GUEDILA, label: 'GUEDILA' },
      { id: 2, frame: 0, box: NEIGHBOUR, label: 'GUEDILA' },
    ],
    groundMs: 4402,
    samMs: 1149,
    maskMs: 0,
  };
  const deps: LoopDeps = {
    now: () => view.now,
    pan: () => view.pan,
    handInView: () => view.hand,
    find: async () => found,
    fetchPhrase: async () => 'bottle',
    outline: async (image) => {
      cut.push(image);
      const boxes = view.third ? [GUEDILA, NEIGHBOUR, MASAAD] : [GUEDILA, NEIGHBOUR];
      return { outlines: boxes.map((cutBox, at) => ({ id: at + 1, frame: 0, box: cutBox })), samMs: 5, maskMs: 1 };
    },
    read: async (_request, crops) => {
      reads += 1;
      return { reads: crops.map((crop) => ({ id: crop.id, brand_text: 'GUEDILA', size_text: null, verdict: 'yes' as const, spoken: 'Guedila' })), readMs: 7 };
    },
    classify: async () => ({ scene: 'shelf', kinds: ['bottles'], aisle_hint: null }),
    cutCrops: async (_image, tracks) => tracks.map((entry) => ({ id: `shelf-${entry.track}`, image: 'crop', mime: 'image/jpeg' })),
    readContext: () => ({ lang: 'ar', alternative: null, checkedCount: 2, guiding: view.guiding, guideLost: view.lost }),
    send: (event) => {
      sent.push(event);
    },
    log: (line) => {
      logs.push(line);
    },
  };
  const loop = createShelfLoop(deps);
  loop.setTarget('قديلة', 1);
  return { loop, sent, logs, cut, reads: () => reads, view };
}

async function foundAndGuided(): Promise<Rig> {
  const r = rig();
  await r.loop.cloudPass([photo('find', 0, START, 4)]);
  assert.ok(r.sent.some((event) => event.type === 'SHELF_FOUND'));
  r.view.guiding = true;
  return r;
}

function dueAt(r: Rig, now: number, where: CameraPan): boolean {
  r.view.now = now;
  r.view.pan = where;
  return r.loop.cloudDue();
}

function outlined(sent: ConversationEvent[]): ShelfOutline[][] {
  return sent.filter((event) => event.type === 'SHELF_OUTLINED').map((event) => (event as { outlines: ShelfOutline[] }).outlines);
}

test('t31: moved and at rest, the outline is cut again from a still taken after the move', async () => {
  const r = await foundAndGuided();
  assert.equal(dueAt(r, 3000, pan(0.075)), false);
  assert.equal(dueAt(r, 3500, pan(0.075)), true);
  assert.ok(r.logs.includes("shelf recut, camera moved 0.116,0.000 since the outline's photo"));
  r.view.now = 3600;
  await r.loop.cloudPass([photo('find', 0, START, 4), photo('rested', 3500, pan(0.075), 5)]);
  assert.deepEqual(r.cut, ['rested']);
  assert.equal(r.reads(), 0);
  assert.ok(r.logs.includes('shelf reads paused while guiding'));
  const cuts = outlined(r.sent);
  assert.equal(cuts.length, 2);
  assert.ok(cuts[1]?.every((outline) => outline.anchor?.shot === 5));
});

test('the cut reaches the guide, and the native outline gets the new still', async () => {
  const r = await foundAndGuided();
  const found = r.sent.find((event) => event.type === 'SHELF_FOUND') as { outline: ShelfOutline };
  dueAt(r, 3000, pan(0.075));
  assert.equal(dueAt(r, 3500, pan(0.075)), true);
  r.view.now = 3600;
  await r.loop.cloudPass([photo('rested', 3500, pan(0.075), 5)]);
  const [, recut] = outlined(r.sent);
  const adopted = decideTarget(found.outline, recut ?? [], null).outline;
  assert.equal(adopted?.anchor?.shot, 5);
  const before = cameraOutline(found.outline, 'قديلة')?.key ?? '';
  const after = cameraOutline(adopted, 'قديلة')?.key ?? '';
  assert.ok(before.startsWith('4:'));
  assert.ok(after.startsWith('5:'));
});

test('after a re-cut lands, the next one waits for another move', async () => {
  const r = await foundAndGuided();
  dueAt(r, 3000, pan(0.075));
  assert.equal(dueAt(r, 3500, pan(0.075)), true);
  r.view.now = 3600;
  await r.loop.cloudPass([photo('rested', 3500, pan(0.075), 5)]);
  assert.equal(dueAt(r, 6500, pan(0.075)), false);
  assert.equal(dueAt(r, 7000, pan(0.075)), false);
  assert.equal(dueAt(r, 7500, pan(0.115)), false);
  assert.equal(dueAt(r, 8000, pan(0.115)), true);
  assert.ok(r.logs.includes("shelf recut, camera moved 0.040,0.000 since the outline's photo"));
  assert.equal(r.logs.filter((line) => line.startsWith('shelf recut')).length, 2);
});

test('not moved enough or still moving: no re-cut until the phone rests', async () => {
  const small = await foundAndGuided();
  dueAt(small, 3000, pan(-0.015, -0.005));
  assert.equal(dueAt(small, 3500, pan(-0.015, -0.005)), false);
  const moving = await foundAndGuided();
  dueAt(moving, 3000, pan(0.04));
  assert.equal(dueAt(moving, 3500, pan(0.06)), false);
  assert.equal(dueAt(moving, 4000, pan(0.075)), false);
  assert.equal(dueAt(moving, 4500, pan(0.077)), true);
});

test('a hand in view, too soon after the cut or no guide: no re-cut', async () => {
  const hand = await foundAndGuided();
  hand.view.hand = true;
  dueAt(hand, 3000, pan(0.075));
  assert.equal(dueAt(hand, 3500, pan(0.075)), false);
  hand.view.hand = false;
  assert.equal(dueAt(hand, 4000, pan(0.075)), true);
  const soon = await foundAndGuided();
  dueAt(soon, 1500, pan(0.075));
  assert.equal(dueAt(soon, 2000, pan(0.075)), false);
  assert.equal(dueAt(soon, 2500, pan(0.075)), true);
  const unguided = rig();
  await unguided.loop.cloudPass([photo('find', 0, START, 4)]);
  dueAt(unguided, 3000, pan(0.075));
  assert.equal(dueAt(unguided, 3500, pan(0.075)), false);
  assert.ok(!unguided.logs.some((line) => line.startsWith('shelf recut')));
});

test('while guiding, a bottle the find never read starts no pass until the target needs confirming', async () => {
  const r = await foundAndGuided();
  r.view.third = true;
  dueAt(r, 3000, pan(0.075));
  assert.equal(dueAt(r, 3500, pan(0.075)), true);
  r.view.now = 3600;
  await r.loop.cloudPass([photo('rested', 3500, pan(0.075), 5)]);
  assert.equal(r.reads(), 0);
  assert.equal(dueAt(r, 5000, pan(0.075)), false);
  assert.equal(dueAt(r, 5500, pan(0.075)), false);
  r.view.lost = true;
  assert.equal(dueAt(r, 6000, pan(0.075)), true);
});

test('t32: a still from before the camera reopened is cut again once the phone rests, moved or not', async () => {
  const r = await foundAndGuided();
  dueAt(r, 3000, pan(START.x, START.y, 2));
  assert.equal(dueAt(r, 3500, pan(START.x, START.y, 2)), true);
  assert.ok(r.logs.includes("shelf recut, the camera reopened since the outline's photo"));
  r.view.now = 3600;
  await r.loop.cloudPass([photo('reopened', 3500, pan(START.x, START.y, 2), 1)]);
  assert.deepEqual(r.cut, ['reopened']);
  assert.equal(dueAt(r, 6500, pan(START.x, START.y, 2)), false);
  assert.equal(dueAt(r, 7000, pan(START.x, START.y, 2)), false);
});
