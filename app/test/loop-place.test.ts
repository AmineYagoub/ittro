// t34 on the shelf loop: a re-cut of a still taken before the phone
// turned on is placed where the camera has it now, lands on the drawn
// outline and reads nothing, and the guide gets each cut's place.
// While guiding no pass runs with a hand near the product or of
// unknown place, and a pass cuts only a still from the last 2.5 s with
// no hand near it: SAM had cut the hand in with the Guedila, and
// re-cut an 18 s old still of where the camera no longer pointed. A
// hand clear of the product leaves the cuts going, and the outline it
// touches is dropped (t38).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createShelfLoop } from '../src/shelf/loop';
import type { CameraPan, LoopDeps, LoopPhoto, ShelfLoop } from '../src/shelf/loopTypes';
import type { FoundShelf, ShelfBox, ShelfOutline } from '../src/relay';
import type { ConversationEvent } from '../src/conversation/types';
import type { HandBox } from '../src/guide/types';

const W = 960;

const START: CameraPan = { x: 0, y: 0, session: 1 };

function pan(x: number): CameraPan {
  return { x, y: 0, session: 1 };
}

function seen(x1: number, x2: number, from: CameraPan): ShelfBox {
  const dx = (from.x - START.x) * W;
  return { x1: x1 + dx, y1: 412, x2: x2 + dx, y2: 982, w: W, h: 1280, confidence: null };
}

interface Rig {
  loop: ShelfLoop;
  sent: ConversationEvent[];
  logs: string[];
  cut: string[];
  reads: () => number;
  view: { now: number; pan: CameraPan; guiding: boolean; hand: boolean; box: ShelfBox | null };
  still: (image: string, at: number, where: CameraPan, shot: number, hand?: boolean, handBox?: HandBox | null) => LoopPhoto;
}

function rig(): Rig {
  const sent: ConversationEvent[] = [];
  const logs: string[] = [];
  const cut: string[] = [];
  const shots = new Map<number, CameraPan>();
  const stills = new Map<string, CameraPan>();
  let reads = 0;
  const view: Rig['view'] = { now: 0, pan: START, guiding: false, hand: false, box: null };
  const found: FoundShelf = {
    outlines: [
      { id: 1, frame: 0, box: seen(163, 335, START), label: 'GUEDILA' },
      { id: 2, frame: 0, box: seen(345, 520, START), label: 'GUEDILA' },
    ],
    groundMs: 4402,
    samMs: 1149,
    maskMs: 0,
  };
  const deps: LoopDeps = {
    now: () => view.now,
    pan: () => view.pan,
    stillPan: (shot) => shots.get(shot) ?? null,
    handInView: () => view.hand,
    find: async () => found,
    fetchPhrase: async () => 'bottle',
    outline: async (image) => {
      cut.push(image);
      const from = stills.get(image) ?? START;
      return { outlines: [seen(163, 335, from), seen(345, 520, from)].map((at, i) => ({ id: i + 1, frame: 0, box: at })), samMs: 5, maskMs: 1 };
    },
    read: async (_request, crops) => {
      reads += 1;
      return { reads: crops.map((crop) => ({ id: crop.id, brand_text: 'GUEDILA', size_text: null, verdict: 'yes' as const, spoken: 'Guedila' })), readMs: 7 };
    },
    classify: async () => ({ scene: 'shelf', kinds: ['bottles'], aisle_hint: null }),
    cutCrops: async (_image, tracks) => tracks.map((entry) => ({ id: `shelf-${entry.track}`, image: 'crop', mime: 'image/jpeg' })),
    readContext: () => ({ lang: 'ar', alternative: null, checkedCount: 2, guiding: view.guiding, guideLost: false, guideBox: view.box }),
    send: (event) => {
      sent.push(event);
    },
    log: (line) => {
      logs.push(line);
    },
  };
  const loop = createShelfLoop(deps);
  loop.setTarget('قديلة', 1);
  const still = (image: string, at: number, where: CameraPan, shot: number, hand = false, handBox: HandBox | null = null): LoopPhoto => {
    shots.set(shot, where);
    stills.set(image, where);
    return { image, mime: 'image/jpeg', w: W, h: 1280, grey: { data: new Uint8Array(0), w: 0, h: 0 }, at, pan: where, shot, hand, handBox };
  };
  return { loop, sent, logs, cut, reads: () => reads, view, still };
}

async function guided(): Promise<{ r: Rig; target: ShelfOutline }> {
  const r = rig();
  await r.loop.cloudPass([r.still('find', 0, START, 4)]);
  const found = r.sent.find((event) => event.type === 'SHELF_FOUND') as { outline: ShelfOutline | null } | undefined;
  assert.ok(found?.outline);
  r.view.guiding = true;
  return { r, target: found.outline };
}

function dueAt(r: Rig, now: number, where: CameraPan): boolean {
  r.view.now = now;
  r.view.pan = where;
  return r.loop.cloudDue();
}

test('t34: a re-cut of a still taken before the phone turned on lands on the drawn outline and reads nothing', async () => {
  const { r, target } = await guided();
  dueAt(r, 3000, pan(0.125));
  assert.equal(dueAt(r, 3500, pan(0.125)), true);
  const turned = pan(0.25);
  const drawn = seen(target.box.x1, target.box.x2, turned);
  r.view.now = 4000;
  r.view.pan = turned;
  r.view.box = drawn;
  await r.loop.cloudPass([r.still('rested', 3500, pan(0.125), 5)]);
  assert.deepEqual(r.cut, ['rested']);
  assert.equal(r.reads(), 0);
  assert.ok(!r.logs.some((line) => line.startsWith('shelf re-cut found nothing')));
  const recut = r.sent.filter((event) => event.type === 'SHELF_OUTLINED').at(-1) as { now?: ShelfBox[] } | undefined;
  assert.ok(recut?.now?.some((at) => at.x1 === drawn.x1 && at.x2 === drawn.x2));
});

test('t34: while guiding no pass runs with a hand in view', async () => {
  const { r } = await guided();
  r.view.hand = true;
  assert.equal(dueAt(r, 16000, START), false);
  r.view.hand = false;
  assert.equal(dueAt(r, 16100, START), true);
});

test('t34: while guiding a pass cuts only a still from the last 2.5 s with no hand', async () => {
  const { r } = await guided();
  r.view.now = 20000;
  await r.loop.cloudPass([r.still('old', 2000, START, 5), r.still('reach', 19500, START, 6, true)]);
  assert.deepEqual(r.cut, []);
  assert.ok(r.logs.includes('shelf pass waits for a fresh still without a hand'));
  await r.loop.cloudPass([r.still('old', 2000, START, 5), r.still('reach', 19500, START, 6, true), r.still('clear', 19800, START, 7)]);
  assert.deepEqual(r.cut, ['clear']);
});

test('t38: with the hand clear of the product a pass cuts, and the outline the hand touches is dropped', async () => {
  const { r, target } = await guided();
  r.view.now = 20000;
  r.view.box = target.box;
  const touching = target.box.x1 < 300 ? { x1: 480, y1: 500, x2: 600, y2: 700 } : { x1: 60, y1: 500, x2: 200, y2: 700 };
  await r.loop.cloudPass([r.still('reach', 19800, START, 6, true, touching)]);
  assert.deepEqual(r.cut, ['reach']);
  assert.ok(r.logs.includes('shelf cut dropped 1 of 2 outlines under the hand'));
  const cut = r.sent.filter((event) => event.type === 'SHELF_OUTLINED').at(-1) as { outlines: ShelfOutline[] } | undefined;
  assert.equal(cut?.outlines.length, 1);
});
