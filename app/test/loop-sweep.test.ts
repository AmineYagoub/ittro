// The sweep inside the shelf loop: a fruitless pass with a known pan
// starts it, no pass runs while the camera turns or settles, each stop
// gets one read, and the end of the reach asks what is there instead. A
// yes at a stop ends the sweep; without a pan the old turns stay, and
// the swept shelf asks the same question without claiming the whole
// shelf. A stop reads its own still, never a sharper one from before,
// and reads an unsure label again before the sweep turns away.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createShelfLoop } from '../src/shelf/loop';
import type { CameraPan, LoopDeps, LoopPhoto } from '../src/shelf/loopTypes';
import type { ShelfBox, ShelfOutline, ShelfRead } from '../src/relay';
import type { ConversationEvent } from '../src/conversation/types';
import type { ViewReply } from '../src/conversation/askTypes';
import { forgetSeen } from '../src/shelf/inventory';
import { sharpness } from '../src/shelf/tracker';

function box(x1: number, x2: number): ShelfBox {
  return { x1, y1: 10, x2, y2: 90, w: 112, h: 96, confidence: 0.98 };
}

function photo(): LoopPhoto {
  return { image: 'frame', mime: 'image/jpeg', w: 112, h: 96, grey: { data: new Uint8Array(0), w: 0, h: 0 }, shot: 7 };
}

function sharpPhoto(image: string, amp: number, at: number): LoopPhoto {
  const data = new Uint8Array(64).map((_, n) => (((n % 8) + Math.floor(n / 8)) % 2 === 0 ? 128 + amp : 128 - amp));
  return { ...photo(), image, grey: { data, w: 8, h: 8 }, at };
}

const BAG: ShelfOutline = { id: 0, frame: 0, box: box(40, 70) };

interface Rig {
  clock: { now: number };
  view: { pan: CameraPan | null };
  verdict: { now: ShelfRead['verdict'] };
  sent: ConversationEvent[];
  asked: Array<{ wanted: string; seen: string[] }>;
  deps: LoopDeps;
}

function rig(pan: CameraPan | null, reply: ViewReply | Error): Rig {
  const clock = { now: 1000 };
  const view = { pan };
  const verdict: { now: ShelfRead['verdict'] } = { now: 'no' };
  const sent: ConversationEvent[] = [];
  const asked: Array<{ wanted: string; seen: string[] }> = [];
  const deps: LoopDeps = {
    now: () => clock.now,
    pan: () => view.pan,
    fetchPhrase: async () => 'rice bag',
    outline: async () => ({ outlines: [BAG], samMs: 5, maskMs: 1 }),
    read: async (_request, crops) => ({
      reads: crops.map((crop) => ({ id: crop.id, brand_text: 'Taaounia', size_text: 'Riz blanc', verdict: verdict.now, spoken: 'Riz blanc' })),
      readMs: 7,
    }),
    classify: async () => ({ scene: 'shelf', kinds: ['bags'], aisle_hint: null }),
    cutCrops: async (_image, tracks) => tracks.map((entry) => ({ id: `shelf-${entry.track}`, image: 'crop', mime: 'image/jpeg' })),
    readContext: () => ({ lang: 'en', alternative: null, checkedCount: 3 }),
    notHere: async (wanted, _image, _mime, seen) => {
      asked.push({ wanted, seen });
      if (reply instanceof Error) {
        throw reply;
      }
      return reply;
    },
    send: (event) => {
      sent.push(event);
    },
    log: () => undefined,
  };
  return { clock, view, verdict, sent, asked, deps };
}

const REPLY: ViewReply = { answer: 'No basmati on this shelf. I see Riz blanc.', offer: 'Riz blanc', unreadable: [] };

function cues(sent: ConversationEvent[]): string[] {
  return sent.flatMap((event) => (event.type === 'SWEEP_CUE' ? [event.cue] : []));
}

async function turnTo(r: Rig, loop: ReturnType<typeof createShelfLoop>, x: number, y = 0): Promise<void> {
  const pan = r.view.pan ?? { x: 0, y: 0, session: 1 };
  const from = { x: -pan.x, y: -pan.y };
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x - from.x), Math.abs(y - from.y)) / 0.2));
  let at = from;
  for (let n = 1; n <= steps; n += 1) {
    const next = { x: from.x + ((x - from.x) * n) / steps, y: from.y + ((y - from.y) * n) / steps };
    r.clock.now += 500;
    r.view.pan = { x: -next.x, y: -next.y, session: 1 };
    loop.trackShift(-(next.x - at.x) * 112, -(next.y - at.y) * 96, false, 1);
    at = next;
    loop.sweepTick();
  }
}

test('a fruitless pass sweeps the shelf, reads once per stop, then says what is there instead', async () => {
  forgetSeen();
  const r = rig({ x: 0, y: 0, session: 1 }, REPLY);
  const loop = createShelfLoop(r.deps);
  loop.setTarget('basmati', 1);
  await loop.cloudPass([photo()]);
  assert.deepEqual(cues(r.sent), ['start']);
  assert.equal(loop.cloudDue(), false);
  const stops: Array<[number, number]> = [
    [0.6, 0],
    [1.2, 0],
    [-0.6, 0],
    [-1.2, 0],
    [-1.2, 0.5],
  ];
  for (const [x, y] of stops) {
    await turnTo(r, loop, x, y);
    assert.equal(loop.cloudDue(), false, `settling at ${x},${y}`);
    r.clock.now += 1500;
    assert.equal(loop.cloudDue(), true, `due at ${x},${y}`);
    await loop.cloudPass([photo()]);
  }
  assert.deepEqual(cues(r.sent), ['start', 'stop', 'right', 'stop', 'left', 'stop', 'left', 'stop', 'down', 'stop']);
  const last = r.sent.filter((event) => event.type === 'NOT_HERE').pop();
  assert.ok(last?.type === 'NOT_HERE');
  assert.equal(last.whole, true);
  assert.equal(last.offer, 'Riz blanc');
  assert.deepEqual(r.asked, [{ wanted: 'basmati', seen: ['Riz blanc'] }]);
  assert.equal(r.sent.some((event) => event.type === 'SHELF_SWEPT'), false);
});

test('a yes at a stop ends the sweep and finds the product', async () => {
  forgetSeen();
  const r = rig({ x: 0, y: 0, session: 1 }, REPLY);
  const loop = createShelfLoop(r.deps);
  loop.setTarget('basmati', 1);
  await loop.cloudPass([photo()]);
  await turnTo(r, loop, 0.6);
  r.verdict.now = 'yes';
  r.clock.now += 100;
  await loop.cloudPass([photo()]);
  assert.ok(r.sent.some((event) => event.type === 'SHELF_FOUND'));
  assert.deepEqual(cues(r.sent), ['start', 'stop']);
  await turnTo(r, loop, 1.2);
  assert.deepEqual(cues(r.sent), ['start', 'stop']);
});

test('a summary that fails says the shelf was swept instead', async () => {
  forgetSeen();
  const r = rig({ x: 0, y: 0, session: 1 }, new Error('relay down'));
  const loop = createShelfLoop(r.deps);
  loop.setTarget('basmati', 1);
  await loop.cloudPass([photo()]);
  for (const [x, y] of [
    [0.6, 0],
    [1.2, 0],
    [-0.6, 0],
    [-1.2, 0],
    [-1.2, 0.5],
  ] as Array<[number, number]>) {
    await turnTo(r, loop, x, y);
    r.clock.now += 100;
    await loop.cloudPass([photo()]);
  }
  assert.ok(r.sent.some((event) => event.type === 'SHELF_SWEPT'));
  assert.equal(r.sent.some((event) => event.type === 'NOT_HERE'), false);
});

test('without a pan the loop keeps its turns and asks at the swept shelf, not claiming the whole shelf', async () => {
  forgetSeen();
  const r = rig(null, REPLY);
  const loop = createShelfLoop(r.deps);
  loop.setTarget('basmati', 1);
  for (let pass = 0; pass < 3; pass += 1) {
    r.clock.now += 16000;
    loop.trackShift(-112, 0, false, 1);
    await loop.cloudPass([photo()]);
  }
  assert.deepEqual(cues(r.sent), []);
  const last = r.sent.filter((event) => event.type === 'NOT_HERE').pop();
  assert.ok(last?.type === 'NOT_HERE');
  assert.equal(last.whole, false);
});

test('a stop reads a still taken there once the camera settled, not a sharper one from before', async () => {
  forgetSeen();
  const r = rig({ x: 0, y: 0, session: 1 }, REPLY);
  const outlined: string[] = [];
  const outline = r.deps.outline;
  r.deps.outline = async (image, ...rest) => {
    outlined.push(image);
    return outline(image, ...rest);
  };
  const loop = createShelfLoop(r.deps);
  loop.setTarget('basmati', 1);
  const origin = sharpPhoto('origin', 6, r.clock.now);
  await loop.cloudPass([origin]);
  await turnTo(r, loop, 0.6);
  const early = sharpPhoto('early', 5, r.clock.now + 500);
  r.clock.now += 1500;
  const settled = sharpPhoto('settled', 4, r.clock.now);
  assert.ok(sharpness(origin.grey) > sharpness(settled.grey) && sharpness(settled.grey) > 800);
  await loop.cloudPass([origin, early, settled]);
  assert.deepEqual(outlined, ['origin', 'settled']);
});

test('an unsure label at a stop is read again there before the sweep turns away', async () => {
  forgetSeen();
  const r = rig({ x: 0, y: 0, session: 1 }, REPLY);
  const loop = createShelfLoop(r.deps);
  loop.setTarget('basmati', 1);
  await loop.cloudPass([photo()]);
  await turnTo(r, loop, 0.6);
  r.verdict.now = 'unsure';
  r.clock.now += 1500;
  await loop.cloudPass([photo()]);
  assert.deepEqual(cues(r.sent), ['start', 'stop']);
  assert.equal(loop.cloudDue(), true);
  r.verdict.now = 'no';
  r.clock.now += 500;
  await loop.cloudPass([photo()]);
  assert.deepEqual(cues(r.sent), ['start', 'stop', 'right']);
});
