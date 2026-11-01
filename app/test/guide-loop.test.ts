// The guide loop outside the statechart: the 0.4 s cue hold, the
// almost and covering edges, lost against gone hands, resting on a
// wrong product, contact from motion, and a target leaving the view.
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
const OTHER = outline(8, 100, 400, 260, 640);

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

test('a new cue waits out the 0.4 s hold before it speaks', async () => {
  const env = harness();
  await env.loop.handFrame(fix(300, 520, env.at()), [TARGET], 1280, 960);
  assert.equal(cuesOf(env.sent).length, 0);
  env.tick(250);
  await env.loop.handFrame(fix(300, 520, env.at()), [TARGET], 1280, 960);
  assert.equal(cuesOf(env.sent).length, 0);
  env.tick(250);
  await env.loop.handFrame(fix(300, 520, env.at()), [TARGET], 1280, 960);
  const last = cuesOf(env.sent).at(-1) as { type: string; cue: string; proximity: number; hand: { x: number; y: number } };
  assert.equal(last.type, 'GUIDE_CUE');
  assert.equal(last.cue, 'hand_right');
  assert.deepEqual(last.hand, { x: 300, y: 520 });
  assert.ok(last.proximity >= 0 && last.proximity <= 1);
});

test('a held cue keeps reporting proximity without changing the cue', async () => {
  const env = harness();
  for (let step = 0; step < 3; step += 1) {
    await env.loop.handFrame(fix(300, 520, env.at()), [TARGET], 1280, 960);
    env.tick(250);
  }
  const cues = cuesOf(env.sent);
  assert.ok(cues.length >= 1 && cues.every((event) => (event as { cue: string }).cue === 'hand_right'));
});

test('almost fires once per approach, covering after a second inside', async () => {
  const env = harness();
  await env.loop.handFrame(fix(595, 520, env.at()), [TARGET], 1280, 960);
  env.tick(500);
  await env.loop.handFrame(fix(595, 520, env.at()), [TARGET], 1280, 960);
  assert.equal(env.sent.filter((event) => event.type === 'GUIDE_ALIGNED').length, 1);
  env.tick(250);
  await env.loop.handFrame(fix(680, 520, env.at()), [TARGET], 1280, 960);
  assert.equal(env.sent.filter((event) => event.type === 'GUIDE_COVERING').length, 0);
  for (let step = 0; step < 4; step += 1) {
    env.tick(250);
    await env.loop.handFrame(fix(680, 520, env.at()), [TARGET], 1280, 960);
  }
  assert.equal(env.sent.filter((event) => event.type === 'GUIDE_COVERING').length, 1);
});

test('a sustained almost repeats its edge every two seconds', async () => {
  const env = harness();
  await env.loop.handFrame(fix(595, 520, env.at()), [TARGET], 1280, 960);
  for (let step = 0; step < 12; step += 1) {
    env.tick(250);
    await env.loop.handFrame(fix(595, 520, env.at()), [TARGET], 1280, 960);
  }
  assert.equal(env.sent.filter((event) => event.type === 'GUIDE_ALIGNED').length, 2);
});

test('drifting out of cover back to almost fires again', async () => {
  const env = harness();
  await env.loop.handFrame(fix(595, 520, env.at()), [TARGET], 1280, 960);
  env.tick(500);
  await env.loop.handFrame(fix(595, 520, env.at()), [TARGET], 1280, 960);
  env.tick(500);
  await env.loop.handFrame(fix(680, 520, env.at()), [TARGET], 1280, 960);
  env.tick(500);
  await env.loop.handFrame(fix(680, 520, env.at()), [TARGET], 1280, 960);
  env.tick(500);
  await env.loop.handFrame(fix(595, 520, env.at()), [TARGET], 1280, 960);
  env.tick(500);
  await env.loop.handFrame(fix(595, 520, env.at()), [TARGET], 1280, 960);
  assert.equal(env.sent.filter((event) => event.type === 'GUIDE_ALIGNED').length, 2);
});

test('a recent dropout is lost, a long absence is no hand', async () => {
  const env = harness();
  await env.loop.handFrame(fix(300, 520, env.at()), [TARGET], 1280, 960);
  env.tick(500);
  await env.loop.handFrame(null, [TARGET], 1280, 960);
  assert.equal(env.sent.at(-1)?.type, 'GUIDE_LOST');
  env.tick(500);
  await env.loop.handFrame(null, [TARGET], 1280, 960);
  assert.equal(env.sent.filter((event) => event.type === 'GUIDE_LOST').length, 1);
  env.tick(2000);
  await env.loop.handFrame(null, [TARGET], 1280, 960);
  assert.equal(env.sent.at(-1)?.type, 'GUIDE_NOHAND');
});

test('a hand back after lost steers again', async () => {
  const env = harness();
  await env.loop.handFrame(fix(300, 520, env.at()), [TARGET], 1280, 960);
  env.tick(500);
  await env.loop.handFrame(null, [TARGET], 1280, 960);
  env.tick(500);
  await env.loop.handFrame(fix(300, 520, env.at()), [TARGET], 1280, 960);
  env.tick(500);
  await env.loop.handFrame(fix(300, 520, env.at()), [TARGET], 1280, 960);
  assert.ok(cuesOf(env.sent).length >= 1);
});

test('resting on another product reads it and reports a wrong one', async () => {
  const read: ShelfRead = { id: 'hand-1', brand_text: 'Guedila', size_text: 'water', verdict: 'no', spoken: 'Guedila water' };
  const env = harness([read]);
  const tip = fix(180, 520, env.at());
  await env.loop.handFrame(tip, [TARGET, OTHER], 1280, 960);
  env.tick(300);
  await env.loop.handFrame(fix(182, 521, env.at()), [TARGET, OTHER], 1280, 960);
  env.tick(300);
  await env.loop.handFrame(fix(181, 520, env.at()), [TARGET, OTHER], 1280, 960);
  const wrong = env.sent.filter((event) => event.type === 'GUIDE_WRONG');
  assert.equal(wrong.length, 1);
  assert.deepEqual(wrong[0], { type: 'GUIDE_WRONG', label: 'Guedila water', cue: 'hand_right' });
});

test('a rest read landing after the hand moved stays silent', async () => {
  const read: ShelfRead = { id: 'hand-1', brand_text: 'Guedila', size_text: 'water', verdict: 'no', spoken: 'Guedila water' };
  const sent: ConversationEvent[] = [];
  let now = 10000;
  let release!: (value: { reads: ShelfRead[]; readMs: number }) => void;
  const gate = new Promise<{ reads: ShelfRead[]; readMs: number }>((resolve) => {
    release = resolve;
  });
  const loop = createGuideLoop({
    now: () => now,
    send: (event) => {
      sent.push(event);
    },
    log: () => undefined,
    cutCrop: async () => ({ id: 'hand-1', image: 'crop', mime: 'image/jpeg' }),
    read: () => gate,
  });
  loop.setTarget(TARGET);
  loop.setPhoto({ image: 'photo', mime: 'image/jpeg' });
  await loop.handFrame(fix(180, 520, now), [TARGET, OTHER], 1280, 960);
  now += 300;
  await loop.handFrame(fix(181, 520, now), [TARGET, OTHER], 1280, 960);
  now += 300;
  const pending = loop.handFrame(fix(180, 520, now), [TARGET, OTHER], 1280, 960);
  now += 250;
  await loop.handFrame(fix(680, 520, now), [TARGET, OTHER], 1280, 960);
  release({ reads: [read], readMs: 5 });
  await pending;
  assert.equal(sent.filter((event) => event.type === 'GUIDE_WRONG').length, 0);
});

test('an unsure rest read keeps guiding without a wrong verdict', async () => {
  const read: ShelfRead = { id: 'hand-1', brand_text: null, size_text: null, verdict: 'unsure', spoken: 'maybe' };
  const env = harness([read]);
  await env.loop.handFrame(fix(180, 520, env.at()), [TARGET, OTHER], 1280, 960);
  env.tick(300);
  await env.loop.handFrame(fix(181, 520, env.at()), [TARGET, OTHER], 1280, 960);
  env.tick(300);
  await env.loop.handFrame(fix(180, 521, env.at()), [TARGET, OTHER], 1280, 960);
  assert.equal(env.sent.filter((event) => event.type === 'GUIDE_WRONG').length, 0);
});

test('the target moving with a covering hand is contact', async () => {
  const env = harness();
  const frames: Array<[number, number, ShelfOutline]> = [
    [660, 520, outline(7, 600, 400, 760, 640)],
    [680, 520, outline(7, 620, 400, 780, 640)],
    [700, 520, outline(7, 640, 400, 800, 640)],
    [720, 520, outline(7, 660, 400, 820, 640)],
    [740, 520, outline(7, 680, 400, 840, 640)],
    [760, 520, outline(7, 700, 400, 860, 640)],
  ];
  for (const [x, y, target] of frames) {
    env.loop.syncTarget(target.box);
    await env.loop.handFrame(fix(x, y, env.at()), [target], 1280, 960);
    env.tick(250);
  }
  assert.equal(env.sent.filter((event) => event.type === 'GUIDE_CONTACT').length, 1);
});

test('a rest read failing after guiding stopped reports no lost link (t17)', async () => {
  const sent: ConversationEvent[] = [];
  let now = 10000;
  let fail!: (error: Error) => void;
  const gate = new Promise<{ reads: ShelfRead[]; readMs: number }>((_, reject) => {
    fail = reject;
  });
  const loop = createGuideLoop({
    now: () => now,
    send: (event) => {
      sent.push(event);
    },
    log: () => undefined,
    cutCrop: async () => ({ id: 'hand-1', image: 'crop', mime: 'image/jpeg' }),
    read: () => gate,
  });
  loop.setTarget(TARGET);
  loop.setPhoto({ image: 'photo', mime: 'image/jpeg' });
  await loop.handFrame(fix(180, 520, now), [TARGET, OTHER], 1280, 960);
  now += 300;
  await loop.handFrame(fix(181, 520, now), [TARGET, OTHER], 1280, 960);
  now += 300;
  const pending = loop.handFrame(fix(180, 520, now), [TARGET, OTHER], 1280, 960);
  loop.reset();
  fail(new Error('no route to the relay: timed out after 15000ms'));
  await pending;
  assert.equal(sent.filter((event) => event.type.startsWith('LINK')).length, 0);
});
