// The guide steers by where the camera has the product now. t15: the
// phone panned a bag's width while a hand was in view; the drawn
// outline followed the Basmati, but the JavaScript box stood still,
// the cues said "right" towards where it had been, and a new SAM cut
// of the neighbouring bag now sat on the old box.
import test from 'node:test';
import assert from 'node:assert/strict';
import { forgetPlacedBox, lastPlacedBox, placedBox, placedTarget } from '../src/guide/placedBox';
import { anchorOutlines, cameraOutline } from '../src/shelf/outlines';
import { decideTarget } from '../src/conversation/searchTarget';
import type { ShelfBox, ShelfOutline } from '../src/relay';
import { createGuideLoop } from '../src/guide/loop';
import type { GuideLoopDeps } from '../src/guide/loopTypes';
import type { ConversationEvent } from '../src/conversation/types';

function box(x1: number, y1: number, x2: number, y2: number): ShelfBox {
  return { x1, y1, x2, y2, w: 960, h: 1280, confidence: null };
}

const [BASMATI] = anchorOutlines([{ id: 3, frame: 0, box: box(645, 389, 811, 771) }], 41) as [ShelfOutline];

test('the camera placement moves the guided box', () => {
  forgetPlacedBox();
  const key = cameraOutline(BASMATI, 'بسمتي')?.key;
  const placed = placedBox(BASMATI, 'بسمتي', { outlineKey: key, outlineDx: -560, outlineDy: 10 }, 1000);
  assert.deepEqual(placed && [placed.x1, placed.y1, placed.x2, placed.y2], [85, 399, 251, 781]);
  assert.equal(lastPlacedBox(1500), placed);
  assert.equal(lastPlacedBox(2500), null);
});

test('a placement for another outline is not used', () => {
  forgetPlacedBox();
  assert.equal(placedBox(BASMATI, 'بسمتي', { outlineKey: 'other', outlineDx: -560, outlineDy: 0 }, 1000), null);
  assert.equal(placedBox(BASMATI, 'بسمتي', {}, 1000), null);
});

test('t15: a new cut of the neighbour on the old box does not take the target', () => {
  forgetPlacedBox();
  const key = cameraOutline(BASMATI, 'بسمتي')?.key;
  placedBox(BASMATI, 'بسمتي', { outlineKey: key, outlineDx: -560, outlineDy: 0 }, Date.now());
  const haricot: ShelfOutline = { id: 1, frame: 0, box: box(640, 380, 815, 775) };
  const basmati: ShelfOutline = { id: 2, frame: 0, box: box(80, 385, 255, 775) };
  const decided = decideTarget(placedTarget(BASMATI, Date.now()), [haricot, basmati], null).outline;
  assert.equal(decided?.box.x1, 80);
  forgetPlacedBox();
});

function guideHarness() {
  const sent: ConversationEvent[] = [];
  const logs: string[] = [];
  let now = 10000;
  const deps: GuideLoopDeps = {
    now: () => now,
    send: (event) => {
      sent.push(event);
    },
    log: (line) => {
      logs.push(line);
    },
    cutCrop: async () => ({ id: 'hand-1', image: 'crop', mime: 'image/jpeg' }),
    read: async () => ({ reads: [], readMs: 5 }),
  };
  const loop = createGuideLoop(deps);
  loop.setTarget(BASMATI);
  loop.setPhoto({ image: 'photo', mime: 'image/jpeg' });
  return { sent, logs, loop, tick: (ms: number) => (now += ms), at: () => now };
}

function lost(sent: ConversationEvent[]): number {
  return sent.filter((event) => event.type === 'GUIDE_TARGET_LOST').length;
}

test('placed in the frame, the product is in view whatever the slower outlines say', async () => {
  const env = guideHarness();
  env.loop.syncTarget(box(85, 399, 251, 781));
  for (let frame = 0; frame < 12; frame += 1) {
    await env.loop.handFrame({ x: 600, y: 300, confidence: 0.8, handWidth: 120, atMs: env.at() }, [], 960, 1280, true);
    env.tick(150);
  }
  assert.equal(lost(env.sent), 0);
});

test('placed out of the frame, the product is out of view', async () => {
  const env = guideHarness();
  env.loop.syncTarget(box(-300, 399, -134, 781));
  for (let frame = 0; frame < 12; frame += 1) {
    await env.loop.handFrame({ x: 600, y: 300, confidence: 0.8, handWidth: 120, atMs: env.at() }, [], 960, 1280, true);
    env.tick(150);
  }
  assert.ok(lost(env.sent) >= 1);
  assert.ok(env.logs.includes('guide target out of view, box -300,399,-134,781 in frame 0.00'));
});
