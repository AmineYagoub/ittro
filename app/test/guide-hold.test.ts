// Cues never flap: a new steering holds for half a second before
// it speaks, so the shopper never hears two cues that disagree
// back to back, while the first cue still lands within a second.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuideLoop } from '../src/guide/loop';
import type { GuideLoopDeps } from '../src/guide/loopTypes';
import type { HandFix } from '../src/guide/types';
import type { ShelfOutline } from '../src/relay';
import type { ConversationEvent } from '../src/conversation/types';

function outline(id: number, x1: number, y1: number, x2: number, y2: number): ShelfOutline {
  return { id, frame: 3, box: { x1, y1, x2, y2, w: 1280, h: 960, confidence: null } };
}

const TARGET = outline(7, 600, 400, 760, 640);

function fix(x: number, y: number, atMs: number): HandFix {
  return { x, y, confidence: 0.8, handWidth: 120, atMs };
}

function harness(): {
  sent: ConversationEvent[];
  frame: (x: number, y: number) => Promise<void>;
  tick: (ms: number) => void;
} {
  const sent: ConversationEvent[] = [];
  let now = 10000;
  const deps: GuideLoopDeps = {
    now: () => now,
    send: (event) => {
      sent.push(event);
    },
    log: () => undefined,
    cutCrop: async () => ({ id: 'hand-1', image: 'crop', mime: 'image/jpeg' }),
    read: async () => ({ reads: [], readMs: 5 }),
  };
  const loop = createGuideLoop(deps);
  loop.setTarget(TARGET);
  loop.setPhoto({ image: 'photo', mime: 'image/jpeg' });
  return {
    sent,
    frame: (x, y) => loop.handFrame(fix(x, y, now), [TARGET], 1280, 960),
    tick: (ms) => {
      now += ms;
    },
  };
}

test('a cue inside half a second of almost waits its turn', async () => {
  const env = harness();
  await env.frame(595, 520);
  env.tick(500);
  await env.frame(595, 520);
  assert.equal(env.sent.filter((event) => event.type === 'GUIDE_ALIGNED').length, 1);
  env.tick(150);
  await env.frame(300, 520);
  assert.equal(env.sent.filter((event) => event.type === 'GUIDE_CUE').length, 0);
  env.tick(350);
  await env.frame(300, 520);
  assert.equal(env.sent.filter((event) => event.type === 'GUIDE_CUE').length, 0);
  env.tick(250);
  await env.frame(300, 520);
  assert.equal(env.sent.filter((event) => event.type === 'GUIDE_CUE').length, 1);
});

test('an almost inside half a second of a cue waits its turn', async () => {
  const env = harness();
  await env.frame(300, 520);
  env.tick(500);
  await env.frame(300, 520);
  assert.equal(env.sent.filter((event) => event.type === 'GUIDE_CUE').length, 1);
  env.tick(150);
  await env.frame(595, 520);
  assert.equal(env.sent.filter((event) => event.type === 'GUIDE_ALIGNED').length, 0);
  env.tick(500);
  await env.frame(595, 520);
  assert.equal(env.sent.filter((event) => event.type === 'GUIDE_ALIGNED').length, 1);
});

test('the first cue still speaks within a second', async () => {
  const env = harness();
  await env.frame(300, 520);
  env.tick(250);
  await env.frame(300, 520);
  env.tick(250);
  await env.frame(300, 520);
  assert.equal(env.sent.filter((event) => event.type === 'GUIDE_CUE').length, 1);
});
