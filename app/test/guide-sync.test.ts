// One target of truth: the loop steers toward the box the statechart
// holds, synced every frame, so a fresh shelf pass never restarts
// the approach or leaves the loop on a stale box; out of view, the
// hand cues stop, the no-hand and lost cues too (t30), and the phone
// cue repeats; every first cue logs where it came from, and a lost
// target where its box was.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuideLoop } from '../src/guide/loop';
import type { GuideLoopDeps } from '../src/guide/loopTypes';
import type { HandFix } from '../src/guide/types';
import type { ConversationEvent } from '../src/conversation/types';
import type { ShelfOutline, ShelfRead } from '../src/relay';

function outline(id: number, x1: number, y1: number, x2: number, y2: number): ShelfOutline {
  return { id, frame: 3, box: { x1, y1, x2, y2, w: 1280, h: 960, confidence: null } };
}

const TARGET = outline(7, 600, 400, 760, 640);

function fix(x: number, y: number, atMs: number): HandFix {
  return { x, y, confidence: 0.8, handWidth: 120, atMs };
}

function harness(reads: ShelfRead[] = []) {
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
    read: async () => ({ reads, readMs: 5 }),
  };
  const loop = createGuideLoop(deps);
  loop.setTarget(TARGET);
  loop.setPhoto({ image: 'photo', mime: 'image/jpeg' });
  return {
    sent,
    logs,
    loop,
    tick: (ms: number) => {
      now += ms;
    },
    at: () => now,
  };
}

function cuesOf(sent: ConversationEvent[]): ConversationEvent[] {
  return sent.filter((event) => event.type === 'GUIDE_CUE');
}

test('the box follows the statechart without restarting the approach', async () => {
  const env = harness();
  await env.loop.handFrame(fix(300, 520, env.at()), [TARGET], 1280, 960);
  env.tick(550);
  await env.loop.handFrame(fix(300, 520, env.at()), [TARGET], 1280, 960);
  assert.equal(cuesOf(env.sent).length, 1);
  const shifted = outline(12, 620, 400, 780, 640);
  env.loop.syncTarget(shifted.box);
  env.tick(250);
  await env.loop.handFrame(fix(300, 520, env.at()), [shifted], 1280, 960);
  assert.equal(cuesOf(env.sent).length, 2, 'a moved box keeps the cue flowing');
  const left = outline(13, 0, 400, 120, 640);
  env.loop.syncTarget(left.box);
  env.tick(250);
  await env.loop.handFrame(fix(300, 520, env.at()), [left], 1280, 960);
  env.tick(450);
  await env.loop.handFrame(fix(300, 520, env.at()), [left], 1280, 960);
  const last = cuesOf(env.sent)[cuesOf(env.sent).length - 1] as { cue: string };
  assert.equal(last.cue, 'hand_left', 'the cue steers toward the synced box');
});

test('out of view silences hand cues and repeats the phone cue', async () => {
  const env = harness();
  const left = outline(7, 300, 400, 460, 640);
  env.loop.setTarget(left);
  await env.loop.handFrame(fix(150, 520, env.at()), [left], 1280, 960);
  for (let step = 0; step < 12; step += 1) {
    env.tick(250);
    await env.loop.handFrame(fix(1000, 520, env.at()), [], 1280, 960);
  }
  assert.equal(cuesOf(env.sent).length, 0, 'no hand cue against a box the camera cannot see');
  const lost = env.sent.filter((event) => event.type === 'GUIDE_TARGET_LOST');
  assert.equal(lost.length, 2, 'the phone cue repeats every two seconds');
  env.tick(250);
  await env.loop.handFrame(fix(150, 520, env.at()), [left], 1280, 960);
  env.tick(550);
  await env.loop.handFrame(fix(150, 520, env.at()), [left], 1280, 960);
  assert.equal(cuesOf(env.sent).length, 1, 'back in view, the hand cues resume');
});

test('a hand on the product holds the box instead of losing it', async () => {
  const env = harness();
  await env.loop.handFrame(fix(680, 520, env.at()), [TARGET], 1280, 960);
  for (let step = 0; step < 4; step += 1) {
    env.tick(250);
    await env.loop.handFrame(fix(680, 520, env.at()), [], 1280, 960);
  }
  assert.equal(env.sent.filter((event) => event.type === 'GUIDE_TARGET_LOST').length, 0);
  assert.ok(env.logs.includes('guide target under hand, holding box'));
  env.tick(250);
  await env.loop.handFrame(fix(300, 520, env.at()), [], 1280, 960);
  env.tick(250);
  await env.loop.handFrame(fix(300, 520, env.at()), [], 1280, 960);
  assert.equal(env.sent.filter((event) => event.type === 'GUIDE_TARGET_LOST').length, 1);
});

test('a cue logs its tip, box and hand once', async () => {
  const env = harness();
  for (let step = 0; step < 4; step += 1) {
    await env.loop.handFrame(fix(300, 520, env.at()), [TARGET], 1280, 960);
    env.tick(250);
  }
  const lines = env.logs.filter((line) => line.startsWith('guide cue hand_right'));
  assert.deepEqual(lines, ['guide cue hand_right tip 300,520 box 600,400,760,640 hand 120']);
});

test('contact waits for the covering announcement at phone frame rate', async () => {
  const env = harness();
  for (let step = 0; step < 12; step += 1) {
    const target = outline(7, 600 + step * 20, 400, 760 + step * 20, 640);
    env.loop.syncTarget(target.box);
    await env.loop.handFrame(fix(660 + step * 20, 520, env.at()), [target], 1280, 960);
    env.tick(100);
  }
  const covering = env.sent.findIndex((event) => event.type === 'GUIDE_COVERING');
  const contact = env.sent.findIndex((event) => event.type === 'GUIDE_CONTACT');
  assert.ok(covering >= 0);
  assert.equal(env.sent.filter((event) => event.type === 'GUIDE_CONTACT').length, 1);
  assert.ok(covering < contact);
});

test('a still hand over the target is not contact', async () => {
  const env = harness();
  for (let step = 0; step < 6; step += 1) {
    await env.loop.handFrame(fix(680, 520, env.at()), [TARGET], 1280, 960);
    env.tick(250);
  }
  assert.equal(env.sent.filter((event) => event.type === 'GUIDE_CONTACT').length, 0);
});

test('a target leaving the view reports the way to turn the phone', async () => {
  const env = harness();
  const left = outline(7, 300, 400, 460, 640);
  env.loop.setTarget(left);
  await env.loop.handFrame(fix(150, 520, env.at()), [left], 1280, 960);
  env.tick(250);
  await env.loop.handFrame(fix(150, 520, env.at()), [], 1280, 960);
  assert.equal(env.sent.filter((event) => event.type === 'GUIDE_TARGET_LOST').length, 0);
  env.tick(250);
  await env.loop.handFrame(fix(150, 520, env.at()), [], 1280, 960);
  const lost = env.sent.filter((event) => event.type === 'GUIDE_TARGET_LOST');
  assert.equal(lost.length, 1);
  assert.deepEqual(lost[0], { type: 'GUIDE_TARGET_LOST', cue: 'phone_left_small' });
});

test('a covered product still reports when it stays gone past the patience', async () => {
  const env = harness();
  await env.loop.handFrame(fix(680, 520, env.at()), [TARGET], 1280, 960);
  for (let step = 0; step < 12; step += 1) {
    env.tick(250);
    await env.loop.handFrame(fix(680, 520, env.at()), [], 1280, 960);
  }
  assert.ok(env.logs.includes('guide target under hand, holding box'));
  assert.equal(env.sent.filter((event) => event.type === 'GUIDE_TARGET_LOST').length, 1);
});

test('a target leaving and returning logs both moments, with where the box was (t30)', async () => {
  const env = harness();
  await env.loop.handFrame(fix(300, 520, env.at()), [TARGET], 1280, 960);
  env.tick(250);
  await env.loop.handFrame(fix(300, 520, env.at()), [], 1280, 960);
  env.tick(250);
  await env.loop.handFrame(fix(300, 520, env.at()), [], 1280, 960);
  assert.ok(env.logs.includes('guide target out of view, box 600,400,760,640 overlap 0.00'));
  env.tick(250);
  await env.loop.handFrame(fix(300, 520, env.at()), [TARGET], 1280, 960);
  assert.ok(env.logs.includes('guide target back in view'));
});

test('out of view mutes the no-hand and lost cues, which come back with the target (t30)', async () => {
  const env = harness();
  await env.loop.handFrame(null, [TARGET], 1280, 960);
  assert.equal(env.sent.at(-1)?.type, 'GUIDE_NOHAND');
  for (let step = 0; step < 24; step += 1) {
    env.tick(250);
    await env.loop.handFrame(null, [], 1280, 960);
  }
  const kinds = env.sent.map((event) => event.type);
  const lostAt = kinds.indexOf('GUIDE_TARGET_LOST');
  assert.ok(lostAt > 0, 'the phone cue plays');
  const after = kinds.slice(lostAt).filter((kind) => kind === 'GUIDE_NOHAND' || kind === 'GUIDE_LOST');
  assert.equal(after.length, 0, 'no bouncing between the out-of-view line and the hand cues');
  env.tick(250);
  await env.loop.handFrame(null, [TARGET], 1280, 960);
  assert.equal(env.sent.at(-1)?.type, 'GUIDE_NOHAND', 'back in view, the no-hand cue resumes');
});
