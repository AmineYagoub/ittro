// What the sweep claims, and when it runs, from the 1 November review:
// an empty pass while the hand is guided starts no sweep and asks no
// scene, a camera that never turns ends the sweep without "I checked
// the whole shelf", the spoken count names each product once, and a
// new search's summary is never told what an earlier shelf held.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createShelfLoop } from '../src/shelf/loop';
import type { CameraPan, LoopContext, LoopDeps, LoopPhoto, ShelfLoop } from '../src/shelf/loopTypes';
import type { SceneView, ShelfOutline } from '../src/relay';
import type { ConversationEvent } from '../src/conversation/types';
import type { ViewReply } from '../src/conversation/askTypes';
import { forgetSeen, seenProducts } from '../src/shelf/inventory';

const W = 112;
const H = 96;

function photo(): LoopPhoto {
  return { image: 'frame', mime: 'image/jpeg', w: W, h: H, grey: { data: new Uint8Array(0), w: 0, h: 0 }, shot: 7 };
}

function bag(id: number, x1: number, x2: number): ShelfOutline {
  return { id, frame: 0, box: { x1, y1: 10, x2, y2: 90, w: W, h: H, confidence: 0.9 } };
}

interface Rig {
  clock: { now: number };
  view: { pan: CameraPan | null };
  outlines: { now: (pan: CameraPan | null) => ShelfOutline[] };
  sent: ConversationEvent[];
  scenes: { asked: number };
  asked: string[][];
  reply: { now: ViewReply | Error };
  loop: ShelfLoop;
}

function rig(pan: CameraPan | null, context: Partial<LoopContext> = {}): Rig {
  const outlines: Rig['outlines'] = { now: () => [bag(0, 40, 70)] };
  const r = {
    clock: { now: 1000 },
    view: { pan },
    outlines,
    sent: [] as ConversationEvent[],
    scenes: { asked: 0 },
    asked: [] as string[][],
    reply: { now: { answer: 'No basmati on this shelf.', offer: null, unreadable: [] } as ViewReply | Error },
  };
  const scene: SceneView = { scene: 'shelf', kinds: ['bags'], aisle_hint: null, shelf_label: 'Rice', fits_request: true };
  const deps: LoopDeps = {
    now: () => r.clock.now,
    pan: () => r.view.pan,
    fetchPhrase: async () => 'rice bag',
    outline: async () => ({ outlines: r.outlines.now(r.view.pan), samMs: 5, maskMs: 1 }),
    read: async (_request, crops) => ({
      reads: crops.map((crop) => ({ id: crop.id, brand_text: crop.image, size_text: null, verdict: 'no' as const, spoken: crop.image })),
      readMs: 7,
    }),
    classify: async () => {
      r.scenes.asked += 1;
      return scene;
    },
    cutCrops: async (_image, tracks) => tracks.map((entry) => ({ id: `shelf-${entry.track}`, image: `P${entry.outline.id}`, mime: 'image/jpeg' })),
    readContext: () => ({ lang: 'en', alternative: null, checkedCount: 3, ...context }),
    notHere: async (_wanted, _image, _mime, seen) => {
      r.asked.push(seen);
      if (r.reply.now instanceof Error) {
        throw r.reply.now;
      }
      return r.reply.now;
    },
    send: (event) => {
      r.sent.push(event);
    },
    log: () => undefined,
  };
  return { ...r, loop: createShelfLoop(deps) };
}

function cues(sent: ConversationEvent[]): string[] {
  return sent.flatMap((event) => (event.type === 'SWEEP_CUE' ? [event.cue] : []));
}

/** Half-second ticks as the phone's timer runs them, with a pass whenever one is due. */
async function runFor(r: Rig, ticks: number): Promise<void> {
  for (let tick = 0; tick < ticks; tick += 1) {
    r.clock.now += 500;
    r.loop.sweepTick();
    if (r.loop.cloudDue()) {
      await r.loop.cloudPass([photo()]);
    }
  }
}

async function turnTo(r: Rig, x: number, y = 0): Promise<void> {
  const pan = r.view.pan ?? { x: 0, y: 0, session: 1 };
  const from = { x: -pan.x, y: -pan.y };
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x - from.x), Math.abs(y - from.y)) / 0.2));
  let at = from;
  for (let n = 1; n <= steps; n += 1) {
    const next = { x: from.x + ((x - from.x) * n) / steps, y: from.y + ((y - from.y) * n) / steps };
    r.clock.now += 500;
    r.view.pan = { x: -next.x, y: -next.y, session: 1 };
    r.loop.trackShift(-(next.x - at.x) * W, -(next.y - at.y) * H, false, 1);
    at = next;
    r.loop.sweepTick();
  }
}

test('an empty pass while the hand is guided starts no sweep and asks no scene, and passes keep running', async () => {
  const r = rig({ x: 0, y: 0, session: 1 }, { guiding: true, guideLost: true });
  r.outlines.now = () => [];
  r.loop.setTarget('basmati', 1);
  await r.loop.cloudPass([photo()]);
  assert.deepEqual(cues(r.sent), []);
  assert.equal(r.scenes.asked, 0);
  r.clock.now += 20000;
  assert.equal(r.loop.cloudDue(), true);
});

test('a camera that never turns ends the sweep in under 40 s, never hearing "I checked the whole shelf"', async () => {
  forgetSeen();
  const r = rig({ x: 0, y: 0, session: 1 });
  r.loop.setTarget('basmati', 1);
  await r.loop.cloudPass([photo()]);
  await runFor(r, 80);
  const notHere = r.sent.filter((event) => event.type === 'NOT_HERE');
  assert.equal(notHere.length, 1);
  assert.ok(notHere[0]?.type === 'NOT_HERE' && !notHere[0].whole);
  assert.deepEqual(cues(r.sent), ['start', 'right', 'stop', 'right', 'right', 'stop']);
});

test('the spoken count names each product once, from the starting spot on', async () => {
  forgetSeen();
  const r = rig({ x: 0, y: 0, session: 1 });
  const shelf = Array.from({ length: 12 }, (_, k) => -2.0 + 0.3 * k);
  r.outlines.now = (pan) => {
    const o = -(pan?.x ?? 0);
    if (-(pan?.y ?? 0) > 0.25) {
      return [];
    }
    return shelf.flatMap((p, k) => (Math.abs(p - o) <= 0.4001 ? [bag(k, Math.round((p - 0.1 - (o - 0.5)) * W), Math.round((p + 0.1 - (o - 0.5)) * W))] : []));
  };
  r.reply.now = new Error('relay down');
  r.loop.setTarget('basmati', 1);
  await r.loop.cloudPass([photo()]);
  for (const [x, y] of [
    [0.6, 0],
    [1.2, 0],
    [-0.6, 0],
    [-1.2, 0],
    [-1.2, 0.5],
  ] as Array<[number, number]>) {
    await turnTo(r, x, y);
    r.clock.now += 1500;
    await r.loop.cloudPass([photo()]);
  }
  assert.deepEqual(cues(r.sent), ['start', 'stop', 'right', 'stop', 'left', 'stop', 'left', 'stop', 'down', 'stop']);
  const swept = r.sent.find((event) => event.type === 'SHELF_SWEPT');
  assert.ok(swept?.type === 'SHELF_SWEPT');
  assert.equal(swept.checked, seenProducts(r.clock.now, 600000).length);
  assert.equal(swept.checked, 10);
});

test('a new search is never told what an earlier search read', async () => {
  forgetSeen();
  const honey = rig(null);
  honey.loop.setTarget('honey', 1);
  await honey.loop.cloudPass([photo()]);
  const rice = rig({ x: 0, y: 0, session: 1 });
  rice.outlines.now = () => [bag(9, 10, 50)];
  rice.clock.now = honey.clock.now + 60000;
  rice.loop.setTarget('basmati', 2);
  await rice.loop.cloudPass([photo()]);
  await runFor(rice, 80);
  assert.deepEqual(rice.asked, [['P9']]);
});
