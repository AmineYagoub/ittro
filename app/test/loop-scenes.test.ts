// Walks the loop's empty-shelf scenes and the hand: a wrong shelf
// points to a person, a lost shelf teaches the hold, an out-of-view
// target turns the phone, and a crop in the hand reads first.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createShelfLoop } from '../src/shelf/loop';
import type { LoopDeps, ShelfLoop } from '../src/shelf/loopTypes';
import type { ShelfOutline, ShelfRead } from '../src/relay';
import type { SceneView } from '../src/relay';
import type { ConversationEvent } from '../src/conversation/types';

function outline(id: number): ShelfOutline {
  return { id, frame: 0, box: { x1: 8, y1: 8, x2: 40, y2: 40, w: 112, h: 96, confidence: null } };
}

function scene(part: Partial<SceneView>): SceneView {
  return { scene: 'shelf', kinds: ['bags'], aisle_hint: null, ...part };
}

function rig(scenes: SceneView[]): {
  loop: ShelfLoop;
  sent: ConversationEvent[];
  calls: { read: string[][]; classify: number };
  tick: (ms: number) => void;
} {
  let now = 0;
  const sent: ConversationEvent[] = [];
  const calls = { read: [] as string[][], classify: 0 };
  const deps: LoopDeps = {
    now: () => now,
    outline: async () => ({ outlines: [], samMs: 5, maskMs: 1 }),
    fetchPhrase: async () => 'bag',
    read: async (_request, crops) => {
      calls.read.push(crops.map((crop) => crop.id));
      return { reads: [], readMs: 3 };
    },
    classify: async () => {
      calls.classify += 1;
      return scenes[0] as SceneView;
    },
    cutCrops: async () => [],
    readContext: () => ({ lang: 'en', alternative: null, checkedCount: 0 }),
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

function photo(): { image: string; mime: string; w: number; h: number; grey: { data: Uint8Array; w: number; h: number } } {
  return { image: 'frame', mime: 'image/jpeg', w: 112, h: 96, grey: { data: new Uint8Array(0), w: 0, h: 0 } };
}

test('a shelf without the kind points to a person, once per scene', async () => {
  const rigged = rig([scene({ kinds: ['boxes'], aisle_hint: 'the water aisle' })]);
  rigged.loop.setTarget('Masaad water', 1);
  await rigged.loop.cloudPass([photo()]);
  rigged.tick(9000);
  await rigged.loop.cloudPass([photo()]);
  const wrong = rigged.sent.filter((event) => event.type === 'WRONG_SHELF');
  assert.equal(wrong.length, 1);
  assert.equal(rigged.calls.classify, 2);
});

test('scene reads wait out the quiet window', async () => {
  const rigged = rig([scene({ scene: 'floor', kinds: [] })]);
  rigged.loop.setTarget('rice', 1);
  await rigged.loop.cloudPass([photo()]);
  await rigged.loop.cloudPass([photo()]);
  assert.equal(rigged.calls.classify, 1);
  assert.equal(rigged.sent.filter((event) => event.type === 'NO_SHELF').length, 1);
});

test('an out-of-view target turns the phone either way', async () => {
  const rigged = rig([scene({ kinds: ['bags'] })]);
  rigged.loop.setTarget('rice', 1);
  await rigged.loop.cloudPass([photo()]);
  rigged.tick(9000);
  await rigged.loop.cloudPass([photo()]);
  rigged.tick(9000);
  await rigged.loop.cloudPass([photo()]);
  rigged.tick(9000);
  await rigged.loop.cloudPass([photo()]);
  const turns = rigged.sent.filter((event) => event.type === 'SHELF_TURN');
  assert.equal(turns.length, 2);
  assert.equal(turns[0]?.type === 'SHELF_TURN' && turns[0].direction, 'right');
  assert.equal(turns[1]?.type === 'SHELF_TURN' && turns[1].direction, 'left');
});

test('a crop in the hand reads before the shelf', async () => {
  const calls: string[][] = [];
  const loop = createShelfLoop({
    now: () => 0,
    outline: async () => ({ outlines: [outline(0), outline(1)], samMs: 5, maskMs: 1 }),
    fetchPhrase: async () => 'bag',
    read: async (_request, crops) => {
      calls.push(crops.map((crop) => crop.id));
      const reads: ShelfRead[] = crops.map((crop) => ({
        id: crop.id,
        brand_text: null,
        size_text: null,
        verdict: 'unsure',
        spoken: '',
      }));
      return { reads, readMs: 3 };
    },
    classify: async () => scene({}),
    cutCrops: async (_image, tracks) => tracks.map((entry) => ({ id: `shelf-${entry.track}`, image: 'c', mime: 'image/jpeg' })),
    readContext: () => ({ lang: 'en', alternative: null, checkedCount: 2 }),
    send: () => undefined,
    log: () => undefined,
  });
  loop.setTarget('rice', 1);
  await loop.cloudPass([photo()], { id: 'hand-0', image: 'hand', mime: 'image/jpeg' });
  assert.deepEqual(calls, [['hand-0'], ['shelf-t1', 'shelf-t2']]);
});
