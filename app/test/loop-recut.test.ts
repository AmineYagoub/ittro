// Once the phone has moved, the guided outline is cut again from a
// still taken since, at rest or still moving (t38: a cut each time the
// last one landed half a second ago). t31: the Guedila outline was
// placed from a 7 s-old still while the shelf drifted, and parallax
// under-read the pan that followed, so it ended half a bottle off. Not
// moved enough, a hand near the product, too soon after the last cut
// or no guide: no re-cut; a hand clear of the product leaves it. A
// still from before the camera reopened is cut again, moved or not
// (t32), and one whose picture grew or shrank by 6% since, the phone
// stepping closer or back (t39). SAM here cuts the
// same boxes as the find, the worst case: the cut still reaches the
// guide though it rounds to the old one, and the native outline gets
// the new still's key. A re-cut that sees a bottle the find never read
// starts no further pass while guiding, unless the target needs
// confirming. A re-cut with nothing where the outline is drawn reads,
// and the nearest yes takes the target (t33: the outline had slid onto
// the wall); one that lands on the drawn outline reads nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createShelfLoop } from '../src/shelf/loop';
import type { CameraPan, LoopDeps, LoopPhoto, ShelfLoop } from '../src/shelf/loopTypes';
import type { FoundShelf, ShelfBox, ShelfOutline } from '../src/relay';
import type { HandBox } from '../src/guide/types';
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
  view: { now: number; pan: CameraPan; guiding: boolean; hand: boolean; handBox: HandBox | null; third: boolean; lost: boolean; box: ShelfBox | null };
}

function rig(): Rig {
  const sent: ConversationEvent[] = [];
  const logs: string[] = [];
  const cut: string[] = [];
  let reads = 0;
  const view: Rig['view'] = { now: 0, pan: START, guiding: false, hand: false, handBox: null, third: false, lost: false, box: null };
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
    handBox: () => view.handBox,
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
    readContext: () => ({ lang: 'ar', alternative: null, checkedCount: 2, guiding: view.guiding, guideLost: view.lost, guideBox: view.box }),
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

test('t31: moved, the outline is cut again from a still taken after the move', async () => {
  const r = await foundAndGuided();
  assert.equal(dueAt(r, 3000, pan(0.075)), true);
  assert.ok(r.logs.includes("shelf recut, camera moved 0.116,0.000 since the outline's photo"));
  r.view.now = 3100;
  await r.loop.cloudPass([photo('find', 0, START, 4), photo('moved', 3000, pan(0.075), 5)]);
  assert.deepEqual(r.cut, ['moved']);
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

test('after a re-cut lands, the next one waits half a second and another move', async () => {
  const r = await foundAndGuided();
  assert.equal(dueAt(r, 3000, pan(0.075)), true);
  r.view.now = 3100;
  await r.loop.cloudPass([photo('moved', 3000, pan(0.075), 5)]);
  assert.equal(dueAt(r, 3500, pan(0.115)), false);
  assert.equal(dueAt(r, 4000, pan(0.075)), false);
  assert.equal(dueAt(r, 4500, pan(0.115)), true);
  assert.ok(r.logs.includes("shelf recut, camera moved 0.040,0.000 since the outline's photo"));
  assert.equal(r.logs.filter((line) => line.startsWith('shelf recut')).length, 2);
});

test('t38: not moved enough, no re-cut; still moving, a cut each time the last one landed', async () => {
  const small = await foundAndGuided();
  assert.equal(dueAt(small, 3000, pan(-0.015, -0.005)), false);
  const moving = await foundAndGuided();
  assert.equal(dueAt(moving, 3000, pan(0.04)), true);
  moving.view.now = 3100;
  await moving.loop.cloudPass([photo('first', 3000, pan(0.04), 5)]);
  assert.equal(dueAt(moving, 3400, pan(0.08)), false);
  assert.equal(dueAt(moving, 3700, pan(0.1)), true);
  moving.view.now = 3800;
  await moving.loop.cloudPass([photo('second', 3700, pan(0.1), 6)]);
  assert.deepEqual(moving.cut, ['first', 'second']);
});

test('t39: a picture grown or shrunk by stepping closer or back is cut again, a little growth is not', async () => {
  const near = await foundAndGuided();
  assert.equal(dueAt(near, 3000, { ...START, s: 1.04 }), false);
  assert.equal(dueAt(near, 3500, { ...START, s: 1.08 }), true);
  assert.ok(near.logs.includes("shelf recut, camera moved 0.003,0.002 and grew 1.08 times since the outline's photo"));
  const back = await foundAndGuided();
  assert.equal(dueAt(back, 3000, { ...START, s: 0.92 }), true);
});

test('t38: a hand near the product, too soon after the cut or no guide: no re-cut; a hand clear of it leaves it', async () => {
  const hand = await foundAndGuided();
  hand.view.hand = true;
  assert.equal(dueAt(hand, 3000, pan(0.075)), false);
  hand.view.box = box(274, 446);
  hand.view.handBox = { x1: 330, y1: 600, x2: 560, y2: 800 };
  assert.equal(dueAt(hand, 3500, pan(0.075)), false);
  hand.view.handBox = { x1: 750, y1: 900, x2: 950, y2: 1100 };
  assert.equal(dueAt(hand, 4000, pan(0.075)), true);
  const soon = await foundAndGuided();
  assert.equal(dueAt(soon, 300, pan(0.075)), false);
  assert.equal(dueAt(soon, 600, pan(0.075)), true);
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

test('t33: a re-cut with nothing where the outline is drawn reads, and the nearest yes takes the target', async () => {
  const r = await foundAndGuided();
  r.view.box = box(700, 860);
  dueAt(r, 3000, pan(0.075));
  assert.equal(dueAt(r, 3500, pan(0.075)), true);
  r.view.now = 3600;
  await r.loop.cloudPass([photo('rested', 3500, pan(0.075), 5)]);
  assert.ok(r.reads() > 0);
  assert.ok(r.logs.includes('shelf re-cut found nothing where the outline was, the yes at 345-520 takes it'));
  const found = r.sent.filter((event) => event.type === 'SHELF_FOUND') as Array<{ outline: ShelfOutline }>;
  assert.equal(found.length, 2);
  assert.equal(found[1]?.outline.box.x1, NEIGHBOUR.x1);
  assert.equal(found[1]?.outline.box.x2, NEIGHBOUR.x2);
});

test('a re-cut that lands on the drawn outline reads nothing', async () => {
  const r = await foundAndGuided();
  r.view.box = GUEDILA;
  dueAt(r, 3000, pan(0.075));
  assert.equal(dueAt(r, 3500, pan(0.075)), true);
  r.view.now = 3600;
  await r.loop.cloudPass([photo('rested', 3500, pan(0.075), 5)]);
  assert.equal(r.reads(), 0);
  assert.ok(!r.logs.some((line) => line.startsWith('shelf re-cut found nothing')));
});
